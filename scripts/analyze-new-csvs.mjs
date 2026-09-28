#!/usr/bin/env node
/**
 * Analyze the 8 new CSV extracts (Sep 2026) — no DB writes.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pg from 'pg';

const ROOT = process.cwd();
const DOCS = path.join(ROOT, 'Migration-Documents');

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
      headers = cols.map((h) => h.trim()).filter(Boolean);
      continue;
    }
    const row = {};
    for (let i = 0; i < headers.length; i++) row[headers[i]] = cols[i] ?? '';
    yield row;
  }
}

function toInt(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

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

async function countRows(file) {
  let n = 0;
  for await (const _ of streamCsvRows(path.join(DOCS, file))) n++;
  return n;
}

async function collectIds(file, cols) {
  const sets = Object.fromEntries(cols.map((c) => [c, new Set()]));
  for await (const row of streamCsvRows(path.join(DOCS, file))) {
    for (const c of cols) {
      const v = toInt(row[c]);
      if (v !== null) sets[c].add(v);
    }
  }
  return sets;
}

async function tableExists(client, table) {
  const r = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS ok`,
    [table],
  );
  return r.rows[0].ok;
}

async function countMissing(client, ids, table, pk) {
  if (ids.size === 0) return 0;
  const arr = [...ids];
  const r = await client.query(
    `SELECT COUNT(*)::int AS c FROM unnest($1::int[]) AS x
     WHERE NOT EXISTS (SELECT 1 FROM "${table}" t WHERE t."${pk}" = x)`,
    [arr],
  );
  return r.rows[0].c;
}

const FILES = [
  'DRUG_CHART.csv',
  'DRUG_CHART_DETAILS.csv',
  'FLUIDS.csv',
  'VITAL_SIGN_DETAILS.csv',
  'WEIGHT_MONITORING.csv',
  'NURS_CARE_PLAN.csv',
  'NURSING_PROCESS.csv',
  'NURSES_REPORT_SHEET.csv',
];

const client = buildPgClient();
await client.connect();

const legacyTables = [
  'DRUG_CHART',
  'DRUG_CHART_DETAILS',
  'FLUIDS',
  'VITAL_SIGNS',
  'VITAL_SIGN_DETAILS',
  'NURSES_REPORT_SHEET',
  'WEIGHT_MONITORING',
  'NURSING_PROCESS',
];
const modernTables = [
  'NURSING_CARE_PLANS',
  'NURSING_VITALS',
  'NURSING_MAR_ENTRIES',
  'NURSING_OBSERVATIONS',
  'NURSING_HANDOVERS',
  'NURSING_NOTES',
  'NURSING_FORM_INSTANCES',
];

console.log('=== DB table presence ===');
for (const t of [...legacyTables, ...modernTables]) {
  const ok = await tableExists(client, t);
  const cnt = ok
    ? (await client.query(`SELECT COUNT(*)::int AS c FROM "${t}"`)).rows[0].c
    : null;
  console.log(`${t}: ${ok ? `exists (${cnt} rows)` : 'MISSING'}`);
}

console.log('\n=== CSV row counts ===');
for (const f of FILES) {
  const fp = path.join(DOCS, f);
  const size = fs.statSync(fp).size;
  const rows = size < 500 ? '(tiny/broken?)' : await countRows(f);
  console.log(`${f}: ${rows} rows (${size} bytes)`);
}

// FK checks for main files
const drugChartIds = await collectIds('DRUG_CHART.csv', ['PERSON_ID', 'ADMISSION_ID', 'WARD_ID', 'DRUG_CHART_ID']);
const drugDetailIds = await collectIds('DRUG_CHART_DETAILS.csv', ['DRUG_CHART_ID', 'NURSE_ID']);
const fluidIds = await collectIds('FLUIDS.csv', ['PERSON_ID', 'ADMISSION_ID']);
const reportIds = await collectIds('NURSES_REPORT_SHEET.csv', ['PERSON_ID', 'ADMISSION_ID', 'WARD_ID']);
const carePlanIds = await collectIds('NURS_CARE_PLAN.csv', ['PERSON_ID']);
const processIds = await collectIds('NURSING_PROCESS.csv', ['PERSON_ID']);

console.log('\n=== FK viability (missing in live DB) ===');
const checks = [
  ['DRUG_CHART PERSON_ID', drugChartIds.PERSON_ID, 'PERSONS', 'PERSON_ID'],
  ['DRUG_CHART ADMISSION_ID', drugChartIds.ADMISSION_ID, 'ADMISSIONS', 'ADMISSION_ID'],
  ['DRUG_CHART WARD_ID', drugChartIds.WARD_ID, 'WARDS', 'WARD_ID'],
  ['DRUG_CHART_DETAILS parent DRUG_CHART_ID', drugDetailIds.DRUG_CHART_ID, 'DRUG_CHART', 'DRUG_CHART_ID'],
  ['FLUIDS PERSON_ID', fluidIds.PERSON_ID, 'PERSONS', 'PERSON_ID'],
  ['FLUIDS ADMISSION_ID', fluidIds.ADMISSION_ID, 'ADMISSIONS', 'ADMISSION_ID'],
  ['NURSES_REPORT PERSON_ID', reportIds.PERSON_ID, 'PERSONS', 'PERSON_ID'],
  ['NURSES_REPORT ADMISSION_ID', reportIds.ADMISSION_ID, 'ADMISSIONS', 'ADMISSION_ID'],
  ['NURSES_REPORT WARD_ID', reportIds.WARD_ID, 'WARDS', 'WARD_ID'],
  ['NURS_CARE_PLAN PERSON_ID', carePlanIds.PERSON_ID, 'PERSONS', 'PERSON_ID'],
  ['NURSING_PROCESS PERSON_ID', processIds.PERSON_ID, 'PERSONS', 'PERSON_ID'],
];

for (const [label, set, table, pk] of checks) {
  if (!set || set.size === 0) {
    console.log(`${label}: n/a`);
    continue;
  }
  const exists = await tableExists(client, table);
  if (!exists) {
    console.log(`${label}: target table ${table} MISSING (${set.size} unique ids in CSV)`);
    continue;
  }
  const missing = await countMissing(client, set, table, pk);
  console.log(`${label}: ${set.size} unique, ${missing} missing`);
}

// drug chart parent check against CSV itself (details orphans)
let detailOrphans = 0;
const chartIdSet = drugChartIds.DRUG_CHART_ID;
for (const id of drugDetailIds.DRUG_CHART_ID) {
  if (!chartIdSet.has(id)) detailOrphans++;
}
console.log(`DRUG_CHART_DETAILS orphan chart ids (not in DRUG_CHART.csv): ${detailOrphans}`);

function rowHasContent(row, fields) {
  return fields.some((f) => String(row[f] ?? '').trim());
}

async function contentStats(file, rules) {
  let total = 0;
  const counts = Object.fromEntries(Object.keys(rules).map((k) => [k, 0]));
  for await (const row of streamCsvRows(path.join(DOCS, file))) {
    total++;
    for (const [k, fn] of Object.entries(rules)) {
      if (fn(row)) counts[k]++;
    }
  }
  return { file, total, ...counts };
}

console.log('\n=== Content quality ===');
const quality = [
  await contentStats('NURSES_REPORT_SHEET.csv', {
    hasReport: (r) => !!String(r.REPORT ?? '').trim(),
    emptyReport: (r) => !String(r.REPORT ?? '').trim(),
    missingPerson: (r) => !String(r.PERSON_ID ?? '').trim(),
  }),
  await contentStats('NURS_CARE_PLAN.csv', {
    hasContent: (r) =>
      rowHasContent(r, ['NURS_DIAGNOSIS', 'OBJECTIVES', 'NURS_ACTION', 'EVALUATION']),
    emptyPlan: (r) =>
      !rowHasContent(r, ['NURS_DIAGNOSIS', 'OBJECTIVES', 'NURS_ACTION', 'EVALUATION']),
    missingPerson: (r) => !String(r.PERSON_ID ?? '').trim(),
  }),
  await contentStats('NURSING_PROCESS.csv', {
    hasPerson: (r) => !!String(r.PERSON_ID ?? '').trim(),
    hasVitals: (r) => rowHasContent(r, ['TEMPERATURE', 'PULSE', 'WEIGHT', 'BLOOD_PRESSURE']),
    likelyGibberish: (r) => /I I'm xi|Vkcf ir|Kgitxitx/i.test(JSON.stringify(r)),
  }),
  await contentStats('WEIGHT_MONITORING.csv', {
    hasWeight: (r) => !!String(r.WEIGHT_VALUE ?? '').trim(),
    hasPerson: (r) => !!String(r.PERSON_ID ?? '').trim(),
  }),
];

for (const q of quality) console.log(JSON.stringify(q));

await client.end();
