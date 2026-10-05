/**
 * Clock-time helpers.
 *
 * Convention used throughout the maths: a "relative hour" is hours relative to
 * the midnight that ends the night in question. Evening times are negative
 * (23:00 -> -1), morning times positive (03:30 -> 3.5). This is the MCTQ
 * convention and keeps averages linear across the midnight boundary as long as
 * nobody's sleep onset is near noon.
 */

export type Clock = string; // "HH:MM", 24h

export function parseClock(s: Clock): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`Invalid clock time: "${s}"`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) throw new Error(`Invalid clock time: "${s}"`);
  return h * 60 + min;
}

export function isValidClock(s: string): boolean {
  try {
    parseClock(s);
    return true;
  } catch {
    return false;
  }
}

/** Minutes-of-day -> relative hours in (-12, 12]. */
export function minutesToRel(minutes: number): number {
  const m = ((minutes % 1440) + 1440) % 1440;
  return m >= 720 ? (m - 1440) / 60 : m / 60;
}

export function clockToRel(s: Clock): number {
  return minutesToRel(parseClock(s));
}

/** Wrap any hour value into [0, 24). */
export function wrap24(h: number): number {
  return ((h % 24) + 24) % 24;
}

/** Wrap any hour value into the relative range (-12, 12]. */
export function wrapRel(h: number): number {
  const w = wrap24(h);
  return w > 12 ? w - 24 : w;
}

/** Signed circular difference a - b, in (-12, 12]. */
export function hoursDiff(a: number, b: number): number {
  return wrapRel(a - b);
}

/** Hours from onset to wake, going forward around the clock. */
export function durationHours(onset: Clock, wake: Clock): number {
  const o = parseClock(onset);
  const w = parseClock(wake);
  return (((w - o) % 1440) + 1440) % 1440 / 60;
}

/** Mid-sleep time in relative hours. */
export function midsleepRel(onset: Clock, wake: Clock): number {
  return clockToRel(onset) + durationHours(onset, wake) / 2;
}

export function formatHours(h: number, opts: { withSign?: boolean } = {}): string {
  const total = Math.round(wrap24(h) * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  const s = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  return opts.withSign ? s : s;
}

/** Format a duration like 1.75 -> "1h 45m"; negative durations keep a leading minus. */
export function formatDuration(h: number): string {
  const sign = h < 0 ? '-' : '';
  const total = Math.round(Math.abs(h) * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  if (hh === 0) return `${sign}${mm}m`;
  if (mm === 0) return `${sign}${hh}h`;
  return `${sign}${hh}h ${mm}m`;
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n-1). Returns 0 for a single value. */
export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function round(x: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(x * f) / f;
}

/** Convert an epoch-ms instant plus a "+hh:mm"/"-hh:mm"/"Z" offset to local minutes-of-day and ISO date. */
export function localFromInstant(epochMs: number, tzOffset: string): { date: string; minutesOfDay: number; clock: Clock } {
  const off = parseTzOffsetMinutes(tzOffset);
  const d = new Date(epochMs + off * 60_000);
  const minutesOfDay = d.getUTCHours() * 60 + d.getUTCMinutes();
  const date = d.toISOString().slice(0, 10);
  return { date, minutesOfDay, clock: formatHours(minutesOfDay / 60) };
}

export function parseTzOffsetMinutes(tz: string): number {
  if (tz === 'Z' || tz === '' || tz == null) return 0;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(tz.trim());
  if (!m) throw new Error(`Invalid timezone offset: "${tz}"`);
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

export function todayIso(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function addDaysIso(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
