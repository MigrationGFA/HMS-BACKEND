# Phase 1 Acceptance Report (sections A–J)

**Date:** 2026-09-23  
**Repos:** `docs/NEW-PHASE-1.md` living tracker  
**Codebases:** HMS-BACKEND + fnph-aro

---

## A. Existing Functionality

- Public marketing site shell (`/`, `/about`, `/services`, `/departments`, `/doctors`, `/news`, `/careers`, `/contact`, `/appointment`)
- Public booking APIs (`/api/appointments/public/*`, bookable services)
- Patient portal (`/api/portal/*`, `/dashboard/patient/*`)
- Doctor clinical + appointments + telemedicine UI shell
- Cashier + Finance UIs; Records check-in/bookings; HR module; Audit logs; Files/storage

## B. Reused Functionality

- Public booking engine (PHYSICAL | ONLINE) without rebuild
- Records frontdesk check-in / bookings APIs
- Cashier booking payment confirmation paths
- Finance payments / reports screens
- HR staff, attendance, leave, performance, payroll APIs
- Users search + role assignment surfaces; AuditService
- StorageService for CMS media uploads
- `RequireRole`, DashboardLayout, portal appointment list UI

## C. New Implementation

- Phase 1 module registry (`fnph-aro/src/lib/phase1/modules.ts`) + `RequireModule` / `Phase1RouteGuard`
- Backend `SYSTEM_SETTINGS` + `GET/PATCH /api/system-settings/phase-modules`
- Marketing CMS: `SITE_PAGES` / `SITE_SECTIONS` / `SITE_MEDIA` + Nest `CmsModule`
  - Public `GET /api/public/site/:slug`
  - Admin `/api/cms/*` CRUD + media upload
- Super Admin Phase 1 pages: CMS, Module Allocation, live Audit
- `SERVICE_BOOKINGS.MEETING_URL` + `PATCH /api/appointments/bookings/:id/meeting-url`
- NeuroAro brand constants + static site content fallbacks
- FE API clients: `phaseModules`, `cms`, `appointmentsStaff`

## D. Modified Functionality

- `brand.ts`, SiteHeader/Footer/HeroBanner, Home/About copy → NeuroAro / FNPH Aro
- Appointment page: doctor deep-link query params, PHYSICAL vs ONLINE copy, pay-at-hospital note
- Doctors page: book deep-link with doctor/department query
- DashboardLayout: Phase 1 nav filter + NeuroAro sidebar label
- rolePaths: finance / records / superadmin homes
- AuthContext: sync phase-modules after login/restore
- Cashier / Records / Finance / Doctor clinical nav trimmed for Phase 1
- Patient booking history: Join meeting column for ONLINE + `meetingUrl`
- Doctor telemedicine: Phase 1 external-link messaging
- Permissions: `phase-modules:*`, `cms:*`
- App.tsx: Phase1RouteGuard wrapper + CMS/modules/audit routes

## E. Hidden Functionality (not deleted)

- Lab, Pharmacy, Nursing, Radiology, Fleet, Stores, SCM, Nutrition, ICU, Psych OPC mega-modules
- Doctor demos: CDS, research, cross-dept, AI path prefixes (`doctor_demos`)
- HR extended: recruitment, exit, retirement, training, compliance (`hr_extended`)
- Super Admin demos: IAM, MPI, portal, scheduling hubs (`admin_demos`)
- Generic staff/student dashboards; billing mega; HMS identity demos

## F. Database Changes

Additive only:

1. `20260923120000_phase1_system_settings` — `SYSTEM_SETTINGS` + phase_modules seed  
2. `20260923130000_phase1_cms` — `SITE_PAGES`, `SITE_SECTIONS`, `SITE_MEDIA` + seed pages  
3. `20260923140000_booking_meeting_url` — `SERVICE_BOOKINGS.MEETING_URL`

```text
No destructive database changes were made.
```

## G. Routes Added/Modified

| Route | Change |
|---|---|
| `/dashboard/superadmin/cms` | Added (CMS admin) |
| `/dashboard/superadmin/modules` | Added (module allocation) |
| `/dashboard/superadmin/audit` | Switched to live audit API page |
| All `/dashboard/*`, `/hms/*`, `/billing/*`, `/consultation/*`, `/pharmacy/*`, `/records/*` | Gated by `Phase1RouteGuard` |
| `/api/system-settings/phase-modules` | Added |
| `/api/public/site/:slug` | Added |
| `/api/cms/*` | Added |
| `/api/appointments/bookings` | Added staff list |
| `/api/appointments/bookings/:id/meeting-url` | Added |

## H. Permissions Added/Modified

- `phase-modules:read` / `phase-modules:update` (FULL_ACCESS roles via SUPER_ADMIN/IT/ADMIN/CMD)
- `cms:read` / `cms:update` (same)
- Existing `audit:read`, `encounter:read|update` reused for audit list and meeting URL

## I. Testing

| Flow | Status |
|---|---|
| Registry blocks lab/pharmacy/fleet URLs | ✅ implemented (manual verify after migrate) |
| Phase 1 nav filter on dashboards | ✅ implemented |
| Marketing brand + fallbacks | ✅ implemented |
| CMS API + admin UI + public GET | ✅ implemented (needs migrate + seed) |
| PHYSICAL booking UX + payment note | ✅ implemented |
| ONLINE meeting URL BE + patient Join column | ✅ implemented |
| Records/Cashier/Finance/Doctor Phase 1 navs | ✅ implemented |
| HR core vs extended hide | ✅ via registry |
| Admin CMS / modules / audit | ✅ implemented |
| Full E2E against live DB | ⬜ requires `prisma migrate deploy` + API/FE running |

## J. Potential Risks

- Migrations must be applied before CMS/phase-modules/meeting-url work in a live environment
- Super Admin still has many demo routes registered; they are gated/hidden but pages remain on disk
- Doctor telemedicine UI still uses local dummy sessions for embedded demo; API meeting-url is wired for real `ServiceBookings` — connect list UI to `listStaffBookings` for full ONLINE E2E polish
- Public CMS GET returns 404 if page not PUBLISHED — FE falls back to static content
- Embedded video remains **Pending Integration** by design
