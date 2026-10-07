#!/usr/bin/env node
/**
 * Backfill USERS.EMPLOYEE_ID <-> HR_EMPLOYEES.USER_ID links.
 *
 * HR Self-Service Phase 0 (docs/HR_SELF_SERVICE_PLAN.md §4.1 / §7 Phase 0).
 * Most migrated staff exist in USERS (phone + PIN) with EMPLOYEE_ID = null
 * and often no HR_EMPLOYEES row at all. This script matches active,
 * non-Patient USERS without EMPLOYEE_ID to HR_EMPLOYEES by email, then by
 * phone, and links them bidirectionally.
 *
 * Usage:
 *   node scripts/backfill-hr-employee-links.mjs                # dry run (report only)
 *   node scripts/backfill-hr-employee-links.mjs --apply         # write matched links
 *   node scripts/backfill-hr-employee-links.mjs --apply --create-missing
 *                                                               # also create a minimal
 *                                                               # HR_EMPLOYEES stub (and
 *                                                               # link it) for active staff
 *                                                               # users with no match
 *
 * Safe to re-run: only touches USERS/HR_EMPLOYEES rows that are still
 * unlinked on both sides at write time.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const CREATE_MISSING = args.includes('--create-missing');

function buildPgClient() {
  const keepAlive = { keepAlive: true, keepAliveInitialDelayMillis: 10000 };
  if (process.env.DATABASE_URL_PRISMA || process.env.DATABASE_URL) {
    return new pg.Client({
      connectionString: process.env.DATABASE_URL_PRISMA || process.env.DATABASE_URL,
      connectionTimeoutMillis: 30000,
      ...keepAlive,
    });
  }
  const certRel = (
    process.env.DATABASE_SSL_CA_PATH ?? './certs/DigiCertGlobalRootG2.crt.pem'
  ).replace(/^\.\//, '');
  const certPath = path.resolve(ROOT, certRel);
  return new pg.Client({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME ?? 'postgres',
    port: Number(process.env.DATABASE_PORT ?? '5432'),
    ssl: fs.existsSync(certPath) ? { ca: fs.readFileSync(certPath) } : undefined,
    connectionTimeoutMillis: 30000,
    ...keepAlive,
  });
}

/** Digits-only normalization for loose phone matching (e.g. "080-123..." vs "234801..."). */
function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  // Compare on the last 10 digits so local vs +234-prefixed numbers still match.
  return digits.slice(-10);
}

