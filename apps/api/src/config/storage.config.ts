import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  /** local | azure */
  provider: (process.env.STORAGE_PROVIDER ?? 'local').toLowerCase(),
  localPath: process.env.STORAGE_LOCAL_PATH ?? './uploads',
  azureConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING ?? '',
  azureContainer: process.env.AZURE_STORAGE_CONTAINER ?? 'hms-files',
  /** Optional public/base URL for CDN or static host (otherwise SAS / local path URLs). */
  publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL ?? '',
  sasExpiresMinutes: Number(process.env.STORAGE_SAS_EXPIRES_MINUTES ?? 60),
}));
