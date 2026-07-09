import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

export type DatabaseConnectionConfig = {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
  sslCaPath?: string;
};

function resolveSsl(sslCaPath?: string) {
  if (!sslCaPath) {
    return { rejectUnauthorized: false };
  }
  const caFile = path.resolve(sslCaPath);
  return { ca: fs.readFileSync(caFile) };
}

export function createPrismaClient(config: DatabaseConnectionConfig): {
  prisma: PrismaClient;
  pool: Pool;
} {
  const pool = new Pool({
    host: config.host,
    user: config.user,
    password: config.password,
    database: config.database,
    port: config.port,
    ssl: resolveSsl(config.sslCaPath),
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  return { prisma, pool };
}

export function databaseConfigFromEnv(): DatabaseConnectionConfig {
  const host = process.env.DATABASE_HOST;
  const user = process.env.DATABASE_USER;
  const password = process.env.DATABASE_PASSWORD;
  const database = process.env.DATABASE_NAME ?? 'postgres';
  const port = Number(process.env.DATABASE_PORT ?? '5432');

  if (!host || !user || !password) {
    throw new Error(
      'DATABASE_HOST, DATABASE_USER, and DATABASE_PASSWORD must be set',
    );
  }

  return {
    host,
    user,
    password,
    database,
    port,
    sslCaPath: process.env.DATABASE_SSL_CA_PATH,
  };
}
