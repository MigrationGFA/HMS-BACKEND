# Workflows

Core hospital business workflows. Each workflow maps to one or more API modules and may involve async messaging or realtime updates.

## 1. Staff Authentication

```
Receptionist opens app
  → POST /auth/login (email + password)
  → Server validates bcrypt hash
  → Issues access JWT (1h) + refresh token (12h, stored in DB)
  → Client stores access + refresh tokens
  → Subsequent requests use Authorization: Bearer header
  → Client auto-refreshes before access expiry and on 401 via POST /auth/refresh
  → If refresh fails / still Unauthorized, client clears session and redirects to /login
  → On logout, POST /auth/logout revokes refresh token
```

**Modules:** `AuthModule`, `UsersModule`
**Audit:** Login success/failure logged

---

## 2. Patient Registration

```
Receptionist collects patient details
  → POST /patients (name, DOB, gender, phone, address, emergency contact)
  → System generates MRN (Medical Record Number)
  → Patient record created in PostgreSQL
  → Audit log: patient:create
  → Response with patient ID + MRN
```

**Modules:** `PatientsModule`, `AuditModule`
**Search:** Patient indexed for full-text search

---

## 3. Appointment Booking

```
Receptionist searches patient (GET /patients?q=...)
  → Selects doctor and available time slot
  → POST /appointments (patientId, doctorId, scheduledAt, departmentId)
  → System validates no double-booking
  → Appointment created (status: scheduled)
  → RabbitMQ: notifications.email / notifications.sms (reminder scheduled)
  → Audit log: appointment:create
```

**Modules:** `AppointmentsModule`, `NotificationsModule`
**Async:** Reminder job queued for 24h before appointment

---

## 4. Walk-In Queue (Realtime)

```
Patient arrives without appointment
  → POST /queues/check-in (patientId, departmentId, priority)
  → Queue entry created with position number
  → Socket.IO: queue:updated broadcast to department room
  → Waiting room display updates in realtime

Nurse/Doctor calls next patient
  → PATCH /queues/:id/call
  → Status changes: waiting → in-progress
  → Socket.IO: queue:updated + notification to assigned doctor

Visit completes
  → PATCH /queues/:id/complete
  → Status: in-progress → completed
  → Socket.IO: queue:updated
```

**Modules:** `QueuesModule`, `EventsModule`
**Realtime:** Socket.IO department rooms

---

## 5. Doctor Consultation

```
Records routes paid patient to consult
  → POST /api/records/arrivals/route { action: "consult" }
  → TRIAGE.STATUS = Sent to Consultation (blocked if card Pending)

Doctor opens Consultation Workspace (/dashboard/doctor/clinical/workspace)
  → GET /api/encounters/consultation-queue
  → Start only when paymentCleared
  → POST /api/encounters/start { triageId }
  → ENCOUNTERS created; TRIAGE.STATUS = In Consultation
  → Draft notes autosave: PATCH /api/encounters/:id (version + idempotency)
  → POST /api/encounters/:id/complete { outcome }
  → Optional: POST /api/prescriptions after consult
  → Each mutation → audit (encounter:start|update|complete)
```

**Modules:** `ClinicalModule` (Encounters), `RecordsModule`, `PatientsModule` (Cards), `AuditModule`

---

## 6. Lab Processing (Async)

```
Doctor creates lab order
  → POST /lab/orders → saved to DB (status: pending)
  → RabbitMQ: lab.processing message published
  → API returns 201 immediately

Lab worker picks up job (consumer)
  → Updates order status: in-progress
  → Processes sample
  → PATCH /lab/orders/:id/results (results data)
  → Status: completed
  → RabbitMQ: notifications.email + notifications.sms
  → Socket.IO: notification to ordering doctor
  → Audit log: lab:result_submitted
```

**Modules:** `LabModule`, `NotificationsModule`, `EventsModule`
**Async:** RabbitMQ `lab.processing` queue

