# HMS Backend Documentation

Central documentation for the Hospital Management System (HMS) backend API.

## Quick Links

| Document | Description |
|----------|-------------|
| [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) | Project goals, scope, users, and constraints |
| [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) | High-level architecture, infrastructure, and data flow |
| [FEATURES.md](./FEATURES.md) | Feature inventory — implemented, in progress, and planned |
| [DATABASE.md](./DATABASE.md) | Schema, indexing, partitioning, migrations, and search |
| [API_REFERENCE.md](./API_REFERENCE.md) | REST API endpoints, auth, and response conventions |
| [MODULES.md](./MODULES.md) | NestJS module layout and responsibilities |
| [WORKFLOWS.md](./WORKFLOWS.md) | Core hospital business workflows |
| [CHANGELOG.md](./CHANGELOG.md) | Version history and notable changes |
| [DECISIONS.md](./DECISIONS.md) | Architecture and technology decisions (ADR log) |
| [TODO.md](./TODO.md) | Active tasks and backlog |

## Project Status

**Phase:** Foundation / module scaffolding complete

The NestJS application lives at `apps/api/` with 36 hospital-function modules scaffolded (empty controllers and services). Database schema covers authentication, RBAC, refresh tokens, and audit logs. Business logic is not yet implemented.

## For Developers

1. Start with [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) to understand what we are building.
2. Read [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) for infrastructure and integration patterns.
3. Use [MODULES.md](./MODULES.md) and [DATABASE.md](./DATABASE.md) when adding new features.
4. Update [CHANGELOG.md](./CHANGELOG.md) and [DECISIONS.md](./DECISIONS.md) when shipping meaningful changes.

## For AI Assistants (Cursor)

Project-specific rules live in `.cursor/rules/`:

- `general.mdc` — coding standards and general conventions
- `hms-project.mdc` — HMS domain context and module patterns

Read `PROJECT_CONTEXT.md` and `SYSTEM_ARCHITECTURE.md` before making architectural changes.

Best backend starting order

Start backend in this order:

1. Config module
2. Prisma module
3. Auth module
4. Users module
5. Roles module
6. Permissions module
7. Audit module
8. System Settings module
9. Patients module
10. Records module
11. Appointments module
12. Billing module
13. Cashier module
14. Clinical module
15. Laboratory module
16. Pharmacy module
17. Admissions module