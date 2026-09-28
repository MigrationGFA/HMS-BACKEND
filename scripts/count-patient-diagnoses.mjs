#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const ROOT = process.cwd();

function buildPgClient() {
  if (process.env.DATABASE_URL_PRISMA || process.env.DATABASE_URL) {
    return new pg.Client({
      connectionString: process.env.DATABASE_URL_PRISMA || process.env.DATABASE_URL,
    });
  }
  const certPath = path.resolve(ROOT, 'certs/DigiCertGlobalRootG2.crt.pem');
  const ssl = fs.existsSync(certPath) ? { ca: fs.readFileSync(certPath) } : undefined;
  return new pg.Client({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME ?? 'postgres',
    port: Number(process.env.DATABASE_PORT ?? '5432'),
    ssl,
  });
}

const client = buildPgClient();
await client.connect();
const host =
  process.env.DATABASE_HOST ||
  (process.env.DATABASE_URL || process.env.DATABASE_URL_PRISMA || '').split('@')[1]?.split('/')[0] ||
  'unknown';
const { rows } = await client.query(`
  SELECT COUNT(*)::int AS total,
         MIN("PATIENT_DIAGNOSIS_ID") AS min_id,
         MAX("PATIENT_DIAGNOSIS_ID") AS max_id,
         COUNT(*) FILTER (WHERE "PATIENT_DIAGNOSIS_ID" >= 96648)::int AS legacy_csv_rows,
         COUNT(*) FILTER (WHERE "PATIENT_DIAGNOSIS_ID" < 96648)::int AS pre_existing_rows
  FROM "PATIENT_DIAGNOSES"
`);
console.log(JSON.stringify({ host, ...rows[0] }, null, 2));
await client.end();
