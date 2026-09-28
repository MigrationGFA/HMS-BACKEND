#!/usr/bin/env node
import fs from 'node:fs';
import readline from 'node:readline';
import 'dotenv/config';
import path from 'node:path';
import pg from 'pg';

function splitCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else cur += ch;
  }
  fields.push(cur);
  return fields;
}

async function* streamCsvRows(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers = null;
  for await (const raw of rl) {
    const line = raw.replace(/^\uFEFF/, '');
    if (!line.trim()) continue;
    const cols = splitCsvLine(line);
    if (!headers) {
      headers = cols.map((h) => h.trim());
      continue;
    }
    const row = {};
    for (let i = 0; i < headers.length; i++) {
      if (!headers[i]) continue;
      row[headers[i]] = cols[i] ?? '';
    }
    yield row;
  }
}

function pos(v) {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

let withDesc = 0;
let zeroTh = 0;
let zeroDis = 0;
let orphanTh = 0;
const thAll = new Set();
for await (const row of streamCsvRows('Migration-Documents/DOCTORS/THESAURUS.csv')) {
  const id = pos(row.THESAURUS_ID);
  if (id !== null) thAll.add(id);
}
for await (const row of streamCsvRows('Migration-Documents/DOCTORS/DIAGNOSIS.csv')) {
  if (String(row.DESCRIPTION || '').trim()) withDesc++;
  const th = pos(row.THESAURUS_ID);
  const dis = pos(row.DISEASE_ID);
  if (th === null) zeroTh++;
  else if (!thAll.has(th)) orphanTh++;
  if (dis === null) zeroDis++;
}

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
const synth = await client.query(`
  SELECT COUNT(*)::int AS c FROM "PATIENT_DIAGNOSES"
  WHERE "CODE" LIKE 'TH-%' OR "CODE" LIKE 'DIS-%' OR "CODE" LIKE 'LEG-%'
`);
const enriched = await client.query(`
  SELECT COUNT(*)::int AS c FROM "PATIENT_DIAGNOSES"
  WHERE "UPDATED_BY" = 'legacy-enrich'
`);
const samples = await client.query(`
  SELECT "PATIENT_DIAGNOSIS_ID","CODE","NAME" FROM "PATIENT_DIAGNOSES"
  WHERE "UPDATED_BY" = 'legacy-enrich' ORDER BY "PATIENT_DIAGNOSIS_ID" LIMIT 5
`);
console.log({ withDesc, zeroTh, zeroDis, orphanTh, stillSynthetic: synth.rows[0].c, enriched: enriched.rows[0].c, samples: samples.rows });
await client.end();
