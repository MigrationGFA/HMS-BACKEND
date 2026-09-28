#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import crypto from 'node:crypto';

const ROOT = process.cwd();

function buildPgClient() {
  const keepAlive = { keepAlive: true, keepAliveInitialDelayMillis: 10000 };
  if (process.env.DATABASE_URL_PRISMA || process.env.DATABASE_URL) {
    return new pg.Client({
      connectionString: process.env.DATABASE_URL_PRISMA || process.env.DATABASE_URL,
      connectionTimeoutMillis: 30000,
      ...keepAlive,
    });
  }
  const certRel = (process.env.DATABASE_SSL_CA_PATH ?? './certs/DigiCertGlobalRootG2.crt.pem').replace(
    /^\.\//,
    '',
  );
  const certPath = path.resolve(ROOT, certRel);
  return new pg.Client({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME ?? 'postgres',
    port: Number(process.env.DATABASE_PORT ?? '5432'),
    ssl: fs.existsSync(certPath) ? { ca: fs.readFileSync(certPath) } : undefined,
    connectionTimeoutMillis: 30000,
    ...keepAlive,
  });
}

function sha256(filePath) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

const client = buildPgClient();
await client.connect();

const tables = ['DOCTORS', 'PATIENT_DIAGNOSES', 'NURSING_NOTES', 'DRUGS', 'DIAGNOSIS_CODES', 'DRUG_BATCHES'];
for (const t of tables) {
  const r = await client.query(`SELECT COUNT(*)::int AS c FROM "${t}"`);
  console.log(`${t}: ${r.rows[0].c}`);
}

const synth = await client.query(`
  SELECT COUNT(*)::int AS c FROM "PATIENT_DIAGNOSES"
  WHERE "CODE" LIKE 'TH-%' OR "CODE" LIKE 'DIS-%' OR "CODE" LIKE 'LEG-%'
     OR "NAME" LIKE 'Thesaurus diagnosis %' OR "NAME" LIKE 'Disease %' OR "NAME" LIKE 'Legacy diagnosis %'
`);
console.log(`PATIENT_DIAGNOSES synthetic-ish: ${synth.rows[0].c}`);

const pairs = [
  ['Migration-Documents/DOCTORS.csv', 'Migration-Documents/DOCTORS/DOCTORS.csv'],
  ['Migration-Documents/DIAGNOSIS.csv', 'Migration-Documents/DOCTORS/DIAGNOSIS.csv'],
  ['Migration-Documents/NOTES.csv', 'Migration-Documents/DOCTORS/NOTES.csv'],
];
for (const [a, b] of pairs) {
  const ha = sha256(path.join(ROOT, a));
  const hb = sha256(path.join(ROOT, b));
  console.log(`hash ${path.basename(a)}: ${ha === hb ? 'EQUAL' : 'DIFF'} ${ha.slice(0, 12)}`);
}

await client.end();
