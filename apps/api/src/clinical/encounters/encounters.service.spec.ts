import { ConflictException } from '@nestjs/common';
import { EncountersService } from './encounters.service';

describe('EncountersService payment gate helpers', () => {
  it('maps queue paymentCleared false when card Pending', () => {
    const service = Object.create(EncountersService.prototype) as EncountersService;
    const item = (service as unknown as {
      toQueueItem: (t: unknown) => {
        paymentCleared: boolean;
        canStart: boolean;
        paymentStatus: string;
      };
    }).toQueueItem({
      TRIAGE_ID: 1,
      PERSON_ID: 10,
      QUEUE_NO: 'Q-001',
      CLINIC: 'OPC',
      STATUS: 'Sent to Consultation',
      PRIORITY: 'Routine',
      PATIENT_TYPE: 'New',
      ARRIVAL_AT: new Date(),
      WEIGHT_KG: null,
      BLOOD_PRESSURE: null,
      TEMPERATURE_C: null,
      PULSE_BPM: null,
      person: {
        HOSPITAL_NO: 'FNPH/1',
        FIRST_NAME: 'Ada',
        MIDDLE_NAME: null,
        LAST_NAME: 'Nwosu',
        SEX: 'F',
        DATE_OF_BIRTH: null,
        NHIS_NO: null,
        HMO_ID: null,
        DATE_OF_REGISTRATION: null,
        cards: [{ PAYMENT_STATUS: 'Pending' }],
      },
    });
    expect(item.paymentCleared).toBe(false);
    expect(item.canStart).toBe(false);
    expect(item.paymentStatus).toBe('Pending');
  });

  it('allows start when card Paid', () => {
    const service = Object.create(EncountersService.prototype) as EncountersService;
    const item = (service as unknown as {
      toQueueItem: (t: unknown) => {
        paymentCleared: boolean;
        canStart: boolean;
        paymentStatus: string;
      };
    }).toQueueItem({
      TRIAGE_ID: 2,
      PERSON_ID: 11,
      QUEUE_NO: 'Q-002',
      CLINIC: 'GMPC',
      STATUS: 'Triage Completed',
      PRIORITY: 'Urgent',
      PATIENT_TYPE: 'Returning',
      ARRIVAL_AT: new Date(),
      WEIGHT_KG: 70,
      BLOOD_PRESSURE: '120/80',
      TEMPERATURE_C: null,
      PULSE_BPM: 72,
      person: {
        HOSPITAL_NO: 'FNPH/2',
        FIRST_NAME: 'John',
        MIDDLE_NAME: null,
        LAST_NAME: 'Doe',
        SEX: 'M',
        DATE_OF_BIRTH: null,
        NHIS_NO: null,
        HMO_ID: null,
        DATE_OF_REGISTRATION: null,
        cards: [{ PAYMENT_STATUS: 'Paid' }],
      },
    });
    expect(item.paymentCleared).toBe(true);
    expect(item.canStart).toBe(true);
    expect(item.paymentStatus).toBe('Paid');
    expect(item).toMatchObject({ vitalsStatus: 'Captured', visit: 'Return' });
  });
});

describe('CardsService.assertPaymentCleared contract', () => {
  it('ConflictException shape includes paymentStatus Pending', () => {
    const err = new ConflictException({
      message:
        'Card payment is pending — the cashier must confirm payment before the patient can proceed',
      cardId: 7,
      cardNo: 'CARD-7',
      paymentStatus: 'Pending',
    });
    const body = err.getResponse() as Record<string, unknown>;
    expect(body.paymentStatus).toBe('Pending');
    expect(body.cardId).toBe(7);
  });
});
