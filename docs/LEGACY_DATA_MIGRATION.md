# Legacy CSV Data Migration

Script-first import of Aro / FNPH legacy extracts into HMS PostgreSQL tables while **preserving exact legacy primary keys** for later clinical document foreign keys.

## Source files

Place CSVs under [`Migration-Documents/`](../Migration-Documents/):

| CSV | Target table | Notes |
|-----|--------------|--------|
| `USER_TYPE.csv` | `USER_TYPES` | Lookup; exact `USER_TYPE_ID` |
| `ROLES.csv` | `ROLES` | Exact `ROLE_ID`; skip rows with empty `ROLE_NAME` |
| `WARDS.csv` | `WARDS` | Exact `WARD_ID`; `WARD_NAME` → `NAME`; `CODE` = `W{WARD_ID}`; `Unisex` → `Mixed` |
| `CLINICS.csv` | `CLINICS` | Exact `CLINIC_ID`; skip junk names matching `/^x+$/i` (e.g. `662 xxxxxxxx`); unused blank fee/duration columns not stored |
| `DOCTORS.csv` | `DOCTORS` | Exact `DOCTOR_ID`; keeps CSV spelling `QULIFICATION` |
| `USERS.csv` | `USERS` | Staff accounts; exact `USER_ID`; login via phone + temp PIN (see below) |
| `DEPARTMENTS.csv` | `DEPARTMENTS` | Exact `DEPARTMENT_ID`. Relocates seed catalog rows (LAB/PHARM/OPC/…) off colliding ids first. **Ignore `DEPT.csv`.** |
| `PERSONS.csv` | `PERSONS` | Patients (~15k+); import in chunks |
| `APPOINTMENTS.csv` | `FOLLOW_UPS` | Exact `APPOINTMENT_ID` → `FOLLOW_UP_ID`; `CREATOR_TYPE=staff`; skip missing person/doctor |
| `ADMISSION_HISTORY.csv` | `ADMISSIONS` | Collapsed by `ADMISSION_ID` (≥100 only); null ward/bed unless ward 502–645 |
| `NURS_CARE_PLAN.csv` | `NURSING_CARE_PLANS` | Exact `NURS_CARE_PLAN_ID`; skip empty / missing persons |
| `NOTES.csv` | `NURSING_NOTES` | Exact `NOTE_ID`; skip missing `PERSON_ID` or empty body |

Only files that exist are imported; missing files are skipped with a log line.

## Exact-ID rule

Do **not** renumber `USER_ID`, `PERSON_ID`, `ROLE_ID`, `WARD_ID`, `CLINIC_ID`, `DOCTOR_ID`, `DEPARTMENT_ID`, or `USER_TYPE_ID`. Downstream encounter / admission / prescription CSVs will reference these values. Seed billing departments that sit on colliding Aro ids are **moved** to unused ids ≥ 100 (Master Services follow via `ON UPDATE CASCADE`), then CSV rows are inserted with the original ids.

Table names stay legacy-compatible: `USERS`, `PERSONS`, `ROLES`, `WARDS`, plus new lookups `USER_TYPES`, `CLINICS`, `DOCTORS`.

## Schema prerequisites

- `20260813160000_legacy_lookup_tables` adds `USER_TYPES`, `CLINICS`, `DOCTORS` and optional `WARDS` columns (`DESCRIPTION`, `HOSPITAL_ID`, `BRANCH_ID`, `DISCONTINUE_FLAG`).
- `20260818120000_follow_ups_creator_type` adds `FOLLOW_UPS.CREATOR_TYPE` (`VARCHAR(20)` NOT NULL default `staff`).

Deploy before importing:

```bash
npx prisma migrate deploy
```

## How to run

From `HMS-BACKEND` (same DB env as `npm run db:test`):

```bash
# Lookups + staff (safe default)
npm run db:migrate-csv -- --only=user_types,roles,wards,clinics,doctors,users

# Or shorthand
npm run db:migrate-csv -- --only=all-small

# Patients in chunks (do not load the whole file into memory)
npm run db:migrate-csv -- --only=persons --offset=0 --limit=500
npm run db:migrate-csv -- --only=persons --offset=500 --limit=500
# continue until upserted count drops to 0 / EOF

# Remaining patients after first 10k
npm run db:migrate-csv -- --only=persons --offset=10000 --limit=5205

# Aro departments (relocates seed 2/6/8/9 first), then clinics
npm run db:migrate-csv -- --only=departments
npm run db:migrate-csv -- --only=clinics

# Clinical (after persons + clinics + departments)
npm run db:migrate-csv -- --only=follow_ups
npm run db:migrate-csv -- --only=admissions
npm run db:migrate-csv -- --only=nursing_care_plans
npm run db:migrate-csv -- --only=nursing_notes
```

