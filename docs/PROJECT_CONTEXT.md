# Project Context

## What Is HMS?

HMS (Hospital Management System) is an enterprise backend API for managing hospital operations: patient records, clinical workflows, admissions, psychiatry, allied health, diagnostics, pharmacy, billing, finance, and real-time operational visibility.

This repository (`HMS-BACKEND`) is the **API layer only**. The frontend (`fnph-aro`) lives in a separate project and consumes this API.

**Deployed API (fnph-aro `VITE_API_BASE_URL`):** `https://hms-backend-1-blmv.onrender.com`

**Test staff logins** are seeded via `npm run prisma:seed` — every role email (`superadmin@fnpharo.gov.ng`, `doctor@fnpharo.gov.ng`, …) uses password `password`.

## Design Principle: Modules by Hospital Function

Modules are organized by **hospital function** (patients, laboratory, billing), **not** by dashboard role or user persona. A doctor's UI may call endpoints from `clinical`, `laboratory`, and `patients` modules — roles control access via RBAC, not module boundaries.

## Goals

1. **Reliable clinical operations** — queues, appointments, emergency intake, ICU workflows, doctor emergency override, research analytics
2. **Secure access** — RBAC with 27 system roles mapped to hospital functions
3. **Auditability** — immutable audit trail for compliance (`/api/audit/logs` + `/api/audit/stats`)
4. **Scalable foundation** — PostgreSQL, Redis, RabbitMQ, read replicas when needed
5. **Realtime awareness** — Socket.IO for queues, notifications, emergency broadcasts
6. **Enterprise coverage** — psychiatry, allied health, insurance (NHIA/HMO), governance, HR

## Non-Goals (Current Phase)

- Frontend UI implementation
- Full business logic in scaffolded modules (structure only for now)
- Multi-tenant SaaS (single-hospital deployment initially)
- External search engine — PostgreSQL full-text search first
- Two-factor authentication (2FA) — planned later
- Microservices split — modular monolith at `apps/api`

## System Roles

Defined in `apps/api/src/common/constants/roles.constants.ts`:

| Role | Hospital Function |
|------|-------------------|
| `SUPER_ADMIN` | Full system access |
| `BOARD` | Governance dashboards |
| `CMD` | Chief Medical Director oversight |
| `ADMIN` | Hospital administration |
| `FINANCE` | Financial operations |
| `HR` | Human resources |
| `DOCTOR` | Clinical care |
| `NURSE` | Nursing care |
| `PHARMACIST` | Pharmacy operations |
| `LAB` | Laboratory |
| `RADIOLOGY` | Radiology & imaging |
| `PSYCHIATRIC_OPC` | Psychiatric outpatient clinic |
| `PSYCHOLOGY` | Psychology services |
| `CHILD_ADOLESCENT` | Child & adolescent psychiatry |
| `ADDICTION_REHAB` | Addiction & rehabilitation |
| `PSYCHOGERIATRICS` | Psychogeriatrics |
| `PHYSIOTHERAPY` | Physiotherapy |
| `SPEECH_THERAPY` | Speech therapy |
| `NUTRITION` | Nutrition & dietetics |
| `SOCIAL_WORK` | Social work |
| `ICU` | Intensive care unit |
| `CASHIER` | Point-of-sale payments |
| `RECORDS` | Medical records |
| `IT` | IT administration |
| `STAFF` | General staff |
| `STUDENT` | Clinical students / trainees |
| `PATIENT` | Patient portal (future) |

RBAC uses `Role`, `Permission`, and join tables. Permissions follow `resource:action` (e.g. `patient:read`).

## Technical Constraints

| Constraint | Choice |
|------------|--------|
| Runtime | Node.js 20+ |
| Framework | NestJS 11 + TypeScript (strict) |
| App location | `apps/api/` |
| Database | PostgreSQL 15+ |
| ORM | Prisma 7 |
| Cache / sessions / rate limit | Redis 7+ |
| Async messaging | RabbitMQ 3.12+ |
| Auth | JWT access + refresh tokens, Passport.js, bcrypt |
| Realtime | Socket.IO |

## Repository Layout

```
HMS-BACKEND/
├── apps/
│   └── api/
│       ├── src/              # NestJS application
│       ├── prisma/           # Schema, migrations, seed
│       ├── test/             # E2E tests
│       └── .env.example
├── docs/                     # Project documentation
├── scripts/                  # Scaffolding utilities
└── .cursor/rules/            # Cursor AI rules
```

## Environment

Configuration is loaded from `.env` via `@nestjs/config` with split config files in `apps/api/src/config/`. See `apps/api/.env.example`.

Default local API URL: `http://localhost:3000/api`

## Related Documents

- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)
- [FEATURES.md](./FEATURES.md)
- [MODULES.md](./MODULES.md)
