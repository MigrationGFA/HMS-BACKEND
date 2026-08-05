-- Ensure registration charge master services exist for Records Patient Entry.
-- Mirrors prisma/seed.ts extras: SVC-REG-FEE, SVC-CARD-FEE, SVC-REG-CONSULT.

INSERT INTO "MASTER_SERVICES" (
  "SERVICE_CODE", "CATEGORY_ID", "DEPARTMENT_ID", "NAME", "DESCRIPTION",
  "DURATION_MINUTES", "GENERAL_PRICE", "STAFF_PRICE",
  "ONLINE_BOOKABLE", "APPOINTMENT_REQUIRED", "REQUIRES_DOCTOR_ORDER",
  "STATUS", "CREATED_BY", "CREATED_DATE"
)
SELECT v.code, c."CATEGORY_ID", d."DEPARTMENT_ID", v.name, v.descr,
       v.duration, v.price, ROUND(v.price * 0.7, 2),
       v.online, v.appt, v.order_req, 'ACTIVE', 'migration', NOW()
FROM (VALUES
  ('SVC-REG-FEE', 'REGISTRATION_FEE', 'GMPC', 'New Patient Registration Fee', 'First-time patient registration charge', NULL, 1500::numeric, false, false, false),
  ('SVC-CARD-FEE', 'CARD_FEE', 'GMPC', 'Patient ID Card Fee', 'Hospital patient identification card fee', NULL, 500::numeric, false, false, false),
  ('SVC-REG-CONSULT', 'CONSULTATION', 'GMPC', 'First Visit Consultation', 'Initial consultation fee for new patients', 20, 5500::numeric, false, false, false)
) AS v(code, cat, dept, name, descr, duration, price, online, appt, order_req)
JOIN "SERVICE_CATEGORIES" c ON c."CODE" = v.cat
JOIN "DEPARTMENTS" d ON d."CODE" = v.dept
WHERE NOT EXISTS (SELECT 1 FROM "MASTER_SERVICES" ms WHERE ms."SERVICE_CODE" = v.code);

UPDATE "MASTER_SERVICES"
SET
  "STATUS" = 'ACTIVE',
  "GENERAL_PRICE" = CASE "SERVICE_CODE"
    WHEN 'SVC-REG-FEE' THEN 1500
    WHEN 'SVC-CARD-FEE' THEN 500
    WHEN 'SVC-REG-CONSULT' THEN 5500
    ELSE "GENERAL_PRICE"
  END,
  "STAFF_PRICE" = CASE "SERVICE_CODE"
    WHEN 'SVC-REG-FEE' THEN ROUND(1500 * 0.7, 2)
    WHEN 'SVC-CARD-FEE' THEN ROUND(500 * 0.7, 2)
    WHEN 'SVC-REG-CONSULT' THEN ROUND(5500 * 0.7, 2)
    ELSE "STAFF_PRICE"
  END,
  "UPDATED_BY" = 'migration',
  "UPDATED_DATE" = NOW()
WHERE "SERVICE_CODE" IN ('SVC-REG-FEE', 'SVC-CARD-FEE', 'SVC-REG-CONSULT');
