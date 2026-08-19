# Next clinical CSV import: phases and safety fixes

**Date:** 17 Aug 2026 (implementation started 18 Aug 2026)  
**Status:** Implementation steps 0–7 complete (18 Aug 2026). Resume from any step not marked ✅ in the Implementation table.  
**Audience:** engineering + anyone handing off this work  
**Related:** [LEGACY_DATA_MIGRATION.md](./LEGACY_DATA_MIGRATION.md), [LEGACY_CSV_IMPORT_WARDS_PERSONS.md](./LEGACY_CSV_IMPORT_WARDS_PERSONS.md)

**Team policy (after walkthrough with the original importer author):** Keep **legacy primary keys** on every table, **especially `DEPARTMENT_ID`**. Map synonym columns (PIN / phone → temp password). Omit empty columns we do not have. Partial rows are OK. Old appointments are **staff-scheduled**; mark `creator_type=staff` vs future patient bookings. Do **not** naive-upsert departments onto live ids 1–11 — **move** the seed billing departments to unused ids first, then insert exact Aro ids from `DEPARTMENTS.csv`. **Disregard `DEPT.csv` entirely** (Oracle sample, not FNPH).

Plain-language summary: we have more spreadsheets from the old hospital system (appointments, admissions history, nurse notes, care plans, etc.). The new system stores that information in **different tables with different rules**. If we copy numbers blindly, we can attach old patients to the **wrong ward** or overwrite today’s test admissions. This document is the safe order and the fixes required.

---

## What is already in the live database (18 Aug 2026)

| Data | Count | Notes |
|------|-------|--------|
| Patients (`PERSONS`) | 15,205 | Full `PERSONS.csv` (10k on 14 Aug + 5,205 on 18 Aug). File max id **37,101**. Clinical extracts still reference 70k+ ids that are **not** in this file. |
| Remaining in `PERSONS.csv` | 0 | Loaded. Still missing old-system patients ~37k–80k (not in this CSV). |
| Staff (`USERS`) | 1,239 | Already present — **do not re-import** unless asked |
| Legacy Aro wards | 33 | IDs 502–645. **Zero beds** |
| Seeded test wards | 11 | IDs **1–11** (`W1C`, `ICU`, `FGEN`, …) with 220 beds |
| Clinics | 34 | `CLINICS.csv` loaded 18 Aug; junk `662 xxxxxxxx` skipped |
| Departments | 11 seed + 11 Aro | Seed 2/6/8/9 relocated to 103/100/101/102. Aro ids: 8=Diagnostic, 9=Pharmacy (`PHARMACY`), 12=Clinical, … |
| Follow-ups | 1,905 | From `APPOINTMENTS.csv` (18 Aug); `CREATOR_TYPE=staff` |
| Nursing care plans | 107 | From `NURS_CARE_PLAN.csv`; large skip rate (missing 70k+ patients) |
| Nursing notes | 10 | From partial `NOTES.csv` |
| Admissions | **1,252** (4 test + 1,248 legacy) | Collapsed `ADMISSION_HISTORY.csv`; test ids 1–4 unchanged |
| Encounters / clinical notes | 4 / 1 | Do **not** dump legacy extracts here |

---

## The seven new CSVs

| File | Old system meaning | Can go into today’s HMS? |
|------|--------------------|---------------------------|
| `APPOINTMENTS.csv` (~1,989) | Clinic follow-up bookings | Yes → `FOLLOW_UPS`, with mapping |
| `ADMISSION_HISTORY.csv` (~1,759) | Ward moves during a stay | Yes → `ADMISSIONS`, **collapsed** + **no raw ward/bed ids** |
| `NURS_CARE_PLAN.csv` (~580) | Nursing care plans | Yes → `NURSING_CARE_PLANS`, skip empties / missing patients |
| `NOTES.csv` (~11 real notes) | Nurse progress notes | Yes → `NURSING_NOTES` after a **clean re-export** |
| `NURSES_REPORT_SHEET.csv` | Shift report | **No** — not a real CSV (SQL dump) |
| `PATIENT_MED_HIST.csv` | Inpatient treatment plan / history | **No** — no matching table + broken HTML + missing patients |
| `NURSING_PROCESS.csv` (~28) | Admission nursing assessment | **No** — no table + mostly junk / missing patients |

