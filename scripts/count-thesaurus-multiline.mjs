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
  return { fields, inQuotes };
}

async function* streamCsvRowsMultiline(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers = null;
  let lineNo = 0;
  let buffer = '';
  let bufferStartLine = 0;
  for await (const raw of rl) {
    lineNo++;
    const piece = raw.replace(/^\uFEFF/, '');
    if (!buffer) bufferStartLine = lineNo;
    buffer = buffer ? `${buffer}\n${piece}` : piece;
    const { fields, inQuotes } = splitCsvLine(buffer);
    if (inQuotes) continue;
    if (!buffer.trim()) {
      buffer = '';
      continue;
    }
    if (!headers) {
      headers = fields.map((h) => h.trim());
      buffer = '';
      continue;
    }
    const row = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i];
      if (!key) continue;
      row[key] = fields[i] !== undefined ? fields[i] : '';
    }
    yield { row, lineNo: bufferStartLine };
    buffer = '';
  }
}

let n = 0;
let withIcd = 0;
let emptyIcd = 0;
for await (const { row } of streamCsvRowsMultiline('Migration-Documents/DOCTORS/THESAURUS.csv')) {
  n++;
  if (String(row.ICD_CODE || '').trim()) withIcd++;
  else emptyIcd++;
}
console.log({ n, withIcd, emptyIcd });
