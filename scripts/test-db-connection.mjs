#!/usr/bin/env node
/**
 * Quick Azure PostgreSQL connectivity check (same SSL pattern as the app).
 * Run: node scripts/test-db-connection.mjs
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import pg from 'pg';

const host = process.env.DATABASE_HOST;
const user = process.env.DATABASE_USER;
const password = process.env.DATABASE_PASSWORD;
const database = process.env.DATABASE_NAME ?? 'postgres';
const port = Number(process.env.DATABASE_PORT ?? '5432');
const certPath = path.resolve(
  process.cwd(),
  (process.env.DATABASE_SSL_CA_PATH ?? './certs/DigiCertGlobalRootG2.crt.pem').replace(
    /^\.\//,
    '',
  ),
);

if (!host || !user || !password) {
  console.error('Missing DATABASE_HOST, DATABASE_USER, or DATABASE_PASSWORD in .env');
  process.exit(1);
}

console.log('Host:', host);
console.log('CA cert:', certPath);

try {
  const resolved = await dns.lookup(host);
  console.log('DNS OK:', resolved.address);
} catch (error) {
  console.error('DNS FAILED:', error instanceof Error ? error.message : error);
  console.error(
    '\nFix: use Google DNS (8.8.8.8) or add to C:\\Windows\\System32\\drivers\\etc\\hosts:\n' +
      '  <azure-ip>  aro-db.postgres.database.azure.com\n',
  );
  process.exit(1);
}

const client = new pg.Client({
  host,
  user,
  password,
  database,
  port,
  ssl: { ca: fs.readFileSync(certPath) },
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
  const result = await client.query('SELECT 1 AS ok');
  console.log('PostgreSQL OK:', result.rows[0]);
} catch (error) {
  console.error('PostgreSQL FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}
