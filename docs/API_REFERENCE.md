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
| POST | `/auth/logout` | Revoke refresh token (body only; access JWT optional) | None |
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
    "refreshToken": "base64url...",
    "expiresIn": 3600,
    "user": {
      "id": 1,
      "email": "doctor@hospital.com",
      "roles": ["RECORDS"]
    }
  }
}
```

`expiresIn` is access-token lifetime in seconds (default **1 hour** = `3600`). Refresh tokens last **12 hours**.

#### `POST /auth/refresh`

**Purpose:** Rotate access + refresh tokens when the access JWT expires. Called automatically by the frontend API client on `401`.

**Body:**

```json
{ "refreshToken": "base64url..." }
```

**Response 200:** same shape as login (`accessToken`, `refreshToken`, `expiresIn`, `user`).

**Error cases:** `401` invalid/expired/revoked refresh token.

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
| GET | `/records/dashboard-stats` | Live summary cards for Patient Entry Engine **and** Records dashboard (`/dashboard/records`) — same metrics | `patient:read` |
| GET | `/records/directory-stats` | Patient Directory summary cards | `patient:read` |
| GET | `/records/directory` | Patient Directory list (`q`, `sex`, `insurance`, `page`, `limit`) | `patient:read` |
| GET | `/records/audit-stats` | Records Audit Trail summary cards | `audit:read` |
| GET | `/records/audit` | Records Audit Trail list (`q`, `type`, `status`, `page`, `limit`) | `audit:read` |
| GET | `/records/arrivals` | Patient Arrival / Check-In list | `patient:read` |
| POST | `/records/arrivals/route` | Route arrival to triage/consult/emergency/checkout | `triage:create` or `triage:update` |
| POST | `/records/registrations` | Create PERSONS + pending PATIENT_CARDS after Next of Kin | `patient:create` |
| GET | `/records/registrations` | Registration queue (`paymentStatus`, `q`, `page`, `limit`) | `card:read` |
| GET | `/records/registrations/:personId` | Load person + card to continue registration | `patient:read` |
| GET | `/records/cards/:cardId/payment-status` | Check if a card has been paid | `card:read` |
| GET | `/records/persons/:personId/payment-status` | Check latest card payment for a person | `card:read` |
| PATCH | `/records/registrations/:personId/complete` | Complete registration after payment | `patient:update` |

#### `GET /api/records/dashboard-stats`

**Purpose:** Power the 8 live statistic cards on Patient Entry Engine (`/hms/identity`) and Records Officer Overview (`/dashboard/records`). Same endpoint — cards are equivalent.

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

#### `GET /api/records/directory-stats`

**Purpose:** Summary cards on Patient Directory (`/records/directory`).

**Required permission:** `patient:read`

**Response example:**

```json
{
  "data": {
    "totalPatients": 4128,
    "newThisMonth": 612,
    "active": 3800,
    "inpatients": 120,
    "outpatients": 3600,
    "hmoNhia": 900,
    "incompleteProfiles": 45,
    "duplicatesFlagged": 2
  }
}
```

#### `GET /api/records/directory`

**Purpose:** Searchable Patient Directory list.

**Query:** `q`, `sex` (`Male`|`Female`), `insurance` (`NHIS`|`HMO`|`Private`), `page`, `limit`

**Required permission:** `patient:read`

#### `GET /api/records/audit-stats`

**Purpose:** Summary cards on Records Audit Trail (`/records/audit`).

**Required permission:** `audit:read`

**Response example:**

```json
{
  "data": {
    "activitiesToday": 48,
    "created": 12,
    "edited": 9,
    "uploaded": 3,
    "printed": 0,
    "deleted": 1,
    "suspicious": 2
  }
}
```

#### `GET /api/records/audit`

**Purpose:** Audit trail table for Records console (from `AUDITS`).

**Query:** `q`, `type` (e.g. `person:create`), `status`, `page`, `limit`

**Required permission:** `audit:read`

#### `GET /api/records/arrivals`

**Purpose:** Patient Arrival / Check-In list for `/records/arrivals` — today's triage visits plus paid registrations not yet checked into triage.

**Method:** `GET`

**URL:** `/api/records/arrivals?q=&type=&routing=&page=&limit=&timezoneOffsetMinutes=`

**Required permission:** `patient:read`

**Request body:** none

**Query:**
- `q` — search arrival no, hospital no, or name
- `type` — `Walk-In` | `Appointment` | `Referral` | `Emergency`
- `routing` — e.g. `Awaiting Triage`, `Checked Out` (also accepts `checkedout`)
- `page`, `limit` — pagination (default limit 50, max 200)
- `timezoneOffsetMinutes` — local day bounds

**Response example:**

```json
{
  "data": {
    "asOf": "2026-07-17T14:00:00.000Z",
    "summary": {
      "total": 12,
      "walkIn": 5,
      "appointment": 4,
      "referral": 1,
      "emergency": 1,
      "awaitingTriage": 3,
      "awaitingConsultation": 2,
      "checkedOut": 1
    },
    "items": [
      {
        "triageId": 41,
        "personId": 132,
        "arrivalNo": "Q-014",
        "hospitalId": "FNPH ARO/2026/00132",
        "name": "Adaeze Nwosu",
        "type": "Appointment",
        "clinic": "General OPD",
        "arrival": "08:32",
        "arrivalAt": "2026-07-17T07:32:00.000Z",
        "visit": "Follow-up",
        "routing": "Awaiting Triage",
        "payment": "Paid",
        "lastVisit": null,
        "status": "Waiting"
      }
    ],
    "meta": { "page": 1, "limit": 50, "total": 12 }
  }
}
```

**Error cases:** `401` unauthenticated, `403` missing `patient:read`

#### `POST /api/records/arrivals/route`

**Purpose:** Route an arrival to triage, consultation, emergency, or check out (creates/updates `TRIAGE`; audit `arrival:*`).

**Method:** `POST`

**URL:** `/api/records/arrivals/route`

**Required permission:** `triage:create` **or** `triage:update`

**Request body:**

```json
{
  "personId": 132,
  "triageId": 41,
  "action": "triage",
  "clinic": "General OPD"
}
```

`action` ∈ `triage` | `consult` | `emergency` | `checkout`. `triageId` optional when creating a new check-in.

**Response example:** same shape as an arrivals list item (updated routing/status).

**Error cases:**
- `400` invalid action, or checkout without an active check-in
- `401` / `403`
- `404` person or triage not found
- `409` payment pending (triage create blocked)

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

Lab still bridges to nursing-ops until a dedicated laboratory domain lands. Prescriptions and pharmacy dispense are real modules (see below).

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET/POST | `/laboratory/requests` | Lab orders → nursing orders | `nursing-order:read\|create` |
| GET | `/laboratory/samples` | Same as nursing samples | `nursing-sample:read` |
| POST | `/laboratory/samples/:id/collect` | Collect via lab facade | `nursing-sample:update` |


### Pharmacy Suppliers (`/pharmacy/suppliers`)

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| POST | `/pharmacy/suppliers` | Register a supplier | `supplier:create` |
| GET | `/pharmacy/suppliers` | Supplier management list (`q`, `status`, `page`, `limit`) | `pharmacy:read` |
| GET | `/pharmacy/suppliers/:id` | Supplier detail | `pharmacy:read` |
| PATCH | `/pharmacy/suppliers/:id` | Update supplier / set status | `supplier:update` |

#### `POST /api/pharmacy/suppliers`

Drugs a supplier supplies are referenced by **drug ID** (from the drug catalog), never by name — stored in the `SUPPLIER_DRUGS` join table. Drug creation (inventory page) and supplier creation are separate flows.

**Request body:**

```json
{
  "name": "Emzor Pharmaceuticals",
  "contactPerson": "Ada Obi",
  "phone": "08030000000",
  "email": "sales@emzor.com",
  "address": "Lagos",
  "drugIds": [1, 4, 7],
  "performance": 90
}
```

**Response 201:** `{ data: { supplierId, name, contactPerson, phone, email, address, drugIds: [1, 4, 7], drugs: [{ drugId: 1, name: "Paracetamol 500mg" }], performance, status: "Active", createdAt } }`

**Errors:** `400` validation / unknown drug id, `401`, `403` missing `supplier:create`, `409` duplicate supplier name. Writes audit `supplier:create`.

`PATCH /api/pharmacy/suppliers/:id` accepts the same fields; sending `drugIds` **replaces** the supplier's full set of supplied drugs.

---

### Clinical Documentation (`/clinical-notes`)

Structured doctor clinical notes for `/dashboard/doctor/clinical/documentation`. Patient search uses existing `GET /api/patients?q=`. Soft-void only — signed notes are immutable (use addendum later).

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| GET | `/clinical-notes/templates` | Note templates + required fields | `clinical-note:read` |
| GET | `/clinical-notes/summary` | KPI counts (drafts, reviews, signed this month) | `clinical-note:read` |
| GET | `/clinical-notes` | List notes (`q`, `status`, `noteType`, `personId`, `mine`, `page`, `limit`) | `clinical-note:read` |
| POST | `/clinical-notes` | Create draft note | `clinical-note:create` |
| GET | `/clinical-notes/:id` | Note detail + fields + patient | `clinical-note:read` |
| GET | `/clinical-notes/:id/versions` | Immutable version history | `clinical-note:read` |
| PATCH | `/clinical-notes/:id` | Autosave draft (`version`, `idempotencyKey`, `fields`) | `clinical-note:update` |
| POST | `/clinical-notes/:id/submit` | Submit for consultant review | `clinical-note:update` |
| POST | `/clinical-notes/:id/sign` | Review and Sign (locks note) | `clinical-note:sign` |
| POST | `/clinical-notes/:id/approve` | Consultant approve (+ sign) | `clinical-note:review` |
| POST | `/clinical-notes/:id/return` | Return for correction (`{ reason }`) | `clinical-note:review` |
| POST | `/clinical-notes/:id/void` | Soft-void draft | `clinical-note:update` |

#### `POST /api/clinical-notes`

**Purpose:** Create a draft clinical documentation note for a registered patient.

**Required permission:** `clinical-note:create`

**Request body:**
```json
{
  "personId": 42,
  "noteType": "SOAP Note",
  "clinic": "OPC",
  "priority": "Routine",
  "fields": { "Subjective": "", "Objective": "", "Assessment": "", "Plan": "" }
}
```

**Response example:** `{ data: { clinicalNoteId, noteNo: "CN-2026-0001", status: "Draft", version: 1, fields, patient } }`

**Errors:** `400` validation, `401`, `403`, `404` person not found.

#### `PATCH /api/clinical-notes/:id`

**Purpose:** Autosave draft fields with optimistic locking.

**Required permission:** `clinical-note:update`

**Request body:** `{ version?, idempotencyKey?, fields?, noteType?, clinic?, priority?, changeSummary? }`

**Response example:** `{ data: { clinicalNoteId, version: 2, status: "In Progress", fields } }`

**Errors:** `400` not editable / signed, `401`, `403`, `404`, `409` version conflict.

#### `POST /api/clinical-notes/:id/sign`

**Purpose:** Explicit Review and Sign — locks the note (does not auto-sign on save).

**Required permission:** `clinical-note:sign`

**Request body:** `{ attestation? }`

**Response example:** `{ data: { status: "Signed", signedBy, signedAt } }`

**Errors:** `400` already signed/voided, `401`, `403`, `404`.

Patient search for this page: `GET /api/patients?q=&page=&limit=` (`patient:read`) — search by name, hospital no, phone, NHIA, NIN.

---

### Doctor Encounters (`/encounters`)

Payment-gated consultation queue for `/dashboard/doctor/clinical/workspace`. Queue source is today's `TRIAGE` with status `Triage Completed` or `Sent to Consultation`.

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| GET | `/encounters/consultation-queue` | Waiting queue (`q`, `clinic`, `priority`, `page`, `limit`, `timezoneOffsetMinutes`) | `encounter:read` |
| GET | `/encounters/active` | Logged-in doctor's in-progress encounters | `encounter:read` |
| GET | `/encounters/completed` | Logged-in doctor's consultations completed today | `encounter:read` |
| GET | `/encounters/follow-ups` | Follow-up list for workspace (`q`, `clinic`, `status`, `from`, `to`, `mine`) | `encounter:read` |
| POST | `/encounters/follow-ups` | Schedule a follow-up appointment | `encounter:complete` |
| PATCH | `/encounters/follow-ups/:id` | Update follow-up (status Attended/Cancelled, reschedule) | `encounter:update` |
| GET | `/encounters/patients/:personId/clinical-summary` | Aggregated demographics, vitals, allergies, meds, past notes (`triageId?`) | `encounter:read` |
| GET | `/encounters/patients/:personId/notes` | Paginated encounter notes timeline | `encounter:read` |
| POST | `/encounters/start` | Start consult from triage (`{ triageId, clinic? }`) | `encounter:create` |
| GET | `/encounters/:id` | Encounter detail + person + triage vitals | `encounter:read` |
| PATCH | `/encounters/:id` | Draft note autosave (`version`, `idempotencyKey`, full note fields) | `encounter:update` |
| POST | `/encounters/:id/complete` | Complete consultation (`{ outcome?, followUpDate?, … }`) | `encounter:complete` |

#### `GET /api/encounters/consultation-queue`

**Purpose:** Doctor waiting list after Records routes patients to consultation.

**Required permission:** `encounter:read`

**Request body:** none

**Response example:**

```json
{
  "data": {
    "asOf": "2026-07-17T15:00:00.000Z",
    "summary": { "waiting": 4, "paymentBlocked": 1, "canStart": 3 },
    "items": [
      {
        "triageId": 41,
        "personId": 132,
        "queueNo": "Q-014",
        "name": "Adaeze Nwosu",
        "mrn": "FNPH ARO/2026/00132",
        "age": 34,
        "sex": "F",
        "clinic": "OPC",
        "visit": "New",
        "arrival": "08:32",
        "waitMinutes": 18,
        "wait": "18 mins",
        "priority": "Routine",
        "paymentStatus": "Paid",
        "paymentCleared": true,
        "vitalsStatus": "Captured",
        "vitals": {
          "status": "Captured",
          "bloodPressure": "128/82",
          "temperatureC": 36.8,
          "pulseBpm": 88,
          "respiratoryRate": 18,
          "spo2Pct": 98,
          "weightKg": 72,
          "heightCm": 168,
          "bmi": 25.5,
          "notes": null
        },
        "lastVisit": "2026-07-01",
        "canStart": true,
        "triageStatus": "Sent to Consultation"
      }
    ],
    "meta": { "page": 1, "limit": 50, "total": 4 }
  }
}
```

**Error cases:** `401`, `403`

#### `GET /api/encounters/patients/:personId/clinical-summary`

**Purpose:** Patient clinical context for queue eye-view and active consultation panels (demographics, payment, current visit vitals, allergies, active meds, previous diagnoses, history snippets, recent doctor notes). Empty sections return empty arrays/nulls — never mock data.

**Required permission:** `encounter:read`

**Query:** `triageId` (optional — scopes current visit/vitals)

**Request body:** none

**Response example:**

```json
{
  "data": {
    "personId": 132,
    "demographics": {
      "name": "Adaeze Nwosu",
      "mrn": "FNPH ARO/2026/00132",
      "age": 34,
      "sex": "F",
      "bloodGroup": "O+",
      "phone": "0803…",
      "nextOfKin": { "name": "…", "relationship": "Spouse", "phone": "…" }
    },
    "payment": { "status": "Paid", "display": "Paid", "cleared": true, "cardNo": "CARD-…" },
    "currentVisit": { "triageId": 41, "queueNo": "Q-014", "clinic": "OPC", "priority": "Routine" },
    "vitals": { "status": "Captured", "bloodPressure": "128/82", "pulseBpm": 88 },
    "allergies": [],
    "activeMeds": [],
    "previousDiagnoses": [],
    "historySnippets": {
      "pastMedicalHistory": "",
      "drugHistory": "",
      "allergyHistory": "",
      "familyHistory": "",
      "socialHistory": ""
    },
    "recentNotes": [],
    "lastVisit": null
  }
}
```

**Error cases:** `401`, `403`, `404` person not found

#### `GET /api/encounters/patients/:personId/notes`

**Purpose:** Paginated doctor encounter notes timeline (workspace View more + Doctor Note Timeline).

**Required permission:** `encounter:read`

**Query:** `page`, `limit`

**Request body:** none

**Response example:**

```json
{
  "data": {
    "items": [
      {
        "encounterId": 9,
        "status": "Completed",
        "doctorName": "Dr Ada",
        "clinic": "OPC",
        "startedAt": "2026-07-10T09:00:00.000Z",
        "completedAt": "2026-07-10T09:28:00.000Z",
        "outcome": "Discharge",
        "summary": "CC: Headache · Assessment: Tension headache",
        "note": {
          "chiefComplaint": "Headache",
          "history": "…",
          "pastMedicalHistory": "…",
          "drugHistory": "…",
          "allergyHistory": "…",
          "familyHistory": "…",
          "socialHistory": "…",
          "examination": "…",
          "assessment": "…",
          "plan": "…",
          "followUpPlan": "…"
        }
      }
    ],
    "meta": { "page": 1, "limit": 20, "total": 1 }
  }
}
```

**Error cases:** `401`, `403`, `404` person not found

#### `POST /api/encounters/start`

**Purpose:** Start consultation; creates `ENCOUNTERS` and sets triage to `In Consultation`.

**Required permission:** `encounter:create`

**Request body:**

```json
{ "triageId": 41, "clinic": "OPC" }
```

**Response example:** `{ data: { encounterId, status: "In Consultation", version: 1, patient, note, doctorName } }`

**Error cases:**
- `400` triage not awaiting consultation
- `401` / `403`
- `404` triage not found
- `409` card payment Pending, or encounter already started for triage

#### `PATCH /api/encounters/:id`

**Purpose:** Autosave draft clinical notes with optimistic locking.

**Required permission:** `encounter:update`

**Request body:** `{ version?, idempotencyKey?, chiefComplaint?, history?, examination?, assessment?, plan?, pastMedicalHistory?, drugHistory?, allergyHistory?, familyHistory?, socialHistory?, followUpPlan? }`

**Error cases:** `400` not in consultation, `409` version conflict

#### `POST /api/encounters/:id/complete`

**Purpose:** Complete an active consultation. When `outcome` is Follow-up (or `followUpDate` is sent), creates a `FOLLOW_UPS` row.

**Required permission:** `encounter:complete`

**Request body:**

```json
{
  "outcome": "Follow-up",
  "followUpDate": "2026-07-25",
  "followUpClinic": "OPC",
  "followUpTime": "09:30",
  "followUpPriority": "Routine",
  "followUpReason": "Review after sertraline titration"
}
```

**Response example:** `{ data: { encounterId, status: "Completed", outcome, completedAt, … } }`

**Error cases:** `400` not in consultation / missing follow-up date, `401`, `403`, `404`

#### `GET /api/encounters/follow-ups`

**Purpose:** List follow-ups for the clinical workspace Follow-Up tab (default: this week → +14 days). Display status is derived: `Scheduled` | `Due Today` | `Missed` | `Attended` | `Cancelled`.

**Required permission:** `encounter:read`

**Query:** `q`, `clinic`, `status`, `from`, `to`, `page`, `limit`, `timezoneOffsetMinutes`, `mine=1` (only the logged-in doctor)

**Response example:**

```json
{
  "data": {
    "summary": { "thisWeek": 3, "dueToday": 1, "missed": 0, "scheduled": 2, "attended": 0 },
    "items": [
      {
        "id": 12,
        "personId": 132,
        "name": "Ada Nwosu",
        "mrn": "FNPH/132",
        "clinic": "OPC",
        "prevDx": "MDD",
        "date": "2026-07-25",
        "status": "Scheduled"
      }
    ],
    "meta": { "page": 1, "limit": 50, "total": 3, "from": "2026-07-13", "to": "2026-07-27" }
  }
}
```

**Error cases:** `401`, `403`

#### `POST /api/encounters/follow-ups`

**Purpose:** Schedule a follow-up from the workspace dialog (linked to a patient / optional encounter).

**Required permission:** `encounter:complete`

**Request body:** `{ personId, scheduledDate, clinic?, scheduledTime?, priority?, prevDx?, reason?, reminder?, encounterId? }`

**Response example:** `{ data: { id, name, mrn, date, status: "Scheduled" } }`

**Error cases:** `400` invalid date / encounter mismatch, `401`, `403`, `404`

#### `PATCH /api/encounters/follow-ups/:id`

**Purpose:** Mark attended/cancelled or reschedule.

**Required permission:** `encounter:update`

**Request body:** `{ status?: "Scheduled"|"Attended"|"Cancelled", scheduledDate?, scheduledTime?, clinic?, priority?, reason? }`

**Error cases:** `400`, `401`, `403`, `404`

---

### Clinical Prescriptions (`/prescriptions`)

Doctor creates/sends prescriptions; pharmacy lists inbound (`status=Sent`). Drugs must exist in the catalog (`DRUGS`). Patient is referenced by `PERSON_ID` only.

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| POST | `/prescriptions` | Create prescription (`send: true` → pharmacy queue) | `prescription:create` |
| GET | `/prescriptions` | List (`q`, `status`, `paymentStatus`, `personId`, `page`, `limit`) | `prescription:read` |
| GET | `/prescriptions/by-rx/:rxNo` | Detail by Rx number (e.g. `RX-2026-0001`) + audit trail | `prescription:read` |
| GET | `/prescriptions/:id` | Detail by numeric id + audit trail | `prescription:read` |
| POST | `/prescriptions/:id/dispense` | Dispense after Paid/Waived/Emergency (FEFO + audit) | `pharmacy:dispense` |
| POST | `/prescriptions/:id/emergency-dispense` | Emergency unpaid dispense; records receiver; leaves Emergency bill | `pharmacy:dispense` |
| PATCH | `/prescriptions/:id` | Update status / payment / pharmacy notes | `prescription:update` |

#### `POST /api/prescriptions`

**Request body:**

```json
{
  "personId": 12,
  "send": true,
  "urgency": "Routine",
  "paymentStatus": "Unpaid",
  "diagnosis": "Moderate Depressive Episode (F32.1)",
  "allergiesNote": "Penicillin",
  "clinic": "OPC",
  "items": [
    {
      "drugId": 3,
      "strength": "500mg",
      "form": "Tablet",
      "route": "PO",
      "dose": "500mg",
      "frequency": "OD",
      "duration": "28 days",
      "quantity": 28,
      "source": "Internal Pharmacy",
      "indication": "Depression"
    }
  ]
}
```

**Response 201:** `{ data: { prescriptionId, rxNo: "RX-2026-0001", status: "Sent", items: [...], person: {...}, total } }`

**Errors:** `400` validation / unknown drug, `401`, `403` missing `prescription:create`, `404` person not found. Audit: `prescription:send` (or `prescription:create` when `send: false`).

#### `GET /api/prescriptions`

**Query:** `status=Sent` (pharmacy inbound), `personId`, `q`, `page`, `limit`.

**Response:** `{ data: { items: [...], meta: { page, limit, total } } }`

#### `GET /api/prescriptions/by-rx/:rxNo`

**Example:** `GET /api/prescriptions/by-rx/RX-2026-0001`

**Response:** `{ data: { prescriptionId, rxNo, status, items, person, dispensedBy, auditTrail: [{ at, actor, action, note }] } }`

**Errors:** `401`, `403`, `404`

#### `POST /api/prescriptions/:id/dispense`

**Purpose:** Pharmacist completes dispensing in one step — deducts `DRUG_BATCHES` FEFO, updates line `QTY_DISPENSED`, sets status `Dispensed` / `Partially Dispensed`, writes audit `pharmacy:dispense`.

**Request body:**

```json
{
  "pharmacyNotes": "Counselled — take with food",
  "items": [{ "itemId": 1, "quantity": 28 }]
}
```

Omit `items` to dispense full remaining quantity on all internal-pharmacy lines.

**Response:** `{ data: { prescriptionId, rxNo, status: "Dispensed", dispensedBy, items, auditTrail } }`

**Errors:** `400` unpaid (must pay or use emergency-dispense) / insufficient stock / already dispensed, `401`, `403` missing `pharmacy:dispense`, `404`

#### `POST /api/prescriptions/:id/emergency-dispense`

**Purpose:** Clinically necessary dispense before payment. Sets `PAYMENT_STATUS=Emergency`, stores `EMERGENCY_RECEIVED_BY` / note / timestamp, then runs FEFO dispense. Bill remains collectible at cashier/billing until paid.

**Permission:** `pharmacy:dispense`

**Request body:**

```json
{
  "receivedBy": "Nurse Ama — Ward 3",
  "note": "Stat antibiotics — patient unstable",
  "pharmacyNotes": "Counselled",
  "items": [{ "itemId": 1, "quantity": 10 }]
}
```

**Response:** `{ data: { prescriptionId, paymentStatus: "Emergency", emergencyReceivedBy, status: "Dispensed", ... } }`

**Errors:** `400` already paid/waived / missing receivedBy / stock, `401`, `403`, `404`

**Audit:** `pharmacy:emergency-dispense`

---

### Pharmacy Drug Catalog (`/pharmacy/drugs`)

Drugs are catalog entries; quantities and expiry live in **batches** created by stock receipts. `stock` is computed as the sum of available batch quantities, and `earliestExpiry` / `stockStatus` (`Active` / `Low` / `Out of Stock` / `Expired`) are derived per drug.

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| POST | `/pharmacy/drugs` | Add drug to catalog (name + optional supplier) | `drug:create` |
| GET | `/pharmacy/drugs` | List catalog (`q`, `category`, `supplierId`, `status`, `page`, `limit`) | `pharmacy:read` |
| GET | `/pharmacy/drugs/:id` | Drug detail incl. batches | `pharmacy:read` |
| PATCH | `/pharmacy/drugs/:id` | Update catalog fields (price, reorder level, shelf, …) | `drug:update` |

#### `POST /api/pharmacy/drugs`

**Request body:**

```json
{
  "name": "Amoxicillin",
  "genericName": "Amoxicillin 500mg",
  "category": "Antibiotic",
  "form": "Capsule",
  "strength": "500mg",
  "unit": "cap",
  "unitPrice": 50,
  "reorderLevel": 500,
  "shelf": "B-1",
  "controlled": false,
  "supplierId": 1
}
```

**Response 201:** `{ data: { drugId, name, ..., supplierId, supplierName, stock: 0, stockStatus: "Out of Stock", batches: [] } }`

**Errors:** `400` validation, `401`, `403` missing `drug:create`, `404` supplier not found, `409` duplicate drug (same name + strength + form). Writes audit `drug:create`.

---

### Pharmacy Inventory (`/pharmacy/inventory`)

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| GET | `/pharmacy/inventory` | Inventory list (same shape as drug list, batch-aware) | `pharmacy:read` |
| GET | `/pharmacy/inventory/stats` | Summary cards: total drugs, low stock, out of stock, expiring soon, expired, stock value, recently received | `pharmacy:read` |
| POST | `/pharmacy/inventory/adjustments` | Manual stock adjustment on a batch (± qty, reason required) | `stock:adjust` |

#### `POST /api/pharmacy/inventory/adjustments`

**Request body:**

```json
{
  "drugId": 3,
  "qty": -20,
  "reason": "Damaged stock — water damage in store B"
}
```

Positive `qty` adds to the newest batch; negative deducts FEFO (earliest-expiry batches first). `reason` is mandatory.

**Response 201:** updated drug with recomputed `stock` and `stockStatus`.

**Errors:** `400` validation / adjustment below zero, `401`, `403` missing `stock:adjust`, `404` drug or batch not found. Writes audit `stock:adjust`.

---

### Pharmacy Walk-In Sales (`/pharmacy/walk-in`)

OTC / walk-in sales are **not** clinical prescriptions. Flow: pharmacist creates request (Unpaid) → cashier confirms payment → pharmacist dispenses (FEFO stock).

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| POST | `/pharmacy/walk-in` | Create walk-in request (Awaiting Payment) | `pharmacy:sale-create` |
| GET | `/pharmacy/walk-in` | List sales (`status`, `paymentStatus`, `q`, `page`, `limit`) | `pharmacy:sale-read` |
| GET | `/pharmacy/walk-in/by-no/:saleNo` | Detail by `WS-YYYY-####` | `pharmacy:sale-read` |
| GET | `/pharmacy/walk-in/:id` | Detail by id | `pharmacy:sale-read` |
| POST | `/pharmacy/walk-in/:id/dispense` | Dispense after Paid (FEFO batches) | `pharmacy:dispense` |
| PATCH | `/pharmacy/walk-in/:id/cancel` | Cancel unpaid / not-dispensing sale | `pharmacy:sale-create` |
| GET | `/cashier/payments/pharmacy-sales` | Cashier unpaid walk-in queue | `pharmacy:sale-read` |
| POST | `/cashier/payments/pharmacy-sales/:saleId/confirm` | Confirm payment (unlocks dispense) | `pharmacy:sale-pay` |
| GET | `/cashier/payments/prescriptions` | Cashier unpaid/emergency Rx bills (`paymentStatus` default `Unpaid,Emergency`) | `prescription:read` |
| POST | `/cashier/payments/prescriptions/:id/confirm` | Confirm Rx payment | `prescription:pay` |