Optional: `--batch=250` (default) controls PERSONS flush size.

Recommended order: `user_types` → `roles` → `wards` → `departments` → `clinics` → `doctors` → `users`, then `persons` in separate commands.

## Behaviour

- Idempotent `INSERT … ON CONFLICT (pk) DO UPDATE` — safe to re-run.
- Empty CSV strings become SQL `NULL` (critical for unique `PERSONS.HOSPITAL_NO` when blank).
- Dates like `25-Aug-23` / `26-Aug-97` are parsed (2-digit years: ≥70 → 19xx, else 20xx).
- After tables with sequences (`ROLES`, `WARDS`, `USERS`, `PERSONS`), the sequence is reset to `MAX(id)`.
- Rows without a usable name are skipped (empty `ROLE_NAME`, empty person first+last name, empty clinic/doctor/ward name, empty `USER_NAME`).
- `PICTURE` blobs are not imported (column omitted when empty in CSV).
- Run logs: `Migration-Documents/logs/migrate-legacy-csv-*.log`.

### WARDS mapping

| CSV | Column |
|-----|--------|
| `WARD_ID` | `WARD_ID` (exact) |
| `WARD_NAME` | `NAME` |
| — | `CODE` = `W{WARD_ID}` |
| `GENDER` | `GENDER` (`Unisex` → `Mixed`; empty → `Mixed`) |
| `DESCRIPTION`, `HOSPITAL_ID`, `BRANCH_ID`, `DISCONTINUE_FLAG` | same |
| empty discontinue | `STATUS` = `Active` |

### USERS / staff login (phone + temporary PIN)

Migrated staff do **not** keep legacy MD5 `PWD` hashes. On import:

1. Digits are taken from `PHONE_NO`.
2. Temporary login PIN = **last 4 digits** of that phone number.
3. `PWD` and `PASSWORD` are both set to `bcrypt(last4)`.
4. `GENERATE_PIN = Y` so the API returns `mustResetPassword: true` after login.

**Login:** `POST /api/auth/login` with `{ "phone": "080…", "password": "<last4>" }` (email login still works for seed/IT accounts).

**First access:** frontend forces a PIN reset via `POST /api/auth/change-password`, which sets a new bcrypt hash and clears `GENERATE_PIN` to `N`.

**Re-import safety:** if `GENERATE_PIN` is already `N`, the CSV importer does **not** overwrite `PWD` / `PASSWORD` / `GENERATE_PIN` (staff who already reset keep their PIN).

Staff without a usable phone (≥ 4 digits) are still imported but cannot log in until phone + PIN are set. Seed test accounts (email + `password`) are separate IDs and are left untouched.

### PERSONS notes

- `PRIMARY_CONSULTANT` stays a string (legacy often stores a user id such as `4896`).
- Do not invent `HOSPITAL_NO` values; blank → `NULL`.
- Duplicate `HOSPITAL_NO`: first CSV occurrence in the run is kept; later copies are nulled (and retried on unique-index `23505`).
- `STATUS` is set to `Active` (legacy blank / `0` / `1` are not HMS workflow statuses).
- If `HMO_ID` does not exist in `SERVICE_PAYERS`, the row is retried with `HMO_ID` cleared (logged).
- If a staff `USERS.PERSON_ID` points at a person not yet imported, that FK is cleared and logged (import persons, then re-run users if you need the link).
- `DEPARTMENTS` cannot be loaded from these CSVs — see [LEGACY_CSV_IMPORT_WARDS_PERSONS.md](./LEGACY_CSV_IMPORT_WARDS_PERSONS.md).

### Skipped / not stored

- Roles with blank `ROLE_NAME` (e.g. legacy ROLE_ID 46/53).
- Trailing CLINICS fee/duration columns that are unused/blank in the extract (not added to schema).
- Later clinical CSVs (encounters, admissions, etc.) — out of scope for this batch.

## Resume after a crash

PERSONS is stream-based. Re-run the same `--offset` / `--limit` window (upserts are idempotent), or advance `offset` by the number of data rows already processed:

```bash
npm run db:migrate-csv -- --only=persons --offset=1000 --limit=500
```

Check the latest file under `Migration-Documents/logs/` for `upserted` / `errors` counts.

## RBAC note

HMS seed still upserts application roles by `ROLE_NAME`. Legacy roles keep **their** `ROLE_ID` values. Do not assume seed role IDs match legacy IDs when wiring document FKs.
