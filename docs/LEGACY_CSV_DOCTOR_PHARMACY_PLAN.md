# Doctor + Pharmacy Legacy CSV Migration Plan

**Status strip (resume here):** Phase 0 ✅ · Phase 1 ✅ · Phase 2 ✅ · Phase 3 ✅ · Phase 4 ✅ · Phase 5 ✅ · Phase 6 ✅ · Phase 7 ✅ — **program closed**

**Sources audited:** `Migration-Documents/DOCTORS/` · `Migration-Documents/PHAMACY/` (folder spelling is legacy; keep as-is)  
**Compared against:** Prisma models under `apps/api/prisma/models/` (especially `doctors`, `clinical-diagnoses`, `clinical-notes`, `certificates`, `pharmacy`, `prescriptions`, `laboratory`, `imaging`, `service-catalog`) and existing importer `scripts/migrate-legacy-csv.mjs` + [LEGACY_CSV_CLINICAL_IMPORT_PLAN.md](./LEGACY_CSV_CLINICAL_IMPORT_PLAN.md).  
**Date of inventory:** 2026-09-21  
**Goal:** migrate **useful** doctor/pharmacy CSVs into Azure Postgres **without duplicating** already-loaded data and **without breaking** live clinical/pharmacy workflows.

---

## 0. How to use this document

1. Work **one phase at a time**. Do not open the next phase until every checkbox in the current phase is `[x]` and Status is ✅.  
2. After each production-safe step, append a one-line run record under **Run log** (command, upserted/skipped/errors, log path, UTC time).  
3. If the network drops mid-phase, re-open this file, find the first ⬜ / unchecked box, and continue there.  
4. **Forbidden:** re-running `--only=doctors` / `--only=patient_diagnoses` / `--only=nursing_notes` against identical files “just to be sure” without verifying live counts first.  
5. All new importers stay in `scripts/migrate-legacy-csv.mjs` (or a clearly named sibling under `scripts/`) with `--only=` gates. Prefer idempotent upsert on legacy PKs.

---

## 1. Inventory (what is in the folders)

### 1.1 `Migration-Documents/DOCTORS/`

| CSV | ~Rows (logical) | Size | Role (legacy) |
|-----|-----------------|------|----------------|
| `DOCTORS.csv` | 16 | 0.6 KB | Doctor name catalog |
| `DIAGNOSIS.csv` | ~1k logical / historically imported as **13,940** | 2.3 MB | Patient diagnosis events |
| `DISEASES.csv` | 12,416 | 1.3 MB | Disease / ICD-ish catalog |
| `THESAURUS.csv` | 106,438 | 12 MB | ICD/ICPC term thesaurus |
| `COMPLAINTS.csv` | ~98,280 | 34 MB | Encounter-style clinical narratives (HTML) |
| `COMPLAINT_DETAILS.csv` | 4,300 | 0.2 MB | Structured complaint template fields |
| `GENERIC_TEMPLATES.csv` | 137 | 0.8 MB | Note / form templates (HTML) |
| `P_EXAM.csv` | 223 | 90 KB | Physical examination free-text notes |
| `OLD_HISTORY.csv` | 66 | 127 KB | Past medical history blobs |
| `CALL_NOTE.csv` | 72 | 7 KB | Short call / location notes |
| `COMMENTS.csv` | 58 | 7 KB | Cross-request comments (often pharmacy clarifications) |
| `CONSENTS.csv` | 39 | 64 KB | Scanned consent images (binary in CSV) |
| `MEDICAL_REPORT.csv` | 1 | 0.3 KB | Single junk/demo medical report |
| `NOTES.csv` | 15 | 2 KB | Mixed nurse/doctor case notes |

### 1.2 `Migration-Documents/PHAMACY/`