---

## 7. Pharmacy Dispensing

```
Doctor sends Rx
  → POST /api/prescriptions { send: true } → status Sent, audit prescription:send

Pharmacist opens queue (/pharmacy/queue)
  → GET /api/prescriptions?status=Sent
  → Start Processing / View → /pharmacy/rx/:rxNo
  → GET /api/prescriptions/by-rx/:rxNo (+ auditTrail)

Same pharmacist dispenses immediately (no separate Send step)
  → POST /api/prescriptions/:id/dispense { pharmacyNotes? }
  → FEFO deduct from DRUG_BATCHES
  → Line QTY_DISPENSED updated; status Dispensed / Partially Dispensed
  → Audit log: pharmacy:dispense (entity prescriptions)
```

**Modules:** `ClinicalModule` (PrescriptionsService), `AuditModule`  
**Permission:** `pharmacy:dispense` (pharmacist role)

Pay-before-dispense: normal dispense requires `PAYMENT_STATUS` in `Paid | Waived | Emergency`. Unpaid Rx must use emergency override (records receiver) or cashier/billing payment first.

```
Doctor sends Rx (Unpaid)
  → Cashier/Billing: POST /api/cashier/payments/prescriptions/:id/confirm
     OR pharmacy billing confirm
  → Pharmacist: review modal → POST /api/prescriptions/:id/dispense

Emergency path (clinical override):
  → POST /api/prescriptions/:id/emergency-dispense { receivedBy }
  → Dispensed + PAYMENT_STATUS=Emergency (unpaid bill remains)
  → Cashier collects later
```

---

## 7b. Walk-In Pharmacy (OTC)

```
Pharmacist creates request (/pharmacy/queue → Walk-In)
  → POST /api/pharmacy/walk-in { personId|customerName, items }
  → status Awaiting Payment / Unpaid — NO dispense yet
  → Audit: pharmacy:sale-create

Cashier collects payment (/dashboard/cashier/pharmacy)
  → GET /api/cashier/payments/pharmacy-sales?paymentStatus=Unpaid
  → POST /api/cashier/payments/pharmacy-sales/:id/confirm { paymentChannel }
  → status Paid — unlocks dispense
  → Audit: pharmacy:sale-pay

Pharmacist dispenses (same queue)
  → POST /api/pharmacy/walk-in/:id/dispense
  → FEFO deduct DRUG_BATCHES (blocked if Unpaid)
  → Audit: pharmacy:sale-dispense
```

**Modules:** `PharmacyModule` (WalkInSalesService), `CashierModule`, `AuditModule`  
**Permissions:** `pharmacy:sale-create|read|pay`, `pharmacy:dispense`

---

## 7c. Pharmacy Billing (aggregate)

```
GET /api/pharmacy/billing/summary — paid/pending cards + channel totals
GET /api/pharmacy/billing/bills — unified Rx + walk-in bills
POST /api/pharmacy/billing/bills/:type/:id/confirm — collect payment
```

Frontend: `/pharmacy/billing`. Cashier also uses `/dashboard/cashier/pharmacy` (walk-in + Rx tabs).

---

## 7d. Pharmacy Returns

```
Lookup dispensed Rx/sale → GET /api/pharmacy/returns/lookup?q=RX-…
Select lines/qty + returned-by role/name + reason
  → POST /api/pharmacy/returns
  → QTY_RETURNED incremented; stock restored to DRUG_BATCHES
  → Audit: pharmacy:return
```

Frontend: `/pharmacy/returns` (Returns tab live; cancel/reverse/refund placeholders).

---

## 7e. Pharmacy Settings (thresholds)

```
GET /api/pharmacy/settings — reorder default, expiry alert days, flags
PATCH /api/pharmacy/settings — pharmacist updates thresholds
Inventory stats / Expiring Soon use configured expiringSoonDays
```

Frontend: `/pharmacy/config`

---

## 7f. Pharmacy Operational Pages

