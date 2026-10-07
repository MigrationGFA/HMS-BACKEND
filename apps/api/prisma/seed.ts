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
  {
    email: 'stores@fnpharo.gov.ng',
    role: ROLES.STORES,
    firstName: 'General',
    lastName: 'Stores',
    userName: 'stores',
  },
  {
    email: 'fleet@fnpharo.gov.ng',
    role: ROLES.FLEET,
    firstName: 'Fleet',
    lastName: 'Transport',
    userName: 'fleet',
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
  await seedServiceCatalog();
  await seedPatientPortalLink();
  await seedNonClinicalSmokeData();
  await seedHrDemoEmployees();
  await seedHeipTemplates();
  await seedHeipDemoData();
}

/** Link patient@ test user to a demo PERSONS row for portal APIs. */
async function seedPatientPortalLink() {
  const patientUser = await prisma.users.findFirst({
    where: {
      EMAIL_ADDRESS: { equals: 'patient@fnpharo.gov.ng', mode: 'insensitive' },
    },
  });
  if (!patientUser) return;

  let person = patientUser.PERSON_ID
    ? await prisma.persons.findUnique({
        where: { PERSON_ID: patientUser.PERSON_ID },
      })
    : null;

  if (!person) {
    person = await prisma.persons.findFirst({
      where: { HOSPITAL_NO: 'DEMO-PORTAL-001' },
    });
  }

  if (!person) {
    person = await prisma.persons.create({
      data: {
        HOSPITAL_NO: 'DEMO-PORTAL-001',
        FIRST_NAME: 'Demo',
        LAST_NAME: 'Patient',
        SEX: 'Female',
        PATIENT_PHONE_NO: '08000000099',
        E_MAIL: 'patient@fnpharo.gov.ng',
        DATE_OF_REGISTRATION: new Date(),
        CARD_STATUS: 'Active',
        STATUS: 'Active',
        CREATED_BY: 'SYSTEM',
        CREATED_DATE: new Date(),
      },
    });
    console.log(`Created demo portal person ${person.HOSPITAL_NO}`);
  }

  if (patientUser.PERSON_ID !== person.PERSON_ID) {
    await prisma.users.update({
      where: { USER_ID: patientUser.USER_ID },
      data: {
        PERSON_ID: person.PERSON_ID,
        UPDATED_BY: 'SYSTEM',
        UPDATED_DATE: new Date(),
      },
    });
    console.log(
      `Linked patient@fnpharo.gov.ng → PERSON_ID ${person.PERSON_ID}`,
    );
  }
}

/** Sample store item + fleet vehicle for post-seed smoke tests. */
async function seedNonClinicalSmokeData() {
  const category = await prisma.storeItemCategories.findFirst({
    where: { CODE: 'STATIONERY' },
  });
  const location = await prisma.storeLocations.findFirst({
    where: { CODE: 'CENTRAL' },
  });

  if (category && location) {
    const existingItem = await prisma.storeItems.findFirst({
      where: { SKU: 'DEMO-GLOVES-100' },
    });
    if (!existingItem) {
      const item = await prisma.storeItems.create({
        data: {
          SKU: 'DEMO-GLOVES-100',
          NAME: 'Demo Nitrile Gloves (box)',
          CATEGORY_ID: category.CATEGORY_ID,
          UNIT: 'box',
          REORDER_LEVEL: 5,
          CREATED_BY: 'SYSTEM',
        },
      });
      await prisma.storeBatches.create({
        data: {
          ITEM_ID: item.ITEM_ID,
          LOCATION_ID: location.LOCATION_ID,
          BATCH_NO: 'DEMO-BATCH-001',
          QTY_RECEIVED: 20,
          QTY_AVAILABLE: 20,
          CREATED_BY: 'SYSTEM',
        },
      });
      console.log('Seeded demo store item DEMO-GLOVES-100');
    }
  }

  const existingVehicle = await prisma.fleetVehicles.findFirst({
    where: { REG_NO: 'FNPH-DEMO-01' },
  });
  if (!existingVehicle) {
    await prisma.fleetVehicles.create({
      data: {
        REG_NO: 'FNPH-DEMO-01',
        TYPE: 'Ambulance',
        MODEL: 'Demo Unit',
        STATUS: 'Available',
        CREATED_BY: 'SYSTEM',
      },
    });
    console.log('Seeded demo fleet vehicle FNPH-DEMO-01');
  }

  const existingDriver = await prisma.fleetDrivers.findFirst({
    where: { NAME: 'Demo Driver Musa' },
  });
  if (!existingDriver) {
    await prisma.fleetDrivers.create({
      data: {
        NAME: 'Demo Driver Musa',
        PHONE: '08030000001',
        LICENSE_NO: 'DRV-DEMO-001',
        STATUS: 'Active',
        CREATED_BY: 'SYSTEM',
      },
    });
    console.log('Seeded demo fleet driver');
  }

  const existingSupplier = await prisma.scmSuppliers.findFirst({
    where: { NAME: 'Demo Hospital Supplies Ltd' },
  });
  if (!existingSupplier) {
    await prisma.scmSuppliers.create({
      data: {
        NAME: 'Demo Hospital Supplies Ltd',
        CONTACT_PERSON: 'Ada Okoro',
        PHONE: '08030000002',
        EMAIL: 'supplies.demo@example.com',
        STATUS: 'Active',
        CREATED_BY: 'SYSTEM',
      },
    });
    console.log('Seeded demo SCM supplier');
  }

  const existingMenu = await prisma.kitchenMenus.findFirst({
    where: { NAME: 'Demo Regular Lunch' },
  });
  if (!existingMenu) {
    await prisma.kitchenMenus.create({
      data: {
        NAME: 'Demo Regular Lunch',
        MEAL_SLOT: 'Lunch',
        DESCRIPTION: 'Rice, stew, protein, vegetables',
        DIET_TAGS: 'Regular',
        STATUS: 'Active',
        CREATED_BY: 'SYSTEM',
      },
    });
    console.log('Seeded demo kitchen menu');
  }
}

/**
 * Ensure every staff TEST_ACCOUNT (except PATIENT) has an HR_EMPLOYEES row
 * and USERS.EMPLOYEE_ID ↔ HR_EMPLOYEES.USER_ID link for My HR / HEIP.
 */