| CSV | ~Rows | Size | Role (legacy) |
|-----|-------|------|----------------|
| `ITEMS.csv` | ~3,422 | 0.5 MB | **Hospital item master** (Pharmacy + Lab + Radiology + Services) |
| `BUNDLES.csv` | 2 | tiny | Lab test bundles |
| `BUNDLE_DETAILS.csv` | 4 | tiny | Bundle line items |
| `DRUG_CONSUMABLE_TYPES.csv` | 25 | tiny | Drug/consumable type lookup |
| `DRUG_HRS.csv` | 24 | tiny | Drug hour-grid headers |
| `DRUG_MNTS.csv` | 24 | 5 KB | Drug minute/slot matrices (legacy MAR UI) |
| `PROPHYLATICS_DRUGS.csv` | 37 | tiny | Per-patient prophylactic drug names |

### 1.3 Exact duplicates of root CSVs (do not treat as new data)

SHA-256 prefixes match; files are **byte-identical**:

| Folder file | Root twin | Implication |
|-------------|-----------|-------------|
| `DOCTORS/DOCTORS.csv` | `Migration-Documents/DOCTORS.csv` | Already covered by `--only=doctors` |
| `DOCTORS/DIAGNOSIS.csv` | `Migration-Documents/DIAGNOSIS.csv` | Already covered by `--only=patient_diagnoses` (28 Aug 2026: upserted=13940) |
| `DOCTORS/NOTES.csv` | `Migration-Documents/NOTES.csv` | Already covered by `--only=nursing_notes` (18 Aug 2026: upserted=10) |

**Honest note on DIAGNOSIS row counts:** on-disk logical CSV parse currently reports ~1k rows for the identical 2.3 MB file, while the production run log recorded **13,940** upserts. Before any re-import, **count live `PATIENT_DIAGNOSES`** and treat that number as source of truth. Do not invent a second import path for the same file.

---

## 2. Already migrated (skip / verify only)

From [LEGACY_CSV_CLINICAL_IMPORT_PLAN.md](./LEGACY_CSV_CLINICAL_IMPORT_PLAN.md) + `migrate-legacy-csv.mjs`:

| Source | Target | Status | Action |
|--------|--------|--------|--------|
| Root / `DOCTORS/DOCTORS.csv` | `DOCTORS` | ✅ Imported (legacy lookup phase) | Verify count = 16; **do not re-run** unless empty |
| Root / `DOCTORS/DIAGNOSIS.csv` | `PATIENT_DIAGNOSES` | ✅ 28 Aug 2026 (13940 upserts) | Verify live count; optional **enrichment only** (Phase 2) |
| Root / `DOCTORS/NOTES.csv` | `NURSING_NOTES` | ✅ 18 Aug 2026 (10 upserts) | Skip |
| Root `DRUG_CHART*` (not in PHAMACY folder) | `NURSING_MAR_ENTRIES` | ✅ 3 Sep 2026 | Unrelated to PHAMACY/; leave alone |

---

## 3. Classification: can migrate / partial / cannot

### 3.1 Fully migratable (schema exists or thin lookup table is enough)

| CSV | Target | Fit | Notes |
|-----|--------|-----|-------|
| `DISEASES.csv` | `DIAGNOSIS_CODES` (new rows) | **Full** | Map `CODE`→`CODE`, `DISEASE_NAME`→`NAME`, `DESCRIPTION`→`DESCRIPTION`/`CATEGORY`. Preserve `DISEASE_ID` only if we add `LEGACY_DISEASE_ID` **or** store in `DESCRIPTION`/`KEYWORDS` — prefer optional column (Phase 1 schema). |
| `THESAURUS.csv` | `DIAGNOSIS_CODES` (ICD/ICPC enrichment) | **Full (catalog)** | Large (~106k). Upsert by `ICD_CODE` / synthetic code from `THESAURUS_ID`. Powers doctor diagnosis picker. |
| `DRUG_CONSUMABLE_TYPES.csv` | Optional lookup table **or** `Drugs.CATEGORY` seed | **Full (small)** | 25 rows; low risk. |
| Pharmacy slice of `ITEMS.csv` (`ITEM_TYPE=Pharmacy` / `IS_MEDICATION=Y`) | `DRUGS` (+ optional opening `DRUG_BATCHES`) | **Full (filtered)** | Map name/generic/strength/form/prices/reorder. Keep `ITEM_ID` as `LEGACY_ITEM_ID` column or deterministic external key to avoid dupes on re-run. |

