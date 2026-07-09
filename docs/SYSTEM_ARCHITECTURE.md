# System Architecture

## Overview

HMS is an enterprise **modular monolith** at `apps/api/`. A single NestJS process handles HTTP, WebSocket, and lightweight jobs. Heavier async work goes to RabbitMQ consumers. Modules are organized by hospital function, not user role.

```
                    ┌─────────────────────────────────────────┐
                    │              Client Layer               │
                    │  Web App │ Mobile │ Kiosk │ Integrations│
                    └───────────────┬─────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │ HTTP /api/*         │ WebSocket /events   │
              ▼                     ▼                     │
     ┌────────────────────────────────────────┐           │
     │         apps/api — NestJS App          │           │
     │  ┌──────────────────────────────────┐  │           │
     │  │ 36 feature modules by function   │  │           │
     │  │ patients │ clinical │ billing ... │  │           │
     │  └──────────────────────────────────┘  │           │
     │  ┌────────┐ ┌────────┐ ┌──────────┐   │           │
     │  │ Prisma │ │ Redis  │ │ RabbitMQ │   │           │
     │  └────┬───┘ └───┬────┘ └────┬─────┘   │           │
     └───────┼─────────┼───────────┼─────────┘           │
             ▼         ▼           ▼                     │
     ┌───────────┐ ┌────────┐ ┌──────────┐               │
     │PostgreSQL │ │ Redis  │ │ RabbitMQ │               │
     └─────┬─────┘ └────────┘ └────┬─────┘               │
           ▼                       ▼                     │
     ┌───────────┐           ┌──────────────┐            │
     │Read Replica│ (later)  │   Workers    │            │
     └───────────┘           └──────────────┘            │
```

## Application Structure

```
apps/api/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/           # Shared utilities, role constants
│   ├── config/           # Split environment config
│   ├── prisma/           # Global Prisma module
│   ├── auth/             # Foundation
│   ├── users/ roles/ permissions/ audit/ system-settings/
│   ├── patients/ records/ appointments/ queues/
│   ├── clinical/ nursing/ admissions/ discharge/
│   ├── psychiatry/ allied-health/ icu/
│   ├── laboratory/ radiology/ pharmacy/
│   ├── billing/ cashier/ finance/ insurance/ inventory/
│   ├── reports/ analytics/ notifications/ files/ realtime/
│   ├── super-admin/ governance/ administration/ hr/
│   └── future-modules/   # Planned modules README
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
└── test/
```

## Module Groups

| Group | Modules | Purpose |
|-------|---------|---------|
| **Foundation** | auth, users, roles, permissions, audit, system-settings | Identity, access control, configuration |
| **Patient & scheduling** | patients, records, appointments, queues | Registration, scheduling, triage |
| **Clinical & care** | clinical, nursing, admissions, discharge, psychiatry, allied-health, icu | Care delivery across specialties |
| **Diagnostics & pharmacy** | laboratory, radiology, pharmacy | Tests, imaging, medications |
| **Finance & operations** | billing, cashier, finance, insurance, inventory | Revenue, payments, supplies |
| **Reporting & platform** | reports, analytics, notifications, files, realtime | Cross-cutting services |
| **Governance** | super-admin, governance, administration, hr | Board, CMD, admin, HR |

## Configuration

Split config files loaded by `ConfigModule`:

| File | Namespace | Variables |
|------|-----------|-----------|
| `app.config.ts` | `app` | `PORT`, `NODE_ENV`, `API_PREFIX` |
| `database.config.ts` | `database` | `DATABASE_URL`, `DATABASE_READ_URL` |
| `redis.config.ts` | `redis` | `REDIS_*` |
| `jwt.config.ts` | `jwt` | `JWT_*` |
| `storage.config.ts` | `storage` | `STORAGE_*` |
| `queue.config.ts` | `queue` | `RABBITMQ_URL`, `SESSION_SECRET` |

## Data Flow

### Synchronous Request

```
Client → /api/<module> → Guard → Controller → Service → Prisma → PostgreSQL
```

### Async Side Effect

```
Service → Prisma (commit) → RabbitMQ → Worker (SMS/email/lab/report)
```

### Realtime

```
Service (state change) → RealtimeGateway → Socket.IO → subscribed clients
```

## RBAC Model

27 roles defined in `roles.constants.ts`. Roles are seeded via `apps/api/prisma/seed.ts`. Access is enforced at the guard level — modules do not encode role logic; they encode hospital functions.

```
User ── UserRole ── Role ── RolePermission ── Permission
```

## Infrastructure Usage

| Component | Used By |
|-----------|---------|
| **PostgreSQL** | All modules via PrismaService |
| **Redis** | Cache, sessions, BullMQ, rate limiting (planned) |
| **RabbitMQ** | notifications, laboratory, reports (planned) |
| **Socket.IO** | realtime module — queues, alerts, doctor status |

## Scalability Path

| Stage | Strategy |
|-------|----------|
| Now | Modular monolith, indexed PostgreSQL, 36 scaffolded modules |
| Growth | Table partitioning (audit logs, appointments) |
| Read-heavy | Read replica via `DATABASE_READ_URL` |
| High traffic | Horizontal API scaling; shared Redis + RabbitMQ |
| New functions | Add modules under `apps/api/src/` per hospital function |

## Future Modules

Not yet scaffolded — see `apps/api/src/future-modules/README.md`:

Transportation, Laundry, Kitchen, Maintenance, Facility Management, Security, Mortuary, Procurement, Asset Management.

## Related Documents

- [MODULES.md](./MODULES.md)
- [DATABASE.md](./DATABASE.md)
- [DECISIONS.md](./DECISIONS.md)
