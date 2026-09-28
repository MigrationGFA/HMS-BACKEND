#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const ROOT = process.cwd();
const cert = path.resolve(ROOT, 'certs/DigiCertGlobalRootG2.crt.pem');
const c = new pg.Client({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME ?? 'postgres',
  port: Number(process.env.DATABASE_PORT ?? '5432'),
  ssl: { ca: fs.readFileSync(cert) },
});
await c.connect();
const notes = await c.query(`
  SELECT "NOTE_TYPE", COUNT(*)::int AS c
  FROM "CLINICAL_NOTES"
  WHERE "NOTE_NO" LIKE 'LEG-%'
  GROUP BY "NOTE_TYPE"
  ORDER BY c DESC
`);
const total = await c.query(`SELECT COUNT(*)::int AS c FROM "CLINICAL_NOTES"`);
const tpl = await c.query(`SELECT COUNT(*)::int AS c FROM "CLINICAL_NOTE_TEMPLATES"`);
const sample = await c.query(`
  SELECT "NOTE_NO","NOTE_TYPE","PERSON_ID","STATUS"
  FROM "CLINICAL_NOTES"
  WHERE "NOTE_TYPE" = 'Legacy Complaint'
  ORDER BY "CLINICAL_NOTE_ID" DESC LIMIT 3
`);
console.log(JSON.stringify({ totalNotes: total.rows[0].c, byType: notes.rows, templates: tpl.rows[0].c, sample }, null, 2));
await c.end();
