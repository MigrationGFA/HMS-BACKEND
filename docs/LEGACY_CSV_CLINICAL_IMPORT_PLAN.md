# Next clinical CSV import: phases and safety fixes

**Date:** 17 Aug 2026 (implementation started 18 Aug 2026; steps 9–12 completed 3 Sep 2026)  
**Status:** Steps 0–12 complete. Resume from any step not marked ✅ in the Implementation table.  
**Audience:** engineering + anyone handing off this work  
**Related:** [LEGACY_DATA_MIGRATION.md](./LEGACY_DATA_MIGRATION.md), [LEGACY_CSV_IMPORT_WARDS_PERSONS.md](./LEGACY_CSV_IMPORT_WARDS_PERSONS.md), [LEGACY_CSV_DOCTOR_PHARMACY_PLAN.md](./LEGACY_CSV_DOCTOR_PHARMACY_PLAN.md) (DOCTORS/ + PHAMACY/ folder audit — next wave)

**Team policy (after walkthrough with the original importer author):** Keep **legacy primary keys** on every table, **especially `DEPARTMENT_ID`**. Map synonym columns (PIN / phone → temp password). Omit empty columns we do not have. Partial rows are OK. Old appointments are **staff-scheduled**; mark `creator_type=staff` vs future patient bookings. Do **not** naive-upsert departments onto live ids 1–11 — **move** the seed billing departments to unused ids first, then insert exact Aro ids from `DEPARTMENTS.csv`. **Disregard `DEPT.csv` entirely** (Oracle sample, not FNPH).

Plain-language summary: we have more spreadsheets from the old hospital system (appointments, admissions history, nurse notes, care plans, etc.). The new system stores that information in **different tables with different rules**. If we copy numbers blindly, we can attach old patients to the **wrong ward** or overwrite today’s test admissions. This document is the safe order and the fixes required.

---

## What is already in the live database (3 Sep 2026)

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
| Nursing care plans | 107 | From `NURS_CARE_PLAN.csv`; Sep 2026 re-run unchanged (107 upsert / 473 skip) |
| Nursing notes | **4,445** | 10 from `NOTES.csv` + 4,435 shift reports (3 Sep 2026) |
| Patient diagnoses | 13,940 | From `DIAGNOSIS.csv` (28 Aug 2026) |
| Nursing MAR | **3,849** | 1 seed + 3,848 from `DRUG_CHART.csv`; 3,847 updated from details |
| Nursing observations | **3,586** | From `FLUIDS.csv` (3 Sep 2026) |
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
| `NURSES_REPORT_SHEET.csv` | Per-patient shift narrative | **Yes** (Sep 2026 re-export) → `NURSING_NOTES` (`NOTE_TYPE=Shift`) — see Step 9 |
| `PATIENT_MED_HIST.csv` | Inpatient treatment plan / history | **No** — no matching table + broken HTML + missing patients |
| `NURSING_PROCESS.csv` (~28) | Admission nursing assessment | **Not yet** — needs form template + fuller patients — see hold list |

### Department files (17 Aug 2026)

| File | Useful? |
|------|---------|
| `DEPARTMENTS.csv` | **Yes — keep exact `DEPARTMENT_ID`.** Live billing rows 1–11 (Lab, Pharmacy, OPC…) **must be moved to new ids first**, then CSV rows inserted with ids 2, 6, 8, 12, 13, …. Naive overwrite would point Master Services at the wrong department. |
| `DEPT.csv` | **Disregard.** Oracle sample (`ACCOUNTING` / New York). Not FNPH. Do not import or use as a lookup. |

### Sep 2026 nursing extracts (8 new files)

Added 3 Sep 2026. Analyzed against Azure — legacy Oracle tables (`DRUG_CHART`, `FLUIDS`, `NURSES_REPORT_SHEET`, …) **do not exist** on the live DB; data must land on **modern `NURSING_*` tables** (or new archive tables — not recommended).

