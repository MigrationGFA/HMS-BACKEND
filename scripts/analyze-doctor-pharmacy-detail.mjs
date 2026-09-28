import fs from 'fs';
import crypto from 'crypto';

function fileHash(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex').slice(0, 16);
}

const pairs = [
  ['Migration-Documents/DIAGNOSIS.csv', 'Migration-Documents/DOCTORS/DIAGNOSIS.csv'],
  ['Migration-Documents/DOCTORS.csv', 'Migration-Documents/DOCTORS/DOCTORS.csv'],
  ['Migration-Documents/NOTES.csv', 'Migration-Documents/DOCTORS/NOTES.csv'],
];
for (const [a, b] of pairs) {
  const ha = fs.existsSync(a) ? fileHash(a) : 'MISSING';
  const hb = fs.existsSync(b) ? fileHash(b) : 'MISSING';
  console.log(JSON.stringify({ a, b, same: ha === hb, ha, hb, sizeA: fs.existsSync(a) && fs.statSync(a).size, sizeB: fs.existsSync(b) && fs.statSync(b).size }));
}

// ITEMS type counts
const raw = fs.readFileSync('Migration-Documents/PHAMACY/ITEMS.csv', 'utf8');
const types = {};
const med = { y: 0, n: 0, empty: 0 };
let inQ = false;
let cur = '';
let row = [];
function flushRow() {
  if (row.length < 20) return;
  const itemType = (row[14] || '').trim() || '(empty)';
  types[itemType] = (types[itemType] || 0) + 1;
  const isMed = (row[36] || '').trim();
  if (isMed === 'Y' || isMed === '1' || isMed.toLowerCase() === 'yes') med.y++;
  else if (!isMed) med.empty++;
  else med.n++;
}
for (let i = 0; i < raw.length; i++) {
  const ch = raw[i];
  if (ch === '"') {
    inQ = !inQ;
    continue;
  }
  if (ch === ',' && !inQ) {
    row.push(cur);
    cur = '';
    continue;
  }
  if ((ch === '\n' || ch === '\r') && !inQ) {
    if (ch === '\r' && raw[i + 1] === '\n') i++;
    row.push(cur);
    cur = '';
    if (row[0] !== 'ITEM_ID') flushRow();
    row = [];
    continue;
  }
  cur += ch;
}
console.log(JSON.stringify({ types, med }, null, 2));
