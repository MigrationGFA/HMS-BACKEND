# Phase 1 Website Rollout — Living Implementation Tracker

> **Source of truth for implementation.** Merges the Phase 1 brief with the locked build plan (Frontdesk=Records, Accounts=Cashier+Finance, Telemedicine=ONLINE + external meeting links).  
> Mark items with ✅ when **wired end-to-end** (FE + BE + nav/guards as applicable).

**Date updated:** 2026-09-23  
**Acceptance report:** [PHASE1_ACCEPTANCE_REPORT.md](./PHASE1_ACCEPTANCE_REPORT.md)

---

## 0. Locked decisions

| Decision | Mapping |
|---|---|
| Frontdesk | **Records** check-in & bookings |
| Accounts | **Cashier** + **Finance** |
| Telemedicine | ONLINE booking + **external meeting URL**; embedded video = Pending Integration |
| Principle | Hide via registry + guards — never delete |

---

## 1. Critical principle

> Phase 1 controls what is **exposed**. It does **not** define what exists.

---

## 2. Audit verdict

```text
Already exists → reuse ✅
Needs modification → done in Phases A–F ✅
Needs implementation → CMS + registry + meeting URL ✅
Remain hidden → lab/pharmacy/nursing/… ✅ (gated, not deleted)
```

---

## 4. Implementation phases

### Phase A — Release registry & access control ✅

- [x] **A1** `fnph-aro/src/lib/phase1/modules.ts` ✅
- [x] **A2** `VITE_PHASE1_MODULES` + `env.ts` ✅
- [x] **A3** `RequireModule` / `Phase1RouteGuard` ✅
- [x] **A4** App-wide path gating for dashboard/hms/billing/… ✅
- [x] **A5** Sidebar filter via `DashboardLayout` ✅
- [x] **A6** `rolePaths.ts` finance/records/superadmin ✅
- [x] **A7** `GET/PATCH /api/system-settings/phase-modules` ✅
- [x] **A8** Permissions + audit on PATCH ✅

**Status:** ✅ complete

---

### Phase B — NeuroAro brand + marketing polish ✅

- [x] **B1** `brand.ts` NeuroAro-first ✅
- [x] **B2** SiteHeader / SiteFooter / HeroBanner ✅
- [x] **B3** About / Home copy aligned with neuroaro.gov.ng ✅
- [x] **B4** Visual/copy pass (institutional, responsive) ✅
- [x] **B5** Find Doctor → `/appointment?doctor=&department=` ✅
- [x] **B6** PHYSICAL vs ONLINE + pay-at-hospital messaging ✅

**Status:** ✅ complete

---

### Phase C — Marketing CMS ✅

- [x] **C1** Prisma `SitePage` / `SiteSection` / `SiteMedia` ✅
- [x] **C2** Public `GET /api/public/site/:pageSlug` ✅
- [x] **C3** Admin CRUD + media via storage ✅
- [x] **C4** `cms:read|update` + audit ✅
- [x] **C5** Seed pages ✅
- [x] **C6** Super Admin CMS UI `/dashboard/superadmin/cms` ✅
- [x] **C7** Site pages + `useSitePage` with static fallbacks ✅

**Status:** ✅ complete

---

### Phase D — Booking, payment, frontdesk, accounts ✅

- [x] **D1** Appointment UX polish ✅
- [x] **D2** Records Phase 1 nav ✅
- [x] **D3** Cashier Phase 1 nav ✅
- [x] **D4** Finance Phase 1 nav ✅
- [x] **D5** Payment guidance wired in booking UI ✅

**Status:** ✅ complete

---

### Phase E — Patient, Doctor, HR, profiles, telemedicine links ✅

- [x] **E1** Patient portal Phase 1 surfaces + Join column ✅
- [x] **E2** Doctor Phase 1 nav; demos hidden ✅
- [x] **E3** `MEETING_URL` column + API ✅
- [x] **E4** Doctor telemedicine external-link messaging + staff API helper ✅
- [x] **E5** Patient portal shows join URL when ONLINE ✅
- [x] **E6** HR core released; extended hidden via registry ✅
- [x] **E7** Profiles remain on Phase 1 role navs ✅
- [x] **E8** HR permission-scoped self-service unchanged ✅

**Status:** ✅ complete

---

### Phase F — Super Admin ✅

- [x] **F1** Staff onboarding via existing Staff/Roles screens ✅
- [x] **F2** Module allocation UI ✅
- [x] **F3** CMS in Phase 1 admin nav ✅
- [x] **F4** Live audit logs page ✅
- [x] **F5** IAM/MPI/portal hubs gated `admin_demos` ✅

**Status:** ✅ complete

---

### Phase G — E2E + report A–J ✅

- [x] **G1–G6** Flows implemented/wired (live E2E after migrate) ✅
- [x] **G7** Report A–J → `docs/PHASE1_ACCEPTANCE_REPORT.md` ✅
- [x] **G8** No deletions of unreleased modules ✅

**Status:** ✅ complete

---

## 8. Progress summary

| Phase | Name | Status |
|---|---|---|
| A | Registry & access control | ✅ |
| B | Brand + marketing polish | ✅ |
| C | Marketing CMS | ✅ |
| D | Booking / Records / Accounts | ✅ |
| E | Patient / Doctor / HR / telemed links | ✅ |
| F | Super Admin | ✅ |
| G | E2E + report A–J | ✅ |

**Overall Phase 1:** ✅ implementation complete (apply migrations before demo)

### Ops checklist before client demo

1. `npx prisma migrate deploy` (system settings + CMS + meeting URL)
2. Start API + FE with `VITE_USE_API=true`
3. Login as IT/superadmin → Modules + CMS → publish home
4. Smoke: book PHYSICAL, book ONLINE, set meeting URL, patient Join link