| File | Rows | Verdict | Target |
|------|------|---------|--------|
| `NURSES_REPORT_SHEET.csv` | 23,660 | **Migrate** (Step 9) | `NURSING_NOTES` |
| `DRUG_CHART.csv` | 3,848 | **Migrate** (Step 10) | `NURSING_MAR_ENTRIES` |
| `DRUG_CHART_DETAILS.csv` | 65,839 | **Migrate** (Step 10, after chart) | `NURSING_MAR_ENTRIES` (admin events) |
| `FLUIDS.csv` | 3,758 | **Migrate** (Step 11) | `NURSING_OBSERVATIONS` |
| `NURS_CARE_PLAN.csv` | 580 (re-export) | **Re-run** (Step 12) | `NURSING_CARE_PLANS` |
| `VITAL_SIGN_DETAILS.csv` | 1 (broken) | **No** — re-export needed | `NURSING_VITALS` |
| `WEIGHT_MONITORING.csv` | 7 (empty) | **No** — re-export needed | `NURSING_VITALS` |
| `NURSING_PROCESS.csv` | 28 | **Hold** | `NURSING_FORM_INSTANCES` + template |

**Analyze script:** `node scripts/analyze-new-csvs.mjs` (row counts, FK checks, content quality).

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

1. Remaining **and missing** patients: finish `PERSONS.csv` (5,205) **and** a dump covering ids **~37k–80k** used by admissions / care plans / med hist / nursing reports.
2. ~~Clean **`NURSES_REPORT_SHEET.csv`** with a header row~~ — **done** (Sep 2026 re-export; Step 9).
3. Re-export **`VITAL_SIGNS.csv` + `VITAL_SIGN_DETAILS.csv`** and **`WEIGHT_MONITORING.csv`** if historical vitals matter.
4. Optional: old **`WARDS` ids 1–10…** and **`BEDS`** if historical stays must show a real ward/bed. Without this, imported admissions have **no ward**.

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

### Phase 7 — on hold (do not migrate yet)

| File | Until |
|------|--------|
| `VITAL_SIGN_DETAILS.csv` / `WEIGHT_MONITORING.csv` | Proper re-export with headers and `PERSON_ID`; then map to `NURSING_VITALS` (pivot detail rows → structured columns) |
| `PATIENT_MED_HIST.csv` | Fuller `PERSONS` + a **new read-only archive table** (do not insert into `ENCOUNTERS`) |
| `NURSING_PROCESS.csv` | `NURSING_FORM_TEMPLATES` row for admission assessment + `NURSING_FORM_INSTANCES`; skip gibberish rows; 16/19 person ids still missing |
| `CASHIER_LEDGER.csv` | ~44k wallet cash deposits; no `BILL_ID`. Do **not** insert into `CASHIER_PAYMENT_RECEIPTS`. Archive until a wallet ledger exists. |

### Phase 8 — Sep 2026 nursing batch (steps 9–12)

Run **in order**. Each step uses `--only=…` in `migrate-legacy-csv.mjs` (to be implemented).

| Step | CSV | Target | Expected yield (Sep 2026 analysis) |
|------|-----|--------|-------------------------------------|
| 9 | `NURSES_REPORT_SHEET.csv` | `NURSING_NOTES` | ~5,000 upserts (rows with `PERSON_ID` + non-empty `REPORT`) |
| 10 | `DRUG_CHART.csv` + `DRUG_CHART_DETAILS.csv` | `NURSING_MAR_ENTRIES` | ~3,800 chart rows + up to ~65k admin events (batched) |
| 11 | `FLUIDS.csv` | `NURSING_OBSERVATIONS` | ~3,400 upserts (skip 67 missing persons) |
| 12 | `NURS_CARE_PLAN.csv` (re-run) | `NURSING_CARE_PLANS` | ~100–130 new/updated rows with content (107 already loaded) |

