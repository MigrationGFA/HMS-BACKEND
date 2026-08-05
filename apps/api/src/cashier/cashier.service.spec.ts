import { NotFoundException } from '@nestjs/common';
import { CashierService } from './cashier.service';

describe('CashierService', () => {
  const audit = { log: jest.fn() };

  const patientsService = { search: jest.fn() };

  const prisma: Record<string, any> = {
    cashierPaymentReceipts: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    cashierDiscountRequests: { aggregate: jest.fn() },
    patientCards: { findMany: jest.fn() },
    pharmacySales: { findMany: jest.fn() },
    prescriptions: { findMany: jest.fn() },
    labRequests: { findMany: jest.fn() },
    admissionBills: { findMany: jest.fn() },
    imagingRequests: { findMany: jest.fn() },
    opcVisits: { findMany: jest.fn() },
    persons: { findUnique: jest.fn(), findMany: jest.fn() },
    cashierRefundRequests: { findMany: jest.fn() },
    cashierSettings: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  let service: CashierService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CashierService(prisma as any, audit as any, patientsService as any);
    prisma.cashierPaymentReceipts.findMany.mockResolvedValue([]);
    prisma.cashierDiscountRequests.aggregate.mockResolvedValue({
      _sum: { COMPUTED_AMOUNT: 0 },
    });
    prisma.cashierSettings.findFirst.mockResolvedValue({
      SETTINGS_ID: 1,
      WALLET_ENABLED: 'Y',
    });
    prisma.cashierSettings.findUnique.mockResolvedValue({
      SETTINGS_ID: 1,
      WALLET_ENABLED: 'Y',
    });
  });

  describe('listEligibleBills', () => {
    it('returns partial data when one source fails', async () => {
      prisma.patientCards.findMany.mockResolvedValue([
        {
          CARD_ID: 1,
          CARD_NO: 'CARD-001',
          PERSON_ID: 5,
          TOTAL_AMOUNT: 1000,
          PAYMENT_STATUS: 'Pending',
          person: { FIRST_NAME: 'Ada', MIDDLE_NAME: null, LAST_NAME: 'Oka', HOSPITAL_NO: 'H001' },
        },
      ]);
      prisma.pharmacySales.findMany.mockResolvedValue([]);
      prisma.prescriptions.findMany.mockResolvedValue([]);
      prisma.labRequests.findMany.mockResolvedValue([]);
      prisma.admissionBills.findMany.mockResolvedValue([]);
      prisma.imagingRequests.findMany.mockResolvedValue([]);
      prisma.opcVisits.findMany.mockRejectedValue(new Error('OpcVisits table missing'));

      const result = await service.listEligibleBills();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].sourceType).toBe('card');
      expect(result.partialErrors).toEqual([
        'Psychiatric OPC: OpcVisits table missing',
      ]);
    });
  });

  describe('getReports', () => {
    it('still returns receipt KPIs when eligible bills partially fail', async () => {
      prisma.cashierPaymentReceipts.findMany.mockResolvedValue([
        {
          RECEIPT_ID: 1,
          RECEIPT_NO: 'CR-2026-0001',
          SOURCE_TYPE: 'lab',
          SOURCE_ID: 1,
          PERSON_ID: 2,
          AMOUNT: 5000,
          CHANNEL: 'Cash',
          PAYMENT_REF: null,
          CASHIER_USER_ID: 1,
          CASHIER_LABEL: 'Cashier',
          PAID_AT: new Date('2026-08-05T10:00:00Z'),
          STATUS: 'Captured',
          AMOUNT_REFUNDED: 0,
          PATIENT_NAME: 'Test Patient',
          SOURCE_REF: 'LAB-001',
        },
      ]);
      prisma.patientCards.findMany.mockResolvedValue([]);
      prisma.pharmacySales.findMany.mockResolvedValue([]);
      prisma.prescriptions.findMany.mockResolvedValue([]);
      prisma.labRequests.findMany.mockResolvedValue([]);
      prisma.admissionBills.findMany.mockResolvedValue([]);
      prisma.imagingRequests.findMany.mockResolvedValue([]);
      prisma.opcVisits.findMany.mockRejectedValue(new Error('OpcVisits unavailable'));

      const result = await service.getReports();

      expect(result.kpis.collected).toBe(5000);
      expect(result.kpis.receiptCount).toBe(1);
      expect(result.partialErrors).toEqual([
        'Psychiatric OPC: OpcVisits unavailable',
      ]);
    });
  });

  describe('listRecentPatients', () => {
    it('returns receipt patients first then backfills from registrations', async () => {
      prisma.cashierPaymentReceipts.findMany.mockResolvedValue([
        { PERSON_ID: 2 },
        { PERSON_ID: 5 },
      ]);
      prisma.persons.findMany
        .mockResolvedValueOnce([
          {
            PERSON_ID: 2,
            HOSPITAL_NO: 'H002',
            FIRST_NAME: 'Bob',
            MIDDLE_NAME: null,
            LAST_NAME: 'Lee',
            PATIENT_PHONE_NO: '080',
          },
          {
            PERSON_ID: 5,
            HOSPITAL_NO: 'H005',
            FIRST_NAME: 'Ada',
            MIDDLE_NAME: null,
            LAST_NAME: 'Oka',
            PATIENT_PHONE_NO: '081',
          },
        ])
        .mockResolvedValueOnce([
          {
            PERSON_ID: 9,
            HOSPITAL_NO: 'H009',
            FIRST_NAME: 'New',
            MIDDLE_NAME: null,
            LAST_NAME: 'Patient',
            PATIENT_PHONE_NO: '082',
          },
        ]);

      const result = await service.listRecentPatients(3);

      expect(result.items.map((i) => i.personId)).toEqual([2, 5, 9]);
      expect(result.items[0].firstName).toBe('Bob');
    });
  });

  describe('searchPatients', () => {
    it('delegates to recent when q is empty', async () => {
      prisma.cashierPaymentReceipts.findMany.mockResolvedValue([]);
      prisma.persons.findMany.mockResolvedValue([
        {
          PERSON_ID: 1,
          HOSPITAL_NO: 'H001',
          FIRST_NAME: 'Test',
          MIDDLE_NAME: null,
          LAST_NAME: 'User',
          PATIENT_PHONE_NO: null,
        },
      ]);

      const result = await service.searchPatients('  ', 10);

      expect(patientsService.search).not.toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
    });

    it('searches by term via PatientsService', async () => {
      patientsService.search.mockResolvedValue({
        items: [
          {
            personId: 7,
            hospitalNo: 'H007',
            firstName: 'Search',
            middleName: null,
            lastName: 'Hit',
            patientPhoneNo: '090',
          },
        ],
        meta: { page: 1, limit: 20, total: 1 },
      });

      const result = await service.searchPatients('Search', 20);

      expect(patientsService.search).toHaveBeenCalledWith('Search', 1, 20);
      expect(result.items[0].personId).toBe(7);
    });
  });

  describe('getPatientPaymentHistory', () => {
    it('throws when patient not found', async () => {
      prisma.persons.findUnique.mockResolvedValue(null);
      await expect(service.getPatientPaymentHistory(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns receipts and outstanding for a patient', async () => {
      prisma.persons.findUnique.mockResolvedValue({
        PERSON_ID: 5,
        HOSPITAL_NO: 'H005',
        FIRST_NAME: 'Ada',
        MIDDLE_NAME: null,
        LAST_NAME: 'Oka',
        PATIENT_PHONE_NO: '08012345678',
      });
      prisma.cashierPaymentReceipts.findMany.mockResolvedValue([
        {
          RECEIPT_NO: 'CR-2026-0002',
          CHANNEL: 'Cash',
          AMOUNT: 3000,
          PAID_AT: new Date('2026-08-05T11:00:00Z'),
          SOURCE_TYPE: 'lab',
          SOURCE_REF: 'LAB-002',
          STATUS: 'Captured',
          RECEIPT_ID: 2,
        },
      ]);
      prisma.cashierRefundRequests.findMany.mockResolvedValue([]);
      prisma.patientCards.findMany.mockResolvedValue([]);
      prisma.pharmacySales.findMany.mockResolvedValue([]);
      prisma.prescriptions.findMany.mockResolvedValue([]);
      prisma.labRequests.findMany.mockResolvedValue([
        {
          LAB_REQUEST_ID: 10,
          REQUEST_NO: 'LAB-010',
          PERSON_ID: 5,
          TOTAL_AMOUNT: 2000,
          PAYMENT_STATUS: 'Unpaid',
          person: { FIRST_NAME: 'Ada', MIDDLE_NAME: null, LAST_NAME: 'Oka', HOSPITAL_NO: 'H005' },
        },
      ]);
      prisma.admissionBills.findMany.mockResolvedValue([]);
      prisma.imagingRequests.findMany.mockResolvedValue([]);
      prisma.opcVisits.findMany.mockResolvedValue([]);

      const result = await service.getPatientPaymentHistory(5);

      expect(result.person.hospitalNo).toBe('H005');
      expect(result.receipts).toHaveLength(1);
      expect(result.outstandingBills).toHaveLength(1);
      expect(result.outstanding).toBe(2000);
    });
  });
});
