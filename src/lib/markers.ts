/**
 * Physiological phase markers from time series and from WHOOP sleep records.
 *
 * WHOOP API v2 (checked against developer.whoop.com and the published OpenAPI
 * spec, October 2026) exposes per-sleep summaries only: start, end, timezone
 * offset, stage totals, and one resting-heart-rate / HRV value per recovery.
 * It does not expose an intra-night heart-rate or HRV series, so the nadir
 * and peak finders below take a generic {t, v} series that can come from any
 * device export (CSV). They are written so a WHOOP series can be plugged in
 * if WHOOP ever publishes one.
 */
import { localFromInstant, minutesToRel, parseTzOffsetMinutes } from './time';
import type { SleepEntry } from './types';

export interface Sample {
  /** Epoch milliseconds. */
  t: number;
  v: number;
}

export interface ExtremumResult {
  /** Epoch ms at the centre of the extreme window. */
  t: number;
  /** Smoothed value at that point. */
  v: number;
  /** Number of raw samples that went into the estimate. */
  n: number;
  /** Width of the smoothing window actually used, minutes. */
  windowMinutes: number;
}

export interface ExtremumOptions {
  /** Centred moving-average window. Default 30 min. */
  windowMinutes?: number;
  /** Only consider samples inside [start, end]. */
  start?: number;
  end?: number;
  /** Ignore the first N minutes after start (sleep-onset HR decline is not circadian). Default 0. */
  skipLeadingMinutes?: number;
  /** Minimum samples required. Default 10. */
  minSamples?: number;
}

function smooth(samples: Sample[], windowMs: number): Sample[] {
  const half = windowMs / 2;
  const out: Sample[] = [];
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const c = samples[i].t;
    while (hi < samples.length && samples[hi].t <= c + half) {
      sum += samples[hi].v;
      hi++;
    }
    while (lo < hi && samples[lo].t < c - half) {
      sum -= samples[lo].v;
      lo++;
    }
    out.push({ t: c, v: sum / (hi - lo) });
  }
  return out;
}

function prepare(samples: Sample[], opts: ExtremumOptions): Sample[] {
  const sorted = [...samples].filter((s) => Number.isFinite(s.t) && Number.isFinite(s.v)).sort((a, b) => a.t - b.t);
  const skip = (opts.skipLeadingMinutes ?? 0) * 60_000;
  const start = (opts.start ?? -Infinity) + (Number.isFinite(opts.start ?? NaN) ? skip : 0);
  const end = opts.end ?? Infinity;
  return sorted.filter((s) => s.t >= start && s.t <= end);
}

/** Time of the smoothed minimum: use for overnight heart-rate nadir (proxy for CBTmin). */
export function findNadir(samples: Sample[], opts: ExtremumOptions = {}): ExtremumResult | null {
  return findExtremum(samples, opts, (a, b) => a < b);
}

/** Time of the smoothed maximum: use for overnight HRV peak. */
export function findPeak(samples: Sample[], opts: ExtremumOptions = {}): ExtremumResult | null {
  return findExtremum(samples, opts, (a, b) => a > b);
}

function findExtremum(samples: Sample[], opts: ExtremumOptions, better: (a: number, b: number) => boolean): ExtremumResult | null {
  const windowMinutes = opts.windowMinutes ?? 30;
  const minSamples = opts.minSamples ?? 10;
  const xs = prepare(samples, opts);
  if (xs.length < minSamples) return null;
  const sm = smooth(xs, windowMinutes * 60_000);
  let best = sm[0];
  for (const s of sm) if (better(s.v, best.v)) best = s;
  return { t: best.t, v: best.v, n: xs.length, windowMinutes };
}

/** Minimal shape of a WHOOP v2 Sleep record that we rely on. */
export interface WhoopSleepLike {
  id: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';
  score?: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_no_data_time_milli: number;
      total_light_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_rem_sleep_time_milli: number;
      sleep_cycle_count: number;
      disturbance_count: number;
    };
    sleep_needed?: {
      baseline_milli: number;
      need_from_sleep_debt_milli: number;
      need_from_recent_strain_milli: number;
      need_from_recent_nap_milli: number;
    };
    sleep_efficiency_percentage?: number;
    sleep_performance_percentage?: number;
  };
}

export interface StageDistribution {
  inBedHours: number;
  asleepHours: number;
  light: number;
  sws: number;
  rem: number;
  awake: number;
  noData: number;
  cycles: number;
  disturbances: number;
}

/** Fractions of in-bed time per stage. Returns null if the sleep is not scored. */
export function stageDistribution(sleep: WhoopSleepLike): StageDistribution | null {
  const s = sleep.score?.stage_summary;
  if (!s || sleep.score_state !== 'SCORED') return null;
  const inBed = s.total_in_bed_time_milli;
  if (!inBed) return null;
  const asleep = s.total_light_sleep_time_milli + s.total_slow_wave_sleep_time_milli + s.total_rem_sleep_time_milli;
  return {
    inBedHours: inBed / 3_600_000,
    asleepHours: asleep / 3_600_000,
    light: s.total_light_sleep_time_milli / inBed,
    sws: s.total_slow_wave_sleep_time_milli / inBed,
    rem: s.total_rem_sleep_time_milli / inBed,
    awake: s.total_awake_time_milli / inBed,
    noData: s.total_no_data_time_milli / inBed,
    cycles: s.sleep_cycle_count,
    disturbances: s.disturbance_count,
  };
}

/**
 * Convert a WHOOP sleep into a log entry (local clock times via the record's
 * timezone offset). Whether the wake was alarm-forced is not something WHOOP
 * knows, so it must be supplied; default true (assume forced) is the
 * conservative choice because it keeps an unknown night out of the free-day
 * average.
 */
export function whoopSleepToEntry(sleep: WhoopSleepLike, alarm = true): SleepEntry | null {
  if (sleep.nap) return null;
  const startMs = Date.parse(sleep.start);
  const endMs = Date.parse(sleep.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  const s = localFromInstant(startMs, sleep.timezone_offset);
  const e = localFromInstant(endMs, sleep.timezone_offset);
  return { date: e.date, onset: s.clock, wake: e.clock, alarm, source: 'whoop' };
}

/** Relative hours for an instant, in the record's local zone. */
export function instantToRel(epochMs: number, tzOffset: string): number {
  const off = parseTzOffsetMinutes(tzOffset);
  const d = new Date(epochMs + off * 60_000);
  return minutesToRel(d.getUTCHours() * 60 + d.getUTCMinutes());
}

/** Parse a "timestamp,value" CSV (ISO 8601 or epoch ms/seconds). Header row optional. */
export function parseSeriesCsv(text: string): Sample[] {
  const out: Sample[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 2) continue;
    const v = Number(parts[1]);
    if (!Number.isFinite(v)) continue; // header or junk
    let t: number;
    if (/^\d+(\.\d+)?$/.test(parts[0])) {
      const n = Number(parts[0]);
      t = n < 1e11 ? n * 1000 : n; // seconds vs ms
    } else {
      t = Date.parse(parts[0]);
    }
    if (!Number.isFinite(t)) continue;
    out.push({ t, v });
  }
  return out;
}
