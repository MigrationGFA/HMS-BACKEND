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

let n = 0;
let withIcd = 0;
let lastLine = 0;
for await (const { row, lineNo } of streamCsvRows('Migration-Documents/DOCTORS/THESAURUS.csv')) {
  n++;
  lastLine = lineNo;
  if (String(row.ICD_CODE || '').trim()) withIcd++;
}
console.log({ n, withIcd, lastLine });
