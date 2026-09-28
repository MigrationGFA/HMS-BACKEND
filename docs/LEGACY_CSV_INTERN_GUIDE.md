# Legacy data move — full intern briefing

**Date:** 18 Aug 2026  
**Covers:** wards & patients already loaded · clinical spreadsheets · `DEPARTMENTS.csv` / `DEPT.csv` · `CASHIER_LEDGER.csv`  
**Status:** Implementation steps 0–7 done (18 Aug 2026). Follow-ups, admissions, care plans, and partial nurse notes loaded.  
**Technical extras:** [LEGACY_DATA_MIGRATION.md](./LEGACY_DATA_MIGRATION.md) · [LEGACY_CSV_IMPORT_WARDS_PERSONS.md](./LEGACY_CSV_IMPORT_WARDS_PERSONS.md) · [LEGACY_CSV_CLINICAL_IMPORT_PLAN.md](./LEGACY_CSV_CLINICAL_IMPORT_PLAN.md)

---

## 1. What we are doing

The hospital used to run on an **old computer**. We are moving that history into the **new** one.

The old system sent us **spreadsheets** (CSV files) in the folder `Migration-Documents/`. A script can copy them into the new database, **keeping the old identity numbers** (so later sheets can still say “this is person 14”).

The new app is **not empty**. It already has practice wards, billing departments, a few test admissions, and staff logins. Those drawers already have numbers on them. If we paste old numbers on top, the screens will **lie** (wrong ward, wrong department, fake bill payments, wiped test stays).

Imagine two offices that both use locker **#8**. In the old office, 8 was “Diagnostic.” In the new office, 8 is already “Pharmacy.” You cannot copy “8” without putting Diagnostic patients/prices into Pharmacy’s locker.

---

## 2. What is already in the new system

**Moved on 14 Aug 2026**

- **33 real Aro / Lantoro wards.** Old “Unisex” was stored as **Mixed** so the admit screen can offer them to men and women. Two discontinued wards are Inactive. **These wards have no beds yet.**
- **10,000 patients** (first chunk). Everyone marked **Active**. Duplicate hospital numbers nulled; bad insurance links dropped.
- **Staff logins** were already there (~1,239). **Do not load staff again.**

**Moved on 18 Aug 2026**

- **Remaining 5,205 patients** from `PERSONS.csv` (DB now **15,205**; file max id 37,101). Still missing old-system people numbered ~70,000+.
- **Aro departments** with **exact old ids.** Seed billing drawers that sat on 2/6/8/9 were moved to 103/100/101/102 so **8 is Diagnostic** and catalog Pharmacy (`PHARM`) is **101**.
- **34 clinics.** Junk row `662 xxxxxxxx` skipped.
- **1,905 follow-ups** from old appointments (`CREATOR_TYPE=staff`; not public bookings).
- **1,248 historical admissions** (collapsed ward-move log; test admissions 1–4 untouched).
- **107 nursing care plans** and **10 nurse notes** (large skips — most patients in those files are id 70k+ and not in `PERSONS.csv`).

**The new app also already had (leave these alone)**

- **11 practice wards numbered 1–11** (ICU, VIP, Female General, …) **with 220 beds**.
- **4 test admissions numbered 1–4.**

**Still not moved:** Aro beds · wallet cash history · patients id 70k+ · clean nurses' report / med hist exports.

---

## 3. Three rules (say these out loud)

1. **Patient first.** If a spreadsheet talks about a person we never loaded, **skip that line**. Do not invent a blank patient.
2. **Keep old identity numbers** (person, clinic, department, appointment…). Other sheets already point at them. **Especially department ids.**
3. **Same meaning, different header:** map it (staff PIN / last 4 of phone as first password). Empty columns we don’t have: **leave blank**. Incomplete rows are OK.
4. **Ward 1–11 and admissions 1–4** are today’s practice data — don’t overwrite those **ward/admission** lockers. Department 1–11 is different: we **relocate** Lab/Pharmacy to new ids so Aro can keep 8 = Diagnostic.

Safer: an old admission **with no ward** than an admission on the **wrong** ward.  
Safer: wallet cash sitting in an archive than 44,000 fake **bill receipts**.

Nobody runs an import just because a new file appeared in the folder.

---

## 4. Every spreadsheet, intern cheat sheet

### Already used or waiting in line

