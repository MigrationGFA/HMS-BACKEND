#!/usr/bin/env node
import fs from 'node:fs';
import pg from 'pg';
import 'dotenv/config';

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

const lines = fs.readFileSync('Migration-Documents/DIAGNOSIS.csv', 'utf8').split(/\r?\n/).filter(Boolean);
const hdr = splitCsvLine(lines[0]);
const idx = (n) => hdr.indexOf(n);

const stats = {
  total: lines.length - 1,
  hasDesc: 0,
  hasThesaurus: 0,
  hasDisease: 0,
  neither: 0,
  categories: {},
  statuses: {},
  primary: 0,
  withAdmission: 0,
  admissionLow: 0,
  minId: Infinity,
  maxId: 0,
  minPerson: Infinity,
  maxPerson: 0,
  personIds: new Set(),
};

for (let i = 1; i < lines.length; i++) {
  const cols = splitCsvLine(lines[i]);
  const get = (n) => (cols[idx(n)] ?? '').trim();
  const id = +get('DIAGNOSIS_ID');
  const pid = +get('PERSON_ID');
  const desc = get('DESCRIPTION');
  const th = get('THESAURUS_ID');
  const dis = get('DISEASE_ID');
  const cat = get('DIAGNOSIS_CATEGORY') || '(empty)';
  const st = get('STATUS') || '(empty)';
  const adm = +get('ADMISSION_ID');

  if (desc) stats.hasDesc++;
  if (th) stats.hasThesaurus++;
  if (dis) stats.hasDisease++;
  if (!desc && !th && !dis) stats.neither++;
  stats.categories[cat] = (stats.categories[cat] || 0) + 1;
  stats.statuses[st] = (stats.statuses[st] || 0) + 1;
  if (get('IS_PRIMARY')) stats.primary++;
  if (adm) {
    stats.withAdmission++;
    if (adm < 100) stats.admissionLow++;
  }
  stats.minId = Math.min(stats.minId, id);
  stats.maxId = Math.max(stats.maxId, id);
  stats.minPerson = Math.min(stats.minPerson, pid);
  stats.maxPerson = Math.max(stats.maxPerson, pid);
  stats.personIds.add(pid);
}

const url = process.env.DATABASE_URL || process.env.DATABASE_URL_PRISMA;
let dbStats = null;
if (url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const personCount = stats.personIds.size;
  const { rows: missingPersons } = await client.query(
    `SELECT COUNT(*)::int AS c FROM unnest($1::int[]) AS pid
     WHERE NOT EXISTS (SELECT 1 FROM "PERSONS" p WHERE p."PERSON_ID" = pid)`,
    [[...stats.personIds]],
  );
  const { rows: existingDx } = await client.query('SELECT COUNT(*)::int AS c, MIN("PATIENT_DIAGNOSIS_ID") AS min_id, MAX("PATIENT_DIAGNOSIS_ID") AS max_id FROM "PATIENT_DIAGNOSES"');
  const { rows: existingAdm } = await client.query('SELECT COUNT(*)::int AS c FROM "ADMISSIONS" WHERE "ADMISSION_ID" >= 100');
  await client.end();
  dbStats = {
    uniquePersonsInCsv: personCount,
    missingPersons: missingPersons[0].c,
    patientDiagnosesCount: existingDx[0].c,
    patientDiagnosesIdRange: [existingDx[0].min_id, existingDx[0].max_id],
    admissionsGte100: existingAdm[0].c,
  };
}

console.log(
  JSON.stringify(
    {
      ...stats,
      personIds: stats.personIds.size,
      dbStats,
    },
    null,
    2,
  ),
);
