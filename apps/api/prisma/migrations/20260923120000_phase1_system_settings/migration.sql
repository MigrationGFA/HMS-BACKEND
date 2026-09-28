-- Additive: key/value system settings for Phase 1 module registry and future flags.
CREATE TABLE IF NOT EXISTS "SYSTEM_SETTINGS" (
  "SETTING_KEY"   VARCHAR(100) PRIMARY KEY,
  "SETTING_VALUE" JSONB NOT NULL,
  "UPDATED_AT"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "UPDATED_BY"    VARCHAR(120)
);

-- Seed Phase 1 module defaults (idempotent).
INSERT INTO "SYSTEM_SETTINGS" ("SETTING_KEY", "SETTING_VALUE", "UPDATED_BY")
VALUES (
  'phase_modules',
  '{
    "public_site":"released",
    "booking":"released",
    "patient":"released",
    "doctor":"released",
    "doctor_demos":"existing_hidden",
    "records_frontdesk":"released",
    "accounts_cashier":"released",
    "accounts_finance":"released",
    "hr":"released",
    "hr_extended":"existing_hidden",
    "admin_users":"released",
    "admin_cms":"released",
    "admin_audit":"released",
    "admin_modules":"released",
    "admin_demos":"existing_hidden",
    "lab":"existing_hidden",
    "pharmacy":"existing_hidden",
    "nursing":"existing_hidden",
    "radiology":"existing_hidden",
    "fleet":"existing_hidden",
    "stores":"existing_hidden",
    "scm":"existing_hidden",
    "nutrition":"existing_hidden",
    "psych_opc":"existing_hidden",
    "icu":"existing_hidden",
    "staff_generic":"existing_hidden",
    "student":"existing_hidden",
    "billing_mega":"existing_hidden",
    "hms_identity":"existing_hidden"
  }'::jsonb,
  'phase1-seed'
)
ON CONFLICT ("SETTING_KEY") DO NOTHING;
