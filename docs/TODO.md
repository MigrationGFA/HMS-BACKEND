# TODO

Active task list for HMS Backend. Update as work progresses.

## Priority: High

- [ ] **AuthModule** — login, refresh, logout, JWT strategy, local strategy
- [ ] **RBAC guards** — `@Roles()`, `@Permissions()` decorators and guards
- [ ] **UsersModule** — user CRUD with role assignment
- [ ] **AuditModule** — interceptor to auto-log sensitive operations
- [ ] **Seed script** — default roles (admin, doctor, nurse, receptionist) and permissions

## Priority: Medium

- [ ] **CacheModule** — Redis cache integration with `@nestjs/cache-manager`
- [ ] **Session middleware** — `express-session` + `connect-redis`
- [ ] **ThrottlerModule** — rate limiting with Redis storage
- [ ] **QueueModule** — RabbitMQ connection, exchange/queue setup
- [ ] **PatientsModule** — patient registration, MRN generation
- [ ] **AppointmentsModule** — booking, scheduling, conflict checks
- [ ] **EventsModule** — Socket.IO gateway with JWT auth
- [ ] **QueuesModule** — walk-in queue with realtime updates

## Priority: Low

- [ ] **ClinicalModule** — full encounters/diagnoses (prescriptions bridge ✅ → nursing-ops)
- [x] **NursingModule (Phase 10–12)** — MAR/orders/samples, ICU/shifts, reports — [NURSING_MODULE.md](./NURSING_MODULE.md)
- [ ] **LabModule** — dedicated lab domain (requests/samples bridge ✅ → nursing-ops)
- [ ] **PharmacyModule** — inventory + full dispensing (MAR dispense bridge ✅)
- [ ] **BillingModule** — invoices, payments
- [ ] **NotificationsModule** — SMS and email RabbitMQ consumers
- [ ] **ReportsModule** — report generation worker
- [ ] **PostgreSQL FTS** — search vectors on patients table
- [ ] **Table partitioning** — audit_logs monthly partitions
- [ ] **Read replica routing** — `PrismaService` read client
- [ ] **2FA** — TOTP-based two-factor authentication
- [ ] **E2E test suite** — auth flow, patient CRUD
- [ ] **Docker Compose** — local dev with PostgreSQL, Redis, RabbitMQ
- [ ] **CI pipeline** — lint, test, build on push

## Completed

- [x] NestJS project scaffold
- [x] Install core dependencies (Prisma, Redis, RabbitMQ, JWT, Socket.IO)
- [x] Prisma schema (auth, RBAC, audit logs)
- [x] PrismaModule and ConfigModule
- [x] Global validation pipe and Helmet
- [x] `.env.example`
- [x] Root README
- [x] Documentation (`docs/` directory)
- [x] Cursor rules (`.cursor/rules/`)
- [x] **Nursing Patient Queues** — `/api/nursing/patient-queues*` + fnph-aro `/dashboard/nurse/queues`
- [x] **Nursing Admissions + care docs (Phases 7–9)** — `/api/admissions*`, nursing notes/vitals/care-plans/incidents/forms/timeline/alerts
- [x] **AdmissionsModule APIs** — wards/beds/admit/transfer/discharge (`/api/admissions*`)
- [x] **Nursing Phase 9 care APIs** — notes, vitals, care-plans, observations, incidents, forms, timeline, alerts

## Notes

- Run `npm run prisma:generate` after cloning to generate the Prisma client.
- Run `npm run prisma:migrate` to apply database migrations.
- Mark items done here and add entries to [CHANGELOG.md](./CHANGELOG.md).
