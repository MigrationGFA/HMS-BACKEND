# HMS Backend

Hospital Management System (HMS) backend API built with **NestJS** and **TypeScript**.

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | NestJS + TypeScript | Modular API, dependency injection, guards, interceptors |
| ORM | Prisma | Type-safe database access, migrations, schema management |
| Database | PostgreSQL | Primary data store with indexing, partitioning, and full-text search |
| Cache & Sessions | Redis | Caching, sessions, job queues, rate limiting |
| Message Queue | RabbitMQ | Async processing for SMS, email, lab work, reports, and background jobs |
| Auth | Passport.js + JWT + bcrypt | Access/refresh tokens, password hashing, RBAC |
| Realtime | Socket.IO | Live queues, doctor status, notifications, emergency updates |
| Search | PostgreSQL Full-Text Search | Initial search implementation (no external search engine yet) |

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Clients   │────▶│  NestJS API  │────▶│   PostgreSQL    │
│ (Web/Mobile)│     │              │     │  (primary DB)   │
└─────────────┘     │  ┌────────┐  │     └─────────────────┘
       │            │  │ Prisma │  │              │
       │            │  └────────┘  │     ┌────────▼────────┐
       │            │              │     │  Read Replica   │  (later)
       ▼            │  ┌────────┐  │     └─────────────────┘
┌─────────────┐     │  │ Redis  │  │
│  Socket.IO  │◀───▶│  └────────┘  │     ┌─────────────────┐
│  (realtime) │     │              │────▶│    RabbitMQ     │
└─────────────┘     │  ┌────────┐  │     │ (async workers) │
                    │  │Passport│  │     └─────────────────┘
                    │  └────────┘  │
                    └──────────────┘
```

## Installed Packages

### Core

- `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` — NestJS framework
- `@nestjs/config` — environment-based configuration
- `class-validator`, `class-transformer` — request validation and DTO transformation
- `helmet` — HTTP security headers

### Database (PostgreSQL + Prisma)

- `prisma` (dev) — CLI for migrations and schema management
- `@prisma/client` — generated type-safe database client

**Design notes:**

- **Partitioning** — large tables (e.g. audit logs, appointments) can be partitioned by date in PostgreSQL as data grows.
- **Read replicas** — `DATABASE_READ_URL` is reserved in config for routing read-heavy queries to replicas later.
- **Indexing** — Prisma schema includes indexes on foreign keys, audit log lookups, and timestamps. Add composite indexes as query patterns emerge.
- **Full-text search** — PostgreSQL `tsvector` / `tsquery` can be added via raw SQL migrations or Prisma `$queryRaw` until a dedicated search service is needed.

### Cache & Sessions (Redis)

- `ioredis` — Redis client
- `@nestjs/cache-manager`, `cache-manager`, `cache-manager-redis-yet` — response and data caching
- `@nestjs/bullmq`, `bullmq` — Redis-backed job queues inside the API
- `connect-redis`, `express-session` — server-side session storage
- `@nestjs/throttler`, `@nest-lab/throttler-storage-redis` — distributed rate limiting

**Redis is used for:**

| Use case | Library |
|----------|---------|
| Caching | `@nestjs/cache-manager` |
| Sessions | `connect-redis` + `express-session` |
| Queues | `@nestjs/bullmq` / `bullmq` |
| Rate limiting | `@nestjs/throttler` + Redis storage |

### Queue System (RabbitMQ)

- `@golevelup/nestjs-rabbitmq` — NestJS integration for RabbitMQ
- `amqplib` — AMQP protocol client

**RabbitMQ is used for:**

- SMS sending
- Email notifications
- Lab result processing
- Report generation
- General background jobs

Use RabbitMQ for durable, cross-service async work. Use BullMQ (Redis) for lighter, in-process background tasks tied to the API.

### Authentication & Security

- `@nestjs/jwt` — JWT access and refresh token issuance
- `@nestjs/passport`, `passport`, `passport-jwt`, `passport-local` — authentication strategies
- `bcrypt` — password hashing

**Capabilities:**

| Feature | Status |
|---------|--------|
| JWT access tokens | Installed — implement in `AuthModule` |
| Refresh tokens | Schema ready (`RefreshToken` model) |
| RBAC | Schema ready (`Role`, `Permission`, join tables) |
| Audit logs | Schema ready (`AuditLog` model) |
| 2FA | Planned for later |

### Realtime (Socket.IO)

- `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`

**Used for:**

- Live patient queues
- Doctor availability / status
- In-app notifications
- Emergency broadcast updates

## Project Structure

```
apps/api/
├── src/
│   ├── common/            # Shared constants, guards, decorators
│   ├── config/            # Split environment config
│   ├── prisma/            # Prisma module (global)
│   ├── auth/ users/ ...   # 36 hospital-function modules
│   └── future-modules/    # Planned modules README
├── prisma/
│   ├── schema.prisma      # Main entry
│   ├── models/            # Domain model files
│   ├── seed.ts
│   └── migrations/
└── test/
```

See [docs/MODULES.md](docs/MODULES.md) for the full module map.

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- RabbitMQ 3.12+

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp apps/api/.env.example .env

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Seed system roles
npm run prisma:seed

# Start development server
npm run start:dev
```

The API listens on `http://localhost:3030/api` by default (`PORT` overrides this).

### Deploy on Render

In the Render dashboard (or via `render.yaml`):

| Setting | Value |
|---------|--------|
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run start:prod` |
| **Node** | 20 |

Do **not** put `npm run build` in the Start Command — that only compiles and never opens a port. Render sets `PORT`; the app already reads it and binds `0.0.0.0`.

Set at least: `DATABASE_HOST` / `DATABASE_USER` / `DATABASE_PASSWORD` (or `DATABASE_URL_PRISMA`), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET`, `NODE_ENV=production`.

### Useful Scripts

| Script | Description |
|--------|-------------|
| `npm run start:dev` | Start with hot reload |
| `npm run build` | Compile TypeScript |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Create and apply migrations |
| `npm run prisma:studio` | Open Prisma Studio GUI |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |

## Environment Variables

See [`.env.example`](.env.example) for all required variables:

- `DATABASE_URL` — PostgreSQL connection string
- `DATABASE_READ_URL` — optional read replica (future)
- `REDIS_*` — Redis connection settings
- `RABBITMQ_URL` — RabbitMQ connection string
- `JWT_*` — access and refresh token secrets and expiry
- `SESSION_SECRET` — express session signing key

## Roadmap

- [ ] `AuthModule` — login, refresh, logout, RBAC guards
- [ ] `CacheModule` — Redis cache integration
- [ ] `QueueModule` — RabbitMQ producers and consumers
- [ ] `EventsModule` — Socket.IO gateways
- [ ] PostgreSQL table partitioning for high-volume tables
- [ ] Read replica routing in `PrismaService`
- [ ] PostgreSQL full-text search indexes
- [ ] Two-factor authentication (2FA)

## License

UNLICENSED — private project.