#### `POST /api/pharmacy/walk-in`

**Purpose:** Create walk-in request. Does **not** collect money or dispense. Resolves/creates `PERSONS` (patient-centric).

**Request body:**

```json
{
  "personId": 12,
  "items": [{ "drugId": 3, "quantity": 20 }],
  "preferredPaymentChannel": "Cash",
  "notes": "OTC analgesics"
}
```

Or for a new customer: `{ "customerName": "Ada Obi", "phone": "0803…", "items": [...] }`.

**Response:** `{ data: { saleId, saleNo: "WS-2026-0001", status: "Awaiting Payment", paymentStatus: "Unpaid", total, items, person } }`

**Errors:** `400` validation / insufficient stock, `401`, `403`, `404` person

**Audit:** `pharmacy:sale-create`

#### `POST /api/cashier/payments/pharmacy-sales/:saleId/confirm`

**Purpose:** Cashier marks sale Paid — pharmacist may then dispense.

**Request body:** `{ "paymentChannel": "Cash", "paymentRef": "POS-991" }`

**Response:** `{ data: { saleId, paymentStatus: "Paid", status: "Paid", paidBy, paidAt } }`

**Errors:** `400` already paid / cancelled, `401`, `403`, `404`

**Audit:** `pharmacy:sale-pay`

