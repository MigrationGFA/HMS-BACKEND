import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { HeipTemplatesService } from './heip-templates.service';

describe('HeipTemplatesService', () => {
  const audit = { log: jest.fn() };
  const prisma: Record<string, any> = {
    heipReportTemplates: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    heipTemplateVersions: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    users: { findUnique: jest.fn() },
    hrEmployees: { findUnique: jest.fn() },
  };

  const adminUser = {
    id: 1,
    email: 'admin@test.com',
    phone: null,
    firstName: 'Admin',
    lastName: 'User',
    roles: ['SUPER_ADMIN'],
    mustResetPassword: false,
    personId: null,
  };

  let service: HeipTemplatesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HeipTemplatesService(prisma as any, audit as any);
  });

  it('rejects duplicate template codes', async () => {
    prisma.heipReportTemplates.findUnique.mockResolvedValue({
      TEMPLATE_ID: 1,
      CODE: 'HEIP-NURSING-SHIFT',
    });
    await expect(
      service.createTemplate(
        { code: 'heip-nursing-shift', name: 'Nursing' } as any,
        adminUser as any,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates template and audits', async () => {
    prisma.heipReportTemplates.findUnique.mockResolvedValue(null);
    prisma.heipReportTemplates.create.mockResolvedValue({
      TEMPLATE_ID: 2,
      CODE: 'HEIP-X',
      NAME: 'X',
      DEPARTMENT_ID: null,
      ROLE_NAME: null,
      FREQUENCY: 'daily',
      DEADLINE_HOUR: 10,
      DEADLINE_GRACE_HOURS: 2,
      IS_ACTIVE: true,
      CREATED_DATE: new Date(),
      UPDATED_DATE: null,
    });
    const result = await service.createTemplate(
      { code: 'heip-x', name: 'X' } as any,
      adminUser as any,
    );
    expect(result.templateId).toBe(2);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'heip:template:create' }),
    );
  });

  it('cannot publish without draft', async () => {
    prisma.heipTemplateVersions.findFirst.mockResolvedValue(null);
    await expect(
      service.publish(1, adminUser as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('publishes latest draft version', async () => {
    prisma.heipTemplateVersions.findFirst.mockResolvedValue({
      VERSION_ID: 9,
      TEMPLATE_ID: 1,
      VERSION_NO: 1,
      FIELD_SCHEMA: [{ key: 'a', label: 'A', type: 'number' }],
      STATUS: 'Draft',
      PUBLISHED_AT: null,
      PUBLISHED_BY: null,
      CREATED_DATE: new Date(),
    });
    prisma.heipTemplateVersions.update.mockResolvedValue({
      VERSION_ID: 9,
      TEMPLATE_ID: 1,
      VERSION_NO: 1,
      FIELD_SCHEMA: [{ key: 'a', label: 'A', type: 'number' }],
      STATUS: 'Published',
      PUBLISHED_AT: new Date(),
      PUBLISHED_BY: 'Admin User',
      CREATED_DATE: new Date(),
    });
    const result = await service.publish(1, adminUser as any);
    expect(result.status).toBe('Published');
  });

  it('resolveMine returns unlinked message', async () => {
    prisma.users.findUnique.mockResolvedValue({ EMPLOYEE_ID: null });
    const result = await service.resolveMine(adminUser as any);
    expect(result.linked).toBe(false);
    expect(result.message).toMatch(/link your account/i);
  });

  it('getTemplate 404', async () => {
    prisma.heipReportTemplates.findUnique.mockResolvedValue(null);
    await expect(service.getTemplate(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('resolveForEmployee prefers dept+role then dept then general', async () => {
    const published = {
      versions: [
        {
          VERSION_ID: 1,
          TEMPLATE_ID: 1,
          VERSION_NO: 1,
          FIELD_SCHEMA: [],
          STATUS: 'Published',
          PUBLISHED_AT: new Date(),
          PUBLISHED_BY: 'x',
          CREATED_DATE: new Date(),
        },
      ],
      TEMPLATE_ID: 1,
      CODE: 'T',
      NAME: 'T',
      DEPARTMENT_ID: 5,
      ROLE_NAME: 'NURSE',
      FREQUENCY: 'shift',
      DEADLINE_HOUR: 10,
      DEADLINE_GRACE_HOURS: 2,
      IS_ACTIVE: true,
      CREATED_DATE: new Date(),
      UPDATED_DATE: null,
    };
    prisma.heipReportTemplates.findFirst
      .mockResolvedValueOnce(published)
      .mockResolvedValue(null);

    const result = await service.resolveForEmployee(
      { DEPARTMENT_ID: 5, DESIGNATION: 'Nurse' },
      ['NURSE'],
    );
    expect(result?.match).toBe('dept+role');
  });
});
