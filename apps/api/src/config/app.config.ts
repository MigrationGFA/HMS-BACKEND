import { registerAs } from '@nestjs/config';

function parseCorsOrigins(): string[] | true {
  const raw =
    process.env.CORS_ORIGINS ??
    process.env.FRONTEND_URL ??
    '';
  const list = raw
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  // Empty / "*" → reflect request origin (dev-friendly, credentials OK).
  if (list.length === 0 || list.includes('*')) {
    return true;
  }
  return list;
}

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3030', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  apiPrefix: process.env.API_PREFIX ?? 'api',
  corsOrigins: parseCorsOrigins(),
  frontendUrl: process.env.FRONTEND_URL ?? '',
}));
