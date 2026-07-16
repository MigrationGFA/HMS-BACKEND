# Features

Feature inventory for HMS backend. Status: ✅ Scaffolded · 🚧 Partial · 📋 Planned logic · ⏳ Future module

## Platform

| Feature | Status | Location |
|---------|--------|----------|
| NestJS app at `apps/api/` | ✅ | `apps/api/src/` |
| Split config (app, db, redis, jwt, storage, queue) | ✅ | `apps/api/src/config/` |
| Global Prisma module | ✅ | `apps/api/src/prisma/` |
| Health endpoint `GET /api/health` | ✅ | `app.controller.ts` |
| API prefix `/api` | ✅ | `main.ts` |
| Role constants (27 roles) | ✅ | `common/constants/roles.constants.ts` |
| Prisma role seed script | ✅ | `apps/api/prisma/seed.ts` — roles + 27 `@fnpharo.gov.ng` test accounts (password `password`) |
| Future modules README | ✅ | `future-modules/README.md` |

## Foundation Modules (Scaffolded)

| Module | Status | Route |
|--------|--------|-------|
| Auth | ✅ | `/api/auth` |
| Users | ✅ | `/api/users` |
| Roles | ✅ | `/api/roles` |
| Permissions | ✅ | `/api/permissions` |
| Audit | ✅ | `/api/audit` |
| System Settings | ✅ | `/api/system-settings/*` |

| Sub-feature | Status |
|-------------|--------|
| JWT login / refresh (access 1h, refresh 12h, auto-refresh then logout on hard 401) | ✅ |
| bcrypt password hashing | ✅ |
| RBAC guards (`PermissionsGuard` + `@RequirePermissions`, role map in `permissions.constants.ts`) | ✅ |
| Standard RECORDS front-desk role permission set | ✅ |
| Staff identity search `GET /api/users?q=` (`user:read`) | ✅ |
| Audit interceptor | 📋 |
| Departments / branches config | 📋 |

## Patient & Scheduling (Scaffolded)

| Module | Status | Route |
|--------|--------|-------|
| Patients | ✅ | `/api/patients` |
| Records | ✅ | `/api/records` |
| Appointments | ✅ | `/api/appointments` |
| Queues | ✅ | `/api/queues` |

| Sub-feature | Status |
|-------------|--------|
| Patient registration & MRN (`POST /patients` → PERSONS, optional email) | ✅ |
| Registration card auto-opened (`PATIENT_CARDS`, payment Pending) | ✅ |
| Patient Entry dashboard stats (`GET /records/dashboard-stats`) | ✅ |
| Records Officer Overview uses same dashboard-stats endpoint | ✅ |
| Patient Directory (`GET /records/directory` + `/directory-stats`) | ✅ |
| Records Audit Trail (`GET /records/audit` + `/audit-stats`) | ✅ |
| Records registration queue + payment gate (`/api/records/*`) | ✅ |
| Card payment gate (`GET /cards/person/:id`; triage blocked with 409 while Pending) | ✅ |
| Cashier confirm card payment (`POST /cashier/payments/cards/:id/confirm`) | ✅ |
| Person search (`GET /patients?q=`) | ✅ |
| Medical records management | 📋 |
| Appointment booking | 📋 |
| Walk-in queue | 📋 |
| PostgreSQL full-text search | 📋 |

## Clinical & Care (Scaffolded)

| Module | Status | Route |
|--------|--------|-------|
| Clinical | ✅ | `/api/encounters`, `/diagnoses`, etc. |
| Nursing | ✅ | `/api/nursing` |
| Admissions | ✅ | `/api/admissions/*` |
| Discharge | ✅ | `/api/discharge` |
| Psychiatry | ✅ | `/api/psychiatry/*` |
| Allied Health | ✅ | `/api/allied-health/*` |
| ICU | ✅ | `/api/icu` |

| Sub-feature | Status |
|-------------|--------|
| Encounters & clinical notes | 📋 |
| Prescriptions (`POST/GET/PATCH /prescriptions`) | ✅ |
| Diagnoses & care plans | 📋 |
| Ward & bed management | 📋 |
| Psychiatric OPC workflows | 📋 |
| Psychology, child/adolescent, addiction, psychogeriatrics | 📋 |
| Physiotherapy, speech therapy, nutrition, social work | 📋 |
| ICU monitoring | 📋 |

