# Architecture Decisions

Record of significant technical decisions. Format inspired by [ADR](https://adr.github.io/).

## ADR-001: NestJS as API Framework

**Status:** Accepted
**Date:** 2026-07-08

**Context:** Need a structured, scalable TypeScript backend for a hospital system with many domain modules.

**Decision:** Use NestJS 11 with strict TypeScript.

**Rationale:**
- Modular architecture maps cleanly to hospital domains (patients, billing, lab, etc.)
- Built-in support for guards, interceptors, pipes, and WebSocket gateways
- Large ecosystem and community
- Dependency injection simplifies testing

**Alternatives considered:** Express (too unstructured at scale), Fastify standalone (less opinionated module system).

---

## ADR-002: Prisma as ORM

**Status:** Accepted
**Date:** 2026-07-08

**Context:** Need type-safe database access with migration management for PostgreSQL.

**Decision:** Use Prisma 7 with `prisma-client-js` generator.

**Rationale:**
- Type-safe queries generated from schema
- Migration workflow integrated with schema changes
- Good PostgreSQL support
- `$queryRaw` available for FTS and partitioning DDL

**Alternatives considered:** TypeORM (heavier decorator model), Drizzle (newer, less NestJS integration examples).

---

## ADR-003: PostgreSQL as Primary Database

**Status:** Accepted
**Date:** 2026-07-08

**Context:** Hospital data requires relational integrity, complex queries, and audit trails.

**Decision:** PostgreSQL 15+ as the sole primary database.

**Rationale:**
- ACID compliance for financial and clinical data
- Native partitioning for high-volume tables
- Built-in full-text search (no separate search engine initially)
- Read replica support for future scaling

**Alternatives considered:** MySQL (weaker partitioning), MongoDB (poor fit for relational clinical data).

---

## ADR-004: Redis for Cache, Sessions, and Rate Limiting

**Status:** Accepted
**Date:** 2026-07-08

**Context:** Need fast in-memory storage for caching, session management, rate limiting, and lightweight job queues.

**Decision:** Single Redis instance for cache (`@nestjs/cache-manager`), sessions (`connect-redis`), rate limiting (`@nest-lab/throttler-storage-redis`), and BullMQ queues.

**Rationale:**
- One infrastructure component covers four use cases
- Mature, well-supported Redis clients (`ioredis`)
- BullMQ is reliable for in-process background jobs

**Trade-off:** Redis becomes a shared dependency — monitor memory and configure persistence for sessions.

---

## ADR-005: RabbitMQ for Durable Async Processing

**Status:** Accepted
**Date:** 2026-07-08

**Context:** SMS, email, lab processing, and report generation must not block API responses and must survive process restarts.

**Decision:** Use RabbitMQ via `@golevelup/nestjs-rabbitmq` for durable async work. Use BullMQ (Redis) only for lightweight, API-scoped jobs.

**Rationale:**
- Message durability and acknowledgments
- Decouples API from worker processes
- Can scale consumers independently
- Industry standard for hospital-grade reliability

**Alternatives considered:** BullMQ only (less durable for critical notifications), AWS SQS (vendor lock-in).

---

## ADR-006: JWT Access + Refresh Token Auth

**Status:** Accepted
**Date:** 2026-07-08

**Context:** API serves multiple clients (web, mobile). Need stateless auth with session revocation capability.

**Decision:**
- Short-lived JWT access tokens (15m default)
- Long-lived refresh tokens stored in `refresh_tokens` table (7d default)
- Passport.js strategies for validation
- bcrypt for password hashing

**Rationale:**
- Stateless API scaling (access token in header)
- Refresh token rotation enables revocation
- Industry-standard pattern

**Future:** 2FA will layer on top without changing the token model.

---

## ADR-007: RBAC over ABAC

**Status:** Accepted
**Date:** 2026-07-08

**Context:** Hospital staff have clearly defined roles with predictable permission sets.

**Decision:** Role-Based Access Control with `Role`, `Permission`, and join tables. Permission format: `resource:action`.

**Rationale:**
- Simpler to manage than attribute-based access control
- Maps directly to hospital org structure
- Easy to audit ("does this role have this permission?")

**Future:** Row-level access (e.g. doctor sees only their patients) implemented in service layer, not permission model.

---

## ADR-008: Socket.IO for Realtime

**Status:** Accepted
**Date:** 2026-07-08

**Context:** Queue displays, doctor status boards, and emergency alerts require sub-second updates.

**Decision:** Socket.IO via `@nestjs/websockets` and `@nestjs/platform-socket.io`.

**Rationale:**
- NestJS gateway pattern integrates cleanly
- Room-based subscriptions (per department, emergency channel)
- Fallback transport for unreliable networks
- JWT authentication in handshake

**Alternatives considered:** Server-Sent Events (one-directional only), raw WebSockets (no fallback).

---

## ADR-009: PostgreSQL Full-Text Search (Initial)

**Status:** Accepted
**Date:** 2026-07-08

**Context:** Need patient and record search without adding infrastructure complexity early on.

**Decision:** Use PostgreSQL `tsvector` / `tsquery` with GIN indexes. Migrate to Elasticsearch only if search requirements outgrow FTS.

**Rationale:**
- Zero additional infrastructure
- Adequate for name/MRN/phone search at hospital scale
- Prisma `$queryRaw` supports FTS queries

---

## ADR-010: Modular Monolith over Microservices

**Status:** Accepted
**Date:** 2026-07-08

**Context:** Early-stage project with a small team. Hospital domains are coupled (appointment → consultation → billing).

**Decision:** Single NestJS application (modular monolith) with async workers via RabbitMQ.

**Rationale:**
- Simpler deployment and debugging
- Modules provide boundaries for future extraction
- RabbitMQ already decouples heavy async work
- Split into microservices only when team size and traffic justify it

---

## Template for New Decisions

```markdown
## ADR-NNN: Title

**Status:** Proposed | Accepted | Deprecated | Superseded
**Date:** YYYY-MM-DD

**Context:** What is the issue?

**Decision:** What is the change?

**Rationale:** Why this choice?

**Alternatives considered:** What else was evaluated?

**Consequences:** What are the trade-offs?
```
