import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { ALL_ROLES, ROLES, type RoleName } from '../src/common/constants';
import {
  createPrismaClient,
  databaseConfigFromEnv,
} from '../src/prisma/create-prisma-client';

/** Shared password for all local / staging staff test accounts. */
const TEST_PASSWORD = 'password';

type SeedAccount = {
  email: string;
  role: RoleName;
  firstName: string;
  lastName: string;
  userName: string;
  isAdmin?: boolean;
};

/**
 * Staff testing accounts for FNPH Aro.
 * Password for every account: `password`
 */
const TEST_ACCOUNTS: SeedAccount[] = [
  {
    email: 'superadmin@fnpharo.gov.ng',
    role: ROLES.SUPER_ADMIN,
    firstName: 'Super',
    lastName: 'Admin',
    userName: 'superadmin',
    isAdmin: true,
  },
  {
    email: 'board@fnpharo.gov.ng',
    role: ROLES.BOARD,
    firstName: 'Board',
    lastName: 'Chair',
    userName: 'board',
  },
  {
    email: 'cmd@fnpharo.gov.ng',
    role: ROLES.CMD,
    firstName: 'Chief Medical',
    lastName: 'Director',
    userName: 'cmd',
  },
  {
    email: 'admin@fnpharo.gov.ng',
    role: ROLES.ADMIN,
    firstName: 'Hospital',
    lastName: 'Admin',
    userName: 'admin',
    isAdmin: true,
  },
  {
    email: 'finance@fnpharo.gov.ng',
    role: ROLES.FINANCE,
    firstName: 'Finance',
    lastName: 'Officer',
    userName: 'finance',
  },
  {
    email: 'hr@fnpharo.gov.ng',
    role: ROLES.HR,
    firstName: 'Human',
    lastName: 'Resources',
    userName: 'hr',
  },
  {
    email: 'doctor@fnpharo.gov.ng',
    role: ROLES.DOCTOR,
    firstName: 'Test',
    lastName: 'Doctor',
    userName: 'doctor',
  },
  {
    email: 'nurse@fnpharo.gov.ng',
    role: ROLES.NURSE,
    firstName: 'Test',
    lastName: 'Nurse',
    userName: 'nurse',
  },
  {
    email: 'pharmacist@fnpharo.gov.ng',
    role: ROLES.PHARMACIST,
    firstName: 'Test',
    lastName: 'Pharmacist',
    userName: 'pharmacist',
  },
  {
    email: 'lab@fnpharo.gov.ng',
    role: ROLES.LAB,
    firstName: 'Lab',
    lastName: 'Scientist',
    userName: 'lab',
  },
  {
    email: 'radiology@fnpharo.gov.ng',
    role: ROLES.RADIOLOGY,
    firstName: 'Radiology',
    lastName: 'Officer',
    userName: 'radiology',
  },
  {
    email: 'psychopc@fnpharo.gov.ng',
    role: ROLES.PSYCHIATRIC_OPC,
    firstName: 'Psychiatric',
    lastName: 'OPC',
    userName: 'psychopc',
  },
  {
    email: 'psychology@fnpharo.gov.ng',
    role: ROLES.PSYCHOLOGY,
    firstName: 'Clinical',
    lastName: 'Psychologist',
    userName: 'psychology',
  },
  {
    email: 'cap@fnpharo.gov.ng',
    role: ROLES.CHILD_ADOLESCENT,
    firstName: 'Child',
    lastName: 'Adolescent',
    userName: 'cap',
  },
  {
    email: 'addiction@fnpharo.gov.ng',
    role: ROLES.ADDICTION_REHAB,
    firstName: 'Addiction',
    lastName: 'Rehab',
    userName: 'addiction',
  },
  {
    email: 'psychogeriatrics@fnpharo.gov.ng',
    role: ROLES.PSYCHOGERIATRICS,
    firstName: 'Psycho',
    lastName: 'Geriatrics',
    userName: 'psychogeriatrics',
  },
  {
    email: 'physiotherapy@fnpharo.gov.ng',
    role: ROLES.PHYSIOTHERAPY,
    firstName: 'Physio',
    lastName: 'Therapist',
    userName: 'physiotherapy',
  },
  {
    email: 'speech@fnpharo.gov.ng',
    role: ROLES.SPEECH_THERAPY,
    firstName: 'Speech',
    lastName: 'Therapist',
    userName: 'speech',
  },
  {
    email: 'nutrition@fnpharo.gov.ng',
    role: ROLES.NUTRITION,
    firstName: 'Nutrition',
    lastName: 'Dietetics',
    userName: 'nutrition',
  },
  {
    email: 'socialwork@fnpharo.gov.ng',
    role: ROLES.SOCIAL_WORK,
    firstName: 'Social',
    lastName: 'Work',
    userName: 'socialwork',
  },
  {
    email: 'icu@fnpharo.gov.ng',
    role: ROLES.ICU,
    firstName: 'ICU',
    lastName: 'Critical',
    userName: 'icu',
  },
  {
    email: 'cashier@fnpharo.gov.ng',
    role: ROLES.CASHIER,
    firstName: 'Cashier',
    lastName: 'Desk',
    userName: 'cashier',
  },
  {
    email: 'records@fnpharo.gov.ng',
    role: ROLES.RECORDS,
    firstName: 'Health',
    lastName: 'Records',
    userName: 'records',
  },
  {
    email: 'it@fnpharo.gov.ng',
    role: ROLES.IT,
    firstName: 'IT',
    lastName: 'Support',
    userName: 'it',
  },
  {
    email: 'staff@fnpharo.gov.ng',
    role: ROLES.STAFF,
    firstName: 'General',
    lastName: 'Staff',
    userName: 'staff',
  },
  {
    email: 'student@fnpharo.gov.ng',
    role: ROLES.STUDENT,
    firstName: 'Student',
    lastName: 'Trainee',
    userName: 'student',
  },
  {
    // User list had a truncated TLD (gov.n); use the correct domain.
    email: 'patient@fnpharo.gov.ng',
    role: ROLES.PATIENT,
    firstName: 'Demo',
    lastName: 'Patient',
    userName: 'patient',
  },
];

