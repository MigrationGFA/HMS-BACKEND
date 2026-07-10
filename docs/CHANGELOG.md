# Changelog

All notable changes to HMS Backend are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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
