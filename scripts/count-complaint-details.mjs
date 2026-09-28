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
  let buffer = '';
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
    const piece = raw.replace(/^\uFEFF/, '');
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
      if (!headers[i]) continue;
      row[headers[i]] = cols[i] ?? '';
    }
    yield row;
  }
}

let n = 0;
const ids = new Set();
for await (const row of streamCsvRows('Migration-Documents/DOCTORS/COMPLAINT_DETAILS.csv')) {
  n++;
  const id = Number(row.COMPLAINT_ID);
  if (Number.isFinite(id) && id > 0) ids.add(id);
}
console.log({ detailRows: n, uniqueComplaintIds: ids.size });
