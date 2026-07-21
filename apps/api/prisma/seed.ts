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
          WARD_CLASS: w.wardClass,
          GENDER: w.gender,
          DAILY_BED_RATE: w.dailyBedRate,
          ADMISSION_DEPOSIT_DEFAULT: w.depositDefault,
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
