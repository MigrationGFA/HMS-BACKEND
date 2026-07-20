# Database

## Overview

HMS uses **PostgreSQL** with **Prisma**. The active schema is intentionally slimmed to the entities currently implemented in the API and frontend.

Schema files live under `apps/api/prisma/`. Migrations are managed via `prisma migrate`.

## Schema Layout (active)

```
apps/api/prisma/
├── schema.prisma          # generator + datasource
├── models/
│   ├── auth.prisma        # ROLES, REFRESH_TOKENS
│   ├── users.prisma       # USERS
│   ├── patients.prisma    # PERSONS
│   ├── cards.prisma       # PATIENT_CARDS (registration card + payment gate)
│   ├── triage.prisma      # TRIAGE
│   ├── encounters.prisma  # ENCOUNTERS
│   ├── followups.prisma   # FOLLOW_UPS
│   ├── clinical-notes.prisma # CLINICAL_NOTES + CLINICAL_NOTE_VERSIONS
│   ├── pharmacy.prisma    # SUPPLIERS, SUPPLIER_DRUGS, DRUGS, DRUG_BATCHES, PURCHASE_REQUESTS, PURCHASE_ORDERS, PURCHASE_ORDER_ITEMS, GOODS_RECEIVED_NOTES
│   └── audit.prisma       # AUDITS (with AUDIT_TYPE)
├── migrations/
└── seed.ts
```

Other legacy domain model files were removed until those modules are implemented. Do not reintroduce unused tables without an owning module and migration plan.

## Core Entities

| Table | Model | Purpose |
|-------|-------|---------|
| `PERSONS` | `Persons` | Patient identity (single source of truth for demographics / NOK) |
| `USERS` | `Users` | Staff accounts |
| `ROLES` | `Roles` | RBAC roles (seeded) |
| `REFRESH_TOKENS` | `RefreshToken` | JWT refresh sessions |
| `TRIAGE` | `Triage` | Queue + vitals; stores `PERSON_ID` only (no duplicated demographics) |
| `PATIENT_CARDS` | `PatientCards` | Registration card per person; `PAYMENT_STATUS` starts `Pending` and gates the workflow until a cashier confirms |
| `AUDITS` | `Audits` | Immutable audit trail with filterable `AUDIT_TYPE` |
| `SUPPLIERS` | `Suppliers` | Pharmacy suppliers (procurement) |
| `SUPPLIER_DRUGS` | `SupplierDrugs` | Join table: drugs each supplier supplies, by `DRUG_ID` (never names) |
| `DRUGS` | `Drugs` | Drug catalog; optional preferred `SUPPLIER_ID`; no quantity columns — stock is derived from batches |
| `DRUG_BATCHES` | `DrugBatches` | Batch-level stock: `BATCH_NO`, `EXPIRY_DATE`, `QTY_RECEIVED`/`QTY_AVAILABLE`, cost & selling price |
| `PURCHASE_REQUESTS` | `PurchaseRequests` | Internal PRs (`PR-YYYY-###`) awaiting approval |
| `PURCHASE_ORDERS` | `PurchaseOrders` | POs to suppliers (`PO-YYYY-###`) with approval + send workflow |
| `PURCHASE_ORDER_ITEMS` | `PurchaseOrderItems` | PO line items per drug |
| `GOODS_RECEIVED_NOTES` | `GoodsReceivedNotes` | GRNs (`GRN-YYYY-###`) linking receipts to PO/drug/batch |
| `PRESCRIPTIONS` | `Prescriptions` | Doctor prescriptions (`RX-YYYY-####`); payment fields + emergency receiver; status Draft/Sent/Dispensed/…; linked to `PERSON_ID` |
| `PRESCRIPTION_ITEMS` | `PrescriptionItems` | Line items: `DRUG_ID` + dose/frequency/qty; `QTY_DISPENSED` / `QTY_RETURNED`; drug name snapshotted |
| `PHARMACY_SALES` | `PharmacySales` | Walk-in OTC sales (`WS-YYYY-####`); pay then dispense |
| `PHARMACY_SALE_ITEMS` | `PharmacySaleItems` | Walk-in lines; `QTY_DISPENSED` / `QTY_RETURNED` |
| `PHARMACY_RETURNS` | `PharmacyReturns` | Drug returns (`RT-YYYY-####`) from dispensed Rx or walk-in |
| `PHARMACY_RETURN_ITEMS` | `PharmacyReturnItems` | Return line quantities restored to batches |
| `PHARMACY_SETTINGS` | `PharmacySettings` | Singleton hospital thresholds (reorder default, expiry alert days, flags) |
| `ENCOUNTERS` | `Encounters` | Doctor consultations (start from triage queue; draft notes + complete) |
| `FOLLOW_UPS` | `FollowUps` | Doctor-scheduled follow-up visits (from complete consult or schedule dialog) |
| `CLINICAL_NOTES` | `ClinicalNotes` | Structured clinical documentation (SOAP, psych assessment, etc.); soft-void only |
| `CLINICAL_NOTE_VERSIONS` | `ClinicalNoteVersions` | Immutable version snapshots for clinical notes |
| `LAB_TESTS` | `LabTests` | Orderable lab catalog (`TEST_CODE`, category, specimen, TAT, `UNIT_PRICE`, Active/Inactive) |
| `LAB_REQUESTS` | `LabRequests` | Doctor lab requests (`LR-YYYY-####`); `PAYMENT_STATUS` Unpaid/Paid/Waived; status Draft/Sent/Cancelled |
| `LAB_REQUEST_ITEMS` | `LabRequestItems` | Line items with snapshotted test code/name/price |

