-- Records RBAC aliases
-- Production ROLE_NAME values such as "RECORD OFFICER" / "RECORD ADMIN" are kept as-is
-- (display labels used by HR / legacy). Permission resolution uses normalizeRoleName()
-- in permissions.constants.ts so those labels map to RECORDS_PERMISSIONS without
-- rewriting user ROLE_ID links.
--
-- Ensure canonical role rows exist for seed / new environments.

INSERT INTO "ROLES" ("ROLE_NAME", "CREATED_BY", "CREATED_DATE")
SELECT 'RECORDS', 'system', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "ROLES"
  WHERE UPPER(REPLACE(REPLACE(TRIM("ROLE_NAME"), ' ', '_'), '-', '_')) = 'RECORDS'
);

INSERT INTO "ROLES" ("ROLE_NAME", "CREATED_BY", "CREATED_DATE")
SELECT 'RECORD_OFFICER', 'system', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "ROLES"
  WHERE UPPER(REPLACE(REPLACE(TRIM("ROLE_NAME"), ' ', '_'), '-', '_')) IN (
    'RECORD_OFFICER', 'RECORDS_OFFICER', 'RECORD_OFFICER'
  )
  OR UPPER(TRIM("ROLE_NAME")) = 'RECORD OFFICER'
);

INSERT INTO "ROLES" ("ROLE_NAME", "CREATED_BY", "CREATED_DATE")
SELECT 'RECORD_ADMIN', 'system', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "ROLES"
  WHERE UPPER(REPLACE(REPLACE(TRIM("ROLE_NAME"), ' ', '_'), '-', '_')) IN (
    'RECORD_ADMIN', 'RECORDS_ADMIN'
  )
  OR UPPER(TRIM("ROLE_NAME")) = 'RECORD ADMIN'
);