### Department files (17 Aug 2026)

| File | Useful? |
|------|---------|
| `DEPARTMENTS.csv` | **Yes — keep exact `DEPARTMENT_ID`.** Live billing rows 1–11 (Lab, Pharmacy, OPC…) **must be moved to new ids first**, then CSV rows inserted with ids 2, 6, 8, 12, 13, …. Naive overwrite would point Master Services at the wrong department. |
| `DEPT.csv` | **Disregard.** Oracle sample (`ACCOUNTING` / New York). Not FNPH. Do not import or use as a lookup. |

---

## Hard rules (fixes that prevent breakage)

These are not optional. An importer that ignores them can silently corrupt inpatient screens.

### 1. Patient must already exist

Every clinical row has a `PERSON_ID` (patient number from the old system).

- If that patient is **not** in `PERSONS`, **skip the row** and log it.
- Do **not** create empty patient records to make the import succeed.
- Many rows use ids **74,000–79,000**. Those people are **not** in `PERSONS.csv` (file max ~37,101). They wait for a fuller patient extract from the old system.

### 2. Never copy old ward numbers 1–11 (or old bed numbers)

The old admission file says things like “ward 8, bed 1402”.

In the new database, **ward 8 is already Female General Ward** (a seed/test ward with real beds). Copying “8” would make historical Aro patients look like they live on that test ward and would mess up occupancy.

**Fix:** store `WARD_ID` and `BED_ID` as **empty (NULL)** on imported admissions, **except** when the id is one we already imported from `WARDS.csv` (502–645, e.g. 542). Do not invent beds.

### 3. Do not overwrite admissions 1–4

The database already has four test admissions with ids 1–4. The history file also contains small `ADMISSION_ID` values (down to 4).

**Fix:** only keep exact legacy admission ids when `ADMISSION_ID ≥ 100`. Smaller ids → skip or assign a new id after the sequence (prefer skip + log).

### 4. Collapse admission history

`ADMISSION_HISTORY.csv` is **not** “one row = one hospital stay”. It is a **log of ward changes** (same stay, several rows).

Today’s `ADMISSIONS` table is **one row per stay**.

**Fix:** group by `ADMISSION_ID`:

- Keep that `ADMISSION_ID` (if ≥ 100)
- `ADMITTED_AT` = earliest `ADMISSION_DATE`
- `DISCHARGED_AT` = latest `DISCHARGE_DATE` (or null if still open)
- `STATUS` = `DISCHARGED` if there is a discharge date, else `ADMITTED`
- `DISCHARGE_REASON` = last `DISCHARGE_TYPE` (`Normal Discharge`, `Death of Patient`, …)
- Ward/bed = rule 2

Oracle timestamps (`02-FEB-20 09.27.52.000000 PM`) need a parser; the current CSV script only handles `25-Aug-23`.

### 5. Appointments go to follow-ups, not online bookings

`FOLLOW_UPS` is empty and is the doctor follow-up list. `SERVICE_BOOKINGS` is the **public website** booking queue (there is already 1 row) — do not mix old clinic appointments into it.

`FOLLOW_UPS` requires a **staff user** as doctor. Legacy `DOCTOR_ID` (e.g. 4896) is a **user id**, not a row in `DOCTORS.csv` (those are 264–304).

**Fix:**

- Import `CLINICS.csv` first so we can resolve clinic **names**
- Set `FOLLOW_UP_ID` = `APPOINTMENT_ID`
- `DOCTOR_ID` = CSV `DOCTOR_ID` **only if that `USERS` row exists**; else skip
- `PERSON_ID` skip if patient missing
- `CLINIC` = clinic **name** text (not `CLINIC_ID`; follow-ups have no clinic FK)
- Status: `Pending` / `BOOKED` → `Scheduled`; `Fulfilled` → `Attended`
- `REASON` / description from `DESCIPTION` (legacy typo)

### 6. Do not use encounters or doctor clinical notes

`ENCOUNTERS` requires a triage row. `CLINICAL_NOTES` requires a staff author. Forcing fake triage/encounters would show junk in the doctor consult queue.

Nurse notes → `NURSING_NOTES` only. Care plans → `NURSING_CARE_PLANS` only.

