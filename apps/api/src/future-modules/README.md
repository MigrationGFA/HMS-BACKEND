# Future Modules

These hospital functions are **planned** but not yet scaffolded. They will be added as separate NestJS modules when requirements are defined.

| Module | Description |
|--------|-------------|
| **Transportation** | Ambulance dispatch, patient transfers, fleet scheduling |
| **Laundry** | Linen tracking, wash cycles, department distribution |
| **Kitchen** | Diet orders, meal planning, nutrition service integration |
| **Maintenance** | Equipment maintenance requests, work orders, downtime tracking |
| **Facility Management** | Building spaces, utilities, environmental services |
| **Security** | Access control, incident reporting, visitor management |
| **Mortuary** | Deceased patient intake, storage, release workflows |
| **Procurement** | Purchase requests, vendor management, purchase orders |
| **Asset Management** | Medical equipment registry, depreciation, calibration schedules |

## Guidelines for Adding Future Modules

1. Create module under `apps/api/src/<module-name>/` following existing conventions.
2. Organize by **hospital function**, not dashboard role.
3. Register the module in `app.module.ts`.
4. Update `docs/MODULES.md`, `docs/FEATURES.md`, and `docs/CHANGELOG.md`.
5. Add Prisma models via migration before implementing business logic.
