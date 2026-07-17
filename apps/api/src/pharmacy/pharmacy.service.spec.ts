import { BadRequestException } from '@nestjs/common';
import { PharmacyService } from './pharmacy.service';

describe('PharmacyService', () => {
  const drugs = {
    inventoryStats: jest.fn(),
    list: jest.fn(),
  };
  const procurement = {
    stats: jest.fn(),
  };
  const billing = {
    summary: jest.fn(),
    listBills: jest.fn(),
  };
  const returns = {
    summary: jest.fn(),
  };
  const settings = {
    getOrCreate: jest.fn(),
  };
  const prisma: Record<string, any> = {
    prescriptions: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    pharmacySales: {
      findMany: jest.fn(),
    },
    pharmacySaleItems: {
      findMany: jest.fn(),
    },
    pharmacyReturns: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    prescriptionItems: {
      findMany: jest.fn(),
    },
    drugs: {
      findMany: jest.fn(),
    },
    drugBatches: {
      findMany: jest.fn(),
    },
    audits: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    persons: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  let service: PharmacyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PharmacyService(
      prisma as any,
      drugs as any,
      procurement as any,
      billing as any,
      returns as any,
      settings as any,
    );
  });

  describe('reportCatalog', () => {
    it('returns supported pharmacy report types', () => {
      const catalog = service.reportCatalog();
      expect(catalog.items.length).toBeGreaterThanOrEqual(8);
      expect(catalog.items.map((i) => i.type)).toContain('revenue');
      expect(catalog.items.map((i) => i.type)).toContain('expiry');
    });
  });

  describe('generateReport', () => {
    it('rejects unknown report types', async () => {
      await expect(service.generateReport('nhia')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('auditStats', () => {
    it('aggregates pharmacy-scoped audit counters', async () => {
      prisma.audits.count
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2);

      const stats = await service.auditStats({ timezoneOffsetMinutes: 60 });
      expect(stats.totalToday).toBe(12);
      expect(stats.dispenses).toBe(5);
      expect(stats.emergencies).toBe(2);
      expect(stats.stockEvents).toBe(3);
      expect(stats.returns).toBe(1);
      expect(stats.overrides).toBe(2);
      expect(prisma.audits.count).toHaveBeenCalled();
    });
  });

  describe('inpatient', () => {
    it('joins admissions with prescriptions and paginates', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            admissionId: 1,
            personId: 10,
            wardId: 2,
            bedNo: 'B12',
            status: 'Admitted',
            admissionDate: new Date('2026-07-01'),
            wardName: 'Male Med',
            firstName: 'Ada',
            lastName: 'Okafor',
            middleName: null,
            hospitalNo: 'H-1',
          },
        ])
        .mockResolvedValueOnce([{ wardId: 2, wardName: 'Male Med' }]);

      prisma.prescriptions.findMany.mockResolvedValue([
        {
          PRESCRIPTION_ID: 99,
          RX_NO: 'RX-1',
          PERSON_ID: 10,
          STATUS: 'Sent',
          PAYMENT_STATUS: 'Paid',
          URGENCY: 'Routine',
          PRESCRIBED_BY: 'Dr X',
          SENT_AT: new Date(),
          items: [
            { DRUG_NAME: 'Paracetamol', QUANTITY: 10, QTY_DISPENSED: 0 },
          ],
        },
      ]);

      const result = await service.inpatient({ status: 'awaiting', page: 1, limit: 20 });
      expect(result.summary.admitted).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].queueStatus).toBe('Awaiting Pharmacy');
      expect(result.items[0].rxNo).toBe('RX-1');
      expect(result.meta.total).toBe(1);
    });

    it('returns empty queue when ADMISSION table query fails', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('relation missing'));
      const result = await service.inpatient();
      expect(result.summary.admitted).toBe(0);
      expect(result.items).toEqual([]);
    });
  });

  describe('auditTrail', () => {
    it('scopes results to pharmacy audit types', async () => {
      prisma.audits.findMany.mockResolvedValue([
        {
          AUDIT_ID: 1,
          CREATE_DATE: new Date(),
          CREATED_BY: 'Pharm A',
          AUDIT_TYPE: 'pharmacy:dispense',
          ITEM: 'Dispensed RX-1',
          ENTITY: 'prescriptions',
          ENTITY_ID: '1',
          PERSON_ID: 10,
          USER_ID: 3,
          STATUS: 'Success',
          NEW_VALUE: null,
          OLD_VALUE: null,
          user: { role: { ROLE_NAME: 'Pharmacist' } },
        },
      ]);
      prisma.persons.findMany.mockResolvedValue([
        {
          PERSON_ID: 10,
          HOSPITAL_NO: 'H-1',
          FIRST_NAME: 'Ada',
          LAST_NAME: 'Okafor',
          MIDDLE_NAME: null,
        },
      ]);
      // list count + 6 auditStats counts
      prisma.audits.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.auditTrail({ category: 'dispense', page: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].module).toBe('Dispensing');
      expect(result.items[0].patient).toContain('Ada');
      expect(result.meta.total).toBe(1);
      expect(result.stats.totalToday).toBe(4);
      const whereArg = prisma.audits.findMany.mock.calls[0][0].where;
      expect(whereArg.AND).toBeDefined();
    });
  });
});
