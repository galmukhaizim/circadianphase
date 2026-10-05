/**
 * Circadian phase estimation from proxy markers.
 *
 * Everything here is an estimate built on population-average relationships.
 * Nothing in this file measures anything. The assumptions are returned
 * alongside each number so the UI can show them.
 *
 * Relationships used (all approximate, all with wide individual variance):
 *   DLMO   ≈ MSFsc − 7 h
 *            Kantermann, Sung & Burgess, J Biol Rhythms 2015 (MCTQ vs DLMO):
 *            MSFsc correlates with DLMO (r ≈ 0.7); the mean interval is close
 *            to 7 h but individual residuals are commonly ±1.5–2 h.
 *   CBTmin ≈ natural wake − 2.5 h   (typical range 2–3 h before habitual wake)
 *          ≈ DLMO + 7 h             (classic rule of thumb)
 *   Melatonin stays elevated for roughly 10 h after DLMO ("biological night").
 *   Sleep propensity rises ~2 h after DLMO.
 */
import { hoursDiff, wrapRel } from './time';
import type { Confidence, ConfidenceLevel } from './types';
import type { MctqResult } from './msfsc';

export const DLMO_BEFORE_MSFSC_HOURS = 7;
export const CBTMIN_BEFORE_WAKE_HOURS = 2.5;
export const CBTMIN_AFTER_DLMO_HOURS = 7;
export const MELATONIN_DURATION_HOURS = 10;
export const SLEEP_GATE_AFTER_DLMO_HOURS = 2;
/** Typical individual scatter around the DLMO ≈ MSFsc − 7 h rule. */
export const DLMO_UNCERTAINTY_HOURS = 2;

export type CbtMinSource = 'hr_nadir' | 'wake_rule' | 'dlmo_rule';

export interface PhaseInputs {
  mctq: MctqResult;
  /** Mean time of the overnight heart-rate nadir in relative hours, if a time series was available. */
  hrNadirRel?: number;
  hrNadirNights?: number;
}

export interface PhaseEstimate {
  /** All times in relative hours (negative = before midnight). */
  dlmo: number;
  dlmoUncertainty: number;
  melatoninOffset: number;
  sleepGate: number;
  cbtMin: number;
  cbtMinSource: CbtMinSource;
  naturalWake: number;
  naturalOnset: number;
  biologicalNight: { start: number; end: number };
  confidence: Confidence;
  assumptions: string[];
}

export function estimatePhase(input: PhaseInputs): PhaseEstimate | null {
  const { mctq } = input;
  if (mctq.msfsc == null || Number.isNaN(mctq.msfsc)) return null;

  const assumptions: string[] = [];
  const dlmo = mctq.msfsc - DLMO_BEFORE_MSFSC_HOURS;
  assumptions.push(
    `DLMO is taken as ${DLMO_BEFORE_MSFSC_HOURS} h before MSFsc. That is a population average; individuals commonly differ by ±${DLMO_UNCERTAINTY_HOURS} h.`,
  );

  const naturalWake = mctq.freeWakeMean;
  const naturalOnset = mctq.freeOnsetMean;

  let cbtMin: number;
  let cbtMinSource: CbtMinSource;
  if (input.hrNadirRel != null && !Number.isNaN(input.hrNadirRel)) {
    cbtMin = input.hrNadirRel;
    cbtMinSource = 'hr_nadir';
    assumptions.push(
      `Core body temperature minimum is taken as the time of the overnight heart-rate nadir (${input.hrNadirNights ?? '?'} night(s)). Heart rate is a noisy proxy: posture, arousals and sleep stage all move it.`,
    );
  } else {
    cbtMin = naturalWake - CBTMIN_BEFORE_WAKE_HOURS;
    cbtMinSource = 'wake_rule';
    assumptions.push(
      `Core body temperature minimum is taken as ${CBTMIN_BEFORE_WAKE_HOURS} h before your average natural wake time (typical range 2–3 h). No temperature or heart-rate series was available.`,
    );
  }

  const melatoninOffset = dlmo + MELATONIN_DURATION_HOURS;
  assumptions.push(`The melatonin window is drawn as ${MELATONIN_DURATION_HOURS} h from DLMO; real offsets vary by a couple of hours.`);

  const confidence = combineConfidence(mctq.confidence, cbtMinSource);

  return {
    dlmo,
    dlmoUncertainty: DLMO_UNCERTAINTY_HOURS,
    melatoninOffset,
    sleepGate: dlmo + SLEEP_GATE_AFTER_DLMO_HOURS,
    cbtMin,
    cbtMinSource,
    naturalWake,
    naturalOnset,
    biologicalNight: { start: dlmo, end: melatoninOffset },
    confidence,
    assumptions,
  };
}

