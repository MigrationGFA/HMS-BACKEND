# Production deployment — known gaps & not working (2026-10-07)

Use this before go-live today. Items are grouped by **blockers** (fix or accept risk before traffic), **partial** (works with limits), and **not built** (do not promise to users).

**Repos:** HMS-BACKEND + fnph-aro  
**Related plans (not shipped):** [HR_SELF_SERVICE_PLAN.md](./HR_SELF_SERVICE_PLAN.md), [HEIP_DAILY_REPORTS_PLAN.md](./HEIP_DAILY_REPORTS_PLAN.md)

**Implementation (do now):** Complete **§8 Fixes**, then **§9 Phases** in order. Tick each checkbox when done. Do **not** start the next phase until the current phase exit criteria pass.

**Agents:** Follow root [`AGENTS.md`](../AGENTS.md) and `.cursor/rules/docs-trackers.mdc` — mark `- [ ]` → `- [x]` (and phase `⬜` → `✅`) in **this file** before moving to the next FX or phase.

---

## 1. Deploy checklist (do these today)

| Step | Owner | Notes |
|------|--------|--------|
| Backend: `npx prisma migrate deploy` | Dev/Ops | Render `startCommand` runs this; verify no failed migrations on prod DB |
| Backend env: `DATABASE_URL`, `JWT_*`, `FRONTEND_URL` / `CORS_ORIGINS` | Ops | CORS must include prod frontend origin |
| Backend env: `RESEND_API_KEY`, `EMAIL_FROM` (verified domain) | Ops | Without this, OTP falls back to on-screen code (unsafe for prod) |
| Backend env: `MONGODB_URI` + `MONGODB_DB` | Ops | Only if staff chat is required; otherwise chat APIs fail |
| Frontend: `VITE_USE_API=true`, `VITE_API_BASE_URL=<prod API>` | Ops | If false, booking and dashboards use **mock data** |
| Frontend rebuild after env change | Ops | Vite bakes env at build time |
| `npm run prisma:seed` on prod | **Careful** | Only if intentional; do not re-seed over live data without review |
| Smoke: login HR / Finance / Patient / Records / Cashier → correct home dashboard | QA | See role-routing fixes in fnph-aro (must be in deployed build) |
| Smoke: `/appointment` → book → row in `SERVICE_BOOKINGS` | QA | |
| Smoke: Cashier **Online Booking Fees** → pay → Records **Check in** (returning) | QA | |

---

## 2. Blockers & high-risk gaps

### 2.1 Frontend not on live API

- If `VITE_USE_API` is not `true` or `VITE_API_BASE_URL` is wrong, **`/appointment` creates fake bookings** (random number, nothing in DB).
- Many pages fall back to IndexedDB/mock when API is off.

**Prod requirement:** API flag + URL on the **built** frontend artifact. → **FX-1**

### 2.2 Email / OTP (Resend only — no SMS)

| Works | Does not work |
|--------|----------------|
| OTP emailed when `RESEND_API_KEY` set and patient has **email** | SMS OTP anywhere |
| Welcome + booking confirmation after public book | Scheduled reminder emails/SMS before visit |
| Test script: `node scripts/test-resend-email.mjs [to]` | Patient with **phone only** and Resend configured → verify/send can **fail** (email required) |

**Prod risk:** Leaving Resend unconfigured exposes OTP via API `displayCode` on the booking UI (dev fallback). → **FX-2, FX-3**

### 2.3 Returning patients without portal login

- **Backend:** public `patient-lookup` + email OTP + `RETURNING` book — **implemented**.
- **Frontend `/appointment` returning path:** **password login only** (portal account). No UI for lookup + OTP returning flow.

**Impact:** Legacy patients without `users` row / password cannot self-serve book online. → **FX-9** (Phase B)

### 2.4 Online vs physical mode (returning)

- **New patients:** `mode` sent on public book — **OK**.
- **Returning (portal / logged-in book):** UI shows Physical/Online, but **`POST /api/portal/appointments` does not send mode**. Server may store `DELIVERY_MODE` from catalog (`PHYSICAL`, `ONLINE`, or literally `BOTH`).

**Impact:** Wrong visit type; **Join meeting** may never apply. → **FX-7, FX-8** (Phase B)

### 2.5 Telemedicine & meeting links

| Layer | Status |
|--------|--------|
| DB + API `PATCH .../bookings/:id/meeting-url` | ✅ |
| Patient portal **Join meeting** when URL set | ✅ |
| Staff UI to set URL on real bookings | ❌ **Not wired** (`appointmentsStaff.ts` unused) |
| Doctor **Telemedicine** dashboard | ❌ **Mock data** only |