async function seedHrDemoEmployees() {
  const deptId = async (code: string, name: string): Promise<number | null> => {
    try {
      return await ensureHeipDepartment(code, name);
    } catch {
      return null;
    }
  };

  const nursingDeptId = await deptId('NUR', 'Nursing');
  const pharmacyDeptId = await deptId('PHARM', 'Pharmacy');
  const cashierDeptId = await deptId('CASH', 'Cashier / Revenue');
  const opcDeptId = await deptId('OPC', 'OPC Psychiatry');
  const labDeptId = await deptId('LAB', 'Laboratory');
  const radDeptId = await deptId('RAD', 'Radiology');
  const hrDeptId = await deptId('HR', 'Human Resources');
  const finDeptId = await deptId('FIN', 'Finance');
  const recDeptId = await deptId('REC', 'Health Records');
  const itDeptId = await deptId('ICT', 'Information Technology');
  const admDeptId = await deptId('ADM', 'Administration');
  const storeDeptId = await deptId('STR', 'General Stores');
  const fleetDeptId = await deptId('FLT', 'Fleet / Transport');
  const kitchenDeptId = await deptId('KIT', 'Nutrition / Kitchen');

  type StaffLink = {
    email: string;
    employeeNo: string;
    departmentId: number | null;
    departmentName: string;
    designation: string;
    baseSalary?: number;
  };

  const links: StaffLink[] = [
    {
      email: 'superadmin@fnpharo.gov.ng',
      employeeNo: 'FNPH-SA-001',
      departmentId: itDeptId,
      departmentName: 'Information Technology',
      designation: 'Super Admin',
      baseSalary: 900000,
    },
    {
      email: 'board@fnpharo.gov.ng',
      employeeNo: 'FNPH-BRD-001',
      departmentId: admDeptId,
      departmentName: 'Administration',
      designation: 'Board Chair',
      baseSalary: 850000,
    },
    {
      email: 'cmd@fnpharo.gov.ng',
      employeeNo: 'FNPH-CMD-001',
      departmentId: admDeptId,
      departmentName: 'Administration',
      designation: 'Chief Medical Director',
      baseSalary: 950000,
    },
    {
      email: 'admin@fnpharo.gov.ng',
      employeeNo: 'FNPH-ADM-001',
      departmentId: admDeptId,
      departmentName: 'Administration',
      designation: 'Hospital Admin',
      baseSalary: 520000,
    },
    {
      email: 'finance@fnpharo.gov.ng',
      employeeNo: 'FNPH-FIN-001',
      departmentId: finDeptId,
      departmentName: 'Finance',
      designation: 'Finance Officer',
      baseSalary: 380000,
    },
    {
      email: 'hr@fnpharo.gov.ng',
      employeeNo: 'FNPH-HR-001',
      departmentId: hrDeptId,
      departmentName: 'Human Resources',
      designation: 'HR Officer',
      baseSalary: 320000,
    },
    {
      email: 'doctor@fnpharo.gov.ng',
      employeeNo: 'FNPH-DOC-001',
      departmentId: opcDeptId,
      departmentName: 'OPC Psychiatry',
      designation: 'Consultant Psychiatrist',
      baseSalary: 750000,
    },
    {
      email: 'nurse@fnpharo.gov.ng',
      employeeNo: 'FNPH-NUR-001',
      departmentId: nursingDeptId,
      departmentName: 'Nursing',
      designation: 'Senior Nurse',
      baseSalary: 280000,
    },
    {
      email: 'pharmacist@fnpharo.gov.ng',
      employeeNo: 'FNPH-PHARM-001',
      departmentId: pharmacyDeptId,
      departmentName: 'Pharmacy',
      designation: 'Pharmacist',
      baseSalary: 300000,
    },
    {
      email: 'lab@fnpharo.gov.ng',
      employeeNo: 'FNPH-LAB-001',
      departmentId: labDeptId,
      departmentName: 'Laboratory',
      designation: 'Lab Scientist',
      baseSalary: 290000,
    },
    {
      email: 'radiology@fnpharo.gov.ng',
      employeeNo: 'FNPH-RAD-001',
      departmentId: radDeptId,
      departmentName: 'Radiology',
      designation: 'Radiology Officer',
      baseSalary: 290000,
    },
    {
      email: 'psychopc@fnpharo.gov.ng',
      employeeNo: 'FNPH-OPC-001',
      departmentId: opcDeptId,
      departmentName: 'OPC Psychiatry',
      designation: 'Psychiatric OPC Officer',
      baseSalary: 310000,
    },
    {
      email: 'psychology@fnpharo.gov.ng',
      employeeNo: 'FNPH-PSY-001',
      departmentId: opcDeptId,
      departmentName: 'OPC Psychiatry',
      designation: 'Clinical Psychologist',
      baseSalary: 320000,
    },
    {
      email: 'cap@fnpharo.gov.ng',
      employeeNo: 'FNPH-CAP-001',
      departmentId: opcDeptId,
      departmentName: 'OPC Psychiatry',
      designation: 'Child & Adolescent Clinician',
      baseSalary: 320000,
    },
    {
      email: 'addiction@fnpharo.gov.ng',
      employeeNo: 'FNPH-ADD-001',
      departmentId: opcDeptId,
      departmentName: 'OPC Psychiatry',
      designation: 'Addiction Rehab Officer',
      baseSalary: 300000,
    },
    {
      email: 'psychogeriatrics@fnpharo.gov.ng',
      employeeNo: 'FNPH-GER-001',
      departmentId: opcDeptId,
      departmentName: 'OPC Psychiatry',
      designation: 'Psychogeriatrics Officer',
      baseSalary: 300000,
    },
    {
      email: 'physiotherapy@fnpharo.gov.ng',
      employeeNo: 'FNPH-PT-001',
      departmentId: admDeptId,
      departmentName: 'Allied Health',
      designation: 'Physiotherapist',
      baseSalary: 270000,
    },
    {
      email: 'speech@fnpharo.gov.ng',
      employeeNo: 'FNPH-ST-001',
      departmentId: admDeptId,
      departmentName: 'Allied Health',
      designation: 'Speech Therapist',
      baseSalary: 270000,
    },
    {
      email: 'nutrition@fnpharo.gov.ng',
      employeeNo: 'FNPH-NUT-001',
      departmentId: kitchenDeptId,
      departmentName: 'Nutrition / Kitchen',
      designation: 'Dietitian',
      baseSalary: 260000,
    },
    {
      email: 'socialwork@fnpharo.gov.ng',
      employeeNo: 'FNPH-SW-001',
      departmentId: admDeptId,
      departmentName: 'Social Work',
      designation: 'Social Worker',
      baseSalary: 260000,
    },
    {
      email: 'icu@fnpharo.gov.ng',
      employeeNo: 'FNPH-ICU-001',
      departmentId: nursingDeptId,
      departmentName: 'Nursing',
      designation: 'ICU Nurse',
      baseSalary: 300000,
    },
    {
      email: 'cashier@fnpharo.gov.ng',
      employeeNo: 'FNPH-CASH-001',
      departmentId: cashierDeptId,
      departmentName: 'Cashier / Revenue',
      designation: 'Cashier',
      baseSalary: 220000,
    },
    {
      email: 'records@fnpharo.gov.ng',
      employeeNo: 'FNPH-REC-001',
      departmentId: recDeptId,
      departmentName: 'Health Records',
      designation: 'Records Officer',
      baseSalary: 250000,
    },
    {
      email: 'it@fnpharo.gov.ng',
      employeeNo: 'FNPH-IT-001',
      departmentId: itDeptId,
      departmentName: 'Information Technology',
      designation: 'IT Support',
      baseSalary: 280000,
    },
    {
      email: 'staff@fnpharo.gov.ng',
      employeeNo: 'FNPH-STF-001',
      departmentId: admDeptId,
      departmentName: 'Administration',
      designation: 'General Staff',
      baseSalary: 200000,
    },
    {
      email: 'student@fnpharo.gov.ng',
      employeeNo: 'FNPH-STU-001',
      departmentId: admDeptId,
      departmentName: 'Training',
      designation: 'Student Trainee',
      baseSalary: 0,
    },
    {
      email: 'stores@fnpharo.gov.ng',
      employeeNo: 'FNPH-STR-001',
      departmentId: storeDeptId,
      departmentName: 'General Stores',
      designation: 'Stores Officer',
      baseSalary: 240000,
    },
    {
      email: 'fleet@fnpharo.gov.ng',
      employeeNo: 'FNPH-FLT-001',
      departmentId: fleetDeptId,
      departmentName: 'Fleet / Transport',
      designation: 'Fleet Officer',
      baseSalary: 240000,
    },
  ];

  let linked = 0;
  for (const row of links) {
    const user = await prisma.users.findFirst({
      where: { EMAIL_ADDRESS: { equals: row.email, mode: 'insensitive' } },
    });
    if (!user) continue;

    let employee = await prisma.hrEmployees.findUnique({
      where: { EMPLOYEE_NO: row.employeeNo },
    });
    if (!employee) {
      employee = await prisma.hrEmployees.create({
        data: {
          EMPLOYEE_NO: row.employeeNo,
          FIRST_NAME: user.FIRST_NAME ?? row.email.split('@')[0],
          LAST_NAME: user.LAST_NAME ?? 'Staff',
          DEPARTMENT_ID: row.departmentId,
          DEPARTMENT_NAME: row.departmentName,
          DESIGNATION: row.designation,
          EMPLOYMENT_TYPE: 'Permanent',
          STATUS: 'Active',
          EMAIL: row.email,
          BASE_SALARY: row.baseSalary ?? 250000,
          USER_ID: user.USER_ID,
          DATE_JOINED: new Date('2020-01-15'),
          CREATED_BY: 'SYSTEM',
        },
      });
    } else {
      employee = await prisma.hrEmployees.update({
        where: { EMPLOYEE_ID: employee.EMPLOYEE_ID },
        data: {
          DEPARTMENT_ID: row.departmentId ?? employee.DEPARTMENT_ID,
          DEPARTMENT_NAME: row.departmentName,
          DESIGNATION: row.designation,
          EMAIL: row.email,
          USER_ID: user.USER_ID,
          STATUS: 'Active',
          UPDATED_BY: 'SYSTEM',
          UPDATED_DATE: new Date(),
        },
      });
    }

    if (user.EMPLOYEE_ID !== employee.EMPLOYEE_ID) {
      await prisma.users.update({
        where: { USER_ID: user.USER_ID },
        data: {
          EMPLOYEE_ID: employee.EMPLOYEE_ID,
          UPDATED_BY: 'SYSTEM',
          UPDATED_DATE: new Date(),
        },
      });
    }
    linked += 1;
  }

  console.log(`Linked ${linked} staff test accounts to HR employee records.`);
}

/**
 * Idempotent Master Service Catalog seed:
 * categories, core departments, NHIA payer, backfill unlinked domain rows,
 * FE-mock consultation/therapy/ward services.
 */
