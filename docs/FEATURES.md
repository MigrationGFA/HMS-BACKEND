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
| Audit | ✅ | `/api/audit/logs`, `/api/audit/stats` |
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
| Patient Arrival / Check-In (`GET /records/arrivals`, `POST /records/arrivals/route`) | ✅ |
| Records registration queue + payment gate (`/api/records/*`) | ✅ |
| Card payment gate (`GET /cards/person/:id`; triage blocked with 409 while Pending) | ✅ |
| Cashier confirm card payment (`POST /cashier/payments/cards/:id/confirm`) | ✅ |
| Person search (`GET /patients?q=`) | ✅ |
| Medical records management | 📋 |
| Appointment booking | 📋 |
| Walk-in queue | ✅ |
| Walk-in sales: request → cashier pay → dispense (`/pharmacy/walk-in`, cashier pharmacy-sales) | ✅ |
| PostgreSQL full-text search | 📋 |

## Clinical & Care (Scaffolded)

| Module | Status | Route |
|--------|--------|-------|
| Clinical | ✅ | `/api/encounters`, `/diagnoses`, etc. |
| Nursing | ✅ | Phases 0–12 E2E (queues, admissions, care docs, orders/MAR/samples, shifts/ICU, comms/reports) — [NURSING_MODULE.md](./NURSING_MODULE.md) |
| Admissions | ✅ | `/api/admissions/*` — wards (gender + free beds), beds, admit/transfer/discharge; admit auto-posts package bill |
| Patient transfers (multi-role) | ✅ | `/api/transfers` — doctor request (no bed) → nurse prepare → Records/nurse allocate → receive → confirm; occupancy on confirm |
| Clinical referrals (multi-role) | ✅ | `/api/referrals` — doctor Internal/External → Records route/clear → bed allocate/admit or Accept→Complete |
| In-app notifications | ✅ | `/api/notifications` — inbox read/ack/stats |
| Admission requests (doctor queue) | ✅ | `/api/admission-requests` — create/list mine\|all/update; statuses incl. Admitted |
| Admission bills (package invoice) | ✅ | `/api/admission-bills` + cashier confirm; catalogue + Day-1 bed rate |
| Diagnoses (ICD catalog + problem list) | ✅ | `/api/diagnoses` catalog/list/create/update/stats |
| Discharge drafts (doctor → cashier → Records) | ✅ | `/api/discharge-drafts` — draft/submit/`order-discharge` → payment clear → finalize/`complete-discharge`; empty `/api/discharge` retired (403) |
| Doctor analytics | ✅ | `GET /api/doctor/analytics` — doctor-scoped KPIs/charts/tables (`doctor-analytics:read`) |
| Doctor research & audit | ✅ | `/api/doctor/research/*` — summary/diagnoses/wards/drugs + registry/trials/audit-projects CRUD (`doctor-research:write`) |
| Clinical certificates & reports | ✅ | `/api/clinical-certificates` templates + draft/sign/approve; 16 templates seeded; RBAC `certificate:*` |
| Doctor clinical boards | ✅ | Patient Directory, Active Board, Ward Round, Transfers, Emergency Override, Audit & Compliance, Research & Audit live when `VITE_USE_API` |
| Emergency Override | ✅ | `/api/emergency-override/*` — break-glass sessions, alerts, board KPIs (`emergency-override:*`) |
| Psychiatry | ✅ | `/api/psychiatry/*` |
| Allied Health | ✅ | `/api/allied-health/*` |
| ICU | ✅ | `/api/icu` |