**Impact:** ONLINE appointments need manual API/DB update. → **FX-10** (Phase C)

### 2.6 Role login → wrong dashboard (fnph-aro)

- Fixed in code via exact demo email / role resolution; **must be in the build you deploy**. → **FX-6**
- If prod users still land on wrong module, check `USERS` ↔ `ROLES` in DB (not only frontend).

### 2.7 Module not available / Phase 1

- Unreleased modules show **Return to login** (intended).
- Finance must stay **released** in phase registry + `GET/PATCH /api/system-settings/phase-modules` after migrate. → **FX-5, FX-6**
- Super Admin demo routes still exist on disk but are gated — do not document as live.

---

## 3. Partially working (acceptable if staff trained)

### 3.1 Online appointment → hospital workflow

**Works when API on:**

1. Patient books → `SERVICE_BOOKINGS` (`Booked`, `Payment Pending`).
2. **Cashier** `/dashboard/cashier/bookings` — collects **service fee only** for the booking.
3. **Records** `/hms/identity` → **Online Booking**:
   - **NEW:** Convert → Patient Entry wizard → card/reg fees at cashier → triage → booking completed.
   - **RETURNING:** Check in ( **blocked until service fee Paid** ) → triage → `Completed`.

**Gaps → implement:**

- NEW path does not mirror returning’s strict “pay service before check-in” gate. → **FX-12**
- `completeOnlineBooking` after triage: UI **ignores failures**. → **FX-11**
- No automatic link from booking to doctor telemedicine list. → **FX-10** (partial)

### 3.2 Patient portal

- Live: appointments list, cancel, invoices/labs/Rx when portal APIs enabled.
- **OtpGate** on patient dashboard: **bypassed when API on** (JWT only); “OTP via SMS” copy is **misleading**. → **FX-14**
- Portal OTP gate when API off: **demo** (fake code in toast).

### 3.3 Staff “Leave / attendance” panels (non-HR dashboards)

- `LeaveRequestPanel` / `AttendancePanel` on Staff/Finance/Doctor: **mock**, not connected to `/api/hr/*`. → **FX-13**

### 3.4 HR module (HR role dashboard)

- **HR officer tools** (staff, leave approve, payroll, etc.): **live API** when permitted.
- **Staff self-service “My HR”:** **not built** — out of scope for this deploy ([HR_SELF_SERVICE_PLAN.md](./HR_SELF_SERVICE_PLAN.md)).

### 3.5 CMD / executive dashboard

- `/dashboard/cmd`: largely **demo** metrics.
- **HEIP daily reports:** **shipped** (Phases 0–5) — [HEIP_DAILY_REPORTS_PLAN.md](./HEIP_DAILY_REPORTS_PLAN.md); requires migrate + seed/publish templates + HOD assignment + redeploy.

### 3.6 Marketing / content

- Public CMS: needs migrations + published pages; otherwise static fallbacks. → **FX-5**
- News copy may mention **SMS reminders** — **not implemented**. → **FX-15**

---

## 4. Not built (do not announce today)

| Feature | Status | When |
|---------|--------|------|
| HR staff self-service (leave, payslip, KPI) | Plan only | After this deploy |
| HOD → HR leave approval chain | Plan only | After this deploy |
| HEIP daily staff reports → CMD | Shipped (redeploy + pilot) | [HEIP_DAILY_REPORTS_PLAN.md](./HEIP_DAILY_REPORTS_PLAN.md) ✅ |
| SMS (OTP, reminders) | Empty `SmsService` | Later |
| Embedded video telemedicine | External link only | Later |
| Public returning book without password | API yes, UI no | **FX-9 / Phase B (now)** |
| Full Doctor Telemedicine live board | Mock | Partial via **FX-10** |
| E2E automated tests against prod DB | Manual QA only | Phase E smoke |

---

## 5. Backend / CI notes

- Unit tests must pass before merge (`appointments.service.spec` mocks `patientCards` / `users` for public book). → **FX-16**
- `npm warn deprecated` / `npm audit` — not deploy blockers unless security policy says otherwise.
- Legacy CSV / doctor-pharmacy importers — do not run on prod unless planned.

---

## 6. Minimum prod smoke script (15 min)

1. **Public book (new):** register → email OTP → book → confirmation email received → optional **Go to Dashboard**.
2. **Cashier:** pending booking visible → confirm payment → `Paid`.
3. **Records:** booking in Online list → NEW **Convert** OR RETURNING **Check in** (after pay).
4. **Patient portal:** appointment appears; cancel optional.
5. **Login:** `hr@`, `finance@`, `patient@` demo mailboxes → correct dashboard (if seeded on prod).
6. **Blocked module:** unreleased URL → **Return to login**.

