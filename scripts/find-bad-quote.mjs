#!/usr/bin/env node
import fs from 'node:fs';
import readline from 'node:readline';

const p = 'Migration-Documents/DOCTORS/THESAURUS.csv';
const rl = readline.createInterface({
  input: fs.createReadStream(p),
  crlfDelay: Infinity,
});
let lineNo = 0;
let inQuotes = false;
let firstBad = null;
for await (const line of rl) {
  lineNo++;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
    }
  }
  if (inQuotes && !firstBad) {
    firstBad = { lineNo, preview: line.slice(0, 160) };
  }
}
console.log(JSON.stringify({ lineNo, stillInQuotes: inQuotes, firstBad }, null, 2));
