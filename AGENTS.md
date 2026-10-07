# AGENTS.md — HMS-BACKEND

Instructions for AI agents working in this repository. **Follow these; do not invent parallel conventions.** Fine-grained rules also live in `.cursor/rules/` (`general.mdc`, `hms-project.mdc`).

Sibling frontend: `fnph-aro` (separate git repo). Prefer coordinating API + FE changes when a feature spans both.

---

## 1. Stack & layout

| Layer | Location |
|-------|----------|
| NestJS API | `apps/api/src/` |
| Prisma schema | `apps/api/prisma/` (multi-file under `models/`) |
| Migrations | `apps/api/prisma/migrations/` |
| Seeds | `apps/api/prisma/seed.ts` |
| Scripts | `scripts/*.mjs` |
| Docs | `docs/` |
| Unit tests | colocated `*.spec.ts` next to services |
| E2E | `apps/api/test/` |

Global API prefix: `/api`.

---

## 2. Naming

| Kind | Convention | Example |
|------|------------|---------|
| Nest modules / folders | kebab or domain folder matching feature | `appointments/`, `patient-portal/` |
| Controllers / services | PascalCase class, `*.controller.ts` / `*.service.ts` | `AppointmentsService` |
| DTOs | `CreateXDto`, `UpdateXDto`, `*QueryDto` in `dto/` | `CreatePublicBookingDto` |
| Permissions | `resource:action` | `hr:leave:approve` |
| Prisma models | PascalCase in schema; DB tables `SCREAMING_SNAKE` via `@@map` | `HrEmployees` → `HR_EMPLOYEES` |
| Columns | SCREAMING_SNAKE in DB (`@map` as needed) | `PERSON_ID`, `CREATED_DATE` |
| Migrations | timestamp folder names only; **never edit applied migrations** | `20260923120000_phase1_…` |
| Audit types | `domain:action` strings | `appointment:public-book` |
| Env vars | SCREAMING_SNAKE | `RESEND_API_KEY`, `EMAIL_FROM` |

---

## 3. Code patterns

### Module shape

```
apps/api/src/<domain>/
├── <domain>.module.ts
├── <domain>.controller.ts      # or split *BookingsController
├── <domain>.service.ts
├── dto/
│   └── *.dto.ts
└── <domain>.service.spec.ts    # when non-trivial
```

- One domain per module; register in `AppModule`.
- Inject via constructor; business logic in services; guards on controllers.
- DTOs + `class-validator` for all bodies/queries.
- Return shape: `{ data: … }` and lists with `meta: { page, limit, total }`.
- Prefer Nest exceptions: `NotFoundException`, `ConflictException`, `ForbiddenException`, `BadRequestException`.
- Multi-table writes: `prisma.$transaction()`.
- Sensitive mutations: call `AuditService`.
- Do not block HTTP on email/SMS — use `EmailService` (Resend) / queues as designed; empty `SmsService` until a provider is chosen.

### TypeScript

- Strict mode; prefer `interface` for objects; avoid `any`.
- Explicit return types on public service methods.

### Docs when shipping

Update relevant `docs/` files (`CHANGELOG.md`, `FEATURES.md`, `API_REFERENCE.md`, `DECISIONS.md`, trackers). Keep `.cursor/rules/` in sync if conventions change.

---

## 4. Markdown trackers & phases (mandatory)

When working from a plan or known-issues doc that uses **Fixes** (`FX-*`) and **Phases** (`A`, `B`, …) — e.g. `docs/PROD_KNOWN_ISSUES.md`, `docs/HR_SELF_SERVICE_PLAN.md`, `docs/HEIP_DAILY_REPORTS_PLAN.md`, `docs/NON_CLINICAL_MODULES_AUDIT_AND_PLAN.md`, `docs/LEGACY_CSV_*.md`:

1. **Read the tracker first.** Implement only the current open phase / listed fixes.
2. **Do not skip ahead.** Next phase stays locked until the current phase exit criteria are met.
3. **Mark checkboxes in the `.md` file for real** when a fix or phase item is done:
   - Change `- [ ]` → `- [x]`
   - In status tables, set `⬜` → `✅` (or fill the Status column) for completed phases/fixes
4. **Mark before continuing.** Update the markdown **in the same work session** before starting the next FX / next phase. Do not leave checkboxes unchecked “for later” after the code is done.
5. **Phase complete line.** When all phase bullets are `[x]`, tick `**Phase X complete**` and update the master status table.
6. **Document history.** Append a row to the doc’s history / changelog section when a phase completes.
7. **Out of scope stays out.** Do not start deferred plans (e.g. full My HR / HEIP) during a prod cutover unless the user explicitly reprioritizes.

If the user says “implement now” against a tracker, treat checkbox updates as part of the Definition of Done for each item.

---

## 5. Security & secrets

- Never commit `.env` or secrets; use `.env.example` placeholders only.
- Do not print API keys, tokens, or full emails in logs/chat — mask them.
- Passwords: bcrypt cost 12.

---

## 6. Testing & quality

- Unit-test services with mocked Prisma/deps for critical paths.
- Keep CI green: `npm test`, lint before commit when asked to commit.
- Prefer extending existing specs when fixing regressions (e.g. appointments public book mocks).
- **Before calling work done / before commit (when asked):** run typecheck and build, and fix all errors:
  - `npm run typecheck` (`tsc -p apps/api/tsconfig.app.json --noEmit`)
  - `npm run build`
  - Sibling frontend (`fnph-aro`): `npm run typecheck` and `npm run build` when FE changed in the same session.

---

## 7. Git

- Commit only when the user asks.
- No force-push to main, no secret files, no amending others’ commits.
- Prefer clear, why-focused commit messages.

---

## 8. Prod cutover order (when using PROD_KNOWN_ISSUES)

1. §8 Fixes FX-1… as gated  
2. §9 Phase A → B → C → D → E  
3. Mark each FX/phase in that file as you finish  

Do not invent a parallel todo list that drifts from the markdown tracker.
