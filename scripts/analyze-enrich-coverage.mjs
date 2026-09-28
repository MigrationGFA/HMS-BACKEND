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

const thWithIcd = new Set();
const thAll = new Set();
for await (const row of streamCsvRows('Migration-Documents/DOCTORS/THESAURUS.csv')) {
  const id = Number(row.THESAURUS_ID);
  if (!Number.isFinite(id)) continue;
  thAll.add(id);
  if (String(row.ICD_CODE || '').trim()) thWithIcd.add(id);
}
const disAll = new Set();
for await (const row of streamCsvRows('Migration-Documents/DOCTORS/DISEASES.csv')) {
  const id = Number(row.DISEASE_ID);
  if (Number.isFinite(id)) disAll.add(id);
}

let total = 0;
let hasTh = 0;
let hasDis = 0;
let thHitIcd = 0;
let thHitAny = 0;
let disHit = 0;
let resolvable = 0;
let neither = 0;
for await (const row of streamCsvRows('Migration-Documents/DOCTORS/DIAGNOSIS.csv')) {
  total++;
  const th = Number(row.THESAURUS_ID);
  const dis = Number(row.DISEASE_ID);
  const thOk = Number.isFinite(th);
  const disOk = Number.isFinite(dis);
  if (thOk) hasTh++;
  if (disOk) hasDis++;
  let ok = false;
  if (thOk && thWithIcd.has(th)) {
    thHitIcd++;
    ok = true;
  } else if (thOk && thAll.has(th)) {
    thHitAny++;
  }
  if (disOk && disAll.has(dis)) {
    disHit++;
    ok = true;
  }
  if (ok) resolvable++;
  if (!thOk && !disOk) neither++;
}
console.log({
  total,
  hasTh,
  hasDis,
  thHitIcd,
  thHitAny,
  disHit,
  resolvable,
  neither,
  thAll: thAll.size,
  thWithIcd: thWithIcd.size,
  disAll: disAll.size,
});
