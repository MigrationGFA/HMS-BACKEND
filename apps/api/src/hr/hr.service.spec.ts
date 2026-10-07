import { ConflictException } from '@nestjs/common';
import { HrService } from './hr.service';

describe('HrService — employee<->user linking (Phase 0)', () => {
  const audit = { log: jest.fn() };
  const prisma: Record<string, any> = {
    hrEmployees: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    users: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const actor = {
    id: 99,
    email: 'hr@test.com',
    phone: null,
    firstName: 'Hr',
    lastName: 'Officer',
    roles: ['HR'],
    mustResetPassword: false,
    personId: null,
  };

  const hrSelf = {
    applyFinalApprovalEffects: jest.fn(),
    notifyLeaveOutcome: jest.fn(),
  };

  let service: HrService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    service = new HrService(prisma as any, audit as any, hrSelf as any);
  });

  describe('createEmployee', () => {
    const baseDto = {
      employeeNo: 'FNPH-TEST-001',
      firstName: 'Ada',
      lastName: 'Obi',
    } as any;

    it('links USERS.EMPLOYEE_ID when creating with userId', async () => {
      prisma.users.findUnique.mockResolvedValue({ EMPLOYEE_ID: null });
      prisma.hrEmployees.findUnique.mockResolvedValue(null); // no other employee claims this user
      prisma.hrEmployees.create.mockResolvedValue({
        EMPLOYEE_ID: 1,
        EMPLOYEE_NO: 'FNPH-TEST-001',
        USER_ID: 10,
        CREATED_DATE: new Date(),
      });
      prisma.users.update.mockResolvedValue({});

      await service.createEmployee({ ...baseDto, userId: 10 }, actor as any);

      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { USER_ID: 10 },
        data: { EMPLOYEE_ID: 1 },
      });
    });

    it('throws ConflictException when target user already linked to another employee', async () => {
      prisma.users.findUnique.mockResolvedValue({ EMPLOYEE_ID: 5 });

      await expect(
        service.createEmployee({ ...baseDto, userId: 10 }, actor as any),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.hrEmployees.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when another HR_EMPLOYEES row already has this USER_ID', async () => {
      prisma.users.findUnique.mockResolvedValue({ EMPLOYEE_ID: null });
      prisma.hrEmployees.findUnique.mockResolvedValue({ EMPLOYEE_ID: 77 });

      await expect(
        service.createEmployee({ ...baseDto, userId: 10 }, actor as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not touch USERS when no userId supplied', async () => {
      prisma.hrEmployees.create.mockResolvedValue({
        EMPLOYEE_ID: 2,
        EMPLOYEE_NO: 'FNPH-TEST-002',
        USER_ID: null,
        CREATED_DATE: new Date(),
      });

      await service.createEmployee(baseDto, actor as any);

      expect(prisma.users.findUnique).not.toHaveBeenCalled();
      expect(prisma.users.update).not.toHaveBeenCalled();
    });
  });

  describe('updateEmployee', () => {
    const existingEmployee = {
      EMPLOYEE_ID: 1,
      EMPLOYEE_NO: 'FNPH-TEST-001',
      USER_ID: 10,
      CREATED_DATE: new Date(),
    };

    beforeEach(() => {
      prisma.hrEmployees.findUnique.mockResolvedValue(existingEmployee);
    });

    it('links a new user and clears the previous user link on re-link', async () => {
      // Re-linking employee #1 from USER_ID 10 -> USER_ID 20
      prisma.users.findUnique.mockResolvedValue({ EMPLOYEE_ID: null }); // target user (20) unlinked
      // No other employee row owns USER_ID 20
      prisma.hrEmployees.findUnique
        .mockResolvedValueOnce(existingEmployee) // ensureEmployee() lookup
        .mockResolvedValueOnce(null); // syncUserEmployeeLink() conflict check
      prisma.hrEmployees.update.mockResolvedValue({
        ...existingEmployee,
        USER_ID: 20,
      });

      await service.updateEmployee(1, { userId: 20 } as any, actor as any);

      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { USER_ID: 10 },
        data: { EMPLOYEE_ID: null },
      });
      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { USER_ID: 20 },
        data: { EMPLOYEE_ID: 1 },
      });
    });

    it('unlinks when userId: null is passed', async () => {
      prisma.hrEmployees.update.mockResolvedValue({
        ...existingEmployee,
        USER_ID: null,
      });

      await service.updateEmployee(1, { userId: null } as any, actor as any);

      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { USER_ID: 10 },
        data: { EMPLOYEE_ID: null },
      });
    });

    it('throws ConflictException when re-linking to a user already linked to a different employee', async () => {
      prisma.users.findUnique.mockResolvedValue({ EMPLOYEE_ID: 42 });

      await expect(
        service.updateEmployee(1, { userId: 20 } as any, actor as any),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.hrEmployees.update).not.toHaveBeenCalled();
    });

    it('is a no-op on the link when userId is not present in the dto', async () => {
      prisma.hrEmployees.update.mockResolvedValue(existingEmployee);

      await service.updateEmployee(
        1,
        { firstName: 'New Name' } as any,
        actor as any,
      );

      expect(prisma.users.findUnique).not.toHaveBeenCalled();
      expect(prisma.users.update).not.toHaveBeenCalled();
    });

    it('is a no-op when userId is unchanged', async () => {
      prisma.hrEmployees.update.mockResolvedValue(existingEmployee);

      await service.updateEmployee(1, { userId: 10 } as any, actor as any);

      expect(prisma.users.findUnique).not.toHaveBeenCalled();
      expect(prisma.users.update).not.toHaveBeenCalled();
    });
  });
});
