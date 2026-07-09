import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  provider: process.env.STORAGE_PROVIDER ?? 'local',
  localPath: process.env.STORAGE_LOCAL_PATH ?? './uploads',
  s3Bucket: process.env.STORAGE_S3_BUCKET,
  s3Region: process.env.STORAGE_S3_REGION,
}));
