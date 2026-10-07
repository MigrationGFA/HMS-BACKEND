import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { HeipMeService } from './heip-me.service';

describe('HeipMeService — ownership / no-HOD / critical / override', () => {
  const audit = { log: jest.fn() };
  const notifications = { createForUser: jest.fn() };
  const templates = {
    resolveForEmployee: jest.fn(),
  };
  const autofill = {
    stampFields: jest.fn(),
    resolveMany: jest.fn(),
  };

  const prisma: Record<string, any> = {
    users: { findUnique: jest.fn(), findMany: jest.fn() },
    hrEmployees: { findUnique: jest.fn(), findMany: jest.fn() },
    hrDepartmentHeads: { findUnique: jest.fn() },
    heipReports: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    heipReportValues: { upsert: jest.fn() },
    heipReportEvents: { create: jest.fn() },
    heipRedFlags: { create: jest.fn() },
    $transaction: jest.fn(async (fn: any) =>
      fn({
        heipReports: prisma.heipReports,
        heipReportEvents: prisma.heipReportEvents,
        heipReportValues: prisma.heipReportValues,
      }),
    ),
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
  };

  const fields = [
    {
      key: 'patients_seen',
      label: 'Patients seen',
      type: 'number' as const,
      required: true,
      autoFillSource: 'encounters.completed_today',
      metricKey: 'patients_seen',
    },
    {
      key: 'deaths',
      label: 'Deaths',
      type: 'number' as const,
      required: true,
      metricKey: 'deaths',
      critical: { op: 'gt' as const, value: 0 },
    },
  ];

  let service: HeipMeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HeipMeService(
      prisma as any,
      audit as any,
      notifications as any,
      templates as any,
      autofill as any,
    );
  });

  function linkActor(emp = employee) {
    prisma.users.findUnique.mockResolvedValue({ EMPLOYEE_ID: emp.EMPLOYEE_ID });
    prisma.hrEmployees.findUnique.mockResolvedValue(emp);
  }

  describe('ownership / link', () => {
    it('rejects unlinked users', async () => {
      prisma.users.findUnique.mockResolvedValue({ EMPLOYEE_ID: null });
      await expect(service.getToday(nurseUser as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('blocks getMyReport for another employee', async () => {
      linkActor();
      prisma.heipReports.findUnique.mockResolvedValue({
        REPORT_ID: 9,
        EMPLOYEE_ID: 999,
        values: [],
        events: [],
        templateVersion: { FIELD_SCHEMA: [] },
      });
      await expect(
        service.getMyReport(9, nurseUser as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('override reason', () => {
    it('requires override reason when changing system value', () => {
      expect(() =>
        service.validateOverrides(fields, [
          {
            fieldKey: 'patients_seen',
            valueNumber: 10,
            systemValueNumber: 42,
          },
        ]),
      ).toThrow(BadRequestException);
    });

    it('allows override when reason provided', () => {
      expect(() =>
        service.validateOverrides(fields, [
          {
            fieldKey: 'patients_seen',
            valueNumber: 10,
            systemValueNumber: 42,
            overrideReason: 'Walk-ins not in system',
          },
        ]),
      ).not.toThrow();
    });
  });

  describe('critical detection', () => {
    it('flags deaths > 0', () => {
      const hits = service.detectCriticals(fields, [
        { fieldKey: 'deaths', valueNumber: 2 },
        { fieldKey: 'patients_seen', valueNumber: 5 },
      ]);
      expect(hits).toHaveLength(1);
      expect(hits[0].fieldKey).toBe('deaths');
    });

    it('does not flag deaths = 0', () => {
      const hits = service.detectCriticals(fields, [
        { fieldKey: 'deaths', valueNumber: 0 },
      ]);
      expect(hits).toHaveLength(0);
    });
  });

  describe('no-HOD / HOD submitter auto-approve', () => {
    const version = {
      versionId: 3,
      fields,
    };

    beforeEach(() => {
      linkActor();
      templates.resolveForEmployee.mockResolvedValue({
        template: {
          templateId: 1,
          frequency: 'daily',
          code: 'T1',
          name: 'T',
        },
        version,
        match: 'dept',
      });
      prisma.heipReports.findFirst.mockResolvedValue(null);
      prisma.heipReports.create.mockResolvedValue({
        REPORT_ID: 100,
        TEMPLATE_ID: 1,
        TEMPLATE_VERSION_ID: 3,
        EMPLOYEE_ID: 1,
        USER_ID: 10,
        DEPARTMENT_ID: 5,
        REPORT_DATE: new Date('2026-10-07T00:00:00.000Z'),
        SHIFT: null,
        STATUS: 'Draft',
        LATE: false,
        PREVIOUS_REPORT_ID: null,
        AMENDMENT_REASON: null,
        SUBMITTED_AT: null,
        APPROVED_AT: null,
        APPROVED_BY: null,
        APPROVED_BY_ID: null,
        RETURN_COMMENT: null,
        CREATED_DATE: new Date(),
        templateVersion: { FIELD_SCHEMA: fields },
      });
      prisma.heipReportValues.upsert.mockResolvedValue({});
      prisma.heipReportEvents.create.mockResolvedValue({});
      prisma.heipReports.update.mockImplementation(async ({ data }: any) => ({
        REPORT_ID: 100,
        TEMPLATE_ID: 1,
        TEMPLATE_VERSION_ID: 3,
        EMPLOYEE_ID: 1,
        USER_ID: 10,
        DEPARTMENT_ID: 5,
        REPORT_DATE: new Date('2026-10-07T00:00:00.000Z'),
        SHIFT: null,
        STATUS: data.STATUS,
        LATE: false,
        PREVIOUS_REPORT_ID: null,
        AMENDMENT_REASON: null,
        SUBMITTED_AT: data.SUBMITTED_AT ?? null,
        APPROVED_AT: data.APPROVED_AT ?? null,
        APPROVED_BY: data.APPROVED_BY ?? null,
        APPROVED_BY_ID: data.APPROVED_BY_ID ?? null,
        RETURN_COMMENT: null,
        CREATED_DATE: new Date(),
        values: [],
      }));
      prisma.users.findMany.mockResolvedValue([]);
      prisma.hrEmployees.findMany.mockResolvedValue([]);
    });

    it('auto-approves with SYSTEM_NO_HOD when no department head', async () => {
      prisma.hrDepartmentHeads.findUnique.mockResolvedValue(null);

      const result = await service.submit(
        {
          values: [
            { fieldKey: 'patients_seen', valueNumber: 5 },
            { fieldKey: 'deaths', valueNumber: 0 },
          ],
        } as any,
        nurseUser as any,
      );

      expect(result.status).toBe('Approved');
      expect(result.autoApproved).toBe(true);
      expect(result.approvedBy).toBe('SYSTEM_NO_HOD');
    });

    it('auto-approves when submitter is HOD', async () => {
      prisma.hrDepartmentHeads.findUnique.mockResolvedValue({
        DEPARTMENT_ID: 5,
        HEAD_EMPLOYEE_ID: 1,
        DEPUTY_EMPLOYEE_ID: null,
      });

      const result = await service.submit(
        {
          values: [
            { fieldKey: 'patients_seen', valueNumber: 5 },
            { fieldKey: 'deaths', valueNumber: 0 },
          ],
        } as any,
        nurseUser as any,
      );

      expect(result.status).toBe('Approved');
      expect(result.autoApproved).toBe(true);
      expect(result.approvedBy).toBe('SYSTEM_NO_HOD');
    });

    it('routes to Submitted when HOD exists and submitter is not HOD', async () => {
      prisma.hrDepartmentHeads.findUnique.mockResolvedValue({
        DEPARTMENT_ID: 5,
        HEAD_EMPLOYEE_ID: 77,
        DEPUTY_EMPLOYEE_ID: null,
      });
      prisma.hrEmployees.findMany.mockResolvedValue([{ USER_ID: 77 }]);

      const result = await service.submit(
        {
          values: [
            { fieldKey: 'patients_seen', valueNumber: 5 },
            { fieldKey: 'deaths', valueNumber: 0 },
          ],
        } as any,
        nurseUser as any,
      );

      expect(result.status).toBe('Submitted');
      expect(result.autoApproved).toBe(false);
    });

    it('creates red flags when critical triggers on submit', async () => {
      prisma.hrDepartmentHeads.findUnique.mockResolvedValue(null);
      prisma.heipRedFlags.create.mockResolvedValue({});

      const result = await service.submit(
        {
          values: [
            { fieldKey: 'patients_seen', valueNumber: 5 },
            { fieldKey: 'deaths', valueNumber: 1 },
          ],
        } as any,
        nurseUser as any,
      );

      expect(result.criticalCount).toBe(1);
      expect(prisma.heipRedFlags.create).toHaveBeenCalled();
    });
  });
});