| File | Plain meaning | What we do |
|------|----------------|------------|
| `WARDS.csv` | Real hospital wards | **Done** |
| `PERSONS.csv` | Patients (~15,205) | **Done** (15,205). File does **not** include people numbered ~70,000+ who show up on other sheets. |
| `USERS.csv` | Staff | **Already in DB. Do not reload.** |
| `CLINICS.csv` | Outpatient clinics (Psychology, GOPC, surgery…) | **Done** (34). Junk `662 xxxxxxxx` skipped. |
| `ROLES.csv`, `USER_TYPE.csv`, `DOCTORS.csv` | Job titles / a short doctor catalogue | Not this batch. The doctors catalogue (ids ~264–304) is **not** the same as appointment doctor ids (~4896). |

### Clinical (plan written — not run)

| File | Plain meaning | Safe home | Catch |
|------|----------------|-----------|--------|
| `APPOINTMENTS.csv` (~1,989) | “Come back on this date” (doctor scheduled, not patient website booking) | Doctor **follow-up list**, mark **created by staff** | Do **not** put on the **public website booking** list. Fill date/doctor/patient; leave the rest blank if missing. Skip if patient or staff login missing. |
| `ADMISSION_HISTORY.csv` (~1,759) | **Diary of ward moves**, not one line = one stay | **One admission card per stay** | Do **not** copy ward/bed numbers 1–11 or beds like 1402. Fold many lines into one stay. Skip / don’t overwrite admissions **1–4**. |
| `NURS_CARE_PLAN.csv` (~580) | Nursing care plans | Nursing care plans | Skip empty lines. Many people are id 70,000+ — **we don’t have them.** |
| `NOTES.csv` | Nurse notes | Nursing notes | Current file is a **broken HTML snippet**. Need a clean export first. |

### Departments (last batch of files)

| File | Plain meaning | What we do |
|------|----------------|------------|
| `DEPARTMENTS.csv` | Real old groups: **8 Diagnostic**, **12 Clinical**, **13 Specialist**… | **Done 18 Aug.** Seed OPC/PHARM/RAD/CAP moved off 6/8/9/2 to 100–103. Aro ids kept. **Never** paste 8 on top of Pharmacy without moving Pharmacy. |
| `DEPT.csv` | Accounting / New York… | **Disregard.** Not hospital data. Do not import. |

### Cashier (last file)

| File | Plain meaning | What we do |
|------|----------------|------------|
| `CASHIER_LEDGER.csv` (~44,449) | Old cash desk notebook: **cash paid into a patient’s hospital wallet** (“Cash Deposit to Wallet by…”). **No bill number on any row.** | **Useful history. Do not dump into the live cashier receipt book.** Receipts are for lab/pharmacy/admission **bills**. This would look like 44,000 extra bill payments that never happened. We have **no wallet-history drawer** yet. ~10,000 rows are people we have not loaded. Keep the file; import only if we build wallet history later, and skip missing patients. |

### Hold — do not import

| File | Why |
|------|-----|
| `NURSES_REPORT_SHEET.csv` | Not a spreadsheet — a raw SQL dump |
| `PATIENT_MED_HIST.csv` | Broken HTML; no matching drawer; mostly unknown patients |
| `NURSING_PROCESS.csv` | Tiny, lots of gibberish, no matching drawer |
| `DEPT.csv` | **Disregard** — not FNPH |
| `CASHIER_LEDGER.csv` | Archive only until a wallet-history place exists (see above) |

---

## 5. Order of work

**Done 18 Aug:** remaining patients · departments · clinics · follow-ups · admissions · care plans · partial nurse notes.

**Next (when data exists):**

1. Fuller **PERSONS** extract (70k+ ids) to reduce skip rates on care plans / admissions / notes.
2. **Beds** extract for Aro wards 502–645.
3. Clean **`NURSES_REPORT_SHEET.csv`**, **`NOTES.csv` re-export**, wallet ledger table for `CASHIER_LEDGER.csv`.
4. Leave: report dump, med hist → encounters, nursing process, `DEPT.csv`, cashier ledger in receipts, staff reload.

We still need from the old system, eventually: **beds**, **patients in the 70,000s**, a real **nurses’ report** spreadsheet, and a **wallet history** place if we want those 44k deposits on screen.

Without beds, Aro wards **show on the list** but Records **cannot assign a bed** there. Practice wards still have 20 beds each.

---

## 6. What “go” means

Product or engineering names the **phase**. After each phase: count rows; practice **wards 1–11** and **admissions 1–4** unchanged; cashier **receipts** not flooded; after department move, Lab/Pharmacy **services still work** and Aro **8 = Diagnostic**.
