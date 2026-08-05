import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ServiceCatalogService } from './service-catalog.service';

describe('ServiceCatalogService', () => {
  const audit = { log: jest.fn() };

  const prisma: Record<string, any> = {
    serviceCategories: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    departments: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    masterServices: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    servicePayers: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    servicePayerPrices: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    servicePriceApprovals: {
      create: jest.fn(),
    },
    labTests: { updateMany: jest.fn() },
    imagingStudies: { updateMany: jest.fn() },
    admissionBillingItems: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };

  let service: ServiceCatalogService;

  const actor = {
    id: 9,
    email: 'finance@fnpharo.gov.ng',
    firstName: 'Finance',
    lastName: 'Officer',
    roles: ['FINANCE'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: any) => {
      if (typeof fn === 'function') return fn(prisma);
      return Promise.all(fn);
    });
    service = new ServiceCatalogService(prisma as any, audit as any);
  });

  describe('createService', () => {
    it('creates without prices in PENDING_PRICING', async () => {
      prisma.serviceCategories.findUnique.mockResolvedValue({
        CATEGORY_ID: 1,
        CODE: 'LABORATORY',
        STATUS: 'Active',
      });
      prisma.departments.findUnique.mockResolvedValue({
        DEPARTMENT_ID: 2,
        CODE: 'LAB',
        STATUS: 'Active',
      });
      prisma.masterServices.findFirst.mockResolvedValue(null);
      const created = {
        SERVICE_ID: 10,
        SERVICE_CODE: 'SVC-LABORATO-0001',
        CATEGORY_ID: 1,
        DEPARTMENT_ID: 2,
        NAME: 'New Panel',
        DESCRIPTION: null,
        DURATION_MINUTES: null,
        GENERAL_PRICE: null,
        STAFF_PRICE: null,
        ONLINE_BOOKABLE: false,
        APPOINTMENT_REQUIRED: false,
        REQUIRES_DOCTOR_ORDER: true,
        INSURANCE_ELIGIBLE: true,
        AGE_RESTRICTION: null,
        GENDER_RESTRICTION: null,
        STATUS: 'PENDING_PRICING',
        CREATED_BY: 'Finance Officer',
        CREATED_DATE: new Date(),
        UPDATED_BY: 'Finance Officer',
        UPDATED_DATE: new Date(),
        category: { CODE: 'LABORATORY', NAME: 'Laboratory' },
        department: { CODE: 'LAB', NAME: 'Laboratory' },
        bookingSettings: {
          ONLINE_BOOKABLE: false,
          DELIVERY_MODE: 'PHYSICAL',
          DURATION_MINUTES: 30,
          DAY_START: '08:00',
          DAY_END: '17:00',
        },
        payerPrices: [],
        approvals: [],
      };
      prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
      prisma.masterServices.create.mockResolvedValue(created);

      const result = await service.createService(
        { categoryId: 1, departmentId: 2, name: 'New Panel' },
        actor,
      );

      expect(result.status).toBe('PENDING_PRICING');
      expect(result.generalPrice).toBeNull();
      expect(prisma.masterServices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            NAME: 'New Panel',
            STATUS: 'PENDING_PRICING',
          }),
        }),
      );
    });
  });

  describe('setPricing + approve gate', () => {
    it('moves to PENDING_APPROVAL and approve makes ACTIVE', async () => {
      prisma.masterServices.findUnique
        .mockResolvedValueOnce({
          SERVICE_ID: 10,
          SERVICE_CODE: 'SVC-X-0001',
          STATUS: 'PENDING_PRICING',
          STAFF_PRICE: null,
          GENERAL_PRICE: null,
        })
        .mockResolvedValueOnce({
          SERVICE_ID: 10,
          SERVICE_CODE: 'SVC-X-0001',
          STATUS: 'PENDING_APPROVAL',
          STAFF_PRICE: 700,
          GENERAL_PRICE: 1000,
        })
        .mockResolvedValueOnce({
          SERVICE_ID: 10,
          GENERAL_PRICE: 1000,
          STAFF_PRICE: 700,
          payerPrices: [],
        });

      const priced = {
        SERVICE_ID: 10,
        SERVICE_CODE: 'SVC-X-0001',
        CATEGORY_ID: 1,
        DEPARTMENT_ID: 2,
        NAME: 'X',
        DESCRIPTION: null,
        DURATION_MINUTES: null,
        GENERAL_PRICE: 1000,
        STAFF_PRICE: 700,
        ONLINE_BOOKABLE: false,
        APPOINTMENT_REQUIRED: false,
        REQUIRES_DOCTOR_ORDER: true,
        INSURANCE_ELIGIBLE: true,
        AGE_RESTRICTION: null,
        GENDER_RESTRICTION: null,
        STATUS: 'PENDING_APPROVAL',
        CREATED_BY: null,
        CREATED_DATE: null,
        UPDATED_BY: 'Finance Officer',
        UPDATED_DATE: new Date(),
        category: { CODE: 'LABORATORY', NAME: 'Laboratory' },
        department: { CODE: 'LAB', NAME: 'Laboratory' },
        payerPrices: [],
        approvals: [],
      };
      prisma.masterServices.findUniqueOrThrow.mockResolvedValue(priced);
      prisma.masterServices.update.mockResolvedValue(priced);
      prisma.servicePriceApprovals.create.mockResolvedValue({});
      prisma.labTests.updateMany.mockResolvedValue({ count: 0 });
      prisma.imagingStudies.updateMany.mockResolvedValue({ count: 0 });
      prisma.admissionBillingItems.updateMany.mockResolvedValue({ count: 0 });

      const afterPrice = await service.setPricing(
        10,
        { generalPrice: 1000, staffPrice: 700 },
        actor,
      );
      expect(afterPrice.status).toBe('PENDING_APPROVAL');

      const active = {
        ...priced,
        STATUS: 'ACTIVE',
      };
      prisma.masterServices.update.mockResolvedValue(active);

      const approved = await service.approve(10, {}, {
        id: 1,
        email: 'admin@fnpharo.gov.ng',
        firstName: 'Admin',
        lastName: 'User',
        roles: ['ADMIN'],
      });
      expect(approved.status).toBe('ACTIVE');
    });

    it('orderable list filters ACTIVE only', async () => {
      prisma.masterServices.count.mockResolvedValue(1);
      prisma.masterServices.findMany.mockResolvedValue([
        {
          SERVICE_ID: 1,
          SERVICE_CODE: 'SVC-A',
          CATEGORY_ID: 1,
          DEPARTMENT_ID: 1,
          NAME: 'Active One',
          DESCRIPTION: null,
          DURATION_MINUTES: null,
          GENERAL_PRICE: 100,
          STAFF_PRICE: 70,
          ONLINE_BOOKABLE: false,
          APPOINTMENT_REQUIRED: false,
          REQUIRES_DOCTOR_ORDER: true,
          INSURANCE_ELIGIBLE: true,
          AGE_RESTRICTION: null,
          GENDER_RESTRICTION: null,
          STATUS: 'ACTIVE',
          CREATED_BY: null,
          CREATED_DATE: null,
          UPDATED_BY: null,
          UPDATED_DATE: null,
          category: { CODE: 'LABORATORY', NAME: 'Laboratory' },
          department: { CODE: 'LAB', NAME: 'Laboratory' },
          payerPrices: [],
          approvals: [],
        },
      ]);

      await service.listOrderable();
      expect(prisma.masterServices.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ STATUS: 'ACTIVE' }),
        }),
      );
    });
  });

  describe('listBookable', () => {
    it('returns only ACTIVE ONLINE_BOOKABLE services without payer prices', async () => {
      prisma.masterServices.findMany.mockResolvedValue([
        {
          SERVICE_ID: 1,
          SERVICE_CODE: 'SVC-CON-GMPC',
          NAME: 'GMPC General Consultation',
          GENERAL_PRICE: 5000,
          DURATION_MINUTES: 20,
          APPOINTMENT_REQUIRED: true,
          category: { NAME: 'Consultation', CODE: 'CONSULTATION' },
          department: { NAME: 'GMPC', CODE: 'GMPC' },
        },
      ]);

      const result = await service.listBookable();
      expect(prisma.masterServices.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            STATUS: 'ACTIVE',
            ONLINE_BOOKABLE: true,
          }),
        }),
      );
      expect(result.items[0]).toMatchObject({
        serviceId: 1,
        generalPrice: 5000,
        categoryName: 'Consultation',
      });
      expect(result.items[0]).not.toHaveProperty('staffPrice');
    });
  });

  describe('resolvePrice', () => {
    it('returns GENERAL when no payer', async () => {
      prisma.masterServices.findUnique.mockResolvedValue({
        SERVICE_ID: 5,
        SERVICE_CODE: 'SVC-A',
        GENERAL_PRICE: 4500,
        STAFF_PRICE: 3150,
      });
      const result = await service.resolvePrice(5);
      expect(result).toMatchObject({
        amount: 4500,
        source: 'GENERAL',
      });
    });

    it('returns STAFF when payerType=STAFF', async () => {
      prisma.masterServices.findUnique.mockResolvedValue({
        SERVICE_ID: 5,
        SERVICE_CODE: 'SVC-A',
        GENERAL_PRICE: 4500,
        STAFF_PRICE: 3150,
      });
      const result = await service.resolvePrice(5, { payerType: 'STAFF' });
      expect(result).toMatchObject({ amount: 3150, source: 'STAFF' });
    });

    it('returns corporate payer price when active', async () => {
      prisma.masterServices.findUnique.mockResolvedValue({
        SERVICE_ID: 5,
        SERVICE_CODE: 'SVC-A',
        GENERAL_PRICE: 4500,
        STAFF_PRICE: 3150,
      });
      prisma.servicePayerPrices.findFirst.mockResolvedValue({
        AMOUNT: 3800,
        PAYER_ID: 22,
        payer: { PAYER_TYPE: 'CORPORATE', CODE: 'ACME' },
      });
      const result = await service.resolvePrice(5, { payerId: 22 });
      expect(result).toMatchObject({
        amount: 3800,
        source: 'PAYER',
        payerCode: 'ACME',
      });
    });

    it('errors when GENERAL_PRICE is null', async () => {
      prisma.masterServices.findUnique.mockResolvedValue({
        SERVICE_ID: 5,
        SERVICE_CODE: 'SVC-A',
        GENERAL_PRICE: null,
        STAFF_PRICE: null,
      });
      await expect(service.resolvePrice(5)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('404 when service missing', async () => {
      prisma.masterServices.findUnique.mockResolvedValue(null);
      await expect(service.resolvePrice(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findActiveByCode', () => {
    it('returns ACTIVE service by SERVICE_CODE', async () => {
      prisma.masterServices.findUnique.mockResolvedValue({
        SERVICE_ID: 1,
        SERVICE_CODE: 'SVC-REG-FEE',
        STATUS: 'ACTIVE',
      });
      const row = await service.findActiveByCode('SVC-REG-FEE');
      expect(row.SERVICE_CODE).toBe('SVC-REG-FEE');
    });

    it('404 when service inactive or missing', async () => {
      prisma.masterServices.findUnique.mockResolvedValue({
        SERVICE_ID: 1,
        SERVICE_CODE: 'SVC-REG-FEE',
        STATUS: 'PENDING_PRICING',
      });
      await expect(service.findActiveByCode('SVC-REG-FEE')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('resolveRegistrationCharges', () => {
    it('resolves reg, card, and consult fees from catalog', async () => {
      const services = {
        'SVC-REG-FEE': { SERVICE_ID: 1, SERVICE_CODE: 'SVC-REG-FEE', STATUS: 'ACTIVE', GENERAL_PRICE: 1500, STAFF_PRICE: 1050 },
        'SVC-CARD-FEE': { SERVICE_ID: 2, SERVICE_CODE: 'SVC-CARD-FEE', STATUS: 'ACTIVE', GENERAL_PRICE: 500, STAFF_PRICE: 350 },
        'SVC-REG-CONSULT': { SERVICE_ID: 3, SERVICE_CODE: 'SVC-REG-CONSULT', STATUS: 'ACTIVE', GENERAL_PRICE: 5500, STAFF_PRICE: 3850 },
      };
      prisma.masterServices.findUnique.mockImplementation(
        ({ where }: { where: { SERVICE_CODE?: string; SERVICE_ID?: number } }) => {
          if (where.SERVICE_CODE) {
            return Promise.resolve(
              services[where.SERVICE_CODE as keyof typeof services] ?? null,
            );
          }
          if (where.SERVICE_ID != null) {
            return Promise.resolve(
              Object.values(services).find((s) => s.SERVICE_ID === where.SERVICE_ID) ?? null,
            );
          }
          return Promise.resolve(null);
        },
      );

      const result = await service.resolveRegistrationCharges();
      expect(result).toMatchObject({
        regFee: 1500,
        cardFee: 500,
        consultFee: 5500,
        total: 7500,
      });
      expect(result.items).toHaveLength(3);
      expect(result.items[0]).toMatchObject({ code: 'SVC-REG-FEE', source: 'GENERAL' });
    });

    it('404 when a required fee service is missing', async () => {
      prisma.masterServices.findUnique.mockResolvedValue(null);
      await expect(service.resolveRegistrationCharges()).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