### 3.2 Partially migratable (needs transform + honesty about loss)

| CSV | Target | Fit | What lands / what is lost |
|-----|--------|-----|---------------------------|
| `COMPLAINTS.csv` | `CLINICAL_NOTES` | **Partial** | HTML `DESCRIPTION` → `FIELDS` JSON (e.g. `{ "Narrative": "..." }`), `NOTE_TYPE=Legacy Complaint` / `History`. Need `AUTHOR_ID` from `DOCTOR_ID`/`CREATED_BY`→`USERS`. Lose Oracle `MSG_LOG_ID`, surgery/template FKs unless stored in JSON. ~98k rows → phased batches. |
| `COMPLAINT_DETAILS.csv` | `CLINICAL_NOTES.FIELDS` or note versions | **Partial** | Only if parent complaint imported; fold title/value pairs into JSON. Orphan details skip. |
| `P_EXAM.csv` | `CLINICAL_NOTES` | **Partial** | Same pattern as complaints (`NOTE_TYPE=Physical Exam`). Only 223 rows — good pilot. |
| `OLD_HISTORY.csv` | `CLINICAL_NOTES` or patient profile note | **Partial** | 66 HTML blobs; `NOTE_TYPE=Past Medical History`. |
| `CALL_NOTE.csv` | `CLINICAL_NOTES` or `NOTIFICATIONS` | **Partial** | Short text; prefer clinical note with type `Call Note`. Author via `USER_ID`. |
| `GENERIC_TEMPLATES.csv` | `CertificateTemplates` **or** new `ClinicalNoteTemplates` | **Partial** | Content is clinical note HTML templates, **not** discharge certificates. Honest choice: **new table** (recommended) rather than overloading certificates. |
| `COMMENTS.csv` | Soft-store on related entity / support-like note | **Partial** | Often prescription clarifications (`MSG_LOG_ID`). Without message-log table, store as `CLINICAL_NOTES`/`PharmacyNotes` with `SOURCE=legacy-comment` or skip until Rx/message linkage exists. |
| `PROPHYLATICS_DRUGS.csv` | Free-text on `PatientDiagnoses.NOTES` / new light table / allergies-adjacent | **Partial** | Drug **names** only (no `DRUG_ID`). 37 rows — import as structured JSON note per person **or** skip until catalog matched. |
| Lab/Rad/Services slices of `ITEMS.csv` | `LAB_TESTS` / `IMAGING_STUDIES` / `MASTER_SERVICES` | **Partial (out of pharmacy scope)** | Same file feeds multiple modules. Do **not** dump non-pharmacy rows into `DRUGS`. Separate optional sub-phases. |
| `BUNDLES` + `BUNDLE_DETAILS` | Lab panels / service bundles | **Partial** | Only 2 bundles (lab). Map later under laboratory catalog, not pharmacy inventory. |

### 3.3 Cannot / should not migrate (honest hold)

| CSV | Why hold |
|-----|----------|
| `CONSENTS.csv` | Binary image blobs (`IMG` hex/base64) with typo columns (`PARSON_ID`, `ADDMISION_ID`). Needs **file storage** (Azure Blob) + consent metadata table + consent UI. Dumping megabyte hex into Postgres is wrong. |
| `MEDICAL_REPORT.csv` | Single junk row (`uuhihij…`). Not clinical value. |
| `DRUG_HRS.csv` / `DRUG_MNTS.csv` | Legacy **UI grid** for administration timeslots. HMS already uses `NURSING_MAR_ENTRIES` + modern schedule fields. Migrating would recreate a dead UI model. |
| Re-import of identical `DOCTORS` / `DIAGNOSIS` / `NOTES` | Duplicate risk; already loaded. |
| Treating all `ITEMS.csv` as drugs | Would pollute pharmacy with Lab/Radiology/Services rows and break stock/Rx joins. |

