import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  readUrl: process.env.DATABASE_READ_URL,
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  name: process.env.DATABASE_NAME ?? 'postgres',
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  sslCaPath: process.env.DATABASE_SSL_CA_PATH,
}));