#### `POST /api/pharmacy/walk-in/:id/dispense`

**Purpose:** Dispense only when `paymentStatus = Paid`. Deducts `DRUG_BATCHES` FEFO.

**Errors:** `400` unpaid / insufficient stock / already dispensed, `401`, `403`, `404`

**Audit:** `pharmacy:sale-dispense`

---

---

### Pharmacy Operations Dashboard (`/pharmacy`)

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| GET | `/pharmacy/dashboard` | KPI cards, charts, live alerts for `/pharmacy` | `pharmacy:read` |
| GET | `/pharmacy/analytics` | Operational analytics for `/pharmacy/analytics` | `pharmacy:read` |
| GET | `/pharmacy/expiry` | Expiry monitoring for `/dashboard/pharmacy/expiry` | `pharmacy:read` |
| POST | `/pharmacy/expiry/batches/:batchId/quarantine` | Quarantine batch | `stock:adjust` |
| GET | `/pharmacy/inpatient` | Inpatient ward dispensing queue (active admissions + Rx) | `pharmacy:read` |
| GET | `/pharmacy/reports/catalog` | Available operational report types | `pharmacy:read` |
| GET | `/pharmacy/reports/:type` | Generate report rows + summary | `pharmacy:read` |
| GET | `/pharmacy/audit` | Pharmacy-scoped audit trail + embedded stats | `audit:read` |
| GET | `/pharmacy/audit/stats` | Pharmacy audit summary cards | `audit:read` |

