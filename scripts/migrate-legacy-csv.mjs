#!/usr/bin/env node
/**
 * Batched, idempotent legacy CSV → PostgreSQL import (exact IDs preserved).
 *
 * Usage:
 *   node scripts/migrate-legacy-csv.mjs --only=user_types,roles,wards,clinics,doctors,users
 *   node scripts/migrate-legacy-csv.mjs --only=persons --offset=0 --limit=500
 *   node scripts/migrate-legacy-csv.mjs --only=all-small
 *
 * Env: same DATABASE_* as scripts/test-db-connection.mjs (or DATABASE_URL / DATABASE_URL_PRISMA).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import bcrypt from 'bcrypt';
import pg from 'pg';

const ROOT = process.cwd();
const DOCS_DIR = path.join(ROOT, 'Migration-Documents');
const LOG_DIR = path.join(DOCS_DIR, 'logs');

const MONTHS = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

const ALL_SMALL = ['user_types', 'roles', 'wards', 'clinics', 'doctors', 'users'];
const CLINICAL_TABLES = [
  'follow_ups',
  'admissions',
  'nursing_care_plans',
  'nursing_notes',
  'patient_diagnoses',
  'nurse_shift_reports',
  'drug_chart',
  'drug_chart_details',
  'fluids',
];
const DOCTOR_PHARMACY_TABLES = [
  'diseases',
  'thesaurus',
  'patient_diagnoses_enrich',
  'pharmacy_items',
  'drug_consumable_types',
  'legacy_clinical_notes_pilot',
  'complaints',
  'clinical_note_templates',
  'prophylactics',
  'legacy_comments',
];
const ALL_TABLES = [...ALL_SMALL, 'departments', 'persons', ...CLINICAL_TABLES, ...DOCTOR_PHARMACY_TABLES];

const CSV_FILES = {
  user_types: 'USER_TYPE.csv',
  roles: 'ROLES.csv',
  wards: 'WARDS.csv',
  clinics: 'CLINICS.csv',
  doctors: 'DOCTORS.csv',
  users: 'USERS.csv',
  departments: 'DEPARTMENTS.csv',
  persons: 'PERSONS.csv',
  follow_ups: 'APPOINTMENTS.csv',
  admissions: 'ADMISSION_HISTORY.csv',
  nursing_care_plans: 'NURS_CARE_PLAN.csv',
  nursing_notes: 'NOTES.csv',
  patient_diagnoses: 'DIAGNOSIS.csv',
  nurse_shift_reports: 'NURSES_REPORT_SHEET.csv',
  drug_chart: 'DRUG_CHART.csv',
  drug_chart_details: 'DRUG_CHART_DETAILS.csv',
  fluids: 'FLUIDS.csv',
  diseases: path.join('DOCTORS', 'DISEASES.csv'),
  thesaurus: path.join('DOCTORS', 'THESAURUS.csv'),
  patient_diagnoses_enrich: path.join('DOCTORS', 'DIAGNOSIS.csv'),
  pharmacy_items: path.join('PHAMACY', 'ITEMS.csv'),
  drug_consumable_types: path.join('PHAMACY', 'DRUG_CONSUMABLE_TYPES.csv'),
  legacy_clinical_notes_pilot: path.join('DOCTORS', 'P_EXAM.csv'),
  complaints: path.join('DOCTORS', 'COMPLAINTS.csv'),
  clinical_note_templates: path.join('DOCTORS', 'GENERIC_TEMPLATES.csv'),
  prophylactics: path.join('PHAMACY', 'PROPHYLATICS_DRUGS.csv'),
  legacy_comments: path.join('DOCTORS', 'COMMENTS.csv'),
};

/** Opening-stock policy for pharmacy ITEMS.BALANCE (Phase 0 decision). */
const PHARMACY_OPENING_STOCK_POLICY = 'skip';

/** Seed catalog codes that must not keep colliding Aro DEPARTMENT_IDs. */
const SEED_DEPT_CODES = new Set([
  'LAB',
  'RAD',
  'ADM',
  'GMPC',
  'OPC',
  'CAP',
  'PSY',
  'ADD',
  'PHARM',
  'ER',
  'TELE',
]);

/** Invented CODE values for DEPARTMENTS.csv (never reuse seed PHARM). */
const DEPT_CODE_BY_ID = {
  2: 'REV',
  6: 'NURS',
  8: 'DIAG',
  9: 'PHARMACY',
  12: 'CLIN',
  13: 'SPEC',
  18: 'ECG',
  19: 'NUTR',
  20: 'NEURO',
  21: 'PAED',
  22: 'RES',
};

function parseArgs(argv) {
  const out = {
    only: null,
    offset: 0,
    limit: null,
    batch: 250,
    from: null,
    path: null,
    dryRun: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--only=')) {
      const raw = arg.slice('--only='.length).trim();
      if (raw === 'all-small') out.only = [...ALL_SMALL];
      else if (raw === 'all') out.only = [...ALL_TABLES];
      else out.only = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    } else if (arg.startsWith('--offset=')) {
      out.offset = Math.max(0, Number(arg.slice('--offset='.length)) || 0);
    } else if (arg.startsWith('--limit=')) {
      const n = Number(arg.slice('--limit='.length));
      out.limit = Number.isFinite(n) && n > 0 ? n : null;
    } else if (arg.startsWith('--batch=')) {
      const n = Number(arg.slice('--batch='.length));
      out.batch = Number.isFinite(n) && n > 0 ? n : 250;
    } else if (arg.startsWith('--from=')) {
      out.from = arg.slice('--from='.length).trim() || null;
    } else if (arg.startsWith('--path=')) {
      out.path = arg.slice('--path='.length).trim() || null;
    } else if (arg === '--dry-run' || arg === '--dryRun') {
      out.dryRun = true;
    }
  }
  if (!out.only) out.only = [...ALL_SMALL];
  for (const t of out.only) {
    if (!ALL_TABLES.includes(t)) {
      throw new Error(`Unknown table "${t}". Allowed: ${ALL_TABLES.join(', ')}, all-small, all`);
    }
  }
  if (out.from && out.only.length !== 1) {
    throw new Error('--from= requires exactly one --only= table');
  }
  return out;
}

function resolveCsvPath(table, args) {
  if (args.from) {
    return path.isAbsolute(args.from) ? args.from : path.join(ROOT, args.from);
  }
  const rel = CSV_FILES[table];
  if (!rel) throw new Error(`No CSV mapping for table ${table}`);
  if (args.path) {
    const base = path.isAbsolute(args.path) ? args.path : path.join(ROOT, args.path);
    // Directory-style imports (pilot) may pass a folder via --path=
    if (table === 'legacy_clinical_notes_pilot' && fs.existsSync(base) && fs.statSync(base).isDirectory()) {
      return base;
    }
    return path.join(base, path.basename(rel));
  }
  return path.join(DOCS_DIR, rel);
}

function emptyToNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function toInt(v) {
  const s = emptyToNull(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Positive legacy FK (treats 0 as missing). */
function toPositiveInt(v) {
  const n = toInt(v);
  return n !== null && n > 0 ? n : null;
}

function toDecimal(v) {
  const s = emptyToNull(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? s : null;
}

/** Parse legacy dates: 25-Aug-23, 26-Aug-97, 3-Oct-23 */
function parseLegacyDate(v) {
  const s = emptyToNull(v);
  if (s === null) return null;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(s);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const day = Number(m[1]);
  const mon = MONTHS[m[2].slice(0, 1).toUpperCase() + m[2].slice(1, 3).toLowerCase()];
  if (mon === undefined) return null;
  let year = Number(m[3]);
  if (year < 100) year = year >= 70 ? 1900 + year : 2000 + year;
  const d = new Date(Date.UTC(year, mon, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Oracle timestamps: 02-FEB-20 09.27.52.000000 PM, 11-NOV-21 12.00.00.000000 AM */
function parseOracleTimestamp(v) {
  const s = emptyToNull(v);
  if (s === null) return null;
  const oracle = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})\s+(\d{1,2})\.(\d{2})\.(\d{2})(?:\.\d+)?\s*(AM|PM)$/i.exec(s);
  if (oracle) {
    const day = Number(oracle[1]);
    const monKey = oracle[2].slice(0, 1).toUpperCase() + oracle[2].slice(1, 3).toLowerCase();
    const mon = MONTHS[monKey];
    if (mon === undefined) return null;
    let year = Number(oracle[3]);
    if (year < 100) year = year >= 70 ? 1900 + year : 2000 + year;
    let hour = Number(oracle[4]);
    const minute = Number(oracle[5]);
    const second = Number(oracle[6]);
    const ampm = oracle[7].toUpperCase();
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    const d = new Date(Date.UTC(year, mon, day, hour, minute, second));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return parseLegacyDate(s);
}

async function loadIdSet(client, table, pk) {
  const res = await client.query(`SELECT "${pk}" FROM "${table}"`);
  return new Set(res.rows.map((r) => Number(r[pk])));
}

async function loadClinicNameMap(client) {
  const res = await client.query(`SELECT "CLINIC_ID", "CLINIC_NAME" FROM "CLINICS"`);
  const map = new Map();
  for (const r of res.rows) {
    map.set(Number(r.CLINIC_ID), String(r.CLINIC_NAME).trim());
  }
  return map;
}

function mapFollowUpStatus(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (s === 'FULFILLED') return 'Attended';
  if (s === 'CANCELLED') return 'Cancelled';
  return 'Scheduled';
}

function isEmptyCarePlanToken(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return !s || s === 'nil' || s === 'none' || s === 'null';
}

function isLegacyAroWardId(wardId) {
  return wardId !== null && wardId >= 502 && wardId <= 645;
}

/** RFC4180-ish CSV field split (handles quotes). */
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
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

async function* streamCsvRows(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers = null;
  let lineNo = 0;
  let buffer = '';
  let bufferStartLine = 0;

  const quotesOpen = (text) => {
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '"') {
        if (inQuotes && text[i + 1] === '"') {
          i++;
          continue;
        }
        inQuotes = !inQuotes;
      }
    }
    return inQuotes;
  };

  for await (const raw of rl) {
    lineNo++;
    const piece = raw.replace(/^\uFEFF/, '');
    if (!buffer) bufferStartLine = lineNo;
    buffer = buffer ? `${buffer}\n${piece}` : piece;
    if (quotesOpen(buffer)) continue;
    if (!buffer.trim()) {
      buffer = '';
      continue;
    }
    const cols = splitCsvLine(buffer);
    buffer = '';
    if (!headers) {
      headers = cols.map((h) => h.trim());
      continue;
    }
    const row = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i];
      if (!key) continue;
      row[key] = cols[i] !== undefined ? cols[i] : '';
    }
    yield { row, lineNo: bufferStartLine };
  }
}

function createLogger(runId) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logPath = path.join(LOG_DIR, `migrate-legacy-csv-${runId}.log`);
  const stream = fs.createWriteStream(logPath, { flags: 'a' });
  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    stream.write(line + '\n');
  };
  return {
    log,
    path: logPath,
    close: () =>
      new Promise((resolve) => {
        stream.end(resolve);
      }),
  };
}

