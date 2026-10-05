import { describe, expect, it } from 'vitest';
import { computeMctq } from './msfsc';
import { computeMisalignment, estimatePhase, grogginessSummary } from './phase';
import { clockToRel } from './time';
import type { SleepEntry } from './types';

const work = (date: string): SleepEntry => ({ date, onset: '00:00', wake: '06:30', alarm: true, grogginess: 4 });
const free = (date: string): SleepEntry => ({ date, onset: '01:00', wake: '10:00', alarm: false, grogginess: 2 });
const entries = [work('1'), work('2'), work('3'), work('4'), work('5'), free('6'), free('7')];

describe('estimatePhase', () => {
  it('derives DLMO, CBTmin and the melatonin window from MSFsc', () => {
    const mctq = computeMctq(entries);
    const p = estimatePhase({ mctq })!;
    const msfsc = 5.5 - 0.892857;
    expect(p.dlmo).toBeCloseTo(msfsc - 7, 4); // ≈ 21:36
    expect(p.melatoninOffset).toBeCloseTo(msfsc + 3, 4);
    expect(p.sleepGate).toBeCloseTo(msfsc - 5, 4);
    expect(p.naturalWake).toBeCloseTo(10, 6);
    expect(p.cbtMin).toBeCloseTo(7.5, 6);
    expect(p.cbtMinSource).toBe('wake_rule');
    expect(p.biologicalNight.start).toBe(p.dlmo);
    expect(p.biologicalNight.end).toBe(p.melatoninOffset);
    expect(p.assumptions.length).toBeGreaterThanOrEqual(3);
  });

  it('prefers a heart-rate nadir for CBTmin when supplied', () => {
    const mctq = computeMctq(entries);
    const p = estimatePhase({ mctq, hrNadirRel: 6.25, hrNadirNights: 4 })!;
    expect(p.cbtMin).toBe(6.25);
    expect(p.cbtMinSource).toBe('hr_nadir');
  });

  it('returns null without an MSFsc', () => {
    expect(estimatePhase({ mctq: computeMctq([work('1')]) })).toBeNull();
  });

  it('never reports better than moderate confidence', () => {
    const mctq = computeMctq([work('1'), work('2'), work('3'), free('4'), free('5'), free('6'), free('7')]);
    expect(mctq.confidence.level).toBe('good');
    expect(estimatePhase({ mctq })!.confidence.level).toBe('moderate');
  });
});

describe('computeMisalignment', () => {
  const p = estimatePhase({ mctq: computeMctq(entries) })!;

  it('reports the gap between required and natural wake', () => {
    const m = computeMisalignment(p, clockToRel('06:30'), 0);
    expect(m.gapHours).toBeCloseTo(3.5, 6);
    expect(m.direction).toBe('advance');
    expect(m.wakeVsCbtMin).toBeCloseTo(-1, 6);
    expect(m.wakeVsMelatoninOffset).toBeCloseTo(6.5 - (5.5 - 0.892857 + 3), 4);
    expect(m.hoursAsleepAtWake).toBeCloseTo(6.5, 6);
  });

  it('flags pre-nadir waking as severe inertia', () => {
    const m = computeMisalignment(p, clockToRel('06:30'), 0);
    expect(m.inertia.level).toBe('severe');
    expect(m.inertia.reasons.join(' ')).toMatch(/temperature minimum/);
  });

  it('flags waking shortly after the nadir as high', () => {
    const m = computeMisalignment(p, clockToRel('08:30'), 0);
    expect(m.wakeVsCbtMin).toBeCloseTo(1, 6);
    expect(m.inertia.level).toBe('high');
  });

  it('flags deep-sleep territory when asleep under 3 h', () => {
    const m = computeMisalignment(p, clockToRel('11:00'), clockToRel('09:00'));
    expect(m.hoursAsleepAtWake).toBeCloseTo(2, 6);
    expect(m.inertia.level).toBe('high');
  });

  it('is low when the alarm is well after the biological night', () => {
    const m = computeMisalignment(p, clockToRel('11:00'), 0);
    expect(m.inertia.level).toBe('low');
    expect(m.direction).toBe('delay');
    expect(m.gapHours).toBeCloseTo(-1, 6);
  });

  it('calls a 30-minute difference aligned', () => {
    const m = computeMisalignment(p, clockToRel('09:45'));
    expect(m.direction).toBe('aligned');
    expect(Number.isNaN(m.hoursAsleepAtWake)).toBe(true);
  });
});

describe('grogginessSummary', () => {
  it('splits by alarm', () => {
    const s = grogginessSummary(entries);
    expect(s.alarmMean).toBe(4);
    expect(s.naturalMean).toBe(2);
    expect(s.nAlarm).toBe(5);
    expect(s.nNatural).toBe(2);
  });
});