#### `GET /api/pharmacy/dashboard?timezoneOffsetMinutes=60`

**Purpose:** Pharmacy operations dashboard KPIs, charts, and live alerts.

**Required permission:** `pharmacy:read`

**Request body:** none

**Response example:**
```json
{
  "data": {
    "asOf": "2026-07-17T12:00:00.000Z",
    "kpis": {
      "prescriptionsToday": 12,
      "pendingPrescriptions": 4,
      "dispensedToday": 7,
      "revenueToday": 125000,
      "lowStock": 3,
      "outOfStock": 1,
      "expiringSoon": 5,
      "expired": 0,
      "pendingPurchaseOrders": 2,
      "inpatientWardRequests": 8,
      "drugReturns": 1,
      "emergencyDispenses": 0,
      "auditAlerts": 0,
      "controlledDrugBalance": 42
    },
    "charts": {
      "rxTrend": [{ "d": "Mon", "rx": 5 }],
      "salesTrend": [{ "d": "Mon", "v": 12000 }],
      "fastMoving": [{ "name": "Paracetamol", "qty": 40 }],
      "slowMoving": [],
      "stockValue": [{ "name": "Analgesic", "v": 500000 }],
      "monthlyRevenue": [{ "m": "Jul", "v": 1.2, "amount": 1200000 }],
      "expiryRisk": [{ "name": "< 30 days", "value": 2, "color": "#ef4444" }]
    },
    "alerts": [{ "tone": "amber", "title": "Low stock", "count": 3, "to": "/pharmacy/inventory?filter=low" }]
  }
}
```

