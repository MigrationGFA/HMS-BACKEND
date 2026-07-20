# Changelog

All notable changes to HMS Backend are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed
- Render start command now runs `prisma migrate deploy` before `start:prod` so tables like `ENCOUNTERS` exist in production (fixes `GET /api/encounters/active` 500 when migrations were not applied)

### Added
- Laboratory catalog + doctor requests (pay-before-process): `LAB_TESTS` / `LAB_REQUESTS` / `LAB_REQUEST_ITEMS` (migration `20260720120000_laboratory`, seeded from doctor TEST_CATALOG); `GET/POST/PATCH /api/laboratory/tests`, `POST/GET /api/laboratory/requests`, `POST …/:id/cancel`; cashier `GET/POST /api/cashier/payments/lab-requests`; RBAC `lab:read|create|update|pay`; audit `lab:test-create|request-create|request-cancel|pay`. Doctor create always sets `PAYMENT_STATUS=Unpaid` (no Cash/NHIA/HMO on doctor DTO). Active Consultation previous-history panel + Lab Request dialog; DocLab + Cashier Lab Requests tab wired when API enabled.

- Consultation workspace Completed tab: `GET /api/encounters/completed` (today's completed consultations for logged-in doctor); frontend `/dashboard/doctor/clinical/workspace` uses live queue/active/completed/follow-ups only (mock seed data removed)

- Clinical Documentation: `CLINICAL_NOTES` + `CLINICAL_NOTE_VERSIONS` (migration `20260718170000_clinical_notes`); `GET/POST/PATCH /api/clinical-notes` with submit/sign/approve/return/void + templates/summary/versions; RBAC `clinical-note:*`; doctor page `/dashboard/doctor/clinical/documentation` wired with live patient search (`GET /api/patients`) and IndexedDB draft autosave

- Follow-up scheduling: `FOLLOW_UPS` table (migration `20260718160000_follow_ups`); `GET/POST /api/encounters/follow-ups`, `PATCH /api/encounters/follow-ups/:id`; complete consultation accepts `followUpDate` (+ clinic/time/priority/reason) and creates a follow-up; clinical workspace Follow-Up tab + complete/schedule dialogs wired to live API

- Doctor clinical summary: `GET /api/encounters/patients/:personId/clinical-summary` (demographics, triage vitals, allergies, meds, past diagnoses/notes) and `GET …/notes` timeline; expanded `ENCOUNTERS` note columns (migration `20260717180000_encounter_note_fields`); queue/encounter responses include real `vitals` + last completed visit; workspace eye-view + active consult panels + Doctor Note Timeline wired to live APIs
- Doctor consultation queue: `ENCOUNTERS` table (migration `20260717160000_encounters`); `GET /api/encounters/consultation-queue`, `GET /active`, `POST /start` (payment Paid/Waived required), `GET/PATCH /:id`, `POST /:id/complete`; RBAC `encounter:*`; Records consult route re-checks payment; frontend `/dashboard/doctor/clinical/workspace` live with IndexedDB draft autosave
- Records Patient Arrival: `GET /api/records/arrivals` (today's triage + pending check-in, summary cards) + `POST /api/records/arrivals/route` (triage|consult|emergency|checkout with `arrival:*` audit); RECORDS role gains `triage:update`; frontend `/records/arrivals` wired with loading/refresh/route states
- Pharmacy expiry monitoring: `GET /api/pharmacy/expiry` (settings-based buckets) + `POST /api/pharmacy/expiry/batches/:batchId/quarantine` (`stock:quarantine` audit); frontend `/dashboard/pharmacy/expiry` live
- Pharmacy analytics: `GET /api/pharmacy/analytics` (revenue, dispense volume, inventory, controlled, returns, procurement charts); frontend `/pharmacy/analytics` live (no mock NHIA)
- Pharmacy operational pages APIs: `GET /api/pharmacy/dashboard`, `GET /api/pharmacy/inpatient`, `GET /api/pharmacy/reports/catalog`, `GET /api/pharmacy/reports/:type`, `GET /api/pharmacy/audit`, `GET /api/pharmacy/audit/stats`; frontend `/pharmacy`, `/pharmacy/inpatient`, `/pharmacy/reports`, `/pharmacy/audit` wired with loading/error/empty states
- Pharmacy pay-before-dispense (Rx): payment fields + emergency receiver on `PRESCRIPTIONS`; `POST /api/prescriptions/:id/dispense` requires Paid|Waived|Emergency; `POST …/emergency-dispense` records receiver and leaves unpaid/Emergency bill; cashier `GET/POST /api/cashier/payments/prescriptions`; permission `prescription:pay`
- Pharmacy settings thresholds: `PHARMACY_SETTINGS` (migration `20260717130000_pharmacy_settings`); `GET/PATCH /api/pharmacy/settings` for reorder default, expiry alert windows, inventory/controlled flags; inventory stats use configured days; `/pharmacy/config` UI; `pharmacy:settings-update`
- Pharmacy billing page is view-only for pharmacy; Collect payment remains cashier-only (`/dashboard/cashier/pharmacy`)
- Pharmacy billing aggregate: `GET /api/pharmacy/billing/summary`, `GET /api/pharmacy/billing/bills`, `POST /api/pharmacy/billing/bills/:type/:id/confirm` (Rx + walk-in)
- Pharmacy returns: `PHARMACY_RETURNS` / `PHARMACY_RETURN_ITEMS` + `QTY_RETURNED` on line items (migration `20260717120000_pharmacy_pay_gate_returns`); `GET/POST /api/pharmacy/returns`, lookup + summary; stock restore to batches; RBAC `pharmacy:return-create|read`; audit `pharmacy:return`
- Frontend: dispense confirmation modals (Rx + walk-in), emergency dispense UI, cashier Rx payments tab, `/pharmacy/billing` and `/pharmacy/returns` wired to APIs
- Walk-in pharmacy sales: `PHARMACY_SALES` / `PHARMACY_SALE_ITEMS` (migration `20260717100000_pharmacy_walk_in_sales`); flow request → cashier pay → dispense; endpoints `POST/GET /api/pharmacy/walk-in`, `POST …/:id/dispense`, `GET/POST /api/cashier/payments/pharmacy-sales`; RBAC `pharmacy:sale-create|read|pay`; audit `pharmacy:sale-create|pay|dispense|cancel`
- Procurement receive/history: `GET /api/pharmacy/procurement/orders/receivable`, `GET /api/pharmacy/procurement/history` (cards + table); receive requires Approved PO, auto-advances Not Sent→Sent, creates `DRUG_BATCHES` (stock increases), receiver locked to authenticated user; frontend Accept opens Receive Stock prefilled
- Clinical prescriptions API: `PRESCRIPTIONS` + `PRESCRIPTION_ITEMS` (migration `20260716220000_prescriptions`); `POST/GET/PATCH /api/prescriptions` with RBAC (`prescription:create|read|update`), patient-centric `PERSON_ID`, drug catalog FKs, audit on create/send/update; doctors send Rx, pharmacy lists `status=Sent`
- Pharmacy dispense: `GET /api/prescriptions/by-rx/:rxNo`, `POST /api/prescriptions/:id/dispense` (`pharmacy:dispense`) — FEFO stock deduction from `DRUG_BATCHES`, status Dispensed, audit `pharmacy:dispense` + audit trail on detail
- Frontend: Doctor Prescription Engine and Pharmacy queue (`/pharmacy/queue`, `/dashboard/pharmacy/queue`) wired to live prescriptions + drug catalog when `VITE_USE_API=true`
- Frontend: `/pharmacy/rx/:rxNo` loads live Rx, Start Processing/View open dispense page; Confirm Dispense completes the prescription
- Migration `20260716210000_supplier_drugs_join` — creates missing `SUPPLIER_DRUGS` join table and drops legacy `SUPPLIERS.CATEGORIES` (fixes `GET /api/pharmacy/suppliers` 500 when the earlier pharmacy migration was applied before the join table existed in SQL)
- Pharmacy procurement & inventory backend: `SUPPLIERS`, `DRUGS`, `DRUG_BATCHES`, `PURCHASE_REQUESTS`, `PURCHASE_ORDERS`, `PURCHASE_ORDER_ITEMS`, `GOODS_RECEIVED_NOTES` tables (migration `20260716000000_pharmacy_procurement_inventory`)
- `POST/GET/PATCH /api/pharmacy/suppliers` — supplier registration + management list (`supplier:create|update`, `pharmacy:read`); supplied drugs referenced by `drugIds` via the `SUPPLIER_DRUGS` join table (names joined for display, never stored on the supplier)
- Frontend: supplier modal drug picker is an inline search + checklist (always visible inside the dialog); Create PO modal uses a line-item table (Drug Name searchable dropdown / Packs / Price)
- Frontend: `/pharmacy/drugs` Drug Catalog page — clickable category cards with drug counts, searchable drug table, Add Drug dialog; added "Drug Catalog" to the pharmacy sidebar
- `POST/GET/PATCH /api/pharmacy/drugs` — drug catalog with supplier link; stock/expiry computed from batches (`drug:create|update`)
- `GET /api/pharmacy/inventory` + `/stats`, `POST /api/pharmacy/inventory/adjustments` — batch-aware inventory with FEFO manual adjustments (`stock:adjust`, reason mandatory)
- `POST/GET /api/pharmacy/procurement/requests` (+ `approve`/`reject`), `POST/GET /api/pharmacy/procurement/orders` (+ `approve`/`reject`/`send`), `POST /api/pharmacy/procurement/receive`, `GET /grns`, `GET /stats` — PR → PO → GRN workflow with auto numbering (`PR-YYYY-###`, `PO-YYYY-###`, `GRN-YYYY-###`)
- Audit logging on every pharmacy mutation (`supplier:*`, `drug:*`, `procurement:*`, `stock:receive`, `stock:adjust`)
- Pharmacy permissions in `permissions.constants.ts`; PHARMACIST role granted `PHARMACY_PERMISSIONS`
- Frontend: `src/lib/api/pharmacy.ts` client; `/pharmacy/procurement` and `/pharmacy/inventory` pages wired to the live API (Add Supplier, Add Drug, PR/PO workflow, Receive Stock, Adjust Stock) with mock-data fallback when the API flag is off
- `GET /api/records/dashboard-stats` — live summary cards for Patient Entry Engine (Total/New/Returning/Walk-In/Emergency/Pending Reg/Awaiting Triage/Awaiting Consult)
- Patient Entry Engine frontend wires those cards to `GET /api/records/dashboard-stats`
- Automatic token refresh on frontend (`POST /api/auth/refresh` on 401 + proactive near-expiry refresh); access token **1h**, refresh token **12h**; hard `Unauthorized` logs the user out
- Records console APIs: reuse `GET /records/dashboard-stats` on `/dashboard/records`; new `GET /records/directory`, `GET /records/directory-stats`, `GET /records/audit`, `GET /records/audit-stats`
- `PATCH /api/patients/:id` — update person after payment / finalize status to Active
- `GET /api/cards/:cardId` — payment cleared check for a specific card
- Early registration flow: create PERSONS + PATIENT_CARDS after Next of Kin (`STATUS=Pending Payment`); cashier payment sets person to `Incomplete`; Complete sets `Active`
- Frontend Patient Entry: create record after step 3, Card Payment step shows pending, Registration Queue table to continue after Accounts pay
- `PATIENT_CARDS` table: registration card per new patient with fees (reg/consult/card), `PAYMENT_STATUS` starting `Pending`
- Registration (`POST /api/patients`) now opens a card automatically and returns it in the response (`card:create` audit)
- RBAC: `permissions.constants.ts` role→permission map (standard front-desk RECORDS role: patient create/read/update, card create/read, triage create/read, audit read, user read), `@RequirePermissions()` decorator + `PermissionsGuard`
- `GET /api/cards` and `GET /api/cards/person/:personId` — card list / workflow payment gate (permission `card:read`)
- `GET /api/cashier/payments/cards` — cashier queue of pending registration-card payments
- `POST /api/cashier/payments/cards/:cardId/confirm` — cashier confirms payment (permission `card:confirm-payment`, writes `card:payment-confirm` audit)
- Triage creation blocked with 409 while the person's latest card payment is `Pending` (server-side workflow gate)
- `GET /api/users` — staff identity search for the Records "hms/identity" flow (permission `user:read`, never exposes credentials)
- `scripts/drop-extra-tables.mjs` (`npm run db:drop-extra[:confirm]`) — drops Postgres tables not in the HMS-BACKEND schema (dry-run by default); executed against Azure DB, removed 124 legacy tables

- Prisma seed: all FNPH Aro staff test accounts (`*@fnpharo.gov.ng`, password `password`) for every role
- CORS config via `FRONTEND_URL` / `CORS_ORIGINS` (still allows any origin when unset)
- Slimmed Prisma schema to active core: PERSONS, USERS, ROLES, REFRESH_TOKENS, AUDITS, TRIAGE
- `TRIAGE` table for post-registration queue + vitals (`PERSON_ID` FK only — no duplicated demographics)
- `AUDITS.AUDIT_TYPE` (+ ENTITY / ENTITY_ID) for frontend filtering
- `POST/GET/PATCH /api/triage` triage endpoints with audit logging
- `GET /api/audit/logs?type=` audit query
- Person registration writes `person:create` audit
- `POST /api/patients` — register person into `PERSONS` (hospital number `FNPH/ARO/YYYY/######`)
- `GET /api/patients` — search persons by hospital no / name / phone / NIN
- `GET /api/patients/:id` — person detail by `PERSON_ID`
- CORS enabled on API for fnph-aro frontend integration
- Multi-file Prisma schema under `apps/api/prisma/models/`
- `prisma.config.ts` for Prisma 7 directory-based schema loading
- Prisma models aligned to legacy Aro HMS table/column names for easier migration
- Domain model files for persons, users, admissions, appointments, bills, items, request forms, claims, and related legacy tables

### Changed

- Render deploy: API binds `0.0.0.0`, build uses 2GB Node heap; added `render.yaml`
- Moved `@nestjs/cli` + `typescript` to `dependencies` so production installs still produce `dist/apps/api/main.js`
- `schema.prisma` is now main entry only (generator + datasource)
- Prisma CLI uses `apps/api/prisma` directory instead of single file path
- Primary keys switched to integer autoincrement (`PERSON_ID`, `USER_ID`, …) to match Oracle IDs
- Updated `docs/DATABASE.md` for legacy table mapping and multi-file schema layout
- Modules organized by hospital function, not dashboard role
- Foundation modules: auth, users, roles, permissions, audit, system-settings
- Patient & scheduling: patients, records, appointments, queues
- Clinical & care: clinical (7 submodules), nursing, admissions, discharge, psychiatry, allied-health, icu
- Diagnostics & pharmacy: laboratory, radiology, pharmacy
- Finance & operations: billing, cashier, finance, insurance, inventory
- Reporting & platform: reports, analytics, notifications, files, realtime
- Governance: super-admin, governance, administration, hr
- `common/` shared layer with 27 role constants (`roles.constants.ts`)
- Split config files: app, database, redis, jwt, storage, queue
- `GET /api/health` health check endpoint
- Prisma moved to `apps/api/prisma/` with role seed script
- `future-modules/README.md` for planned modules (Transportation, Laundry, Kitchen, etc.)
- E2E tests moved to `apps/api/test/`
- Module scaffolding script at `scripts/scaffold-modules.mjs`

### Changed

- Application source relocated from `src/` to `apps/api/src/`
- Prisma schema relocated to `apps/api/prisma/schema.prisma`
- Nest CLI `sourceRoot` updated to `apps/api/src`
- Build output to `dist/apps/api/`
- API global prefix set to `/api`
- Updated docs: PROJECT_CONTEXT, SYSTEM_ARCHITECTURE, MODULES, FEATURES

## [0.0.1] - 2026-07-08

### Added

- NestJS 11 application scaffold (strict TypeScript)
- Core dependencies: Prisma, Redis, RabbitMQ, JWT/Passport, Socket.IO, BullMQ
- `PrismaModule` with global `PrismaService`
- `ConfigModule` with centralized configuration
- Prisma schema: `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `RefreshToken`, `AuditLog`
- `.env.example` with required environment variables
- Global validation pipe and Helmet security headers
- Prisma npm scripts
- Root `README.md` with tech stack and setup instructions
- Project documentation (`docs/` directory)
- Cursor AI rules (`.cursor/rules/`)

[Unreleased]: https://github.com/your-org/HMS-BACKEND/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/your-org/HMS-BACKEND/releases/tag/v0.0.1