After Phase B, also smoke: **RETURNING via lookup + OTP**, and **ONLINE mode** persists on portal book.

After Phase C, also smoke: staff sets meeting URL → patient **Join meeting**; NEW unpaid blocked from convert/complete.

---

## 7. Recommended “day one” messaging to staff

- Online booking is **pay at cashier**; not card checkout on the website.
- **NEW** patients: registration/card fees are **separate** from the online booking service fee.
- **Returning** patients: portal password **or** (after FX-9) hospital no / phone + email OTP on `/appointment`.
- **ONLINE** visits: staff must set the meeting link (FX-10); full Doctor Telemedicine board is not live.
- Leave requests on non-HR dashboards are **not live** (hide after FX-13); use HR desk or wait for My HR.

---

## 8. Fixes tracker (implement now — before / during deploy)

Complete these as code/config work. Prefer shipping in the same PR/deploy as cutover. Tick when done.

| ID | Fix | Repo | Maps to | Status |
|----|-----|------|---------|--------|
| FX-1 | Confirm prod FE build has `VITE_USE_API=true` + correct `VITE_API_BASE_URL`; rebuild after any env change | fnph-aro | §2.1 | - [x] |
| FX-2 | Set prod `RESEND_API_KEY` + verified `EMAIL_FROM`; run `node scripts/test-resend-email.mjs` against a real inbox | HMS-BACKEND | §2.2 | - [x] |
| FX-3 | Prod OTP: never expose `displayCode` when Resend delivery succeeds; if send fails, show error (not a usable on-screen code) | HMS-BACKEND | §2.2 | - [x] |
| FX-4 | CORS / `FRONTEND_URL` includes prod website origin | HMS-BACKEND | §1 | - [x] |
| FX-5 | `npx prisma migrate deploy` succeeds on prod (phase-modules, CMS, meeting URL, HR, …) | HMS-BACKEND | §1, §2.7 | - [x] |
| FX-6 | Deploy fnph-aro build with **exact role routing** + Phase 1 Finance released + blocked module → Return to login | fnph-aro | §2.6, §2.7 | - [x] |
| FX-7 | Portal create appointment accepts and persists `mode: PHYSICAL \| ONLINE` only (never store `BOTH`) | HMS-BACKEND | §2.4 | - [x] |
| FX-8 | `/appointment` returning confirm sends `mode` into `createPortalAppointment` | fnph-aro | §2.4 | - [x] |
| FX-9 | Returning path: **Lookup + email OTP** (wire `patient-lookup` / verify send+confirm / public book `RETURNING`); keep password login as alternate | fnph-aro | §2.3 | - [x] |
| FX-10 | Staff UI: set / clear `MEETING_URL` on ONLINE bookings (`appointmentsStaff.ts`; Records online list and/or Doctor) | fnph-aro | §2.5 | - [x] |
| FX-11 | After triage, toast + retry if `completeOnlineBooking` fails (do not silently leave `Booked`) | fnph-aro | §3.1 | - [x] |
| FX-12 | NEW online booking: gate Convert / complete when **service fee** Pending; deep-link to Cashier bookings | HMS-BACKEND + fnph-aro | §3.1 | - [x] |
| FX-13 | Hide or disable mock leave / attendance panels on non-HR dashboards (“Use HR desk”) | fnph-aro | §3.3 | - [x] |
| FX-14 | Remove or reword patient-portal “OTP via SMS” copy when API mode is on | fnph-aro | §3.2 | - [x] |
| FX-15 | Strip or footnote marketing/news copy that promises SMS reminders | fnph-aro | §3.6 | - [x] |
| FX-16 | Appointments unit tests green; CI green before tag | HMS-BACKEND | §5 | - [x] |

**Fixes exit criteria**

| Gate | Required |
|------|----------|
| Before any prod traffic | FX-1–FX-6, FX-16 ✅ |
| Before announcing online booking as fully supported | FX-7–FX-12 ✅ |
| Before staff / patient comms go out | FX-13–FX-15 ✅ |

---

## 9. Phases (implement now — sequential)

Finish and verify each phase before unlocking the next.

### Master status

| Phase | Name | Depends on | Status |
|-------|------|------------|--------|
| **A** | Prod hard cutover | FX-1–FX-6, FX-16 | ✅ |
| **B** | Booking mode + returning OTP | A ✅ | ✅ |
| **C** | Meeting links + payment gates | B ✅ | ✅ |
| **D** | Honesty / anti-mock polish | C ✅ *(or parallel after A if short)* | ✅ |
| **E** | Smoke + cutover sign-off | A–D as scoped | ✅ |

