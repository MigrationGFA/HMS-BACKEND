# Legacy CSV import: WARDS + first 10,000 PERSONS

**Date:** 14 Aug 2026  
**Status:** Completed  
**Target:** HMS PostgreSQL (`db-aro.postgres.database.azure.com`, same `.env` as `npm run db:test`)  
**Operator:** Cursor agent, after explicit go-ahead

This is the run record for loading Aro/FNPH extracts into `WARDS` and `PERSONS`. It does **not** load departments, clinics, users, or the remaining ~5,205 persons.

Related: [LEGACY_DATA_MIGRATION.md](./LEGACY_DATA_MIGRATION.md), importer `scripts/migrate-legacy-csv.mjs`.

---

## Why this scope

| Table | Source | Decision |
|-------|--------|----------|
| `WARDS` | `Migration-Documents/WARDS.csv` (33 rows) | Load. IDs 502–645 do not collide with seeded test wards (`MGEN`, `ICU`, …). |
| `DEPARTMENTS` | none | **Skip.** No department extract. `CLINICS.csv` only has IDs 8/12/13 with no names; ID 8 would overwrite a seeded catalog department. |
| `PERSONS` | `Migration-Documents/PERSONS.csv` rows 1–10000 (file order) | Load this slice only. Full file is 15,205 rows. |

---

## Importer behaviour used for this run

Changes in `scripts/migrate-legacy-csv.mjs`:

### WARDS

- Exact `WARD_ID` preserved; `WARD_NAME` → `NAME` (trimmed); `CODE` = `W{WARD_ID}`.
- **`Unisex` → `Mixed`** so Records admit (`GENDER IN (Male\|Female, Mixed)`) can see those 11 wards.
- `DISCONTINUE_FLAG=1` → `STATUS=Inactive` (CSV rows 522 and 623). Others `Active`.
- `ITEM_ID` not stored (not on HMS `WARDS`).
- **No beds created.** Imported wards have 0 beds until a bed inventory exists.

### PERSONS (offset 0, limit 10000)

- File-order slice, not `PERSON_ID` 1–10000. IDs in this slice range **1–31770**.
- Exact `PERSON_ID` upsert (`ON CONFLICT DO UPDATE`) — **overwrites** any existing row with the same ID.
- **`STATUS` forced to `Active`** (CSV was blank / `0` / `1`, which is not HMS `Active` / `Incomplete`).
- Blank `HOSPITAL_NO` → `NULL` (unique index allows multiple nulls). **No** `FNPH/ARO/…` numbers invented.
- Duplicate `HOSPITAL_NO`: first occurrence in this run keeps the number; later copies in the CSV are nulled (33 duplicate values / 66 rows in this slice). If the DB unique index still fires, the row is retried with `HOSPITAL_NO` cleared.
- Legacy `HMO_ID` values (e.g. `35268`) are not `SERVICE_PAYERS.PAYER_ID`. On FK `23503` the row is retried with `HMO_ID` null (~363 rows in this slice have an HMO id).
- `OCCUPATION`, `STATE_OF_ORIGIN`, `NATIONALITY` stored as legacy lookup codes (numbers as text). No lookup CSVs available.
- `PICTURE` omitted (empty in CSV).
- `PATIENT_PHONE_NO` truncated to 50 chars if needed (the known overflow row is **not** in this 10k).
- After import, `PERSONS_PERSON_ID_seq` is set to `MAX(PERSON_ID)`.

---

## Commands

From `HMS-BACKEND`:

```bash
npx prisma migrate deploy
npm run db:migrate-csv -- --only=wards
npm run db:migrate-csv -- --only=persons --offset=0 --limit=10000
```

Logs: `Migration-Documents/logs/migrate-legacy-csv-*.log` (gitignored).

---

## Expected counts (pre-run)

### WARDS.csv (33)

| Gender after map | Count |
|------------------|-------|
| Male | 15 |
| Female | 7 |
| Mixed (was Unisex) | 11 |
| Inactive (`DISCONTINUE_FLAG=1`) | 2 (522, 623) |

Seeded test wards (`MGEN` … `W1C`) stay; this adds Aro/Lantoro wards alongside them.

### PERSONS.csv first 10,000 data rows

| Metric | Count |
|--------|-------|
| Rows | 10,000 |
| Unique `PERSON_ID` | 10,000 |
| Blank `HOSPITAL_NO` | 4,894 |
| Non-blank `HOSPITAL_NO` | 5,106 |
| Duplicate hospital numbers (values / rows) | 33 / 66 |
| Rows with `HMO_ID` | 363 |
| Nameless / missing ID | 0 |

---

## What this run does not do

- Departments, clinics, doctors, roles, user types, staff users.
- Remaining 5,205 persons (`--offset=10000`).
- `PATIENT_CARDS` (CSV has no card rows).
- Placeholder beds on imported wards.
- Human-readable occupation / state / nationality names.

---

## Run results

_Filled after the commands complete._

### Schema deploy

- Command: `npx prisma migrate deploy`
- Outcome: Applied `20260807190000_imaging_study_files` and `20260813160000_legacy_lookup_tables`. All migrations applied.

### WARDS

- Command: `npm run db:migrate-csv -- --only=wards`
- Log file: `Migration-Documents/logs/migrate-legacy-csv-2026-08-14T17-44-07-243Z.log`
- upserted / skipped / errors: **33 / 0 / 0**
- Seeded test wards (`MGEN` … `W1C`) left in place. Imported IDs 502–645 with `CODE=W{id}`. No beds created.

### PERSONS (0–10000)

- Command: `npm run db:migrate-csv -- --only=persons --offset=0 --limit=10000`
- Log file: `Migration-Documents/logs/migrate-legacy-csv-2026-08-14T17-44-48-381Z.log`
- Duration: ~42 minutes (17:44–18:26 UTC)
- upserted / skipped / errors: **10000 / 0 / 0**
- Notes from log:
  - `HMO_ID` cleared (FK mismatch): **363**
  - `HOSPITAL_NO` cleared (duplicate in CSV): **33**
  - unique-constraint retries: **0** (pre-nulling duplicates was enough)

### Post-import DB verification (2026-08-14)

| Check | Result |
|-------|--------|
| Legacy wards (`WARD_ID` ≥ 502) | 33 |
| Ward gender | Male 15, Female 7, Mixed 11 (Unisex remaining: 0) |
| Ward status | Active 31, Inactive 2 |
| `PERSONS` total | 10,000 |
| `PERSONS` with `STATUS='Active'` | 10,000 |
| `PERSONS` with `HOSPITAL_NO` null | 4,927 (= 4,894 blank + 33 duplicate clears) |
| `PERSONS` with `HMO_ID` set | 0 (all legacy HMO ids cleared) |
| `MAX(PERSON_ID)` | 31,770 (sequence reset to this) |

Seeded test wards (`MGEN` … `W1C`) remain. Imported wards still have **0 beds**. Remaining CSV persons start at `--offset=10000`.

### Verification queries (optional)

```sql
SELECT COUNT(*) FROM "WARDS" WHERE "WARD_ID" >= 502;
SELECT "GENDER", COUNT(*) FROM "WARDS" WHERE "CODE" LIKE 'W%' GROUP BY 1;
SELECT COUNT(*) FROM "PERSONS" WHERE "PERSON_ID" IN (SELECT "PERSON_ID" FROM "PERSONS");
SELECT "STATUS", COUNT(*) FROM "PERSONS" GROUP BY 1;
```
