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
const CLINICAL_TABLES = ['follow_ups', 'admissions', 'nursing_care_plans', 'nursing_notes'];
const ALL_TABLES = [...ALL_SMALL, 'departments', 'persons', ...CLINICAL_TABLES];

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
};

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
    }
  }
  if (!out.only) out.only = [...ALL_SMALL];
  for (const t of out.only) {
    if (!ALL_TABLES.includes(t)) {
      throw new Error(`Unknown table "${t}". Allowed: ${ALL_TABLES.join(', ')}, all-small, all`);
    }
  }
  return out;
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
  for await (const raw of rl) {
    lineNo++;
    const line = raw.replace(/^\uFEFF/, '');
    if (!line.trim()) continue;
    const cols = splitCsvLine(line);
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
    yield { row, lineNo };
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
  if (process.env.DATABASE_URL_PRISMA || process.env.DATABASE_URL) {
    return new pg.Client({
      connectionString: process.env.DATABASE_URL_PRISMA || process.env.DATABASE_URL,
      connectionTimeoutMillis: 30000,
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
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const logger = createLogger(runId);
  logger.log(`Start migrate-legacy-csv only=${args.only.join(',')} offset=${args.offset} limit=${args.limit ?? 'none'} batch=${args.batch}`);

  const client = buildPgClient();
  await client.connect();
  logger.log('Connected to PostgreSQL');

  try {
    for (const table of args.only) {
      const fileName = CSV_FILES[table];
      const filePath = path.join(DOCS_DIR, fileName);
      if (!fs.existsSync(filePath)) {
        logger.log(`SKIP ${table}: file not found ${filePath}`);
        continue;
      }
      const stats = { upserted: 0, skipped: 0, errors: 0 };
      logger.log(`--- Importing ${table} from ${fileName} ---`);
      const importer = IMPORTERS[table];
      if (table === 'persons') {
        await importer(client, filePath, logger, stats, {
          offset: args.offset,
          limit: args.limit,
          batch: args.batch,
        });
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
