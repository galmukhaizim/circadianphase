import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db, DEFAULT_SETTINGS, type Settings } from './db/db';
import { findNadir, instantToRel, whoopSleepToEntry } from './lib/markers';
import { computeMctq, type MctqResult } from './lib/msfsc';
import { computeMisalignment, estimatePhase, grogginessSummary, type Misalignment, type PhaseEstimate } from './lib/phase';
import { computeGuidance, type GuidanceResult } from './lib/prc';
import { clockToRel, durationHours, isValidClock, mean } from './lib/time';
import type { SleepEntry } from './lib/types';

export interface Model {
  settings: Settings;
  entries: SleepEntry[];
  mctq: MctqResult;
  phase: PhaseEstimate | null;
  misalignment: Misalignment | null;
  guidance: GuidanceResult | null;
  hrNadir: { rel: number; nights: number } | null;
  grog: ReturnType<typeof grogginessSummary>;
  loading: boolean;
}

export function useModel(): Model {
  const settingsBox = useLiveQuery(() => db.settings.get('main').then((s) => ({ s })), []);
  const entries = useLiveQuery(() => db.entries.toArray(), []);
  const hrSeries = useLiveQuery(() => db.hrSeries.where('kind').equals('hr').toArray(), []);
  const whoopSleeps = useLiveQuery(() => db.whoopSleeps.toArray(), []);

  return useMemo(() => {
    const s = settingsBox?.s ?? DEFAULT_SETTINGS;
    const es = entries ?? [];
    const loading = settingsBox === undefined || entries === undefined;

    // Heart-rate nadir per imported night, restricted to that night's sleep window when known.
    let hrNadir: Model['hrNadir'] = null;
    if (hrSeries && hrSeries.length) {
      const byDate = new Map((es as SleepEntry[]).map((e) => [e.date, e]));
      const rels: number[] = [];
      for (const rec of hrSeries) {
        const entry = byDate.get(rec.date);
        const ws = whoopSleeps?.find((w) => whoopSleepToEntry(w)?.date === rec.date);
        let start: number | undefined;
        let end: number | undefined;
        if (ws) {
          start = Date.parse(ws.start);
          end = Date.parse(ws.end);
        } else if (entry && rec.samples.length) {
          // Reconstruct the window from the log entry in the series' zone.
          const first = rec.samples.reduce((a, b) => (a.t < b.t ? a : b)).t;
          start = first;
          end = first + durationHours(entry.onset, entry.wake) * 3_600_000;
        }
        const r = findNadir(rec.samples, { start, end, skipLeadingMinutes: 60, windowMinutes: 30 });
        if (r) rels.push(instantToRel(r.t, rec.tzOffset));
      }
      if (rels.length) hrNadir = { rel: mean(rels), nights: rels.length };
    }

    const mctq = computeMctq(es, { workdaysPerWeek: s.requiredWakeDaysPerWeek });
    const phase = estimatePhase({ mctq, hrNadirRel: hrNadir?.rel, hrNadirNights: hrNadir?.nights });
    const reqOk = isValidClock(s.requiredWake);
    const misalignment = phase && reqOk ? computeMisalignment(phase, clockToRel(s.requiredWake), mctq.nWork ? mctq.workOnsetMean : undefined) : null;
    const guidance = phase && misalignment ? computeGuidance(phase, misalignment.direction === 'delay' ? 'delay' : 'advance', reqOk ? clockToRel(s.requiredWake) : undefined) : null;
    return { settings: s, entries: es, mctq, phase, misalignment, guidance, hrNadir, grog: grogginessSummary(es), loading };
  }, [settingsBox, entries, hrSeries, whoopSleeps]);
}