const { prisma, pool } = createPrismaClient(databaseConfigFromEnv());

async function upsertRole(roleName: RoleName): Promise<number> {
  const existing = await prisma.roles.findFirst({
    where: { ROLE_NAME: roleName },
  });
  if (existing) {
    return existing.ROLE_ID;
  }

  const created = await prisma.roles.create({
    data: {
      ROLE_NAME: roleName,
      CREATED_BY: 'SYSTEM',
      CREATED_DATE: new Date(),
    },
  });
  return created.ROLE_ID;
}

async function upsertAccount(
  account: SeedAccount,
  roleId: number,
  passwordHash: string,
): Promise<void> {
  const existingByEmail = await prisma.users.findFirst({
    where: {
      EMAIL_ADDRESS: {
        equals: account.email,
        mode: 'insensitive',
      },
    },
  });

  const data = {
    USER_NAME: account.userName,
    EMAIL_ADDRESS: account.email,
    PASSWORD: passwordHash,
    FIRST_NAME: account.firstName,
    LAST_NAME: account.lastName,
    IS_ADMIN: account.isAdmin ? 'Y' : 'N',
    LOCK_ACCOUNT: 'N',
    ROLE_ID: roleId,
    UPDATED_BY: 'SYSTEM',
    UPDATED_DATE: new Date(),
  };

  if (existingByEmail) {
    await prisma.users.update({
      where: { USER_ID: existingByEmail.USER_ID },
      data,
    });
    console.log(`Updated: ${account.email} (${account.role})`);
    return;
  }

  const existingByUserName = await prisma.users.findFirst({
    where: { USER_NAME: account.userName },
  });
  if (existingByUserName) {
    await prisma.users.update({
      where: { USER_ID: existingByUserName.USER_ID },
      data,
    });
    console.log(`Updated by username: ${account.email} (${account.role})`);
    return;
  }

  await prisma.users.create({
    data: {
      ...data,
      CREATED_BY: 'SYSTEM',
      CREATED_DATE: new Date(),
    },
  });
  console.log(`Created: ${account.email} (${account.role})`);
}

async function main() {
  for (const roleName of ALL_ROLES) {
    await upsertRole(roleName);
  }
  console.log(`Seeded ${ALL_ROLES.length} roles into ROLES table.`);

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const roleIdByName = new Map<RoleName, number>();

  for (const account of TEST_ACCOUNTS) {
    let roleId = roleIdByName.get(account.role);
    if (roleId == null) {
      roleId = await upsertRole(account.role);
      roleIdByName.set(account.role, roleId);
    }
    await upsertAccount(account, roleId, passwordHash);
  }

  console.log(
    `Seeded ${TEST_ACCOUNTS.length} staff test accounts (password: ${TEST_PASSWORD}).`,
  );

  await seedWardsAndBeds();
  await seedNursingOpsDemo();
  await seedDiagnosesDemo();
  await seedCertificateTemplates();
  await seedBloodBankDemo();
}

async function seedBloodBankDemo() {
  const existing = await prisma.bloodUnits.count();
  if (existing > 0) {
    console.log('Blood bank units already present — skip seed.');
    return;
  }
  const now = new Date();
  const units = [
    { UNIT_NO: 'BU-2410', BLOOD_GROUP: 'O+', COMPONENT: 'Whole Blood', EXPIRY_DATE: new Date('2026-06-12'), STATUS: 'Available', DONOR_LABEL: 'Donor A' },
    { UNIT_NO: 'BU-2411', BLOOD_GROUP: 'A+', COMPONENT: 'Packed Cells', EXPIRY_DATE: new Date('2026-07-08'), STATUS: 'Available', DONOR_LABEL: 'Donor B' },
    { UNIT_NO: 'BU-2412', BLOOD_GROUP: 'B-', COMPONENT: 'FFP', EXPIRY_DATE: new Date('2026-05-30'), STATUS: 'Available', DONOR_LABEL: 'Donor C' },
    { UNIT_NO: 'BU-2413', BLOOD_GROUP: 'AB+', COMPONENT: 'Platelets', EXPIRY_DATE: new Date('2026-07-15'), STATUS: 'Available', DONOR_LABEL: 'Donor D' },
    { UNIT_NO: 'BU-2414', BLOOD_GROUP: 'O-', COMPONENT: 'Whole Blood', EXPIRY_DATE: new Date('2026-04-20'), STATUS: 'Expired', DONOR_LABEL: 'Donor E' },
    { UNIT_NO: 'BU-2415', BLOOD_GROUP: 'A-', COMPONENT: 'Packed Cells', EXPIRY_DATE: new Date('2026-08-10'), STATUS: 'Available', DONOR_LABEL: 'Donor F' },
  ];
  for (const u of units) {
    await prisma.bloodUnits.create({
      data: {
        ...u,
        CREATED_BY: 'seed',
        CREATED_DATE: now,
      },
    });
  }

  const person = await prisma.persons.findFirst({ orderBy: { PERSON_ID: 'asc' } });
  if (person) {
    const pending = await prisma.bloodRequests.create({
      data: {
        REQUEST_NO: `TMP-BR-${Date.now()}`,
        PERSON_ID: person.PERSON_ID,
        BLOOD_GROUP: 'A+',
        UNITS_REQUESTED: 2,
        DEPARTMENT: 'Female Ward',
        DOCTOR_LABEL: 'Dr. Adeyemi',
        STATUS: 'Pending',
        CROSS_MATCH_RESULT: 'Pending',
        NOTES: 'Seed pending request',
        CREATED_BY: 'seed',
        CREATED_DATE: now,
      },
    });
    await prisma.bloodRequests.update({
      where: { BLOOD_REQUEST_ID: pending.BLOOD_REQUEST_ID },
      data: { REQUEST_NO: `BR-${now.getFullYear()}-${String(pending.BLOOD_REQUEST_ID).padStart(4, '0')}` },
    });
    await prisma.bloodRequestEvents.create({
      data: {
        BLOOD_REQUEST_ID: pending.BLOOD_REQUEST_ID,
        ACTION: 'Created',
        ACTOR_LABEL: 'seed',
      },
    });

    const xm = await prisma.bloodRequests.create({
      data: {
        REQUEST_NO: `TMP-BR2-${Date.now()}`,
        PERSON_ID: person.PERSON_ID,
        BLOOD_GROUP: 'O-',
        UNITS_REQUESTED: 1,
        DEPARTMENT: 'ICU',
        DOCTOR_LABEL: 'Dr. Ojo',
        STATUS: 'Crossmatching',
        CROSS_MATCH_RESULT: 'Pending',
        NOTES: 'Seed crossmatching request',
        CREATED_BY: 'seed',
        CREATED_DATE: now,
      },
    });
    await prisma.bloodRequests.update({
      where: { BLOOD_REQUEST_ID: xm.BLOOD_REQUEST_ID },
      data: { REQUEST_NO: `BR-${now.getFullYear()}-${String(xm.BLOOD_REQUEST_ID).padStart(4, '0')}` },
    });
    await prisma.bloodRequestEvents.create({
      data: {
        BLOOD_REQUEST_ID: xm.BLOOD_REQUEST_ID,
        ACTION: 'Crossmatch started',
        ACTOR_LABEL: 'seed',
      },
    });
  }
  console.log('Seeded blood bank demo units and requests.');
}

