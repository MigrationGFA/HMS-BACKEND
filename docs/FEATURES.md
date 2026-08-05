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
| Records Officer Overview (`GET /records/overview` → `/dashboard/records`) | ✅ |
| Patient Directory (`GET /records/directory` + `/directory-stats`) | ✅ |
| Records Audit Trail (`GET /records/audit` + `/audit-stats`) | ✅ |
| Patient Arrival / Check-In (`GET /records/arrivals`, `POST /records/arrivals/route`) | ✅ |
| Records registration queue + payment gate (`/api/records/*`) | ✅ |
| Registration fee catalog (`GET /records/registration-charges`; seed `SVC-REG-FEE`, `SVC-CARD-FEE`, `SVC-REG-CONSULT`; server-enforced on registration create) | ✅ |
| Card payment gate (`GET /cards/person/:id`; triage blocked with 409 while Pending) | ✅ |
| Cashier confirm card payment (`POST /cashier/payments/cards/:id/confirm`) | ✅ |
| Person search (`GET /patients?q=`) | ✅ |
| Medical records management (retrieval / archive / reports / analytics) | ✅ |
| Records My Profile (`/records/profile`, `GET/PATCH /users/me`) | ✅ | Identity, desk/unit, station, duty hours, password — not clinical license/specialty |
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
| Staff support requests | ✅ | `/api/support-requests` — create/list/detail/status update (`support:create|read|update`); HR queue |
| Clinical Pharmacy (interactions) | ✅ | `/api/clinical-pharmacy/*` — alerts, check, override/notify, rules, allergies (`clinical-pharmacy:*`) |
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
| Urine drug screens (`/laboratory/drug-screens/*`) live FE workstation + worklist KPIs | ✅ |
| Culture & sensitivity (`/laboratory/cultures/*`) live FE MCS workspace | ✅ |
| Seminal fluid analysis (`/laboratory/sfa/*`) live FE | ✅ |
| Lab analytics summary (`GET /laboratory/analytics/summary`) live FE | ✅ |
| Specimen tracking + chain-of-custody (`/laboratory/specimens/*`) | ✅ |
| Microbiology workbench (`/laboratory/microbiology/*`, cultures-backed) | ✅ |
| Histopathology cases (`/laboratory/histopathology/*`) live FE | ✅ |
| Quality Control runs + CAPA (`/laboratory/qc/*`) live FE | ✅ |
| Lab Configuration = live test catalog create/edit (`/laboratory/tests`) | ✅ |
| Lab My Profile (`/dashboard/laboratory/profile`, `GET/PATCH /users/me`) | ✅ |
| Lab report snapshots list/generate (`/laboratory/reports`) | ✅ |
| Patient lab history (`GET /laboratory/history?personId=`) live FE History Center | ✅ |
| Lab Request Center shows Unpaid as Pending Payment (limited detail; Collect/Results locked) | ✅ |
| Lab Request Center Paid/Waived unlocks full detail + processing | ✅ |
| Cashier Patient Search live (`/dashboard/cashier/search`) | ✅ | Recent 10 on load + `GET /api/cashier/patients/search`; payment history with partialErrors |
| Cashier Pending/Paid bills = live aggregate (cards + pharmacy + Rx + lab + admission + imaging) | ✅ | Hub `/dashboard/cashier/bills` tabs Pending/Paid |
| Cashier Part Payments empty (no partial for domain bills) | ✅ | Hub tab Part |
| Cashier Invoice + clinical bills workspace | ✅ | `/dashboard/cashier/bills` (Invoice \| Pending \| Paid \| Part); legacy `/pay|/pending|/paid|/part` redirect |
| Cashier clinical payments `?tab=walkin|rx|lab|admission` deep-link | ✅ |
| Active Consultation previous history + lab request dialog | ✅ |
| Lab result templates in DB (12 seeded; create/edit/duplicate/deactivate, `/laboratory/templates`) | ✅ |
| Lab sample collection + reject (`/laboratory/requests/:id/collect`, `/laboratory/samples`) | ✅ |
| Lab result entry draft/submit (template-driven, `/laboratory/requests/:id/results`) | ✅ |
| Lab result validation / return-to-bench (`/laboratory/results/:id/validate\|return`) | ✅ |
| Lab result amendment + immutable version history (`/laboratory/results/:id/amend`, `/versions`) | ✅ |
| Lab dashboard pages live (requests/samples/results/validation/amendment/templates) | ✅ |
| Doctor Lab Request Engine live queues (`listLabRequests`) + Results Viewer (`listLabResults` Validated/Submitted) | ✅ |
| Doctor Lab critical results list + acknowledge (`GET …/results?critical=true`, `POST …/acknowledge`) | ✅ |
| Doctor Lab drafts (IndexedDB per person when API on) + awaiting validation / rejected queues | ✅ |
| Doctor Prescription Engine full tabs (drafts/dispensed/active/stopped/external/CDS/history) live | ✅ |
| Prescription medications scope + stop line + refill + external purchase log | ✅ |
| Doctor Imaging Engine live queues (status map fix) + reports/critical ack | ✅ |
| Imaging reports (`IMAGING_REPORTS` create/list/ack) | ✅ |
| Doctor Admission Request Engine (API Mine/All; clinical only — no ward/bed/payment) | ✅ |
| Doctor Admission Admitted + History from live `GET /admissions` + closed requests (no seed/KPI padding) | ✅ |
| Doctor Diagnosis Coding Support from catalog; Pending Integration for Export/Note/Schedule/Scales | ✅ |
| Doctor Results Viewer: lab + imaging reports + critical ack + history; ECG Pending Integration | ✅ |
| Doctor Emergency Override: all tabs live; create stubs Pending Integration | ✅ |
| Shared `PendingIntegrationBanner` for honest non-integrated actions | ✅ |
| Doctor CDS live (clinical-pharmacy alerts/check/allergies; Pending Integration for pregnancy/renal/liver/guidelines) | ✅ |
| Doctor Analytics live (`GET /api/doctor/analytics`; CSV Excel-compatible exports) | ✅ |
| Doctor Cross-Dept hub (referrals/critical aggregates; Module/Messages/Sync Pending Integration) | ✅ |
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
| Billing | ✅ | `/api/billing/*` — Master Service Catalog under `/api/billing/services*` |
| Cashier | ✅ | `/api/cashier/*` — receipts, refunds, discounts, shifts, reports, patient payment-history, verify, audit, settings; FE desk `/dashboard/cashier` (+ profile); `/billing/*` visits/gate kept |
| Finance | ✅ | `/api/finance/*` |
| Insurance | ✅ | `/api/insurance/*` |
| Inventory | ✅ | `/api/inventory/*` |

