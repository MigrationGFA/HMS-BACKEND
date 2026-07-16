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

Patients are stored in the **`PERSONS`** table (Prisma model `Persons`). API responses use camelCase person fields (`personId`, `hospitalNo`, `firstName`, `lastName`, …).

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/patients` | Search/list persons (`q`, `page`, `limit`) | `patient:read` |
| POST | `/patients` | Early-register after Next of Kin + open card (payment Pending) | `patient:create` |
| GET | `/patients/:id` | Get person by `PERSON_ID` | `patient:read` |
| PATCH | `/patients/:id` | Update person / finalize (`status: Active`) after payment | `patient:update` |
| GET | `/patients/:id/history` | Visit history | `patient:read` (planned) |

RBAC is enforced via `PermissionsGuard` + `@RequirePermissions()`. The role→permission
map lives in `apps/api/src/common/constants/permissions.constants.ts`. The standard
front-desk **RECORDS** role has: `patient:create/read/update`, `card:create/read`,
`triage:create/read`, `audit:read`, `user:read`.

#### `POST /api/patients` — Register person

**Purpose:** Create a new `PERSONS` row (patient registration from Records / Patient Entry Engine).

**Required permission:** Authenticated staff (JWT). Granular `patient:create` when RBAC guards are enabled.

**Request body (JSON):**

```json
{
  "firstName": "Ada",
  "lastName": "Okonkwo",
  "middleName": "Chioma",
  "sex": "Female",
  "dateOfBirth": "1992-06-15",
  "maritalStatus": "Single",
  "religion": "Christianity",
  "tribe": "Igbo",
  "ethnicGroup": "Igbo",
  "residentialAddress": "12 Broad St, Abeokuta, Ogun, Nigeria",
  "homeTown": "Abeokuta South",
  "stateOfOrigin": "Ogun",
  "nationality": "Nigerian",
  "patientPhoneNo": "08012345678",
  "email": "ada@example.com",
  "occupation": "Teacher",
  "nameOfEmployer": "Ogun State Ministry of Education",
  "nameOfNextOfKin": "Chidi Okonkwo",
  "relationship": "Spouse",
  "addressOfNextOfKin": "12 Broad St, Abeokuta",
  "telephoneOfNextOfKin": "08087654321",
  "identityType": "NIN",
  "identityNo": "12345678901",
  "nhisNo": "NHIS-998877",
  "bloodGroup": "O+",
  "patientType": "Outpatient",
  "regType": "Walk-In Patient",
  "idempotencyKey": "DR-abc123"
}
```

**Response example:**

```json
{
  "data": {
    "personId": 152,
    "hospitalNo": "FNPH/ARO/2026/000152",
    "firstName": "Ada",
    "lastName": "Okonkwo",
    "middleName": "Chioma",
    "sex": "Female",
    "patientPhoneNo": "08012345678",
    "status": "Active",
    "dateOfRegistration": "2026-07-10T11:00:00.000Z"
  }
}
```

**Error cases:**
- `400` — validation failure (missing required fields)
- `401` — missing/invalid JWT
- `403` — missing `patient:create` permission
- `409` — duplicate `identityNo` or same name + phone

The response also contains `card` — the registration card opened for the person
(`{ cardId, cardNo, paymentStatus: "Pending", cardFee, regFee, consultFee, totalAmount }`).
Optional request fields `regFee`, `consultFee`, `cardFee` set the card charges.

---

### Registration Cards (`/cards`)

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/cards` | List cards (`paymentStatus`, `personId`, `q`, `page`, `limit`) | `card:read` |
| GET | `/cards/person/:personId` | Latest card + `paymentCleared` gate for a person | `card:read` |
| GET | `/cards/:cardId` | One card + `paymentCleared` (continue-from-payment check) | `card:read` |

#### `GET /api/cards/:cardId`

**Purpose:** Check whether a specific registration card has been paid so Records can continue.

**Response example:**

```json
{
  "data": {
    "card": {
      "cardId": 7,
      "paymentStatus": "Pending",
      "totalAmount": 7500
    },
    "paymentCleared": false
  }
}
```

**Error cases:** `401`, `403`, `404` card not found.
| GET | `/cards/:cardId` | One card + `paymentCleared` (continue-from-payment check) | `card:read` |

#### `GET /api/cards/person/:personId`

**Purpose:** Records workflow gate — check whether the patient's card payment is cleared.

**Response example:**

