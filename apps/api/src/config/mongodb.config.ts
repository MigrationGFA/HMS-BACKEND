import { registerAs } from '@nestjs/config';

export default registerAs('mongodb', () => ({
  uri: process.env.MONGODB_URI,
  db: process.env.MONGODB_DB ?? 'HMS',
}));