### Relationships

```
USERS ── ROLE_ID ── ROLES
USERS ── REFRESH_TOKENS
USERS ── PERSON_ID ── PERSONS (optional link)
PERSONS ── TRIAGE (1:N)
PERSONS ── PATIENT_CARDS (1:N; created by / confirmed by USERS)
PERSONS ── PRESCRIPTIONS ── PRESCRIPTION_ITEMS ── DRUGS
PERSONS ── PHARMACY_SALES ── PHARMACY_SALE_ITEMS ── DRUGS
PERSONS ── PHARMACY_RETURNS ── PHARMACY_RETURN_ITEMS ── DRUGS
PERSONS ── LAB_REQUESTS ── LAB_REQUEST_ITEMS ── LAB_TESTS
ENCOUNTERS ── LAB_REQUESTS (optional)
USERS ── LAB_REQUESTS (doctor)
USERS ── AUDITS
SUPPLIERS ── SUPPLIER_DRUGS ── DRUGS (drugs supplied, by ID)
SUPPLIERS ── DRUGS (optional preferred supplier)
DRUGS ── DRUG_BATCHES (1:N; stock + expiry per batch)
SUPPLIERS ── PURCHASE_ORDERS ── PURCHASE_ORDER_ITEMS ── DRUGS
PURCHASE_ORDERS ── GOODS_RECEIVED_NOTES ── DRUG_BATCHES
```

### Triage design rule

`TRIAGE` stores operational/vitals fields and **`PERSON_ID`**. Name, hospital number, phone, next of kin, etc. are read by joining `PERSONS` — never copied into triage rows.

### Audit types (examples)

| `AUDIT_TYPE` | When |
|--------------|------|
| `person:create` | Patient registration |
| `triage:create` | New triage queue entry |
| `triage:update` | Status / priority / vitals change |
| `supplier:create` / `supplier:update` | Supplier registered / edited |
| `drug:create` / `drug:update` | Drug added to / edited in catalog |
| `procurement:request-*` / `procurement:po-*` | PR/PO created, approved, rejected, sent |
| `stock:receive` | GRN recorded, batch created |
| `stock:adjust` | Manual stock adjustment (reason required) |
| `prescription:create` / `prescription:send` | Prescription draft / sent to pharmacy |
| `prescription:pay` | Cashier/billing confirms Rx payment |
| `pharmacy:dispense` / `pharmacy:emergency-dispense` | Normal / emergency Rx dispense |
| `pharmacy:sale-create` / `pharmacy:sale-pay` / `pharmacy:sale-dispense` | Walk-in sale lifecycle |
| `pharmacy:return` | Drug return of dispensed stock |
| `prescription:update` | Status / payment / pharmacy notes change |
| `pharmacy:dispense` | Pharmacist dispensed Rx (FEFO stock deducted) |
| `pharmacy:sale-create` | Walk-in pharmacy request created (awaiting cashier) |
| `pharmacy:sale-pay` | Cashier confirmed walk-in sale payment |
| `pharmacy:sale-dispense` | Pharmacist dispensed paid walk-in sale |
| `pharmacy:sale-cancel` | Walk-in sale cancelled |
| `auth:login` | (planned) successful login |

Filter audits with `GET /api/audit/logs?type=triage:create`.

## Connection

See `.env` / `prisma.config.ts`. Runtime uses `@prisma/adapter-pg`.

Apply latest migration:

```bash
npx prisma migrate deploy
# or during local development:
npx prisma migrate dev
```

Migration `20260710140000_triage_and_audit_type` adds `TRIAGE` and `AUDITS.AUDIT_TYPE` / `ENTITY` / `ENTITY_ID`.

Migration `20260716000000_pharmacy_procurement_inventory` adds the pharmacy tables (`SUPPLIERS`, `DRUGS`, `DRUG_BATCHES`, `PURCHASE_REQUESTS`, `PURCHASE_ORDERS`, `PURCHASE_ORDER_ITEMS`, `GOODS_RECEIVED_NOTES`). Migration `20260716210000_supplier_drugs_join` adds `SUPPLIER_DRUGS` (and drops legacy `SUPPLIERS.CATEGORIES`) for environments where the first pharmacy migration was applied before the join table existed in that SQL file. Migration `20260716220000_prescriptions` adds `PRESCRIPTIONS` + `PRESCRIPTION_ITEMS`. Migration `20260717100000_pharmacy_walk_in_sales` adds walk-in sales. Migration `20260717120000_pharmacy_pay_gate_returns` adds Rx payment/emergency columns, `QTY_RETURNED`, and `PHARMACY_RETURNS` tables. Migration `20260717130000_pharmacy_settings` adds `PHARMACY_SETTINGS` thresholds. Migration `20260717160000_encounters` creates `ENCOUNTERS`. Migration `20260717180000_encounter_note_fields` adds expanded note columns. Migration `20260718160000_follow_ups` creates `FOLLOW_UPS`. Migration `20260718170000_clinical_notes` creates `CLINICAL_NOTES` + versions. Migration `20260720120000_laboratory` creates `LAB_TESTS` / `LAB_REQUESTS` / `LAB_REQUEST_ITEMS` and seeds the initial catalog. Run `npx prisma migrate deploy` after pull.

### Production (Render)

`render.yaml` runs `npx prisma migrate deploy` on every start. If `/api/encounters/*` returns **500** after a deploy, check Render logs for `relation "ENCOUNTERS" does not exist` (or missing column) — then either redeploy so migrate runs, or from the service shell / a machine with `DATABASE_URL`:

```bash
npx prisma migrate deploy
```
