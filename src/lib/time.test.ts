import { describe, expect, it } from 'vitest';
import { addDaysIso, clockToRel, durationHours, formatDuration, formatHours, hoursDiff, localFromInstant, midsleepRel, minutesToRel, parseClock, stddev, wrapRel } from './time';

describe('time helpers', () => {
  it('parses clock strings', () => {
    expect(parseClock('00:00')).toBe(0);
    expect(parseClock('23:59')).toBe(1439);
    expect(parseClock('7:05')).toBe(425);
    expect(() => parseClock('24:00')).toThrow();
    expect(() => parseClock('abc')).toThrow();
  });

  it('uses evening-negative relative hours', () => {
    expect(clockToRel('23:00')).toBe(-1);
    expect(clockToRel('00:30')).toBe(0.5);
    expect(clockToRel('11:59')).toBeCloseTo(11.983, 3);
    expect(clockToRel('12:00')).toBe(-12);
    expect(minutesToRel(1440 + 60)).toBe(1);
  });

  it('computes durations across midnight', () => {
    expect(durationHours('23:00', '07:00')).toBe(8);
    expect(durationHours('01:00', '09:30')).toBe(8.5);
    expect(durationHours('22:00', '22:00')).toBe(0);
  });

  it('computes mid-sleep in relative hours', () => {
    expect(midsleepRel('23:00', '07:00')).toBe(3);
    expect(midsleepRel('01:00', '10:00')).toBe(5.5);
    expect(midsleepRel('21:00', '01:00')).toBe(-1);
  });

  it('formats and wraps', () => {
    expect(formatHours(-1)).toBe('23:00');
    expect(formatHours(3.5)).toBe('03:30');
    expect(formatHours(27.25)).toBe('03:15');
    expect(formatDuration(1.75)).toBe('1h 45m');
    expect(formatDuration(-0.5)).toBe('-30m');
    expect(formatDuration(2)).toBe('2h');
    expect(wrapRel(13)).toBe(-11);
    expect(wrapRel(-13)).toBe(11);
  });

  it('computes signed circular differences', () => {
    expect(hoursDiff(1, 23)).toBe(2);
    expect(hoursDiff(23, 1)).toBe(-2);
    expect(hoursDiff(6.5, 7.5)).toBe(-1);
    expect(hoursDiff(10, 6.5)).toBe(3.5);
  });

  it('stddev is sample sd', () => {
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(stddev([5])).toBe(0);
  });

  it('localises instants with WHOOP-style offsets', () => {
    const l = localFromInstant(Date.parse('2022-04-24T02:25:44.774Z'), '-05:00');
    expect(l.date).toBe('2022-04-23');
    expect(l.clock).toBe('21:25');
    const z = localFromInstant(Date.parse('2022-04-24T10:25:44.774Z'), 'Z');
    expect(z.clock).toBe('10:25');
    const p = localFromInstant(Date.parse('2022-04-24T23:40:00Z'), '+01:00');
    expect(p.date).toBe('2022-04-25');
    expect(p.clock).toBe('00:40');
  });

  it('adds days to ISO dates', () => {
    expect(addDaysIso('2024-02-28', 2)).toBe('2024-03-01');
    expect(addDaysIso('2024-01-01', -1)).toBe('2023-12-31');
  });
});
