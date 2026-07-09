# Workflows

Core hospital business workflows. Each workflow maps to one or more API modules and may involve async messaging or realtime updates.

## 1. Staff Authentication

```
Receptionist opens app
  → POST /auth/login (email + password)
  → Server validates bcrypt hash
  → Issues access JWT (15m) + refresh token (7d, stored in DB)
  → Client stores tokens
  → Subsequent requests use Authorization: Bearer header
  → On 401, client calls POST /auth/refresh
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
Doctor opens patient from queue or appointment list
  → GET /patients/:id (demographics, allergies, history)
  → Records consultation notes (POST /encounters)
  → Records vitals if needed (POST /vitals)
  → Orders lab tests (POST /lab/orders)
  → Writes prescription (POST /prescriptions)
  → Each action → audit log entry
```

**Modules:** `ClinicalModule`, `LabModule`, `PharmacyModule`, `AuditModule`

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
Pharmacist views pending prescriptions
  → GET /prescriptions?status=pending
  → Verifies drug availability in inventory
  → POST /dispensations (prescriptionId, quantity)
  → Inventory decremented
  → Prescription status: dispensed
  → Audit log: pharmacy:dispense
  → If low stock → BullMQ job → alert notification
```

**Modules:** `PharmacyModule`, `AuditModule`

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