function buildPgClient() {
  const keepAlive = { keepAlive: true, keepAliveInitialDelayMillis: 10000 };
  if (process.env.DATABASE_URL_PRISMA || process.env.DATABASE_URL) {
    return new pg.Client({
      connectionString: process.env.DATABASE_URL_PRISMA || process.env.DATABASE_URL,
      connectionTimeoutMillis: 30000,
      ...keepAlive,
    });
  }

  const host = process.env.DATABASE_HOST;
  const user = process.env.DATABASE_USER;
  const password = process.env.DATABASE_PASSWORD;
  const database = process.env.DATABASE_NAME ?? 'postgres';
  const port = Number(process.env.DATABASE_PORT ?? '5432');
  if (!host || !user || !password) {
    throw new Error(
      'Set DATABASE_URL / DATABASE_URL_PRISMA or DATABASE_HOST, DATABASE_USER, DATABASE_PASSWORD in .env',
    );
  }

  const certRel = (process.env.DATABASE_SSL_CA_PATH ?? './certs/DigiCertGlobalRootG2.crt.pem').replace(
    /^\.\//,
    '',
  );
  const certPath = path.resolve(ROOT, certRel);
  const ssl = fs.existsSync(certPath) ? { ca: fs.readFileSync(certPath) } : undefined;

  return new pg.Client({
    host,
    user,
    password,
    database,
    port,
    ssl,
    connectionTimeoutMillis: 30000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
}

async function resetSequence(client, table, pk) {
  const seqRes = await client.query(`SELECT pg_get_serial_sequence($1, $2) AS seq`, [
    `"${table}"`,
    pk,
  ]);
  const seq = seqRes.rows[0]?.seq;
  if (!seq) return;
  await client.query(
    `SELECT setval($1::regclass, COALESCE((SELECT MAX("${pk}") FROM "${table}"), 1), true)`,
    [seq],
  );
}

async function upsertRow(client, table, pk, columns, values) {
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const updates = columns
    .filter((c) => c !== pk)
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');
  const sql =
    updates.length > 0
      ? `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})
         ON CONFLICT ("${pk}") DO UPDATE SET ${updates}`
      : `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})
         ON CONFLICT ("${pk}") DO NOTHING`;
  const result = await client.query(sql, values);
  // node-pg: rowCount 1 for insert or update
  return result.rowCount ?? 0;
}

const PATIENT_DIAGNOSIS_COLUMNS = [
  'PATIENT_DIAGNOSIS_ID',
  'PERSON_ID',
  'ENCOUNTER_ID',
  'CODE',
  'SYSTEM',
  'NAME',
  'TYPE',
  'STATUS',
  'ONSET_DATE',
  'NOTES',
  'ON_PROBLEM_LIST',
  'CREATED_BY_ID',
  'UPDATED_BY_ID',
  'CREATED_BY',
  'CREATED_DATE',
  'UPDATED_BY',
  'UPDATED_DATE',
];

async function upsertPatientDiagnosisBatch(client, rows) {
  if (rows.length === 0) return;
  const colList = PATIENT_DIAGNOSIS_COLUMNS.map((c) => `"${c}"`).join(', ');
  const updates = PATIENT_DIAGNOSIS_COLUMNS.filter((c) => c !== 'PATIENT_DIAGNOSIS_ID')
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');
  const values = [];
  const tupleSql = rows
    .map((rowValues, rowIdx) => {
      const placeholders = PATIENT_DIAGNOSIS_COLUMNS.map((_, colIdx) => {
        values.push(rowValues[colIdx]);
        return `$${rowIdx * PATIENT_DIAGNOSIS_COLUMNS.length + colIdx + 1}`;
      });
      return `(${placeholders.join(', ')})`;
    })
    .join(', ');
  const sql = `INSERT INTO "PATIENT_DIAGNOSES" (${colList}) VALUES ${tupleSql}
    ON CONFLICT ("PATIENT_DIAGNOSIS_ID") DO UPDATE SET ${updates}`;
  await client.query(sql, values);
}

async function upsertBatch(client, table, pk, columns, rows) {
  if (rows.length === 0) return;
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const updates = columns
    .filter((c) => c !== pk)
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');
  const values = [];
  const tupleSql = rows
    .map((rowValues, rowIdx) => {
      const placeholders = columns.map((_, colIdx) => {
        values.push(rowValues[colIdx]);
        return `$${rowIdx * columns.length + colIdx + 1}`;
      });
      return `(${placeholders.join(', ')})`;
    })
    .join(', ');
  const sql = `INSERT INTO "${table}" (${colList}) VALUES ${tupleSql}
    ON CONFLICT ("${pk}") DO UPDATE SET ${updates}`;
  await client.query(sql, values);
}

async function flushUpsertBatch(client, table, pk, columns, batchBuf, stats, logger, label) {
  if (batchBuf.length === 0) return;
  try {
    await upsertBatch(
      client,
      table,
      pk,
      columns,
      batchBuf.map((item) => item.values),
    );
    stats.upserted += batchBuf.length;
  } catch (e) {
    for (const item of batchBuf) {
      try {
        await upsertRow(client, table, pk, columns, item.values);
        stats.upserted++;
      } catch (rowErr) {
        stats.errors++;
        logger.log(`${label} line ${item.lineNo} ${pk}=${item.id}: ${rowErr.message}`);
      }
    }
  }
  batchBuf.length = 0;
}

async function importUserTypes(client, filePath, logger, stats) {
  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const id = toInt(row.USER_TYPE_ID);
    const name = emptyToNull(row.NAME);
    if (id === null || !name) {
      stats.skipped++;
      continue;
    }
    try {
      await upsertRow(client, 'USER_TYPES', 'USER_TYPE_ID', ['USER_TYPE_ID', 'NAME'], [id, name]);
      stats.upserted++;
    } catch (e) {
      stats.errors++;
      logger.log(`USER_TYPES line ${lineNo}: ${e.message}`);
    }
  }
}

async function importRoles(client, filePath, logger, stats) {
  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const id = toInt(row.ROLE_ID);
    const name = emptyToNull(row.ROLE_NAME);
    if (id === null || !name) {
      stats.skipped++;
      continue;
    }
    try {
      await upsertRow(
        client,
        'ROLES',
        'ROLE_ID',
        [
          'ROLE_ID',
          'ROLE_NAME',
          'CREATED_BY',
          'CREATED_DATE',
          'LAST_MODIFIED_BY',
          'LAST_MODIFIED_DATE',
          'MODULE_ID',
        ],
        [
          id,
          name,
          emptyToNull(row.CREATED_BY),
          parseLegacyDate(row.CREATED_DATE),
          emptyToNull(row.LAST_MODIFIED_BY),
          parseLegacyDate(row.LAST_MODIFIED_DATE),
          toInt(row.MODULE_ID),
        ],
      );
      stats.upserted++;
    } catch (e) {
      stats.errors++;
      logger.log(`ROLES line ${lineNo}: ${e.message}`);
    }
  }
  await resetSequence(client, 'ROLES', 'ROLE_ID');
}

async function importWards(client, filePath, logger, stats) {
  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const id = toInt(row.WARD_ID);
    const name = emptyToNull(row.WARD_NAME);
    if (id === null || !name) {
      stats.skipped++;
      continue;
    }
    const discontinue = emptyToNull(row.DISCONTINUE_FLAG);
    const status = discontinue && discontinue !== '0' && discontinue.toUpperCase() !== 'N' ? 'Inactive' : 'Active';
    const genderRaw = emptyToNull(row.GENDER) || 'Mixed';
    const gender = genderRaw.toLowerCase() === 'unisex' ? 'Mixed' : genderRaw;
    try {
      await upsertRow(
        client,
        'WARDS',
        'WARD_ID',
        [
          'WARD_ID',
          'CODE',
          'NAME',
          'GENDER',
          'DESCRIPTION',
          'HOSPITAL_ID',
          'BRANCH_ID',
          'DISCONTINUE_FLAG',
          'STATUS',
        ],
        [
          id,
          `W${id}`,
          name,
          gender,
          emptyToNull(row.DESCRIPTION),
          toInt(row.HOSPITAL_ID),
          toInt(row.BRANCH_ID),
          discontinue,
          status,
        ],
      );
      stats.upserted++;
    } catch (e) {
      stats.errors++;
      logger.log(`WARDS line ${lineNo}: ${e.message}`);
    }
  }
  await resetSequence(client, 'WARDS', 'WARD_ID');
}

async function importClinics(client, filePath, logger, stats) {
  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const id = toInt(row.CLINIC_ID);
    const name = emptyToNull(row.CLINIC_NAME);
    if (id === null || !name || /^x+$/i.test(name)) {
      stats.skipped++;
      if (id !== null && name && /^x+$/i.test(name)) {
        logger.log(`CLINICS line ${lineNo} CLINIC_ID=${id}: skipped junk name`);
      }
      continue;
    }
    try {
      await upsertRow(
        client,
        'CLINICS',
        'CLINIC_ID',
        [
          'CLINIC_ID',
          'CLINIC_NAME',
          'DESCRIPTION',
          'DEPARTMENT_ID',
          'IS_CONSULTATION_FREE',
          'HOSPITAL_ID',
          'BRANCH_ID',
          'CLINIC_CATEGORY',
          'CLINIC_CODE',
          'DISCONTINUE_FLAG',
        ],
        [
          id,
          name,
          emptyToNull(row.DESCRIPTION),
          toInt(row.DEPARTMENT_ID),
          emptyToNull(row.IS_CONSULTATION_FREE),
          toInt(row.HOSPITAL_ID),
          toInt(row.BRANCH_ID),
          emptyToNull(row.CLINIC_CATEGORY),
          emptyToNull(row.CLINIC_CODE),
          emptyToNull(row.DISCONTINUE_FLAG),
        ],
      );
      stats.upserted++;
    } catch (e) {
      if (e.code === '23503' && toInt(row.DEPARTMENT_ID) != null) {
        try {
          await upsertRow(
            client,
            'CLINICS',
            'CLINIC_ID',
            [
              'CLINIC_ID',
              'CLINIC_NAME',
              'DESCRIPTION',
              'DEPARTMENT_ID',
              'IS_CONSULTATION_FREE',
              'HOSPITAL_ID',
              'BRANCH_ID',
              'CLINIC_CATEGORY',
              'CLINIC_CODE',
              'DISCONTINUE_FLAG',
            ],
            [
              id,
              name,
              emptyToNull(row.DESCRIPTION),
              null,
              emptyToNull(row.IS_CONSULTATION_FREE),
              toInt(row.HOSPITAL_ID),
              toInt(row.BRANCH_ID),
              emptyToNull(row.CLINIC_CATEGORY),
              emptyToNull(row.CLINIC_CODE),
              emptyToNull(row.DISCONTINUE_FLAG),
            ],
          );
          stats.upserted++;
          logger.log(
            `CLINICS line ${lineNo} CLINIC_ID=${id}: DEPARTMENT_ID cleared (FK mismatch)`,
          );
          continue;
        } catch (e2) {
          stats.errors++;
          logger.log(`CLINICS line ${lineNo}: ${e2.message}`);
          continue;
        }
      }
      stats.errors++;
      logger.log(`CLINICS line ${lineNo}: ${e.message}`);
    }
  }
}

function inventDeptCode(id, name) {
  if (DEPT_CODE_BY_ID[id]) return DEPT_CODE_BY_ID[id];
  const slug = String(name ?? '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .slice(0, 8)
    .toUpperCase();
  return slug || `D${id}`;
}

/**
 * Relocate seed billing departments off colliding Aro ids (2/6/8/9), then upsert
 * DEPARTMENTS.csv with exact DEPARTMENT_ID. Disregard DEPT.csv (Oracle sample).
 */
async function importDepartments(client, filePath, logger, stats) {
  const csvRows = [];
  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const id = toInt(row.DEPARTMENT_ID);
    const name = emptyToNull(row.NAME);
    if (id === null || !name) {
      stats.skipped++;
      logger.log(`DEPARTMENTS line ${lineNo}: skipped (missing id or name)`);
      continue;
    }
    csvRows.push({ id, name, lineNo });
  }

  await client.query('BEGIN');
  try {
    const existingRes = await client.query(
      `SELECT "DEPARTMENT_ID", "NAME", "CODE" FROM "DEPARTMENTS"`,
    );
    const usedIds = new Set(existingRes.rows.map((r) => Number(r.DEPARTMENT_ID)));
    const byId = new Map(existingRes.rows.map((r) => [Number(r.DEPARTMENT_ID), r]));

    const nextFreeId = () => {
      let n = 100;
      while (usedIds.has(n)) n += 1;
      usedIds.add(n);
      return n;
    };

    const csvIds = [...new Set(csvRows.map((r) => r.id))];
    for (const csvId of csvIds) {
      const live = byId.get(csvId);
      if (!live) continue;
      const liveCode = String(live.CODE ?? '').trim().toUpperCase();
      if (!SEED_DEPT_CODES.has(liveCode)) continue;
      const newId = nextFreeId();
      await client.query(
        `UPDATE "DEPARTMENTS" SET "DEPARTMENT_ID" = $1 WHERE "DEPARTMENT_ID" = $2`,
        [newId, csvId],
      );
      logger.log(
        `DEPARTMENTS: relocated seed id ${csvId} (${liveCode} ${live.NAME}) → ${newId}`,
      );
      byId.delete(csvId);
      byId.set(newId, { ...live, DEPARTMENT_ID: newId });
      usedIds.delete(csvId);
    }

    for (const { id, name, lineNo } of csvRows) {
      let code = inventDeptCode(id, name);
      const codeKey = code.toUpperCase();
      const occupant = [...byId.values()].find(
        (r) =>
          Number(r.DEPARTMENT_ID) !== id &&
          String(r.CODE ?? '').trim().toUpperCase() === codeKey,
      );
      if (occupant) {
        code = `${code}_${id}`;
      }
      try {
        await upsertRow(
          client,
          'DEPARTMENTS',
          'DEPARTMENT_ID',
          ['DEPARTMENT_ID', 'NAME', 'CODE', 'STATUS'],
          [id, name, code, 'Active'],
        );
        stats.upserted++;
        byId.set(id, { DEPARTMENT_ID: id, NAME: name, CODE: code });
        usedIds.add(id);
      } catch (e) {
        stats.errors++;
        logger.log(`DEPARTMENTS line ${lineNo} DEPARTMENT_ID=${id}: ${e.message}`);
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }

  await resetSequence(client, 'DEPARTMENTS', 'DEPARTMENT_ID');

  const verify = await client.query(
    `SELECT d."DEPARTMENT_ID", d."NAME", d."CODE",
            (SELECT COUNT(*)::int FROM "MASTER_SERVICES" ms WHERE ms."DEPARTMENT_ID" = d."DEPARTMENT_ID") AS services
     FROM "DEPARTMENTS" d
     WHERE d."DEPARTMENT_ID" IN (2,6,8,9) OR d."CODE" IN ('PHARM','DIAG','PHARMACY','RAD')
     ORDER BY d."DEPARTMENT_ID"`,
  );
  for (const r of verify.rows) {
    logger.log(
      `DEPARTMENTS verify id=${r.DEPARTMENT_ID} name=${r.NAME} code=${r.CODE} services=${r.services}`,
    );
  }
}

async function importDoctors(client, filePath, logger, stats) {
  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const id = toInt(row.DOCTOR_ID);
    const name = emptyToNull(row.DOCTOR_NAME);
    if (id === null || !name) {
      stats.skipped++;
      continue;
    }
    try {
      await upsertRow(
        client,
        'DOCTORS',
        'DOCTOR_ID',
        ['DOCTOR_ID', 'DOCTOR_NAME', 'DOCTORS_TYPE', 'QULIFICATION', 'GLOBAL_DOCTOR_ID'],
        [
          id,
          name,
          emptyToNull(row.DOCTORS_TYPE),
          emptyToNull(row.QULIFICATION),
          toInt(row.GLOBAL_DOCTOR_ID),
        ],
      );
      stats.upserted++;
    } catch (e) {
      stats.errors++;
      logger.log(`DOCTORS line ${lineNo}: ${e.message}`);
    }
  }
}

const USER_COLUMNS = [
  'USER_ID',
  'USER_NAME',
  'PWD',
  'CREATED_DATE',
  'IS_ADMIN',
  'CAPTURE',
  'IDENTIFY',
  'AWARD',
  'GENERATE_PIN',
  'LOCK_ACCOUNT',
  'ROLE_ID',
  'EMPLOYEE_ID',
  'ALLOW_SELF_PASSING',
  'EXPENDITURE_LIMIT',
  'EXPENDITURE_LIMIT_AMOUNT',
  'MODULE_ID',
  'CLINIC_ID',
  'WARD_ID',
  'STORE_ID',
  'FIRST_NAME',
  'LAST_NAME',
  'USER_TYPE',
  'STATIONED_AT',
  'LAB_GROUP_ID',
  'CREATED_BY',
  'UPDATED_BY',
  'UPDATED_DATE',
  'APPOINTMENT_COUNTER',
  'DOCTOR_IS_CONSULTANT',
  'PHONE_NO',
  'USER_CATEGORY',
  'EXPIRY_DATE',
  'IS_LOGIN_FLAG',
  'SBU',
  'HOSPITAL_ID',
  'BRANCH_ID',
  'PERSON_ID',
  'LICENSE_NUMBER',
  'SPECIALTIES',
  'PASSWORD',
  'EMAIL_ADDRESS',
  'PINCODE',
  'IS_APPROVING_OFFICER',
  'USER_ALISE',
];

const USER_DATE_COLS = new Set(['CREATED_DATE', 'UPDATED_DATE', 'EXPIRY_DATE']);
const USER_INT_COLS = new Set([
  'USER_ID',
  'ROLE_ID',
  'EMPLOYEE_ID',
  'MODULE_ID',
  'CLINIC_ID',
  'WARD_ID',
  'STORE_ID',
  'LAB_GROUP_ID',
  'APPOINTMENT_COUNTER',
  'HOSPITAL_ID',
  'BRANCH_ID',
  'PERSON_ID',
]);
const USER_DECIMAL_COLS = new Set(['EXPENDITURE_LIMIT_AMOUNT']);

function mapUserValue(col, row) {
  const raw = row[col];
  if (USER_DATE_COLS.has(col)) return parseLegacyDate(raw);
  if (USER_INT_COLS.has(col)) return toInt(raw);
  if (USER_DECIMAL_COLS.has(col)) return toDecimal(raw);
  return emptyToNull(raw);
}

function phoneDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function last4FromPhone(phone) {
  const d = phoneDigits(phone);
  return d.length >= 4 ? d.slice(-4) : null;
}

/**
 * Upsert staff row. Temporary login PIN = last 4 digits of phone (bcrypt into PWD/PASSWORD).
 * GENERATE_PIN = Y forces first-login PIN reset. If staff already reset (GENERATE_PIN = N),
 * password hashes are preserved on re-import.
 */
async function upsertUserRow(client, columns, values) {
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const updates = columns
    .filter((c) => c !== 'USER_ID')
    .map((c) => {
      if (c === 'PWD' || c === 'PASSWORD' || c === 'GENERATE_PIN') {
        return `"${c}" = CASE
          WHEN UPPER(COALESCE("USERS"."GENERATE_PIN", '')) = 'N' THEN "USERS"."${c}"
          ELSE EXCLUDED."${c}"
        END`;
      }
      return `"${c}" = EXCLUDED."${c}"`;
    })
    .join(', ');
  const sql = `INSERT INTO "USERS" (${colList}) VALUES (${placeholders})
    ON CONFLICT ("USER_ID") DO UPDATE SET ${updates}`;
  const result = await client.query(sql, values);
  return result.rowCount ?? 0;
}

async function importUsers(client, filePath, logger, stats) {
  const personIdx = USER_COLUMNS.indexOf('PERSON_ID');
  const pwdIdx = USER_COLUMNS.indexOf('PWD');
  const passwordIdx = USER_COLUMNS.indexOf('PASSWORD');
  const generatePinIdx = USER_COLUMNS.indexOf('GENERATE_PIN');
  const phoneIdx = USER_COLUMNS.indexOf('PHONE_NO');

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const id = toInt(row.USER_ID);
    const userName = emptyToNull(row.USER_NAME);
    if (id === null || !userName) {
      stats.skipped++;
      continue;
    }
    const values = USER_COLUMNS.map((c) => mapUserValue(c, row));
    const phone = values[phoneIdx];
    const last4 = last4FromPhone(phone);
    if (last4) {
      try {
        const hash = await bcrypt.hash(last4, 10);
        values[pwdIdx] = hash;
        values[passwordIdx] = hash;
        values[generatePinIdx] = 'Y';
      } catch (e) {
        stats.errors++;
        logger.log(`USERS line ${lineNo} USER_ID=${id}: bcrypt failed — ${e.message}`);
        continue;
      }
    } else {
      values[pwdIdx] = null;
      values[passwordIdx] = null;
      values[generatePinIdx] = 'Y';
      logger.log(
        `USERS line ${lineNo} USER_ID=${id}: imported without login PIN — PHONE_NO missing or shorter than 4 digits`,
      );
    }

    try {
      await upsertUserRow(client, USER_COLUMNS, values);
      stats.upserted++;
    } catch (e) {
      if (e.code === '23503' && personIdx >= 0 && values[personIdx] != null) {
        try {
          const retry = values.slice();
          retry[personIdx] = null;
          await upsertUserRow(client, USER_COLUMNS, retry);
          stats.upserted++;
          logger.log(
            `USERS line ${lineNo} USER_ID=${id}: PERSON_ID cleared (FK mismatch; import persons first if needed)`,
          );
          continue;
        } catch (e2) {
          stats.errors++;
          logger.log(`USERS line ${lineNo} USER_ID=${id}: ${e2.message}`);
          continue;
        }
      }
      stats.errors++;
      logger.log(`USERS line ${lineNo} USER_ID=${id}: ${e.message}`);
    }
  }
  await resetSequence(client, 'USERS', 'USER_ID');
}

