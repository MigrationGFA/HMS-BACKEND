#!/usr/bin/env node
/**
 * Drops PostgreSQL tables that are NOT part of the HMS-BACKEND Prisma schema.
 *
 * Keeps only the tables mapped in apps/api/prisma/models plus Prisma's own
 * migrations table. Everything else in the public schema is dropped.
 *
 * Usage:
 *   node scripts/drop-extra-tables.mjs           # dry run — lists what would be dropped
 *   node scripts/drop-extra-tables.mjs --yes     # actually drops the extra tables
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// Tables owned by HMS-BACKEND (must match @@map names in prisma/models/*).
const KEEP_TABLES = [
  'PERSONS',
  'USERS',
  'ROLES',
  'REFRESH_TOKENS',
  'AUDITS',
  'TRIAGE',
  'PATIENT_CARDS',
  '_prisma_migrations',
];

const confirm = process.argv.includes('--yes');

const host = process.env.DATABASE_HOST;
const user = process.env.DATABASE_USER;
const password = process.env.DATABASE_PASSWORD;
const database = process.env.DATABASE_NAME ?? 'postgres';
const port = Number(process.env.DATABASE_PORT ?? '5432');
const certPath = path.resolve(
  process.cwd(),
  (process.env.DATABASE_SSL_CA_PATH ?? './certs/DigiCertGlobalRootG2.crt.pem').replace(/^\.\//, ''),
);

if (!host || !user || !password) {
  console.error('Missing DATABASE_HOST, DATABASE_USER, or DATABASE_PASSWORD in .env');
  process.exit(1);
}

const client = new pg.Client({
  host,
  user,
  password,
  database,
  port,
  ssl: fs.existsSync(certPath) ? { ca: fs.readFileSync(certPath) } : { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

try {
  await client.connect();

  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const allTables = rows.map((r) => r.tablename);
  const keepSet = new Set(KEEP_TABLES);
  const toDrop = allTables.filter((t) => !keepSet.has(t));
  const kept = allTables.filter((t) => keepSet.has(t));

  console.log(`Tables in public schema: ${allTables.length}`);
  console.log(`Keeping (${kept.length}):`);
  for (const t of kept) console.log(`  = ${t}`);
  console.log(`To drop (${toDrop.length}):`);
  for (const t of toDrop) console.log(`  x ${t}`);

  if (toDrop.length === 0) {
    console.log('\nNothing to drop — database already matches HMS-BACKEND schema.');
  } else if (!confirm) {
    console.log('\nDRY RUN — no tables were dropped.');
    console.log('Re-run with --yes to drop the tables listed above:');
    console.log('  node scripts/drop-extra-tables.mjs --yes');
  } else {
    for (const t of toDrop) {
      // CASCADE removes dependent constraints/views on the dropped table only.
      await client.query(`DROP TABLE IF EXISTS "${t.replaceAll('"', '""')}" CASCADE`);
      console.log(`Dropped: ${t}`);
    }
    console.log(`\nDone. Dropped ${toDrop.length} table(s).`);
  }
} catch (error) {
  console.error('FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}
