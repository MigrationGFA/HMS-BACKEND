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