const PERSON_COLUMNS = [
  'PERSON_ID',
  'HOSPITAL_NO',
  'FIRST_NAME',
  'LAST_NAME',
  'SEX',
  'M_STATUS',
  'DATE_OF_BIRTH',
  'RELIGON',
  'TRIBE',
  'RESIDENTIAL_ADDRESS',
  'HOME_TOWN',
  'STATE_OF_ORIGIN',
  'NATIONALITY',
  'PATIENT_PHONE_NO',
  'DATE_OF_REGISTRATION',
  'OCCUPATION',
  'NAME_OF_EMPLOYER',
  'NAME_OF_NEXT_OF_KIN',
  'RELATIONSHIP',
  'ADDRESS_OF_NEXT_OF_KIN',
  'TELEPHONE_OF_NEXT_OF_KIN',
  'FILE_NAME',
  'LOCATION_ID',
  'HMO_ID',
  'NHIS_NO',
  'REG_TYPE',
  'MIME',
  'CARD_NO',
  'CARD_STATUS',
  'ETHNIC_GROUP',
  'HUSBAND_NAME',
  'HUSBAND_OCCUPATION',
  'HUSBAND_EMPLOYER',
  'HUSBAND_TELL',
  'STATUS',
  'NHIS_REG_TYPE',
  'EXPIRED_DATE',
  'DISCONTINUE_FLAG',
  'CREATED_BY',
  'CREATED_DATE',
  'UPDATED_BY',
  'UPDATED_DATE',
  'WALLET_ACCT_ID',
  'LOAN_ACCT_ID',
  'MIDDLE_NAME',
  'IDENTITY_TYPE',
  'IDENTITY_NO',
  'BIOMETRIC_NO',
  'PRINCIPAL_DEPENDANT',
  'PRINCIPAL_ID',
  'SBU',
  'HOSPITAL_ID',
  'BRANCH_ID',
  'E_MAIL',
  'PERSON_GROUP_ID',
  'BLOOD_GROUP',
  'DEATH_DATE',
  'DEATH_CAUSE',
  'IS_DEATH',
  'GLOBAL_PERSON_ID',
  'BANK_CUSTOMER_CODE',
  'BANK_CUSTOMER_ACCT_NO',
  'BANK_CUSTOMER_ACCT_NAME',
  'BANK_NAME',
  'ACCOUNT_TYPE',
  'PATIENT_TYPE',
  'SERVICE_NO',
  'RANK',
  'UNIT',
  'PRIMARY_CONSULTANT',
];

const PERSON_DATE_COLS = new Set([
  'DATE_OF_BIRTH',
  'DATE_OF_REGISTRATION',
  'EXPIRED_DATE',
  'CREATED_DATE',
  'UPDATED_DATE',
  'DEATH_DATE',
]);
const PERSON_INT_COLS = new Set([
  'PERSON_ID',
  'LOCATION_ID',
  'HMO_ID',
  'WALLET_ACCT_ID',
  'LOAN_ACCT_ID',
  'PRINCIPAL_ID',
  'HOSPITAL_ID',
  'BRANCH_ID',
  'PERSON_GROUP_ID',
  'GLOBAL_PERSON_ID',
]);

function mapPersonStatus(_raw) {
  return 'Active';
}

function mapPersonValue(col, row) {
  const raw = row[col];
  if (col === 'STATUS') return mapPersonStatus(raw);
  if (PERSON_DATE_COLS.has(col)) return parseLegacyDate(raw);
  if (PERSON_INT_COLS.has(col)) return toInt(raw);
  const v = emptyToNull(raw);
  if (col === 'PATIENT_PHONE_NO' && v && v.length > 50) return v.slice(0, 50);
  return v;
}

async function importPersons(client, filePath, logger, stats, { offset, limit, batch }) {
  let dataIndex = -1; // 0-based among non-header data rows
  let processed = 0;
  let batchBuf = [];
  const seenHospitalNos = new Set();

  const hmoIdx = PERSON_COLUMNS.indexOf('HMO_ID');
  const hospIdx = PERSON_COLUMNS.indexOf('HOSPITAL_NO');

  const flush = async () => {
    if (batchBuf.length === 0) return;
    for (const item of batchBuf) {
      const values = item.values.slice();
      let upserted = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await upsertRow(client, 'PERSONS', 'PERSON_ID', PERSON_COLUMNS, values);
          stats.upserted++;
          upserted = true;
          break;
        } catch (e) {
          if (e.code === '23503' && hmoIdx >= 0 && values[hmoIdx] != null) {
            values[hmoIdx] = null;
            logger.log(
              `PERSONS line ${item.lineNo} PERSON_ID=${item.id}: HMO_ID cleared (FK mismatch)`,
            );
            continue;
          }
          if (e.code === '23505' && hospIdx >= 0 && values[hospIdx] != null) {
            values[hospIdx] = null;
            logger.log(
              `PERSONS line ${item.lineNo} PERSON_ID=${item.id}: HOSPITAL_NO cleared (unique constraint)`,
            );
            continue;
          }
          stats.errors++;
          logger.log(`PERSONS line ${item.lineNo} PERSON_ID=${item.id}: ${e.message}`);
          upserted = true;
          break;
        }
      }
      if (!upserted) {
        stats.errors++;
        logger.log(
          `PERSONS line ${item.lineNo} PERSON_ID=${item.id}: exhausted retries`,
        );
      }
    }
    batchBuf = [];
  };

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    dataIndex++;
    if (dataIndex < offset) continue;
    if (limit !== null && processed >= limit) break;

    const id = toInt(row.PERSON_ID);
    const first = emptyToNull(row.FIRST_NAME);
    const last = emptyToNull(row.LAST_NAME);
    if (id === null || (!first && !last)) {
      stats.skipped++;
      processed++;
      continue;
    }

    const values = PERSON_COLUMNS.map((c) => mapPersonValue(c, row));
    if (hospIdx >= 0 && values[hospIdx]) {
      const key = String(values[hospIdx]).trim().toLowerCase();
      if (seenHospitalNos.has(key)) {
        logger.log(
          `PERSONS line ${lineNo} PERSON_ID=${id}: HOSPITAL_NO cleared (duplicate in CSV; first occurrence kept)`,
        );
        values[hospIdx] = null;
      } else {
        seenHospitalNos.add(key);
      }
    }
    batchBuf.push({ id, lineNo, values });
    processed++;

    if (batchBuf.length >= batch) {
      await flush();
      if (processed % (batch * 4) === 0) {
        logger.log(`PERSONS progress: processed=${processed} upserted=${stats.upserted} errors=${stats.errors}`);
      }
    }
  }
  await flush();
  await resetSequence(client, 'PERSONS', 'PERSON_ID');
}

async function importFollowUps(client, filePath, logger, stats) {
  const personIds = await loadIdSet(client, 'PERSONS', 'PERSON_ID');
  const userIds = await loadIdSet(client, 'USERS', 'USER_ID');
  const clinicNames = await loadClinicNameMap(client);

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const followUpId = toInt(row.APPOINTMENT_ID);
    const personId = toInt(row.PERSON_ID);
    const doctorId = toInt(row.DOCTOR_ID);
    const scheduledDate = parseLegacyDate(row.APPOINTMENT_DATE);

    if (followUpId === null) {
      stats.skipped++;
      continue;
    }
    if (personId === null || !personIds.has(personId)) {
      stats.skipped++;
      logger.log(`FOLLOW_UPS line ${lineNo} APPOINTMENT_ID=${followUpId}: skip missing PERSON_ID=${personId}`);
      continue;
    }
    if (doctorId === null || !userIds.has(doctorId)) {
      stats.skipped++;
      logger.log(`FOLLOW_UPS line ${lineNo} APPOINTMENT_ID=${followUpId}: skip missing DOCTOR_ID=${doctorId}`);
      continue;
    }
    if (!scheduledDate) {
      stats.skipped++;
      logger.log(`FOLLOW_UPS line ${lineNo} APPOINTMENT_ID=${followUpId}: skip missing APPOINTMENT_DATE`);
      continue;
    }

    const clinicId = toInt(row.CLINIC_ID);
    let clinic = clinicId !== null ? clinicNames.get(clinicId) ?? null : null;
    if (clinic && clinic.length > 100) clinic = clinic.slice(0, 100);

    try {
      await upsertRow(
        client,
        'FOLLOW_UPS',
        'FOLLOW_UP_ID',
        [
          'FOLLOW_UP_ID',
          'PERSON_ID',
          'ENCOUNTER_ID',
          'DOCTOR_ID',
          'CLINIC',
          'SCHEDULED_DATE',
          'SCHEDULED_TIME',
          'PRIORITY',
          'STATUS',
          'CREATOR_TYPE',
          'REASON',
        ],
        [
          followUpId,
          personId,
          null,
          doctorId,
          clinic,
          scheduledDate,
          emptyToNull(row.APPOINTMENT_TIME),
          'Routine',
          mapFollowUpStatus(row.STATUS),
          'staff',
          emptyToNull(row.DESCIPTION),
        ],
      );
      stats.upserted++;
    } catch (e) {
      stats.errors++;
      logger.log(`FOLLOW_UPS line ${lineNo} APPOINTMENT_ID=${followUpId}: ${e.message}`);
    }
  }
  await resetSequence(client, 'FOLLOW_UPS', 'FOLLOW_UP_ID');
}

