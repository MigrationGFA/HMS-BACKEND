import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/** Used only for `prisma generate` in CI — Prisma does not connect for that command. */
const GENERATE_PLACEHOLDER_URL =
  'postgresql://prisma:prisma@127.0.0.1:5432/prisma?schema=public';

function isPrismaGenerateCommand(): boolean {
  return process.argv.some(
    (arg) => arg === 'generate' || arg.endsWith('/generate'),
  );
}

function hasDatabaseCredentials(): boolean {
  return Boolean(
    process.env.DATABASE_URL_PRISMA ||
      (process.env.DATABASE_HOST &&
        process.env.DATABASE_USER &&
        process.env.DATABASE_PASSWORD),
  );
}

function resolveCertPath(): string {
  return path.resolve(
    process.cwd(),
    (process.env.DATABASE_SSL_CA_PATH ?? './certs/DigiCertGlobalRootG2.crt.pem').replace(
      /^\.\//,
      '',
    ),
  );
}

/** Real Azure/local URL for migrate, studio, db push, etc. */
function buildPrismaDatabaseUrl(): string {
  if (process.env.DATABASE_URL_PRISMA) {
    return process.env.DATABASE_URL_PRISMA;
  }

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

  const certPath = resolveCertPath();
  const certForUrl = certPath.replace(/\\/g, '/');
  const encodedPassword = encodeURIComponent(password);

  // libpq / Prisma engine reads these for TLS trust store during migrate
  process.env.PGSSLROOTCERT = certPath;
  process.env.PGSSLMODE = 'verify-full';

  return `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}?schema=public&sslmode=verify-full&sslrootcert=${encodeURIComponent(certForUrl)}`;
}

function resolveDatabaseUrl(): string {
  if (hasDatabaseCredentials()) {
    return buildPrismaDatabaseUrl();
  }

  if (isPrismaGenerateCommand()) {
    return GENERATE_PLACEHOLDER_URL;
  }

  throw new Error(
    'Set DATABASE_HOST, DATABASE_USER, DATABASE_PASSWORD (and optional DATABASE_NAME, DATABASE_PORT) in .env',
  );
}

const databaseUrl = resolveDatabaseUrl();

export default defineConfig({
  schema: path.join('apps', 'api', 'prisma'),
  migrations: {
    path: path.join('apps', 'api', 'prisma', 'migrations'),
  },
  datasource: {
    url: databaseUrl,
  },
});