async function main() {
  const client = buildPgClient();
  await client.connect();

  console.log(
    `\nHR employee<->user backfill — mode: ${APPLY ? 'APPLY' : 'DRY RUN'}${
      CREATE_MISSING ? ' (+create-missing)' : ''
    }\n`,
  );

  // Active, non-Patient staff users with no employee link yet.
  const { rows: candidateUsers } = await client.query(`
    SELECT
      u."USER_ID",
      u."FIRST_NAME",
      u."LAST_NAME",
      u."EMAIL_ADDRESS",
      u."PHONE_NO",
      r."ROLE_NAME"
    FROM "USERS" u
    LEFT JOIN "ROLES" r ON r."ROLE_ID" = u."ROLE_ID"
    WHERE u."EMPLOYEE_ID" IS NULL
      AND (u."LOCK_ACCOUNT" IS NULL OR UPPER(u."LOCK_ACCOUNT") <> 'Y')
      AND (u."EXPIRY_DATE" IS NULL OR u."EXPIRY_DATE" > NOW())
      AND (r."ROLE_NAME" IS NULL OR UPPER(r."ROLE_NAME") NOT LIKE '%PATIENT%')
    ORDER BY u."USER_ID" ASC
  `);

  const { rows: unlinkedEmployees } = await client.query(`
    SELECT "EMPLOYEE_ID", "EMPLOYEE_NO", "FIRST_NAME", "LAST_NAME", "EMAIL", "PHONE"
    FROM "HR_EMPLOYEES"
    WHERE "USER_ID" IS NULL
  `);

  const byEmail = new Map();
  const byPhone = new Map();
  for (const emp of unlinkedEmployees) {
    if (emp.EMAIL) {
      const key = emp.EMAIL.trim().toLowerCase();
      if (key && !byEmail.has(key)) byEmail.set(key, emp);
    }
    const normalized = normalizePhone(emp.PHONE);
    if (normalized && !byPhone.has(normalized)) byPhone.set(normalized, emp);
  }

  const matched = [];
  const unmatched = [];

  for (const user of candidateUsers) {
    const emailKey = user.EMAIL_ADDRESS?.trim().toLowerCase();
    const phoneKey = normalizePhone(user.PHONE_NO);

    let employee = emailKey ? byEmail.get(emailKey) : undefined;
    let matchedBy = employee ? 'email' : null;

    if (!employee && phoneKey) {
      employee = byPhone.get(phoneKey);
      matchedBy = employee ? 'phone' : null;
    }

    if (employee) {
      matched.push({ user, employee, matchedBy });
      // Prevent the same HR_EMPLOYEES row from being claimed twice.
      if (employee.EMAIL) byEmail.delete(employee.EMAIL.trim().toLowerCase());
      const empPhone = normalizePhone(employee.PHONE);
      if (empPhone) byPhone.delete(empPhone);
    } else {
      unmatched.push(user);
    }
  }

  console.log(`Active unlinked staff users: ${candidateUsers.length}`);
  console.log(`Unlinked HR_EMPLOYEES rows:  ${unlinkedEmployees.length}`);
  console.log(`Matched (email/phone):       ${matched.length}`);
  console.log(`Unmatched staff users:       ${unmatched.length}\n`);

  if (matched.length > 0) {
    console.log('--- Matched links ---');
    for (const { user, employee, matchedBy } of matched) {
      console.log(
        `  USER_ID=${user.USER_ID} (${user.FIRST_NAME ?? ''} ${
          user.LAST_NAME ?? ''
        } <${user.EMAIL_ADDRESS ?? 'no-email'}>) -> EMPLOYEE_ID=${
          employee.EMPLOYEE_ID
        } (${employee.EMPLOYEE_NO}) [matched by ${matchedBy}]`,
      );
    }
    console.log('');
  }

  if (unmatched.length > 0) {
    console.log('--- Unmatched active staff users (report) ---');
    for (const user of unmatched) {
      console.log(
        `  USER_ID=${user.USER_ID} role=${user.ROLE_NAME ?? 'n/a'} name="${
          user.FIRST_NAME ?? ''
        } ${user.LAST_NAME ?? ''}" email=${
          user.EMAIL_ADDRESS ?? 'n/a'
        } phone=${user.PHONE_NO ?? 'n/a'}`,
      );
    }
    console.log('');
  }

  if (!APPLY) {
    console.log(
      'Dry run complete — no writes made. Re-run with --apply to write matched links' +
        (CREATE_MISSING ? ' and create stub employees for unmatched users.' : '.'),
    );
    await client.end();
    return;
  }

  let appliedLinks = 0;
  let skippedLinks = 0;

  for (const { user, employee, matchedBy } of matched) {
    await client.query('BEGIN');
    try {
      const empCheck = await client.query(
        `SELECT "USER_ID" FROM "HR_EMPLOYEES" WHERE "EMPLOYEE_ID" = $1 FOR UPDATE`,
        [employee.EMPLOYEE_ID],
      );
      const userCheck = await client.query(
        `SELECT "EMPLOYEE_ID" FROM "USERS" WHERE "USER_ID" = $1 FOR UPDATE`,
        [user.USER_ID],
      );
      const stillUnlinked =
        empCheck.rows[0]?.USER_ID == null && userCheck.rows[0]?.EMPLOYEE_ID == null;

      if (!stillUnlinked) {
        await client.query('ROLLBACK');
        skippedLinks += 1;
        console.log(
          `  SKIP USER_ID=${user.USER_ID} <-> EMPLOYEE_ID=${employee.EMPLOYEE_ID} (already linked elsewhere since dry run)`,
        );
        continue;
      }

      await client.query(
        `UPDATE "HR_EMPLOYEES" SET "USER_ID" = $1, "UPDATED_BY" = 'SYSTEM', "UPDATED_DATE" = NOW() WHERE "EMPLOYEE_ID" = $2`,
        [user.USER_ID, employee.EMPLOYEE_ID],
      );
      await client.query(
        `UPDATE "USERS" SET "EMPLOYEE_ID" = $1, "UPDATED_BY" = 'SYSTEM', "UPDATED_DATE" = NOW() WHERE "USER_ID" = $2`,
        [employee.EMPLOYEE_ID, user.USER_ID],
      );
      await client.query('COMMIT');
      appliedLinks += 1;
      console.log(
        `  LINKED USER_ID=${user.USER_ID} <-> EMPLOYEE_ID=${employee.EMPLOYEE_ID} (${matchedBy})`,
      );
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(
        `  ERROR linking USER_ID=${user.USER_ID} <-> EMPLOYEE_ID=${employee.EMPLOYEE_ID}:`,
        err.message,
      );
    }
  }

  let createdStubs = 0;
  if (CREATE_MISSING) {
    console.log('\n--- Creating stub HR_EMPLOYEES for unmatched staff users ---');
    for (const user of unmatched) {
      const employeeNo = `STAFF-${user.USER_ID}`;
      await client.query('BEGIN');
      try {
        const existingNo = await client.query(
          `SELECT "EMPLOYEE_ID" FROM "HR_EMPLOYEES" WHERE "EMPLOYEE_NO" = $1`,
          [employeeNo],
        );
        if (existingNo.rows.length > 0) {
          await client.query('ROLLBACK');
          continue;
        }
        const insert = await client.query(
          `INSERT INTO "HR_EMPLOYEES"
             ("EMPLOYEE_NO", "USER_ID", "FIRST_NAME", "LAST_NAME", "EMAIL", "PHONE",
              "DEPARTMENT_NAME", "EMPLOYMENT_TYPE", "STATUS", "CREATED_BY", "CREATED_DATE")
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'Permanent', 'Active', 'SYSTEM', NOW())
           RETURNING "EMPLOYEE_ID"`,
          [
            employeeNo,
            user.USER_ID,
            user.FIRST_NAME ?? 'Staff',
            user.LAST_NAME ?? `#${user.USER_ID}`,
            user.EMAIL_ADDRESS ?? null,
            user.PHONE_NO ?? null,
            user.ROLE_NAME ?? null,
          ],
        );
        await client.query(
          `UPDATE "USERS" SET "EMPLOYEE_ID" = $1, "UPDATED_BY" = 'SYSTEM', "UPDATED_DATE" = NOW() WHERE "USER_ID" = $2`,
          [insert.rows[0].EMPLOYEE_ID, user.USER_ID],
        );
        await client.query('COMMIT');
        createdStubs += 1;
        console.log(
          `  CREATED EMPLOYEE_ID=${insert.rows[0].EMPLOYEE_ID} (${employeeNo}) for USER_ID=${user.USER_ID}`,
        );
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ERROR creating stub for USER_ID=${user.USER_ID}:`, err.message);
      }
    }
  }

  console.log(
    `\nDone. Linked ${appliedLinks} (skipped ${skippedLinks} already-linked), created ${createdStubs} stub employee(s).`,
  );
  if (!CREATE_MISSING && unmatched.length > 0) {
    console.log(
      `${unmatched.length} active staff user(s) remain unmatched. Re-run with --create-missing to stub them, or have HR link manually on the Staff page.`,
    );
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
