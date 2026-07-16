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

### Pharmacy Procurement (`/pharmacy/procurement`)

Workflow: **Purchase Request** (`Pending Approval` → `Approved`/`Rejected`) → **Purchase Order** (`Pending Approval` → `Approved` → `Sent` → `Delivered`) → **Receive stock** (creates a **GRN** + drug batches).

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| GET | `/pharmacy/procurement/stats` | Dashboard cards: open PRs, active POs, monthly spend, pending deliveries | `pharmacy:read` |
| POST | `/pharmacy/procurement/requests` | Create purchase request (auto `PR-YYYY-###`) | `procurement:create` |
| GET | `/pharmacy/procurement/requests` | List PRs (`status`, `q`, `page`, `limit`) | `pharmacy:read` |
| PATCH | `/pharmacy/procurement/requests/:id/approve` | Approve PR | `procurement:approve` |
| PATCH | `/pharmacy/procurement/requests/:id/reject` | Reject PR (reason required) | `procurement:approve` |
| POST | `/pharmacy/procurement/orders` | Create purchase order with items (auto `PO-YYYY-###`) | `procurement:create` |
| GET | `/pharmacy/procurement/orders` | List POs (`status`, `supplierId`, `q`, `page`, `limit`) | `pharmacy:read` |
| GET | `/pharmacy/procurement/orders/:id` | PO detail incl. items | `pharmacy:read` |
| PATCH | `/pharmacy/procurement/orders/:id/approve` | Approve PO | `procurement:approve` |
| PATCH | `/pharmacy/procurement/orders/:id/reject` | Reject PO (reason required) | `procurement:approve` |
| PATCH | `/pharmacy/procurement/orders/:id/send` | Mark PO sent to supplier | `procurement:create` |
| POST | `/pharmacy/procurement/receive` | Receive stock → GRN + drug batches (optionally against a PO) | `stock:receive` |
| GET | `/pharmacy/procurement/grns` | List goods received notes | `pharmacy:read` |

#### `POST /api/pharmacy/procurement/receive`

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
  "location": "Store B",
  "receivedBy": "Pharm. Ada Obi"
}
```

`poId` is optional (direct receipts from the inventory page are allowed). Each receipt creates a GRN + a `DRUG_BATCHES` row and increases available stock by the accepted quantity (`qtyReceived - qtyDamaged`); receiving against a PO marks it `Delivered`.

**Response 201:** `{ data: { grnId, grnNo: "GRN-YYYY-###", poId, drugId, drugName, batchNo, qtyReceived, qtyAccepted, expiryDate, receivedBy, receivedAt } }`

**Errors:** `400` validation, `401`, `403` missing `stock:receive`, `404` PO or drug not found, `409` PO not in a receivable state. Writes audit `stock:receive`.

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
