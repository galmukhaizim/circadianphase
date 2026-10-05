/**
 * Shapes taken from the WHOOP OpenAPI spec (openapi.json in the repo root,
 * server https://api.prod.whoop.com/developer, v2 paths), cross-checked with
 * developer.whoop.com in October 2026.
 */
import type { WhoopSleepLike } from '../lib/markers';

export type WhoopSleep = WhoopSleepLike & {
  cycle_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  score?: NonNullable<WhoopSleepLike['score']> & {
    respiratory_rate?: number;
    sleep_consistency_percentage?: number;
  };
};

export interface WhoopCycle {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end?: string;
  timezone_offset: string;
  score_state: 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';
  score?: { strain: number; kilojoule: number; average_heart_rate: number; max_heart_rate: number };
  step_count?: number | null;
}

export interface WhoopRecovery {
  cycle_id: number;
  sleep_id: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  score_state: 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';
  score?: {
    user_calibrating: boolean;
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  };
}

export interface Paginated<T> {
  records: T[];
  next_token?: string;
}

export interface WhoopProfile {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
}

/** Scopes as listed in the spec's OAuth security scheme, plus `offline` for refresh tokens. */
export const WHOOP_SCOPES = ['read:sleep', 'read:cycles', 'read:recovery', 'read:profile', 'offline'] as const;

export const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
export const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';
