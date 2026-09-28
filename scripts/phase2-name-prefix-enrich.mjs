#!/usr/bin/env node
/**
 * Phase 2 pass2: map free-text PATIENT_DIAGNOSES names to DIAGNOSIS_CODES.
 * Prefer exact case-insensitive match, then shortest catalog name with prefix.
 */
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
  connectionTimeoutMillis: 30000,
  keepAlive: true,
  statement_timeout: 120000,
});
await client.connect();

const ALIASES = new Map([
  ['htn', 'I10'],
  ['hbp', 'I10'],
  ['dm', 'E11'],
  ['dm2', 'E11'],
  ['t2dm', 'E11'],
  ['diabetes', 'E11'],
  ['diabetes mellitus', 'E11'],
  ['type 2 diabetes', 'E11'],
  ['seizure disorder', 'G40.9'],
  ['seizure', 'G40.9'],
  ['epilepsy', 'G40.9'],
  ['malaria', 'B54'],
  ['hypertension', 'I10'],
  ['essential hypertension', 'I10'],
  ['schizophrenia', 'F20'],
  ['depression', 'F32.9'],
  ['bipolar', 'F31.9'],
  ['asthma', 'J45.9'],
  ['uti', 'N39.0'],
  ['urinary tract infection', 'N39.0'],
  ['peptic ulcer disease', 'K27.9'],
  ['pud', 'K27.9'],
  ['cva', 'I64'],
  ['stroke', 'I64'],
  ['hiv', 'B24'],
  ['aids', 'B24'],
]);

const catalog = await client.query(`SELECT "CODE", "NAME", "SYSTEM" FROM "DIAGNOSIS_CODES"`);
const byExact = new Map();
const byCode = new Map();
for (const r of catalog.rows) {
  byCode.set(String(r.CODE), r);
  const key = String(r.NAME).trim().toLowerCase();
  if (!byExact.has(key)) byExact.set(key, r);
  // also first token-less variants already covered by exact
}
for (const [alias, code] of ALIASES) {
  if (byCode.has(code) && !byExact.has(alias)) {
    byExact.set(alias, byCode.get(code));
  }
}

// Build prefix buckets by first 4 chars for faster search
const prefixBuckets = new Map();
for (const r of catalog.rows) {
  const key = String(r.NAME).trim().toLowerCase();
  if (key.length < 3) continue;
  const pref = key.slice(0, 3);
  if (!prefixBuckets.has(pref)) prefixBuckets.set(pref, []);
  prefixBuckets.get(pref).push(r);
}

function resolve(name) {
  const n = String(name || '').trim().toLowerCase();
  if (n.length < 3) return null;
  if (byExact.has(n)) return byExact.get(n);
  const bucket = prefixBuckets.get(n.slice(0, 3)) || [];
  let best = null;
  for (const r of bucket) {
    const cn = String(r.NAME).trim().toLowerCase();
    if (cn === n || cn.startsWith(n + ',') || cn.startsWith(n + ' ')) {
      if (!best || cn.length < String(best.NAME).length) best = r;
    }
  }
  return best;
}

const synth = await client.query(`
  SELECT "PATIENT_DIAGNOSIS_ID", "NAME"
  FROM "PATIENT_DIAGNOSES"
  WHERE "CODE" LIKE 'LEG-%' OR "CODE" LIKE 'TH-%' OR "CODE" LIKE 'DIS-%'
`);
console.log('synthetic rows', synth.rows.length);

let updated = 0;
let skipped = 0;
const batchSize = 100;
for (let i = 0; i < synth.rows.length; i += batchSize) {
  const chunk = synth.rows.slice(i, i + batchSize);
  await client.query('BEGIN');
  try {
    for (const row of chunk) {
      const hit = resolve(row.NAME);
      if (!hit) {
        skipped++;
        continue;
      }
      await client.query(
        `UPDATE "PATIENT_DIAGNOSES"
         SET "CODE" = $2, "SYSTEM" = $3, "UPDATED_BY" = 'legacy-enrich-name', "UPDATED_DATE" = NOW()
         WHERE "PATIENT_DIAGNOSIS_ID" = $1
           AND ("CODE" LIKE 'LEG-%' OR "CODE" LIKE 'TH-%' OR "CODE" LIKE 'DIS-%')`,
        [row.PATIENT_DIAGNOSIS_ID, hit.CODE, hit.SYSTEM || 'ICD-11'],
      );
      updated++;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  if ((i + chunk.length) % 1000 === 0 || i + chunk.length >= synth.rows.length) {
    console.log(`progress ${Math.min(i + chunk.length, synth.rows.length)}/${synth.rows.length} updated=${updated} skipped=${skipped}`);
  }
}

const after = await client.query(`
  SELECT COUNT(*)::int AS c FROM "PATIENT_DIAGNOSES"
  WHERE "CODE" LIKE 'LEG-%' OR "CODE" LIKE 'TH-%' OR "CODE" LIKE 'DIS-%'
`);
console.log({ updated, skipped, syntheticAfter: after.rows[0].c });
await client.end();
