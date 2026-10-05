/**
 * Munich ChronoType Questionnaire (MCTQ) mid-sleep arithmetic.
 *
 * Reference: Roenneberg T, Wirz-Justice A, Merrow M. "Life between clocks:
 * daily temporal patterns of human chronotypes." J Biol Rhythms 2003; and the
 * MCTQ scoring notes (Roenneberg et al., 2015, Methods Enzymol).
 *
 *   SD_w   sleep duration on workdays (alarm days)
 *   SD_f   sleep duration on free days (no alarm)
 *   SO_w / SO_f  sleep onset on work / free days
 *   MSW    mid-sleep on workdays  = SO_w + SD_w / 2
 *   MSF    mid-sleep on free days = SO_f + SD_f / 2
 *   WD     workdays per week; FD = 7 - WD
 *   SD_week = (SD_w * WD + SD_f * FD) / 7
 *   MSFsc  = MSF - (SD_f - SD_week) / 2      if SD_f > SD_w
 *          = MSF                              otherwise
 *
 * The correction removes the extra sleep people get on free days when paying
 * back a sleep debt built up on workdays; without it late-sleepers with heavy
 * debt look later than they are.
 */
import { clockToRel, durationHours, mean, midsleepRel, stddev } from './time';
import type { Confidence, SleepEntry } from './types';

export interface MctqOptions {
  /** Override the workdays-per-week used for the sleep-debt correction. Default: inferred from the log. */
  workdaysPerWeek?: number;
  /** Nights shorter than this are treated as naps/invalid. Default 2h. */
  minSleepHours?: number;
}

export interface MctqResult {
  nFree: number;
  nWork: number;
  nTotal: number;
  workdaysPerWeek: number;
  /** Sleep durations in hours. NaN when there are no entries of that kind. */
  sdF: number;
  sdW: number;
  sdWeek: number;
  /** Mid-sleep times in relative hours (negative = before midnight). NaN when unavailable. */
  msf: number;
  msw: number;
  /** Sleep-corrected mid-sleep on free days. null when there are no free days. */
  msfsc: number | null;
  /** How much the sleep-debt correction moved MSF (hours, >= 0). */
  debtCorrectionHours: number;
  /** MSF - MSW, hours. Positive = later on free days. NaN without both kinds of day. */
  socialJetlag: number;
  freeOnsetMean: number;
  freeWakeMean: number;
  workOnsetMean: number;
  workWakeMean: number;
  /** Spread of per-night free-day mid-sleep (sample SD, hours). */
  msfSd: number;
  confidence: Confidence;
  /** Entries actually used (after validation). */
  usedFree: SleepEntry[];
  usedWork: SleepEntry[];
}

export function isUsableEntry(e: SleepEntry, minSleepHours = 2): boolean {
  try {
    const d = durationHours(e.onset, e.wake);
    return d >= minSleepHours && d <= 16;
  } catch {
    return false;
  }
}

