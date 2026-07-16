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

### Relationships

```
USERS ── ROLE_ID ── ROLES
USERS ── REFRESH_TOKENS
USERS ── PERSON_ID ── PERSONS (optional link)
PERSONS ── TRIAGE (1:N)
PERSONS ── PATIENT_CARDS (1:N; created by / confirmed by USERS)
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

Migration `20260716000000_pharmacy_procurement_inventory` adds the pharmacy tables (`SUPPLIERS`, `SUPPLIER_DRUGS`, `DRUGS`, `DRUG_BATCHES`, `PURCHASE_REQUESTS`, `PURCHASE_ORDERS`, `PURCHASE_ORDER_ITEMS`, `GOODS_RECEIVED_NOTES`). It was written manually while the Azure database was unreachable — run `npx prisma migrate deploy` once connectivity is restored.
