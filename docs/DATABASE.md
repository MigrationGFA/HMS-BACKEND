# Database

## Overview

HMS uses **PostgreSQL** with **Prisma**. The active schema is intentionally slimmed to the entities currently implemented in the API and frontend.

Schema files live under `apps/api/prisma/`. Migrations are managed via `prisma migrate`.

## Schema Layout (active)

```
apps/api/prisma/
├── schema.prisma          # generator + datasource
├── models/
│   ├── auth.prisma           # ROLES, REFRESH_TOKENS
│   ├── users.prisma          # USERS
│   ├── patients.prisma       # PERSONS
│   ├── cards.prisma          # PATIENT_CARDS (registration card + payment gate)
│   ├── triage.prisma         # TRIAGE
│   ├── audit.prisma          # AUDITS (with AUDIT_TYPE)
│   ├── admissions.prisma     # WARDS, BEDS, ADMISSIONS
│   ├── nursing-care.prisma   # nursing notes/vitals/care plans/obs/incidents/forms
│   └── nursing-ops.prisma    # orders, tasks, MAR, shifts, handover, ICU, messages, reports
├── migrations/
└── seed.ts
```

Do not reintroduce unused tables without an owning module and migration plan.

## Core Entities

| Table | Model | Purpose |
|-------|-------|---------|
| `PERSONS` | `Persons` | Patient identity (single source of truth for demographics / NOK) |
| `USERS` | `Users` | Staff accounts |
| `ROLES` | `Roles` | RBAC roles (seeded) |
| `REFRESH_TOKENS` | `RefreshToken` | JWT refresh sessions |
| `TRIAGE` | `Triage` | Queue + vitals; stores `PERSON_ID` only (no duplicated demographics). Also backing store for Nursing Patient Queues (`/api/nursing/patient-queues*`) |
| `PATIENT_CARDS` | `PatientCards` | Registration card per person; `PAYMENT_STATUS` starts `Pending` and gates the workflow until a cashier confirms |
| `AUDITS` | `Audits` | Immutable audit trail with filterable `AUDIT_TYPE` |
| `WARDS` | `Wards` | Inpatient wards |
| `BEDS` | `Beds` | Beds per ward (`AVAILABLE` / `OCCUPIED` / `CLEANING` / …) |
| `ADMISSIONS` | `Admissions` | Inpatient stays linked to person + optional ward/bed |
| `NURSING_NOTES` | `NursingNotes` | Ward nursing notes |
| `NURSING_VITALS` | `NursingVitals` | Ward vitals + abnormal flags |
| `NURSING_CARE_PLANS` | `NursingCarePlans` | Nursing care plans |
| `NURSING_OBSERVATIONS` | `NursingObservations` | Observation charts (JSON fields) |
| `NURSING_INCIDENTS` | `NursingIncidents` | Incident reports |
| `NURSING_FORM_TEMPLATES` | `NursingFormTemplates` | Nursing form schemas |
| `NURSING_FORM_INSTANCES` | `NursingFormInstances` | Filled form instances |
| `NURSING_ORDERS` | `NursingOrders` | Lab / drug / imaging orders for nursing |
| `NURSING_TASKS` | `NursingTasks` | Nurse task board |
| `NURSING_MAR_ENTRIES` | `NursingMarEntries` | Medication administration record |
| `NURSING_SHIFTS` | `NursingShifts` | Shift clock |
| `NURSING_HANDOVERS` | `NursingHandovers` | Shift handover |
| `NURSING_ICU_NOTES` | `NursingIcuNotes` | ICU hourly notes |
| `NURSING_ICU_INFUSIONS` | `NursingIcuInfusions` | ICU infusion titrations |
| `NURSING_MESSAGES` | `NursingMessages` | Nursing channel chat |
| `NURSING_REPORT_SNAPSHOTS` | `NursingReportSnapshots` | Generated nursing reports |

### Relationships

```
USERS ── ROLE_ID ── ROLES
USERS ── REFRESH_TOKENS
USERS ── PERSON_ID ── PERSONS (optional link)
PERSONS ── TRIAGE (1:N)
PERSONS ── PATIENT_CARDS (1:N; created by / confirmed by USERS)
PERSONS ── ADMISSIONS (1:N)
WARDS ── BEDS (1:N)
WARDS / BEDS ── ADMISSIONS
ADMISSIONS / PERSONS ── nursing care docs (notes, vitals, care plans, …)
ADMISSIONS / PERSONS ── nursing ops (orders, tasks, MAR, ICU …)
WARDS ── nursing shifts / handovers / report snapshots
USERS ── AUDITS
```

### Triage design rule

`TRIAGE` stores operational/vitals fields and **`PERSON_ID`**. Name, hospital number, phone, next of kin, etc. are read by joining `PERSONS` — never copied into triage rows.

### Audit types (examples)

| `AUDIT_TYPE` | When |
|--------------|------|
| `person:create` | Patient registration |
| `triage:create` | New triage queue entry |
| `triage:update` | Status / priority / vitals change |
| `admission:create` | Patient admitted to bed |
| `admission:transfer` | Bed transfer |
| `admission:order-discharge` | Discharge ordered |
| `admission:discharge` | Discharge completed |
| `nursing-note:create` / `nursing-vital:create` / … | Nursing care documentation writes |

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