async function seedServiceCatalog() {
  const now = new Date();
  const categories: Array<{ code: string; name: string }> = [
    { code: 'CONSULTATION', name: 'Consultation' },
    { code: 'LABORATORY', name: 'Laboratory' },
    { code: 'RADIOLOGY', name: 'Radiology' },
    { code: 'PHARMACY', name: 'Pharmacy' },
    { code: 'PHYSIOTHERAPY', name: 'Physiotherapy' },
    { code: 'DENTAL', name: 'Dental' },
    { code: 'EYE_CLINIC', name: 'Eye Clinic' },
    { code: 'PSYCHOLOGY', name: 'Psychology' },
    { code: 'OCCUPATIONAL_THERAPY', name: 'Occupational Therapy' },
    { code: 'SPEECH_THERAPY', name: 'Speech Therapy' },
    { code: 'PSYCHIATRY', name: 'Psychiatry' },
    { code: 'EMERGENCY', name: 'Emergency' },
    { code: 'ADMISSION', name: 'Admission' },
    { code: 'WARD_CHARGES', name: 'Ward Charges' },
    { code: 'THEATRE', name: 'Theatre' },
    { code: 'VACCINATION', name: 'Vaccination' },
    { code: 'PROCEDURE', name: 'Procedure' },
    { code: 'MEDICAL_CERTIFICATE', name: 'Medical Certificate' },
    { code: 'CARD_FEE', name: 'Card Fee' },
    { code: 'REGISTRATION_FEE', name: 'Registration Fee' },
    { code: 'HOME_CARE', name: 'Home Care' },
    { code: 'TELEMEDICINE', name: 'Telemedicine' },
  ];

  for (const c of categories) {
    await prisma.serviceCategories.upsert({
      where: { CODE: c.code },
      create: {
        CODE: c.code,
        NAME: c.name,
        STATUS: 'Active',
        CREATED_BY: 'seed',
        CREATED_DATE: now,
      },
      update: { NAME: c.name, STATUS: 'Active' },
    });
  }

  const departments: Array<{ code: string; name: string }> = [
    { code: 'LAB', name: 'Laboratory' },
    { code: 'RAD', name: 'Radiology' },
    { code: 'ADM', name: 'Admissions' },
    { code: 'GMPC', name: 'GMPC' },
    { code: 'OPC', name: 'OPC Psychiatry' },
    { code: 'CAP', name: 'Child Psychiatry' },
    { code: 'PSY', name: 'Psychology' },
    { code: 'ADD', name: 'Addiction Services' },
    { code: 'PHARM', name: 'Pharmacy' },
    { code: 'ER', name: 'Emergency' },
    { code: 'TELE', name: 'Telepsychiatry' },
  ];

  for (const d of departments) {
    const existing = await prisma.departments.findFirst({
      where: { CODE: d.code },
    });
    if (existing) {
      await prisma.departments.update({
        where: { DEPARTMENT_ID: existing.DEPARTMENT_ID },
        data: { NAME: d.name, STATUS: 'Active' },
      });
    } else {
      await prisma.departments.create({
        data: {
          NAME: d.name,
          CODE: d.code,
          STATUS: 'Active',
          CREATED_BY: 'seed',
          CREATED_DATE: now,
        },
      });
    }
  }

  await prisma.servicePayers.upsert({
    where: { CODE: 'NHIA-DEFAULT' },
    create: {
      PAYER_TYPE: 'NHIA',
      CODE: 'NHIA-DEFAULT',
      NAME: 'NHIA / NHIS (Default)',
      STATUS: 'Active',
      CREATED_BY: 'seed',
      CREATED_DATE: now,
    },
    update: { NAME: 'NHIA / NHIS (Default)', STATUS: 'Active' },
  });

  // Nigeria HMO Integration Broker — Phase 0/1 payers + profiles
  const hmoChecklist = {
    contractSigned: false,
    credentialsInVault: false,
    eligibilityLive: false,
    benefitsLive: false,
    preAuthLive: false,
    claimsLive: false,
    webhooksLive: false,
    productionGoLive: false,
  };
  const hmoPayers: Array<{
    code: string;
    name: string;
    adapterKey: string;
    status: string;
    capabilities: Record<string, boolean>;
  }> = [
    {
      code: 'HMO-MOCK',
      name: 'Mock / Sandbox HMO',
      adapterKey: 'mock',
      status: 'ACTIVE',
      capabilities: {
        eligibility: true,
        benefits: true,
        preAuth: true,
        claims: true,
        webhooks: false,
      },
    },
    {
      code: 'HMO-CURABLY',
      name: 'Curably Aggregator (multi-HMO)',
      adapterKey: 'curably',
      status: 'DRAFT',
      capabilities: {
        eligibility: true,
        benefits: true,
        preAuth: true,
        claims: true,
        webhooks: true,
      },
    },
    {
      code: 'HMO-HYGEIA',
      name: 'Hygeia HMO',
      adapterKey: 'hygeia',
      status: 'DRAFT',
      capabilities: {
        eligibility: false,
        benefits: false,
        preAuth: false,
        claims: false,
        webhooks: false,
      },
    },
    {
      code: 'HMO-AXA',
      name: 'AXA Mansard Health',
      adapterKey: 'axa_mansard',
      status: 'DRAFT',
      capabilities: {
        eligibility: false,
        benefits: false,
        preAuth: false,
        claims: false,
        webhooks: false,
      },
    },
    {
      code: 'HMO-RELIANCE',
      name: 'Reliance Health',
      adapterKey: 'reliance',
      status: 'DRAFT',
      capabilities: {
        eligibility: false,
        benefits: false,
        preAuth: false,
        claims: false,
        webhooks: false,
      },
    },
    {
      code: 'HMO-THT',
      name: 'Total Health Trust (THT)',
      adapterKey: 'tht',
      status: 'DRAFT',
      capabilities: {
        eligibility: false,
        benefits: false,
        preAuth: false,
        claims: false,
        webhooks: false,
      },
    },
    {
      code: 'HMO-AIICO',
      name: 'AIICO Multishield',
      adapterKey: 'aiico',
      status: 'DRAFT',
      capabilities: {
        eligibility: false,
        benefits: false,
        preAuth: false,
        claims: false,
        webhooks: false,
      },
    },
  ];

  for (const hmo of hmoPayers) {
    const payer = await prisma.servicePayers.upsert({
      where: { CODE: hmo.code },
      create: {
        PAYER_TYPE: 'HMO',
        CODE: hmo.code,
        NAME: hmo.name,
        STATUS: hmo.status === 'ACTIVE' ? 'Active' : 'Inactive',
        CREATED_BY: 'seed',
        CREATED_DATE: now,
      },
      update: {
        NAME: hmo.name,
        STATUS: hmo.status === 'ACTIVE' ? 'Active' : 'Inactive',
        UPDATED_BY: 'seed',
        UPDATED_DATE: now,
      },
    });
    await prisma.hmoIntegrationProfiles.upsert({
      where: { PAYER_ID: payer.PAYER_ID },
      create: {
        PAYER_ID: payer.PAYER_ID,
        ADAPTER_KEY: hmo.adapterKey,
        STATUS: hmo.status,
        CAPABILITIES: hmo.capabilities,
        CHECKLIST: hmoChecklist,
        METADATA: { phase: hmo.adapterKey === 'mock' ? 0 : hmo.adapterKey === 'curably' ? 1 : 2 },
        CREATED_BY: 'seed',
        CREATED_DATE: now,
      },
      update: {
        ADAPTER_KEY: hmo.adapterKey,
        STATUS: hmo.status,
        CAPABILITIES: hmo.capabilities,
        UPDATED_BY: 'seed',
        UPDATED_DATE: now,
      },
    });
  }

  const catByCode = Object.fromEntries(
    (
      await prisma.serviceCategories.findMany({
        where: { CODE: { in: categories.map((c) => c.code) } },
      })
    ).map((c) => [c.CODE, c.CATEGORY_ID]),
  );
  const deptByCode = Object.fromEntries(
    (
      await prisma.departments.findMany({
        where: { CODE: { in: departments.map((d) => d.code) } },
      })
    ).map((d) => [d.CODE!, d.DEPARTMENT_ID]),
  );

  // Backfill unlinked lab tests
  const unlinkedLabs = await prisma.labTests.findMany({
    where: { SERVICE_ID: null },
  });
  for (const lt of unlinkedLabs) {
    const code = `SVC-LAB-${String(lt.LAB_TEST_ID).padStart(4, '0')}`;
    let ms = await prisma.masterServices.findUnique({
      where: { SERVICE_CODE: code },
    });
    if (!ms) {
      ms = await prisma.masterServices.create({
        data: {
          SERVICE_CODE: code,
          CATEGORY_ID: catByCode.LABORATORY,
          DEPARTMENT_ID: deptByCode.LAB,
          NAME: lt.NAME,
          DESCRIPTION: `Migrated from LAB_TESTS ${lt.TEST_CODE}`,
          GENERAL_PRICE: lt.UNIT_PRICE,
          STAFF_PRICE: Number(lt.UNIT_PRICE) * 0.7,
          REQUIRES_DOCTOR_ORDER: true,
          STATUS: 'ACTIVE',
          CREATED_BY: 'seed',
          CREATED_DATE: now,
        },
      });
    }
    await prisma.labTests.update({
      where: { LAB_TEST_ID: lt.LAB_TEST_ID },
      data: { SERVICE_ID: ms.SERVICE_ID },
    });
  }

  const unlinkedImaging = await prisma.imagingStudies.findMany({
    where: { SERVICE_ID: null },
  });
  for (const im of unlinkedImaging) {
    const code = `SVC-RAD-${String(im.IMAGING_STUDY_ID).padStart(4, '0')}`;
    let ms = await prisma.masterServices.findUnique({
      where: { SERVICE_CODE: code },
    });
    if (!ms) {
      ms = await prisma.masterServices.create({
        data: {
          SERVICE_CODE: code,
          CATEGORY_ID: catByCode.RADIOLOGY,
          DEPARTMENT_ID: deptByCode.RAD,
          NAME: im.NAME,
          DESCRIPTION: `Migrated from IMAGING_STUDIES ${im.STUDY_CODE}`,
          GENERAL_PRICE: im.UNIT_PRICE,
          STAFF_PRICE: Number(im.UNIT_PRICE) * 0.7,
          REQUIRES_DOCTOR_ORDER: true,
          STATUS: 'ACTIVE',
          CREATED_BY: 'seed',
          CREATED_DATE: now,
        },
      });
    }
    await prisma.imagingStudies.update({
      where: { IMAGING_STUDY_ID: im.IMAGING_STUDY_ID },
      data: { SERVICE_ID: ms.SERVICE_ID },
    });
  }

  const unlinkedAdm = await prisma.admissionBillingItems.findMany({
    where: { SERVICE_ID: null },
  });
  for (const ab of unlinkedAdm) {
    const code = `SVC-ADM-${String(ab.ITEM_ID).padStart(4, '0')}`;
    let ms = await prisma.masterServices.findUnique({
      where: { SERVICE_CODE: code },
    });
    if (!ms) {
      ms = await prisma.masterServices.create({
        data: {
          SERVICE_CODE: code,
          CATEGORY_ID: catByCode.ADMISSION,
          DEPARTMENT_ID: deptByCode.ADM,
          NAME: ab.NAME,
          DESCRIPTION: `Migrated from ADMISSION_BILLING_ITEMS ${ab.ITEM_CODE}`,
          GENERAL_PRICE: ab.UNIT_PRICE,
          STAFF_PRICE: Number(ab.UNIT_PRICE) * 0.7,
          REQUIRES_DOCTOR_ORDER: false,
          STATUS: 'ACTIVE',
          CREATED_BY: 'seed',
          CREATED_DATE: now,
        },
      });
    }
    await prisma.admissionBillingItems.update({
      where: { ITEM_ID: ab.ITEM_ID },
      data: { SERVICE_ID: ms.SERVICE_ID },
    });
  }

  const extras: Array<{
    code: string;
    cat: string;
    dept: string;
    name: string;
    descr: string;
    duration: number | null;
    price: number;
    online: boolean;
    appt: boolean;
    orderReq: boolean;
  }> = [
    {
      code: 'SVC-CON-GMPC',
      cat: 'CONSULTATION',
      dept: 'GMPC',
      name: 'GMPC General Consultation',
      descr: 'General medical psychiatry clinic consultation',
      duration: 20,
      price: 5000,
      online: true,
      appt: true,
      orderReq: false,
    },
    {
      code: 'SVC-CON-OPC',
      cat: 'CONSULTATION',
      dept: 'OPC',
      name: 'OPC Psychiatry Consultation',
      descr: 'Outpatient psychiatry consultation',
      duration: 30,
      price: 12000,
      online: true,
      appt: true,
      orderReq: false,
    },
    {
      code: 'SVC-CON-CAP',
      cat: 'CONSULTATION',
      dept: 'CAP',
      name: 'Child Psychiatry Consultation',
      descr: 'Child & adolescent psychiatry consultation',
      duration: 45,
      price: 15000,
      online: true,
      appt: true,
      orderReq: false,
    },
    {
      code: 'SVC-PSY-CBT',
      cat: 'PSYCHOLOGY',
      dept: 'PSY',
      name: 'CBT Session (45m)',
      descr: 'Cognitive behavioural therapy session',
      duration: 45,
      price: 18000,
      online: true,
      appt: true,
      orderReq: false,
    },
    {
      code: 'SVC-ADD-GRP',
      cat: 'PSYCHOLOGY',
      dept: 'ADD',
      name: 'Addiction Group Therapy',
      descr: 'Group therapy for addiction services',
      duration: 60,
      price: 8000,
      online: true,
      appt: true,
      orderReq: false,
    },
    {
      code: 'SVC-PRC-ECT',
      cat: 'PROCEDURE',
      dept: 'OPC',
      name: 'ECT Session',
      descr: 'Electroconvulsive therapy session',
      duration: 60,
      price: 35000,
      online: false,
      appt: true,
      orderReq: true,
    },
    {
      code: 'SVC-TEL-PSY',
      cat: 'TELEMEDICINE',
      dept: 'TELE',
      name: 'Telepsychiatry (30m)',
      descr: 'Remote psychiatry consultation',
      duration: 30,
      price: 10000,
      online: true,
      appt: true,
      orderReq: false,
    },
    {
      code: 'SVC-WRD-GEN',
      cat: 'WARD_CHARGES',
      dept: 'ADM',
      name: 'General Ward (per day)',
      descr: 'General ward daily charge',
      duration: null,
      price: 8000,
      online: false,
      appt: false,
      orderReq: false,
    },
    {
      code: 'SVC-WRD-PVT',
      cat: 'WARD_CHARGES',
      dept: 'ADM',
      name: 'Private Ward (per day)',
      descr: 'Private ward daily charge',
      duration: null,
      price: 25000,
      online: false,
      appt: false,
      orderReq: false,
    },
    {
      code: 'SVC-REG-FEE',
      cat: 'REGISTRATION_FEE',
      dept: 'GMPC',
      name: 'New Patient Registration Fee',
      descr: 'First-time patient registration charge',
      duration: null,
      price: 1500,
      online: false,
      appt: false,
      orderReq: false,
    },
    {
      code: 'SVC-CARD-FEE',
      cat: 'CARD_FEE',
      dept: 'GMPC',
      name: 'Patient ID Card Fee',
      descr: 'Hospital patient identification card fee',
      duration: null,
      price: 500,
      online: false,
      appt: false,
      orderReq: false,
    },
    {
      code: 'SVC-REG-CONSULT',
      cat: 'CONSULTATION',
      dept: 'GMPC',
      name: 'First Visit Consultation',
      descr: 'Initial consultation fee for new patients',
      duration: 20,
      price: 5500,
      online: false,
      appt: false,
      orderReq: false,
    },
  ];

  for (const e of extras) {
    await prisma.masterServices.upsert({
      where: { SERVICE_CODE: e.code },
      create: {
        SERVICE_CODE: e.code,
        CATEGORY_ID: catByCode[e.cat],
        DEPARTMENT_ID: deptByCode[e.dept],
        NAME: e.name,
        DESCRIPTION: e.descr,
        DURATION_MINUTES: e.duration,
        GENERAL_PRICE: e.price,
        STAFF_PRICE: Math.round(e.price * 0.7 * 100) / 100,
        ONLINE_BOOKABLE: e.online,
        APPOINTMENT_REQUIRED: e.appt,
        REQUIRES_DOCTOR_ORDER: e.orderReq,
        STATUS: 'ACTIVE',
        CREATED_BY: 'seed',
        CREATED_DATE: now,
      },
      update: {
        NAME: e.name,
        GENERAL_PRICE: e.price,
        STATUS: 'ACTIVE',
      },
    });
  }

  const serviceCount = await prisma.masterServices.count();
  console.log(
    `Seeded service catalog (${serviceCount} master services; categories/departments/NHIA payer upserted).`,
  );
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

type HeipSeedField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  metricKey?: string;
  autoFillSource?: string;
  critical?: { op: 'gt' | 'eq' | 'truthy'; value?: number | boolean };
  helpText?: string;
  min?: number;
};

