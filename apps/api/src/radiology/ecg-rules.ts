/**
 * Single source of truth for ECG abnormal/critical flags (Phase 5).
 * Keep aligned with fnph-aro `src/lib/ecg-critical-rules.ts`.
 */
export type EcgRuleInput = {
  heartRate?: number | null;
  qtc?: number | null;
  qtcMs?: number | null;
  rhythm?: string | null;
  stChanges?: string | null;
  stElevation?: boolean | null;
  stDepression?: boolean | null;
};

export type EcgRuleResult = {
  abnormal: boolean;
  critical: boolean;
  flags: string[];
};

export function evaluateEcgFlags(input: EcgRuleInput): EcgRuleResult {
  const hr = input.heartRate ?? 0;
  const qtc = input.qtcMs ?? input.qtc ?? 0;
  const rhythm = (input.rhythm ?? '').toLowerCase();
  const stRaw = (input.stChanges ?? '').toLowerCase();
  const st = input.stElevation ? `${stRaw} elevation` : stRaw;
  const flags: string[] = [];

  if (hr > 100 || hr < 60) flags.push('rate');
  if (qtc > 470) flags.push('qtc');
  if (st.includes('elevation') || st.includes('stemi') || st === 'stemi' || input.stElevation) flags.push('st-elevation');
  if (st.includes('depression') || input.stDepression) flags.push('st-depression');
  if (
    /\b(af|a\.?\s*fib|atrial\s*fib|flutter|block|svt)\b/i.test(rhythm)
    || rhythm.includes('fibrillation')
    || rhythm.includes('flutter')
    || rhythm.includes('block')
    || rhythm.includes('svt')
  ) {
    flags.push('rhythm-abnormal');
  }

  const critical =
    flags.includes('st-elevation')
    || qtc > 500
    || hr > 150
    || hr < 40
    || /\b(vf|vt|ventricular fib|ventricular tach)\b/.test(rhythm)
    || rhythm.includes('ventricular fibrillation')
    || (rhythm.includes('vt') && !rhythm.includes('svt'))
    || rhythm.includes('vf');

  const abnormal = critical || flags.length > 0;
  return { abnormal, critical, flags };
}