async function importAdmissions(client, filePath, logger, stats) {
  const personIds = await loadIdSet(client, 'PERSONS', 'PERSON_ID');
  const wardIds = await loadIdSet(client, 'WARDS', 'WARD_ID');
  const groups = new Map();

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const admissionId = toInt(row.ADMISSION_ID);
    const personId = toInt(row.PERSON_ID);
    if (admissionId === null) {
      stats.skipped++;
      continue;
    }
    if (admissionId < 100) {
      stats.skipped++;
      logger.log(`ADMISSIONS line ${lineNo} ADMISSION_ID=${admissionId}: skip id < 100 (protect live 1–4)`);
      continue;
    }
    if (personId === null || !personIds.has(personId)) {
      stats.skipped++;
      continue;
    }

    const admittedAt = parseOracleTimestamp(row.ADMISSION_DATE);
    const dischargedAt = parseOracleTimestamp(row.DISCHARGE_DATE);
    const wardId = toInt(row.WARD_ID);

    if (!groups.has(admissionId)) {
      groups.set(admissionId, {
        admissionId,
        personId,
        admittedAt,
        dischargedAt,
        dischargeReason: emptyToNull(row.DISCHARGE_TYPE),
        wardId: isLegacyAroWardId(wardId) && wardIds.has(wardId) ? wardId : null,
        lineNo,
      });
      continue;
    }

    const g = groups.get(admissionId);
    if (admittedAt && (!g.admittedAt || admittedAt < g.admittedAt)) {
      g.admittedAt = admittedAt;
    }
    if (dischargedAt && (!g.dischargedAt || dischargedAt > g.dischargedAt)) {
      g.dischargedAt = dischargedAt;
      g.dischargeReason = emptyToNull(row.DISCHARGE_TYPE) ?? g.dischargeReason;
    }
    if (isLegacyAroWardId(wardId) && wardIds.has(wardId)) {
      g.wardId = wardId;
    }
  }

  for (const g of groups.values()) {
    if (!g.admittedAt) {
      stats.skipped++;
      logger.log(`ADMISSIONS ADMISSION_ID=${g.admissionId}: skip missing ADMISSION_DATE`);
      continue;
    }

    const status = g.dischargedAt ? 'DISCHARGED' : 'ADMITTED';
    try {
      await upsertRow(
        client,
        'ADMISSIONS',
        'ADMISSION_ID',
        [
          'ADMISSION_ID',
          'PERSON_ID',
          'WARD_ID',
          'BED_ID',
          'STATUS',
          'ADMITTED_AT',
          'DISCHARGED_AT',
          'DISCHARGE_REASON',
        ],
        [
          g.admissionId,
          g.personId,
          g.wardId,
          null,
          status,
          g.admittedAt,
          g.dischargedAt,
          g.dischargeReason,
        ],
      );
      stats.upserted++;
    } catch (e) {
      stats.errors++;
      logger.log(`ADMISSIONS ADMISSION_ID=${g.admissionId}: ${e.message}`);
    }
  }
  await resetSequence(client, 'ADMISSIONS', 'ADMISSION_ID');
}

async function importNursingCarePlans(client, filePath, logger, stats) {
  const personIds = await loadIdSet(client, 'PERSONS', 'PERSON_ID');

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const carePlanId = toInt(row.NURS_CARE_PLAN_ID);
    const personId = toInt(row.PERSON_ID);

    if (carePlanId === null) {
      stats.skipped++;
      continue;
    }
    if (personId === null || !personIds.has(personId)) {
      stats.skipped++;
      continue;
    }
    if (
      isEmptyCarePlanToken(row.NURS_DIAGNOSIS) &&
      isEmptyCarePlanToken(row.OBJECTIVES) &&
      isEmptyCarePlanToken(row.NURS_ACTION) &&
      isEmptyCarePlanToken(row.EVALUATION)
    ) {
      stats.skipped++;
      continue;
    }

    const createdByRaw =
      emptyToNull(row.NURSES_INITIALS) ?? emptyToNull(row.CREATED_BY) ?? null;
    const createdBy =
      createdByRaw && createdByRaw.length > 100 ? createdByRaw.slice(0, 100) : createdByRaw;
    const createdDate = parseOracleTimestamp(row.DATE_TIME) ?? new Date();

    try {
      await upsertRow(
        client,
        'NURSING_CARE_PLANS',
        'CARE_PLAN_ID',
        [
          'CARE_PLAN_ID',
          'ADMISSION_ID',
          'PERSON_ID',
          'DIAGNOSIS',
          'GOAL',
          'INTERVENTION',
          'EVALUATION',
          'STATUS',
          'CREATED_BY',
          'CREATED_DATE',
        ],
        [
          carePlanId,
          null,
          personId,
          emptyToNull(row.NURS_DIAGNOSIS),
          emptyToNull(row.OBJECTIVES),
          emptyToNull(row.NURS_ACTION),
          emptyToNull(row.EVALUATION),
          'active',
          createdBy,
          createdDate,
        ],
      );
      stats.upserted++;
    } catch (e) {
      stats.errors++;
      logger.log(`NURSING_CARE_PLANS line ${lineNo} CARE_PLAN_ID=${carePlanId}: ${e.message}`);
    }
  }
  await resetSequence(client, 'NURSING_CARE_PLANS', 'CARE_PLAN_ID');
}

function mapNursingNoteType(nurseDoctor) {
  const s = String(nurseDoctor ?? '').trim().toUpperCase();
  if (s === 'NURSE') return 'Progress';
  if (s === 'DOCTOR') return 'General';
  return 'General';
}

function truncateStr(v, max) {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}

function mapDiagnosisSystem(category) {
  const s = String(category ?? '').trim().toUpperCase();
  if (s === 'ICD10') return 'ICD-11';
  return 'Local';
}

function mapDiagnosisStatus(status) {
  const s = String(status ?? '').trim().toUpperCase();
  if (s === 'INACTIVE') return 'Resolved';
  return 'Active';
}

function mapDiagnosisType(isPrimary) {
  const s = String(isPrimary ?? '').trim().toUpperCase();
  if (s === 'Y' || s === 'YES' || s === '1' || s === 'TRUE' || s === 'PRIMARY') return 'Primary';
  return 'Secondary';
}

function buildLegacyDiagnosisCode(row, diagnosisId) {
  const thesaurusId = toInt(row.THESAURUS_ID);
  const diseaseId = toInt(row.DISEASE_ID);
  if (thesaurusId !== null) return `TH-${thesaurusId}`;
  if (diseaseId !== null) return `DIS-${diseaseId}`;
  return `LEG-${diagnosisId}`;
}

function buildLegacyDiagnosisName(row, diagnosisId) {
  const desc = emptyToNull(row.DESCRIPTION);
  if (desc) return truncateStr(desc, 255);
  const thesaurusId = toInt(row.THESAURUS_ID);
  if (thesaurusId !== null) return `Thesaurus diagnosis ${thesaurusId}`;
  const diseaseId = toInt(row.DISEASE_ID);
  if (diseaseId !== null) return `Disease ${diseaseId}`;
  return `Legacy diagnosis ${diagnosisId}`;
}

function buildLegacyDiagnosisNotes(admissionId) {
  if (admissionId === null) return null;
  return `legacy_admission_id=${admissionId}`;
}

function resolveLegacyUserId(row, userIds) {
  const doctorId = toInt(row.DOCTOR_ID);
  if (doctorId !== null && userIds.has(doctorId)) return doctorId;
  const createdBy = toInt(row.CREATED_BY);
  if (createdBy !== null && userIds.has(createdBy)) return createdBy;
  return null;
}

async function importPatientDiagnoses(client, filePath, logger, stats) {
  const personIds = await loadIdSet(client, 'PERSONS', 'PERSON_ID');
  const userIds = await loadIdSet(client, 'USERS', 'USER_ID');
  const batchSize = 100;
  let batchBuf = [];
  let processed = 0;

  const flush = async () => {
    if (batchBuf.length === 0) return;
    try {
      await upsertPatientDiagnosisBatch(
        client,
        batchBuf.map((item) => item.values),
      );
      stats.upserted += batchBuf.length;
    } catch (e) {
      for (const item of batchBuf) {
        try {
          await upsertRow(
            client,
            'PATIENT_DIAGNOSES',
            'PATIENT_DIAGNOSIS_ID',
            PATIENT_DIAGNOSIS_COLUMNS,
            item.values,
          );
          stats.upserted++;
        } catch (rowErr) {
          stats.errors++;
          logger.log(
            `PATIENT_DIAGNOSES line ${item.lineNo} DIAGNOSIS_ID=${item.diagnosisId}: ${rowErr.message}`,
          );
        }
      }
    }
    batchBuf = [];
  };

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const diagnosisId = toInt(row.DIAGNOSIS_ID);
    const personId = toInt(row.PERSON_ID);

    if (diagnosisId === null) {
      stats.skipped++;
      continue;
    }
    if (personId === null || !personIds.has(personId)) {
      stats.skipped++;
      logger.log(
        `PATIENT_DIAGNOSES line ${lineNo} DIAGNOSIS_ID=${diagnosisId}: skip missing PERSON_ID=${personId}`,
      );
      continue;
    }

    const createdById = resolveLegacyUserId(row, userIds);
    const updatedByRaw = toInt(row.UPDATED_BY);
    const updatedById =
      updatedByRaw !== null && userIds.has(updatedByRaw) ? updatedByRaw : null;
    const onsetDate = parseOracleTimestamp(row.DIAGNOSIS_DATE);
    const createdDate =
      parseLegacyDate(row.CREATED_DATE) ?? onsetDate ?? new Date();
    const updatedDate = parseLegacyDate(row.UPDATED_DATE) ?? createdDate;
    const admissionId = toInt(row.ADMISSION_ID);

    batchBuf.push({
      lineNo,
      diagnosisId,
      values: [
        diagnosisId,
        personId,
        null,
        truncateStr(buildLegacyDiagnosisCode(row, diagnosisId), 40),
        mapDiagnosisSystem(row.DIAGNOSIS_CATEGORY),
        buildLegacyDiagnosisName(row, diagnosisId),
        mapDiagnosisType(row.IS_PRIMARY),
        mapDiagnosisStatus(row.STATUS),
        onsetDate,
        buildLegacyDiagnosisNotes(admissionId),
        true,
        createdById,
        updatedById,
        createdById !== null ? String(createdById) : null,
        createdDate,
        updatedById !== null ? String(updatedById) : null,
        updatedDate,
      ],
    });
    processed++;

    if (batchBuf.length >= batchSize) {
      await flush();
      if (processed % 1000 === 0) {
        logger.log(
          `PATIENT_DIAGNOSES progress: processed=${processed} upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors}`,
        );
      }
    }
  }

  await flush();
  logger.log(
    `PATIENT_DIAGNOSES progress: processed=${processed} upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors}`,
  );
  await resetSequence(client, 'PATIENT_DIAGNOSES', 'PATIENT_DIAGNOSIS_ID');
}

async function importNursingNotes(client, filePath, logger, stats) {
  const personIds = await loadIdSet(client, 'PERSONS', 'PERSON_ID');
  const admissionIds = await loadIdSet(client, 'ADMISSIONS', 'ADMISSION_ID');

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const noteId = toInt(row.NOTE_ID);
    const personId = toInt(row.PERSON_ID);
    const body = emptyToNull(row.DESCRIPTION);

    if (noteId === null) {
      stats.skipped++;
      continue;
    }
    if (personId === null || !personIds.has(personId)) {
      stats.skipped++;
      logger.log(`NURSING_NOTES line ${lineNo} NOTE_ID=${noteId}: skip missing PERSON_ID=${personId}`);
      continue;
    }
    if (!body) {
      stats.skipped++;
      continue;
    }

    const admissionIdRaw = toInt(row.ADMISSION_ID);
    const admissionId =
      admissionIdRaw !== null && admissionIds.has(admissionIdRaw) ? admissionIdRaw : null;
    const createdDate = parseLegacyDate(row.CREATED_DATE) ?? new Date();
    const authorBy = emptyToNull(row.CREATED_BY);

    try {
      await upsertRow(
        client,
        'NURSING_NOTES',
        'NOTE_ID',
        [
          'NOTE_ID',
          'ADMISSION_ID',
          'PERSON_ID',
          'NOTE_TYPE',
          'FORMAT',
          'BODY',
          'AUTHOR_BY',
          'CREATED_DATE',
        ],
        [
          noteId,
          admissionId,
          personId,
          mapNursingNoteType(row.NURSE_DOCTOR),
          'Narrative',
          body,
          authorBy,
          createdDate,
        ],
      );
      stats.upserted++;
    } catch (e) {
      stats.errors++;
      logger.log(`NURSING_NOTES line ${lineNo} NOTE_ID=${noteId}: ${e.message}`);
    }
  }
  await resetSequence(client, 'NURSING_NOTES', 'NOTE_ID');
}

const NURSING_NOTE_COLUMNS = [
  'NOTE_ID',
  'ADMISSION_ID',
  'PERSON_ID',
  'NOTE_TYPE',
  'FORMAT',
  'BODY',
  'AUTHOR_BY',
  'CREATED_DATE',
];

const MAR_COLUMNS = [
  'MAR_ID',
  'PERSON_ID',
  'ADMISSION_ID',
  'DRUG',
  'DOSE',
  'ROUTE',
  'FREQUENCY',
  'SCHEDULED_TIME',
  'KIND',
  'STATUS',
  'SOURCE',
  'PRESCRIBER',
  'NOTES',
  'CREATED_DATE',
];

const OBSERVATION_COLUMNS = [
  'OBSERVATION_ID',
  'ADMISSION_ID',
  'PERSON_ID',
  'CHART',
  'INTERVAL',
  'FIELDS_JSON',
  'RECORDED_BY',
  'RECORDED_AT',
  'CREATED_BY_ID',
];

const FLUID_JSON_KEYS = [
  'I_PERIOD',
  'I_WARD_ID',
  'I_TYPE',
  'I_TUBE',
  'I_ORAL',
  'I_IV',
  'I_TOTAL',
  'I_TOTAL_TUBE',
  'I_TOTAL_ORAL',
  'I_TOTAL_IV',
  'I_TOTAL_IN',
  'I_TOTAL_OUT',
  'I_BALANCE',
  'I_TIME',
  'O_TIME',
  'O_PERIOD',
  'O_URINE',
  'O_TUBE_VOMIT',
  'O_FAECES',
  'O_TYPE',
  'O_OTHERS',
  'O_TOTAL',
  'O_TOTAL_URINE',
  'O_TOTAL_TUBE',
  'O_TOTAL_FAECES',
  'O_TOTAL_OUT',
  'O_TOTAL_SUMMARY',
  'IN_OUT',
  'CASE_FILE_ID',
  'REMARK',
];

function resolveAdmissionId(raw, admissionIds) {
  const id = toInt(raw);
  if (id === null || !admissionIds.has(id)) return null;
  return id;
}

function inferMarRoute(drugName) {
  const s = String(drugName ?? '').trim().toLowerCase();
  if (s.startsWith('inj')) return 'IM';
  if (s.includes(' iv') || s.startsWith('iv ') || s.startsWith('iv-')) return 'IV';
  if (s.startsWith('syr') || s.startsWith('susp') || s.startsWith('tab') || s.startsWith('cap')) {
    return 'PO';
  }
  return 'Unknown';
}