| Sub-feature | Status |
|-------------|--------|
| **Master Service Catalog** (dept create → finance price → IT approve; GENERAL/STAFF + NHIA/HMO/Corporate payer prices) | ✅ |
| Service categories / departments / service-payers APIs | ✅ |
| Resolve-price helper (`GET …/services/:id/resolve-price`) | ✅ |
| Lab/Imaging order price snapshot from `MasterServices.GENERAL_PRICE` when linked | ✅ |
| Invoices & POS payments | 📋 |
| Revenue & financial claims | 📋 |
| NHIA claims submission | 📋 |
| Stock & procurement | 📋 |

### Master Service Catalog endpoints

| Method | URL | Purpose | Permission | Request body | Response | Errors |
|--------|-----|---------|------------|--------------|----------|--------|
| GET | `/api/billing/service-categories` | List categories | `service:read` | — | `{ data: { items } }` | 401, 403 |
| GET | `/api/billing/departments` | List departments | `service:read` | `?status=&q=` | `{ data: { items } }` | 401, 403 |
| POST | `/api/billing/departments` | Create department | `service:approve` | `{ name, code? }` | `{ data: department }` | 400, 401, 403 |
| GET | `/api/billing/services` | Paginated catalog | `service:read` | filters | `{ data: { items, meta } }` | 401, 403 |
| GET | `/api/billing/services/orderable` | ACTIVE only | `service:read` | filters | `{ data: { items, meta } }` | 401, 403 |
| GET | `/api/billing/services/bookable` | Landing ONLINE_BOOKABLE catalog (price, mode, duration) | public | `?q=&categoryId=` | `{ data: { items } }` | 500 |
| GET | `/api/appointments/public/availability` | Slot grid by service duration | public | `serviceId`, `date`, `mode` | `{ data: { slots, price } }` | 400, 404 |
| POST | `/api/appointments/public/book` | Create public booking | public | patient + slot | `{ data: booking }` | 400, 404 |
| GET | `/api/billing/services/:id` | Detail + prices | `service:read` | — | `{ data: service }` | 401, 403, 404 |
| POST | `/api/billing/services` | Create (no prices) | `service:create` | metadata | `{ data: service }` `PENDING_PRICING` | 400 (prices), 401, 403 |
| PATCH | `/api/billing/services/:id` | Metadata | `service:update` | partial | `{ data: service }` | 400, 401, 403, 404 |
| PATCH | `/api/billing/services/:id/pricing` | Finance pricing | `service:price` | `{ generalPrice, staffPrice?, payerPrices?, submitForApproval? }` | `{ data: service }` | 400, 401, 403, 404 |
| POST | `/api/billing/services/:id/submit-approval` | Submit for IT | `service:price` | — | `{ data: service }` | 400, 401, 403, 404 |
| POST | `/api/billing/services/:id/approve` | Approve → ACTIVE | `service:approve` | `{ notes? }` | `{ data: service }` | 400, 401, 403, 404 |
| POST | `/api/billing/services/:id/reject` | Reject | `service:approve` | `{ notes? }` | `{ data: service }` | 400, 401, 403, 404 |
| GET/POST/PATCH | `/api/billing/service-payers` | Manage payers | `service_payer:manage` | see API_REFERENCE | `{ data }` | 400, 401, 403, 404 |
| GET | `/api/billing/services/:id/resolve-price` | Resolve amount | `service:read` | `?payerType=&payerId=` | `{ data: { amount, source } }` | 400, 401, 403, 404 |

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
