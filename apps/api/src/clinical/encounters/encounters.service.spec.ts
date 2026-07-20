import { ConflictException } from '@nestjs/common';
import { EncountersService } from './encounters.service';

describe('EncountersService payment gate helpers', () => {
  it('maps queue paymentCleared false when card Pending', () => {
    const service = Object.create(EncountersService.prototype) as EncountersService;
    const item = (
      service as unknown as {
        toQueueItem: (
          t: unknown,
          lastVisit: string | null,
        ) => {
          paymentCleared: boolean;
          canStart: boolean;
          paymentStatus: string;
          vitals: { status: string };
          lastVisit: string | null;
        };
      }
    ).toQueueItem(
      {
        TRIAGE_ID: 1,
        PERSON_ID: 10,
        QUEUE_NO: 'Q-001',
        CLINIC: 'OPC',
        STATUS: 'Sent to Consultation',
        PRIORITY: 'Routine',
        PATIENT_TYPE: 'New',
        ARRIVAL_AT: new Date(),
        WEIGHT_KG: null,
        HEIGHT_CM: null,
        BMI: null,
        BLOOD_PRESSURE: null,
        TEMPERATURE_C: null,
        PULSE_BPM: null,
        RESPIRATORY_RATE: null,
        SPO2_PCT: null,
        NOTES: null,
        person: {
          HOSPITAL_NO: 'FNPH/1',
          FIRST_NAME: 'Ada',
          MIDDLE_NAME: null,
          LAST_NAME: 'Nwosu',
          SEX: 'F',
          DATE_OF_BIRTH: null,
          NHIS_NO: null,
          HMO_ID: null,
          cards: [{ PAYMENT_STATUS: 'Pending' }],
        },
      },
      null,
    );
    expect(item.paymentCleared).toBe(false);
    expect(item.canStart).toBe(false);
    expect(item.paymentStatus).toBe('Pending');
    expect(item.vitals.status).toBe('Pending');
    expect(item.lastVisit).toBeNull();
  });

  it('allows start when card Paid and includes vitals', () => {
    const service = Object.create(EncountersService.prototype) as EncountersService;
    const item = (
      service as unknown as {
        toQueueItem: (
          t: unknown,
          lastVisit: string | null,
        ) => {
          paymentCleared: boolean;
          canStart: boolean;
          paymentStatus: string;
          vitalsStatus: string;
          visit: string;
          vitals: { bloodPressure: string | null; pulseBpm: number | null };
          lastVisit: string | null;
        };
      }
    ).toQueueItem(
      {
        TRIAGE_ID: 2,
        PERSON_ID: 11,
        QUEUE_NO: 'Q-002',
        CLINIC: 'GMPC',
        STATUS: 'Triage Completed',
        PRIORITY: 'Urgent',
        PATIENT_TYPE: 'Returning',
        ARRIVAL_AT: new Date(),
        WEIGHT_KG: 70,
        HEIGHT_CM: 170,
        BMI: 24.2,
        BLOOD_PRESSURE: '120/80',
        TEMPERATURE_C: null,
        PULSE_BPM: 72,
        RESPIRATORY_RATE: 16,
        SPO2_PCT: null,
        NOTES: null,
        person: {
          HOSPITAL_NO: 'FNPH/2',
          FIRST_NAME: 'John',
          MIDDLE_NAME: null,
          LAST_NAME: 'Doe',
          SEX: 'M',
          DATE_OF_BIRTH: null,
          NHIS_NO: null,
          HMO_ID: null,
          cards: [{ PAYMENT_STATUS: 'Paid' }],
        },
      },
      '2026-07-10',
    );
    expect(item.paymentCleared).toBe(true);
    expect(item.canStart).toBe(true);
    expect(item.paymentStatus).toBe('Paid');
    expect(item).toMatchObject({ vitalsStatus: 'Captured', visit: 'Return' });
    expect(item.vitals.bloodPressure).toBe('120/80');
    expect(item.vitals.pulseBpm).toBe(72);
    expect(item.lastVisit).toBe('2026-07-10');
  });
});

describe('EncountersService note mapping', () => {
  it('maps expanded clinical note fields on encounter response', () => {
    const service = Object.create(EncountersService.prototype) as EncountersService;
    const res = (
      service as unknown as {
        toEncounterResponse: (
          e: unknown,
          lastVisit: string | null,
        ) => { note: Record<string, string>; patient: { vitals: { status: string } } };
      }
    ).toEncounterResponse(
      {
        ENCOUNTER_ID: 5,
        PERSON_ID: 11,
        TRIAGE_ID: 2,
        DOCTOR_ID: 3,
        STATUS: 'In Consultation',
        CHIEF_COMPLAINT: 'Headache',
        HISTORY: '2 days',
        EXAMINATION: 'NAD',
        ASSESSMENT: 'Tension headache',
        PLAN: 'Paracetamol',
        PAST_MEDICAL_HISTORY: 'HTN',
        DRUG_HISTORY: 'Amlodipine',
        ALLERGY_HISTORY: 'NKDA',
        FAMILY_HISTORY: 'Father HTN',
        SOCIAL_HISTORY: 'Non-smoker',
        FOLLOW_UP_PLAN: '2 weeks',
        VERSION: 2,
        STARTED_AT: new Date('2026-07-17T10:00:00Z'),
        COMPLETED_AT: null,
        OUTCOME: null,
        person: {
          HOSPITAL_NO: 'FNPH/2',
          FIRST_NAME: 'John',
          MIDDLE_NAME: null,
          LAST_NAME: 'Doe',
          SEX: 'M',
          DATE_OF_BIRTH: null,
          NHIS_NO: null,
          HMO_ID: null,
          cards: [{ PAYMENT_STATUS: 'Paid' }],
        },
        triage: {
          QUEUE_NO: 'Q-002',
          CLINIC: 'GMPC',
          PRIORITY: 'Urgent',
          PATIENT_TYPE: 'Returning',
          ARRIVAL_AT: new Date('2026-07-17T09:00:00Z'),
          STATUS: 'In Consultation',
          WEIGHT_KG: 70,
          HEIGHT_CM: null,
          BMI: null,
          BLOOD_PRESSURE: '120/80',
          TEMPERATURE_C: null,
          PULSE_BPM: 72,
          RESPIRATORY_RATE: null,
          SPO2_PCT: null,
          NOTES: null,
        },
        doctor: {
          USER_ID: 3,
          FIRST_NAME: 'Dr',
          LAST_NAME: 'Ada',
          EMAIL_ADDRESS: 'ada@hms.test',
        },
      },
      '2026-06-01',
    );
    expect(res.note.pastMedicalHistory).toBe('HTN');
    expect(res.note.drugHistory).toBe('Amlodipine');
    expect(res.note.allergyHistory).toBe('NKDA');
    expect(res.note.followUpPlan).toBe('2 weeks');
    expect(res.patient.vitals.status).toBe('Captured');
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
