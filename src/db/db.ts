import Dexie, { type EntityTable } from 'dexie';
import type { SleepEntry } from '../lib/types';
import type { WhoopSleepLike } from '../lib/markers';

export interface Settings {
  id: 'main';
  requiredWake: string; // HH:MM
  /** Days per week the required wake applies. Used for the MCTQ sleep-debt correction. */
  requiredWakeDaysPerWeek: number;
  /** WHOOP OAuth client id (public). */
  whoopClientId?: string;
  /** URL of the token relay (holds the client secret; see relay/). */
  whoopRelayUrl?: string;
  name?: string;
}

export interface WhoopTokens {
  id: 'main';
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  scope?: string;
}

export interface WhoopRecoveryRecord {
  cycle_id: number;
  sleep_id: string;
  score_state: string;
  score?: {
    user_calibrating: boolean;
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  };
  created_at: string;
}

export interface HrSeriesRecord {
  /** Wake-morning ISO date the series belongs to. */
  date: string;
  kind: 'hr' | 'hrv';
  samples: { t: number; v: number }[];
  /** Timezone offset to interpret times in, "+hh:mm". */
  tzOffset: string;
  importedAt: number;
}

export interface OAuthState {
  id: 'main';
  state: string;
  createdAt: number;
}

export class CircadianDb extends Dexie {
  entries!: EntityTable<SleepEntry, 'date'>;
  settings!: EntityTable<Settings, 'id'>;
  whoopTokens!: EntityTable<WhoopTokens, 'id'>;
  whoopSleeps!: EntityTable<WhoopSleepLike, 'id'>;
  whoopRecoveries!: EntityTable<WhoopRecoveryRecord, 'cycle_id'>;
  hrSeries!: EntityTable<HrSeriesRecord, 'date'>;
  oauthState!: EntityTable<OAuthState, 'id'>;

  constructor(name = 'circadianphase') {
    super(name);
    this.version(1).stores({
      entries: 'date, alarm, source',
      settings: 'id',
      whoopTokens: 'id',
      whoopSleeps: 'id, start, end',
      whoopRecoveries: 'cycle_id, sleep_id',
      hrSeries: 'date, kind',
      oauthState: 'id',
    });
  }
}

export const db = new CircadianDb();

export const DEFAULT_SETTINGS: Settings = { id: 'main', requiredWake: '06:30', requiredWakeDaysPerWeek: 5 };

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('main')) ?? DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await db.settings.put({ ...cur, ...patch, id: 'main' });
}

export async function wipeAll(): Promise<void> {
  await Promise.all(db.tables.map((t) => t.clear()));
}