function combineConfidence(base: Confidence, src: CbtMinSource): Confidence {
  const order: ConfidenceLevel[] = ['none', 'low', 'moderate', 'good'];
  // A derived estimate can never be more confident than its input, and the
  // DLMO ≈ MSFsc − 7 h step alone caps us at "moderate".
  let level = order[Math.min(order.indexOf(base.level), order.indexOf('moderate'))];
  const reasons = [...base.reasons, 'DLMO itself is inferred, not measured, so confidence is capped at moderate.'];
  if (src === 'hr_nadir') reasons.push('CBTmin uses the heart-rate nadir, which is an independent (if noisy) marker.');
  return { level, reasons };
}

export type InertiaLevel = 'low' | 'moderate' | 'high' | 'severe';

export interface Misalignment {
  requiredWake: number;
  /** Hours by which the required wake precedes the estimated natural wake. Positive = waking early. */
  gapHours: number;
  /** Required wake minus CBTmin. Negative = waking before the temperature minimum. */
  wakeVsCbtMin: number;
  /** Required wake minus melatonin offset. Negative = melatonin likely still elevated. */
  wakeVsMelatoninOffset: number;
  /** Required wake minus DLMO. How deep into the biological night the alarm falls. */
  wakeAfterDlmo: number;
  /** Hours asleep at the required wake time given the usual alarm-night onset. NaN when unknown. */
  hoursAsleepAtWake: number;
  inertia: { level: InertiaLevel; reasons: string[] };
  direction: 'advance' | 'delay' | 'aligned';
}

export function computeMisalignment(phase: PhaseEstimate, requiredWakeRel: number, workOnsetRel?: number): Misalignment {
  const requiredWake = requiredWakeRel;
  const gapHours = hoursDiff(phase.naturalWake, requiredWake);
  const wakeVsCbtMin = hoursDiff(requiredWake, phase.cbtMin);
  const wakeVsMelatoninOffset = hoursDiff(requiredWake, phase.melatoninOffset);
  const wakeAfterDlmo = hoursDiff(requiredWake, phase.dlmo);
  const hoursAsleepAtWake =
    workOnsetRel != null && !Number.isNaN(workOnsetRel) ? wrapRel(requiredWake - workOnsetRel) : NaN;

  const reasons: string[] = [];
  let level: InertiaLevel = 'low';
  const bump = (to: InertiaLevel) => {
    const order: InertiaLevel[] = ['low', 'moderate', 'high', 'severe'];
    if (order.indexOf(to) > order.indexOf(level)) level = to;
  };

  if (wakeVsCbtMin < 0) {
    bump('severe');
    reasons.push(
      `Required wake is ${fmtH(-wakeVsCbtMin)} before the estimated temperature minimum. Waking on the falling limb of the temperature rhythm is where alertness is at its lowest.`,
    );
  } else if (wakeVsCbtMin < 2) {
    bump('high');
    reasons.push(`Required wake is only ${fmtH(wakeVsCbtMin)} after the estimated temperature minimum; alertness is still near its trough.`);
  }
  if (!Number.isNaN(hoursAsleepAtWake) && hoursAsleepAtWake > 0 && hoursAsleepAtWake < 3) {
    bump('high');
    reasons.push(`On alarm nights you have typically been asleep only ${fmtH(hoursAsleepAtWake)} by then, which is deep-sleep (slow-wave) territory.`);
  }
  if (wakeVsMelatoninOffset < 0) {
    bump('moderate');
    reasons.push(`Melatonin is probably still elevated: the alarm falls ${fmtH(-wakeVsMelatoninOffset)} before the end of the estimated melatonin window.`);
  }
  if (reasons.length === 0) reasons.push('Required wake falls after the estimated temperature minimum and melatonin window.');

  let direction: Misalignment['direction'] = 'aligned';
  if (gapHours > 0.5) direction = 'advance';
  else if (gapHours < -0.5) direction = 'delay';

  return {
    requiredWake,
    gapHours,
    wakeVsCbtMin,
    wakeVsMelatoninOffset,
    wakeAfterDlmo,
    hoursAsleepAtWake,
    inertia: { level, reasons },
    direction,
  };
}

function fmtH(h: number): string {
  const total = Math.round(Math.abs(h) * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  if (hh === 0) return `${mm} min`;
  if (mm === 0) return `${hh} h`;
  return `${hh} h ${mm} min`;
}

/** Summarise logged grogginess split by alarm vs natural wake, as an empirical cross-check. */
export function grogginessSummary(entries: { alarm: boolean; grogginess?: number }[]): {
  alarmMean: number;
  naturalMean: number;
  nAlarm: number;
  nNatural: number;
} {
  const a = entries.filter((e) => e.alarm && e.grogginess != null).map((e) => e.grogginess as number);
  const n = entries.filter((e) => !e.alarm && e.grogginess != null).map((e) => e.grogginess as number);
  const m = (xs: number[]) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : NaN);
  return { alarmMean: m(a), naturalMean: m(n), nAlarm: a.length, nNatural: n.length };
}