**Error cases:** `401` unauthorized, `403` missing permission

#### `GET /api/pharmacy/inpatient?q=&wardId=&status=&page=&limit=`

**Purpose:** Inpatient pharmacy queue — active admissions joined to pending/dispensed prescriptions. MAR administration stays in Nursing.

**Required permission:** `pharmacy:read`

**Query:** `status` = `all` | `awaiting` | `awaiting-pharmacy` | `awaiting-payment` | `dispensed` | `no-rx`

**Response example:**
```json
{
  "data": {
    "summary": { "admitted": 10, "awaitingPharmacy": 3, "awaitingPayment": 2, "dispensed": 4, "noPrescription": 1 },
    "wards": [{ "wardId": 1, "wardName": "Male Med" }],
    "items": [{
      "admissionId": 1,
      "patientName": "Ada Okafor",
      "wardName": "Male Med",
      "bedNo": "B12",
      "rxNo": "RX-2026-001",
      "queueStatus": "Awaiting Pharmacy",
      "paymentStatus": "Paid"
    }],
    "meta": { "page": 1, "limit": 50, "total": 1 }
  }
}
```

**Error cases:** `401`, `403` (empty queue if ADMISSION table unavailable)

#### `GET /api/pharmacy/reports/catalog`

**Purpose:** List supported pharmacy report types.