### 7. Do not re-run the staff (`USERS`) import

Users are already loaded. Re-running is mostly PIN-safe but is extra risk and not needed for this batch.

### 8. Skip empty / broken rows

- Care plans with no diagnosis and no actions
- `NOTES.csv` continuation lines that are HTML fragments, not notes
- Any row with no usable `PERSON_ID`

---

## Phases (run in this order)

Do **not** skip ahead. Each phase depends on the one before.

### Phase 0 — extracts we still need (people / blockers)

Ask the old-system team for:

1. Remaining **and missing** patients: finish `PERSONS.csv` (5,205) **and** a dump covering ids **~37k–80k** used by admissions / care plans / med hist.
2. Clean **`NURSES_REPORT_SHEET.csv`** with a header row (not `SQL>` output).
3. Optional: old **`WARDS` ids 1–10…** and **`BEDS`** if historical stays must show a real ward/bed. Without this, imported admissions have **no ward**.

Phase 1–3 can start **without** (2) and (3). Phase 4+ is weak until (1) exists.

### Phase 1 — finish patients we already have

```bash
npm run db:migrate-csv -- --only=persons --offset=10000 --limit=5205
```

Same rules as the first 10k (`STATUS=Active`, duplicate `HOSPITAL_NO` nulled, bad `HMO_ID` cleared).

**Done when:** `PERSONS` count ≈ 15,205 (minus skipped nameless rows).

### Phase 2 — clinics

Importer already supports `--only=clinics`. Skip junk row `662 xxxxxxxx`.

**Done when:** `CLINICS` has ~35 rows; ids such as 1, 478, 534 exist.

### Phase 3 — appointments → follow-ups

New importer path (not written yet). Apply rule 5. Expected: most of ~1,989 rows if persons 2–8389 are in the 15k file and users 4837/4896/… exist.

**Done when:** `FOLLOW_UPS` populated; log lists skipped missing person/doctor; **zero** new `SERVICE_BOOKINGS`.

### Phase 4 — collapsed admissions

New importer path with Oracle dates + rules 2–4.

**Done when:** unique `ADMISSION_ID`s inserted (expect well under 1,382 after skipping missing patients and ids &lt; 100); seeded wards 1–11 occupancy **unchanged**; `ADMISSIONS` ids 1–4 **unchanged**.

### Phase 5 — nursing care plans

Map:

| CSV | `NURSING_CARE_PLANS` |
|-----|----------------------|
| `NURS_CARE_PLAN_ID` | `CARE_PLAN_ID` |
| `NURS_DIAGNOSIS` | `DIAGNOSIS` |
| `OBJECTIVES` | `GOAL` |
| `NURS_ACTION` | `INTERVENTION` |
| `EVALUATION` | `EVALUATION` |
| `NURSES_INITIALS` / `CREATED_BY` | `CREATED_BY` |
| `DATE_TIME` | `CREATED_DATE` |
| `STATUS` | `active` |

Set `ADMISSION_ID` only if that stay exists from phase 4; else null. Skip empty and missing-person rows. **Expect a large skip rate** until 70k patients exist.

### Phase 6 — nurse notes

Requires a **proper `NOTES.csv` re-export** (current file is ~2 KB of broken HTML). Then `NOTE_ID` → `NOTE_ID`, `DESCRIPTION` → `BODY`, `NURSE_DOCTOR=NURSE` → `NOTE_TYPE` Progress/Shift, `CREATED_BY` as `AUTHOR_BY` (string, not a user FK). Null `ADMISSION_ID` if the stay was not imported.

### Phase 7 — on hold (do not migrate)

| File | Until |
|------|--------|
| `NURSES_REPORT_SHEET.csv` | Real CSV with columns matching old `NURSES_REPORT_SHEET`; then `NURSING_HANDOVERS` or `NURSING_NOTES`; map `Evening` → `Night` |
| `PATIENT_MED_HIST.csv` | Fuller `PERSONS` + a **new read-only archive table** (do not insert into `ENCOUNTERS`) |
| `NURSING_PROCESS.csv` | Decision to add a form template + JSON instances; skip gibberish rows |
| `CASHIER_LEDGER.csv` | ~44k wallet cash deposits; no `BILL_ID`. Do **not** insert into `CASHIER_PAYMENT_RECEIPTS`. Archive until a wallet ledger exists. |
| Departments | **Keep exact Aro `DEPARTMENT_ID`s.** Relocate seed Lab/Pharmacy/OPC/… off ids 1–11, then load `DEPARTMENTS.csv`. Ignore `DEPT.csv`. |