```
Dashboard (/pharmacy)
  → GET /api/pharmacy/dashboard?timezoneOffsetMinutes=
  → KPI cards, charts, live inventory/procurement/returns alerts

Inpatient Pharmacy (/pharmacy/inpatient)
  → GET /api/pharmacy/inpatient?q=&wardId=&status=
  → Active ADMISSION rows + linked PRESCRIPTIONS
  → Open Rx → existing /pharmacy/rx/:rxNo dispense flow
  → MAR administration remains in Nursing

Reports (/pharmacy/reports)
  → GET /api/pharmacy/reports/catalog
  → GET /api/pharmacy/reports/:type?from=&to=
  → CSV/PDF export from returned rows

Audit Trail (/pharmacy/audit)
  → GET /api/pharmacy/audit?q=&category=
  → Pharmacy-scoped AUDITS (pharmacy:*, drug:*, stock:*, procurement:*, prescription:pay/dispense)
```

**Permissions:** `pharmacy:read` (dashboard/inpatient/reports), `audit:read` (audit)

---

## 7g. Pharmacy Expiry Monitoring & Analytics

```
Expiry (/dashboard/pharmacy/expiry)
  → GET /api/pharmacy/expiry?bucket=&q=
  → Settings thresholds (critical / warning / soon)
  → POST /api/pharmacy/expiry/batches/:id/quarantine
  → Audit: stock:quarantine

Analytics (/pharmacy/analytics)
  → GET /api/pharmacy/analytics?from=&to=
  → Revenue, dispense volume, inventory health, controlled, returns, procurement
```

**Permissions:** `pharmacy:read`; quarantine requires `stock:adjust`

---

## 8. Billing & Payment

```
Billing officer generates invoice after visit
  → POST /invoices (patientId, items[])
  → Invoice created (status: unpaid)
  → Patient pays
  → POST /invoices/:id/payments (amount, method)
  → Invoice status updated: paid / partial
  → RabbitMQ: reports.generation (receipt PDF)
  → Audit log: billing:payment
```

**Modules:** `BillingModule`, `ReportsModule`, `AuditModule`
**Async:** Receipt generation via RabbitMQ

---

## 9. Emergency Intake

```
Emergency patient arrives
  → POST /queues/check-in (priority: emergency)
  → Patient inserted at front of queue
  → Socket.IO: emergency:alert broadcast (hospital-wide)
  → Assigned emergency doctor notified
  → Fast-track consultation workflow begins
```

**Modules:** `QueuesModule`, `EventsModule`, `ClinicalModule`
**Realtime:** Emergency broadcast channel

---

## 10. Audit Review (Admin)

```
Admin opens audit dashboard
  → GET /audit/logs?entity=patient&from=2026-07-01&to=2026-07-08
  → Filtered audit entries returned
  → Admin reviews actions by user, entity, date range
```

**Modules:** `AuditModule`
**Data:** `audit_logs` table (partitioned by month in production)

---

## Workflow ↔ Infrastructure Matrix

| Workflow | PostgreSQL | Redis | RabbitMQ | Socket.IO |
|----------|-----------|-------|----------|-----------|
| Authentication | ✅ | ✅ sessions | — | — |
| Patient registration | ✅ | ✅ cache | — | — |
| Appointment booking | ✅ | — | ✅ reminders | — |
| Walk-in queue | ✅ | — | — | ✅ |
| Consultation | ✅ | — | — | — |
| Lab processing | ✅ | — | ✅ | ✅ notify |
| Pharmacy | ✅ | ✅ cache | — | — |
| Billing | ✅ | — | ✅ reports | — |
| Emergency | ✅ | — | — | ✅ broadcast |
| Audit review | ✅ | — | — | — |

## Related Documents

- [FEATURES.md](./FEATURES.md)
- [API_REFERENCE.md](./API_REFERENCE.md)
- [MODULES.md](./MODULES.md)
