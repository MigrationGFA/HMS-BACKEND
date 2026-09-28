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
  SELECT "DRUG_ID","NAME","CATEGORY","LEGACY_ITEM_ID","STATUS"
  FROM "DRUGS"
  WHERE "LEGACY_ITEM_ID" IS NOT NULL
    AND (
      LOWER("NAME") LIKE '%urine%'
      OR LOWER("NAME") LIKE '%x-ray%'
      OR LOWER("NAME") LIKE '%service charge%'
      OR LOWER("CATEGORY") LIKE '%lab%'
    )
`);
console.log(r.rows);
await client.end();
