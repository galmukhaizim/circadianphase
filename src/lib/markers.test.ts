import { describe, expect, it } from 'vitest';
import { findNadir, findPeak, instantToRel, parseSeriesCsv, stageDistribution, whoopSleepToEntry, type Sample, type WhoopSleepLike } from './markers';

const T0 = Date.parse('2024-03-10T23:00:00Z'); // "bedtime"
const MIN = 60_000;

/** Cosine-shaped HR with a trough at `troughMinutes` after T0 plus deterministic jitter. */
function synthHr(troughMinutes: number, lengthMinutes = 480, step = 1): Sample[] {
  const out: Sample[] = [];
  for (let m = 0; m <= lengthMinutes; m += step) {
    const phase = ((m - troughMinutes) / 1440) * 2 * Math.PI;
    const base = 55 - 6 * Math.cos(phase); // min at trough
    const jitter = 1.5 * Math.sin(m * 7.1) + 1.2 * Math.sin(m * 0.37);
    out.push({ t: T0 + m * MIN, v: base + jitter });
  }
  return out;
}

describe('findNadir / findPeak', () => {
  it('finds the smoothed heart-rate trough within 15 minutes', () => {
    const s = synthHr(300); // 04:00Z
    const r = findNadir(s, { windowMinutes: 30 })!;
    expect(r).not.toBeNull();
    expect(Math.abs(r.t - (T0 + 300 * MIN))).toBeLessThanOrEqual(15 * MIN);
    expect(r.n).toBe(481);
  });

  it('ignores a sharp early-night dip when told to skip the leading minutes', () => {
    const s = synthHr(300).map((p, i) => (i >= 10 && i < 20 ? { ...p, v: p.v - 20 } : p));
    const naive = findNadir(s, { windowMinutes: 10 })!;
    expect(naive.t).toBeLessThan(T0 + 60 * MIN);
    const r = findNadir(s, { windowMinutes: 10, start: T0, skipLeadingMinutes: 60 })!;
    expect(Math.abs(r.t - (T0 + 300 * MIN))).toBeLessThanOrEqual(15 * MIN);
  });

  it('restricts to the sleep window', () => {
    const s = synthHr(300, 900); // series runs long past wake
    const r = findNadir(s, { start: T0, end: T0 + 480 * MIN })!;
    expect(r.t).toBeLessThanOrEqual(T0 + 480 * MIN);
  });

  it('finds a peak for HRV', () => {
    const s = synthHr(300).map((p) => ({ t: p.t, v: 200 - p.v })); // invert
    const r = findPeak(s)!;
    expect(Math.abs(r.t - (T0 + 300 * MIN))).toBeLessThanOrEqual(15 * MIN);
  });

  it('returns null for too few samples', () => {
    expect(findNadir(synthHr(60, 5))).toBeNull();
  });

  it('tolerates unsorted input', () => {
    const s = synthHr(300).reverse();
    const r = findNadir(s)!;
    expect(Math.abs(r.t - (T0 + 300 * MIN))).toBeLessThanOrEqual(15 * MIN);
  });
});

const sleep: WhoopSleepLike = {
  id: 'ecfc6a15-4661-442f-a9a4-f160dd7afae8',
  start: '2022-04-24T02:25:44.774Z',
  end: '2022-04-24T10:25:44.774Z',
  timezone_offset: '-05:00',
  nap: false,
  score_state: 'SCORED',
  score: {
    stage_summary: {
      total_in_bed_time_milli: 30272735,
      total_awake_time_milli: 1403507,
      total_no_data_time_milli: 0,
      total_light_sleep_time_milli: 14905851,
      total_slow_wave_sleep_time_milli: 6630370,
      total_rem_sleep_time_milli: 5879573,
      sleep_cycle_count: 3,
      disturbance_count: 12,
    },
  },
};

describe('WHOOP conversions', () => {
  it('converts a sleep record to local clock times via timezone_offset', () => {
    const e = whoopSleepToEntry(sleep, false)!;
    expect(e).toEqual({ date: '2022-04-24', onset: '21:25', wake: '05:25', alarm: false, source: 'whoop' });
  });

  it('drops naps', () => {
    expect(whoopSleepToEntry({ ...sleep, nap: true })).toBeNull();
  });

  it('computes stage fractions from the spec example', () => {
    const d = stageDistribution(sleep)!;
    expect(d.inBedHours).toBeCloseTo(8.409, 2);
    expect(d.light + d.sws + d.rem + d.awake + d.noData).toBeCloseTo(0.952, 2); // example record does not sum to 100%
    expect(d.sws).toBeCloseTo(0.219, 2);
    expect(d.cycles).toBe(3);
  });

  it('returns null stage data when unscored', () => {
    expect(stageDistribution({ ...sleep, score_state: 'PENDING_SCORE', score: undefined })).toBeNull();
  });

  it('maps instants to relative hours in the local zone', () => {
    expect(instantToRel(Date.parse('2022-04-24T09:00:00Z'), '-05:00')).toBeCloseTo(4, 6);
    expect(instantToRel(Date.parse('2022-04-24T03:30:00Z'), '-05:00')).toBeCloseTo(-1.5, 6);
  });
});

describe('parseSeriesCsv', () => {
  it('parses ISO and epoch timestamps and skips headers', () => {
    const s = parseSeriesCsv('timestamp,bpm\n2024-03-10T23:00:00Z,60\n1710111660000,59\n1710111720,58\n\nbad,row\n');
    expect(s).toEqual([
      { t: Date.parse('2024-03-10T23:00:00Z'), v: 60 },
      { t: 1710111660000, v: 59 },
      { t: 1710111720000, v: 58 },
    ]);
  });
});
