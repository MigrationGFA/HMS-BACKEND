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

const counts = {};
for (const t of ['DOCTORS', 'DIAGNOSIS_CODES', 'PATIENT_DIAGNOSES', 'DRUGS', 'DRUG_BATCHES']) {
  const r = await client.query(`SELECT COUNT(*)::int AS c FROM "${t}"`);
  counts[t] = r.rows[0].c;
}
const drugsLegacy = await client.query(`SELECT COUNT(*)::int AS c FROM "DRUGS" WHERE "LEGACY_ITEM_ID" IS NOT NULL`);
const labPollute = await client.query(`
  SELECT COUNT(*)::int AS c FROM "DRUGS"
  WHERE "LEGACY_ITEM_ID" IS NOT NULL
    AND (LOWER("NAME") LIKE '%urine%' OR LOWER("NAME") LIKE '%x-ray%' OR LOWER("CATEGORY") LIKE '%lab%')
`);
const synth = await client.query(`
  SELECT COUNT(*)::int AS c FROM "PATIENT_DIAGNOSES"
  WHERE "CODE" LIKE 'TH-%' OR "CODE" LIKE 'DIS-%' OR "CODE" LIKE 'LEG-%'
`);
const enriched = await client.query(`
  SELECT COUNT(*)::int AS c FROM "PATIENT_DIAGNOSES"
  WHERE "UPDATED_BY" IN ('legacy-enrich', 'legacy-enrich-name')
`);
const sampleDrugs = await client.query(`
  SELECT "DRUG_ID","NAME","LEGACY_ITEM_ID","CATEGORY","UNIT_PRICE","STATUS"
  FROM "DRUGS" WHERE "LEGACY_ITEM_ID" IS NOT NULL ORDER BY "DRUG_ID" LIMIT 5
`);
const item6038 = await client.query(`SELECT "DRUG_ID","NAME","REORDER_LEVEL","LEGACY_ITEM_ID" FROM "DRUGS" WHERE "LEGACY_ITEM_ID"=6038`);
console.log(JSON.stringify({ counts, drugsLegacy: drugsLegacy.rows[0].c, labPollute: labPollute.rows[0].c, synth: synth.rows[0].c, enriched: enriched.rows[0].c, sampleDrugs: sampleDrugs.rows, item6038: item6038.rows }, null, 2));
await client.end();