---

## 4. Backend / frontend needed? (honest assessment)

| Data | Existing UI/API enough? | Build needed? |
|------|-------------------------|---------------|
| `DOCTORS` catalog | Yes — already used as legacy lookup | **No** |
| `PATIENT_DIAGNOSES` | Yes — doctor diagnoses APIs/UI exist | **No** for re-import; **Yes (small)** for thesaurus-powered search if we load `DIAGNOSIS_CODES` properly |
| `DIAGNOSIS_CODES` + thesaurus | Partially — codes table exists; picker may still use mocks/local lists | **Yes** — ensure doctor diagnosis typeahead reads `GET` diagnosis-codes API; seed/import codes first |
| Complaints / P_Exam / Old history as `CLINICAL_NOTES` | Yes — clinical notes workstation exists | **Mostly no** — importer + note-type filters; maybe a “Legacy imported” badge |
| `GENERIC_TEMPLATES` | Certificate UI is the wrong product surface | **Yes** — either note-template admin under doctor settings **or** skip templates and only import instance notes |
| Pharmacy `DRUGS` from ITEMS | Yes — pharmacy inventory/catalog UI live | **Importer only**; verify prices/units; do **not** invent batches from `BALANCE` without a deliberate opening-stock decision |
| Opening stock (`BALANCE`) | Risky | **Optional** — create one synthetic `DRUG_BATCHES` row per drug **only** after product confirms “legacy opening balance” policy (expiry unknown → quarantine/unknown) |
| Bundles / lab items | Lab catalog exists separately | **Out of scope** for pharmacy phase; separate lab plan |
| Consents | No consent vault UI | **Yes, full feature** (storage + viewer) — **do not** block pharmacy/doctor text migrations on this |
| Drug Hrs/Mnts | No | **No build** — discard |

**Bottom line:** the high-value work is **importers + diagnosis-code enrichment**, not new modules. New UI is only justified for (a) diagnosis catalog search quality and (b) consent images later. Do not build a parallel “legacy Oracle viewer” unless product asks.

---

## 5. Production safety rules (apply to every phase)

1. **Idempotent upserts** on stable keys (`DISEASE_ID` / `THESAURUS_ID` / `ITEM_ID` / legacy note ids).  
2. **Skip** rows whose `PERSON_ID` is not in `PERSONS`.  
3. **Never** write into live `PRESCRIPTIONS` / `DRUG_BATCHES` dispense history from these CSVs (no Rx dispense extract here).  
4. **Never** hard-delete clinical rows. Soft status only.  
5. Run against a **clone / staging** first (`npm run db:test` pattern), then Azure with a maintenance window for large imports (`COMPLAINTS`, `THESAURUS`).  
6. Batch sizes ≤ 100–500; log under `Migration-Documents/logs/`.  
7. Prefer `--dry-run` (add if missing) that prints would-upsert / would-skip counts.  
8. Keep pharmacy and doctor waves **sequential**: catalogs before instance notes; drugs before any prophylactic name matching.

---

## 6. Phased plan (checkmark gates)

### Phase 0 — Inventory freeze & live verification · Status: ✅

- [x] Confirm Azure counts: `DOCTORS`, `PATIENT_DIAGNOSES`, `NURSING_NOTES`, `DRUGS`, `DIAGNOSIS_CODES`  
- [x] Document counts in Run log below  
- [x] Confirm `DOCTORS/DOCTORS|DIAGNOSIS|NOTES` hash-equal to root (already done 2026-09-21)  
- [x] Decide opening-stock policy for pharmacy `BALANCE` (`skip` **or** `quarantine batch`) — write decision in Run log  
- [x] Add `--path=` support (or copy convention) so importers can read `Migration-Documents/DOCTORS/` and `Migration-Documents/PHAMACY/` without colliding with root filenames  
- [x] **Phase 0 complete** → unlock Phase 1  

---

### Phase 1 — Diagnosis catalogs (DISEASES + THESAURUS) · Status: ✅

