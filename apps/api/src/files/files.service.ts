import { Injectable } from '@nestjs/common';
import { StorageService, type StoredObject } from './storage.service';

@Injectable()
export class FilesService {
  constructor(private readonly storage: StorageService) {}

  put(params: {
    prefix: string;
    originalName: string;
    contentType: string;
    buffer: Buffer;
  }): Promise<StoredObject> {
    return this.storage.putObject(params);
  }

  resolveUrl(blobPath: string): Promise<string> {
    return this.storage.resolveUrl(blobPath);
  }

  delete(blobPath: string): Promise<void> {
    return this.storage.deleteObject(blobPath);
  }

  provider() {
    return this.storage.getProvider();
  }
}
