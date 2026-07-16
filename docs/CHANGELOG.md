# Changelog

All notable changes to HMS Backend are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Nursing ops (Phases 10–12):** Prisma `nursing-ops` tables; `/api/nursing` orders, tasks, MAR (administer/refuse/miss/hold/dispense), samples, shifts, handovers, ICU board/notes/infusions, messages, reports, analytics; seed demo orders/MAR/task/message; frontend `nursing-ops.ts` dual-path on Orders/Tasks/MAR/Samples/Shifts/Handover/ICU/Comms/Reports/Analytics
- **Clinical / pharmacy / lab bridges (ADR-012):** `POST/GET /api/prescriptions`, `/api/laboratory/requests|samples`, `/api/pharmacy/dispensing` delegate to nursing ops until dedicated domains exist; LAB/PHARMACIST role perms extended
- **Admissions APIs:** `/api/admissions` (list, stats, admit, transfer, order/complete discharge), `/api/admissions/wards`, `/api/admissions/beds`; bed occupy/free (`OCCUPIED` / `CLEANING`); audits `admission:create|transfer|order-discharge|discharge`
- **Nursing care documentation (Phase 9):** `/api/nursing` notes, vitals (abnormal flags), care-plans, observations, incidents, forms, timeline, alerts — Prisma nursing-care models; seed upserts Ward 1C + ICU beds
- Nursing Patient Queues E2E: `/api/nursing/patient-queues*` facade over triage + card payment; audits `nursing:start` / `nursing:vitals` / `nursing:send-to-doctor`; frontend `/dashboard/nurse/queues` + `lib/api/nursing.ts`; shared `SearchableSelect` on nursing pages; tracker [NURSING_MODULE.md](./NURSING_MODULE.md)
- Full nursing module audit in [NURSING_MODULE.md](./NURSING_MODULE.md); **Phases 7–12 marked complete**

### Changed

- Normalized `.cursor/rules/` project rules: `general.mdc` (always apply) and `hms-project.mdc` (API TypeScript globs); removed stray frontend task text from backend rules

### Added (earlier)

- `GET /api/records/dashboard-stats` — live summary cards for Patient Entry Engine (Total/New/Returning/Walk-In/Emergency/Pending Reg/Awaiting Triage/Awaiting Consult)
- Patient Entry Engine frontend wires those cards to `GET /api/records/dashboard-stats`
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
