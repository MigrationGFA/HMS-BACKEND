import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

const certPath = path.resolve(
  process.cwd(),
  (process.env.DATABASE_SSL_CA_PATH ?? './certs/DigiCertGlobalRootG2.crt.pem').replace(
    /^\.\//,
    '',
  ),
);

/** Prisma CLI (migrate) needs absolute sslrootcert on Windows. */
function buildPrismaDatabaseUrl(): string {
  const host = process.env.DATABASE_HOST;
  const user = process.env.DATABASE_USER;
  const password = process.env.DATABASE_PASSWORD;
  const database = process.env.DATABASE_NAME ?? 'postgres';
  const port = process.env.DATABASE_PORT ?? '5432';

  if (!host || !user || !password) {
    throw new Error(
      'Set DATABASE_HOST, DATABASE_USER, DATABASE_PASSWORD (and optional DATABASE_NAME, DATABASE_PORT) in .env',
    );
  }

  const certForUrl = certPath.replace(/\\/g, '/');
  const encodedPassword = encodeURIComponent(password);

  return `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}?schema=public&sslmode=verify-full&sslrootcert=${encodeURIComponent(certForUrl)}`;
}

// libpq / Prisma engine on Windows reads this for TLS trust store
process.env.PGSSLROOTCERT = certPath;
process.env.PGSSLMODE = 'verify-full';

const databaseUrl = process.env.DATABASE_URL_PRISMA ?? buildPrismaDatabaseUrl();

export default defineConfig({
  schema: path.join('apps', 'api', 'prisma'),
  migrations: {
    path: path.join('apps', 'api', 'prisma', 'migrations'),
  },
  datasource: {
    url: databaseUrl,
  },
});
