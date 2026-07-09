# API Reference

## Base URL

| Environment | URL |
|-------------|-----|
| Local | `http://localhost:3000` |
| Production | TBD |

## Conventions

### Authentication

Protected endpoints require:

```
Authorization: Bearer <access_token>
```

### Request Format

- Content-Type: `application/json`
- Request bodies validated via DTOs (`class-validator`)
- Unknown fields rejected (`forbidNonWhitelisted: true`)

### Response Format

#### Success

```json
{
  "data": { },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

For single-resource endpoints, `meta` may be omitted.

#### Error

```json
{
  "statusCode": 400,
  "message": ["email must be an email"],
  "error": "Bad Request"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Validation error |
| 401 | Missing or invalid token |
| 403 | Insufficient permissions |
| 404 | Resource not found |
| 409 | Conflict (duplicate, invalid state) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

### Pagination

List endpoints accept:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `sort` | string | `createdAt` | Sort field |
| `order` | `asc` \| `desc` | `desc` | Sort direction |

### Filtering

Domain-specific query params documented per endpoint (e.g. `?status=active&departmentId=uuid`).

---

## Implemented Endpoints

### Health

#### `GET /`

Returns a hello message from the default scaffold.

**Auth:** None

**Response 200:**

```json
"Hello World!"
```

---

## Planned Endpoints

### Authentication (`/auth`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/auth/login` | Login with email/password | None |
| POST | `/auth/refresh` | Rotate access token | None (refresh token body) |
| POST | `/auth/logout` | Revoke refresh token | Bearer |
| GET | `/auth/me` | Current user profile + roles | Bearer |

#### `POST /auth/login`

**Body:**

```json
{
  "email": "doctor@hospital.com",
  "password": "secret"
}
```

**Response 200:**

```json
{
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 900,
    "user": {
      "id": "uuid",
      "email": "doctor@hospital.com",
      "roles": ["doctor"]
    }
  }
}
```

---

### Users (`/users`) — Admin

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/users` | List users | `user:read` |
| POST | `/users` | Create user | `user:create` |
| GET | `/users/:id` | Get user | `user:read` |
| PATCH | `/users/:id` | Update user | `user:update` |
| DELETE | `/users/:id` | Deactivate user | `user:delete` |

---

### Patients (`/patients`)

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/patients` | Search/list patients | `patient:read` |
| POST | `/patients` | Register patient | `patient:create` |
| GET | `/patients/:id` | Get patient detail | `patient:read` |
| PATCH | `/patients/:id` | Update patient | `patient:update` |
| GET | `/patients/:id/history` | Visit history | `patient:read` |

---

### Appointments (`/appointments`)

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/appointments` | List appointments | `appointment:read` |
| POST | `/appointments` | Book appointment | `appointment:create` |
| GET | `/appointments/:id` | Get appointment | `appointment:read` |
| PATCH | `/appointments/:id` | Update/reschedule | `appointment:update` |
| DELETE | `/appointments/:id` | Cancel appointment | `appointment:delete` |

---

### Queue (`/queues`)

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/queues/:departmentId` | Current queue | `queue:read` |
| POST | `/queues/check-in` | Add patient to queue | `queue:create` |
| PATCH | `/queues/:id/call` | Call next patient | `queue:update` |
| PATCH | `/queues/:id/complete` | Mark visit complete | `queue:update` |

Realtime queue state is also pushed via Socket.IO (see [WORKFLOWS.md](./WORKFLOWS.md)).

---

### Lab (`/lab`)

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/lab/orders` | List lab orders | `lab:read` |
| POST | `/lab/orders` | Create lab order | `lab:create` |
| GET | `/lab/orders/:id` | Get order detail | `lab:read` |
| PATCH | `/lab/orders/:id/results` | Submit results | `lab:update` |

---

### Billing (`/billing`)

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/invoices` | List invoices | `billing:read` |
| POST | `/invoices` | Create invoice | `billing:create` |
| GET | `/invoices/:id` | Get invoice | `billing:read` |
| POST | `/invoices/:id/payments` | Record payment | `billing:create` |

---

### Audit (`/audit`) — Admin

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/audit/logs` | Query audit logs | `audit:read` |

Query params: `userId`, `entity`, `entityId`, `from`, `to`

---

## WebSocket Events (Socket.IO)

Namespace: `/events` (planned)

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join:department` | `{ departmentId }` | Subscribe to department room |
| `join:emergency` | — | Subscribe to emergency channel |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `queue:updated` | `{ departmentId, queue }` | Queue state changed |
| `doctor:status` | `{ doctorId, status }` | Doctor availability changed |
| `notification` | `{ id, title, body }` | User notification |
| `emergency:alert` | `{ message, priority }` | Hospital-wide alert |

Authentication: JWT passed in handshake `auth.token`.

---

## Rate Limits (Planned)

| Endpoint group | Limit |
|----------------|-------|
| `POST /auth/login` | 5 req / minute / IP |
| `POST /auth/refresh` | 10 req / minute / IP |
| General API | 100 req / minute / user |

Implemented via `@nestjs/throttler` with Redis storage.

## Related Documents

- [MODULES.md](./MODULES.md)
- [WORKFLOWS.md](./WORKFLOWS.md)
- [FEATURES.md](./FEATURES.md)