## Diagnostics & Pharmacy (Scaffolded)

| Module | Status | Route |
|--------|--------|-------|
| Laboratory | ✅ | `/api/laboratory/*` |
| Radiology | ✅ | `/api/radiology/*` |
| Pharmacy | ✅ | `/api/pharmacy/*` |

| Sub-feature | Status |
|-------------|--------|
| Lab requests, samples, results | 📋 |
| Imaging & ECG | 📋 |
| Supplier management (`POST/GET/PATCH /pharmacy/suppliers`) | ✅ |
| Drug catalog with supplier link (`/pharmacy/drugs`) | ✅ |
| Batch-tracked inventory: stock, expiry, FEFO adjustments (`/pharmacy/inventory`) | ✅ |
| Procurement: PR → PO → approve/send → receive (GRN) (`/pharmacy/procurement/*`) | ✅ |
| Pharmacy audit logging on all mutations (supplier/drug/PR/PO/receive/adjust) | ✅ |
| Pharmacist role granted pharmacy permissions (`PHARMACY_PERMISSIONS`) | ✅ |
| Doctor prescriptions create/send + pharmacy inbound list (`POST/GET/PATCH /prescriptions`) | ✅ |
| Dispensing (stock decrement / FEFO release) | 📋 |
| Async lab processing (RabbitMQ) | 📋 |

## Finance & Operations (Scaffolded)

| Module | Status | Route |
|--------|--------|-------|
| Billing | ✅ | `/api/billing/*` |
| Cashier | ✅ | `/api/cashier/*` |
| Finance | ✅ | `/api/finance/*` |
| Insurance | ✅ | `/api/insurance/*` |
| Inventory | ✅ | `/api/inventory/*` |

| Sub-feature | Status |
|-------------|--------|
| Invoices & service pricing | 📋 |
| Point-of-sale payments | 📋 |
| Revenue & financial claims | 📋 |
| NHIA & HMO integration | 📋 |
| Stock & procurement | 📋 |

## Reporting & Platform (Scaffolded)

| Module | Status | Route |
|--------|--------|-------|
| Reports | ✅ | `/api/reports` |
| Analytics | ✅ | `/api/analytics` |
| Notifications | ✅ | `/api/notifications` |
| Files | ✅ | `/api/files` |
| Realtime | ✅ | WebSocket `/events` |

| Sub-feature | Status |
|-------------|--------|
| Clinical / financial / operational reports | 📋 |
| Dashboard analytics | 📋 |
| SMS & email (RabbitMQ) | 📋 |
| File upload & storage | 📋 |
| Live queues & emergency broadcasts | 📋 |

## Governance & Administration (Scaffolded)

| Module | Status | Route |
|--------|--------|-------|
| Super Admin | ✅ | `/api/super-admin` |
| Governance | ✅ | `/api/governance/*` |
| Administration | ✅ | `/api/administration` |
| HR | ✅ | `/api/hr/*` |

| Sub-feature | Status |
|-------------|--------|
| Board dashboards | 📋 |
| CMD oversight | 📋 |
| Hospital administration | 📋 |
| Staff & student management | 📋 |

## Future Modules (Not Scaffolded)

| Module | Status |
|--------|--------|
| Transportation | ⏳ |
| Laundry | ⏳ |
| Kitchen | ⏳ |
| Maintenance | ⏳ |
| Facility Management | ⏳ |
| Security | ⏳ |
| Mortuary | ⏳ |
| Procurement (standalone) | ⏳ |
| Asset Management | ⏳ |

## Infrastructure

| Feature | Status |
|---------|--------|
| PostgreSQL + Prisma schema (auth/RBAC) | ✅ |
| Redis caching | 📋 |
| Redis sessions | 📋 |
| BullMQ queues | 📋 |
| RabbitMQ integration | 📋 |
| Rate limiting | 📋 |
| Table partitioning | 📋 |
| Read replica routing | 📋 |
| 2FA | 📋 |

## Related Documents

- [MODULES.md](./MODULES.md)
- [API_REFERENCE.md](./API_REFERENCE.md)
- [TODO.md](./TODO.md)
