-- Lab result templates: reusable result-entry field schemas (JSONB), managed in DB.
-- Soft delete only (STATUS = Inactive).

CREATE TABLE IF NOT EXISTS "LAB_RESULT_TEMPLATES" (
    "TEMPLATE_ID" SERIAL NOT NULL,
    "CODE" VARCHAR(50) NOT NULL,
    "NAME" VARCHAR(255) NOT NULL,
    "CATEGORY" VARCHAR(100) NOT NULL,
    "DESCRIPTION" TEXT,
    "FIELDS" JSONB NOT NULL DEFAULT '[]',
    "STATUS" VARCHAR(50) NOT NULL DEFAULT 'Active',
    "CREATED_BY_ID" INTEGER,
    "CREATED_BY" VARCHAR(100),
    "CREATED_DATE" TIMESTAMP(3),
    "UPDATED_BY_ID" INTEGER,
    "UPDATED_BY" VARCHAR(100),
    "UPDATED_DATE" TIMESTAMP(3),

    CONSTRAINT "LAB_RESULT_TEMPLATES_pkey" PRIMARY KEY ("TEMPLATE_ID")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LAB_RESULT_TEMPLATES_CODE_key" ON "LAB_RESULT_TEMPLATES"("CODE");
CREATE INDEX IF NOT EXISTS "LAB_RESULT_TEMPLATES_CATEGORY_idx" ON "LAB_RESULT_TEMPLATES"("CATEGORY");
CREATE INDEX IF NOT EXISTS "LAB_RESULT_TEMPLATES_STATUS_idx" ON "LAB_RESULT_TEMPLATES"("STATUS");

-- Seed the 12 standard templates (mirrors former frontend src/lab/templates.ts)
INSERT INTO "LAB_RESULT_TEMPLATES" ("CODE", "NAME", "CATEGORY", "DESCRIPTION", "FIELDS", "STATUS", "CREATED_BY", "CREATED_DATE")
VALUES
  ('tpl-hiv', 'HIV Screening', 'Serology', 'Determine / Stat-Pak / Uni-Gold algorithm.', $$[
    {"key":"result","label":"HIV Result","type":"select","required":true,"options":["Negative","Positive","Indeterminate","Repeat Test Required"],"critical":["Positive"]},
    {"key":"method","label":"Method","type":"select","options":["Determine","Stat-Pak","Uni-Gold","ELISA"]},
    {"key":"comment","label":"Comment","type":"textarea"}
  ]$$::jsonb, 'Active', 'SYSTEM', NOW()),
  ('tpl-hbsag', 'HBsAg (Hepatitis B)', 'Serology', NULL, $$[
    {"key":"result","label":"HBsAg","type":"select","required":true,"options":["Positive","Negative"],"critical":["Positive"]},
    {"key":"method","label":"Method","type":"select","options":["Rapid Strip","ELISA"]}
  ]$$::jsonb, 'Active', 'SYSTEM', NOW()),
  ('tpl-hcv', 'HCV (Hepatitis C)', 'Serology', NULL, $$[
    {"key":"result","label":"HCV Antibody","type":"select","required":true,"options":["Positive","Negative"],"critical":["Positive"]},
    {"key":"method","label":"Method","type":"select","options":["Rapid Strip","ELISA"]}
  ]$$::jsonb, 'Active', 'SYSTEM', NOW()),
  ('tpl-bloodgroup', 'Blood Group & Rhesus', 'Haematology', NULL, $$[
    {"key":"group","label":"ABO/Rh","type":"select","required":true,"options":["A+","A-","B+","B-","AB+","AB-","O+","O-"]},
    {"key":"method","label":"Method","type":"select","options":["Tile","Tube","Gel"]}
  ]$$::jsonb, 'Active', 'SYSTEM', NOW()),
  ('tpl-genotype', 'Haemoglobin Genotype', 'Haematology', NULL, $$[
    {"key":"genotype","label":"Genotype","type":"select","required":true,"options":["AA","AS","AC","SS","SC","CC"],"critical":["SS","SC"]}
  ]$$::jsonb, 'Active', 'SYSTEM', NOW()),
  ('tpl-pregnancy', 'Pregnancy Test (β-hCG)', 'Serology', NULL, $$[
    {"key":"result","label":"Result","type":"select","required":true,"options":["Positive","Negative"]}
  ]$$::jsonb, 'Active', 'SYSTEM', NOW()),
  ('tpl-malaria', 'Malaria Parasite', 'Microbiology', NULL, $$[
    {"key":"result","label":"Result","type":"select","required":true,"options":["Positive","Negative"],"critical":["Positive"]},
    {"key":"density","label":"Parasite Density","type":"select","options":["+","++","+++","++++"]},
    {"key":"species","label":"Species","type":"select","options":["P. falciparum","P. vivax","P. ovale","P. malariae","Mixed"]}
  ]$$::jsonb, 'Active', 'SYSTEM', NOW()),
  ('tpl-udsa', 'Urine Drug Screen', 'Toxicology', 'Multi-panel rapid screen — every panel uses Positive/Negative dropdown.', $$[
    {"key":"thc","label":"Cannabis (THC)","type":"select","options":["Positive","Negative"],"critical":["Positive"]},
    {"key":"amp","label":"Amphetamines (AMP)","type":"select","options":["Positive","Negative"],"critical":["Positive"]},
    {"key":"met","label":"Methamphetamines (MET)","type":"select","options":["Positive","Negative"],"critical":["Positive"]},
    {"key":"coc","label":"Cocaine (COC)","type":"select","options":["Positive","Negative"],"critical":["Positive"]},
    {"key":"opi","label":"Opiates (OPI)","type":"select","options":["Positive","Negative"],"critical":["Positive"]},
    {"key":"bzo","label":"Benzodiazepines (BZO)","type":"select","options":["Positive","Negative"],"critical":["Positive"]},
    {"key":"tra","label":"Tramadol (TRA)","type":"select","options":["Positive","Negative"],"critical":["Positive"]},
    {"key":"bar","label":"Barbiturates (BAR)","type":"select","options":["Positive","Negative"],"critical":["Positive"]},
    {"key":"mtd","label":"Methadone (MTD)","type":"select","options":["Positive","Negative"],"critical":["Positive"]},
    {"key":"comment","label":"Comment","type":"textarea"}
  ]$$::jsonb, 'Active', 'SYSTEM', NOW()),
  ('tpl-culture', 'Culture & Sensitivity', 'Microbiology', NULL, $$[
    {"key":"specimen","label":"Specimen","type":"select","required":true,"options":["Urine","Stool","Sputum","Blood","Wound Swab","Ear Swab","HVS","Urethral Swab","CSF"]},
    {"key":"organism","label":"Organism Isolated","type":"select","required":true,"options":["No Growth","Escherichia coli","Staphylococcus aureus","Klebsiella pneumoniae","Pseudomonas aeruginosa","Proteus mirabilis","Streptococcus pneumoniae","Enterococcus faecalis","Salmonella typhi","Candida albicans","Other"]},
    {"key":"colony","label":"Colony Count (CFU/mL)","type":"select","options":["<10^3","10^3–10^4","10^4–10^5",">10^5"]},
    {"key":"antibiotic","label":"Antibiotic","type":"select","options":["Ampicillin","Amoxicillin-Clavulanate","Ceftriaxone","Cefuroxime","Ciprofloxacin","Levofloxacin","Gentamicin","Amikacin","Meropenem","Imipenem","Vancomycin","Cotrimoxazole","Nitrofurantoin","Erythromycin","Azithromycin"]},
    {"key":"sensitivity","label":"Sensitivity","type":"select","options":["Sensitive","Intermediate","Resistant"]},
    {"key":"comment","label":"Comment","type":"textarea"}
  ]$$::jsonb, 'Active', 'SYSTEM', NOW()),
  ('tpl-sfa', 'Seminal Fluid Analysis', 'Andrology', NULL, $$[
    {"key":"abstinence","label":"Days of Abstinence","type":"number"},
    {"key":"volume","label":"Volume","type":"number","unit":"mL","ref":"≥1.5"},
    {"key":"liquefaction","label":"Liquefaction Time","type":"select","options":["<30 min","30–60 min",">60 min"]},
    {"key":"appearance","label":"Appearance","type":"select","options":["Greyish-opalescent","Yellow","Brownish","Bloody"]},
    {"key":"viscosity","label":"Viscosity","type":"select","options":["Normal","Increased"]},
    {"key":"ph","label":"pH","type":"number","ref":"7.2–8.0"},
    {"key":"concentration","label":"Sperm Concentration","type":"number","unit":"×10⁶/mL","ref":"≥15"},
    {"key":"motility","label":"Total Motility","type":"select","options":["<20%","20–39%","40–59%","≥60%"],"ref":"≥40%"},
    {"key":"progressive","label":"Progressive Motility","type":"select","options":["<10%","10–31%","≥32%"],"ref":"≥32%"},
    {"key":"morphology","label":"Normal Morphology","type":"select","options":["<4%","4–14%","≥15%"],"ref":"≥4%"},
    {"key":"wbc","label":"WBC","type":"select","options":["Nil","+","++","+++"]},
    {"key":"conclusion","label":"Conclusion","type":"select","options":["Normozoospermia","Oligozoospermia","Asthenozoospermia","Teratozoospermia","Oligoasthenoteratozoospermia","Azoospermia"]}
  ]$$::jsonb, 'Active', 'SYSTEM', NOW()),
  ('tpl-fbc', 'Full Blood Count (FBC)', 'Haematology', NULL, $$[
    {"key":"hb","label":"Haemoglobin","type":"number","unit":"g/dL","ref":"M:13–17 / F:12–15","critical":["<7"]},
    {"key":"pcv","label":"PCV","type":"number","unit":"%","ref":"M:40–54 / F:36–47"},
    {"key":"wbc","label":"WBC","type":"number","unit":"×10⁹/L","ref":"4.0–11.0"},
    {"key":"platelets","label":"Platelets","type":"number","unit":"×10⁹/L","ref":"150–400"},
    {"key":"neutrophils","label":"Neutrophils","type":"number","unit":"%"},
    {"key":"lymphocytes","label":"Lymphocytes","type":"number","unit":"%"}
  ]$$::jsonb, 'Active', 'SYSTEM', NOW()),
  ('tpl-histopath', 'Histopathology Report', 'Histopathology', NULL, $$[
    {"key":"specimen","label":"Specimen Type","type":"select","options":["Biopsy","Surgical Resection","Cytology","FNAC"]},
    {"key":"site","label":"Site","type":"text"},
    {"key":"gross","label":"Gross Description","type":"textarea"},
    {"key":"micro","label":"Microscopic Description","type":"textarea"},
    {"key":"diagnosis","label":"Histological Diagnosis","type":"textarea","required":true},
    {"key":"grade","label":"Grade","type":"select","options":["Benign","Atypical","Low Grade","High Grade","Malignant"]}
  ]$$::jsonb, 'Active', 'SYSTEM', NOW())
ON CONFLICT ("CODE") DO NOTHING;
