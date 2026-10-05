import type { Clock } from './time';

/** One night, keyed by the date of the morning you woke up. */
export interface SleepEntry {
  /** ISO date (YYYY-MM-DD) of the wake-up morning. */
  date: string;
  onset: Clock;
  wake: Clock;
  /** true = alarm or someone woke you; false = woke naturally (a "free day" in MCTQ terms). */
  alarm: boolean;
  /** 1 (clear-headed) .. 5 (couldn't function). */
  grogginess?: number;
  lightNotes?: string;
  /** Clock time melatonin was taken the evening before, if any. */
  melatoninTime?: Clock;
  /** Where the sleep window came from. */
  source?: 'manual' | 'whoop';
}

export type ConfidenceLevel = 'none' | 'low' | 'moderate' | 'good';

export interface Confidence {
  level: ConfidenceLevel;
  reasons: string[];
}