**Required permission:** `pharmacy:read`

**Response example:** `{ "data": { "items": [{ "type": "revenue", "label": "Revenue Report", "description": "…" }] } }`

**Error cases:** `401`, `403`

#### `GET /api/pharmacy/reports/:type?from=&to=&page=&limit=`

**Purpose:** Generate operational report (`daily-prescriptions`, `monthly-prescriptions`, `drug-utilization`, `controlled-drugs`, `revenue`, `inventory`, `expiry`, `returns`).

**Required permission:** `pharmacy:read`

**Response example:** `{ "data": { "type": "revenue", "from": "…", "to": "…", "summary": {}, "columns": [], "items": [], "meta": {} } }`

**Error cases:** `400` unknown report type, `401`, `403`

#### `GET /api/pharmacy/audit?q=&category=&status=&from=&to=&page=&limit=&timezoneOffsetMinutes=`

**Purpose:** Pharmacy-scoped audit trail (dispense, stock, procurement, payments, returns, emergency).

**Required permission:** `audit:read`

**Response example:**
```json
{
  "data": {
    "items": [{
      "auditId": 1,
      "time": "2026-07-17T10:00:00.000Z",
      "officer": "Pharm A",
      "action": "pharmacy:dispense",
      "patient": "Ada Okafor",
      "module": "Dispensing",
      "status": "Success"
    }],
    "meta": { "page": 1, "limit": 50, "total": 1 },
    "stats": { "totalToday": 4, "dispenses": 2, "emergencies": 0, "stockEvents": 1, "returns": 0, "overrides": 0 }
  }
}
```

**Error cases:** `401`, `403`

#### `GET /api/pharmacy/audit/stats?timezoneOffsetMinutes=60`

**Purpose:** Summary cards for pharmacy audit trail.

**Required permission:** `audit:read`

**Response example:** `{ "data": { "totalToday": 4, "dispenses": 2, "emergencies": 0, "stockEvents": 1, "returns": 0, "overrides": 0 } }`

**Error cases:** `401`, `403`

---

### Pharmacy Expiry Monitoring (`/pharmacy/expiry`)

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| GET | `/pharmacy/expiry` | Batch expiry buckets + table for `/dashboard/pharmacy/expiry` | `pharmacy:read` |
| POST | `/pharmacy/expiry/batches/:batchId/quarantine` | Soft-quarantine a batch | `stock:adjust` |

#### `GET /api/pharmacy/expiry?bucket=&q=&page=&limit=`

**Purpose:** Drug expiry monitoring by batch using pharmacy settings thresholds.

**Required permission:** `pharmacy:read`

**Query:** `bucket` = `all` | `expired` | `critical` | `warning` | `soon`