```json
{
  "data": {
    "card": {
      "cardId": 7,
      "personId": 152,
      "cardNo": "FNPH/ARO/2026/000152",
      "paymentStatus": "Pending",
      "cardFee": 500,
      "regFee": 2000,
      "consultFee": 5000,
      "totalAmount": 7500,
      "status": "Pending Payment"
    },
    "paymentCleared": false
  }
}
```

**Error cases:** `401`, `403` missing `card:read`.

---

### Patient Entry / Records (`/records`)

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/records/dashboard-stats` | Live summary cards for Patient Entry Engine | `patient:read` |
| POST | `/records/registrations` | Create PERSONS + pending PATIENT_CARDS after Next of Kin | `patient:create` |
| GET | `/records/registrations` | Registration queue (`paymentStatus`, `q`, `page`, `limit`) | `card:read` |
| GET | `/records/registrations/:personId` | Load person + card to continue registration | `patient:read` |
| GET | `/records/cards/:cardId/payment-status` | Check if a card has been paid | `card:read` |
| GET | `/records/persons/:personId/payment-status` | Check latest card payment for a person | `card:read` |
| PATCH | `/records/registrations/:personId/complete` | Complete registration after payment | `patient:update` |

#### `GET /api/records/dashboard-stats`

**Purpose:** Power the 8 live statistic cards on Patient Entry Engine (`/hms/identity`).

**Query:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `timezoneOffsetMinutes` | number | `60` (WAT) | Client offset from UTC for “today” boundary |

**Required permission:** `patient:read`

**Request body:** none

**Response example:**

```json
{
  "data": {
    "asOf": "2026-07-14T13:00:00.000Z",
    "timezoneOffsetMinutes": 60,
    "totalToday": 42,
    "newToday": 12,
    "returningToday": 30,
    "walkInToday": 10,
    "emergencyToday": 2,
    "pendingRegistration": 5,
    "awaitingTriage": 8,
    "awaitingConsultation": 11
  }
}
```

| Field | Source |
|-------|--------|
| `newToday` | `PERSONS` created today |
| `returningToday` | `TRIAGE` arrivals today with patient type Returning |
| `totalToday` | `newToday + returningToday` |
| `walkInToday` | New persons today with Walk-In `REG_TYPE` |
| `emergencyToday` | New persons today with Emergency type |
| `pendingRegistration` | `PATIENT_CARDS` with `PAYMENT_STATUS=Pending` |
| `awaitingTriage` | `TRIAGE` status `Waiting` |
| `awaitingConsultation` | `TRIAGE` status `Triage Completed` or `Sent to Consultation` |

**Error cases:** `401`, `403` missing `patient:read`.

---

### Cashier Card Payments (`/cashier/payments`)

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/cashier/payments/cards` | Pending registration-card payments (`paymentStatus`, `q`) | `card:read` |
| POST | `/cashier/payments/cards/:cardId/confirm` | Confirm card payment | `card:confirm-payment` |

#### `POST /api/cashier/payments/cards/:cardId/confirm`

**Purpose:** Cashier confirms the new-patient card payment; unblocks the Records workflow (triage/consultation).

**Request body:**

```json
{ "paymentChannel": "Cash", "paymentRef": "RCPT-00123" }
```

`paymentChannel` ∈ `Cash | POS Card | Bank Transfer | Online Card | Wallet`.

**Response example:**

```json
{
  "data": {
    "cardId": 7,
    "paymentStatus": "Paid",
    "status": "Active",
    "paymentChannel": "Cash",
    "paidAt": "2026-07-14T11:20:00.000Z",
    "confirmedBy": "cashier@fnpharo.gov.ng"
  }
}
```

**Error cases:** `400` validation, `401`, `403` missing `card:confirm-payment`, `404` card not found, `409` already Paid/Waived. Writes audit `card:payment-confirm`.

---

