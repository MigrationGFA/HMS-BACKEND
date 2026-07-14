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

### Relationships

```
USERS ── ROLE_ID ── ROLES
USERS ── REFRESH_TOKENS
USERS ── PERSON_ID ── PERSONS (optional link)
PERSONS ── TRIAGE (1:N)
PERSONS ── PATIENT_CARDS (1:N; created by / confirmed by USERS)
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