**Response example:**
```json
{
  "data": {
    "summary": { "expired": 2, "critical": 3, "warning": 5, "soon": 8, "total": 18, "quarantined": 1, "valueAtRisk": 45000 },
    "thresholds": { "expiryCriticalDays": 30, "expiryWarningDays": 90, "expiringSoonDays": 180 },
    "items": [{
      "batchId": 12,
      "drugName": "Amoxicillin",
      "batchNo": "B-100",
      "qtyAvailable": 40,
      "daysLeft": 12,
      "bucket": "critical",
      "status": "Available",
      "valueAtRisk": 8000
    }],
    "meta": { "page": 1, "limit": 50, "total": 18 }
  }
}
```

**Error cases:** `400` invalid bucket, `401`, `403`

#### `POST /api/pharmacy/expiry/batches/:batchId/quarantine`

**Purpose:** Quarantine an at-risk or expired batch (status → Quarantined). Audits `stock:quarantine`.

**Required permission:** `stock:adjust`

**Request body:** none

**Response example:** `{ "data": { "batchId": 12, "drugName": "Amoxicillin", "batchNo": "B-100", "status": "Quarantined" } }`

**Error cases:** `400` already quarantined / no stock, `401`, `403`, `404`

---

### Pharmacy Analytics (`/pharmacy/analytics`)

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| GET | `/pharmacy/analytics` | Operational analytics for `/pharmacy/analytics` | `pharmacy:read` |

#### `GET /api/pharmacy/analytics?from=&to=&timezoneOffsetMinutes=`

**Purpose:** Revenue, dispense volume, inventory health, controlled usage, returns, procurement snapshot and charts.

**Required permission:** `pharmacy:read`

**Request body:** none

**Response example:**
```json
{
  "data": {
    "asOf": "2026-07-17T12:00:00.000Z",
    "from": "…",
    "to": "…",
    "kpis": {
      "revenue": 1250000,
      "prescriptionsDispensed": 40,
      "walkInDispensed": 12,
      "emergencyDispenses": 1,
      "lowStock": 4,
      "expired": 1,
      "controlledBalance": 22
    },
    "charts": {
      "revenueTrend": [{ "d": "Mon", "v": 12000 }],
      "topDispensed": [{ "name": "Paracetamol", "qty": 80, "value": 4000 }],
      "channelMix": [{ "name": "Cash", "value": 50000 }],
      "inventoryHealth": [{ "name": "Low", "value": 4, "color": "#f59e0b" }],
      "expiryRisk": [{ "name": "< 30 days", "value": 2, "color": "#ef4444" }]
    }
  }
}
```

**Error cases:** `401`, `403`

---

### Pharmacy Billing (`/pharmacy/billing`)

Aggregates doctor prescriptions and walk-in sales (no separate Invoice tables).

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| GET | `/pharmacy/billing/summary` | Cards: paid/pending counts, channel revenue | `pharmacy:sale-read` |
| GET | `/pharmacy/billing/bills` | Unified bill list (`q`, `paymentStatus`, `type`, `page`, `limit`) | `pharmacy:sale-read` |
| POST | `/pharmacy/billing/bills/:type/:id/confirm` | Confirm payment (`type` = `prescription` \| `walk_in`) | `pharmacy:sale-pay` **or** `prescription:pay` |

#### `GET /api/pharmacy/billing/summary`

**Response example:** `{ data: { paidCount, pendingCount, channelTotals: { Cash, "POS Card", … }, revenueTotal } }`

#### `POST /api/pharmacy/billing/bills/:type/:id/confirm`

**Request body:** `{ "paymentChannel": "Cash", "paymentRef": "optional" }`

**Errors:** `400` already paid / unknown type, `401`, `403`, `404`

---

### Pharmacy Returns (`/pharmacy/returns`)

Return already-dispensed Rx or walk-in lines; restores stock to `DRUG_BATCHES`; increments `QTY_RETURNED`.

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| GET | `/pharmacy/returns/summary` | Today/week cards | `pharmacy:return-read` |
| GET | `/pharmacy/returns` | List returns | `pharmacy:return-read` |
| GET | `/pharmacy/returns/lookup?q=` | Lookup dispensed Rx/sale + returnable lines | `pharmacy:return-read` |
| POST | `/pharmacy/returns` | Commit return | `pharmacy:return-create` |

#### `POST /api/pharmacy/returns`

**Request body:**

```json
{
  "sourceType": "prescription",
  "sourceId": 12,
  "items": [{ "sourceItemId": 34, "quantity": 5 }],
  "reason": "Patient allergy — unused tablets",
  "returnedByRole": "Nurse",
  "returnedByName": "Ama Mensah"
}
```

**Response:** `{ data: { returnId, returnNo, totalValue, items } }`

**Errors:** `400` qty exceeds returnable / not dispensed, `401`, `403`, `404`

**Audit:** `pharmacy:return`

---

### Pharmacy Settings (`/pharmacy/settings`)

Hospital-level alert thresholds (singleton). Inventory “Expiring Soon” / recently received use these values.

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| GET | `/pharmacy/settings` | Load thresholds and alert flags | `pharmacy:read` |
| PATCH | `/pharmacy/settings` | Update thresholds | `pharmacy:settings-update` |

#### `GET /api/pharmacy/settings`

**Response example:**

```json
{
  "data": {
    "defaultReorderLevel": 50,
    "expiringSoonDays": 180,
    "expiryCriticalDays": 30,
    "expiryWarningDays": 90,
    "receiveStockWarnDays": 180,
    "recentlyReceivedDays": 7,
    "controlledRequiresWitness": true,
    "lowStockAlertEnabled": true,
    "expiryAlertEnabled": true
  }
}
```

#### `PATCH /api/pharmacy/settings`

**Request body:** partial of the fields above.

**Audit:** `pharmacy:settings-update`

---

### Pharmacy Procurement (`/pharmacy/procurement`)

