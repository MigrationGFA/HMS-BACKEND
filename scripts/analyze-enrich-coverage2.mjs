#!/usr/bin/env node
import fs from 'node:fs';
import readline from 'node:readline';

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

const thWithIcd = new Map();
const thTerms = new Map();
for await (const row of streamCsvRows('Migration-Documents/DOCTORS/THESAURUS.csv')) {
  const id = pos(row.THESAURUS_ID);
  if (id === null) continue;
  const icd = String(row.ICD_CODE || '').trim();
  if (icd) thWithIcd.set(id, icd);
  thTerms.set(id, String(row.ICD_LABLE || row.TERMS || '').trim());
}
const disCode = new Map();
for await (const row of streamCsvRows('Migration-Documents/DOCTORS/DISEASES.csv')) {
  const id = pos(row.DISEASE_ID);
  if (id === null) continue;
  disCode.set(id, String(row.CODE || '').trim() || `DIS-${id}`);
}

let total = 0;
let viaTh = 0;
let viaDis = 0;
let viaTermsOnly = 0;
let unresolved = 0;
for await (const row of streamCsvRows('Migration-Documents/DOCTORS/DIAGNOSIS.csv')) {
  total++;
  const th = pos(row.THESAURUS_ID);
  const dis = pos(row.DISEASE_ID);
  if (th !== null && thWithIcd.has(th)) viaTh++;
  else if (dis !== null && disCode.has(dis)) viaDis++;
  else if (th !== null && thTerms.has(th)) viaTermsOnly++;
  else unresolved++;
}
console.log({ total, viaTh, viaDis, viaTermsOnly, unresolved, sum: viaTh + viaDis + viaTermsOnly + unresolved });
