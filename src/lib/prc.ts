/**
 * Intervention timing windows from the human phase response curves.
 *
 * Light PRC (Khalsa et al., J Physiol 2003; Minors, Waterhouse & Wirz-Justice
 * 1991): light in the hours before CBTmin delays the clock; light in the hours
 * after CBTmin advances it. The crossover sits near CBTmin, and the response
 * is largest within ~3 h either side of it.
 *
 * Melatonin PRC (Lewy et al. 1998; Burgess et al. 2008, 2010): exogenous
 * melatonin taken in the afternoon/evening, several hours before DLMO,
 * advances the clock; taken in the morning after CBTmin it delays it. Taken
 * around habitual bedtime it does little to phase.
 *
 * This module only produces timing windows. It says nothing about dose or
 * whether to take anything.
 */
import { hoursDiff } from './time';
import type { PhaseEstimate } from './phase';

export type WindowKind = 'light_seek' | 'light_avoid' | 'melatonin_zone';

export interface InterventionWindow {
  kind: WindowKind;
  /** Relative hours. */
  start: number;
  end: number;
  label: string;
  rationale: string;
  /** Strength of expected effect inside this window. */
  strength: 'strong' | 'moderate';
}

export interface GuidanceResult {
  direction: 'advance' | 'delay';
  windows: InterventionWindow[];
  warnings: string[];
}

export function computeGuidance(phase: PhaseEstimate, direction: 'advance' | 'delay', requiredWakeRel?: number): GuidanceResult {
  const { cbtMin, dlmo } = phase;
  const windows: InterventionWindow[] = [];
  const warnings: string[] = [];

  if (direction === 'advance') {
    windows.push({
      kind: 'light_seek',
      start: cbtMin,
      end: cbtMin + 3,
      label: 'Morning bright light',
      rationale: 'Light after the temperature minimum advances the clock. The first 1–3 h after CBTmin is the steepest part of the advance region.',
      strength: 'strong',
    });
    windows.push({
      kind: 'light_avoid',
      start: dlmo - 2,
      end: cbtMin,
      label: 'Evening light avoidance',
      rationale: 'Light from the hours before DLMO through to CBTmin delays the clock, undoing an advance. Dim, warm light only.',
      strength: 'strong',
    });
    windows.push({
      kind: 'melatonin_zone',
      start: dlmo - 6,
      end: dlmo - 2,
      label: 'Melatonin advance zone (timing only)',
      rationale: 'On the melatonin PRC the advance region is several hours before DLMO. This is a timing window, not advice to take anything; dose and suitability are for a clinician.',
      strength: 'moderate',
    });
    if (requiredWakeRel != null && hoursDiff(requiredWakeRel, cbtMin) < 0) {
      warnings.push(
        'Your required wake falls before the estimated temperature minimum. Bright light immediately on waking would land in the delay region and push your clock later. Keep light dim until the estimated CBTmin, then seek bright light.',
      );
    }
  } else {
    windows.push({
      kind: 'light_seek',
      start: cbtMin - 4,
      end: cbtMin - 1,
      label: 'Late-evening bright light',
      rationale: 'Light in the hours before the temperature minimum delays the clock.',
      strength: 'strong',
    });
    windows.push({
      kind: 'light_avoid',
      start: cbtMin,
      end: cbtMin + 4,
      label: 'Morning light avoidance',
      rationale: 'Light after CBTmin would advance the clock, which is the opposite of what you want.',
      strength: 'strong',
    });
    windows.push({
      kind: 'melatonin_zone',
      start: cbtMin + 1,
      end: cbtMin + 5,
      label: 'Melatonin delay zone (timing only)',
      rationale: 'Morning melatonin, after CBTmin, sits in the delay region of the melatonin PRC. Timing only; dose and suitability are for a clinician.',
      strength: 'moderate',
    });
  }

  return { direction, windows, warnings };
}

export type MelatoninZone = 'advance' | 'delay' | 'dead_zone';

/** Classify where a logged melatonin time falls on the melatonin PRC relative to the estimated DLMO. */
export function classifyMelatoninTiming(phase: PhaseEstimate, takenRel: number): { zone: MelatoninZone; hoursFromDlmo: number; note: string } {
  const h = hoursDiff(takenRel, phase.dlmo);
  if (h >= -8 && h <= -1) {
    return {
      zone: 'advance',
      hoursFromDlmo: h,
      note: `Taken ${fmt(-h)} before estimated DLMO: inside the advance region.`,
    };
  }
  const fromCbt = hoursDiff(takenRel, phase.cbtMin);
  if (fromCbt >= 0 && fromCbt <= 6) {
    return {
      zone: 'delay',
      hoursFromDlmo: h,
      note: `Taken ${fmt(fromCbt)} after estimated CBTmin: inside the delay region, which pushes the clock later.`,
    };
  }
  return {
    zone: 'dead_zone',
    hoursFromDlmo: h,
    note: `Taken ${h >= 0 ? fmt(h) + ' after' : fmt(-h) + ' before'} estimated DLMO: near bedtime, where melatonin has little effect on phase.`,
  };
}

function fmt(h: number): string {
  const total = Math.round(Math.abs(h) * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  if (hh === 0) return `${mm} min`;
  if (mm === 0) return `${hh} h`;
  return `${hh} h ${mm} min`;
}