async function ensureHeipDepartment(
  code: string,
  name: string,
): Promise<number> {
  const existing = await prisma.departments.findFirst({
    where: { CODE: { equals: code, mode: 'insensitive' } },
    select: { DEPARTMENT_ID: true },
  });
  if (existing) return existing.DEPARTMENT_ID;
  const byName = await prisma.departments.findFirst({
    where: { NAME: { equals: name, mode: 'insensitive' } },
    select: { DEPARTMENT_ID: true },
  });
  if (byName) return byName.DEPARTMENT_ID;
  const created = await prisma.departments.create({
    data: {
      CODE: code,
      NAME: name,
      STATUS: 'Active',
      CREATED_BY: 'SYSTEM',
    },
  });
  return created.DEPARTMENT_ID;
}

/**
 * HEIP Phase 1 — publish starter templates (Nursing shift, Pharmacy, Cashier).
 */
async function seedHeipTemplates() {
  const nursingDeptId = await ensureHeipDepartment('NUR', 'Nursing');
  const pharmacyDeptId = await ensureHeipDepartment('PHARM', 'Pharmacy');
  const cashierDeptId = await ensureHeipDepartment('CASH', 'Cashier / Revenue');
  const opcDeptId = await ensureHeipDepartment('OPC', 'OPC Psychiatry');

  const nursingFields: HeipSeedField[] = [
    { key: 'census_start', label: 'Census at start of shift', type: 'number', required: true, metricKey: 'patients_seen', min: 0 },
    { key: 'census_end', label: 'Census at end of shift', type: 'number', required: true, min: 0 },
    { key: 'admissions', label: 'Admissions this shift', type: 'number', required: true, metricKey: 'admissions', autoFillSource: 'admissions.today', min: 0 },
    { key: 'discharges', label: 'Discharges this shift', type: 'number', required: true, metricKey: 'discharges', autoFillSource: 'admissions.discharges_today', min: 0 },
    { key: 'transfers', label: 'Transfers', type: 'number', required: true, min: 0 },
    { key: 'deaths', label: 'Deaths', type: 'number', required: true, metricKey: 'deaths', min: 0, critical: { op: 'gt', value: 0 } },
    { key: 'absconding', label: 'Absconding / AWOL', type: 'number', required: true, metricKey: 'absconding', min: 0, critical: { op: 'gt', value: 0 } },
    { key: 'restraint', label: 'Restraint / seclusion used', type: 'boolean', required: true },
    { key: 'aggression', label: 'Aggression incidents', type: 'number', metricKey: 'incidents', autoFillSource: 'nursing.incidents_today', min: 0 },
    { key: 'falls', label: 'Falls', type: 'number', min: 0 },
    { key: 'special_obs', label: 'Special observation patients', type: 'number', min: 0 },
    { key: 'drug_round_done', label: 'Drug round completed', type: 'boolean', required: true },
    { key: 'handover', label: 'Handover notes', type: 'longtext', required: true },
  ];

  const pharmacyFields: HeipSeedField[] = [
    { key: 'rx_dispensed', label: 'Prescriptions dispensed', type: 'number', required: true, metricKey: 'rx_dispensed', autoFillSource: 'pharmacy.rx_dispensed_today', min: 0 },
    { key: 'walkin_sales', label: 'Walk-in / OTC sales', type: 'number', required: true, autoFillSource: 'pharmacy.walkin_sales_today', min: 0 },
    { key: 'stock_outs', label: 'Stock-outs / at reorder', type: 'number', required: true, metricKey: 'stock_outs', autoFillSource: 'pharmacy.stock_outs', min: 0, critical: { op: 'gt', value: 0 } },
    { key: 'near_expiry', label: 'Near-expiry items flagged', type: 'number', min: 0 },
    { key: 'controlled_check', label: 'Controlled-drug check done', type: 'boolean', required: true },
    { key: 'issues', label: 'Issues / escalations', type: 'longtext' },
    { key: 'work_summary', label: 'Work summary', type: 'longtext', required: true },
    { key: 'plan_tomorrow', label: 'Plan for tomorrow', type: 'text' },
  ];

  const cashierFields: HeipSeedField[] = [
    { key: 'opening_float', label: 'Opening float (₦)', type: 'currency', required: true, min: 0 },
    { key: 'receipts_count', label: 'Receipts count', type: 'number', required: true, autoFillSource: 'cashier.receipts_count_today', min: 0 },
    { key: 'collections_total', label: 'Collections total (₦)', type: 'currency', required: true, metricKey: 'revenue_collected', autoFillSource: 'cashier.receipts_total_today', min: 0 },
    { key: 'refunds', label: 'Refunds (₦)', type: 'currency', min: 0 },
    { key: 'shortage_overage', label: 'Shortage / overage (₦)', type: 'currency' },
    { key: 'lodgement', label: 'Lodgement done', type: 'boolean', required: true },
    { key: 'channels_notes', label: 'Channel notes (cash/POS/transfer)', type: 'longtext' },
    { key: 'challenges', label: 'Challenges / escalations', type: 'longtext' },
  ];

  const doctorFields: HeipSeedField[] = [
    { key: 'patients_new', label: 'New patients seen', type: 'number', required: true, metricKey: 'patients_seen', min: 0 },
    { key: 'patients_fu', label: 'Follow-up patients seen', type: 'number', required: true, metricKey: 'patients_seen', min: 0 },
    { key: 'emergencies', label: 'Emergencies / crises attended', type: 'number', required: true, metricKey: 'emergencies', min: 0, critical: { op: 'gt', value: 5 } },
    { key: 'admissions_requested', label: 'Admission requests', type: 'number', required: true, metricKey: 'admissions', autoFillSource: 'admissions.today', min: 0 },
    { key: 'referrals_made', label: 'Referrals made', type: 'number', required: true, metricKey: 'referrals', min: 0 },
    { key: 'procedures', label: 'Procedures / ECT / injections', type: 'number', min: 0 },
    { key: 'ward_rounds', label: 'Ward rounds completed', type: 'boolean', required: true },
    { key: 'serious_events', label: 'Serious clinical events', type: 'number', required: true, metricKey: 'incidents', min: 0, critical: { op: 'gt', value: 0 } },
    { key: 'work_summary', label: 'Clinical work summary', type: 'longtext', required: true },
    { key: 'plan_tomorrow', label: 'Plan for tomorrow', type: 'text' },
  ];

  const upsertPublished = async (input: {
    code: string;
    name: string;
    departmentId: number;
    roleName: string | null;
    frequency: 'daily' | 'shift';
    fields: HeipSeedField[];
  }) => {
    let template = await prisma.heipReportTemplates.findUnique({
      where: { CODE: input.code },
    });
    if (!template) {
      template = await prisma.heipReportTemplates.create({
        data: {
          CODE: input.code,
          NAME: input.name,
          DEPARTMENT_ID: input.departmentId,
          ROLE_NAME: input.roleName,
          FREQUENCY: input.frequency,
          DEADLINE_HOUR: 10,
          DEADLINE_GRACE_HOURS: 2,
          IS_ACTIVE: true,
          CREATED_BY: 'SYSTEM',
        },
      });
    } else {
      template = await prisma.heipReportTemplates.update({
        where: { TEMPLATE_ID: template.TEMPLATE_ID },
        data: {
          NAME: input.name,
          DEPARTMENT_ID: input.departmentId,
          ROLE_NAME: input.roleName,
          FREQUENCY: input.frequency,
          IS_ACTIVE: true,
          UPDATED_BY: 'SYSTEM',
          UPDATED_DATE: new Date(),
        },
      });
    }

    const published = await prisma.heipTemplateVersions.findFirst({
      where: { TEMPLATE_ID: template.TEMPLATE_ID, STATUS: 'Published' },
      orderBy: { VERSION_NO: 'desc' },
    });

    if (published) {
      await prisma.heipTemplateVersions.update({
        where: { VERSION_ID: published.VERSION_ID },
        data: {
          FIELD_SCHEMA: input.fields,
          UPDATED_BY: 'SYSTEM',
          UPDATED_DATE: new Date(),
        },
      });
      return;
    }

    const draft = await prisma.heipTemplateVersions.findFirst({
      where: { TEMPLATE_ID: template.TEMPLATE_ID, STATUS: 'Draft' },
      orderBy: { VERSION_NO: 'desc' },
    });

    if (draft) {
      await prisma.heipTemplateVersions.update({
        where: { VERSION_ID: draft.VERSION_ID },
        data: {
          FIELD_SCHEMA: input.fields,
          STATUS: 'Published',
          PUBLISHED_AT: new Date(),
          PUBLISHED_BY: 'SYSTEM',
          UPDATED_BY: 'SYSTEM',
          UPDATED_DATE: new Date(),
        },
      });
      return;
    }

    const latest = await prisma.heipTemplateVersions.findFirst({
      where: { TEMPLATE_ID: template.TEMPLATE_ID },
      orderBy: { VERSION_NO: 'desc' },
    });
    await prisma.heipTemplateVersions.create({
      data: {
        TEMPLATE_ID: template.TEMPLATE_ID,
        VERSION_NO: (latest?.VERSION_NO ?? 0) + 1,
        FIELD_SCHEMA: input.fields,
        STATUS: 'Published',
        PUBLISHED_AT: new Date(),
        PUBLISHED_BY: 'SYSTEM',
        CREATED_BY: 'SYSTEM',
      },
    });
  };

  await upsertPublished({
    code: 'HEIP-NURSING-SHIFT',
    name: 'Ward nursing — per shift',
    departmentId: nursingDeptId,
    roleName: 'NURSE',
    frequency: 'shift',
    fields: nursingFields,
  });
  await upsertPublished({
    code: 'HEIP-PHARMACY-DAILY',
    name: 'Pharmacy — daily',
    departmentId: pharmacyDeptId,
    roleName: 'PHARMACIST',
    frequency: 'daily',
    fields: pharmacyFields,
  });
  await upsertPublished({
    code: 'HEIP-CASHIER-DAILY',
    name: 'Cashier — daily',
    departmentId: cashierDeptId,
    roleName: 'CASHIER',
    frequency: 'daily',
    fields: cashierFields,
  });
  await upsertPublished({
    code: 'HEIP-DOCTOR-DAILY',
    name: 'Doctor / clinic — daily',
    departmentId: opcDeptId,
    roleName: 'DOCTOR',
    frequency: 'daily',
    fields: doctorFields,
  });

  console.log(
    `Seeded HEIP published templates (Nursing=${nursingDeptId}, Pharmacy=${pharmacyDeptId}, Cashier=${cashierDeptId}, Doctor/OPC=${opcDeptId}).`,
  );
}

