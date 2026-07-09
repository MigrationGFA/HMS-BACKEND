# Database

## Overview

HMS uses **PostgreSQL** as the primary database with **Prisma** as the ORM.

The Prisma schema is intentionally aligned with the **existing Aro HMS (Oracle) table structure** so data can be migrated with minimal renaming. Table names and column names match the legacy schema (including known typos such as `APPOITEMENTS` and `BILL_DETIALS`).

Schema files live under `apps/api/prisma/`. Migrations are managed via `prisma migrate`.

## Schema Layout

```
apps/api/prisma/
├── schema.prisma          # Main entry (generator + datasource)
├── models/
│   ├── auth.prisma        # ROLES, AUTHORIZATIONS, AUTH_OTP, MODULES, MENUS
│   ├── users.prisma       # USERS, USER_TYPE, GLOBAL_USER
│   ├── patients.prisma    # PERSONS, PERSON_GROUP, ALLERGIES, NHIS
│   ├── appointments.prisma # APPOITEMENTS, QUE_APPOINTMENTS, QUE_TOKENS
│   ├── clinical.prisma    # DIAGNOSIS, NOTES, VS, VITAL_SIGNS, COMPLAINTS, MSG_LOGS ...
│   ├── laboratory.prisma  # REQUEST_FORM, REQUEST_DETAILS, TEST_RESULT, LIS_ORDER ...
│   ├── pharmacy.prisma    # MASTER_DRUGS, BATCHED_ITEMS, PACKS ...
│   ├── radiology.prisma   # PACS_STUDY_TEST, OPHTHALMOLOGY, DRAWINGS ...
│   ├── admissions.prisma  # ADMISSION, WARDS, BEDS, CASE_FILE ...
│   ├── billing.prisma     # BILLS, BILL_DETIALS, INVOICES, TRANS, PRICE_LIST ...
│   ├── finance.prisma     # COA, GL, JOURNALS, CLAIMS, STANDARD_ACCOUNTS ...
│   ├── inventory.prisma   # ITEMS, STORES, STORE_ITEMS, LPO, GRN, TRANSACTIONS ...
│   ├── hr.prisma          # FORMS, DESIGNATION, UNITS, SECTIONS, DOCTORS ...
│   ├── psychiatry.prisma  # TREATMENT_*, CALL_NOTE, ICU_NOTE, FLUIDS, SURGERY ...
│   ├── reports.prisma     # NOTIFICATIONS, CHATS, MEDICAL_REPORT, GENERIC_TEMPLATES
│   ├── audit.prisma       # AUDITS, ERROR_HANDLER_TBL
│   └── settings.prisma    # HOSPITALS, BRANCHES, DEPARTMENTS, CLINICS, APP_PARAMETER ...
├── migrations/
└── seed.ts
```

Prisma is configured via `prisma.config.ts`. The `schema` property points to the directory `apps/api/prisma` so all `.prisma` files are merged.

## Legacy Alignment Rules

| Rule | Approach |
|------|----------|
| Table names | Exact legacy names via `@@map("PERSONS")` |
| Column names | Exact legacy names (`PERSON_ID`, `HOSPITAL_NO`, …) |
| Primary keys | Integer autoincrement (legacy Oracle IDs) — not UUID |
| Known typos | Preserved (`APPOITEMENTS`, `BILL_DETIALS`, `DESCIPTION`, `CRETAED_BY`) |
| Flag fields | Stored as `String?` (`Y`/`N`) matching legacy VARCHAR flags |
| Date fields | `DateTime?` |
| Money/qty | `Decimal` |

## Connection

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Primary write/read connection |
| `DATABASE_READ_URL` | Read replica (future — not yet wired) |

Example:

```
postgresql://postgres:password@localhost:5432/hms?schema=public&sslmode=require
```

**Prisma 7:** The connection URL lives in `prisma.config.ts` (not `schema.prisma`). Runtime uses `@prisma/adapter-pg` with a `pg` pool — see `apps/api/src/prisma/create-prisma-client.ts`. The Prisma CLI loads `.env` via `import 'dotenv/config'` in `prisma.config.ts`.

### Azure PostgreSQL

Set explicit fields (matches Azure Node.js `pg` sample):

```env
DATABASE_HOST=your-server.postgres.database.azure.com
DATABASE_USER=arodb
DATABASE_PASSWORD=your_password
DATABASE_NAME=postgres
DATABASE_PORT=5432
DATABASE_SSL_CA_PATH=./certs/DigiCertGlobalRootG2.crt.pem
DATABASE_URL="postgresql://arodb:password@host:5432/postgres?schema=public&sslmode=verify-full&sslrootcert=./certs/DigiCertGlobalRootG2.crt.pem"
PGSSLROOTCERT=./certs/DigiCertGlobalRootG2.crt.pem
```

CA cert: `certs/DigiCertGlobalRootG2.crt.pem` (DigiCert Global Root G2). Encode `@` in passwords as `%40` in `DATABASE_URL`.

If Prisma reports **P1001 Can't reach server**, add your client IP under Azure Portal → PostgreSQL server → **Networking** → firewall rules.

## Core Entity Mapping