| Sub-feature | Status |
|-------------|--------|
| Patient Queues (daily OPD triage + payment + vitals + send to doctor) | ✅ |
| Nursing notes / vitals / care plans / observations / incidents / forms | ✅ (API) |
| Orders / tasks / MAR / samples | ✅ (API; clinical/pharmacy bridges → nursing-ops; lab bridge retired — lab has its own LIS) |
| Shifts / handover / ICU board | ✅ (API) |
| Nursing comms / reports / analytics | ✅ (API) |
| Encounters & clinical notes | 📋 |
| Encounters consultation queue + start/complete (`/api/encounters/*`, payment-gated) | ✅ |
| Patient clinical summary + encounter notes timeline (`GET …/clinical-summary`, `GET …/notes`) | ✅ |
| Full clinical note sections on encounters (PMH, drug/allergy/family/social Hx, follow-up) | ✅ |
| Clinical Documentation notes (`/api/clinical-notes/*` — drafts, review, sign, versions; patient search via `/api/patients`) | ✅ |
| Prescriptions (`POST/GET/PATCH /prescriptions`) | ✅ |
| Diagnoses & care plans | 📋 |
| Ward & bed management | ✅ (API) |
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
| Lab test catalog (`GET/POST/PATCH /laboratory/tests`) | ✅ |
| Doctor lab requests Unpaid → cashier pay (`/laboratory/requests`, `/cashier/payments/lab-requests`) | ✅ |
| Lab walk-in create (`source=WalkIn`, Unpaid) + LAB `lab:create` | ✅ |
| Lab sidebar unified on full `labCenterNav` for all `/dashboard/laboratory/*` pages | ✅ |
| Result Templates Preview (form layout from backend `FIELDS` via `GET /templates/:id`) | ✅ |
| Blood bank inventory + requests + crossmatch + issue/reject (`/laboratory/blood-bank/*`, RBAC `blood-bank:*`) | ✅ |
| Blood donors CRUD + doctor search + issue history; Issued units cannot return to Available | ✅ |
| Urine drug screens (`/laboratory/drug-screens/*`) live FE workstation | ✅ |
| Culture & sensitivity (`/laboratory/cultures/*`) live FE MCS workspace | ✅ |
| Lab report snapshots list/generate (`/laboratory/reports`) | ✅ |
| Patient lab history (`GET /laboratory/history?personId=`) live FE History Center | ✅ |
| Lab Request Center shows Unpaid as Pending Payment (limited detail; Collect/Results locked) | ✅ |
| Lab Request Center Paid/Waived unlocks full detail + processing | ✅ |
| Cashier Pending/Paid bills = live aggregate (cards + pharmacy + Rx + lab + admission) | ✅ |
| Cashier Part Payments empty (no partial for domain bills) | ✅ |
| Cashier clinical payments `?tab=walkin|rx|lab|admission` deep-link | ✅ |
| Active Consultation previous history + lab request dialog | ✅ |
| Lab result templates in DB (12 seeded; create/edit/duplicate/deactivate, `/laboratory/templates`) | ✅ |
| Lab sample collection + reject (`/laboratory/requests/:id/collect`, `/laboratory/samples`) | ✅ |
| Lab result entry draft/submit (template-driven, `/laboratory/requests/:id/results`) | ✅ |
| Lab result validation / return-to-bench (`/laboratory/results/:id/validate\|return`) | ✅ |
| Lab result amendment + immutable version history (`/laboratory/results/:id/amend`, `/versions`) | ✅ |
| Lab dashboard pages live (requests/samples/results/validation/amendment/templates) | ✅ |
| Doctor Lab Request Engine live queues (`listLabRequests`) + Results Viewer (`listLabResults` Validated/Submitted) | ✅ |
| Doctor Admission Request Engine (API Mine/All; clinical only — no ward/bed/payment) | ✅ |
| Standard ward/bed inventory (11 wards × 20 beds; AVAILABLE/OCCUPIED tracking) | ✅ |
| Records Admission Requests live (approve/reject/allocate ward+bed/admit + Unpaid bill) | ✅ |
| Doctor Patient Transfer Engine (API; no bed assign) | ✅ |
| Nurse Transfer Queue (`/dashboard/nurse/transfers`) | ✅ |
| Records Patient Transfers allocate/verify (`/records/transfers`) | ✅ |
| Doctor Clinical Referrals Engine (API; Internal/External; no bed) | ✅ |
| Doctor inbound Accept → Attend → Complete | ✅ |
| Records Clinical Referrals queue (`/records/referrals`) | ✅ |
| Records Arrivals open-referral banner + deep-link | ✅ |
| Nurse Referral Bed Queue (`/dashboard/nurse/referrals`) | ✅ |
| Doctor Notifications Center (live `/api/notifications`) | ✅ |
| Doctor Audit transfer logs (`GET /api/audit/logs?type=transfer:*`) | ✅ |
| Doctor Audit & Compliance board (`GET /api/audit/logs` + `/api/audit/stats`, no FE seeds) | ✅ |
| Doctor Emergency Override board (`/api/emergency-override/*`) | ✅ |
| Doctor Research & Audit board (`/api/doctor/research/*`) | ✅ |
| Doctor Clinical Workstation Overview (`GET /api/doctor/overview`) | ✅ |
| Laboratory Dashboard Overview (`GET /api/laboratory/overview`) | ✅ |
| Imaging study catalog + doctor requests (pay-before-process) | ✅ |
| Cashier Imaging Requests tab (`?tab=imaging`) | ✅ |
| Radiology Request Center live (Accept locked until Paid) | ✅ |
| Imaging & ECG advanced RIS (schedule/report/PACS) | 📋 |
| Supplier management (`POST/GET/PATCH /pharmacy/suppliers`) | ✅ |
| Drug catalog with supplier link (`/pharmacy/drugs`) | ✅ |
| Batch-tracked inventory: stock, expiry, FEFO adjustments (`/pharmacy/inventory`) | ✅ |
| Procurement: PR → PO → approve/send → receive (GRN) (`/pharmacy/procurement/*`) | ✅ |
| Procurement receivable POs + History cards/table (`orders/receivable`, `history`) | ✅ |
| Pharmacy audit logging on all mutations (supplier/drug/PR/PO/receive/adjust) | ✅ |
| Pharmacist role granted pharmacy permissions (`PHARMACY_PERMISSIONS`) | ✅ |
| Doctor prescriptions create/send + pharmacy inbound list (`POST/GET/PATCH /prescriptions`) | ✅ |
| Pharmacy dispense by Rx (`GET …/by-rx/:rxNo`, `POST …/:id/dispense`, FEFO + audit) | ✅ |
| Rx pay-before-dispense + emergency override (`emergency-dispense`, cashier prescription pay) | ✅ |
| Pharmacy billing aggregate (`/pharmacy/billing` summary + bills + confirm) | ✅ |
| Pharmacy billing Collect is cashier-only (pharmacy page is view + link) | ✅ |
| Pharmacy settings thresholds (`/pharmacy/settings`, `/pharmacy/config`) | ✅ |
| Pharmacy returns of dispensed drugs (`/pharmacy/returns`, stock restore) | ✅ |
| Pharmacy operations dashboard (`GET /pharmacy/dashboard`) | ✅ |
| Inpatient pharmacy ward queue (`GET /pharmacy/inpatient`) | ✅ |
| Pharmacy operational reports (`GET /pharmacy/reports/catalog`, `/reports/:type`) | ✅ |
| Pharmacy audit trail (`GET /pharmacy/audit`, `/audit/stats`) | ✅ |
| Pharmacy expiry monitoring (`GET /pharmacy/expiry`, quarantine) | ✅ |
| Pharmacy analytics (`GET /pharmacy/analytics`) | ✅ |
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
| Platform analytics scaffold | 📋 | `/api/analytics` empty stub — use doctor/nursing/pharmacy domain analytics |
| Doctor self profile | ✅ | `GET/PATCH /api/users/me` + `POST /api/auth/change-password` |
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