Workflow: **Purchase Request** (`Pending Approval` → `Approved`/`Rejected`) → **Purchase Order** (`Pending Approval` → `Approved` → `Sent` → `Delivered`) → **Receive stock** (creates a **GRN** + drug batches).

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| GET | `/pharmacy/procurement/stats` | Dashboard cards: open PRs, active POs, monthly spend, pending deliveries | `pharmacy:read` |
| GET | `/pharmacy/procurement/history` | History tab cards + completed/cancelled/partial POs with GRN aggregates | `pharmacy:read` |
| POST | `/pharmacy/procurement/requests` | Create purchase request (auto `PR-YYYY-###`) | `procurement:create` |
| GET | `/pharmacy/procurement/requests` | List PRs (`status`, `q`, `page`, `limit`) | `pharmacy:read` |
| PATCH | `/pharmacy/procurement/requests/:id/approve` | Approve PR | `procurement:approve` |
| PATCH | `/pharmacy/procurement/requests/:id/reject` | Reject PR (reason required) | `procurement:approve` |
| POST | `/pharmacy/procurement/orders` | Create purchase order with items (auto `PO-YYYY-###`) | `procurement:create` |
| GET | `/pharmacy/procurement/orders` | List POs (`status`, `approvalStatus`, `deliveryStatus`, `q`, `page`, `limit`) | `pharmacy:read` |
| GET | `/pharmacy/procurement/orders/receivable` | POs eligible for Receive Stock (Approved + Not Sent/Sent/Partial) | `pharmacy:read` |
| GET | `/pharmacy/procurement/orders/:id` | PO detail incl. items | `pharmacy:read` |
| PATCH | `/pharmacy/procurement/orders/:id/approve` | Approve PO | `procurement:approve` |
| PATCH | `/pharmacy/procurement/orders/:id/reject` | Reject PO (reason required) | `procurement:approve` |
| PATCH | `/pharmacy/procurement/orders/:id/send` | Mark PO sent to supplier | `procurement:create` |
| POST | `/pharmacy/procurement/receive` | Receive stock → GRN + available drug batches (stock qty increases) | `stock:receive` |
| GET | `/pharmacy/procurement/grns` | List goods received notes | `pharmacy:read` |

#### `GET /api/pharmacy/procurement/orders/receivable`

**Purpose:** Dropdown source for Receive Stock — approved POs not yet fully delivered (includes Approved + Not Sent so Accept can run without a separate Send).

**Response:** `{ data: { items: [{ poId, poNo, supplierName, items, deliveryStatus, ... }], meta } }`

**Errors:** `401`, `403`

#### `GET /api/pharmacy/procurement/history`

**Purpose:** Procurement History tab — summary cards plus paginated completed / cancelled / partially delivered POs with GRN aggregates.

**Query:** `q`, `status` (`Completed` \| `Cancelled` \| `Partially Delivered` \| `all`), `page`, `limit`

**Response example:**

```json
{
  "data": {
    "cards": {
      "completedOrders": 12,
      "cancelledOrders": 2,
      "partiallyDelivered": 3,
      "grnCount": 40,
      "completedValue": 1250000,
      "receivedValue": 980000,
      "totalDamagedQty": 15,
      "totalAcceptedQty": 42000
    },
    "items": [
      {
        "poId": 4,
        "poNo": "PO-2026-0004",
        "supplierName": "Emzor Pharma Ltd",
        "status": "Completed",
        "qtyOrdered": 1000,
        "qtyReceived": 1000,
        "qtyAccepted": 995,
        "qtyDamaged": 5,
        "grnCount": 2,
        "total": 32000
      }
    ],
    "meta": { "page": 1, "limit": 50, "total": 17 }
  }
}
```

**Errors:** `401`, `403`

#### `POST /api/pharmacy/procurement/receive`

**Purpose:** Pharmacist receives goods. Creates GRN + `DRUG_BATCHES` row with `QTY_AVAILABLE = accepted` (catalog stock is the sum of available batches). PO must be **Approved**. First receipt against `Not Sent` auto-marks delivery `Sent`. Receiver is always the authenticated user.

**Request body (one call per drug batch received):**

```json
{
  "poId": 4,
  "drugId": 3,
  "batchNo": "AMX-2026-11",
  "mfgDate": "2026-01-15",
  "expiryDate": "2027-11-30",
  "qtyOrdered": 1000,
  "qtyReceived": 1000,
  "qtyDamaged": 0,
  "unitCost": 32,
  "sellingPrice": 50,
  "location": "A-1"
}
```

**Response:** `{ data: { grnId, grnNo, drugName, batchNo, qtyAccepted, receivedBy, ... } }`

**Errors:** `400` not approved / over-receipt / damaged > received / drug not on PO, `401`, `403` missing `stock:receive`

**Audit:** `stock:receive`

`poId` is optional for direct receipts from inventory. Receiving against a PO updates delivery to `Partial` or `Delivered`/`Completed`.

**Audit:** every pharmacy mutation writes to `AUDITS` with the acting user — `supplier:create|update`, `drug:create|update`, `procurement:request-create|approved|rejected`, `procurement:po-create|approved|rejected|send`, `stock:receive`, `stock:adjust`.

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

### Laboratory (`/laboratory`)

Catalog + doctor lab requests. Payment is cashier-owned (`PAYMENT_STATUS` defaults to **Unpaid**). Sample collection / results are out of scope for this pass.

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/laboratory/tests?q=&category=&status=` | Lab test catalog | `lab:read` |
| GET | `/laboratory/tests/:id` | Test detail | `lab:read` |
| POST | `/laboratory/tests` | Create catalog entry | `lab:update` |
| PATCH | `/laboratory/tests/:id` | Update price/status | `lab:update` |
| POST | `/laboratory/requests` | Create+send request (always Unpaid) | `lab:create` |
| GET | `/laboratory/requests?personId=&encounterId=&status=&paymentStatus=` | List requests | `lab:read` |
| GET | `/laboratory/requests/:id` | Detail + items + person | `lab:read` |
| POST | `/laboratory/requests/:id/cancel` | Cancel if unpaid | `lab:update` |
| GET | `/cashier/payments/lab-requests?paymentStatus=Unpaid` | Cashier unpaid queue | `lab:pay` |
| POST | `/cashier/payments/lab-requests/:id/confirm` | Confirm payment `{ paymentChannel, paymentRef? }` | `lab:pay` |

**POST `/laboratory/requests` body:** `{ personId, encounterId?, priority?: "Routine"|"Urgent"|"Stat", clinicalIndication?, clinicalNotes?, items: [{ testId, lineNotes? }] }`

**Response example:** `{ data: { labRequestId, requestNo: "LR-2026-0001", paymentStatus: "Unpaid", status: "Sent", totalAmount, items, person } }`

**Errors:** 400 invalid/inactive tests or encounter mismatch / already paid cancel; 401; 403; 404 patient/request.

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
