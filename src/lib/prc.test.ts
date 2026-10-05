import { describe, expect, it } from 'vitest';
import { computeMctq } from './msfsc';
import { estimatePhase } from './phase';
import { classifyMelatoninTiming, computeGuidance } from './prc';
import { clockToRel } from './time';
import type { SleepEntry } from './types';

const work = (date: string): SleepEntry => ({ date, onset: '00:00', wake: '06:30', alarm: true });
const free = (date: string): SleepEntry => ({ date, onset: '01:00', wake: '10:00', alarm: false });
const phase = estimatePhase({ mctq: computeMctq([work('1'), work('2'), work('3'), work('4'), work('5'), free('6'), free('7')]) })!;
// dlmo ≈ -2.393 (21:36), cbtMin = 7.5

describe('computeGuidance', () => {
  it('builds advance windows anchored on CBTmin and DLMO', () => {
    const g = computeGuidance(phase, 'advance', clockToRel('06:30'));
    const seek = g.windows.find((w) => w.kind === 'light_seek')!;
    const avoid = g.windows.find((w) => w.kind === 'light_avoid')!;
    const mel = g.windows.find((w) => w.kind === 'melatonin_zone')!;
    expect(seek.start).toBeCloseTo(7.5, 6);
    expect(seek.end).toBeCloseTo(10.5, 6);
    expect(avoid.start).toBeCloseTo(phase.dlmo - 2, 6);
    expect(avoid.end).toBeCloseTo(7.5, 6);
    expect(mel.start).toBeCloseTo(phase.dlmo - 6, 6);
    expect(mel.end).toBeCloseTo(phase.dlmo - 2, 6);
    expect(g.warnings.length).toBe(1);
    expect(g.warnings[0]).toMatch(/before the estimated temperature minimum/);
  });

  it('has no pre-nadir warning when the alarm is after CBTmin', () => {
    const g = computeGuidance(phase, 'advance', clockToRel('08:00'));
    expect(g.warnings).toEqual([]);
  });

  it('builds delay windows on the other side of CBTmin', () => {
    const g = computeGuidance(phase, 'delay');
    const seek = g.windows.find((w) => w.kind === 'light_seek')!;
    const avoid = g.windows.find((w) => w.kind === 'light_avoid')!;
    expect(seek.end).toBeLessThanOrEqual(phase.cbtMin);
    expect(avoid.start).toBeCloseTo(phase.cbtMin, 6);
  });
});

describe('classifyMelatoninTiming', () => {
  it('places late-afternoon timing in the advance zone', () => {
    const r = classifyMelatoninTiming(phase, clockToRel('17:00'));
    expect(r.zone).toBe('advance');
    expect(r.hoursFromDlmo).toBeCloseTo(-4.607, 2);
  });
  it('places bedtime timing in the dead zone', () => {
    expect(classifyMelatoninTiming(phase, clockToRel('23:30')).zone).toBe('dead_zone');
  });
  it('places morning timing in the delay zone', () => {
    expect(classifyMelatoninTiming(phase, clockToRel('09:00')).zone).toBe('delay');
  });
});
