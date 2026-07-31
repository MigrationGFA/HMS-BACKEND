import { evaluateEcgFlags } from './ecg-rules';

describe('evaluateEcgFlags (Phase 5 critical matrix)', () => {
  it('marks normal sinus as non-critical', () => {
    const r = evaluateEcgFlags({ heartRate: 78, qtcMs: 420, rhythm: 'Sinus', stChanges: 'None' });
    expect(r.critical).toBe(false);
    expect(r.abnormal).toBe(false);
  });

  it('flags STEMI / ST elevation as critical', () => {
    expect(evaluateEcgFlags({ heartRate: 90, qtcMs: 430, rhythm: 'Sinus', stChanges: 'ST elevation' }).critical).toBe(true);
    expect(evaluateEcgFlags({ heartRate: 90, qtcMs: 430, rhythm: 'Sinus', stChanges: 'STEMI' }).critical).toBe(true);
    expect(evaluateEcgFlags({ heartRate: 90, qtc: 430, rhythm: 'Sinus', stElevation: true }).critical).toBe(true);
  });

  it('flags QTc > 500 as critical and QTc > 470 as abnormal', () => {
    const abn = evaluateEcgFlags({ heartRate: 70, qtcMs: 480, rhythm: 'Sinus', stChanges: 'None' });
    expect(abn.abnormal).toBe(true);
    expect(abn.critical).toBe(false);
    expect(evaluateEcgFlags({ heartRate: 70, qtcMs: 520, rhythm: 'Sinus', stChanges: 'None' }).critical).toBe(true);
  });

  it('flags extreme HR as critical', () => {
    expect(evaluateEcgFlags({ heartRate: 160, qtcMs: 400, rhythm: 'Sinus tachycardia' }).critical).toBe(true);
    expect(evaluateEcgFlags({ heartRate: 35, qtcMs: 400, rhythm: 'Sinus bradycardia' }).critical).toBe(true);
  });

  it('flags VT/VF as critical without flagging SVT alone as VT', () => {
    expect(evaluateEcgFlags({ heartRate: 180, qtcMs: 400, rhythm: 'VT' }).critical).toBe(true);
    expect(evaluateEcgFlags({ heartRate: 200, qtcMs: 400, rhythm: 'Ventricular fibrillation' }).critical).toBe(true);
    const svt = evaluateEcgFlags({ heartRate: 170, qtcMs: 400, rhythm: 'SVT' });
    expect(svt.abnormal).toBe(true);
    // SVT is abnormal rhythm but not VT/VF critical by rhythm token alone; HR>150 still critical
    expect(svt.critical).toBe(true);
  });

  it('flags AF / block as abnormal', () => {
    expect(evaluateEcgFlags({ heartRate: 88, qtcMs: 420, rhythm: 'Atrial fibrillation' }).abnormal).toBe(true);
    expect(evaluateEcgFlags({ heartRate: 50, qtcMs: 420, rhythm: 'Complete heart block' }).abnormal).toBe(true);
  });
});
