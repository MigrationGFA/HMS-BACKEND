import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { HrSelfService } from './hr-self.service';

describe('HrSelfService — leave + ownership (Phases 2–3)', () => {
  const audit = { log: jest.fn() };
  const notifications = { createForUser: jest.fn() };
  const email = { send: jest.fn(), isConfigured: jest.fn(() => false) };

  const prisma: Record<string, any> = {
    users: { findUnique: jest.fn(), findMany: jest.fn() },
    hrEmployees: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    hrLeaveTypes: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    hrLeaveRequests: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    hrDepartmentHeads: { findUnique: jest.fn(), findMany: jest.fn() },
    hrPublicHolidays: { findMany: jest.fn() },
    hrAttendance: { findMany: jest.fn(), upsert: jest.fn() },
    hrAppraisals: { findMany: jest.fn(), findFirst: jest.fn() },
    hrPayrollLines: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
  };

  const nurseUser = {
    id: 10,
    email: 'nurse@test.com',
    phone: null,
    firstName: 'Blessing',
    lastName: 'Nurse',
    roles: ['NURSE'],
    mustResetPassword: false,
    personId: null,
  };

  const otherUser = {
    ...nurseUser,
    id: 99,
    email: 'other@test.com',
    firstName: 'Other',
  };

  const employee = {
    EMPLOYEE_ID: 1,
    EMPLOYEE_NO: 'FNPH-NUR-001',
    USER_ID: 10,
    FIRST_NAME: 'Blessing',
    LAST_NAME: 'Nurse',
    EMAIL: 'nurse@test.com',
    PHONE: '0801',
    DEPARTMENT_ID: 5,
    DEPARTMENT_NAME: 'Nursing',
    DESIGNATION: 'Nurse',
    STATUS: 'Active',
    NEXT_OF_KIN: null,
    NEXT_OF_KIN_PHONE: null,
    EMERGENCY_CONTACT: null,
    EMERGENCY_PHONE: null,
  };

  let service: HrSelfService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.hrPublicHolidays.findMany.mockResolvedValue([]);
    prisma.hrLeaveTypes.findMany.mockResolvedValue([
      {
        LEAVE_TYPE_ID: 1,
        CODE: 'ANNUAL',
        NAME: 'Annual',
        DAYS_PER_YEAR: 30,
        IS_ACTIVE: true,
      },
    ]);
    prisma.hrLeaveRequests.findMany.mockResolvedValue([]);
    prisma.hrEmployees.findMany.mockResolvedValue([]);
    prisma.users.findMany.mockResolvedValue([]);
    service = new HrSelfService(
      prisma as any,
      audit as any,
      notifications as any,
      email as any,
    );
  });

  function linkActor(emp = employee) {
    prisma.users.findUnique.mockResolvedValue({ EMPLOYEE_ID: emp.EMPLOYEE_ID });
    prisma.hrEmployees.findUnique.mockResolvedValue(emp);
  }

  describe('ownership / link', () => {
    it('rejects unlinked users', async () => {
      prisma.users.findUnique.mockResolvedValue({ EMPLOYEE_ID: null });
      await expect(service.getSummary(nurseUser as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('blocks payslip access for another employee line', async () => {
      linkActor();
      prisma.hrPayrollLines.findUnique.mockResolvedValue({
        LINE_ID: 50,
        EMPLOYEE_ID: 999,
        RUN_ID: 1,
        BASIC: 1,
        ALLOWANCES: 0,
        DEDUCTIONS: 0,
        PAYE: 0,
        PENSION: 0,
        NET_PAY: 1,
        STATUS: 'Paid',
        run: {
          STATUS: 'Locked',
          PERIOD_YEAR: 2026,
          PERIOD_MONTH: 9,
          LOCKED_AT: new Date(),
        },
      });
      await expect(
        service.getMyPayslip(50, nurseUser as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('hides Draft payroll from payslip list (Locked only)', async () => {
      linkActor();
      prisma.hrPayrollLines.findMany.mockResolvedValue([]);
      const result = await service.listMyPayslips(nurseUser as any);
      expect(prisma.hrPayrollLines.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            EMPLOYEE_ID: 1,
            run: { STATUS: 'Locked' },
          }),
        }),
      );
      expect(result.items).toEqual([]);
    });

    it('lists Final appraisals only', async () => {
      linkActor();
      prisma.hrAppraisals.findMany.mockResolvedValue([]);
      await service.listMyAppraisals(nurseUser as any);
      expect(prisma.hrAppraisals.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { EMPLOYEE_ID: 1, STATUS: 'Final' },
        }),
      );
    });
  });

  describe('createMyLeave rules', () => {
    beforeEach(() => {
      linkActor();
      prisma.hrLeaveTypes.findUnique.mockResolvedValue({
        LEAVE_TYPE_ID: 1,
        CODE: 'ANNUAL',
        NAME: 'Annual',
        DAYS_PER_YEAR: 30,
        IS_ACTIVE: true,
      });
      prisma.hrDepartmentHeads.findUnique.mockResolvedValue({
        DEPARTMENT_ID: 5,
        HEAD_EMPLOYEE_ID: 77,
        DEPUTY_EMPLOYEE_ID: null,
      });
      prisma.hrLeaveRequests.create.mockImplementation(async ({ data }: any) => ({
        LEAVE_ID: 100,
        ...data,
        HOD_DECISION_BY_ID: null,
        HOD_DECISION_BY: null,
        HOD_DECISION_AT: null,
        HOD_NOTE: null,
        APPROVER_EMPLOYEE_ID: null,
        APPROVED_BY_ID: null,
        APPROVED_BY: null,
        APPROVED_AT: null,
        DECISION_NOTE: null,
        UPDATED_BY: null,
        UPDATED_DATE: null,
      }));
    });

    it('computes working days and routes to PendingHod', async () => {
      // Mon–Wed = 3 days
      const result = await service.createMyLeave(
        {
          leaveTypeId: 1,
          startDate: '2026-10-05',
          endDate: '2026-10-07',
          reason: 'rest',
        } as any,
        nurseUser as any,
      );
      expect(result.days).toBe(3);
      expect(result.status).toBe('PendingHod');
      expect(prisma.hrLeaveRequests.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ STATUS: 'PendingHod', DAYS: expect.anything() }),
        }),
      );
    });

    it('skips to PendingHr when requester is HOD', async () => {
      prisma.hrDepartmentHeads.findUnique.mockResolvedValue({
        DEPARTMENT_ID: 5,
        HEAD_EMPLOYEE_ID: 1,
        DEPUTY_EMPLOYEE_ID: null,
      });
      const result = await service.createMyLeave(
        {
          leaveTypeId: 1,
          startDate: '2026-10-05',
          endDate: '2026-10-07',
        } as any,
        nurseUser as any,
      );
      expect(result.status).toBe('PendingHr');
    });

    it('rejects overlapping active leave', async () => {
      prisma.hrLeaveRequests.findMany.mockResolvedValue([
        {
          LEAVE_ID: 9,
          START_DATE: new Date('2026-10-06T00:00:00.000Z'),
          END_DATE: new Date('2026-10-08T00:00:00.000Z'),
          STATUS: 'PendingHod',
        },
      ]);
      await expect(
        service.createMyLeave(
          {
            leaveTypeId: 1,
            startDate: '2026-10-05',
            endDate: '2026-10-07',
          } as any,
          nurseUser as any,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects over-balance requests', async () => {
      prisma.hrLeaveRequests.findMany
        .mockResolvedValueOnce([]) // overlap check
        .mockResolvedValueOnce([
          {
            LEAVE_TYPE_ID: 1,
            LEAVE_TYPE: 'Annual',
            DAYS: 29,
            STATUS: 'Approved',
          },
        ]); // balance year usage
      // recreate service call path: assertNoOverlap then assertBalance
      // assertBalance calls getBalancesForEmployee which calls findMany again
      prisma.hrLeaveRequests.findMany.mockReset();
      prisma.hrLeaveRequests.findMany
        .mockResolvedValueOnce([]) // overlap
        .mockResolvedValueOnce([
          {
            LEAVE_TYPE_ID: 1,
            LEAVE_TYPE: 'Annual',
            DAYS: 29,
            STATUS: 'Approved',
          },
        ]); // balances

      await expect(
        service.createMyLeave(
          {
            leaveTypeId: 1,
            startDate: '2026-10-05',
            endDate: '2026-10-07', // 3 days, remaining 1
          } as any,
          nurseUser as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cancel + HOD', () => {
    it('cancels only own PendingHod/PendingHr', async () => {
      linkActor();
      prisma.hrLeaveRequests.findUnique.mockResolvedValue({
        LEAVE_ID: 3,
        EMPLOYEE_ID: 1,
        STATUS: 'PendingHod',
      });
      prisma.hrLeaveRequests.update.mockResolvedValue({
        LEAVE_ID: 3,
        EMPLOYEE_ID: 1,
        LEAVE_TYPE_ID: 1,
        LEAVE_TYPE: 'Annual',
        START_DATE: new Date('2026-10-05T00:00:00.000Z'),
        END_DATE: new Date('2026-10-07T00:00:00.000Z'),
        DAYS: 3,
        REASON: null,
        STATUS: 'Cancelled',
        APPROVED_BY_ID: null,
        APPROVED_BY: null,
        APPROVED_AT: null,
        DECISION_NOTE: null,
        HOD_DECISION_BY_ID: null,
        HOD_DECISION_BY: null,
        HOD_DECISION_AT: null,
        HOD_NOTE: null,
        APPROVER_EMPLOYEE_ID: null,
        CREATED_BY: null,
        CREATED_DATE: new Date(),
        UPDATED_BY: 'x',
        UPDATED_DATE: new Date(),
      });
      const result = await service.cancelMyLeave(3, nurseUser as any);
      expect(result.status).toBe('Cancelled');
    });

    it('blocks HOD self-approve', async () => {
      linkActor({ ...employee, EMPLOYEE_ID: 77 });
      prisma.hrLeaveRequests.findUnique.mockResolvedValue({
        LEAVE_ID: 3,
        EMPLOYEE_ID: 77,
        STATUS: 'PendingHod',
      });
      await expect(
        service.hodApprove(3, nurseUser as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('profile ownership', () => {
    it('patches only whitelist fields for linked employee', async () => {
      linkActor();
      prisma.hrEmployees.update.mockResolvedValue({
        ...employee,
        PHONE: '080999',
      });
      const result = await service.updateMyProfile(
        { phone: '080999' } as any,
        nurseUser as any,
      );
      expect(result.phone).toBe('080999');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'hr:self:profile:update' }),
      );
    });

    it('does not allow otherUser without link', async () => {
      prisma.users.findUnique.mockResolvedValue({ EMPLOYEE_ID: null });
      await expect(
        service.getMyProfile(otherUser as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('payslip not found for Draft run', () => {
    it('returns NotFound when run is not Locked', async () => {
      linkActor();
      prisma.hrPayrollLines.findUnique.mockResolvedValue({
        LINE_ID: 1,
        EMPLOYEE_ID: 1,
        run: { STATUS: 'Draft' },
      });
      await expect(
        service.getMyPayslip(1, nurseUser as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