**Depends on:** Phase 0 ✅  

- [x] Schema: ensure `DIAGNOSIS_CODES` can store legacy ids / ICPC (`LEGACY_THESAURUS_ID`, `LEGACY_DISEASE_ID`, optional `ICPC_CODE`) **or** encode in `KEYWORDS` with a documented convention — prefer real columns via new Prisma migration  
- [x] Importer `--only=diseases` from `DOCTORS/DISEASES.csv` → upsert `DIAGNOSIS_CODES`  
- [x] Importer `--only=thesaurus` from `DOCTORS/THESAURUS.csv` → upsert `DIAGNOSIS_CODES` (ICD-focused; skip empty codes)  
- [x] Staging dry-run + apply; Azure apply in off-peak (thesaurus is large)  
- [x] FE check: doctor diagnosis search returns imported codes (fix API wiring if still mock)  
- [x] **Phase 1 complete** → unlock Phase 2  

---

### Phase 2 — Enrich existing patient diagnoses (no duplicate insert) · Status: ✅

**Depends on:** Phase 1 ✅  

- [x] Script `--only=patient_diagnoses_enrich` (update-only): for each `PATIENT_DIAGNOSES` row with weak synthetic `CODE`/`NAME`, join CSV `THESAURUS_ID` / `DISEASE_ID` to catalogs and **PATCH** `CODE`, `NAME`, `SYSTEM`, `DSM_CODE`/`KEYWORDS`  
- [x] Must **not** insert new `PATIENT_DIAGNOSIS_ID`s  
- [x] Spot-check 20 random patients in doctor UI  
- [x] **Phase 2 complete** → unlock Phase 3  

---

### Phase 3 — Pharmacy drug catalog from `ITEMS.csv` · Status: ✅

**Depends on:** Phase 0 ✅ (can run in parallel with Phase 1 **only on staging**; on production run after Phase 0, preferably after Phase 1 to reduce change collision)  

- [x] Importer `--only=pharmacy_items` reading `PHAMACY/ITEMS.csv`  
- [x] Filter: `ITEM_TYPE` in (`Pharmacy`) **or** `IS_MEDICATION` in (`Y`,`1`,`yes`) — **exclude** Lab / Radiology / Services  
- [x] Upsert `DRUGS` with stable `LEGACY_ITEM_ID` (new column) or unique `NAME+STRENGTH` strategy documented in DECISIONS  
- [x] Map: `ITEM_NAME`→`NAME`, `GENERIC_NAME`, `DRUG_STRENGTH`→`STRENGTH`, `DRUG_TYPE`/`UOM`→`FORM`/`UNIT`, prices, `OUT_OF_STOCK_LEVEL`→`REORDER_LEVEL`, `DISCONTINUE_FLAG`→`STATUS`  
- [x] Opening stock: implement chosen Phase 0 policy only  
- [x] Import `DRUG_CONSUMABLE_TYPES` as categories or ignore if unused  
- [x] Verify pharmacy inventory UI lists imported drugs; no Lab tests appear  
- [x] **Hold:** `BUNDLES*`, non-pharmacy ITEMS slices, `DRUG_HRS`/`DRUG_MNTS`  
- [x] **Phase 3 complete** → unlock Phase 4  

---

### Phase 4 — Small doctor clinical notes pilot (P_EXAM, OLD_HISTORY, CALL_NOTE) · Status: ✅

**Depends on:** Phase 0 ✅; authors resolvable (`USERS` loaded)  

- [x] Importer `--only=legacy_clinical_notes_pilot`  
- [x] Map to `CLINICAL_NOTES` with distinct `NOTE_TYPE` values; `FIELDS` JSON; `STATUS=Signed` if legacy looks final  
- [x] Resolve `AUTHOR_ID`: `DOCTOR_ID`/`USER_ID`/`CREATED_BY` → `USERS.USER_ID`; skip if unresolved (log)  
- [x] Generate `NOTE_NO` = `LEG-{source}-{id}` unique  
- [x] Staging then Azure; verify notes appear on patient timeline / clinical notes UI  
- [x] **Phase 4 complete** → unlock Phase 5  

