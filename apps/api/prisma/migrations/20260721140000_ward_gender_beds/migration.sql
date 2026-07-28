-- Gender-aware wards + pad beds to 20 for testing inventory

ALTER TABLE "WARDS" ADD COLUMN IF NOT EXISTS "GENDER" VARCHAR(20) NOT NULL DEFAULT 'Mixed';

CREATE INDEX IF NOT EXISTS "WARDS_GENDER_idx" ON "WARDS"("GENDER");
CREATE INDEX IF NOT EXISTS "WARDS_STATUS_idx" ON "WARDS"("STATUS");

-- Backfill known wards
UPDATE "WARDS" SET "GENDER" = 'Mixed' WHERE "CODE" IN ('W1C', 'ICU', 'GEN', 'PRIV', 'VIP', 'SEMI', 'MIXG');
UPDATE "WARDS" SET "GENDER" = 'Male' WHERE "CODE" IN ('MGEN', 'MVIP');
UPDATE "WARDS" SET "GENDER" = 'Female' WHERE "CODE" IN ('FGEN', 'FVIP');

-- Testing wards (idempotent)
INSERT INTO "WARDS" ("CODE", "NAME", "WARD_TYPE", "WARD_CLASS", "GENDER", "DAILY_BED_RATE", "ADMISSION_DEPOSIT_DEFAULT", "STATUS", "CREATED_BY", "CREATED_DATE")
VALUES
  ('MGEN', 'Male General Ward', 'General', 'General', 'Male', 5000, 50000, 'Active', 'SYSTEM', NOW()),
  ('FGEN', 'Female General Ward', 'General', 'General', 'Female', 5000, 50000, 'Active', 'SYSTEM', NOW()),
  ('MVIP', 'Male VIP Ward', 'General', 'VIP', 'Male', 80000, 100000, 'Active', 'SYSTEM', NOW()),
  ('FVIP', 'Female VIP Ward', 'General', 'VIP', 'Female', 80000, 100000, 'Active', 'SYSTEM', NOW()),
  ('MIXG', 'Mixed Medical Ward', 'General', 'General', 'Mixed', 5000, 50000, 'Active', 'SYSTEM', NOW())
ON CONFLICT ("CODE") DO UPDATE SET
  "GENDER" = EXCLUDED."GENDER",
  "WARD_CLASS" = EXCLUDED."WARD_CLASS",
  "DAILY_BED_RATE" = EXCLUDED."DAILY_BED_RATE",
  "ADMISSION_DEPOSIT_DEFAULT" = EXCLUDED."ADMISSION_DEPOSIT_DEFAULT",
  "STATUS" = 'Active';

-- Ensure ICU / W1C gender Mixed and class
UPDATE "WARDS" SET "GENDER" = 'Mixed', "WARD_CLASS" = COALESCE("WARD_CLASS", 'ICU') WHERE "CODE" = 'ICU';
UPDATE "WARDS" SET "GENDER" = 'Mixed', "WARD_CLASS" = COALESCE("WARD_CLASS", 'General') WHERE "CODE" = 'W1C';

-- Pad beds 01–20 for all Active testing/known wards (skip labels that already exist)
INSERT INTO "BEDS" ("WARD_ID", "LABEL", "STATUS", "CREATED_BY", "CREATED_DATE")
SELECT w."WARD_ID", b.label, 'AVAILABLE', 'SYSTEM', NOW()
FROM "WARDS" w
CROSS JOIN (
  VALUES
    ('01'),('02'),('03'),('04'),('05'),('06'),('07'),('08'),('09'),('10'),
    ('11'),('12'),('13'),('14'),('15'),('16'),('17'),('18'),('19'),('20')
) AS b(label)
WHERE w."CODE" IN ('MGEN','FGEN','MVIP','FVIP','MIXG','ICU','W1C','GEN','PRIV','VIP','SEMI')
  AND w."STATUS" = 'Active'
  AND NOT EXISTS (
    SELECT 1 FROM "BEDS" x WHERE x."WARD_ID" = w."WARD_ID" AND x."LABEL" = b.label
  );