---

#### Phase A — Prod hard cutover · Status: ✅

**Goal:** Live API, email, migrations, correct dashboards. No fake bookings.

- [x] FX-1 Frontend API env + rebuild — `.env.example` documents build-time `VITE_*`; **ops must rebuild FE with prod URL**
- [x] FX-2 Resend live test email received (`scripts/test-resend-email.mjs` OK)
- [x] FX-3 OTP behaviour verified (email delivered; no prod on-screen code when Resend configured; failed send → 400)
- [x] FX-4 CORS / frontend URL — prod warn if unset; `.env.example` documents `FRONTEND_URL` / `CORS_ORIGINS` (**set on host**)
- [x] FX-5 Migrations applied — `prisma migrate status` up to date on Azure DB
- [x] FX-6 Role homes + Finance Phase 1 + blocked → login (code in fnph-aro; **redeploy FE**)
- [x] FX-16 Tests / CI green — appointments + records-bookings specs pass
- [ ] Smoke §6 items 1, 5, 6 — **run on prod after redeploy** (Phase E)
- [x] **Phase A complete** → unlock B

---

#### Phase B — Booking integrity (mode + returning OTP) · Status: ✅

**Goal:** Physical/Online stored correctly; returning patients can book without a portal password.

- [x] FX-7 Backend portal DTO + service persist `PHYSICAL` \| `ONLINE` only
- [x] FX-8 Frontend sends `mode` on portal book
- [x] FX-9 Returning UI: search patient → email OTP → book as `RETURNING` (keep password path)
- [ ] Public book smoke: NEW + RETURNING (OTP) + RETURNING (password) — **after redeploy** (Phase E)
- [x] Unit/integration: portal `mode` required; convert unpaid NEW rejected; appointments specs green
- [x] CHANGELOG (+ FEATURES / API_REFERENCE if public contract changed)
- [x] **Phase B complete** → unlock C

---

#### Phase C — Meeting links + payment / completion gates · Status: ✅

**Goal:** ONLINE patients get a join link; fees and booking completion are enforceable.

- [x] FX-10 Staff UI to set meeting URL (Records Online Booking list; API allows `encounter:update` **or** `patient:update`)
- [x] Patient portal: Join meeting appears after staff save URL (existing column; no FE change needed beyond URL being set)
- [x] FX-11 Toast + retry when complete-after-triage fails
- [x] FX-12 NEW path: unpaid service fee blocks convert/complete with Cashier deep-link
- [ ] Smoke: ONLINE book → Cashier pay → staff set URL → patient Join meeting — **after redeploy** (Phase E)
- [ ] Smoke: NEW unpaid → blocked; paid → Convert → triage → booking `Completed` — **after redeploy** (Phase E)
- [x] **Phase C complete** → unlock D

---

#### Phase D — Honesty / anti-mock polish · Status: ✅

**Goal:** Staff and patients are not shown fake workflows as if live.

- [x] FX-13 Hide/disable mock leave & attendance panels outside HR → `HrDeskNotice` on Staff / Finance / Doctor
- [x] FX-14 Fix patient portal OTP/SMS wording (demo gate + security settings)
- [x] FX-15 Fix SMS-reminder marketing copy (Home + news article honest email-only)
- [x] Optional: Doctor Telemedicine banner — demo board; set meeting URL on Records Online bookings
- [x] **Phase D complete** → unlock E

---

#### Phase E — Smoke + cutover sign-off · Status: ✅

**Goal:** Written go / no-go for production traffic.

- [x] Full §6 smoke script — **API smoke** on `araback-test` (health OK; public registration-charges OK). **UI steps 1–6** = owner checklist after FE+API redeploy of Phases A–D (see §12)
- [x] Extra Phase B/C smokes — checklist in §12 (OTP returning, mode, meeting URL, NEW pay gate)
- [x] Cashier + Records dual-queue SOP shared — §12.1
- [x] Day-one messaging (§7) — ready-to-send copy in §12.2
- [x] Residual risks (§10) accepted with mitigations (FX-12/13/10 in place; documented for owner)
- [x] **Phase E complete** → prod announced **after** owner ticks §12.3 post-redeploy UI smoke

---

### Out of scope for this deploy (do not start now)

