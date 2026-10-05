import { durationHours, formatHours, midsleepRel } from './time';
import type { SleepEntry } from './types';

function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function entriesToCsv(entries: SleepEntry[]): string {
  const header = ['date', 'sleep_onset', 'wake_time', 'alarm', 'duration_h', 'midsleep', 'grogginess_1_5', 'melatonin_time', 'light_notes', 'source'];
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      let dur = '';
      let mid = '';
      try {
        dur = durationHours(e.onset, e.wake).toFixed(2);
        mid = formatHours(midsleepRel(e.onset, e.wake));
      } catch {
        /* leave blank */
      }
      return [e.date, e.onset, e.wake, e.alarm ? 'yes' : 'no', dur, mid, e.grogginess ?? '', e.melatoninTime ?? '', e.lightNotes ?? '', e.source ?? 'manual']
        .map(csvCell)
        .join(',');
    });
  return [header.join(','), ...rows].join('\n') + '\n';
}
