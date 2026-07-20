# Nursing Module — Audit & E2E Tracker

**Last audited / updated:** 2026-07-15  
**Frontend:** `fnph-aro` — `/dashboard/nurse/*`  
**Backend:** `HMS-BACKEND` — `/api/nursing/*`, `/api/admissions/*`, bridge routes under `/api/prescriptions`, `/api/laboratory/*`, `/api/pharmacy/dispensing`

Source of truth for nursing completeness: E2E status, audit findings, and phased roadmap.

---

## Executive summary

| Band | Count | Meaning |
|------|------:|---------|
| **E2E API live** | **All ward nursing surfaces** | Queues, admissions, care docs, orders/tasks/MAR/samples, shifts/handover/ICU, comms/reports/analytics when `VITE_USE_API=true` |
| **Local IndexedDB fallback** | Same pages | Used when API mode is off (ICU/shifts/comms still have lightweight local/demo fallbacks) |
| **Deferred full domains** | Clinical / pharmacy / lab product modules | Thin bridges write nursing-ops tables until dedicated schemas land (ADR-012) |

**Phases 0–12:** ✅ **Complete** for nursing E2E.

---

## E2E complete (mark done)

### Phase 0–6 — OPD Patient Queues

| Feature | Status |
|---------|--------|
| `GET/PATCH /api/nursing/patient-queues*` | ✅ |
| Frontend `/dashboard/nurse/queues` | ✅ |
| SearchableSelect on nursing | ✅ |
| Docs / ADR-011 | ✅ |

### Phase 7 — Frontend hygiene

| Item | Status |
|------|--------|
| External Meds → `addExternalMed` (local) + API dual-path | ✅ |
| Observation → `addObservation` + API when on | ✅ |
| Handover Submit → `submitHandover` (local) + API | ✅ |
| Bedside Incident → `/incidents` | ✅ |
| `/nok` redirects to Records directory | ✅ |
| Dashboard / Admissions View deep-link Workspace | ✅ |

### Phase 8 — Admissions foundation E2E

| Item | Status |
|------|--------|
| Prisma: `WARDS`, `BEDS`, `ADMISSIONS` | ✅ |
| Permissions: `admission:create\|read\|update` | ✅ |
| `/api/admissions*` + frontend wire | ✅ |

### Phase 9 — Care documentation E2E

| Item | Status |
|------|--------|
| Prisma nursing-care models | ✅ |
| Notes / vitals / care plans / obs / incidents / forms / timeline / alerts | ✅ |
| Frontend dual-path clients | ✅ |

### Phase 10 — Orders, tasks, MAR, samples E2E

| Item | Status |
|------|--------|
| Clinical prescriptions + Pharmacy + Lab **bridge** APIs (ADR-012) | ✅ |
| Nurse orders acknowledge + tasks API | ✅ |
| MAR administer/refuse/miss/hold (+ dispense) API | ✅ |
| Sample collection against lab orders | ✅ |
| Wire Orders / Tasks / MAR / Samples / External Meds to REST | ✅ |

### Phase 11 — Shifts, handover API, ICU E2E

| Item | Status |
|------|--------|
| Shift roster + clock API | ✅ |
| Handover submit/ack API | ✅ |
| ICU board / observations / infusions API | ✅ |
| Wire Shifts / Handover / ICU pages | ✅ |

### Phase 12 — Comms, reports, analytics E2E

| Item | Status |
|------|--------|
| Messaging / reports / analytics APIs | ✅ |
| Wire Comms / Reports / Analytics | ✅ |

---

## Frontend clients

| Client | Role |
|--------|------|
| `src/lib/api/nursing.ts` | Patient queues (+ re-exports care + ops) |
| `src/lib/api/nursing-care.ts` | Care documentation |
| `src/lib/api/nursing-ops.ts` | Orders, tasks, MAR, samples, shifts, handover, ICU, comms, reports, analytics |
| `src/lib/api/admissions.ts` | Wards / beds / admissions |
| `src/components/ui/searchable-select.tsx` | Shared searchable dropdown |

---

## Page status (post Phases 0–12)

| Page | Route | Status |
|------|-------|--------|
| Resident Queues | `/queues` | ✅ API E2E |
| Workspace | `/workspace` | ✅ API notes + admission context |
| Notes / Vitals / Care Plan / Observation / Forms / Incidents | … | ✅ API / local |
| External Meds | `/external-meds` | ✅ API MAR external / local |
| Orders | `/orders` | ✅ API / local |
| Tasks | `/tasks` | ✅ API / local |
| MAR | `/mar` | ✅ API (give/refuse/miss/hold) / local |
| Samples | `/samples` | ✅ API / local |
| Admissions / Discharge | … | ✅ API / local |
| Timeline / Alerts | … | ✅ API aggregate / demo off |
| Shifts | `/shifts` | ✅ API clock / light local demo |
| Handover | `/handover` | ✅ API / local |
| ICU | `/icu` | ✅ API board; mock beds if ICU empty |
| Comms | `/comms` | ✅ API messages (+ mark-read) / seed local |
| Reports | `/reports` | ✅ API generate/list; PDF/print still client toast |
| Analytics | `/analytics` | ✅ API summary / demo tiles off |
| NOK | `/nok` | ✅ Redirects to Records |
| Bedside | `/mobile` | ✅ Deep-links |

---

## Verify Phases 10–12

1. `npm run prisma:migrate:deploy` then `npm run prisma:seed` (seeds demo lab+drug order/MAR/task when no orders exist).  
2. `VITE_USE_API=true` + API base URL.  
3. Login `nurse@fnpharo.gov.ng` / `password`.  
4. **Orders** — see seeded lab/drug; Acknowledge creates a task.  
5. **MAR** — give / refuse / miss / hold on due Sertraline (or create via `POST /api/prescriptions`).  
6. **Samples** — collect on payment-cleared lab order.  
7. **Shifts** — Start / End shift; status `Active` / `Ended`.  
8. **Handover** — submit + acknowledge.  
9. **ICU** — board from ICU admissions; add note/infusion.  
10. **Comms / Reports / Analytics** — message send, generate report, summary tiles.  
11. Optional bridges: `POST /api/prescriptions`, `POST /api/laboratory/requests`, `POST /api/pharmacy/dispensing/:marId/dispense`.  
12. `VITE_USE_API=false` — local fallback still works.

---

## Related docs

- [API_REFERENCE.md](./API_REFERENCE.md)  
- [WORKFLOWS.md](./WORKFLOWS.md)  
- [DECISIONS.md](./DECISIONS.md) — ADR-011, ADR-012  
- [FEATURES.md](./FEATURES.md)  
- [DATABASE.md](./DATABASE.md)  
- [CHANGELOG.md](./CHANGELOG.md)  

---

## Change log (this tracker)

| Date | Change |
|------|--------|
| 2026-07-15 | Patient Queues Phases 0–6 completed |
| 2026-07-15 | Full module audit; Phases 7–12 backlog |
| 2026-07-15 | **Phases 7–9 completed E2E** — hygiene, admissions + care docs |
| 2026-07-15 | **Phases 10–12 completed E2E** — nursing-ops APIs, clinical/pharmacy/lab bridges, frontend dual-path, seed demo, docs / ADR-012 |