**Done when:** counts + logs; no change to admissions 1–4, wards 1–11, or receipts.

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
| 8 patient diagnoses | ✅ | 28 Aug 2026. `--only=patient_diagnoses` → upserted=13940 skipped=0 errors=0. Log: `Migration-Documents/logs/migrate-legacy-csv-2026-08-28T12-39-22-716Z.log` |
| 9 nurse shift reports | ✅ | 3 Sep 2026. `--only=nurse_shift_reports` → upserted=4435 skipped=19225 errors=0. Log: `Migration-Documents/logs/migrate-legacy-csv-2026-09-03T07-21-07-546Z.log` |
| 10 drug chart / MAR | ✅ | 3 Sep 2026. `--only=drug_chart` upserted=3848 skipped=0; `--only=drug_chart_details` updated=3847 skipped=0 (1 chart had no admin rows). Seed `MAR_ID=1` unchanged. Same log. |
| 11 fluids | ✅ | 3 Sep 2026. `--only=fluids` → upserted=3586 skipped=172 errors=0 (missing persons). Same log. |
| 12 care plans re-run | ✅ | 3 Sep 2026. `--only=nursing_care_plans` → upserted=107 skipped=473 errors=0 (same yield as 18 Aug). Same log. |

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

### Step 8 — patient diagnoses

`--only=patient_diagnoses` from `DIAGNOSIS.csv`. Batched upsert (100 rows) into `PATIENT_DIAGNOSES`; preserves exact `DIAGNOSIS_ID` → `PATIENT_DIAGNOSIS_ID`. `ADMISSION_ID` stored in `NOTES` as `legacy_admission_id=…`. Synthetic `CODE`/`NAME` for rows without description/thesaurus/disease lookup files.

### Step 9 — nurse shift reports → nursing notes

`--only=nurse_shift_reports` from `NURSES_REPORT_SHEET.csv` (~23,660 rows).

**Why `NURSING_NOTES` not `NURSING_HANDOVERS`:** each row is a **per-patient shift narrative**, not a ward-level handover summary. Handovers are ward-centric with `CRITICAL_PATIENTS_JSON`; this file is patient-centric HTML prose.

**Skip rules:**

- No `PERSON_ID` or person not in `PERSONS` (expect ~15,586 row skips).
- Empty / whitespace-only `REPORT` (expect ~18,468 row skips).
- `WARD_ID` not in 502–645 → store null (rule 2); do not attach seed wards 1–11.
- `ADMISSION_ID` only if that stay exists in `ADMISSIONS`; else null (most CSV rows have no admission id).

**Mapping → `NURSING_NOTES`:**

| CSV | Target |
|-----|--------|
| `NURSES_REPORT_SHEET_ID` | `NOTE_ID` (exact PK) |
| `PERSON_ID` | `PERSON_ID` |
| `REPORT` | `BODY` (keep HTML) |
| `SHIFT` Morning / Afternoon / Evening | `NOTE_TYPE=Shift`; map `Evening` → treat as shift note (not handover `Night` unless product asks) |
| `DATE_TIME` or `CREATED_DATE` | `CREATED_DATE` (Oracle + legacy date parsers) |
| `CREATED_BY` | `AUTHOR_BY` (string) |
| `ADMISSION_ID` | `ADMISSION_ID` if imported stay exists |
| — | `FORMAT=Narrative` |

**Expected:** ~5,000 upserts. Batched upsert (100 rows) like patient diagnoses.

### Step 10 — drug chart → MAR

Two CSVs, **one importer run** or `--only=drug_chart,drug_chart_details` in sequence (parent before admin details).

Legacy Oracle tables `DRUG_CHART` / `DRUG_CHART_DETAILS` are **not** on Azure. Transform into **`NURSING_MAR_ENTRIES`** (Medication Administration Record) — the table the nursing module already uses.

**Step 10a — chart headers (`DRUG_CHART.csv`, 3,848 rows):**

| CSV | Target |
|-----|--------|
| `DRUG_CHART_ID` | `MAR_ID` (exact PK) |
| `PERSON_ID` | `PERSON_ID` (skip if missing — all 613 unique ids currently match `PERSONS`) |
| `NAME_DRUG` | `DRUG` |
| `DOSAGE` | `DOSE` |
| `DOSAGE_DATE` or earliest detail time | `SCHEDULED_TIME` |
| `ADMISSION_ID` | `ADMISSION_ID` only if stay exists (~136 admission ids in CSV not in `ADMISSIONS` → null) |
| `CREATED_BY` | `PRESCRIBER` or `SOURCE=legacy-drug-chart` |
| — | `KIND=External` (not linked to live pharmacy orders) |
| — | `STATUS=PENDING` until details applied |
| — | `ROUTE` / `FREQUENCY` null unless inferable from drug name |