### Users identity search (`/users`)

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/users` | Search staff users (`q`, `page`, `limit`) — no credentials exposed | `user:read` |

**Response example:** `{ data: { items: [{ userId, userName, email, firstName, lastName, role, isAdmin, locked }], meta } }`

**Error cases:** `401`, `403` missing `user:read`.

---

### Triage (`/triage`)

Triage stores **queue + vitals** and a **`personId`** only. Demographics / NOK are joined from `PERSONS`.

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| POST | `/triage` | Create triage entry (after registration) | JWT |
| GET | `/triage` | List queue (`status`, `clinic`, `priority`, `q`) | JWT |
| GET | `/triage/:id` | Get triage + joined person | JWT |
| PATCH | `/triage/:id` | Update status / priority / vitals | JWT |

#### `POST /api/triage`

**Request body:**

```json
{
  "personId": 152,
  "clinic": "General OPD",
  "status": "Waiting",
  "priority": "Routine",
  "patientType": "New",
  "weightKg": 70,
  "heightCm": 170,
  "bloodPressure": "120/80",
  "temperatureC": 36.8,
  "pulseBpm": 78,
  "respiratoryRate": 16,
  "spo2Pct": 98
}
```

**Response:** `{ data: { triageId, queueNo, personId, person: { hospitalNo, firstName, ... }, ... } }`

**Errors:** `400`, `401`, `404` person not found, `409` card payment still Pending (cashier must confirm first). Writes audit `triage:create`.

---

### Nursing (`/nursing`) — Patient Queues

Nurse-facing facade over **Triage** + latest **PATIENT_CARDS** payment status. See [NURSING_MODULE.md](./NURSING_MODULE.md).

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/nursing/patient-queues` | Daily OPD queue (`status`, `clinic`, `priority`, `q`, `paymentStatus`, `date`, `timezoneOffsetMinutes`) | `triage:read` |
| GET | `/nursing/patient-queues/stats` | Overview counts for SummaryCards | `triage:read` |
| GET | `/nursing/patient-queues/:triageId` | Detail + person + payment | `triage:read` |
| PATCH | `/nursing/patient-queues/:triageId/start` | Status → `In Triage` | `triage:update` |
| PATCH | `/nursing/patient-queues/:triageId/vitals` | Record/update vitals (allowed while payment Pending) | `triage:update` |
| PATCH | `/nursing/patient-queues/:triageId/send-to-doctor` | Status → `Sent to Consultation` | `triage:update` |

**List response item extras:** `paymentStatus`, `cardId`, `cardNo`, `totalAmount`, `paymentCleared`, `hasVitals`, `reasonForVisit`.

**Send-to-doctor errors:** `409` when latest card `PAYMENT_STATUS` is `Pending`.

**Audit:** `nursing:start`, `nursing:vitals`, `nursing:send-to-doctor`.

**Frontend:** `fnph-aro` `/dashboard/nurse/queues` via `src/lib/api/nursing.ts`.

---

### Admissions (`/admissions`)

Inpatient wards, beds, and admissions. Prisma: `WARDS`, `BEDS`, `ADMISSIONS`.

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/admissions/wards` | List wards with bed counts | `admission:read` |
| POST | `/admissions/wards` | Create ward (optional `bedCount`) | `admission:create` |
| GET | `/admissions/beds` | List beds (`wardId`, `status`) | `admission:read` |
| GET | `/admissions` | List admissions (`status`, `wardId`, `q`, `page`, `limit`) | `admission:read` |
| GET | `/admissions/stats` | `active`, `availableBeds`, `dischargeOrdered`, `constantSupervision` | `admission:read` |
| GET | `/admissions/:id` | Admission detail + person | `admission:read` |
| POST | `/admissions` | Admit person to bed (occupies bed) | `admission:create` |
| PATCH | `/admissions/:id/transfer` | `{ bedId }` — free old bed (`CLEANING`), occupy new | `admission:update` |
| PATCH | `/admissions/:id/order-discharge` | `{ reason? }` → `DISCHARGE_ORDERED` | `admission:update` |
| PATCH | `/admissions/:id/complete-discharge` | → `DISCHARGED`, bed `CLEANING` | `admission:update` |

**Audit:** `admission:create`, `admission:transfer`, `admission:order-discharge`, `admission:discharge`.

---

### Nursing (`/nursing`) — Care documentation (Phase 9)

Ward clinical docs on Prisma nursing-care models. Patient-queues routes unchanged.

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/nursing/notes` | Notes (`personId`, `admissionId`) | `nursing-note:read` |
| POST | `/nursing/notes` | Create note | `nursing-note:create` |
| GET | `/nursing/vitals` | Vitals history (`personId`, `admissionId`, `abnormal`) | `nursing-vital:read` |
| POST | `/nursing/vitals` | Record vitals (abnormal flags for BP/temp/SpO₂/pulse/resp/pain) | `nursing-vital:create` |
| GET | `/nursing/care-plans` | Care plans (`personId`, `admissionId`, `status`) | `nursing-care-plan:read` |
| POST | `/nursing/care-plans` | Create care plan | `nursing-care-plan:create` |
| PATCH | `/nursing/care-plans/:id` | Update care plan / status | `nursing-care-plan:update` |
| GET | `/nursing/observations` | Observation charts | `nursing-observation:read` |
| POST | `/nursing/observations` | `{ personId, chart, fields, … }` | `nursing-observation:create` |
| GET | `/nursing/incidents` | Incidents (`status`, `personId`) | `nursing-incident:read` |
| POST | `/nursing/incidents` | Report incident | `nursing-incident:create` |
| PATCH | `/nursing/incidents/:id/review` | Mark `REVIEWED` | `nursing-incident:update` |
| GET | `/nursing/forms/templates` | Active form templates | `nursing-form:read` |
| POST | `/nursing/forms/templates` | Bootstrap template | `nursing-form:create` |
| GET | `/nursing/forms/instances` | Form instances (`personId`) | `nursing-form:read` |
| POST | `/nursing/forms/instances` | Submit form instance | `nursing-form:create` |
| GET | `/nursing/timeline` | Merged recent docs for `personId` | `nursing-note:read` |
| GET | `/nursing/alerts` | Abnormal vitals (48h), open High/Critical incidents, discharge-ordered count | `nursing-vital:read` |

