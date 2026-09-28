#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const ROOT = process.cwd();
const certRel = (process.env.DATABASE_SSL_CA_PATH ?? './certs/DigiCertGlobalRootG2.crt.pem').replace(/^\.\//, '');
const certPath = path.resolve(ROOT, certRel);
const client = new pg.Client({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME ?? 'postgres',
  port: Number(process.env.DATABASE_PORT ?? '5432'),
  ssl: fs.existsSync(certPath) ? { ca: fs.readFileSync(certPath) } : undefined,
  connectionTimeoutMillis: 30000,
});
await client.connect();
for (const t of ['DOCTORS', 'DIAGNOSIS_CODES', 'PATIENT_DIAGNOSES', 'DRUGS']) {
  const r = await client.query(`SELECT COUNT(*)::int AS c FROM "${t}"`);
  console.log(t, r.rows[0].c);
}
const dx = await client.query(`
  SELECT
    COUNT(*) FILTER (WHERE "LEGACY_DISEASE_ID" IS NOT NULL)::int AS with_disease,
    COUNT(*) FILTER (WHERE "LEGACY_THESAURUS_ID" IS NOT NULL)::int AS with_thesaurus,
    COUNT(*) FILTER (WHERE "ICPC_CODE" IS NOT NULL)::int AS with_icpc
  FROM "DIAGNOSIS_CODES"`);
console.log('diagnosis_codes breakdown', dx.rows[0]);
const sample = await client.query(`SELECT "CODE","NAME","SYSTEM" FROM "DIAGNOSIS_CODES" WHERE "LEGACY_THESAURUS_ID" IS NOT NULL LIMIT 3`);
console.log('thesaurus samples', sample.rows);
await client.end();
