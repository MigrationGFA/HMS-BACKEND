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

const thAll = new Set();
let thMin = Infinity, thMax = -Infinity;
for await (const row of streamCsvRows('Migration-Documents/DOCTORS/THESAURUS.csv')) {
  const id = Number(row.THESAURUS_ID);
  if (!Number.isFinite(id)) continue;
  thAll.add(id);
  thMin = Math.min(thMin, id);
  thMax = Math.max(thMax, id);
}
const disAll = new Set();
let dMin = Infinity, dMax = -Infinity;
for await (const row of streamCsvRows('Migration-Documents/DOCTORS/DISEASES.csv')) {
  const id = Number(row.DISEASE_ID);
  if (!Number.isFinite(id)) continue;
  disAll.add(id);
  dMin = Math.min(dMin, id);
  dMax = Math.max(dMax, id);
}

const missTh = [];
const missDis = [];
let dxThMin = Infinity, dxThMax = -Infinity, dxDMin = Infinity, dxDMax = -Infinity;
for await (const row of streamCsvRows('Migration-Documents/DOCTORS/DIAGNOSIS.csv')) {
  const th = Number(row.THESAURUS_ID);
  const dis = Number(row.DISEASE_ID);
  if (Number.isFinite(th)) {
    dxThMin = Math.min(dxThMin, th);
    dxThMax = Math.max(dxThMax, th);
    if (!thAll.has(th) && missTh.length < 10) missTh.push(th);
  }
  if (Number.isFinite(dis)) {
    dxDMin = Math.min(dxDMin, dis);
    dxDMax = Math.max(dxDMax, dis);
    if (!disAll.has(dis) && missDis.length < 10) missDis.push(dis);
  }
}
console.log({
  thesaurusFile: { thMin, thMax, n: thAll.size },
  diseasesFile: { dMin, dMax, n: disAll.size },
  diagnosisRefs: { dxThMin, dxThMax, dxDMin, dxDMax },
  missThSample: missTh,
  missDisSample: missDis,
});
