# Modules

NestJS modules organized by **hospital function**. Each module has empty controllers, services, and DTO folders — business logic is not implemented yet.

## Application Entry

```
apps/api/src/
├── main.ts
├── app.module.ts
├── app.controller.ts      # GET /api/health
└── app.service.ts
```

`AppModule` imports all feature modules. API prefix: `/api` (configurable via `API_PREFIX`).

---

## Infrastructure

| Module | Path | Description |
|--------|------|-------------|
| **Config** | `config/` | Split config: `app`, `database`, `redis`, `jwt`, `storage`, `queue` |
| **Prisma** | `prisma/` | Global Prisma client lifecycle |
| **Common** | `common/` | Shared decorators, guards, interceptors, filters, pipes, constants, enums, utils |

### Role Constants

`common/constants/roles.constants.ts` — 27 system roles (`SUPER_ADMIN` through `PATIENT`).

---

## Foundation Modules

| Module | Route Prefix | Files |
|--------|-------------|-------|
| **AuthModule** | `/auth` | controller, service, `strategies/`, `guards/`, `dto/` |
| **UsersModule** | `/users` | controller, service, `dto/` |
| **RolesModule** | `/roles` | controller, service, `dto/` |
| **PermissionsModule** | `/permissions` | controller, service, `dto/` |
| **AuditModule** | `/audit` | controller, service, `dto/` |
| **SystemSettingsModule** | `/system-settings/*` | departments, branches, service-types, workflow-settings controllers |

---

## Patient & Scheduling

| Module | Route Prefix | Controllers |
|--------|-------------|-------------|
| **PatientsModule** | `/patients` | patients |
| **RecordsModule** | `/records` | records |
| **AppointmentsModule** | `/appointments` | appointments |
| **QueuesModule** | `/queues` | queues |

---

## Clinical & Care

| Module | Route Prefix | Controllers |
|--------|-------------|-------------|
| **ClinicalModule** | sub-routes | encounters, diagnoses, clinical-notes, prescriptions, referrals, observations, care-plans |
| **NursingModule** | `/nursing` | nursing |
| **AdmissionsModule** | `/admissions/*` | admissions, wards, beds |
| **DischargeModule** | `/discharge` | discharge |
| **PsychiatryModule** | `/psychiatry/*` | opc, psychology, child-adolescent, addiction-rehab, psychogeriatrics |
| **AlliedHealthModule** | `/allied-health/*` | physiotherapy, speech-therapy, nutrition, social-work |
| **IcuModule** | `/icu` | icu |

### Clinical Submodules

```
clinical/
├── clinical.module.ts
├── encounters/
├── diagnoses/
├── clinical-notes/
├── prescriptions/
├── referrals/
├── observations/
└── care-plans/
```

Each submodule has its own controller and service.

---

## Diagnostics & Pharmacy

| Module | Route Prefix | Controllers |
|--------|-------------|-------------|
| **LaboratoryModule** | `/laboratory/*` | requests, results, samples |
| **RadiologyModule** | `/radiology/*` | radiology, imaging, ecg |
| **PharmacyModule** | `/pharmacy/*` | pharmacy, dispensing, inventory |

---

## Finance & Operations

| Module | Route Prefix | Controllers |
|--------|-------------|-------------|
| **BillingModule** | `/billing/*` | billing, invoices, service-pricing |
| **CashierModule** | `/cashier/*` | cashier, payments |
| **FinanceModule** | `/finance/*` | finance, revenue, claims |
| **InsuranceModule** | `/insurance/*` | nhia, hmo, claims |
| **InventoryModule** | `/inventory/*` | inventory, stock, procurement |

---

## Reporting & Platform

| Module | Route Prefix | Services |
|--------|-------------|----------|
| **ReportsModule** | `/reports` | reports, clinical-reports, financial-reports, operational-reports |
| **AnalyticsModule** | `/analytics` | analytics |
| **NotificationsModule** | `/notifications` | notifications, sms, email |
| **FilesModule** | `/files` | files, storage |
| **RealtimeModule** | WebSocket `/events` | realtime gateway + service |

---

## Governance & Administration

| Module | Route Prefix | Controllers |
|--------|-------------|-------------|
| **SuperAdminModule** | `/super-admin` | super-admin |
| **GovernanceModule** | `/governance/*` | board, cmd |
| **AdministrationModule** | `/administration` | administration |
| **HrModule** | `/hr/*` | hr, staff, students |

---

## Future Modules (Not Scaffolded)

See `apps/api/src/future-modules/README.md`:

- Transportation, Laundry, Kitchen, Maintenance
- Facility Management, Security, Mortuary
- Procurement, Asset Management

---

## Module Rules

1. **One hospital function per module** — not one module per dashboard role.
2. **Export services** for cross-module use; never import another module's controller.
3. **DTOs** live in the module's `dto/` folder.
4. **Guards/decorators** shared via `common/`.
5. **Register new modules** in `app.module.ts` and update docs.

## Adding a New Module

```bash
# From repo root
nest g module <name> --path apps/api/src
nest g controller <name> --path apps/api/src/<name>
nest g service <name> --path apps/api/src/<name>
```

Then update `app.module.ts`, `docs/MODULES.md`, and `docs/FEATURES.md`.

## Related Documents

- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)
- [DATABASE.md](./DATABASE.md)
- [API_REFERENCE.md](./API_REFERENCE.md)