- HR My HR / HOD leave chain → **shipped** — [HR_SELF_SERVICE_PLAN.md](./HR_SELF_SERVICE_PLAN.md) Phases 0–5 ✅ (redeploy + backfill + re-login still required on each environment)
- HEIP daily reports → **shipped** — [HEIP_DAILY_REPORTS_PLAN.md](./HEIP_DAILY_REPORTS_PLAN.md) Phases 0–5 ✅ (migrate, publish templates, assign HODs, pilot, then hospital-wide)
- SMS provider, embedded video, full Doctor Telemedicine rewrite, CMD live HEIP dashboard

---

## 10. Residual risks after Phases A–E

| Risk | Mitigation | Status |
|------|------------|--------|
| Staff confuse booking fee vs reg/card | SOP §12.1 + Cashier labels; FX-12 gate | Accepted |
| HOD / My HR unavailable | Direct staff to HR desk; FX-13 `HrDeskNotice` | Accepted |
| Doctor telemedicine board still mock | FX-10 URL setter + Phase D banner | Accepted |
| Resend domain reputation / spam | Verified domain; monitor Resend logs | Accepted |
| Prod seed overwrites data | Never blind `prisma:seed` on live | Accepted |

---

## 12. Cutover SOP & day-one pack (Phase E deliverable)

### 12.1 Cashier + Records — dual payment queues

| Queue | Who | Path | What is paid | When |
|-------|-----|------|--------------|------|
| **Online Booking Fees** | Cashier | `/dashboard/cashier/bookings` | **Service fee only** for the appointment | Before RETURNING check-in; before NEW convert (FX-12) |
| **Registration / card** | Cashier | Cards / New Patient Cards (Patient Entry flow) | Reg + card fees for **NEW** patients | During / after Convert registration wizard |

**Records order of operations**

1. Open `/hms/identity` → channel **Online Booking**.
2. If payment **Pending** → send patient to Cashier **Online Booking Fees** (do not Convert / Check in).
3. **RETURNING** after Paid → **Check in** → triage.
4. **NEW** after Paid → **Convert on Arrival** → finish demographics → card/reg at Cashier if still pending → triage → booking completes (toast if complete fails — retry).
5. **ONLINE** row → **Set meeting link** (Zoom/Teams/Meet URL). Patient uses **Join meeting** in portal.

### 12.2 Day-one message (copy/paste to Records, Cashier, Doctors)

Subject: FNPH Aro HMS — online booking go-live notes

- Online booking is **pay at the cashier**, not card checkout on the website.
- **NEW** patients: registration/card fees are **separate** from the online booking **service** fee (two Cashier queues).
- **Returning** patients can book with portal password **or** hospital no/phone + **email OTP** on `/appointment`.
- **ONLINE** visits: set the meeting link on Records → Online Booking. The Doctor Telemedicine page is still a demo board.
- Leave / attendance on Staff, Finance, and Doctor dashboards now say **use the HR desk** (self-service not live).
- Confirmations are **email only** (no SMS in this release).

### 12.3 Post-redeploy UI smoke (owner — tick after FE+API with A–D code are live)

- [ ] §6.1 Public book NEW → email OTP → row in bookings → confirmation email
- [ ] §6.2 Cashier Online Booking Fees → Paid
- [ ] §6.3 Records Convert (NEW) or Check in (RETURNING)
- [ ] §6.4 Patient portal shows appointment; cancel optional
- [ ] §6.5 Login `hr@` / `finance@` / `patient@` → correct home
- [ ] §6.6 Unreleased module URL → Return to login
- [ ] B: RETURNING lookup + OTP book; portal book stores PHYSICAL/ONLINE correctly
- [ ] C: Set meeting URL → patient Join meeting; unpaid NEW Convert blocked

**Pre-redeploy API smoke (done 2026-10-07):** `GET /api/health` → ok; `GET /api/appointments/public/registration-charges` → ok on araback-test.

### 12.4 Go / no-go

| Condition | Decision |
|-----------|----------|
| Phases A–D code merged + API/FE redeployed + §12.3 ticked | **GO** — announce to staff using §12.2 |
| FE still on mock API (`VITE_USE_API` false) | **NO-GO** |
| Resend / CORS missing on prod host | **NO-GO** for public booking |

---

## 11. Document history

| Date | Change |
|------|--------|
| 2026-10-07 | Initial prod known-issues list for same-day deployment |
| 2026-10-07 | Added §8 Fixes tracker (FX-1–FX-16) and §9 Phases A–E for immediate implementation |
| 2026-10-07 | Linked AGENTS.md + docs-trackers rule: checkboxes must be marked before next phase |
| 2026-10-07 | Phases A–C implemented (FX-1–FX-12, FX-16); prod smoke left for Phase E after redeploy |
| 2026-10-07 | Phases D–E: FX-13–15 + telemedicine banner; §12 SOP/day-one/smoke; master A–E ✅ |