function mapMarDetailStatus(raw) {
  const s = String(raw ?? '').trim();
  if (s === '1') return 'GIVEN';
  if (s === '0' || s === '2') return 'MISSED';
  if (!s) return 'PENDING';
  return 'HELD';
}

function buildFluidFieldsJson(row) {
  const obj = {};
  for (const key of FLUID_JSON_KEYS) {
    const v = emptyToNull(row[key]);
    if (v !== null) obj[key] = v;
  }
  return JSON.stringify(obj);
}

async function importNurseShiftReports(client, filePath, logger, stats) {
  const personIds = await loadIdSet(client, 'PERSONS', 'PERSON_ID');
  const admissionIds = await loadIdSet(client, 'ADMISSIONS', 'ADMISSION_ID');
  const batchSize = 100;
  const batchBuf = [];
  let processed = 0;

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const noteId = toInt(row.NURSES_REPORT_SHEET_ID);
    const personId = toInt(row.PERSON_ID);
    const body = emptyToNull(row.REPORT);

    if (noteId === null) {
      stats.skipped++;
      continue;
    }
    if (personId === null || !personIds.has(personId)) {
      stats.skipped++;
      continue;
    }
    if (!body) {
      stats.skipped++;
      continue;
    }

    const createdDate =
      parseOracleTimestamp(row.DATE_TIME) ?? parseLegacyDate(row.CREATED_DATE) ?? new Date();
    const authorBy = truncateStr(emptyToNull(row.NURSE_NAME) ?? emptyToNull(row.CREATED_BY), 100);

    batchBuf.push({
      lineNo,
      id: noteId,
      values: [
        noteId,
        resolveAdmissionId(row.ADMISSION_ID, admissionIds),
        personId,
        'Shift',
        'Narrative',
        body,
        authorBy,
        createdDate,
      ],
    });
    processed++;

    if (batchBuf.length >= batchSize) {
      await flushUpsertBatch(
        client,
        'NURSING_NOTES',
        'NOTE_ID',
        NURSING_NOTE_COLUMNS,
        batchBuf,
        stats,
        logger,
        'NURSING_NOTES',
      );
      if (processed % 1000 === 0) {
        logger.log(
          `NURSING_NOTES (shift reports) progress: processed=${processed} upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors}`,
        );
      }
    }
  }

  await flushUpsertBatch(
    client,
    'NURSING_NOTES',
    'NOTE_ID',
    NURSING_NOTE_COLUMNS,
    batchBuf,
    stats,
    logger,
    'NURSING_NOTES',
  );
  logger.log(
    `NURSING_NOTES (shift reports) progress: processed=${processed} upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors}`,
  );
  await resetSequence(client, 'NURSING_NOTES', 'NOTE_ID');
}

async function importDrugChart(client, filePath, logger, stats) {
  const personIds = await loadIdSet(client, 'PERSONS', 'PERSON_ID');
  const admissionIds = await loadIdSet(client, 'ADMISSIONS', 'ADMISSION_ID');
  const batchSize = 100;
  const batchBuf = [];
  let processed = 0;

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const marId = toInt(row.DRUG_CHART_ID);
    const personId = toInt(row.PERSON_ID);
    const drug = truncateStr(emptyToNull(row.NAME_DRUG), 255);

    if (marId === null || marId < 100) {
      stats.skipped++;
      continue;
    }
    if (personId === null || !personIds.has(personId)) {
      stats.skipped++;
      continue;
    }
    if (!drug) {
      stats.skipped++;
      continue;
    }

    const scheduledTime =
      parseOracleTimestamp(row.DOSAGE_DATE) ??
      parseLegacyDate(row.CREATED_DATE) ??
      new Date();
    const dose = truncateStr(emptyToNull(row.DOSAGE) ?? '-', 100);
    const createdBy = truncateStr(emptyToNull(row.CREATED_BY), 255);

    batchBuf.push({
      lineNo,
      id: marId,
      values: [
        marId,
        personId,
        resolveAdmissionId(row.ADMISSION_ID, admissionIds),
        drug,
        dose,
        inferMarRoute(drug),
        'Unknown',
        scheduledTime,
        'External',
        'PENDING',
        'legacy-drug-chart',
        createdBy,
        null,
        parseLegacyDate(row.CREATED_DATE) ?? scheduledTime,
      ],
    });
    processed++;

    if (batchBuf.length >= batchSize) {
      await flushUpsertBatch(
        client,
        'NURSING_MAR_ENTRIES',
        'MAR_ID',
        MAR_COLUMNS,
        batchBuf,
        stats,
        logger,
        'NURSING_MAR_ENTRIES',
      );
      if (processed % 1000 === 0) {
        logger.log(
          `NURSING_MAR_ENTRIES progress: processed=${processed} upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors}`,
        );
      }
    }
  }

  await flushUpsertBatch(
    client,
    'NURSING_MAR_ENTRIES',
    'MAR_ID',
    MAR_COLUMNS,
    batchBuf,
    stats,
    logger,
    'NURSING_MAR_ENTRIES',
  );
  logger.log(
    `NURSING_MAR_ENTRIES progress: processed=${processed} upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors}`,
  );
  await resetSequence(client, 'NURSING_MAR_ENTRIES', 'MAR_ID');
}

async function importDrugChartDetails(client, filePath, logger, stats) {
  const marIds = await loadIdSet(client, 'NURSING_MAR_ENTRIES', 'MAR_ID');
  const groups = new Map();

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const chartId = toInt(row.DRUG_CHART_ID);
    if (chartId === null || !marIds.has(chartId)) {
      stats.skipped++;
      continue;
    }
    const when =
      parseOracleTimestamp(row.ADMINISTER_DATE) ?? parseOracleTimestamp(row.DATE_TIME);
    const status = mapMarDetailStatus(row.STATUS);
    const nurseId = emptyToNull(row.NURSE_ID);
    const dose = emptyToNull(row.DOSAGE);

    if (!groups.has(chartId)) {
      groups.set(chartId, {
        chartId,
        lineNo,
        givenCount: 0,
        missedCount: 0,
        pendingCount: 0,
        latestGivenAt: null,
        latestAt: when,
        administeredBy: nurseId,
        events: [],
      });
    }
    const g = groups.get(chartId);
    if (status === 'GIVEN') {
      g.givenCount++;
      if (when && (!g.latestGivenAt || when > g.latestGivenAt)) {
        g.latestGivenAt = when;
        g.administeredBy = nurseId ?? g.administeredBy;
      }
    } else if (status === 'MISSED') {
      g.missedCount++;
    } else if (status === 'PENDING') {
      g.pendingCount++;
    }
    if (when && (!g.latestAt || when > g.latestAt)) g.latestAt = when;
    if (g.events.length < 12) {
      const stamp = when ? when.toISOString() : 'unknown-time';
      g.events.push(`${stamp} ${status}${dose ? ` dose=${dose}` : ''}`);
    }
  }

  const batchSize = 80;
  let batch = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const values = [];
    const tuples = batch
      .map((item, idx) => {
        const base = idx * 6;
        values.push(
          item.chartId,
          item.status,
          item.administeredAt,
          item.administeredBy,
          item.notes,
          item.updatedDate,
        );
        return `($${base + 1}::int, $${base + 2}, $${base + 3}::timestamptz, $${base + 4}, $${base + 5}, $${base + 6}::timestamptz)`;
      })
      .join(', ');
    try {
      await client.query(
        `UPDATE "NURSING_MAR_ENTRIES" AS m SET
           "STATUS" = v.status,
           "ADMINISTERED_AT" = v.administered_at,
           "ADMINISTERED_BY" = v.administered_by,
           "NOTES" = v.notes,
           "UPDATED_DATE" = v.updated_date
         FROM (VALUES ${tuples}) AS v(mar_id, status, administered_at, administered_by, notes, updated_date)
         WHERE m."MAR_ID" = v.mar_id`,
        values,
      );
      stats.upserted += batch.length;
    } catch (e) {
      for (const item of batch) {
        try {
          await client.query(
            `UPDATE "NURSING_MAR_ENTRIES"
             SET "STATUS" = $2, "ADMINISTERED_AT" = $3, "ADMINISTERED_BY" = $4, "NOTES" = $5, "UPDATED_DATE" = $6
             WHERE "MAR_ID" = $1`,
            [
              item.chartId,
              item.status,
              item.administeredAt,
              item.administeredBy,
              item.notes,
              item.updatedDate,
            ],
          );
          stats.upserted++;
        } catch (rowErr) {
          stats.errors++;
          logger.log(`NURSING_MAR_ENTRIES detail MAR_ID=${item.chartId}: ${rowErr.message}`);
        }
      }
    }
    batch = [];
  };

  let processed = 0;
  for (const g of groups.values()) {
    let status = 'PENDING';
    if (g.givenCount > 0) status = 'GIVEN';
    else if (g.missedCount > 0 && g.pendingCount === 0) status = 'MISSED';
    const notes = truncateStr(
      `${g.givenCount} given / ${g.missedCount} missed / ${g.pendingCount} pending. ${g.events.join('; ')}`,
      8000,
    );
    batch.push({
      chartId: g.chartId,
      status,
      administeredAt: g.latestGivenAt,
      administeredBy: truncateStr(g.administeredBy, 100),
      notes,
      updatedDate: g.latestGivenAt ?? g.latestAt ?? new Date(),
    });
    processed++;
    if (batch.length >= batchSize) {
      await flush();
      if (processed % 1000 === 0) {
        logger.log(
          `DRUG_CHART_DETAILS progress: grouped=${processed} updated=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors}`,
        );
      }
    }
  }
  await flush();
  logger.log(
    `DRUG_CHART_DETAILS progress: grouped=${processed} updated=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors}`,
  );
}

async function importFluids(client, filePath, logger, stats) {
  const personIds = await loadIdSet(client, 'PERSONS', 'PERSON_ID');
  const admissionIds = await loadIdSet(client, 'ADMISSIONS', 'ADMISSION_ID');
  const userIds = await loadIdSet(client, 'USERS', 'USER_ID');
  const batchSize = 100;
  const batchBuf = [];
  let processed = 0;

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const observationId = toInt(row.FLUID_ID);
    const personId = toInt(row.PERSON_ID);

    if (observationId === null) {
      stats.skipped++;
      continue;
    }
    if (personId === null || !personIds.has(personId)) {
      stats.skipped++;
      continue;
    }

    const recordedAt =
      parseOracleTimestamp(row.I_TIME) ??
      parseOracleTimestamp(row.O_TIME) ??
      parseLegacyDate(row.CREATED_DATE) ??
      new Date();
    const createdByRaw = toInt(row.CREATED_BY);
    const createdById =
      createdByRaw !== null && userIds.has(createdByRaw) ? createdByRaw : null;

    batchBuf.push({
      lineNo,
      id: observationId,
      values: [
        observationId,
        resolveAdmissionId(row.ADMISSION_ID, admissionIds),
        personId,
        'IntakeOutput',
        truncateStr(emptyToNull(row.I_PERIOD) ?? emptyToNull(row.O_PERIOD), 20),
        buildFluidFieldsJson(row),
        truncateStr(emptyToNull(row.CREATED_BY), 100),
        recordedAt,
        createdById,
      ],
    });
    processed++;

    if (batchBuf.length >= batchSize) {
      await flushUpsertBatch(
        client,
        'NURSING_OBSERVATIONS',
        'OBSERVATION_ID',
        OBSERVATION_COLUMNS,
        batchBuf,
        stats,
        logger,
        'NURSING_OBSERVATIONS',
      );
      if (processed % 1000 === 0) {
        logger.log(
          `NURSING_OBSERVATIONS progress: processed=${processed} upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors}`,
        );
      }
    }
  }

  await flushUpsertBatch(
    client,
    'NURSING_OBSERVATIONS',
    'OBSERVATION_ID',
    OBSERVATION_COLUMNS,
    batchBuf,
    stats,
    logger,
    'NURSING_OBSERVATIONS',
  );
  logger.log(
    `NURSING_OBSERVATIONS progress: processed=${processed} upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors}`,
  );
  await resetSequence(client, 'NURSING_OBSERVATIONS', 'OBSERVATION_ID');
}

function isTruthyFlag(v) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'Y' || s === 'YES' || s === '1' || s === 'TRUE';
}

function isDiscontinuedFlag(v) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'Y' || s === 'YES' || s === '1' || s === 'TRUE';
}

function appendKeyword(existing, term) {
  const t = emptyToNull(term);
  if (!t) return existing ?? null;
  if (!existing) return truncateStr(t, 4000);
  if (existing.toLowerCase().includes(t.toLowerCase())) return existing;
  return truncateStr(`${existing}; ${t}`, 4000);
}

async function upsertDiagnosisCodesByCode(client, rows, dryRun) {
  if (rows.length === 0) return;
  if (dryRun) return;
  const columns = [
    'CODE',
    'SYSTEM',
    'NAME',
    'CATEGORY',
    'DESCRIPTION',
    'KEYWORDS',
    'STATUS',
    'LEGACY_THESAURUS_ID',
    'LEGACY_DISEASE_ID',
    'ICPC_CODE',
    'CREATED_BY',
    'CREATED_DATE',
    'UPDATED_BY',
    'UPDATED_DATE',
  ];
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const updates = [
    `"SYSTEM" = EXCLUDED."SYSTEM"`,
    `"NAME" = EXCLUDED."NAME"`,
    `"CATEGORY" = COALESCE(EXCLUDED."CATEGORY", "DIAGNOSIS_CODES"."CATEGORY")`,
    `"DESCRIPTION" = COALESCE(EXCLUDED."DESCRIPTION", "DIAGNOSIS_CODES"."DESCRIPTION")`,
    `"KEYWORDS" = CASE
      WHEN EXCLUDED."KEYWORDS" IS NULL THEN "DIAGNOSIS_CODES"."KEYWORDS"
      WHEN "DIAGNOSIS_CODES"."KEYWORDS" IS NULL THEN EXCLUDED."KEYWORDS"
      WHEN POSITION(LOWER(EXCLUDED."KEYWORDS") IN LOWER("DIAGNOSIS_CODES"."KEYWORDS")) > 0 THEN "DIAGNOSIS_CODES"."KEYWORDS"
      ELSE LEFT("DIAGNOSIS_CODES"."KEYWORDS" || '; ' || EXCLUDED."KEYWORDS", 4000)
    END`,
    `"STATUS" = EXCLUDED."STATUS"`,
    `"LEGACY_THESAURUS_ID" = COALESCE(EXCLUDED."LEGACY_THESAURUS_ID", "DIAGNOSIS_CODES"."LEGACY_THESAURUS_ID")`,
    `"LEGACY_DISEASE_ID" = COALESCE(EXCLUDED."LEGACY_DISEASE_ID", "DIAGNOSIS_CODES"."LEGACY_DISEASE_ID")`,
    `"ICPC_CODE" = COALESCE(EXCLUDED."ICPC_CODE", "DIAGNOSIS_CODES"."ICPC_CODE")`,
    `"UPDATED_BY" = EXCLUDED."UPDATED_BY"`,
    `"UPDATED_DATE" = EXCLUDED."UPDATED_DATE"`,
  ].join(', ');
  const values = [];
  const tuples = rows
    .map((row, rowIdx) => {
      const placeholders = columns.map((_, colIdx) => {
        values.push(row[colIdx]);
        return `$${rowIdx * columns.length + colIdx + 1}`;
      });
      return `(${placeholders.join(', ')})`;
    })
    .join(', ');
  const sql = `INSERT INTO "DIAGNOSIS_CODES" (${colList}) VALUES ${tuples}
    ON CONFLICT ("CODE") DO UPDATE SET ${updates}`;
  await client.query(sql, values);
}