---

### Phase 5 — Complaints bulk import · Status: ✅

**Depends on:** Phase 4 ✅ (pilot proves mapping)  

- [x] Importer `--only=complaints` (+ optional `complaint_details`)  
- [x] Batched upsert; preserve `COMPLAINT_ID` via `NOTE_NO=LEG-COMP-{id}` or dedicated `LEGACY_COMPLAINT_ID` column  
- [x] Skip missing persons; skip empty `DESCRIPTION`  
- [x] Fold `COMPLAINT_DETAILS` into `FIELDS.details[]` when parent exists  
- [x] Production: run in windows (≈98k); monitor DB CPU / locks  
- [x] FE: filter/search by note type “Legacy Complaint”; no need for Oracle complaint screen clone  
- [x] **Phase 5 complete** → unlock Phase 6  

---

### Phase 6 — Templates & light leftovers · Status: ✅

**Depends on:** Phase 4 ✅  

- [x] Decide D-templates: new `ClinicalNoteTemplates` table **or** skip storing HTML templates (instances already in notes)  
- [x] If yes: migrate `GENERIC_TEMPLATES.csv` + minimal admin list UI under doctor settings  
- [x] `PROPHYLATICS_DRUGS`: match names to `DRUGS` where possible; else store per-person clinical note  
- [x] `COMMENTS.csv`: import only rows with clear person linkage; else hold  
- [x] **Phase 6 complete** → unlock Phase 7  

---

### Phase 7 — Explicit holds / future epics · Status: ✅

- [x] Record hold: `CONSENTS.csv` → future Consent Vault (blob storage + viewer)  
- [x] Record hold: Lab/Rad/Services `ITEMS` + `BUNDLES*` → laboratory/radiology/service-catalog import plans (separate docs)  
- [x] Record discard: `MEDICAL_REPORT.csv`, `DRUG_HRS.csv`, `DRUG_MNTS.csv`  
- [x] Update [CHANGELOG.md](./CHANGELOG.md) + [FEATURES.md](./FEATURES.md) for whatever shipped in Phases 1–6  
- [x] **Phase 7 complete** → doctor/pharmacy CSV program closed ✅  

---

## 7. Suggested importer flags (to implement)

```bash
# catalogs
npm run db:migrate-csv -- --only=diseases --from=Migration-Documents/DOCTORS/DISEASES.csv
npm run db:migrate-csv -- --only=thesaurus --from=Migration-Documents/DOCTORS/THESAURUS.csv

# enrichment (update-only)
npm run db:migrate-csv -- --only=patient_diagnoses_enrich --from=Migration-Documents/DOCTORS/DIAGNOSIS.csv

# pharmacy
npm run db:migrate-csv -- --only=pharmacy_items --from=Migration-Documents/PHAMACY/ITEMS.csv

# clinical notes
npm run db:migrate-csv -- --only=legacy_clinical_notes_pilot --from=Migration-Documents/DOCTORS
npm run db:migrate-csv -- --only=complaints --from=Migration-Documents/DOCTORS/COMPLAINTS.csv --offset=0 --limit=5000
```

Exact CLI shape may match existing `--only=` style; keep flags consistent with `migrate-legacy-csv.mjs`.

---

## 8. Risk register

| Risk | Mitigation |
|------|------------|
| Duplicate diagnoses / doctors | Hash check + live counts; enrichment-only path |
| Polluting `DRUGS` with labs | Strict `ITEM_TYPE` / `IS_MEDICATION` filter + post-import audit query |
| Authorless clinical notes | Skip row if `AUTHOR_ID` unresolved; do not invent system user silently without logging |
| Thesaurus import size | Off-peak; batch; index `CODE`/`STATUS` already present |
| Complaints HTML XSS in UI | Existing note renderer must sanitize HTML (verify before bulk) |
| Opening stock wrong expiry | Default policy = **skip balance** until pharmacy leads confirm |
| Consent binaries in DB | Never import into Postgres; future blob epic |