export function computeMctq(entries: SleepEntry[], opts: MctqOptions = {}): MctqResult {
  const minSleep = opts.minSleepHours ?? 2;
  const usable = entries.filter((e) => isUsableEntry(e, minSleep));
  const free = usable.filter((e) => !e.alarm);
  const work = usable.filter((e) => e.alarm);

  const durF = free.map((e) => durationHours(e.onset, e.wake));
  const durW = work.map((e) => durationHours(e.onset, e.wake));
  const msfEach = free.map((e) => midsleepRel(e.onset, e.wake));
  const mswEach = work.map((e) => midsleepRel(e.onset, e.wake));

  const sdF = mean(durF);
  const sdW = mean(durW);
  const msf = mean(msfEach);
  const msw = mean(mswEach);

  const nFree = free.length;
  const nWork = work.length;
  const nTotal = nFree + nWork;

  let workdaysPerWeek: number;
  if (opts.workdaysPerWeek != null) {
    workdaysPerWeek = Math.min(7, Math.max(0, opts.workdaysPerWeek));
  } else if (nTotal === 0) {
    workdaysPerWeek = 5;
  } else {
    workdaysPerWeek = (7 * nWork) / nTotal;
  }
  const freeDaysPerWeek = 7 - workdaysPerWeek;

  let sdWeek: number;
  if (nWork === 0) sdWeek = sdF;
  else if (nFree === 0) sdWeek = sdW;
  else sdWeek = (sdW * workdaysPerWeek + sdF * freeDaysPerWeek) / 7;

  let msfsc: number | null = null;
  let debtCorrectionHours = 0;
  if (nFree > 0) {
    if (nWork > 0 && sdF > sdW) {
      debtCorrectionHours = (sdF - sdWeek) / 2;
      msfsc = msf - debtCorrectionHours;
    } else {
      msfsc = msf;
    }
  }

  const msfSd = stddev(msfEach);
  const confidence = assessConfidence({ nFree, nWork, msfSd });

  return {
    nFree,
    nWork,
    nTotal,
    workdaysPerWeek,
    sdF,
    sdW,
    sdWeek,
    msf,
    msw,
    msfsc,
    debtCorrectionHours,
    socialJetlag: nFree > 0 && nWork > 0 ? msf - msw : NaN,
    freeOnsetMean: mean(free.map((e) => clockToRel(e.onset))),
    freeWakeMean: mean(free.map((e) => clockToRel(e.onset) + durationHours(e.onset, e.wake))),
    workOnsetMean: mean(work.map((e) => clockToRel(e.onset))),
    workWakeMean: mean(work.map((e) => clockToRel(e.onset) + durationHours(e.onset, e.wake))),
    msfSd,
    confidence,
    usedFree: free,
    usedWork: work,
  };
}

function assessConfidence(x: { nFree: number; nWork: number; msfSd: number }): Confidence {
  const reasons: string[] = [];
  if (x.nFree === 0) {
    return {
      level: 'none',
      reasons: ['No alarm-free nights logged yet. MSFsc needs at least one night where you woke naturally.'],
    };
  }
  let level: Confidence['level'] = 'good';
  if (x.nFree === 1) {
    level = 'low';
    reasons.push('Only one alarm-free night. One night can be off by hours.');
  } else if (x.nFree < 4) {
    level = 'moderate';
    reasons.push(`${x.nFree} alarm-free nights. Four or more gives a steadier average.`);
  } else {
    reasons.push(`${x.nFree} alarm-free nights.`);
  }
  if (x.nWork === 0) {
    level = level === 'good' ? 'moderate' : level;
    reasons.push('No alarm nights logged, so the sleep-debt correction cannot be applied.');
  } else if (x.nWork < 3) {
    reasons.push(`${x.nWork} alarm night(s). The sleep-debt correction is rough with fewer than three.`);
    if (level === 'good') level = 'moderate';
  }
  if (x.nFree >= 2 && x.msfSd > 1.5) {
    level = 'low';
    reasons.push(`Free-day mid-sleep varies a lot (SD ${x.msfSd.toFixed(1)} h), so the average is unstable.`);
  } else if (x.nFree >= 2 && x.msfSd > 0.75) {
    reasons.push(`Free-day mid-sleep varies moderately (SD ${x.msfSd.toFixed(1)} h).`);
    if (level === 'good') level = 'moderate';
  }
  return { level, reasons };
}

/**
 * Rough chronotype bucket from MSFsc. Adult population mean is roughly 04:00–04:30;
 * teenagers run about an hour later. These labels are descriptive only.
 */
export function chronotypeLabel(msfsc: number): string {
  if (msfsc < 2.5) return 'early';
  if (msfsc < 4) return 'slightly early';
  if (msfsc < 5) return 'intermediate';
  if (msfsc < 6.5) return 'late';
  return 'very late';
}
