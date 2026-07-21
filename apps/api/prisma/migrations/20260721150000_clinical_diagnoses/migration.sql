-- Diagnosis catalog + patient diagnoses (Doctor Diagnosis Engine)

CREATE TABLE IF NOT EXISTS "DIAGNOSIS_CODES" (
    "DIAGNOSIS_CODE_ID" SERIAL NOT NULL,
    "CODE" VARCHAR(40) NOT NULL,
    "DSM_CODE" VARCHAR(40),
    "SYSTEM" VARCHAR(20) NOT NULL DEFAULT 'ICD-11',
    "NAME" VARCHAR(255) NOT NULL,
    "CATEGORY" VARCHAR(100),
    "DESCRIPTION" TEXT,
    "SYMPTOMS" TEXT,
    "KEYWORDS" TEXT,
    "IS_PSYCHIATRIC" BOOLEAN NOT NULL DEFAULT false,
    "STATUS" VARCHAR(30) NOT NULL DEFAULT 'Active',
    "CREATED_BY" VARCHAR(100),
    "CREATED_DATE" TIMESTAMP(3),
    "UPDATED_BY" VARCHAR(100),
    "UPDATED_DATE" TIMESTAMP(3),
    CONSTRAINT "DIAGNOSIS_CODES_pkey" PRIMARY KEY ("DIAGNOSIS_CODE_ID")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DIAGNOSIS_CODES_CODE_key" ON "DIAGNOSIS_CODES"("CODE");
CREATE INDEX IF NOT EXISTS "DIAGNOSIS_CODES_SYSTEM_idx" ON "DIAGNOSIS_CODES"("SYSTEM");
CREATE INDEX IF NOT EXISTS "DIAGNOSIS_CODES_CATEGORY_idx" ON "DIAGNOSIS_CODES"("CATEGORY");
CREATE INDEX IF NOT EXISTS "DIAGNOSIS_CODES_STATUS_idx" ON "DIAGNOSIS_CODES"("STATUS");
CREATE INDEX IF NOT EXISTS "DIAGNOSIS_CODES_IS_PSYCHIATRIC_idx" ON "DIAGNOSIS_CODES"("IS_PSYCHIATRIC");

INSERT INTO "DIAGNOSIS_CODES" ("CODE", "DSM_CODE", "SYSTEM", "NAME", "CATEGORY", "DESCRIPTION", "SYMPTOMS", "KEYWORDS", "IS_PSYCHIATRIC", "STATUS", "CREATED_BY", "CREATED_DATE")
VALUES
  ('6A70.1', '296.32', 'ICD-11', 'Recurrent depressive disorder, moderate', 'Mood disorders', 'Recurrent episodes of depressive symptoms with moderate severity.', 'Low mood, anhedonia, sleep disturbance, fatigue', 'depression depressive mood sad', true, 'Active', 'SYSTEM', NOW()),
  ('6A70', 'F32.1', 'ICD-11', 'Single episode depressive disorder, moderate', 'Mood disorders', 'First or single episode depressive disorder.', 'Depressed mood, loss of interest, guilt, poor concentration', 'depression moderate episode', true, 'Active', 'SYSTEM', NOW()),
  ('6B00', '300.02', 'ICD-11', 'Generalized anxiety disorder', 'Anxiety disorders', 'Excessive anxiety and worry about multiple domains.', 'Worry, restlessness, muscle tension, insomnia', 'anxiety worry GAD', true, 'Active', 'SYSTEM', NOW()),
  ('6A60.1', '296.40', 'ICD-11', 'Bipolar type I disorder, current episode manic', 'Mood disorders', 'Manic episode in context of bipolar I.', 'Elevated mood, decreased sleep, grandiosity, pressured speech', 'bipolar mania manic', true, 'Active', 'SYSTEM', NOW()),
  ('6A20.0', '295.90', 'ICD-11', 'Schizophrenia, continuous', 'Schizophrenia spectrum', 'Continuous course schizophrenia with psychotic symptoms.', 'Delusions, hallucinations, disorganized speech', 'schizophrenia psychosis', true, 'Active', 'SYSTEM', NOW()),
  ('6C40.2', '303.90', 'ICD-11', 'Alcohol dependence', 'Substance use', 'Pattern of alcohol use leading to dependence.', 'Craving, tolerance, withdrawal, continued use despite harm', 'alcohol dependence addiction', true, 'Active', 'SYSTEM', NOW()),
  ('6B40', '309.81', 'ICD-11', 'Post-traumatic stress disorder', 'Trauma-related', 'Trauma exposure with intrusive symptoms and avoidance.', 'Flashbacks, nightmares, hypervigilance, avoidance', 'PTSD trauma stress', true, 'Active', 'SYSTEM', NOW()),
  ('1F4Z', NULL, 'ICD-11', 'Malaria, unspecified', 'Infectious diseases', 'Plasmodium infection without further specification.', 'Fever, chills, headache, myalgia', 'malaria fever plasmodium', false, 'Active', 'SYSTEM', NOW()),
  ('BA00', NULL, 'ICD-11', 'Essential hypertension', 'Cardiovascular', 'Persistently elevated arterial blood pressure.', 'Often asymptomatic; headache, dizziness if severe', 'hypertension BP high blood pressure', false, 'Active', 'SYSTEM', NOW()),
  ('5A10', NULL, 'ICD-11', 'Type 2 diabetes mellitus', 'Endocrine', 'Diabetes due to insulin resistance and relative deficiency.', 'Polyuria, polydipsia, fatigue, blurred vision', 'diabetes DM type 2 sugar', false, 'Active', 'SYSTEM', NOW()),
  ('CA23', NULL, 'ICD-11', 'Upper respiratory tract infection', 'Respiratory', 'Acute infection of upper airways.', 'Cough, sore throat, rhinorrhoea, low-grade fever', 'URI cold cough URTI', false, 'Active', 'SYSTEM', NOW()),
  ('DA60', NULL, 'ICD-11', 'Peptic ulcer disease', 'Gastrointestinal', 'Ulceration of stomach or duodenal mucosa.', 'Epigastric pain, nausea, bloating', 'ulcer PUD gastritis stomach', false, 'Active', 'SYSTEM', NOW()),
  ('CA23.0', NULL, 'ICD-11', 'Asthma', 'Respiratory', 'Chronic airway inflammation with reversible obstruction.', 'Wheeze, dyspnoea, chest tightness, cough', 'asthma wheeze breathing', false, 'Active', 'SYSTEM', NOW()),
  ('CA40', NULL, 'ICD-11', 'Pneumonia', 'Respiratory', 'Infection of lung parenchyma.', 'Fever, cough, pleuritic pain, dyspnoea', 'pneumonia chest infection', false, 'Active', 'SYSTEM', NOW()),
  ('GC00', NULL, 'ICD-11', 'Urinary tract infection', 'Genitourinary', 'Bacterial infection of urinary tract.', 'Dysuria, frequency, urgency, suprapubic pain', 'UTI urine infection dysuria', false, 'Active', 'SYSTEM', NOW()),
  ('6D85', 'F03.90', 'ICD-11', 'Dementia', 'Neurocognitive', 'Progressive cognitive decline affecting daily function.', 'Memory loss, disorientation, behavioural change', 'dementia cognitive decline', true, 'Active', 'SYSTEM', NOW()),
  ('6A23', '298.8', 'ICD-11', 'Acute and transient psychotic disorder', 'Schizophrenia spectrum', 'Short-lived psychotic episode with full recovery.', 'Delusions, hallucinations, confusion', 'acute psychosis transient', true, 'Active', 'SYSTEM', NOW())
ON CONFLICT ("CODE") DO NOTHING;

CREATE TABLE IF NOT EXISTS "PATIENT_DIAGNOSES" (
    "PATIENT_DIAGNOSIS_ID" SERIAL NOT NULL,
    "PERSON_ID" INTEGER NOT NULL,
    "ENCOUNTER_ID" INTEGER,
    "CODE" VARCHAR(40) NOT NULL,
    "DSM_CODE" VARCHAR(40),
    "SYSTEM" VARCHAR(20) NOT NULL DEFAULT 'ICD-11',
    "NAME" VARCHAR(255) NOT NULL,
    "TYPE" VARCHAR(40) NOT NULL DEFAULT 'Primary',
    "SEVERITY" VARCHAR(30),
    "STATUS" VARCHAR(40) NOT NULL DEFAULT 'Active',
    "CERTAINTY" VARCHAR(30),
    "ONSET_DATE" TIMESTAMP(3),
    "NOTES" TEXT,
    "CLINIC" VARCHAR(50),
    "ON_PROBLEM_LIST" BOOLEAN NOT NULL DEFAULT true,
    "IS_PSYCHIATRIC" BOOLEAN NOT NULL DEFAULT false,
    "REASON_CONSIDERED" TEXT,
    "SUPPORTING_FINDINGS" TEXT,
    "AGAINST_FINDINGS" TEXT,
    "CONTROL_STATUS" VARCHAR(50),
    "LAST_REVIEW" TIMESTAMP(3),
    "NEXT_REVIEW" TIMESTAMP(3),
    "RISK_LEVEL" VARCHAR(40),
    "LINKED_SYMPTOMS" TEXT,
    "LINKED_LAB" TEXT,
    "LINKED_IMAGING" TEXT,
    "LINKED_RX" TEXT,
    "CLOSED_REASON" TEXT,
    "CLOSED_BY" VARCHAR(150),
    "CLOSED_DATE" TIMESTAMP(3),
    "CREATED_BY_ID" INTEGER,
    "UPDATED_BY_ID" INTEGER,
    "CREATED_BY" VARCHAR(100),
    "CREATED_DATE" TIMESTAMP(3),
    "UPDATED_BY" VARCHAR(100),
    "UPDATED_DATE" TIMESTAMP(3),
    CONSTRAINT "PATIENT_DIAGNOSES_pkey" PRIMARY KEY ("PATIENT_DIAGNOSIS_ID")
);

CREATE INDEX IF NOT EXISTS "PATIENT_DIAGNOSES_PERSON_ID_idx" ON "PATIENT_DIAGNOSES"("PERSON_ID");
CREATE INDEX IF NOT EXISTS "PATIENT_DIAGNOSES_STATUS_idx" ON "PATIENT_DIAGNOSES"("STATUS");
CREATE INDEX IF NOT EXISTS "PATIENT_DIAGNOSES_TYPE_idx" ON "PATIENT_DIAGNOSES"("TYPE");
CREATE INDEX IF NOT EXISTS "PATIENT_DIAGNOSES_IS_PSYCHIATRIC_idx" ON "PATIENT_DIAGNOSES"("IS_PSYCHIATRIC");
CREATE INDEX IF NOT EXISTS "PATIENT_DIAGNOSES_CREATED_DATE_idx" ON "PATIENT_DIAGNOSES"("CREATED_DATE");

DO $$ BEGIN
  ALTER TABLE "PATIENT_DIAGNOSES" ADD CONSTRAINT "PATIENT_DIAGNOSES_PERSON_ID_fkey"
    FOREIGN KEY ("PERSON_ID") REFERENCES "PERSONS"("PERSON_ID") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