/** Demo HEIP reports / red flags / dept summaries for CMD + staff pilot logins. */
async function seedHeipDemoData() {
  const DEMO_BY = 'SYSTEM_HEIP_DEMO';

  const nursingDeptId = await ensureHeipDepartment('NUR', 'Nursing');
  const pharmacyDeptId = await ensureHeipDepartment('PHARM', 'Pharmacy');
  const cashierDeptId = await ensureHeipDepartment('CASH', 'Cashier / Revenue');
  const opcDeptId = await ensureHeipDepartment('OPC', 'OPC Psychiatry');

  const ensureEmployee = async (input: {
    employeeNo: string;
    firstName: string;
    lastName: string;
    departmentId: number;
    departmentName: string;
    designation: string;
    email?: string;
    userId?: number;
  }) => {
    const existing = await prisma.hrEmployees.findUnique({
      where: { EMPLOYEE_NO: input.employeeNo },
    });
    if (existing) {
      return prisma.hrEmployees.update({
        where: { EMPLOYEE_ID: existing.EMPLOYEE_ID },
        data: {
          DEPARTMENT_ID: input.departmentId,
          DEPARTMENT_NAME: input.departmentName,
          DESIGNATION: input.designation,
          EMAIL: input.email ?? existing.EMAIL,
          USER_ID: input.userId ?? existing.USER_ID,
          STATUS: 'Active',
          UPDATED_BY: 'SYSTEM',
          UPDATED_DATE: new Date(),
        },
      });
    }
    return prisma.hrEmployees.create({
      data: {
        EMPLOYEE_NO: input.employeeNo,
        FIRST_NAME: input.firstName,
        LAST_NAME: input.lastName,
        DEPARTMENT_ID: input.departmentId,
        DEPARTMENT_NAME: input.departmentName,
        DESIGNATION: input.designation,
        EMPLOYMENT_TYPE: 'Permanent',
        STATUS: 'Active',
        EMAIL: input.email ?? null,
        BASE_SALARY: 280000,
        USER_ID: input.userId ?? null,
        DATE_JOINED: new Date('2020-01-15'),
        CREATED_BY: 'SYSTEM',
      },
    });
  };

  const linkUser = async (
    user: { USER_ID: number; EMPLOYEE_ID: number | null } | null,
    employee: { EMPLOYEE_ID: number; USER_ID: number | null },
  ) => {
    if (!user) return;
    if (user.EMPLOYEE_ID !== employee.EMPLOYEE_ID) {
      await prisma.users.update({
        where: { USER_ID: user.USER_ID },
        data: {
          EMPLOYEE_ID: employee.EMPLOYEE_ID,
          UPDATED_BY: 'SYSTEM',
          UPDATED_DATE: new Date(),
        },
      });
    }
    if (employee.USER_ID !== user.USER_ID) {
      await prisma.hrEmployees.update({
        where: { EMPLOYEE_ID: employee.EMPLOYEE_ID },
        data: { USER_ID: user.USER_ID },
      });
    }
  };

  const nurseUser = await prisma.users.findFirst({
    where: { EMAIL_ADDRESS: { equals: 'nurse@fnpharo.gov.ng', mode: 'insensitive' } },
  });
  const pharmacistUser = await prisma.users.findFirst({
    where: { EMAIL_ADDRESS: { equals: 'pharmacist@fnpharo.gov.ng', mode: 'insensitive' } },
  });
  const cashierUser = await prisma.users.findFirst({
    where: { EMAIL_ADDRESS: { equals: 'cashier@fnpharo.gov.ng', mode: 'insensitive' } },
  });
  const doctorUser = await prisma.users.findFirst({
    where: { EMAIL_ADDRESS: { equals: 'doctor@fnpharo.gov.ng', mode: 'insensitive' } },
  });
  const nurseEmp = await ensureEmployee({
    employeeNo: 'FNPH-NUR-001',
    firstName: nurseUser?.FIRST_NAME ?? 'Blessing',
    lastName: nurseUser?.LAST_NAME ?? 'Okonkwo',
    departmentId: nursingDeptId,
    departmentName: 'Nursing',
    designation: 'Senior Nurse',
    email: nurseUser?.EMAIL_ADDRESS ?? 'nurse@fnpharo.gov.ng',
    userId: nurseUser?.USER_ID,
  });
  const pharmEmp = await ensureEmployee({
    employeeNo: 'FNPH-PHARM-001',
    firstName: pharmacistUser?.FIRST_NAME ?? 'Sodiq',
    lastName: pharmacistUser?.LAST_NAME ?? 'Yusuf',
    departmentId: pharmacyDeptId,
    departmentName: 'Pharmacy',
    designation: 'Pharmacist',
    email: pharmacistUser?.EMAIL_ADDRESS ?? 'pharmacist@fnpharo.gov.ng',
    userId: pharmacistUser?.USER_ID,
  });
  const cashEmp = await ensureEmployee({
    employeeNo: 'FNPH-CASH-001',
    firstName: cashierUser?.FIRST_NAME ?? 'Cashier',
    lastName: cashierUser?.LAST_NAME ?? 'Desk',
    departmentId: cashierDeptId,
    departmentName: 'Cashier / Revenue',
    designation: 'Cashier',
    email: cashierUser?.EMAIL_ADDRESS ?? 'cashier@fnpharo.gov.ng',
    userId: cashierUser?.USER_ID,
  });
  const doctorEmp = await ensureEmployee({
    employeeNo: 'FNPH-DOC-001',
    firstName: doctorUser?.FIRST_NAME ?? 'Test',
    lastName: doctorUser?.LAST_NAME ?? 'Doctor',
    departmentId: opcDeptId,
    departmentName: 'OPC Psychiatry',
    designation: 'Consultant Psychiatrist',
    email: doctorUser?.EMAIL_ADDRESS ?? 'doctor@fnpharo.gov.ng',
    userId: doctorUser?.USER_ID,
  });
  // Dedicated HOD row (no user steal — doctor stays on FNPH-DOC-001).
  const nursingHodEmp = await ensureEmployee({
    employeeNo: 'FNPH-HOD-NUR-001',
    firstName: 'Ngozi',
    lastName: 'Adeyemi',
    departmentId: nursingDeptId,
    departmentName: 'Nursing',
    designation: 'Head of Nursing',
    email: 'hod.nursing@fnpharo.gov.ng',
  });

  await linkUser(nurseUser, nurseEmp);
  await linkUser(pharmacistUser, pharmEmp);
  await linkUser(cashierUser, cashEmp);
  await linkUser(doctorUser, doctorEmp);
  await prisma.hrDepartmentHeads.upsert({
    where: { DEPARTMENT_ID: nursingDeptId },
    create: {
      DEPARTMENT_ID: nursingDeptId,
      HEAD_EMPLOYEE_ID: nursingHodEmp.EMPLOYEE_ID,
      CREATED_BY: DEMO_BY,
    },
    update: {
      HEAD_EMPLOYEE_ID: nursingHodEmp.EMPLOYEE_ID,
      UPDATED_BY: DEMO_BY,
      UPDATED_DATE: new Date(),
    },
  });
  await prisma.hrDepartmentHeads.upsert({
    where: { DEPARTMENT_ID: pharmacyDeptId },
    create: {
      DEPARTMENT_ID: pharmacyDeptId,
      HEAD_EMPLOYEE_ID: pharmEmp.EMPLOYEE_ID,
      CREATED_BY: DEMO_BY,
    },
    update: {
      HEAD_EMPLOYEE_ID: pharmEmp.EMPLOYEE_ID,
      UPDATED_BY: DEMO_BY,
      UPDATED_DATE: new Date(),
    },
  });
  await prisma.hrDepartmentHeads.upsert({
    where: { DEPARTMENT_ID: cashierDeptId },
    create: {
      DEPARTMENT_ID: cashierDeptId,
      HEAD_EMPLOYEE_ID: cashEmp.EMPLOYEE_ID,
      CREATED_BY: DEMO_BY,
    },
    update: {
      HEAD_EMPLOYEE_ID: cashEmp.EMPLOYEE_ID,
      UPDATED_BY: DEMO_BY,
      UPDATED_DATE: new Date(),
    },
  });
  await prisma.hrDepartmentHeads.upsert({
    where: { DEPARTMENT_ID: opcDeptId },
    create: {
      DEPARTMENT_ID: opcDeptId,
      HEAD_EMPLOYEE_ID: doctorEmp.EMPLOYEE_ID,
      CREATED_BY: DEMO_BY,
    },
    update: {
      HEAD_EMPLOYEE_ID: doctorEmp.EMPLOYEE_ID,
      UPDATED_BY: DEMO_BY,
      UPDATED_DATE: new Date(),
    },
  });

  const templates = await prisma.heipReportTemplates.findMany({
    where: {
      CODE: {
        in: [
          'HEIP-NURSING-SHIFT',
          'HEIP-PHARMACY-DAILY',
          'HEIP-CASHIER-DAILY',
          'HEIP-DOCTOR-DAILY',
        ],
      },
    },
    include: {
      versions: {
        where: { STATUS: 'Published' },
        orderBy: { VERSION_NO: 'desc' },
        take: 1,
      },
    },
  });
  const byCode = new Map(templates.map((t) => [t.CODE, t]));
  const nursingTpl = byCode.get('HEIP-NURSING-SHIFT');
  const pharmacyTpl = byCode.get('HEIP-PHARMACY-DAILY');
  const cashierTpl = byCode.get('HEIP-CASHIER-DAILY');
  const doctorTpl = byCode.get('HEIP-DOCTOR-DAILY');
  if (
    !nursingTpl?.versions[0] ||
    !pharmacyTpl?.versions[0] ||
    !cashierTpl?.versions[0] ||
    !doctorTpl?.versions[0]
  ) {
    console.log('HEIP demo data skipped — published templates missing.');
    return;
  }

  // Refresh demo rows only (idempotent re-seed).
  const oldDemo = await prisma.heipReports.findMany({
    where: { CREATED_BY: DEMO_BY },
    select: { REPORT_ID: true },
  });
  if (oldDemo.length) {
    await prisma.heipReports.deleteMany({
      where: { REPORT_ID: { in: oldDemo.map((r) => r.REPORT_ID) } },
    });
  }
  await prisma.heipDepartmentSummaries.deleteMany({
    where: { CREATED_BY: DEMO_BY },
  });

  const utcDate = (offsetDays: number): Date => {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate() + offsetDays;
    return new Date(Date.UTC(y, m, day));
  };

  type ValueInput = {
    fieldKey: string;
    metricKey?: string;
    number?: number;
    text?: string;
  };

  const createReport = async (input: {
    templateId: number;
    versionId: number;
    employeeId: number;
    userId: number | null;
    departmentId: number;
    reportDate: Date;
    shift: string | null;
    status: 'Submitted' | 'Approved' | 'Missed' | 'Draft';
    late?: boolean;
    values: ValueInput[];
    redFlags?: Array<{
      fieldKey: string;
      metricKey?: string;
      op: string;
      triggerValue: string;
      observed: string;
    }>;
  }) => {
    const submittedAt =
      input.status === 'Draft' || input.status === 'Missed'
        ? null
        : new Date(input.reportDate.getTime() + 8 * 3600_000);
    const approvedAt =
      input.status === 'Approved'
        ? new Date(input.reportDate.getTime() + 10 * 3600_000)
        : null;

    const report = await prisma.heipReports.create({
      data: {
        TEMPLATE_ID: input.templateId,
        TEMPLATE_VERSION_ID: input.versionId,
        EMPLOYEE_ID: input.employeeId,
        USER_ID: input.userId,
        DEPARTMENT_ID: input.departmentId,
        REPORT_DATE: input.reportDate,
        SHIFT: input.shift,
        STATUS: input.status,
        LATE: input.late ?? false,
        SUBMITTED_AT: submittedAt,
        APPROVED_AT: approvedAt,
        APPROVED_BY: approvedAt ? 'SYSTEM_HOD_DEMO' : null,
        CREATED_BY: DEMO_BY,
        events: {
          create: [
            {
              EVENT_TYPE: input.status === 'Missed' ? 'miss' : 'submit',
              FROM_STATUS: 'Draft',
              TO_STATUS: input.status === 'Approved' ? 'Submitted' : input.status,
              ACTOR_LABEL: DEMO_BY,
            },
            ...(input.status === 'Approved'
              ? [
                  {
                    EVENT_TYPE: 'approve',
                    FROM_STATUS: 'Submitted',
                    TO_STATUS: 'Approved',
                    ACTOR_LABEL: 'SYSTEM_HOD_DEMO',
                  },
                ]
              : []),
          ],
        },
        values: {
          create: input.values.map((v) => ({
            FIELD_KEY: v.fieldKey,
            METRIC_KEY: v.metricKey ?? null,
            VALUE_NUMBER: v.number != null ? v.number : null,
            VALUE_TEXT: v.text ?? (v.number != null ? String(v.number) : null),
          })),
        },
        redFlags: input.redFlags?.length
          ? {
              create: input.redFlags.map((f) => ({
                FIELD_KEY: f.fieldKey,
                METRIC_KEY: f.metricKey ?? null,
                TRIGGER_OP: f.op,
                TRIGGER_VALUE: f.triggerValue,
                OBSERVED_VALUE: f.observed,
                DEPARTMENT_ID: input.departmentId,
                EMPLOYEE_ID: input.employeeId,
              })),
            }
          : undefined,
      },
    });
    return report;
  };

  // Last 7 days inclusive (today = 0).
  for (let dayOffset = -6; dayOffset <= 0; dayOffset++) {
    const reportDate = utcDate(dayOffset);
    const dayIndex = dayOffset + 6; // 0..6
    const isToday = dayOffset === 0;
    const abscond = isToday ? 1 : 0;
    const deaths = dayOffset === -2 ? 1 : 0;
    const stockOuts = isToday || dayOffset === -1 ? 3 + dayIndex : dayIndex % 2;

    await createReport({
      templateId: nursingTpl.TEMPLATE_ID,
      versionId: nursingTpl.versions[0].VERSION_ID,
      employeeId: nurseEmp.EMPLOYEE_ID,
      userId: nurseUser?.USER_ID ?? null,
      departmentId: nursingDeptId,
      reportDate,
      shift: 'Morning',
      status: dayOffset === -5 ? 'Missed' : isToday ? 'Submitted' : 'Approved',
      late: dayOffset === -3,
      values: [
        { fieldKey: 'census_start', metricKey: 'patients_seen', number: 28 + dayIndex },
        { fieldKey: 'census_end', number: 30 + dayIndex },
        { fieldKey: 'admissions', metricKey: 'admissions', number: 2 + (dayIndex % 3) },
        { fieldKey: 'discharges', metricKey: 'discharges', number: 1 + (dayIndex % 2) },
        { fieldKey: 'transfers', number: dayIndex % 2 },
        { fieldKey: 'deaths', metricKey: 'deaths', number: deaths },
        { fieldKey: 'absconding', metricKey: 'absconding', number: abscond },
        { fieldKey: 'restraint', text: dayIndex % 4 === 0 ? 'true' : 'false' },
        { fieldKey: 'aggression', metricKey: 'incidents', number: dayIndex % 3 },
        { fieldKey: 'falls', number: 0 },
        { fieldKey: 'special_obs', number: 4 },
        { fieldKey: 'drug_round_done', text: 'true' },
        {
          fieldKey: 'handover',
          text: `Morning shift handover (demo day ${dayIndex + 1}). Ward stable; ${abscond ? '1 absconding flagged.' : 'no AWOL.'}`,
        },
      ],
      redFlags:
        abscond > 0
          ? [
              {
                fieldKey: 'absconding',
                metricKey: 'absconding',
                op: 'gt',
                triggerValue: '0',
                observed: String(abscond),
              },
            ]
          : deaths > 0
            ? [
                {
                  fieldKey: 'deaths',
                  metricKey: 'deaths',
                  op: 'gt',
                  triggerValue: '0',
                  observed: String(deaths),
                },
              ]
            : undefined,
    });

    await createReport({
      templateId: pharmacyTpl.TEMPLATE_ID,
      versionId: pharmacyTpl.versions[0].VERSION_ID,
      employeeId: pharmEmp.EMPLOYEE_ID,
      userId: pharmacistUser?.USER_ID ?? null,
      departmentId: pharmacyDeptId,
      reportDate,
      shift: null,
      status: isToday ? 'Submitted' : 'Approved',
      values: [
        { fieldKey: 'rx_dispensed', metricKey: 'rx_dispensed', number: 85 + dayIndex * 4 },
        { fieldKey: 'walkin_sales', number: 40 + dayIndex * 2 },
        { fieldKey: 'stock_outs', metricKey: 'stock_outs', number: stockOuts },
        { fieldKey: 'near_expiry', number: 2 },
        { fieldKey: 'controlled_check', text: 'true' },
        {
          fieldKey: 'issues',
          text: stockOuts > 0 ? `${stockOuts} lines at reorder (demo).` : 'None',
        },
        {
          fieldKey: 'work_summary',
          text: `Pharmacy daily ops (demo). Dispensed ${85 + dayIndex * 4} Rx.`,
        },
        { fieldKey: 'plan_tomorrow', text: 'Restock antipsychotics; CD count AM.' },
      ],
      redFlags:
        stockOuts > 0 && isToday
          ? [
              {
                fieldKey: 'stock_outs',
                metricKey: 'stock_outs',
                op: 'gt',
                triggerValue: '0',
                observed: String(stockOuts),
              },
            ]
          : undefined,
    });

    await createReport({
      templateId: cashierTpl.TEMPLATE_ID,
      versionId: cashierTpl.versions[0].VERSION_ID,
      employeeId: cashEmp.EMPLOYEE_ID,
      userId: cashierUser?.USER_ID ?? null,
      departmentId: cashierDeptId,
      reportDate,
      shift: null,
      status: dayOffset === -4 ? 'Missed' : isToday ? 'Approved' : 'Approved',
      late: isToday,
      values: [
        { fieldKey: 'opening_float', number: 50000 },
        { fieldKey: 'receipts_count', number: 62 + dayIndex * 3 },
        {
          fieldKey: 'collections_total',
          metricKey: 'revenue_collected',
          number: 1_850_000 + dayIndex * 95_000,
        },
        { fieldKey: 'refunds', number: 12_000 },
        { fieldKey: 'shortage_overage', number: dayIndex === 6 ? -2500 : 0 },
        { fieldKey: 'lodgement', text: 'true' },
        {
          fieldKey: 'channels_notes',
          text: 'POS 48% · Transfer 30% · Cash 22% (demo)',
        },
        { fieldKey: 'challenges', text: isToday ? 'TERM-04 reconciliation pending (demo).' : '' },
      ],
    });

    const serious = dayOffset === -1 ? 1 : 0;
    await createReport({
      templateId: doctorTpl.TEMPLATE_ID,
      versionId: doctorTpl.versions[0].VERSION_ID,
      employeeId: doctorEmp.EMPLOYEE_ID,
      userId: doctorUser?.USER_ID ?? null,
      departmentId: opcDeptId,
      reportDate,
      shift: null,
      status: isToday ? 'Submitted' : 'Approved',
      values: [
        { fieldKey: 'patients_new', metricKey: 'patients_seen', number: 6 + (dayIndex % 4) },
        { fieldKey: 'patients_fu', metricKey: 'patients_seen', number: 12 + dayIndex },
        { fieldKey: 'emergencies', metricKey: 'emergencies', number: 1 + (dayIndex % 2) },
        { fieldKey: 'admissions_requested', metricKey: 'admissions', number: dayIndex % 3 },
        { fieldKey: 'referrals_made', metricKey: 'referrals', number: 2 },
        { fieldKey: 'procedures', number: dayIndex % 2 },
        { fieldKey: 'ward_rounds', text: 'true' },
        { fieldKey: 'serious_events', metricKey: 'incidents', number: serious },
        {
          fieldKey: 'work_summary',
          text: `OPC clinic day (demo ${dayIndex + 1}). New + FU clinics completed; ward round done.`,
        },
        { fieldKey: 'plan_tomorrow', text: 'GMPC consults; review pending admissions.' },
      ],
      redFlags:
        serious > 0
          ? [
              {
                fieldKey: 'serious_events',
                metricKey: 'incidents',
                op: 'gt',
                triggerValue: '0',
                observed: String(serious),
              },
            ]
          : undefined,
    });
  }

  const today = utcDate(0);
  await prisma.heipDepartmentSummaries.upsert({
    where: {
      DEPARTMENT_ID_REPORT_DATE: {
        DEPARTMENT_ID: nursingDeptId,
        REPORT_DATE: today,
      },
    },
    create: {
      DEPARTMENT_ID: nursingDeptId,
      REPORT_DATE: today,
      BODY: 'Nursing HOD summary (demo): census rising; one absconding incident escalated to security. Drug rounds complete on Male Acute.',
      AUTHOR_EMPLOYEE_ID: nursingHodEmp.EMPLOYEE_ID,
      CREATED_BY: DEMO_BY,
    },
    update: {
      BODY: 'Nursing HOD summary (demo): census rising; one absconding incident escalated to security. Drug rounds complete on Male Acute.',
      AUTHOR_EMPLOYEE_ID: nursingHodEmp.EMPLOYEE_ID,
      UPDATED_BY: DEMO_BY,
      UPDATED_DATE: new Date(),
    },
  });
  await prisma.heipDepartmentSummaries.upsert({
    where: {
      DEPARTMENT_ID_REPORT_DATE: {
        DEPARTMENT_ID: pharmacyDeptId,
        REPORT_DATE: today,
      },
    },
    create: {
      DEPARTMENT_ID: pharmacyDeptId,
      REPORT_DATE: today,
      BODY: 'Pharmacy HOD summary (demo): high outpatient volume; stock-outs on 3 lines — procurement chase opened.',
      AUTHOR_EMPLOYEE_ID: pharmEmp.EMPLOYEE_ID,
      CREATED_BY: DEMO_BY,
    },
    update: {
      BODY: 'Pharmacy HOD summary (demo): high outpatient volume; stock-outs on 3 lines — procurement chase opened.',
      AUTHOR_EMPLOYEE_ID: pharmEmp.EMPLOYEE_ID,
      UPDATED_BY: DEMO_BY,
      UPDATED_DATE: new Date(),
    },
  });
  await prisma.heipDepartmentSummaries.upsert({
    where: {
      DEPARTMENT_ID_REPORT_DATE: {
        DEPARTMENT_ID: cashierDeptId,
        REPORT_DATE: today,
      },
    },
    create: {
      DEPARTMENT_ID: cashierDeptId,
      REPORT_DATE: today,
      BODY: 'Cashier HOD summary (demo): collections on target; POS terminal TERM-04 mismatch under review.',
      AUTHOR_EMPLOYEE_ID: cashEmp.EMPLOYEE_ID,
      CREATED_BY: DEMO_BY,
    },
    update: {
      BODY: 'Cashier HOD summary (demo): collections on target; POS terminal TERM-04 mismatch under review.',
      AUTHOR_EMPLOYEE_ID: cashEmp.EMPLOYEE_ID,
      UPDATED_BY: DEMO_BY,
      UPDATED_DATE: new Date(),
    },
  });
  await prisma.heipDepartmentSummaries.upsert({
    where: {
      DEPARTMENT_ID_REPORT_DATE: {
        DEPARTMENT_ID: opcDeptId,
        REPORT_DATE: today,
      },
    },
    create: {
      DEPARTMENT_ID: opcDeptId,
      REPORT_DATE: today,
      BODY: 'OPC HOD summary (demo): clinic throughput steady; admission requests queued for Records.',
      AUTHOR_EMPLOYEE_ID: doctorEmp.EMPLOYEE_ID,
      CREATED_BY: DEMO_BY,
    },
    update: {
      BODY: 'OPC HOD summary (demo): clinic throughput steady; admission requests queued for Records.',
      AUTHOR_EMPLOYEE_ID: doctorEmp.EMPLOYEE_ID,
      UPDATED_BY: DEMO_BY,
      UPDATED_DATE: new Date(),
    },
  });

  console.log(
    'Seeded HEIP demo data (7 days × Nursing/Pharmacy/Cashier/Doctor reports, red flags, dept summaries).',
  );
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