---

### Nursing (`/nursing`) — Ops (Phases 10–12)

Orders, tasks, MAR, samples, shifts, handover, ICU, messaging, reports, analytics. Prisma: `nursing-ops.prisma`. Frontend: `src/lib/api/nursing-ops.ts`.

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET/POST | `/nursing/orders` | List / create lab\|drug\|imaging orders | `nursing-order:read\|create` |
| PATCH | `/nursing/orders/:id/acknowledge` | Ack + create nursing task | `nursing-order:update` |
| GET/POST | `/nursing/tasks` | List / create tasks | `nursing-task:read\|create` |
| PATCH | `/nursing/tasks/:id` | Update status / assignee | `nursing-task:update` |
| GET/POST | `/nursing/mar` | List / create MAR | `nursing-mar:read\|create` |
| POST | `/nursing/mar/external` | External med → MAR | `nursing-mar:create` |
| POST | `/nursing/mar/:id/{administer,refuse,miss,hold,dispense}` | MAR actions | `nursing-mar:update` |
| GET | `/nursing/samples` | Lab orders for collection | `nursing-sample:read` |
| POST | `/nursing/samples/:id/collect` | Collect sample | `nursing-sample:update` |
| GET | `/nursing/shifts`, `/nursing/shifts/current` | Shift list / active | `nursing-shift:read` |
| POST | `/nursing/shifts/start` | Clock in | `nursing-shift:create` |
| PATCH | `/nursing/shifts/:id/end` | Clock out | `nursing-shift:update` |
| GET/POST | `/nursing/handovers` | List / submit handover | `nursing-handover:read\|create` |
| PATCH | `/nursing/handovers/:id/acknowledge` | Ack handover | `nursing-handover:update` |
| GET | `/nursing/icu/board` | ICU admissions board | `nursing-icu:read` |
| GET/POST | `/nursing/icu/notes`, `/nursing/icu/infusions` | ICU notes / infusions | `nursing-icu:read\|create` |
| GET/POST | `/nursing/messages` | Channel messages | `nursing-comms:read\|create` |
| PATCH | `/nursing/messages/:id/read` | Mark read | `nursing-comms:update` |
| GET | `/nursing/reports` | Report snapshots | `nursing-report:read` |
| POST | `/nursing/reports/generate` | Aggregate + store snapshot | `nursing-report:create` |
| GET | `/nursing/analytics/summary` | Ward nursing KPIs | `nursing-analytics:read` |

### Bridge routes (interim — ADR-012)

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET/POST | `/prescriptions` | Drug orders → nursing MAR | `nursing-order:read\|create` |
| GET/POST | `/laboratory/requests` | Lab orders → nursing orders | `nursing-order:read\|create` |
| GET | `/laboratory/samples` | Same as nursing samples | `nursing-sample:read` |
| POST | `/laboratory/samples/:id/collect` | Collect via lab facade | `nursing-sample:update` |
| GET | `/pharmacy/dispensing` | Pending MAR | `nursing-mar:read` |
| POST | `/pharmacy/dispensing/:marId/dispense` | Mark pharmacy dispensed | `nursing-mar:update` |

---

### Audit (`/audit`) — Admin

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/audit/logs` | Query audit logs | JWT |

Query params: `type` (`person:create`, `triage:create`, `triage:update`, …), `personId`, `userId`, `page`, `limit`

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