/** All 16 DOC_TYPES from fnph-aro DoctorCertificatesReportsEngine. */
async function seedCertificateTemplates() {
  const FIELD_LABELS: Record<string, string> = {
    reason: 'Reason for report',
    diagnosis: 'Diagnosis',
    findings: 'Clinical findings',
    treatment: 'Treatment given',
    recommendation: 'Recommendation',
    purpose: 'Fitness purpose',
    examFindings: 'Examination findings',
    fitStatus: 'Fit / Unfit',
    validity: 'Validity period',
    days: 'Number of days',
    startDate: 'Start date',
    endDate: 'End date',
    reviewDate: 'Review date',
    receivingFacility: 'Receiving hospital/doctor',
    clinicalSummary: 'Clinical summary',
    medications: 'Current medication',
    investigations: 'Investigation summary',
    procedure: 'Procedure name',
    indication: 'Indication',
    outcome: 'Outcome',
    complications: 'Complications',
    postPlan: 'Post-procedure plan',
    deathDateTime: 'Date/time of death',
    causeOfDeath: 'Cause of death',
    certifyingDoctor: 'Certifying doctor',
    confirmation: 'Confirmation details',
    nextOfKin: 'Next of kin notification',
    motherDetails: 'Mother details',
    babyDetails: 'Baby details',
    birthDateTime: 'Date/time of birth',
    deliveryDetails: 'Delivery details',
    attendingStaff: 'Attending staff',
    mse: 'Mental state examination',
    riskAssessment: 'Risk assessment summary',
    treatmentPlan: 'Treatment plan',
    competencyComment: 'Fitness/competency comment',
    insurer: 'Insurer',
    policyNo: 'Policy/claim number',
    treatmentSummary: 'Treatment summary',
    costNotes: 'Cost/claim notes',
    admissionDate: 'Admission date',
    dischargeDate: 'Discharge date',
    followUp: 'Follow-up plan',
    treatmentGiven: 'Treatment given',
    response: 'Response to treatment',
    interpretation: 'Interpretation',
    indications: 'Indications',
    adherence: 'Adherence notes',
    caseRef: 'Case reference',
    requestingAuthority: 'Requesting authority',
    opinion: 'Medical opinion',
    competency: 'Competency assessment',
    schoolName: 'School name',
    fitForSchool: 'Fit for school',
    restrictions: 'Restrictions',
    employer: 'Employer',
    fitDate: 'Fit to resume date',
  };

  type SeedTpl = {
    name: string;
    desc: string;
    approval: boolean;
    fields: string[];
    category: 'Certificate' | 'Report';
    layout: 'Standard' | 'Legal' | 'Insurance';
  };

  const DOC_TYPES: SeedTpl[] = [
    {
      name: 'Medical Report',
      desc: 'General clinical report for third parties',
      approval: false,
      fields: ['reason', 'diagnosis', 'findings', 'treatment', 'recommendation'],
      category: 'Report',
      layout: 'Standard',
    },
    {
      name: 'Fitness Certificate',
      desc: 'Fitness for work, travel, or sport',
      approval: false,
      fields: ['purpose', 'examFindings', 'fitStatus', 'validity'],
      category: 'Certificate',
      layout: 'Standard',
    },
    {
      name: 'Sick Leave',
      desc: 'Certified sick leave period',
      approval: false,
      fields: ['diagnosis', 'days', 'startDate', 'endDate', 'reviewDate'],
      category: 'Certificate',
      layout: 'Standard',
    },
    {
      name: 'Referral Letter',
      desc: 'Referral to external facility',
      approval: false,
      fields: [
        'receivingFacility',
        'reason',
        'clinicalSummary',
        'medications',
        'investigations',
      ],
      category: 'Report',
      layout: 'Standard',
    },
    {
      name: 'Procedure Report',
      desc: 'Procedure documentation',
      approval: false,
      fields: [
        'procedure',
        'indication',
        'findings',
        'outcome',
        'complications',
        'postPlan',
      ],
      category: 'Report',
      layout: 'Standard',
    },
    {
      name: 'Death Certificate',
      desc: 'Official death certification',
      approval: true,
      fields: [
        'deathDateTime',
        'causeOfDeath',
        'certifyingDoctor',
        'confirmation',
        'nextOfKin',
      ],
      category: 'Certificate',
      layout: 'Legal',
    },
    {
      name: 'Birth Notification',
      desc: 'Birth registration notification',
      approval: true,
      fields: [
        'motherDetails',
        'babyDetails',
        'birthDateTime',
        'deliveryDetails',
        'attendingStaff',
      ],
      category: 'Certificate',
      layout: 'Legal',
    },
    {
      name: 'Psychiatric Report',
      desc: 'Mental health assessment report',
      approval: false,
      fields: [
        'diagnosis',
        'mse',
        'riskAssessment',
        'treatmentPlan',
        'competencyComment',
      ],
      category: 'Report',
      layout: 'Standard',
    },
    {
      name: 'Insurance Report',
      desc: 'Insurance / HMO claim report',
      approval: false,
      fields: [
        'insurer',
        'policyNo',
        'diagnosis',
        'treatmentSummary',
        'costNotes',
      ],
      category: 'Report',
      layout: 'Insurance',
    },
    {
      name: 'Discharge Summary',
      desc: 'Hospital discharge summary',
      approval: false,
      fields: [
        'admissionDate',
        'dischargeDate',
        'diagnosis',
        'treatment',
        'followUp',
      ],
      category: 'Report',
      layout: 'Standard',
    },
    {
      name: 'Treatment Summary',
      desc: 'Summary of treatment course',
      approval: false,
      fields: ['diagnosis', 'treatmentGiven', 'response', 'recommendation'],
      category: 'Report',
      layout: 'Standard',
    },
    {
      name: 'Investigation Summary',
      desc: 'Lab and imaging summary',
      approval: false,
      fields: [
        'investigations',
        'findings',
        'interpretation',
        'recommendation',
      ],
      category: 'Report',
      layout: 'Standard',
    },
    {
      name: 'Medication Report',
      desc: 'Current medication list report',
      approval: false,
      fields: ['medications', 'indications', 'adherence', 'recommendation'],
      category: 'Report',
      layout: 'Standard',
    },
    {
      name: 'Court / Legal Medical Report',
      desc: 'Medico-legal report for court',
      approval: true,
      fields: [
        'caseRef',
        'requestingAuthority',
        'findings',
        'opinion',
        'competency',
      ],
      category: 'Report',
      layout: 'Legal',
    },
    {
      name: 'School Medical Report',
      desc: 'School fitness / health report',
      approval: false,
      fields: ['schoolName', 'findings', 'fitForSchool', 'restrictions'],
      category: 'Report',
      layout: 'Standard',
    },
    {
      name: 'Work Resumption Certificate',
      desc: 'Return-to-work certification',
      approval: false,
      fields: [
        'employer',
        'diagnosis',
        'fitDate',
        'restrictions',
        'reviewDate',
      ],
      category: 'Certificate',
      layout: 'Standard',
    },
  ];

  const toCode = (name: string) =>
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

  const now = new Date();
  let upserted = 0;
  for (const dt of DOC_TYPES) {
    const code = toCode(dt.name);
    const fieldSchema = dt.fields.map((key) => ({
      key,
      label: FIELD_LABELS[key] ?? key,
    }));
    await prisma.certificateTemplates.upsert({
      where: { CODE: code },
      create: {
        CODE: code,
        NAME: dt.name,
        DESCRIPTION: dt.desc,
        CATEGORY: dt.category,
        FIELD_SCHEMA: fieldSchema,
        APPROVAL_REQUIRED: dt.approval,
        LAYOUT: dt.layout,
        STATUS: 'Active',
        CREATED_BY: 'SYSTEM',
        CREATED_DATE: now,
        UPDATED_BY: 'SYSTEM',
        UPDATED_DATE: now,
      },
      update: {
        NAME: dt.name,
        DESCRIPTION: dt.desc,
        CATEGORY: dt.category,
        FIELD_SCHEMA: fieldSchema,
        APPROVAL_REQUIRED: dt.approval,
        LAYOUT: dt.layout,
        STATUS: 'Active',
        UPDATED_BY: 'SYSTEM',
        UPDATED_DATE: now,
      },
    });
    upserted += 1;
  }
  console.log(`Seeded ${upserted} certificate templates.`);
}

