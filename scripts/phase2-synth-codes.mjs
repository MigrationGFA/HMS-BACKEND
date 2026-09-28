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
const r = await client.query(`
  SELECT "CODE", COUNT(*)::int AS c
  FROM "PATIENT_DIAGNOSES"
  WHERE "CODE" LIKE 'TH-%' OR "CODE" LIKE 'DIS-%' OR "CODE" LIKE 'LEG-%'
  GROUP BY "CODE"
  ORDER BY c DESC
  LIMIT 15
`);
console.log(r.rows);
const names = await client.query(`
  SELECT "NAME", COUNT(*)::int AS c
  FROM "PATIENT_DIAGNOSES"
  WHERE "CODE" LIKE 'TH-%' OR "CODE" LIKE 'DIS-%' OR "CODE" LIKE 'LEG-%'
  GROUP BY "NAME"
  ORDER BY c DESC
  LIMIT 10
`);
console.log('names', names.rows);
await client.end();
