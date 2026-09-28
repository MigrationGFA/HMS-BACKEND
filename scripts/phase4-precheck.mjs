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
const u = await c.query('SELECT COUNT(*)::int AS c FROM "USERS"');
const n = await c.query('SELECT COUNT(*)::int AS c FROM "CLINICAL_NOTES"');
const p = await c.query('SELECT COUNT(*)::int AS c FROM "PERSONS"');
console.log({ users: u.rows[0].c, notes: n.rows[0].c, persons: p.rows[0].c });
await c.end();