async function seedWardsAndBeds() {
  const now = new Date();
  const twentyBeds = Array.from({ length: 20 }, (_, i) =>
    String(i + 1).padStart(2, '0'),
  );

  const wards: Array<{
    code: string;
    name: string;
    wardType: string;
    wardClass: string;
    gender: string;
    dailyBedRate: number;
    depositDefault: number;
    beds: string[];
  }> = [
    {
      code: 'W1C',
      name: 'Ward 1C',
      wardType: 'Psychiatric',
      wardClass: 'General',
      gender: 'Mixed',
      dailyBedRate: 5000,
      depositDefault: 50000,
      beds: twentyBeds,
    },
    {
      code: 'ICU',
      name: 'ICU',
      wardType: 'ICU',
      wardClass: 'ICU',
      gender: 'Mixed',
      dailyBedRate: 80000,
      depositDefault: 100000,
      beds: twentyBeds,
    },
    {
      code: 'GEN',
      name: 'General Ward',
      wardType: 'General',
      wardClass: 'General',
      gender: 'Mixed',
      dailyBedRate: 5000,
      depositDefault: 50000,
      beds: twentyBeds,
    },
    {
      code: 'PRIV',
      name: 'Private Ward',
      wardType: 'General',
      wardClass: 'Private',
      gender: 'Mixed',
      dailyBedRate: 40000,
      depositDefault: 75000,
      beds: twentyBeds,
    },
    {
      code: 'VIP',
      name: 'VIP Ward',
      wardType: 'General',
      wardClass: 'VIP',
      gender: 'Mixed',
      dailyBedRate: 80000,
      depositDefault: 100000,
      beds: twentyBeds,
    },
    {
      code: 'SEMI',
      name: 'Semi Private Ward',
      wardType: 'General',
      wardClass: 'SemiPrivate',
      gender: 'Mixed',
      dailyBedRate: 20000,
      depositDefault: 60000,
      beds: twentyBeds,
    },
    {
      code: 'MGEN',
      name: 'Male General Ward',
      wardType: 'General',
      wardClass: 'General',
      gender: 'Male',
      dailyBedRate: 5000,
      depositDefault: 50000,
      beds: twentyBeds,
    },
    {
      code: 'FGEN',
      name: 'Female General Ward',
      wardType: 'General',
      wardClass: 'General',
      gender: 'Female',
      dailyBedRate: 5000,
      depositDefault: 50000,
      beds: twentyBeds,
    },
    {
      code: 'MVIP',
      name: 'Male VIP Ward',
      wardType: 'General',
      wardClass: 'VIP',
      gender: 'Male',
      dailyBedRate: 80000,
      depositDefault: 100000,
      beds: twentyBeds,
    },
    {
      code: 'FVIP',
      name: 'Female VIP Ward',
      wardType: 'General',
      wardClass: 'VIP',
      gender: 'Female',
      dailyBedRate: 80000,
      depositDefault: 100000,
      beds: twentyBeds,
    },
    {
      code: 'MIXG',
      name: 'Mixed Medical Ward',
      wardType: 'General',
      wardClass: 'General',
      gender: 'Mixed',
      dailyBedRate: 5000,
      depositDefault: 50000,
      beds: twentyBeds,
    },
  ];

  for (const w of wards) {
    let ward = await prisma.wards.findUnique({ where: { CODE: w.code } });
    if (!ward) {
      ward = await prisma.wards.create({
        data: {
          CODE: w.code,
          NAME: w.name,
          WARD_TYPE: w.wardType,
          WARD_CLASS: w.wardClass,
          GENDER: w.gender,
          DAILY_BED_RATE: w.dailyBedRate,
          ADMISSION_DEPOSIT_DEFAULT: w.depositDefault,
          STATUS: 'Active',
          CREATED_BY: 'SYSTEM',
          CREATED_DATE: now,
        },
      });
      console.log(`Created ward: ${w.name} (${w.code})`);
    } else {
      await prisma.wards.update({
        where: { WARD_ID: ward.WARD_ID },
        data: {
          NAME: w.name,
          WARD_TYPE: w.wardType,
          WARD_CLASS: w.wardClass,
          GENDER: w.gender,
          DAILY_BED_RATE: w.dailyBedRate,
          ADMISSION_DEPOSIT_DEFAULT: w.depositDefault,
          STATUS: 'Active',
          UPDATED_BY: 'SYSTEM',
          UPDATED_DATE: now,
        },
      });
    }

    for (const label of w.beds) {
      const existing = await prisma.beds.findFirst({
        where: { WARD_ID: ward.WARD_ID, LABEL: label },
      });
      if (!existing) {
        await prisma.beds.create({
          data: {
            WARD_ID: ward.WARD_ID,
            LABEL: label,
            STATUS: 'AVAILABLE',
            CREATED_BY: 'SYSTEM',
            CREATED_DATE: now,
          },
        });
      }
    }
  }

  console.log('Seeded wards/beds with gender + 20 beds each if missing.');
  await seedAdmissionRequestsDemo();
  await seedPatientTransfersDemo();
  await seedClinicalReferralsDemo();
  await seedDischargeDraftsDemo();
}

