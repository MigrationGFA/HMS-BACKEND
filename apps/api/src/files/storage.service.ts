import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BlobSASPermissions,
  BlobServiceClient,
  ContainerClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import { createHash, randomUUID } from 'crypto';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { copyFile, mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

export type StoredObject = {
  provider: 'local' | 'azure';
  /** Relative key used for later fetch/delete (e.g. radiology/123/uuid.png). */
  blobPath: string;
  /** Absolute URL or API-relative download path usable by clients. */
  url: string;
  contentType: string;
  size: number;
  originalName: string;
};

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private provider: 'local' | 'azure' = 'local';
  private localRoot = './uploads';
  private containerClient: ContainerClient | null = null;
  private azureAccountName = '';
  private azureAccountKey = '';
  private azureContainer = 'hms-files';
  private publicBaseUrl = '';
  private sasExpiresMinutes = 60;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const provider = String(this.config.get<string>('storage.provider') ?? 'local').toLowerCase();
    this.localRoot = this.config.get<string>('storage.localPath') ?? './uploads';
    this.azureContainer = this.config.get<string>('storage.azureContainer') ?? 'hms-files';
    this.publicBaseUrl = (this.config.get<string>('storage.publicBaseUrl') ?? '').replace(/\/$/, '');
    this.sasExpiresMinutes = Number(this.config.get<number>('storage.sasExpiresMinutes') ?? 60);

    const conn = this.config.get<string>('storage.azureConnectionString') ?? '';
    if (provider === 'azure' && conn) {
      try {
        this.containerClient = BlobServiceClient.fromConnectionString(conn).getContainerClient(
          this.azureContainer,
        );
        const accountName = /AccountName=([^;]+)/i.exec(conn)?.[1] ?? '';
        const accountKey = /AccountKey=([^;]+)/i.exec(conn)?.[1] ?? '';
        this.azureAccountName = accountName;
        this.azureAccountKey = accountKey;
        this.provider = 'azure';
        void this.containerClient.createIfNotExists().catch((err: unknown) => {
          this.logger.warn(
            `Azure container ensure failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
        this.logger.log(`Storage provider: azure (container=${this.azureContainer})`);
        return;
      } catch (err) {
        this.logger.error(
          `Azure init failed — falling back to local: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else if (provider === 'azure' && !conn) {
      this.logger.warn('STORAGE_PROVIDER=azure but AZURE_STORAGE_CONNECTION_STRING missing — using local');
    }

    this.provider = 'local';
    if (!existsSync(this.localRoot)) mkdirSync(this.localRoot, { recursive: true });
    this.logger.log(`Storage provider: local (path=${this.localRoot})`);
  }

  getProvider(): 'local' | 'azure' {
    return this.provider;
  }

  /** Store a buffer under a namespaced key prefix (e.g. radiology/42). */
  async putObject(params: {
    prefix: string;
    originalName: string;
    contentType: string;
    buffer: Buffer;
  }): Promise<StoredObject> {
    const safeName = params.originalName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file';
    const ext = safeName.includes('.') ? safeName.slice(safeName.lastIndexOf('.')) : '';
    const hash = createHash('sha1').update(params.buffer).digest('hex').slice(0, 10);
    const blobPath = `${params.prefix.replace(/^\/+|\/+$/g, '')}/${randomUUID()}-${hash}${ext}`;

    if (this.provider === 'azure' && this.containerClient) {
      const block = this.containerClient.getBlockBlobClient(blobPath);
      await block.uploadData(params.buffer, {
        blobHTTPHeaders: { blobContentType: params.contentType || 'application/octet-stream' },
      });
      const url = await this.resolveUrl(blobPath);
      return {
        provider: 'azure',
        blobPath,
        url,
        contentType: params.contentType || 'application/octet-stream',
        size: params.buffer.length,
        originalName: params.originalName,
      };
    }

    const abs = join(this.localRoot, blobPath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, params.buffer);
    const url = this.publicBaseUrl
      ? `${this.publicBaseUrl}/${blobPath}`
      : `/api/files/download?path=${encodeURIComponent(blobPath.split('\\').join('/'))}`;
    return {
      provider: 'local',
      blobPath,
      url,
      contentType: params.contentType || 'application/octet-stream',
      size: params.buffer.length,
      originalName: params.originalName,
    };
  }

  async resolveUrl(blobPath: string): Promise<string> {
    if (this.publicBaseUrl) return `${this.publicBaseUrl}/${blobPath}`;

    if (this.provider === 'azure' && this.containerClient && this.azureAccountName && this.azureAccountKey) {
      try {
        const startsOn = new Date(Date.now() - 60_000);
        const expiresOn = new Date(Date.now() + this.sasExpiresMinutes * 60_000);
        const cred = new StorageSharedKeyCredential(this.azureAccountName, this.azureAccountKey);
        const sas = generateBlobSASQueryParameters(
          {
            containerName: this.azureContainer,
            blobName: blobPath,
            permissions: BlobSASPermissions.parse('r'),
            startsOn,
            expiresOn,
          },
          cred,
        ).toString();
        return `${this.containerClient.getBlockBlobClient(blobPath).url}?${sas}`;
      } catch (err) {
        this.logger.warn(
          `SAS URL failed, returning bare blob URL: ${err instanceof Error ? err.message : String(err)}`,
        );
        return this.containerClient.getBlockBlobClient(blobPath).url;
      }
    }

    return `/api/files/download?path=${encodeURIComponent(blobPath.split('\\').join('/'))}`;
  }

  async deleteObject(blobPath: string): Promise<void> {
    if (this.provider === 'azure' && this.containerClient) {
      await this.containerClient.getBlockBlobClient(blobPath).deleteIfExists();
      return;
    }
    const abs = join(this.localRoot, blobPath);
    if (existsSync(abs)) await unlink(abs);
  }

  /** Absolute filesystem path for local provider (used by download stream). */
  localAbsolutePath(blobPath: string): string {
    return join(this.localRoot, blobPath);
  }

  openLocalReadStream(blobPath: string) {
    return createReadStream(this.localAbsolutePath(blobPath));
  }

  /** Copy an existing local temp file into storage (optional helper). */
  async putFromPath(params: {
    prefix: string;
    originalName: string;
    contentType: string;
    absolutePath: string;
  }): Promise<StoredObject> {
    const { readFile } = await import('fs/promises');
    const buffer = await readFile(params.absolutePath);
    return this.putObject({
      prefix: params.prefix,
      originalName: params.originalName,
      contentType: params.contentType,
      buffer,
    });
  }

  async ensureLocalCopy(blobPath: string, destAbs: string): Promise<void> {
    if (this.provider === 'local') {
      await mkdir(dirname(destAbs), { recursive: true });
      await copyFile(this.localAbsolutePath(blobPath), destAbs);
    }
  }
}