| Legacy table | Prisma model | Domain |
|--------------|--------------|--------|
| `PERSONS` | `Persons` | Patients |
| `USERS` | `Users` | Staff login accounts |
| `ROLES` / `AUTHORIZATIONS` | `Roles` / `Authorizations` | RBAC |
| `ADMISSION` / `WARDS` / `BEDS` | `Admission` / `Wards` / `Beds` | Inpatient |
| `APPOITEMENTS` | `Appoitements` | Appointments |
| `REQUEST_FORM` / `REQUEST_DETAILS` | `RequestForm` / `RequestDetails` | Lab / radiology / pharmacy orders |
| `BILLS` / `BILL_DETIALS` | `Bills` / `BillDetials` | Billing |
| `ITEMS` / `STORES` | `Items` / `Stores` | Inventory & pharmacy catalog |
| `CLINICS` / `DEPARTMENTS` / `BRANCHES` / `HOSPITALS` | matching models | Settings |
| `FORMS` | `Forms` | Staff HR biodata |
| `AUDITS` | `Audits` | Audit trail |

### Entity Relationship (Core)

```
USERS ── ROLE_ID ── ROLES ── AUTHORIZATIONS ── MENUS

PERSONS ──┬── APPOITEMENTS
          ├── ADMISSION ── WARDS / BEDS
          ├── CASE_FILE
          ├── REQUEST_FORM ── REQUEST_DETAILS ── ITEMS
          ├── BILLS ── BILL_DETIALS
          ├── DIAGNOSIS / NOTES / VS
          └── CLAIMS

ITEMS ── STORE_ITEMS ── STORES
ITEMS ── PRICE_LIST
ITEMS ── used by pharmacy (IS_MEDICATION) and lab/radiology services
```

## Key Differences From Modern Defaults

1. **No UUID primary keys** — integer IDs for direct ID migration from Oracle.
2. **`PERSONS` is the patient table**, not `patients`.
3. **Orders are unified** in `REQUEST_FORM` (lab, radiology, pharmacy requests via `REQUEST_TYPE`).
4. **Billing is bill-centric** (`BILLS` / `BILL_DETIALS`), with optional `INVOICES`.
5. **Medications and services** share the `ITEMS` catalog (`IS_MEDICATION` / `ITEM_TYPE`).

## Migrations

```bash
# Validate schema
npm run prisma:validate

# Create and apply a migration (development)
npm run prisma:migrate

# Generate client after schema changes
npm run prisma:generate

# Push schema without migration (prototyping only)
npm run prisma:push

# Seed system roles into ROLES
npm run prisma:seed

# Open GUI
npm run prisma:studio
```

Migration files are stored in `apps/api/prisma/migrations/`. Never edit applied migrations — create a new one instead.

## Indexing Strategy

### Principles

1. Index foreign keys (`PERSON_ID`, `ADMISSION_ID`, `ITEM_ID`, …).
2. Index frequent filters (`STATUS`, `IS_PAID`, date columns).
3. Prefer composite indexes for multi-column query patterns.
4. Avoid over-indexing write-heavy tables.

### Examples Already Defined

| Table | Index | Purpose |
|-------|-------|---------|
| `PERSONS` | `(LAST_NAME, FIRST_NAME)` | Patient search |
| `PERSONS` | `(HOSPITAL_ID, BRANCH_ID)` | Multi-branch filter |
| `APPOITEMENTS` | `(PERSON_ID, APPOINTMENT_DATE)` | Patient history |
| `APPOITEMENTS` | `(DOCTOR_ID, APPOINTMENT_DATE)` | Doctor schedule |
| `BILLS` | `(PERSON_ID)`, `(IS_PAID)`, `(BILL_DATE)` | Billing queues |
| `REQUEST_FORM` | `(PERSON_ID)`, `(STATUS)`, `(REQUEST_TYPE)` | Lab/pharmacy queues |
| `ITEMS` | `(ITEM_CODE)`, `(ITEM_TYPE)`, `(IS_MEDICATION)` | Catalog lookups |

## Table Partitioning (Future)

Partition high-volume, append-only tables by date range once live volume grows:

| Table | Partition Key |
|-------|---------------|
| `AUDITS` | `CREATE_DATE` |
| `BILLS` | `BILL_DATE` |
| `REQUEST_FORM` | `REQUEST_DATE` |
| `MSG_LOGS` | `CREATED_DATE` |

## Read Replicas

When `DATABASE_READ_URL` is set:

1. Writes go to primary (`DATABASE_URL`).
2. Read-heavy queries (reports, search) route to replica.
3. Implement in `PrismaService` with a separate read client.

## Full-Text Search

Initial search can use PostgreSQL FTS on:

- `PERSONS` (`FIRST_NAME`, `LAST_NAME`, `HOSPITAL_NO`, `PATIENT_PHONE_NO`)
- `ITEMS` (`ITEM_NAME`, `GENERIC_NAME`, `ITEM_CODE`)

## Data Integrity Notes For Migration

- Preserve **string flag columns** (`IS_PAID`, `IS_DISCHARGED`) as-is during import; normalize later if needed.
- Preserve **legacy typos** in table/column names until a dedicated rename migration is planned.
- Cross-table IDs (`PERSON_ID`, `USER_ID`, `ITEM_ID`) should be imported with identity mappings so sequences continue after max imported ID.

## Backup & Recovery

Not automated in this repo. Production checklist:

- Daily PostgreSQL backups (pg_dump or WAL archiving)
- Point-in-time recovery enabled
- Test restore procedure quarterly
- Redis persistence configured if sessions must survive restart

## Related Documents

- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)
- [MODULES.md](./MODULES.md)
- Legacy source: `Aro_backup_table_structure_0912(1).txt`