/** Demo Submitted admission requests for Records queue smoke tests. */
async function seedAdmissionRequestsDemo() {
  const existing = await prisma.admissionRequests.count({
    where: { STATUS: 'Submitted' },
  });
  if (existing >= 2) {
    console.log('Admission request demo skipped (Submitted requests already present).');
    return;
  }

  const persons = await prisma.persons.findMany({
    orderBy: { PERSON_ID: 'asc' },
    take: 3,
  });
  if (persons.length === 0) {
    console.log('Admission request demo skipped (no persons).');
    return;
  }

  const ward = await prisma.wards.findFirst({
    where: { CODE: { in: ['GEN', 'W1C'] }, STATUS: 'Active' },
    orderBy: { WARD_ID: 'asc' },
  });

  const year = new Date().getFullYear();
  const now = new Date();
  let seq = (await prisma.admissionRequests.count()) + 1;

  for (const person of persons.slice(0, 2)) {
    const requestNo = `AR-${year}-${String(seq).padStart(4, '0')}`;
    seq += 1;
    const clash = await prisma.admissionRequests.findUnique({
      where: { REQUEST_NO: requestNo },
    });
    if (clash) continue;

    await prisma.admissionRequests.create({
      data: {
        REQUEST_NO: requestNo,
        PERSON_ID: person.PERSON_ID,
        WARD_ID: ward?.WARD_ID ?? null,
        WARD_PREFERENCE: ward?.NAME ?? 'General Ward',
        PRIORITY: 'Routine',
        ADMISSION_TYPE: 'New admission',
        PROVISIONAL_DIAGNOSIS: 'Seed provisional diagnosis for Records admit flow',
        CLINICAL_INDICATION: 'Demo admission request — allocate bed then admit',
        STATUS: 'Submitted',
        REQUESTED_BY: 'SYSTEM',
        CREATED_BY: 'SYSTEM',
        CREATED_DATE: now,
      },
    });
    console.log(`Created admission request ${requestNo} for person ${person.PERSON_ID}`);
  }
}

/**
 * Demo inpatient admissions + transfer queue rows for nurse/records smoke tests.
 * Creates up to 2 active admissions on different wards when missing, then
 * Submitted / AwaitingBed / BedReserved transfers.
 */
