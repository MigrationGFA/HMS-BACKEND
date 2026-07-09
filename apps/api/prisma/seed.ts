import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { ALL_ROLES, ROLES } from '../src/common/constants';
import {
  createPrismaClient,
  databaseConfigFromEnv,
} from '../src/prisma/create-prisma-client';

const SUPER_ADMIN_EMAIL = 'superadmin@fnpharo.gov.ng';
const SUPER_ADMIN_PASSWORD = 'password';

const { prisma, pool } = createPrismaClient(databaseConfigFromEnv());

async function main() {
  for (const roleName of ALL_ROLES) {
    const existing = await prisma.roles.findFirst({
      where: { ROLE_NAME: roleName },
    });

    if (existing) {
      continue;
    }

    await prisma.roles.create({
      data: {
        ROLE_NAME: roleName,
        CREATED_BY: 'SYSTEM',
        CREATED_DATE: new Date(),
      },
    });
  }

  console.log(`Seeded ${ALL_ROLES.length} roles into ROLES table.`);

  const superAdminRole = await prisma.roles.findFirst({
    where: { ROLE_NAME: ROLES.SUPER_ADMIN },
  });

  if (!superAdminRole) {
    throw new Error('SUPER_ADMIN role was not found after seeding roles.');
  }

  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
  const existingSuperAdmin = await prisma.users.findFirst({
    where: {
      EMAIL_ADDRESS: {
        equals: SUPER_ADMIN_EMAIL,
        mode: 'insensitive',
      },
    },
  });

  if (existingSuperAdmin) {
    await prisma.users.update({
      where: { USER_ID: existingSuperAdmin.USER_ID },
      data: {
        PASSWORD: passwordHash,
        ROLE_ID: superAdminRole.ROLE_ID,
        IS_ADMIN: 'Y',
        LOCK_ACCOUNT: 'N',
        UPDATED_BY: 'SYSTEM',
        UPDATED_DATE: new Date(),
      },
    });
    console.log(`Updated test super admin: ${SUPER_ADMIN_EMAIL}`);
    return;
  }

  await prisma.users.create({
    data: {
      USER_NAME: 'superadmin',
      EMAIL_ADDRESS: SUPER_ADMIN_EMAIL,
      PASSWORD: passwordHash,
      FIRST_NAME: 'Super',
      LAST_NAME: 'Admin',
      IS_ADMIN: 'Y',
      LOCK_ACCOUNT: 'N',
      ROLE_ID: superAdminRole.ROLE_ID,
      CREATED_BY: 'SYSTEM',
      CREATED_DATE: new Date(),
    },
  });

  console.log(`Created test super admin: ${SUPER_ADMIN_EMAIL}`);
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