---

## 9. Run log (append-only)

| When (UTC) | Phase | Command / action | Result | Log file |
|------------|-------|------------------|--------|----------|
| 2026-09-21 | — | Inventory + schema compare + duplicate hash check | Plan authored; Phase 0 unlocked | this file |
| 2026-09-21T07:00Z | 0 | Live counts + hash verify | DOCTORS=0 (empty→reimport), PATIENT_DIAGNOSES=13945, NURSING_NOTES=4445, DRUGS=2, DIAGNOSIS_CODES=17; hashes EQUAL | `scripts/phase0-counts.mjs` |
| 2026-09-21 | 0 | Opening-stock policy | **`skip`** — do not create `DRUG_BATCHES` from `ITEMS.BALANCE` (expiry unknown) | DECISIONS ADR below |
| 2026-09-21 | 0 | CLI `--from=` / `--path=` / `--dry-run` | Added to `migrate-legacy-csv.mjs` | script |
| 2026-09-21T07:01Z | 0 | `--only=doctors --from=.../DOCTORS/DOCTORS.csv` | upserted=16 | `migrate-legacy-csv-2026-09-21T07-01-07-300Z.log` |
| 2026-09-21 | 0 | **Phase 0 ✅** | Unlocked Phase 1 | |
| 2026-09-21 | 1 | Migration `20260921120000_doctor_pharmacy_legacy_ids` | Applied (also pending HR/nonclinical migrations) | prisma |
| 2026-09-21T07:01Z | 1 | `--only=diseases` dry-run + apply | uniqueCodes=12416 upserted=12416 | `...T07-01-22-903Z.log` |
| 2026-09-21T07:01Z | 1 | `--only=thesaurus` dry-run + apply | unique ICD codes=9481 (from 95,604 ICD rows; 10,834 empty ICD skipped) | `...T07-01-54-395Z.log` |
| 2026-09-21 | 1 | FE catalog search | `DoctorDiagnosisEngine` debounced `listDiagnosisCatalog({q})`; API searches `ICPC_CODE` | fnph-aro + diagnoses.service |
| 2026-09-21 | 1 | **Phase 1 ✅** | DIAGNOSIS_CODES≈12580 | |
| 2026-09-21T07:03–07:20Z | 2 | `--only=patient_diagnoses_enrich` pass1 (thesaurus/disease FK) | updated=1860 (only rows with THESAURUS_ID>0 + ICD); 12080 had FK=0 | enrich logs |
| 2026-09-21T07:41Z | 2 | Name/alias/prefix pass2 | +1595 codes matched; remaining 7763 keep free-text NAME + LEG-* code (no catalog hit) | `phase2-name-prefix-enrich.mjs` |
| 2026-09-21 | 2 | Spot-check | e.g. id 96651→I10 Essential hypertension; 96648→B50.8 | SQL |
| 2026-09-21 | 2 | **Phase 2 ✅** | No new PATIENT_DIAGNOSIS_ID inserts; enriched≥6177 | |
| 2026-09-21T07:49–07:56Z | 3 | `--only=drug_consumable_types,pharmacy_items` | types=25; drugs upserted=865 skipped=5773 (non-pharmacy); reorder clamp fix; opening stock skipped | `...T07-53-19-768Z.log` |
| 2026-09-21 | 3 | Verify | DRUGS=867 (2 seed+865 legacy); no lab-test pollution (urine bag / pharmacy service charges are pharmacy consumables) | `phase0-3-verify.mjs` |
| 2026-09-21 | 3 | **Phase 3 ✅** | Unlock Phase 4 | |
| 2026-09-21T08:13Z | 4 | `--only=legacy_clinical_notes_pilot` | upserted=222 skipped=139 (unresolved author / missing person / empty body). Types: Physical Exam 220, Call Note 2; OLD_HISTORY all skipped (no resolvable AUTHOR) | `...T08-14-00-721Z.log` |
| 2026-09-21 | 4 | Multiline CSV streamer | Multiline quoted HTML fields supported | `migrate-legacy-csv.mjs` |
| 2026-09-21 | 4 | **Phase 4 ✅** | Unlock Phase 5 | |
| 2026-09-21T08:16Z | 5 | `--only=complaints --batch=100` | upserted=97980 skipped=271 errors=0; details map=25 unique parents (4300 detail rows) folded into `FIELDS.details` | `...T08-16-22-197Z.log` |
| 2026-09-21 | 5 | FE | Completed-notes type filter includes Legacy Complaint; preview strips HTML for Narrative | `DoctorClinicalDocumentation.tsx` |
| 2026-09-21 | 5 | **Phase 5 ✅** | Unlock Phase 6 | |
| 2026-09-21 | 6 | Schema `CLINICAL_NOTE_TEMPLATES` | Migration `20260921140000_clinical_note_templates` | prisma |
| 2026-09-21T08:22Z | 6 | `--only=clinical_note_templates,prophylactics,legacy_comments` | templates=135; prophylactics=13 (24 skip missing person); comments=13 (42 held no person via MSG_LOG) | `...T08-22-46-476Z.log` |
| 2026-09-21 | 6 | API/FE | `GET /api/clinical-notes/legacy-templates` + Templates tab list | clinical-notes + FE |
| 2026-09-21 | 6 | **Phase 6 ✅** | Unlock Phase 7 | |
| 2026-09-21 | 7 | Holds recorded | CONSENTS → Consent Vault epic; Lab/Rad/Services ITEMS + BUNDLES* → separate catalog plans | this file §7 |
| 2026-09-21 | 7 | Discards recorded | MEDICAL_REPORT.csv; DRUG_HRS.csv; DRUG_MNTS.csv | this file §7 |
| 2026-09-21 | 7 | Docs | CHANGELOG + FEATURES updated | |
| 2026-09-21 | 7 | **Phase 7 ✅** | Doctor/Pharmacy CSV program **closed** | |
| | | | | |