async function seedPatientTransfersDemo() {
  const existing = await prisma.patientTransfers.count();
  if (existing >= 3) {
    console.log('Patient transfer demo skipped (transfers already present).');
    return;
  }

  const persons = await prisma.persons.findMany({
    orderBy: { PERSON_ID: 'asc' },
    take: 4,
  });
  if (persons.length < 2) {
    console.log('Patient transfer demo skipped (need ≥2 persons).');
    return;
  }

  const genWard = await prisma.wards.findFirst({
    where: { CODE: { in: ['GEN', 'W1C'] }, STATUS: 'Active' },
  });
  const icuWard = await prisma.wards.findFirst({
    where: { CODE: { in: ['ICU', 'PRIV'] }, STATUS: 'Active' },
  });
  if (!genWard || !icuWard) {
    console.log('Patient transfer demo skipped (wards missing).');
    return;
  }

  const now = new Date();
  const year = new Date().getFullYear();

  async function ensureAdmission(
    personId: number,
    wardId: number,
  ): Promise<{ admissionId: number; bedId: number | null; wardId: number } | null> {
    const existingAdm = await prisma.admissions.findFirst({
      where: {
        PERSON_ID: personId,
        STATUS: { in: ['ADMITTED', 'ACTIVE', 'Active', 'Admitted', 'BED_ALLOCATED'] },
      },
      orderBy: { ADMISSION_ID: 'desc' },
    });
    if (existingAdm) {
      return {
        admissionId: existingAdm.ADMISSION_ID,
        bedId: existingAdm.BED_ID,
        wardId: existingAdm.WARD_ID ?? wardId,
      };
    }
    const bed = await prisma.beds.findFirst({
      where: { WARD_ID: wardId, STATUS: 'AVAILABLE' },
      orderBy: { BED_ID: 'asc' },
    });
    if (!bed) return null;
    const adm = await prisma.admissions.create({
      data: {
        PERSON_ID: personId,
        WARD_ID: wardId,
        BED_ID: bed.BED_ID,
        DIAGNOSIS: 'Seed admission for transfer demo',
        ADMISSION_TYPE: 'General',
        STATUS: 'ADMITTED',
        ADMITTED_AT: now,
        CREATED_BY: 'SYSTEM',
        CREATED_DATE: now,
      },
    });
    await prisma.beds.update({
      where: { BED_ID: bed.BED_ID },
      data: { STATUS: 'OCCUPIED', UPDATED_BY: 'SYSTEM', UPDATED_DATE: now },
    });
    return { admissionId: adm.ADMISSION_ID, bedId: bed.BED_ID, wardId };
  }

  const admA = await ensureAdmission(persons[0].PERSON_ID, genWard.WARD_ID);
  const admB = await ensureAdmission(persons[1].PERSON_ID, icuWard.WARD_ID);
  if (!admA || !admB) {
    console.log('Patient transfer demo skipped (could not ensure admissions/beds).');
    return;
  }

  let seq = (await prisma.patientTransfers.count()) + 1;
  const nextNo = () => {
    const no = `XFR-${year}-${String(seq).padStart(4, '0')}`;
    seq += 1;
    return no;
  };

  const destBed = await prisma.beds.findFirst({
    where: { WARD_ID: icuWard.WARD_ID, STATUS: 'AVAILABLE' },
    orderBy: { BED_ID: 'asc' },
  });

  const samples: Array<{
    personId: number;
    admissionId: number;
    fromWardId: number;
    toWardId: number;
    status: string;
    preference: string;
    allocateBedId?: number;
  }> = [
    {
      personId: persons[0].PERSON_ID,
      admissionId: admA.admissionId,
      fromWardId: admA.wardId,
      toWardId: icuWard.WARD_ID,
      status: 'Submitted',
      preference: icuWard.NAME,
    },
    {
      personId: persons[1].PERSON_ID,
      admissionId: admB.admissionId,
      fromWardId: admB.wardId,
      toWardId: genWard.WARD_ID,
      status: 'AwaitingBed',
      preference: genWard.NAME,
    },
  ];

  if (destBed && persons[2]) {
    const admC = await ensureAdmission(persons[2].PERSON_ID, genWard.WARD_ID);
    if (admC) {
      samples.push({
        personId: persons[2].PERSON_ID,
        admissionId: admC.admissionId,
        fromWardId: admC.wardId,
        toWardId: icuWard.WARD_ID,
        status: 'BedReserved',
        preference: icuWard.NAME,
        allocateBedId: destBed.BED_ID,
      });
    }
  }

  for (const s of samples) {
    const transferNo = nextNo();
    const clash = await prisma.patientTransfers.findUnique({
      where: { TRANSFER_NO: transferNo },
    });
    if (clash) continue;

    if (s.allocateBedId) {
      await prisma.beds.update({
        where: { BED_ID: s.allocateBedId },
        data: { STATUS: 'RESERVED', UPDATED_BY: 'SYSTEM', UPDATED_DATE: now },
      });
    }

    const created = await prisma.patientTransfers.create({
      data: {
        TRANSFER_NO: transferNo,
        PERSON_ID: s.personId,
        ADMISSION_ID: s.admissionId,
        TRANSFER_TYPE: 'WardToWard',
        PRIORITY: 'Routine',
        FROM_WARD_ID: s.fromWardId,
        TO_WARD_ID: s.toWardId,
        TO_WARD_PREFERENCE: s.preference,
        DESTINATION_LABEL: s.preference,
        ALLOCATED_BED_ID: s.allocateBedId ?? null,
        REASON: 'Seed demo transfer for nurse/records queue',
        CLINICAL_NOTES: 'Demo clinical notes — safe to process in non-prod',
        STATUS: s.status,
        ALLOCATED_AT: s.allocateBedId ? now : null,
        CREATED_BY: 'SYSTEM',
        CREATED_DATE: now,
        UPDATED_BY: 'SYSTEM',
        UPDATED_DATE: now,
      },
    });
    await prisma.patientTransferEvents.create({
      data: {
        TRANSFER_ID: created.TRANSFER_ID,
        EVENT_TYPE: 'transfer:create',
        ACTOR_LABEL: 'SYSTEM',
        NOTE: 'Seeded demo transfer',
        OLD_STATUS: null,
        NEW_STATUS: s.status,
        CREATED_DATE: now,
      },
    });
    console.log(`Created transfer ${transferNo} (${s.status})`);
  }
}