async function importDiseases(client, filePath, logger, stats, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const batchSize = options.batch ?? 250;
  const offset = options.offset ?? 0;
  const limit = options.limit ?? null;
  const byCode = new Map();
  let seen = 0;
  let considered = 0;

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    seen++;
    if (seen <= offset) continue;
    if (limit !== null && considered >= limit) break;
    considered++;

    const diseaseId = toInt(row.DISEASE_ID);
    if (diseaseId === null) {
      stats.skipped++;
      continue;
    }
    const rawCode = emptyToNull(row.CODE);
    const code = truncateStr(rawCode || `DIS-${diseaseId}`, 40);
    const name =
      truncateStr(emptyToNull(row.DISEASE_NAME) || emptyToNull(row.DESCRIPTION) || `Disease ${diseaseId}`, 255) ||
      `Disease ${diseaseId}`;
    const discontinued = isDiscontinuedFlag(row.DISCONTINUE_FLAG);
    const category = truncateStr(emptyToNull(row.DISEASE_TYPE), 100);
    const description = emptyToNull(row.DESCRIPTION);
    const now = new Date();

    const prev = byCode.get(code);
    if (prev) {
      prev[5] = appendKeyword(prev[5], name);
      if (!prev[8]) prev[8] = diseaseId;
      stats.skipped++;
      continue;
    }
    byCode.set(code, [
      code,
      rawCode ? 'ICD-11' : 'Local',
      name,
      category,
      description,
      `legacy_disease_id=${diseaseId}`,
      discontinued ? 'Inactive' : 'Active',
      null,
      diseaseId,
      null,
      'legacy-csv',
      now,
      'legacy-csv',
      now,
    ]);
    if (lineNo && considered % 2000 === 0) {
      logger.log(`DISEASES progress: considered=${considered} uniqueCodes=${byCode.size}`);
    }
  }

  const rows = [...byCode.values()];
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    try {
      if (dryRun) {
        stats.upserted += chunk.length;
      } else {
        await upsertDiagnosisCodesByCode(client, chunk, false);
        stats.upserted += chunk.length;
      }
    } catch (e) {
      for (const row of chunk) {
        try {
          if (!dryRun) await upsertDiagnosisCodesByCode(client, [row], false);
          stats.upserted++;
        } catch (rowErr) {
          stats.errors++;
          logger.log(`DISEASES CODE=${row[0]}: ${rowErr.message}`);
        }
      }
    }
  }
  logger.log(
    `DISEASES done: uniqueCodes=${rows.length} upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors} dryRun=${dryRun}`,
  );
}

async function importThesaurus(client, filePath, logger, stats, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const batchSize = options.batch ?? 200;
  const offset = options.offset ?? 0;
  const limit = options.limit ?? null;
  const byCode = new Map();
  let seen = 0;
  let considered = 0;

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    seen++;
    if (seen <= offset) continue;
    if (limit !== null && considered >= limit) break;
    considered++;

    const thesaurusId = toInt(row.THESAURUS_ID);
    const icdCode = emptyToNull(row.ICD_CODE);
    if (!icdCode) {
      stats.skipped++;
      continue;
    }
    if (thesaurusId === null) {
      stats.skipped++;
      continue;
    }
    const code = truncateStr(icdCode, 40);
    const name =
      truncateStr(
        emptyToNull(row.ICD_LABLE) || emptyToNull(row.ICD_LABEL) || emptyToNull(row.TERMS) || `Thesaurus ${thesaurusId}`,
        255,
      ) || `Thesaurus ${thesaurusId}`;
    const terms = emptyToNull(row.TERMS);
    const icpc = truncateStr(emptyToNull(row.ICPC_CODE), 40);
    const now = new Date();

    const prev = byCode.get(code);
    if (prev) {
      prev[5] = appendKeyword(prev[5], terms);
      if (!prev[7]) prev[7] = thesaurusId;
      if (!prev[9] && icpc) prev[9] = icpc;
      continue;
    }
    byCode.set(code, [
      code,
      'ICD-11',
      name,
      truncateStr(emptyToNull(row.ICPC_LABLE) || emptyToNull(row.ICPC_LABEL), 100),
      emptyToNull(row.EXTENSION),
      terms,
      'Active',
      thesaurusId,
      null,
      icpc,
      'legacy-csv',
      now,
      'legacy-csv',
      now,
    ]);
    if (considered % 10000 === 0) {
      logger.log(`THESAURUS progress: considered=${considered} uniqueCodes=${byCode.size} line=${lineNo}`);
    }
  }

  const rows = [...byCode.values()];
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    try {
      if (dryRun) stats.upserted += chunk.length;
      else {
        await upsertDiagnosisCodesByCode(client, chunk, false);
        stats.upserted += chunk.length;
      }
    } catch (e) {
      for (const row of chunk) {
        try {
          if (!dryRun) await upsertDiagnosisCodesByCode(client, [row], false);
          stats.upserted++;
        } catch (rowErr) {
          stats.errors++;
          logger.log(`THESAURUS CODE=${row[0]}: ${rowErr.message}`);
        }
      }
    }
    if ((i + chunk.length) % 2000 === 0 || i + chunk.length >= rows.length) {
      logger.log(`THESAURUS write progress: ${Math.min(i + chunk.length, rows.length)}/${rows.length}`);
    }
  }
  logger.log(
    `THESAURUS done: uniqueCodes=${rows.length} upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors} dryRun=${dryRun}`,
  );
}

async function importPatientDiagnosesEnrich(client, filePath, logger, stats, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const batchSize = options.batch ?? 200;
  const offset = options.offset ?? 0;
  const limit = options.limit ?? null;

  const thesaurusCsv = path.join(DOCS_DIR, 'DOCTORS', 'THESAURUS.csv');
  const diseasesCsv = path.join(DOCS_DIR, 'DOCTORS', 'DISEASES.csv');
  const thIdToIcd = new Map();
  const thIdToName = new Map();
  const disIdToCode = new Map();
  const disIdToName = new Map();

  if (fs.existsSync(thesaurusCsv)) {
    for await (const { row } of streamCsvRows(thesaurusCsv)) {
      const id = toPositiveInt(row.THESAURUS_ID);
      if (id === null) continue;
      const icd = emptyToNull(row.ICD_CODE);
      if (icd) thIdToIcd.set(id, truncateStr(icd, 40));
      const label =
        emptyToNull(row.ICD_LABLE) ||
        emptyToNull(row.ICD_LABEL) ||
        emptyToNull(row.TERMS);
      if (label) thIdToName.set(id, truncateStr(label, 255));
    }
  }
  if (fs.existsSync(diseasesCsv)) {
    for await (const { row } of streamCsvRows(diseasesCsv)) {
      const id = toPositiveInt(row.DISEASE_ID);
      if (id === null) continue;
      const code = truncateStr(emptyToNull(row.CODE) || `DIS-${id}`, 40);
      disIdToCode.set(id, code);
      disIdToName.set(
        id,
        truncateStr(emptyToNull(row.DISEASE_NAME) || emptyToNull(row.DESCRIPTION) || `Disease ${id}`, 255),
      );
    }
  }
  logger.log(
    `ENRICH csv maps: thesaurusWithIcd=${thIdToIcd.size} thesaurusNames=${thIdToName.size} diseaseIds=${disIdToCode.size}`,
  );

  const codeRes = await client.query(
    `SELECT "CODE", "NAME", "SYSTEM", "ICPC_CODE", "LEGACY_THESAURUS_ID", "LEGACY_DISEASE_ID"
     FROM "DIAGNOSIS_CODES"`,
  );
  const byCode = new Map();
  for (const r of codeRes.rows) byCode.set(String(r.CODE), r);
  logger.log(`ENRICH catalog codes loaded=${byCode.size}`);

  let seen = 0;
  let considered = 0;
  let batch = [];

  const flush = async () => {
    if (batch.length === 0) return;
    if (dryRun) {
      stats.upserted += batch.length;
      batch = [];
      return;
    }
    for (const item of batch) {
      try {
        const result = await client.query(
          `UPDATE "PATIENT_DIAGNOSES"
           SET "CODE" = $2,
               "NAME" = $3,
               "SYSTEM" = $4,
               "UPDATED_BY" = 'legacy-enrich',
               "UPDATED_DATE" = NOW()
           WHERE "PATIENT_DIAGNOSIS_ID" = $1
             AND (
               "CODE" LIKE 'TH-%' OR "CODE" LIKE 'DIS-%' OR "CODE" LIKE 'LEG-%'
               OR "NAME" LIKE 'Thesaurus diagnosis %'
               OR "NAME" LIKE 'Disease %'
               OR "NAME" LIKE 'Legacy diagnosis %'
             )`,
          [item.id, item.code, item.name, item.system],
        );
        if ((result.rowCount ?? 0) > 0) stats.upserted++;
        else stats.skipped++;
      } catch (e) {
        stats.errors++;
        logger.log(`ENRICH PATIENT_DIAGNOSIS_ID=${item.id}: ${e.message}`);
      }
    }
    batch = [];
  };

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    seen++;
    if (seen <= offset) continue;
    if (limit !== null && considered >= limit) break;
    considered++;

    const diagnosisId = toInt(row.DIAGNOSIS_ID);
    if (diagnosisId === null) {
      stats.skipped++;
      continue;
    }
    const thesaurusId = toPositiveInt(row.THESAURUS_ID);
    const diseaseId = toPositiveInt(row.DISEASE_ID);

    let resolvedCode = null;
    let fallbackName = null;
    let system = 'ICD-11';
    if (thesaurusId !== null && thIdToIcd.has(thesaurusId)) {
      resolvedCode = thIdToIcd.get(thesaurusId);
      fallbackName = thIdToName.get(thesaurusId) || `Thesaurus diagnosis ${thesaurusId}`;
    } else if (diseaseId !== null && disIdToCode.has(diseaseId)) {
      resolvedCode = disIdToCode.get(diseaseId);
      fallbackName = disIdToName.get(diseaseId) || `Disease ${diseaseId}`;
      system = emptyToNull(row.CODE) ? 'ICD-11' : 'Local';
    } else if (thesaurusId !== null && thIdToName.has(thesaurusId)) {
      // No ICD in thesaurus — still replace synthetic name with real terms
      resolvedCode = `TH-${thesaurusId}`;
      fallbackName = thIdToName.get(thesaurusId);
      system = 'Local';
    }

    if (!resolvedCode) {
      stats.skipped++;
      continue;
    }

    const catalog = byCode.get(resolvedCode);
    const code = truncateStr(catalog ? String(catalog.CODE) : resolvedCode, 40);
    const name = truncateStr(
      catalog ? String(catalog.NAME) : fallbackName || resolvedCode,
      255,
    );
    if (catalog) system = String(catalog.SYSTEM || system);

    batch.push({
      id: diagnosisId,
      code,
      name,
      system,
      lineNo,
    });
    if (batch.length >= batchSize) {
      await flush();
      if (considered % 2000 === 0) {
        logger.log(
          `ENRICH progress: considered=${considered} updated=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors}`,
        );
      }
    }
  }
  await flush();
  logger.log(
    `ENRICH pass1 done: updated=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors} dryRun=${dryRun}`,
  );

  // Pass 2: free-text NAME → catalog CODE (exact / alias / shortest prefix)
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
  const byExact = new Map();
  const byCodeLookup = new Map();
  const prefixBuckets = new Map();
  for (const r of codeRes.rows) {
    byCodeLookup.set(String(r.CODE), r);
    const key = String(r.NAME).trim().toLowerCase();
    if (!byExact.has(key)) byExact.set(key, r);
    if (key.length >= 3) {
      const pref = key.slice(0, 3);
      if (!prefixBuckets.has(pref)) prefixBuckets.set(pref, []);
      prefixBuckets.get(pref).push(r);
    }
  }
  for (const [alias, code] of ALIASES) {
    if (byCodeLookup.has(code) && !byExact.has(alias)) {
      byExact.set(alias, byCodeLookup.get(code));
    }
  }
  const resolveName = (name) => {
    const n = String(name || '').trim().toLowerCase();
    if (n.length < 3) return null;
    if (byExact.has(n)) return byExact.get(n);
    const bucket = prefixBuckets.get(n.slice(0, 3)) || [];
    let best = null;
    for (const r of bucket) {
      const cn = String(r.NAME).trim().toLowerCase();
      if (cn === n || cn.startsWith(`${n},`) || cn.startsWith(`${n} `)) {
        if (!best || cn.length < String(best.NAME).length) best = r;
      }
    }
    return best;
  };

  const synth = await client.query(`
    SELECT "PATIENT_DIAGNOSIS_ID", "NAME"
    FROM "PATIENT_DIAGNOSES"
    WHERE "CODE" LIKE 'LEG-%' OR "CODE" LIKE 'TH-%' OR "CODE" LIKE 'DIS-%'
  `);
  let pass2 = 0;
  if (dryRun) {
    for (const row of synth.rows) {
      if (resolveName(row.NAME)) pass2++;
    }
    stats.upserted += pass2;
    logger.log(`ENRICH pass2 dryRun would-update=${pass2} of ${synth.rows.length}`);
    return;
  }
  for (const row of synth.rows) {
    const hit = resolveName(row.NAME);
    if (!hit) continue;
    try {
      const result = await client.query(
        `UPDATE "PATIENT_DIAGNOSES"
         SET "CODE" = $2, "SYSTEM" = $3, "UPDATED_BY" = 'legacy-enrich-name', "UPDATED_DATE" = NOW()
         WHERE "PATIENT_DIAGNOSIS_ID" = $1
           AND ("CODE" LIKE 'LEG-%' OR "CODE" LIKE 'TH-%' OR "CODE" LIKE 'DIS-%')`,
        [row.PATIENT_DIAGNOSIS_ID, hit.CODE, hit.SYSTEM || 'ICD-11'],
      );
      if ((result.rowCount ?? 0) > 0) {
        pass2++;
        stats.upserted++;
      }
    } catch (e) {
      stats.errors++;
      logger.log(`ENRICH pass2 id=${row.PATIENT_DIAGNOSIS_ID}: ${e.message}`);
    }
  }
  logger.log(
    `ENRICH pass2 name-match updated=${pass2}; totals upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors}`,
  );
}

