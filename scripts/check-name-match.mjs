#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const ROOT = process.cwd();
const certPath = path.resolve(ROOT, 'certs/DigiCertGlobalRootG2.crt.pem');
const client = new pg.Client({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME ?? 'postgres',
  port: Number(process.env.DATABASE_PORT ?? '5432'),
  ssl: { ca: fs.readFileSync(certPath) },
});
await client.connect();
for (const q of ['Schizophrenia', 'malaria', 'hypertension', 'Seizure disorder']) {
  const r = await client.query(
    `SELECT "CODE","NAME" FROM "DIAGNOSIS_CODES" WHERE LOWER("NAME") LIKE $1 LIMIT 5`,
    [`%${q.toLowerCase()}%`],
  );
  console.log(q, r.rows);
}
const exact = await client.query(`
  SELECT COUNT(*)::int AS c
  FROM "PATIENT_DIAGNOSES" pd
  JOIN "DIAGNOSIS_CODES" dc ON LOWER(TRIM(pd."NAME")) = LOWER(TRIM(dc."NAME"))
  WHERE pd."CODE" LIKE 'LEG-%'
`);
console.log('exact matches', exact.rows[0].c);
await client.end();