/** Demo clinical referrals for Records / doctor smoke tests. */
async function seedClinicalReferralsDemo() {
  const existing = await prisma.clinicalReferrals.count();
  if (existing >= 3) {
    console.log('Clinical referral demo skipped (referrals already present).');
    return;
  }

  const persons = await prisma.persons.findMany({
    orderBy: { PERSON_ID: 'asc' },
    take: 4,
  });
  if (persons.length < 2) {
    console.log('Clinical referral demo skipped (need ≥2 persons).');
    return;
  }

  const year = new Date().getFullYear();
  const now = new Date();
  let seq = (await prisma.clinicalReferrals.count()) + 1;
  const nextNo = () => {
    const no = `REF-${year}-${String(seq).padStart(4, '0')}`;
    seq += 1;
    return no;
  };

  const samples: Array<{
    personId: number;
    kind: string;
    care: string;
    toDept: string;
    status: string;
    facility?: string;
  }> = [
    {
      personId: persons[0].PERSON_ID,
      kind: 'Internal',
      care: 'Outpatient',
      toDept: 'Psychology',
      status: 'Submitted',
    },
    {
      personId: persons[1].PERSON_ID,
      kind: 'Internal',
      care: 'Inpatient',
      toDept: 'OPC',
      status: 'Submitted',
    },
    {
      personId: persons[Math.min(2, persons.length - 1)].PERSON_ID,
      kind: 'External',
      care: 'Outpatient',
      toDept: '',
      status: 'Submitted',
      facility: 'LUTH',
    },
  ];

  for (const s of samples) {
    const referralNo = nextNo();
    const clash = await prisma.clinicalReferrals.findUnique({
      where: { REFERRAL_NO: referralNo },
    });
    if (clash) continue;

    const created = await prisma.clinicalReferrals.create({
      data: {
        REFERRAL_NO: referralNo,
        PERSON_ID: s.personId,
        REFERRAL_KIND: s.kind,
        CARE_SETTING: s.care,
        PRIORITY: 'Routine',
        FROM_DEPARTMENT: 'OPC',
        TO_DEPARTMENT: s.toDept || null,
        EXTERNAL_FACILITY: s.facility ?? null,
        REASON: 'Seed demo clinical referral',
        PROVISIONAL_DIAGNOSIS: 'Demo provisional diagnosis',
        CLINICAL_SUMMARY: 'Seeded for Records / nurse / doctor smoke tests',
        STATUS: s.status,
        CREATED_BY: 'SYSTEM',
        CREATED_DATE: now,
        UPDATED_BY: 'SYSTEM',
        UPDATED_DATE: now,
      },
    });
    await prisma.clinicalReferralEvents.create({
      data: {
        REFERRAL_ID: created.REFERRAL_ID,
        EVENT_TYPE: 'referral:create',
        ACTOR_LABEL: 'SYSTEM',
        NOTE: 'Seeded demo referral',
        NEW_STATUS: s.status,
        CREATED_DATE: now,
      },
    });
    console.log(`Created referral ${referralNo} (${s.kind}/${s.status})`);
  }
}

/** Demo discharge drafts for doctor / cashier / Records smoke tests. */
async function seedDischargeDraftsDemo() {
  const existing = await prisma.dischargeDrafts.count();
  if (existing >= 1) {
    console.log('Discharge draft demo skipped (drafts already present).');
    return;
  }

  const admissions = await prisma.admissions.findMany({
    where: { STATUS: { in: ['ADMITTED', 'DISCHARGE_ORDERED'] } },
    orderBy: { ADMISSION_ID: 'asc' },
    take: 2,
  });
  if (admissions.length === 0) {
    console.log('Discharge draft demo skipped (no active admissions).');
    return;
  }

  const year = new Date().getFullYear();
  const now = new Date();
  let seq = 1;
  for (const adm of admissions) {
    const draftNo = `DSD-${year}-${String(seq).padStart(4, '0')}`;
    seq += 1;
    const clash = await prisma.dischargeDrafts.findUnique({
      where: { DRAFT_NO: draftNo },
    });
    if (clash) continue;

    const created = await prisma.dischargeDrafts.create({
      data: {
        DRAFT_NO: draftNo,
        PERSON_ID: adm.PERSON_ID,
        ADMISSION_ID: adm.ADMISSION_ID,
        STATUS: 'AwaitingPayment',
        ADMISSION_DIAGNOSIS: adm.DIAGNOSIS,
        FINAL_DIAGNOSIS: adm.DIAGNOSIS ?? 'Demo final diagnosis',
        CLINICAL_SUMMARY: 'Seeded discharge draft for smoke tests',
        DISCHARGE_MEDICATIONS: 'Continue current meds x 14 days',
        FOLLOW_UP_PLAN: 'OPC review in 1 week',
        DISCHARGE_TYPE: 'Routine',
        SUBMITTED_AT: now,
        CREATED_BY: 'SYSTEM',
        CREATED_DATE: now,
        UPDATED_BY: 'SYSTEM',
        UPDATED_DATE: now,
      },
    });
    await prisma.dischargeDraftEvents.create({
      data: {
        DRAFT_ID: created.DRAFT_ID,
        EVENT_TYPE: 'discharge:seed',
        ACTOR_LABEL: 'SYSTEM',
        NOTE: 'Seeded demo discharge draft',
        NEW_STATUS: 'AwaitingPayment',
        CREATED_DATE: now,
      },
    });
    if (adm.STATUS === 'ADMITTED') {
      await prisma.admissions.update({
        where: { ADMISSION_ID: adm.ADMISSION_ID },
        data: {
          STATUS: 'DISCHARGE_ORDERED',
          DISCHARGE_ORDERED_AT: now,
          DISCHARGE_ORDERED_BY: 'SYSTEM',
          DISCHARGE_REASON: 'Seeded discharge draft',
          UPDATED_BY: 'SYSTEM',
          UPDATED_DATE: now,
        },
      });
    }
    console.log(`Created discharge draft ${draftNo}`);
  }
}

