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
const pe = await client.query(`
  SELECT pd."PATIENT_DIAGNOSIS_ID", pd."CODE", pd."NAME", length(pd."NAME") AS len, encode(convert_to(pd."NAME", 'UTF8'), 'hex') AS hex
  FROM "PATIENT_DIAGNOSES" pd
  WHERE LOWER(pd."NAME") = 'schizophrenia'
  LIMIT 3
`);
console.log('patient', pe.rows);
const dc = await client.query(`
  SELECT "CODE","NAME", length("NAME") AS len, encode(convert_to("NAME", 'UTF8'), 'hex') AS hex
  FROM "DIAGNOSIS_CODES" WHERE LOWER("NAME") = 'schizophrenia'
`);
console.log('catalog', dc.rows);
const join = await client.query(`
  SELECT COUNT(*)::int AS c
  FROM "PATIENT_DIAGNOSES" pd
  JOIN "DIAGNOSIS_CODES" dc ON LOWER(TRIM(pd."NAME")) = LOWER(TRIM(dc."NAME"))
  WHERE LOWER(pd."NAME") = 'schizophrenia'
`);
console.log('join schizophrenia', join.rows[0]);
await client.end();