**Step 10b — administrations (`DRUG_CHART_DETAILS.csv`, 65,839 rows):**

For each detail row whose `DRUG_CHART_ID` exists (0 orphans vs parent CSV):

| CSV | Target |
|-----|--------|
| `DATE_TIME` / `ADMINISTER_DATE` | `ADMINISTERED_AT` |
| `STATUS` `1` / given | `STATUS=GIVEN` |
| other status | `STATUS=MISSED` or `HELD` (document mapping in importer) |
| `NURSE_ID` | `ADMINISTERED_BY` (stringified user id if no name lookup) |
| `DOSAGE` | append to `NOTES` if differs from chart dose |

If multiple detail rows exist for one chart, **update the MAR row** from the latest `GIVEN` event; optionally insert additional MAR rows only when product requires one row per administration (prefer single MAR per chart + `NOTES` listing all admin times to avoid 65k duplicate drug names).

**Alternative (not default):** recreate legacy `DRUG_CHART` tables via Prisma migration — only if MAR transform is rejected. Would not appear in the nursing UI without new API work.

**Expected:** ~3,800 MAR headers; detail pass updates status/timestamps. Batched upserts mandatory (65k+ rows).

### Step 11 — fluids → nursing observations

`--only=fluids` from `FLUIDS.csv` (3,758 rows).

Legacy `FLUIDS` table is **not** on Azure. Store as **`NURSING_OBSERVATIONS`** with structured JSON — same pattern as live intake/output charts.

| CSV | Target |
|-----|--------|
| `FLUID_ID` | `OBSERVATION_ID` (exact PK) |
| `PERSON_ID` | `PERSON_ID` (skip if missing — 67 unique ids not in `PERSONS`) |
| `ADMISSION_ID` | `ADMISSION_ID` if stay exists (~313 admission ids missing → null) |
| `I_*` / `O_*` / `I_TIME` / `O_TIME` / `REMARK` | `FIELDS_JSON` (preserve all legacy column names as keys) |
| — | `CHART=IntakeOutput` |
| `CREATED_DATE` / `I_TIME` | `RECORDED_AT` (best available timestamp) |
| `CREATED_BY` | `RECORDED_BY` (string) |

**Skip:** rows with no `PERSON_ID`. **Expected:** ~3,400 upserts.

### Step 12 — care plans re-run (idempotent)

Re-run existing `--only=nursing_care_plans` against the **Sep 2026 re-export** of `NURS_CARE_PLAN.csv` (580 rows; 107 already loaded 18 Aug).

Same mapping as Step 6. Upsert by `NURS_CARE_PLAN_ID` → `CARE_PLAN_ID` so re-run is safe.

**Skip:** empty plans (451 rows with no diagnosis/goal/action/evaluation); missing `PERSON_ID` (405 rows); person not in `PERSONS` (29 unique ids).

**Expected:** up to ~129 rows with content; net new rows depends on overlap with the 107 already imported. Log skipped vs upserted counts.

### Will not implement (yet)

`DEPT.csv` · `CASHIER_LEDGER` → receipts · `PATIENT_MED_HIST` → encounters · `NURSING_PROCESS` (until form template) · `VITAL_SIGN_DETAILS.csv` / `WEIGHT_MONITORING.csv` (broken exports) · reload `USERS` / `WARDS` · legacy archive tables `DRUG_CHART` / `FLUIDS` / `NURSES_REPORT_SHEET` (prefer modern `NURSING_*` mapping above).

### Verify after each step

Counts + log. Wards 1–11 and admissions 1–4 unchanged. Receipts not +44k. After step 2: `DEPARTMENT_ID=8` is Diagnostic; PHARM services still billed. After steps 9–12: `NURSING_NOTES` / `NURSING_MAR_ENTRIES` / `NURSING_OBSERVATIONS` / `NURSING_CARE_PLANS` counts match log upsert totals.
