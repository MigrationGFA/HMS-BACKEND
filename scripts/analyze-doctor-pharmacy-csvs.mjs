import fs from 'fs';
import path from 'path';

const roots = [
  'Migration-Documents/DOCTORS',
  'Migration-Documents/PHAMACY',
];

function parseHeader(line) {
  const headers = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === ',' && !inQ) {
      headers.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  headers.push(cur.trim());
  return headers;
}

function analyze(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const firstNl = raw.indexOf('\n');
  const headerLine = (firstNl === -1 ? raw : raw.slice(0, firstNl)).replace(/\r$/, '');
  const headers = parseHeader(headerLine);
  let rows = 0;
  let inQ = false;
  for (let i = firstNl + 1; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') inQ = !inQ;
    else if (ch === '\n' && !inQ) rows++;
  }
  if (raw.length > firstNl + 1 && !raw.endsWith('\n') && !raw.endsWith('\r\n')) rows++;
  let sample = '';
  const lineStart = firstNl + 1;
  inQ = false;
  for (let i = lineStart; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') inQ = !inQ;
    else if (ch === '\n' && !inQ) {
      sample = raw.slice(lineStart, i).replace(/\r$/, '');
      break;
    }
  }
  return { rows, headers, bytes: raw.length, samplePreview: sample.slice(0, 400) };
}

for (const root of roots) {
  console.log('\n===' + root + '===');
  const files = fs.readdirSync(root).filter((f) => f.toLowerCase().endsWith('.csv')).sort();
  for (const f of files) {
    const a = analyze(path.join(root, f));
    console.log(JSON.stringify({ file: f, rowsApprox: a.rows, bytes: a.bytes, headers: a.headers }));
  }
}

for (const f of [
  'Migration-Documents/DIAGNOSIS.csv',
  'Migration-Documents/DOCTORS.csv',
  'Migration-Documents/NOTES.csv',
]) {
  if (!fs.existsSync(f)) continue;
  const a = analyze(f);
  console.log('\n===COMPARE ' + f + '===');
  console.log(JSON.stringify({ file: f, rowsApprox: a.rows, bytes: a.bytes, headers: a.headers }));
}