/** Demo orders / MAR / tasks for nursing Phases 10–12 smoke tests. */
async function seedNursingOpsDemo() {
  const existing = await prisma.nursingOrders.count();
  if (existing > 0) {
    console.log('Nursing ops demo skipped (orders already present).');
    return;
  }

  const person = await prisma.persons.findFirst({
    orderBy: { PERSON_ID: 'asc' },
  });
  if (!person) {
    console.log('Nursing ops demo skipped (no persons).');
    return;
  }

  const admission = await prisma.admissions.findFirst({
    where: {
      PERSON_ID: person.PERSON_ID,
      STATUS: { in: ['ACTIVE', 'Active', 'Admitted'] },
    },
    orderBy: { ADMISSION_ID: 'desc' },
  });

  const now = new Date();
  const lab = await prisma.nursingOrders.create({
    data: {
      PERSON_ID: person.PERSON_ID,
      ADMISSION_ID: admission?.ADMISSION_ID ?? null,
      KIND: 'lab',
      ITEMS_JSON: JSON.stringify([
        { code: 'FBC', name: 'Full Blood Count', price: 2500 },
        { code: 'EUCr', name: 'E/U/Cr', price: 3000 },
      ]),
      STATUS: 'ORDERED',
      ORDERED_BY: 'Dr. Seed',
      PAYMENT_STATUS: 'PAID',
      LAB_STATUS: 'ORDERED',
      CREATED_BY_ID: null,
      CREATED_DATE: now,
    },
  });

  const drug = await prisma.nursingOrders.create({
    data: {
      PERSON_ID: person.PERSON_ID,
      ADMISSION_ID: admission?.ADMISSION_ID ?? null,
      KIND: 'drug',
      ITEMS_JSON: JSON.stringify([
        { code: 'SER50', name: 'Sertraline 50mg', price: 500 },
      ]),
      STATUS: 'ORDERED',
      ORDERED_BY: 'Dr. Seed',
      PAYMENT_STATUS: 'PAID',
      CREATED_DATE: now,
    },
  });

  await prisma.nursingMarEntries.create({
    data: {
      PERSON_ID: person.PERSON_ID,
      ADMISSION_ID: admission?.ADMISSION_ID ?? null,
      ORDER_ID: drug.ORDER_ID,
      DRUG: 'Sertraline 50mg',
      DOSE: '50mg',
      ROUTE: 'PO',
      FREQUENCY: 'OD',
      SCHEDULED_TIME: now,
      KIND: 'Scheduled',
      STATUS: 'DUE',
      PHARMACY_DISPENSED: true,
      CREATED_DATE: now,
    },
  });

  await prisma.nursingTasks.create({
    data: {
      PERSON_ID: person.PERSON_ID,
      ADMISSION_ID: admission?.ADMISSION_ID ?? null,
      PATIENT_NAME: [person.FIRST_NAME, person.LAST_NAME]
        .filter(Boolean)
        .join(' '),
      TITLE: `Lab order ready for collection (#${lab.ORDER_ID})`,
      CATEGORY: 'Sample',
      STATUS: 'PENDING',
      SOURCE_ORDER_ID: lab.ORDER_ID,
      CREATED_BY: 'SYSTEM',
      CREATED_DATE: now,
    },
  });

  await prisma.nursingMessages.create({
    data: {
      CHANNEL: 'Doctors',
      BODY: 'Seed message: please acknowledge pending ward orders.',
      FROM_LABEL: 'Matron (seed)',
      IS_MINE: false,
      CREATED_DATE: now,
    },
  });

  console.log(
    `Seeded nursing ops demo (person #${person.PERSON_ID}: lab #${lab.ORDER_ID}, drug #${drug.ORDER_ID}).`,
  );
}

/** Demo patient diagnoses for Doctor Diagnosis Engine smoke tests. */
async function seedDiagnosesDemo() {
  const catalogCount = await prisma.diagnosisCodes.count();
  if (catalogCount === 0) {
    console.log('Diagnosis demo skipped (catalog empty — run migrations).');
    return;
  }
  const existing = await prisma.patientDiagnoses.count();
  if (existing > 0) {
    console.log('Diagnosis demo skipped (patient diagnoses already present).');
    return;
  }
  const person = await prisma.persons.findFirst({ orderBy: { PERSON_ID: 'asc' } });
  if (!person) {
    console.log('Diagnosis demo skipped (no persons).');
    return;
  }
  const codes = await prisma.diagnosisCodes.findMany({
    where: { CODE: { in: ['6A70.1', 'BA00', '6B00'] }, STATUS: 'Active' },
  });
  const now = new Date();
  for (const c of codes) {
    await prisma.patientDiagnoses.create({
      data: {
        PERSON_ID: person.PERSON_ID,
        CODE: c.CODE,
        DSM_CODE: c.DSM_CODE,
        SYSTEM: c.SYSTEM,
        NAME: c.NAME,
        TYPE: c.CODE === 'BA00' ? 'Secondary' : 'Primary',
        SEVERITY: 'Moderate',
        STATUS: c.CODE === 'BA00' ? 'Chronic' : 'Active',
        CERTAINTY: 'Confirmed',
        ON_PROBLEM_LIST: true,
        IS_PSYCHIATRIC: c.IS_PSYCHIATRIC,
        CLINIC: c.IS_PSYCHIATRIC ? 'OPC' : 'GMPC',
        NOTES: 'Seed diagnosis for testing',
        CREATED_BY: 'SYSTEM',
        CREATED_DATE: now,
        UPDATED_BY: 'SYSTEM',
        UPDATED_DATE: now,
      },
    });
  }
  console.log(`Seeded ${codes.length} patient diagnoses for person #${person.PERSON_ID}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