---

## What this will **not** fix

- Aro wards (502+) still have **no beds**. Records cannot allocate beds on those wards until a beds extract exists. The 11 test wards keep their 20 beds each.
- Occupation / state of origin on patients stay as **numbers** (lookup CSVs still missing).
- Historical admissions may appear **without a ward name** (safer than a **wrong** ward).
- Patients only on the old system with ids 70k+ stay invisible until a new persons file.

---

## Out of scope for this plan

Re-importing `USERS`, `ROLES`, `USER_TYPE`, `DOCTORS`, `WARDS`.  
Putting data into `ENCOUNTERS`, `SERVICE_BOOKINGS` (legacy appointments go to `FOLLOW_UPS` with `creator_type=staff`).  
Naive overwrite of `DEPARTMENTS` 1–11 without moving seed services. `DEPT.csv` is ignored.

---

## Implementation (how we will actually do it)

**Run started 18 Aug 2026.** If a later session resumes, skip any step already marked ✅.

| Step | Status | Notes |
|------|--------|--------|
| 0 schema `CREATOR_TYPE` | ✅ | 18 Aug 2026. Prisma `20260818120000_follow_ups_creator_type` applied on Azure. `FOLLOW_UPS.CREATOR_TYPE` VARCHAR(20) NOT NULL default `staff` + index. |
| 1 remaining persons | ✅ | 18 Aug 2026. `--only=persons --offset=10000 --limit=5205` → upserted=5205 skipped=0 errors=0. Log: `Migration-Documents/logs/migrate-legacy-csv-2026-08-18T06-18-28-689Z.log` |
| 2 departments | ✅ | 18 Aug 2026. Relocated seed 6 OPC→100, 8 PHARM→101, 9 RAD→102, 2 CAP→103. Upserted 11 CSV rows. id 8=Diagnostic (DIAG, 0 services); PHARM billing row is 101; RAD services (18) followed to 102. Log: `Migration-Documents/logs/migrate-legacy-csv-2026-08-18T06-43-04-015Z.log` |
| 3 clinics | ✅ | 18 Aug 2026. upserted=34 skipped=1 (CLINIC_ID 662 junk name) errors=0. Ids 1, 478, 534 present. Log: `Migration-Documents/logs/migrate-legacy-csv-2026-08-18T06-43-49-023Z.log` |
| 4 follow-ups | ✅ | 18 Aug 2026. `--only=follow_ups` → upserted=1905 skipped=84 errors=0. Log: `Migration-Documents/logs/migrate-legacy-csv-2026-08-18T06-49-18-138Z.log` |
| 5 admissions | ✅ | 18 Aug 2026. `--only=admissions` → upserted=1248 skipped=169 errors=0 (collapsed history; ids &lt;100 protected). Log: `Migration-Documents/logs/migrate-legacy-csv-2026-08-18T06-55-35-100Z.log` |
| 6 care plans | ✅ | 18 Aug 2026. `--only=nursing_care_plans` → upserted=107 skipped=473 errors=0. Log: `Migration-Documents/logs/migrate-legacy-csv-2026-08-18T07-01-05-358Z.log` |
| 7 notes | ✅ | 18 Aug 2026. `--only=nursing_notes` → upserted=10 skipped=17 errors=0. Log: `Migration-Documents/logs/migrate-legacy-csv-2026-08-18T07-01-29-204Z.log` |

Work stays in `scripts/migrate-legacy-csv.mjs` plus one Prisma migration. Logs under `Migration-Documents/logs/`. Same DB as `npm run db:test`.

**Shared rules in every importer:** keep exact legacy PKs; map synonym columns; omit columns we do not have; skip row if `PERSON_ID` missing from `PERSONS`; skip empty shells; never write `DEPT.csv` or `CASHIER_LEDGER` into receipts.

### Step 0 — schema (once)

Prisma migration:

- `FOLLOW_UPS.CREATOR_TYPE` `VARCHAR(20)` not null default `staff` (`staff` | `patient`). Public website bookings stay on `SERVICE_BOOKINGS` (`patient`).
- Optional later: `SERVICE_BOOKINGS` does not need the column if we keep two tables.

### Step 1 — remaining patients (existing script)

```bash
npm run db:migrate-csv -- --only=persons --offset=10000 --limit=5205
```

Already handles `STATUS=Active`, duplicate `HOSPITAL_NO`, bad `HMO_ID`.

### Step 2 — departments (new: relocate then load)

`DEPARTMENTS.csv` only. **Disregard `DEPT.csv`.**

Colliding live ids vs CSV: **2, 6, 8, 9** (Child Psychiatry, OPC, Pharmacy/PHARM, Radiology). CSV wants 2 Revenue, 6 Nursing, 8 Diagnostic, 9 Pharmacy.

In one transaction:

1. Pick unused ids ≥ 100 for those four seed rows.
2. Update `MASTER_SERVICES.DEPARTMENT_ID` (and any other FKs) to the new ids.
3. Update `DEPARTMENTS` PKs for those four (or insert new + delete old).
4. Upsert `DEPARTMENTS.csv` with **exact** `DEPARTMENT_ID` + `NAME`; invent `CODE` from name (`DIAG`, `CLIN`, `SPEC`, …) where empty.
5. Ids 1, 3, 4, 5, 7, 10, 11 (Lab, ER, …) can stay — CSV does not use them.

Verify: service `CODE=PHARM` still points at the **moved** pharmacy row, not Diagnostic 8.

### Step 3 — clinics (existing script)

```bash
npm run db:migrate-csv -- --only=clinics
```

Skip junk `662 xxxxxxxx`. Store `DEPARTMENT_ID` 8/12/13 as-is (now those rows exist).

### Step 4 — appointments → follow-ups (new importer)

`--only=follow_ups` from `APPOINTMENTS.csv`.

| CSV | `FOLLOW_UPS` |
|-----|----------------|
| `APPOINTMENT_ID` | `FOLLOW_UP_ID` (exact) |
| `PERSON_ID` | `PERSON_ID` (skip if missing) |
| `DOCTOR_ID` | `DOCTOR_ID` → `USERS` (skip if user missing) |
| `APPOINTMENT_DATE` / `TIME` | `SCHEDULED_DATE` / `SCHEDULED_TIME` |
| `DESCIPTION` | `REASON` |
| clinic name from `CLINIC_ID` | `CLINIC` (text) |
| `Pending` / `BOOKED` | `Scheduled` |
| `Fulfilled` | `Attended` |
| — | `CREATOR_TYPE=staff` |
| — | `ENCOUNTER_ID` null |

Do **not** insert `SERVICE_BOOKINGS`.

### Step 5 — admissions (new importer)

`--only=admissions` from `ADMISSION_HISTORY.csv`. Group by `ADMISSION_ID`:

- Keep `ADMISSION_ID` only if ≥ 100 (do not touch live 1–4).
- `ADMITTED_AT` = min date; `DISCHARGED_AT` = max discharge; `STATUS` = `DISCHARGED` if discharged else `ADMITTED`.
- `WARD_ID` / `BED_ID` = null unless ward id is 502–645.
- Skip missing `PERSON_ID`.
- Parse Oracle `02-FEB-20 09.27.52 PM`.

### Step 6 — care plans (new importer)

`--only=nursing_care_plans`. Map diagnosis/goal/action/evaluation. Skip empty and missing persons. `ADMISSION_ID` only if that stay exists.

### Step 7 — notes (only after a clean CSV)

`--only=nursing_notes`. Partial HTML file stays skipped until re-exported.

### Will not implement

`DEPT.csv` · `CASHIER_LEDGER` → receipts · `NURSES_REPORT_SHEET` dump · `PATIENT_MED_HIST` → encounters · `NURSING_PROCESS` · reload `USERS` / `WARDS`.

### Verify after each step

Counts + log. Wards 1–11 and admissions 1–4 unchanged. Receipts not +44k. After step 2: `DEPARTMENT_ID=8` is Diagnostic; PHARM services still billed.
