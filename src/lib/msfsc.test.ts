import { describe, expect, it } from 'vitest';
import { chronotypeLabel, computeMctq } from './msfsc';
import type { SleepEntry } from './types';

const work = (date: string, onset = '00:00', wake = '06:30'): SleepEntry => ({ date, onset, wake, alarm: true });
const free = (date: string, onset = '01:00', wake = '10:00'): SleepEntry => ({ date, onset, wake, alarm: false });

describe('computeMctq', () => {
  it('reproduces the MCTQ worked example with sleep-debt correction', () => {
    // 5 alarm nights 00:00–06:30 (SDw 6.5, MSW 3.25); 2 free nights 01:00–10:00 (SDf 9, MSF 5.5).
    const entries = [work('2024-01-01'), work('2024-01-02'), work('2024-01-03'), work('2024-01-04'), work('2024-01-05'), free('2024-01-06'), free('2024-01-07')];
    const r = computeMctq(entries);
    expect(r.nWork).toBe(5);
    expect(r.nFree).toBe(2);
    expect(r.workdaysPerWeek).toBe(5);
    expect(r.sdW).toBeCloseTo(6.5, 6);
    expect(r.sdF).toBeCloseTo(9, 6);
    expect(r.msw).toBeCloseTo(3.25, 6);
    expect(r.msf).toBeCloseTo(5.5, 6);
    // SDweek = (6.5*5 + 9*2)/7 = 7.2143; correction = (9 - 7.2143)/2 = 0.8929
    expect(r.sdWeek).toBeCloseTo(50.5 / 7, 6);
    expect(r.debtCorrectionHours).toBeCloseTo(0.892857, 5);
    expect(r.msfsc).toBeCloseTo(5.5 - 0.892857, 5);
    expect(r.socialJetlag).toBeCloseTo(2.25, 6);
    expect(r.freeWakeMean).toBeCloseTo(10, 6);
    expect(r.workOnsetMean).toBeCloseTo(0, 6);
  });

  it('applies no correction when free-day sleep is not longer than workday sleep', () => {
    const entries = [work('2024-01-01', '23:00', '07:00'), work('2024-01-02', '23:00', '07:00'), free('2024-01-06', '00:00', '07:30'), free('2024-01-07', '00:00', '07:30')];
    const r = computeMctq(entries);
    expect(r.sdF).toBeCloseTo(7.5, 6);
    expect(r.sdW).toBeCloseTo(8, 6);
    expect(r.debtCorrectionHours).toBe(0);
    expect(r.msfsc).toBeCloseTo(r.msf, 6);
    expect(r.msfsc).toBeCloseTo(3.75, 6);
  });

  it('handles onsets before midnight with the evening-negative convention', () => {
    const r = computeMctq([free('2024-01-06', '22:00', '06:00'), free('2024-01-07', '22:00', '06:00')]);
    expect(r.msf).toBeCloseTo(2, 6);
    expect(r.freeOnsetMean).toBeCloseTo(-2, 6);
    expect(r.freeWakeMean).toBeCloseTo(6, 6);
  });

  it('respects a workdays-per-week override', () => {
    const entries = [work('2024-01-01'), free('2024-01-06')];
    const inferred = computeMctq(entries);
    expect(inferred.workdaysPerWeek).toBeCloseTo(3.5, 6);
    const r = computeMctq(entries, { workdaysPerWeek: 5 });
    expect(r.workdaysPerWeek).toBe(5);
    expect(r.sdWeek).toBeCloseTo((6.5 * 5 + 9 * 2) / 7, 6);
  });

  it('returns null MSFsc and no confidence without free days', () => {
    const r = computeMctq([work('2024-01-01'), work('2024-01-02')]);
    expect(r.msfsc).toBeNull();
    expect(r.confidence.level).toBe('none');
    expect(Number.isNaN(r.socialJetlag)).toBe(true);
  });

  it('skips naps and nonsense durations', () => {
    const r = computeMctq([free('2024-01-06', '14:00', '15:00'), free('2024-01-07', '01:00', '09:00'), { date: '2024-01-08', onset: 'bad', wake: '09:00', alarm: false }]);
    expect(r.nFree).toBe(1);
    expect(r.msfsc).toBeCloseTo(5, 6);
  });

  it('grades confidence by sample size and spread', () => {
    expect(computeMctq([free('2024-01-06')]).confidence.level).toBe('low');
    const steady = [work('a'), work('b'), work('c'), free('d'), free('e'), free('f'), free('g')];
    expect(computeMctq(steady).confidence.level).toBe('good');
    const noisy = [work('a'), work('b'), work('c'), free('d', '23:00', '07:00'), free('e', '03:00', '12:00'), free('f', '00:00', '08:00'), free('g', '04:00', '13:00')];
    const r = computeMctq(noisy);
    expect(r.msfSd).toBeGreaterThan(1.5);
    expect(r.confidence.level).toBe('low');
  });

  it('labels chronotype buckets', () => {
    expect(chronotypeLabel(2)).toBe('early');
    expect(chronotypeLabel(4.5)).toBe('intermediate');
    expect(chronotypeLabel(7)).toBe('very late');
  });
});