async function loadConsumableTypeMap(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;
  for await (const { row } of streamCsvRows(filePath)) {
    const id = toInt(row.DRUG_CONSUMABLE_TYPE_ID);
    const name = emptyToNull(row.DRUG_CONSUMABLE_NAME);
    if (id !== null && name) map.set(id, name);
    if (name) map.set(String(name).toLowerCase(), name);
  }
  return map;
}

function isPharmacyItem(row) {
  const itemType = String(emptyToNull(row.ITEM_TYPE) ?? '').trim().toLowerCase();
  if (itemType === 'pharmacy') return true;
  if (isTruthyFlag(row.IS_MEDICATION)) return true;
  return false;
}

async function upsertDrugByLegacyItemId(client, values, dryRun) {
  if (dryRun) return;
  const columns = [
    'NAME',
    'GENERIC_NAME',
    'CATEGORY',
    'FORM',
    'STRENGTH',
    'UNIT',
    'UNIT_PRICE',
    'REORDER_LEVEL',
    'STATUS',
    'LEGACY_ITEM_ID',
    'CREATED_BY',
    'CREATED_DATE',
    'UPDATED_BY',
    'UPDATED_DATE',
  ];
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const updates = columns
    .filter((c) => c !== 'LEGACY_ITEM_ID' && c !== 'CREATED_BY' && c !== 'CREATED_DATE')
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');
  const sql = `INSERT INTO "DRUGS" (${colList}) VALUES (${placeholders})
    ON CONFLICT ("LEGACY_ITEM_ID") DO UPDATE SET ${updates}`;
  await client.query(sql, values);
}

async function importPharmacyItems(client, filePath, logger, stats, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const batchSize = options.batch ?? 100;
  const offset = options.offset ?? 0;
  const limit = options.limit ?? null;
  const consumablePath =
    options.consumableTypesPath ||
    path.join(DOCS_DIR, 'PHAMACY', 'DRUG_CONSUMABLE_TYPES.csv');
  const consumableMap = await loadConsumableTypeMap(consumablePath);
  logger.log(
    `PHARMACY_ITEMS openingStockPolicy=${PHARMACY_OPENING_STOCK_POLICY} consumableTypes=${consumableMap.size / 2}`,
  );

  let seen = 0;
  let considered = 0;
  let batch = [];

  const flush = async () => {
    if (batch.length === 0) return;
    for (const item of batch) {
      try {
        if (!dryRun) await upsertDrugByLegacyItemId(client, item.values, false);
        stats.upserted++;
      } catch (e) {
        stats.errors++;
        logger.log(`DRUGS line ${item.lineNo} ITEM_ID=${item.itemId}: ${e.message}`);
      }
    }
    batch = [];
  };

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    seen++;
    if (seen <= offset) continue;
    if (limit !== null && considered >= limit) break;
    considered++;

    const itemId = toInt(row.ITEM_ID);
    const name = emptyToNull(row.ITEM_NAME);
    if (itemId === null || !name) {
      stats.skipped++;
      continue;
    }
    if (!isPharmacyItem(row)) {
      stats.skipped++;
      continue;
    }

    const drugTypeRaw = emptyToNull(row.DRUG_TYPE);
    const drugTypeId = toInt(drugTypeRaw);
    let category = null;
    if (drugTypeId !== null && consumableMap.has(drugTypeId)) {
      category = consumableMap.get(drugTypeId);
    } else if (drugTypeRaw && consumableMap.has(String(drugTypeRaw).toLowerCase())) {
      category = consumableMap.get(String(drugTypeRaw).toLowerCase());
    } else {
      category = truncateStr(drugTypeRaw || emptyToNull(row.ITEM_CATEGORY) || 'Pharmacy', 100);
    }

    const unitPrice = toDecimal(row.SELLING_PRICE) ?? toDecimal(row.PURCHASE_PRICE) ?? '0';
    let reorder = toInt(row.OUT_OF_STOCK_LEVEL) ?? 0;
    if (reorder < 0) reorder = 0;
    if (reorder > 2_147_483_647) reorder = 2_147_483_647;
    const status = isDiscontinuedFlag(row.DISCONTINUE_FLAG) ? 'Discontinued' : 'Active';
    const now = new Date();
    const created =
      parseOracleTimestamp(row.CREATED_DATE) || parseLegacyDate(row.CREATED_DATE) || now;
    const updated =
      parseOracleTimestamp(row.UPDATED_DATE) || parseLegacyDate(row.UPDATED_DATE) || created;

    batch.push({
      lineNo,
      itemId,
      values: [
        truncateStr(name, 255),
        truncateStr(emptyToNull(row.GENERIC_NAME), 255),
        category,
        truncateStr(emptyToNull(row.DRUG_TYPE) || emptyToNull(row.SUB_ITEM_TYPE), 50),
        truncateStr(emptyToNull(row.DRUG_STRENGTH), 100),
        truncateStr(emptyToNull(row.UOM) || emptyToNull(row.ITEM_DISPENSED_IN), 50),
        unitPrice,
        reorder,
        status,
        itemId,
        emptyToNull(row.CREATED_BY) || 'legacy-csv',
        created,
        emptyToNull(row.UPDATED_BY) || 'legacy-csv',
        updated,
      ],
    });

    // Opening stock intentionally skipped (Phase 0 policy = skip)
    if (PHARMACY_OPENING_STOCK_POLICY !== 'skip' && emptyToNull(row.BALANCE)) {
      logger.log(`ITEM_ID=${itemId}: balance ignored by policy=${PHARMACY_OPENING_STOCK_POLICY}`);
    }

    if (batch.length >= batchSize) {
      await flush();
      if (considered % 500 === 0) {
        logger.log(
          `PHARMACY_ITEMS progress: considered=${considered} upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors}`,
        );
      }
    }
  }
  await flush();
  logger.log(
    `PHARMACY_ITEMS done: upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors} dryRun=${dryRun}`,
  );
}

async function importDrugConsumableTypes(client, filePath, logger, stats, options = {}) {
  // Types are applied as DRUGS.CATEGORY during pharmacy_items import.
  // This importer verifies the file and logs the map size for audit completeness.
  const dryRun = Boolean(options.dryRun);
  const map = await loadConsumableTypeMap(filePath);
  const names = new Set();
  for (const [k, v] of map.entries()) {
    if (typeof k === 'number') names.add(v);
  }
  stats.upserted = names.size;
  logger.log(
    `DRUG_CONSUMABLE_TYPES loaded=${names.size} (applied via pharmacy_items CATEGORY; dryRun=${dryRun}; no separate table write)`,
  );
  if (names.size === 0) stats.skipped++;
}