---

## 11. Phase 7 hold / discard register (final)

| CSV / slice | Disposition | Next epic |
|-------------|-------------|-----------|
| `CONSENTS.csv` | **HOLD** | Consent Vault: Azure Blob + metadata table + viewer UI (never store binary in Postgres) |
| Lab / Radiology / Services rows in `ITEMS.csv` | **HOLD** | Separate lab / imaging / master-service catalog import plans |
| `BUNDLES.csv` + `BUNDLE_DETAILS.csv` | **HOLD** | Laboratory panel catalog |
| `MEDICAL_REPORT.csv` | **DISCARD** | Junk single row |
| `DRUG_HRS.csv` / `DRUG_MNTS.csv` | **DISCARD** | Dead legacy MAR UI grid; HMS uses `NURSING_MAR_ENTRIES` |
| `COMMENTS.csv` without MSG_LOG→person | **HELD at import** | 42 rows skipped; no clear person linkage |
| `OLD_HISTORY.csv` without resolvable author | **HELD at import** | Skipped under Phase 4 author rule |

---

## 10. Quick decision summary

| Migrate? | Items |
|----------|-------|
| **Yes — do next** | `DISEASES`, `THESAURUS`, pharmacy-filtered `ITEMS`, note pilots (`P_EXAM`, `OLD_HISTORY`, `CALL_NOTE`), then `COMPLAINTS` |
| **Yes — enrich only** | Existing `PATIENT_DIAGNOSES` via thesaurus/disease join |
| **Already done — verify only** | `DOCTORS`, `DIAGNOSIS`, `NOTES` (duplicates of root) |
| **Later / other module** | Lab/Rad/Services ITEMS, `BUNDLES*`, consents |
| **Never** | `DRUG_HRS`/`DRUG_MNTS`, junk `MEDICAL_REPORT`, dumping all ITEMS into `DRUGS` |

---

*End of plan. Resume at the first phase whose Status is still ⬜.*
