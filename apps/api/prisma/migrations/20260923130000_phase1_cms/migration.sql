-- Additive marketing CMS tables (Phase 1)
CREATE TABLE IF NOT EXISTS "SITE_PAGES" (
  "PAGE_ID"          SERIAL PRIMARY KEY,
  "SLUG"             VARCHAR(80) NOT NULL UNIQUE,
  "TITLE"            VARCHAR(200) NOT NULL,
  "META_DESCRIPTION" VARCHAR(500),
  "LOCALE"           VARCHAR(10) NOT NULL DEFAULT 'en',
  "STATUS"           VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  "PUBLISHED_AT"     TIMESTAMPTZ,
  "CREATED_AT"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "UPDATED_AT"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "CREATED_BY"       VARCHAR(120),
  "UPDATED_BY"       VARCHAR(120)
);
CREATE INDEX IF NOT EXISTS "SITE_PAGES_STATUS_idx" ON "SITE_PAGES"("STATUS");

CREATE TABLE IF NOT EXISTS "SITE_SECTIONS" (
  "SECTION_ID"  SERIAL PRIMARY KEY,
  "PAGE_ID"     INTEGER NOT NULL REFERENCES "SITE_PAGES"("PAGE_ID") ON DELETE CASCADE,
  "SECTION_KEY" VARCHAR(80) NOT NULL,
  "SORT_ORDER"  INTEGER NOT NULL DEFAULT 0,
  "HEADING"     VARCHAR(300),
  "SUBHEADING"  VARCHAR(500),
  "BODY"        TEXT,
  "CTA_LABEL"   VARCHAR(120),
  "CTA_HREF"    VARCHAR(300),
  "IMAGE_URL"   VARCHAR(500),
  "IMAGE_ALT"   VARCHAR(200),
  "EXTRA_JSON"  JSONB,
  "CREATED_AT"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "UPDATED_AT"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SITE_SECTIONS_PAGE_ID_SECTION_KEY_key" UNIQUE ("PAGE_ID", "SECTION_KEY")
);
CREATE INDEX IF NOT EXISTS "SITE_SECTIONS_PAGE_ID_SORT_ORDER_idx"
  ON "SITE_SECTIONS"("PAGE_ID", "SORT_ORDER");

CREATE TABLE IF NOT EXISTS "SITE_MEDIA" (
  "MEDIA_ID"     SERIAL PRIMARY KEY,
  "FILENAME"     VARCHAR(255) NOT NULL,
  "URL"          VARCHAR(500) NOT NULL,
  "BLOB_PATH"    VARCHAR(500),
  "CONTENT_TYPE" VARCHAR(120),
  "ALT_TEXT"     VARCHAR(255),
  "SIZE_BYTES"   INTEGER,
  "CREATED_AT"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "CREATED_BY"   VARCHAR(120)
);
CREATE INDEX IF NOT EXISTS "SITE_MEDIA_CREATED_AT_idx" ON "SITE_MEDIA"("CREATED_AT");

-- Seed published home/about pages from NeuroAro defaults (idempotent)
INSERT INTO "SITE_PAGES" ("SLUG", "TITLE", "META_DESCRIPTION", "STATUS", "PUBLISHED_AT", "CREATED_BY")
VALUES
  ('home', 'Federal Neuropsychiatric Hospital, Aro', 'Beacon of Mental Wellness', 'PUBLISHED', NOW(), 'phase1-seed'),
  ('about', 'About FNPH Aro', 'WHO Centre of Excellence in mental health', 'PUBLISHED', NOW(), 'phase1-seed'),
  ('services', 'Clinical Services', 'Specialised mental health services', 'PUBLISHED', NOW(), 'phase1-seed'),
  ('departments', 'Departments', 'Hospital departments', 'PUBLISHED', NOW(), 'phase1-seed'),
  ('doctors', 'Medical Team', 'Meet our specialists', 'PUBLISHED', NOW(), 'phase1-seed'),
  ('contact', 'Contact Us', 'Get in touch with FNPH Aro', 'PUBLISHED', NOW(), 'phase1-seed'),
  ('news', 'News & Events', 'Latest hospital news', 'PUBLISHED', NOW(), 'phase1-seed'),
  ('careers', 'Careers', 'Join FNPH Aro', 'PUBLISHED', NOW(), 'phase1-seed')
ON CONFLICT ("SLUG") DO NOTHING;

INSERT INTO "SITE_SECTIONS" ("PAGE_ID", "SECTION_KEY", "SORT_ORDER", "HEADING", "SUBHEADING", "BODY", "CTA_LABEL", "CTA_HREF")
SELECT p."PAGE_ID", 'hero', 0, 'Beacon of Mental Wellness',
  'Leading Nigeria in psychiatric healthcare since 1944.',
  'Book appointments, attend online consultations, and manage your care through the NeuroAro patient portal.',
  'Book Appointment', '/appointment'
FROM "SITE_PAGES" p WHERE p."SLUG" = 'home'
AND NOT EXISTS (SELECT 1 FROM "SITE_SECTIONS" s WHERE s."PAGE_ID" = p."PAGE_ID" AND s."SECTION_KEY" = 'hero');

INSERT INTO "SITE_SECTIONS" ("PAGE_ID", "SECTION_KEY", "SORT_ORDER", "HEADING", "BODY")
SELECT p."PAGE_ID", 'about_teaser', 1, 'About the Hospital',
  'The Federal Neuropsychiatric Hospital, Aro, Abeokuta is Nigeria''s premier institution for mental health services, research, and training — a WHO-recognised centre of excellence.'
FROM "SITE_PAGES" p WHERE p."SLUG" = 'home'
AND NOT EXISTS (SELECT 1 FROM "SITE_SECTIONS" s WHERE s."PAGE_ID" = p."PAGE_ID" AND s."SECTION_KEY" = 'about_teaser');

INSERT INTO "SITE_SECTIONS" ("PAGE_ID", "SECTION_KEY", "SORT_ORDER", "HEADING", "BODY")
SELECT p."PAGE_ID", 'story', 0, 'Our Story',
  'Since 1944, Federal Neuropsychiatric Hospital, Aro has led psychiatric care, research, and training in Nigeria.'
FROM "SITE_PAGES" p WHERE p."SLUG" = 'about'
AND NOT EXISTS (SELECT 1 FROM "SITE_SECTIONS" s WHERE s."PAGE_ID" = p."PAGE_ID" AND s."SECTION_KEY" = 'story');