function rowField(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return row[k];
    }
  }
  // Apostrophe / odd header fallbacks
  for (const key of Object.keys(row)) {
    const norm = key.replace(/['"]/g, '').toUpperCase();
    for (const k of keys) {
      if (norm === String(k).replace(/['"]/g, '').toUpperCase()) return row[key];
    }
  }
  return null;
}

function resolveAuthorId(row, userIds) {
  const candidates = [
    toPositiveInt(rowField(row, 'DOCTOR_ID', 'USER_ID', "DOCTOR'S_CODE_NO", 'DOCTORS_CODE_NO')),
    toPositiveInt(rowField(row, 'CREATED_BY')),
    toPositiveInt(rowField(row, 'UPDATED_BY')),
  ];
  for (const id of candidates) {
    if (id !== null && userIds.has(id)) return id;
  }
  return null;
}

async function upsertClinicalNoteByNoteNo(client, values, dryRun) {
  if (dryRun) return;
  await upsertClinicalNotesBatch(client, [values]);
}

async function upsertClinicalNotesBatch(client, rows) {
  if (rows.length === 0) return;
  const columns = [
    'NOTE_NO',
    'PERSON_ID',
    'ENCOUNTER_ID',
    'AUTHOR_ID',
    'NOTE_TYPE',
    'CLINIC',
    'STATUS',
    'PRIORITY',
    'FIELDS',
    'VERSION',
    'SIGNED_AT',
    'SIGNED_BY_ID',
    'SIGNED_BY',
    'CREATED_BY_ID',
    'CREATED_BY',
    'CREATED_DATE',
    'UPDATED_BY_ID',
    'UPDATED_BY',
    'UPDATED_DATE',
  ];
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const updates = columns
    .filter((c) => c !== 'NOTE_NO' && c !== 'CREATED_BY_ID' && c !== 'CREATED_BY' && c !== 'CREATED_DATE')
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');
  const values = [];
  const tuples = rows
    .map((rowValues, rowIdx) => {
      const placeholders = columns.map((_, colIdx) => {
        values.push(rowValues[colIdx]);
        return `$${rowIdx * columns.length + colIdx + 1}`;
      });
      return `(${placeholders.join(', ')})`;
    })
    .join(', ');
  const sql = `INSERT INTO "CLINICAL_NOTES" (${colList}) VALUES ${tuples}
    ON CONFLICT ("NOTE_NO") DO UPDATE SET ${updates}`;
  await client.query(sql, values);
}

async function importNoteCsvFile(
  client,
  filePath,
  logger,
  stats,
  options,
  {
    idColumn,
    noteType,
    noteNoPrefix,
    bodyColumns,
    personIds,
    userIds,
  },
) {
  if (!fs.existsSync(filePath)) {
    logger.log(`SKIP missing file ${filePath}`);
    return;
  }
  const dryRun = Boolean(options.dryRun);
  const offset = options.offset ?? 0;
  const limit = options.limit ?? null;
  const batchSize = options.batch ?? 100;
  let seen = 0;
  let considered = 0;
  let batch = [];

  const flush = async () => {
    if (batch.length === 0) return;
    try {
      if (!dryRun) await upsertClinicalNotesBatch(client, batch);
      stats.upserted += batch.length;
    } catch (e) {
      for (const values of batch) {
        try {
          if (!dryRun) await upsertClinicalNotesBatch(client, [values]);
          stats.upserted++;
        } catch (rowErr) {
          stats.errors++;
          logger.log(`${noteType} NOTE_NO=${values[0]}: ${rowErr.message}`);
        }
      }
    }
    batch = [];
  };

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    seen++;
    if (seen <= offset) continue;
    if (limit !== null && considered >= limit) break;
    considered++;

    const legacyId = toPositiveInt(rowField(row, idColumn));
    const personId = toPositiveInt(rowField(row, 'PERSON_ID'));
    const body =
      emptyToNull(rowField(row, ...bodyColumns)) ||
      emptyToNull(rowField(row, 'NOTE_AREA', 'DETAILS', 'DESCRIPTION', 'COMMENT_NOTE'));

    if (legacyId === null) {
      stats.skipped++;
      continue;
    }
    if (personId === null || !personIds.has(personId)) {
      stats.skipped++;
      continue;
    }
    if (!body) {
      stats.skipped++;
      continue;
    }
    const authorId = resolveAuthorId(row, userIds);
    if (authorId === null) {
      stats.skipped++;
      if (stats.skipped <= 20 || stats.skipped % 500 === 0) {
        logger.log(
          `${noteType} line ${lineNo} id=${legacyId}: skip unresolved AUTHOR (person=${personId})`,
        );
      }
      continue;
    }

    const created =
      parseOracleTimestamp(rowField(row, 'CREATED_DATE', 'EXAM_DATE', 'COMPLAINT_DATE', 'DATE_TIME', 'ISSUED_DATE')) ||
      parseLegacyDate(rowField(row, 'CREATED_DATE', 'EXAM_DATE', 'COMPLAINT_DATE', 'DATE_TIME', 'ISSUED_DATE')) ||
      new Date();
    const noteNo = truncateStr(`${noteNoPrefix}-${legacyId}`, 50);
    const fields = {
      Narrative: body,
      legacySource: noteType,
      legacyId,
      admissionId: toPositiveInt(rowField(row, 'ADMISSION_ID')),
      msgLogId: toPositiveInt(rowField(row, 'MSG_LOG_ID')),
      action: emptyToNull(rowField(row, 'ACTION')),
      requestLocation: emptyToNull(rowField(row, 'REQUEST_LOCATION')),
      imported: true,
    };
    if (options.extraFieldsBuilder) {
      Object.assign(fields, options.extraFieldsBuilder(row) || {});
    }

    batch.push([
      noteNo,
      personId,
      null,
      authorId,
      noteType,
      truncateStr(emptyToNull(rowField(row, 'REQUEST_LOCATION', 'CLINIC', 'HISTORY_TYPE')), 100),
      'Signed',
      'Routine',
      fields,
      1,
      created,
      authorId,
      String(authorId),
      authorId,
      String(authorId),
      created,
      authorId,
      String(authorId),
      created,
    ]);

    if (batch.length >= batchSize) {
      await flush();
      if (considered % 2000 === 0) {
        logger.log(
          `${noteType} progress: considered=${considered} upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors}`,
        );
      }
    }
  }
  await flush();
}

async function importLegacyClinicalNotesPilot(client, filePath, logger, stats, options = {}) {
  const dir =
    fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
      ? filePath
      : path.dirname(filePath);
  const personIds = await loadIdSet(client, 'PERSONS', 'PERSON_ID');
  const userIds = await loadIdSet(client, 'USERS', 'USER_ID');
  logger.log(`PILOT authors/users=${userIds.size} persons=${personIds.size} dir=${dir}`);

  const local = { upserted: 0, skipped: 0, errors: 0 };
  await importNoteCsvFile(client, path.join(dir, 'P_EXAM.csv'), logger, local, options, {
    idColumn: 'P_EXAM_ID',
    noteType: 'Physical Exam',
    noteNoPrefix: 'LEG-PEXAM',
    bodyColumns: ['DESCRIPTION'],
    personIds,
    userIds,
  });
  await importNoteCsvFile(client, path.join(dir, 'OLD_HISTORY.csv'), logger, local, options, {
    idColumn: 'OLD_HISTORY_ID',
    noteType: 'Past Medical History',
    noteNoPrefix: 'LEG-OHIST',
    bodyColumns: ['DETAILS'],
    personIds,
    userIds,
  });
  await importNoteCsvFile(client, path.join(dir, 'CALL_NOTE.csv'), logger, local, options, {
    idColumn: 'CALL_NOTE_ID',
    noteType: 'Call Note',
    noteNoPrefix: 'LEG-CALL',
    bodyColumns: ['NOTE_AREA'],
    personIds,
    userIds,
  });
  stats.upserted += local.upserted;
  stats.skipped += local.skipped;
  stats.errors += local.errors;
  logger.log(
    `PILOT done: upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors} dryRun=${Boolean(options.dryRun)}`,
  );
}

async function loadComplaintDetailsMap(detailsPath) {
  const map = new Map();
  if (!fs.existsSync(detailsPath)) return map;
  for await (const { row } of streamCsvRows(detailsPath)) {
    const complaintId = toPositiveInt(row.COMPLAINT_ID);
    if (complaintId === null) continue;
    const title = emptyToNull(row.P_TITLE);
    const value = emptyToNull(row.P_VALUE);
    if (!title && !value) continue;
    if (!map.has(complaintId)) map.set(complaintId, []);
    map.get(complaintId).push({
      title: title || '',
      value: value || '',
      note: emptyToNull(row.P_NOTE),
      control: emptyToNull(row.CONTROL),
    });
  }
  return map;
}

async function importComplaints(client, filePath, logger, stats, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const personIds = await loadIdSet(client, 'PERSONS', 'PERSON_ID');
  const userIds = await loadIdSet(client, 'USERS', 'USER_ID');
  const detailsPath = path.join(path.dirname(filePath), 'COMPLAINT_DETAILS.csv');
  const detailsMap = await loadComplaintDetailsMap(detailsPath);
  logger.log(
    `COMPLAINTS detailsLoaded=${detailsMap.size} persons=${personIds.size} users=${userIds.size}`,
  );

  await importNoteCsvFile(
    client,
    filePath,
    logger,
    stats,
    {
      ...options,
      extraFieldsBuilder: (row) => {
        const id = toPositiveInt(row.COMPLAINT_ID);
        const details = id !== null ? detailsMap.get(id) : undefined;
        return {
          details: details || [],
          genericTemplateId: toPositiveInt(row.GENERIC_TEMPLATE_ID),
          historyType: emptyToNull(row.HISTORY_TYPE),
          historyOfComplaints: emptyToNull(row.HISTORY_OF_COMPIANTS),
        };
      },
    },
    {
      idColumn: 'COMPLAINT_ID',
      noteType: 'Legacy Complaint',
      noteNoPrefix: 'LEG-COMP',
      bodyColumns: ['DESCRIPTION'],
      personIds,
      userIds,
    },
  );
  logger.log(
    `COMPLAINTS done: upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors} dryRun=${dryRun}`,
  );
}

async function importClinicalNoteTemplates(client, filePath, logger, stats, options = {}) {
  const dryRun = Boolean(options.dryRun);
  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const legacyId = toPositiveInt(row.GENERIC_TEMPLATE_ID);
    const name = emptyToNull(row.TEMPLATE_NAME);
    if (legacyId === null || !name) {
      stats.skipped++;
      continue;
    }
    const code = truncateStr(`LEG-TPL-${legacyId}`, 80);
    const content = emptyToNull(row.CONTENT);
    const templateType = truncateStr(emptyToNull(row.TEMPLATE_TYPE) || 'CLINICAL NOTE', 100);
    const now = new Date();
    const status = content ? 'Active' : 'Inactive';
    if (dryRun) {
      stats.upserted++;
      continue;
    }
    try {
      await client.query(
        `INSERT INTO "CLINICAL_NOTE_TEMPLATES"
          ("LEGACY_TEMPLATE_ID","CODE","NAME","TEMPLATE_TYPE","CONTENT_HTML","STATUS","CREATED_BY","CREATED_DATE","UPDATED_BY","UPDATED_DATE")
         VALUES ($1,$2,$3,$4,$5,$6,'legacy-csv',$7,'legacy-csv',$7)
         ON CONFLICT ("LEGACY_TEMPLATE_ID") DO UPDATE SET
           "CODE" = EXCLUDED."CODE",
           "NAME" = EXCLUDED."NAME",
           "TEMPLATE_TYPE" = EXCLUDED."TEMPLATE_TYPE",
           "CONTENT_HTML" = EXCLUDED."CONTENT_HTML",
           "STATUS" = EXCLUDED."STATUS",
           "UPDATED_BY" = EXCLUDED."UPDATED_BY",
           "UPDATED_DATE" = EXCLUDED."UPDATED_DATE"`,
        [legacyId, code, truncateStr(name, 255), templateType, content, status, now],
      );
      stats.upserted++;
    } catch (e) {
      stats.errors++;
      logger.log(`TEMPLATE line ${lineNo} id=${legacyId}: ${e.message}`);
    }
  }
  logger.log(
    `TEMPLATES done: upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors} dryRun=${dryRun}`,
  );
}

async function importProphylactics(client, filePath, logger, stats, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const personIds = await loadIdSet(client, 'PERSONS', 'PERSON_ID');
  const userIds = await loadIdSet(client, 'USERS', 'USER_ID');
  const drugs = await client.query(`SELECT "DRUG_ID", "NAME", "GENERIC_NAME" FROM "DRUGS"`);
  const drugByName = new Map();
  for (const d of drugs.rows) {
    const keys = [d.NAME, d.GENERIC_NAME].filter(Boolean).map((s) => String(s).trim().toLowerCase());
    for (const k of keys) if (!drugByName.has(k)) drugByName.set(k, d);
  }
  // Prefer any existing user as author for prophylactics (no doctor column)
  let fallbackAuthor = null;
  for (const id of userIds) {
    fallbackAuthor = id;
    break;
  }
  if (fallbackAuthor === null) {
    logger.log('PROPHYLACTICS abort: no USERS for AUTHOR_ID');
    stats.errors++;
    return;
  }
  logger.log(`PROPHYLACTICS fallbackAuthor=${fallbackAuthor} drugsIndexed=${drugByName.size}`);

  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const legacyId = toPositiveInt(row.PROPHYLATICS_DRUGS_ID);
    const personId = toPositiveInt(row.PERSON_ID);
    const drugName = emptyToNull(row.DRUG_NAME);
    if (legacyId === null || !drugName) {
      stats.skipped++;
      continue;
    }
    if (personId === null || !personIds.has(personId)) {
      stats.skipped++;
      continue;
    }
    const matched = drugByName.get(drugName.toLowerCase()) || null;
    const created = parseLegacyDate(row.ISSUED_DATE) || new Date();
    const authorId =
      toPositiveInt(row.CREATED_BY) && userIds.has(toPositiveInt(row.CREATED_BY))
        ? toPositiveInt(row.CREATED_BY)
        : fallbackAuthor;
    const noteNo = truncateStr(`LEG-PROPH-${legacyId}`, 50);
    const fields = {
      Narrative: `Prophylactic drug: ${drugName}`,
      drugName,
      matchedDrugId: matched ? matched.DRUG_ID : null,
      matchedDrugName: matched ? matched.NAME : null,
      issuedDate: emptyToNull(row.ISSUED_DATE),
      caseFileId: toPositiveInt(row.CASE_FILE_ID),
      imported: true,
      legacySource: 'PROPHYLATICS_DRUGS',
    };
    const values = [
      noteNo,
      personId,
      null,
      authorId,
      'Prophylactic Drugs',
      null,
      'Signed',
      'Routine',
      fields,
      1,
      created,
      authorId,
      String(authorId),
      authorId,
      String(authorId),
      created,
      authorId,
      String(authorId),
      created,
    ];
    try {
      if (!dryRun) await upsertClinicalNoteByNoteNo(client, values, false);
      stats.upserted++;
    } catch (e) {
      stats.errors++;
      logger.log(`PROPHYLACTICS line ${lineNo} id=${legacyId}: ${e.message}`);
    }
  }
  logger.log(
    `PROPHYLACTICS done: upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors} dryRun=${Boolean(options.dryRun)}`,
  );
}

async function importLegacyComments(client, filePath, logger, stats, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const personIds = await loadIdSet(client, 'PERSONS', 'PERSON_ID');
  const userIds = await loadIdSet(client, 'USERS', 'USER_ID');

  // Build MSG_LOG_ID → PERSON_ID from complaints + p_exam for person linkage
  const msgToPerson = new Map();
  const complaintsPath = path.join(DOCS_DIR, 'DOCTORS', 'COMPLAINTS.csv');
  const pexamPath = path.join(DOCS_DIR, 'DOCTORS', 'P_EXAM.csv');
  for (const src of [complaintsPath, pexamPath]) {
    if (!fs.existsSync(src)) continue;
    for await (const { row } of streamCsvRows(src)) {
      const msg = toPositiveInt(row.MSG_LOG_ID);
      const personId = toPositiveInt(row.PERSON_ID);
      if (msg !== null && personId !== null && personIds.has(personId) && !msgToPerson.has(msg)) {
        msgToPerson.set(msg, personId);
      }
    }
  }
  logger.log(`COMMENTS msgLog→person map size=${msgToPerson.size}`);

  let heldNoPerson = 0;
  for await (const { row, lineNo } of streamCsvRows(filePath)) {
    const legacyId = toPositiveInt(row.COMMENT_ID);
    const body = emptyToNull(row.COMMENT_NOTE);
    if (legacyId === null || !body) {
      stats.skipped++;
      continue;
    }
    const msg = toPositiveInt(row.MSG_LOG_ID);
    const personId = msg !== null ? msgToPerson.get(msg) ?? null : null;
    if (personId === null) {
      heldNoPerson++;
      stats.skipped++;
      continue;
    }
    const authorId = resolveAuthorId(row, userIds);
    if (authorId === null) {
      stats.skipped++;
      continue;
    }
    const created =
      parseLegacyDate(row.CREATED_DATE) || parseOracleTimestamp(row.CREATED_DATE) || new Date();
    const noteNo = truncateStr(`LEG-CMT-${legacyId}`, 50);
    const fields = {
      Narrative: body,
      legacySource: 'COMMENTS',
      legacyId,
      msgLogId: msg,
      requestDetailId: toPositiveInt(row.REQUEST_DETAIL_ID),
      imported: true,
    };
    const values = [
      noteNo,
      personId,
      null,
      authorId,
      'Legacy Comment',
      null,
      'Signed',
      'Routine',
      fields,
      1,
      created,
      authorId,
      String(authorId),
      authorId,
      String(authorId),
      created,
      authorId,
      String(authorId),
      created,
    ];
    try {
      if (!dryRun) await upsertClinicalNoteByNoteNo(client, values, false);
      stats.upserted++;
    } catch (e) {
      stats.errors++;
      logger.log(`COMMENTS line ${lineNo} id=${legacyId}: ${e.message}`);
    }
  }
  logger.log(
    `COMMENTS done: upserted=${stats.upserted} skipped=${stats.skipped} heldNoPerson=${heldNoPerson} errors=${stats.errors} dryRun=${dryRun}`,
  );
}

const IMPORTERS = {
  user_types: importUserTypes,
  roles: importRoles,
  wards: importWards,
  departments: importDepartments,
  clinics: importClinics,
  doctors: importDoctors,
  users: importUsers,
  persons: importPersons,
  follow_ups: importFollowUps,
  admissions: importAdmissions,
  nursing_care_plans: importNursingCarePlans,
  nursing_notes: importNursingNotes,
  patient_diagnoses: importPatientDiagnoses,
  nurse_shift_reports: importNurseShiftReports,
  drug_chart: importDrugChart,
  drug_chart_details: importDrugChartDetails,
  fluids: importFluids,
  diseases: importDiseases,
  thesaurus: importThesaurus,
  patient_diagnoses_enrich: importPatientDiagnosesEnrich,
  pharmacy_items: importPharmacyItems,
  drug_consumable_types: importDrugConsumableTypes,
  legacy_clinical_notes_pilot: importLegacyClinicalNotesPilot,
  complaints: importComplaints,
  clinical_note_templates: importClinicalNoteTemplates,
  prophylactics: importProphylactics,
  legacy_comments: importLegacyComments,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const logger = createLogger(runId);
  logger.log(
    `Start migrate-legacy-csv only=${args.only.join(',')} offset=${args.offset} limit=${args.limit ?? 'none'} batch=${args.batch} dryRun=${args.dryRun} from=${args.from ?? 'default'} path=${args.path ?? 'default'}`,
  );

  const client = buildPgClient();
  await client.connect();
  logger.log('Connected to PostgreSQL');

  try {
    for (const table of args.only) {
      const filePath = resolveCsvPath(table, args);
      if (!fs.existsSync(filePath)) {
        logger.log(`SKIP ${table}: file not found ${filePath}`);
        continue;
      }
      const stats = { upserted: 0, skipped: 0, errors: 0 };
      logger.log(`--- Importing ${table} from ${filePath} ---`);
      const importer = IMPORTERS[table];
      const opts = {
        offset: args.offset,
        limit: args.limit,
        batch: args.batch,
        dryRun: args.dryRun,
      };
      if (table === 'persons') {
        await importer(client, filePath, logger, stats, opts);
      } else if (DOCTOR_PHARMACY_TABLES.includes(table)) {
        await importer(client, filePath, logger, stats, opts);
      } else {
        await importer(client, filePath, logger, stats);
      }
      logger.log(
        `${table}: upserted=${stats.upserted} skipped=${stats.skipped} errors=${stats.errors}`,
      );
    }
  } finally {
    await client.end().catch(() => undefined);
    logger.log(`Done. Log: ${logger.path}`);
    await logger.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
