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
