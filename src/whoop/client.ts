/**
 * WHOOP OAuth 2.0 + REST client.
 *
 * WHOOP's OAuth is the authorization-code grant with a client secret and no
 * documented PKCE support, and the docs say the secret must stay server-side.
 * A static site therefore cannot complete the flow alone. The small relay in
 * relay/ holds the secret, performs the code exchange and refresh, and proxies
 * API calls (which also sidesteps any CORS restriction on the API host).
 *
 * The browser keeps: client id (public), relay URL, access + refresh tokens
 * (in IndexedDB, on this device only).
 */
import { db, getSettings, type WhoopTokens } from '../db/db';
import { type Paginated, type TokenResponse, WHOOP_AUTH_URL, WHOOP_SCOPES, type WhoopCycle, type WhoopProfile, type WhoopRecovery, type WhoopSleep } from './types';

export class WhoopError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

function randomState(): string {
  // WHOOP docs: "The state parameter must be eight characters long if you need to generate it yourself."
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function redirectUri(): string {
  // Same page, no query string; must be registered verbatim in the WHOOP dashboard.
  return `${location.origin}${location.pathname}`;
}

export async function beginAuthorization(): Promise<void> {
  const s = await getSettings();
  if (!s.whoopClientId) throw new WhoopError('Set the WHOOP client ID first.');
  if (!s.whoopRelayUrl) throw new WhoopError('Set the relay URL first.');
  const state = randomState();
  await db.oauthState.put({ id: 'main', state, createdAt: Date.now() });
  const u = new URL(WHOOP_AUTH_URL);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', s.whoopClientId);
  u.searchParams.set('redirect_uri', redirectUri());
  u.searchParams.set('scope', WHOOP_SCOPES.join(' '));
  u.searchParams.set('state', state);
  location.assign(u.toString());
}

/** Call on page load. Returns true if an OAuth redirect was consumed. */
export async function handleRedirectIfPresent(): Promise<{ handled: boolean; error?: string }> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const state = params.get('state');
  const err = params.get('error');
  if (!code && !err) return { handled: false };
  const clean = () => history.replaceState(null, '', redirectUri());
  if (err) {
    clean();
    return { handled: true, error: `WHOOP returned an error: ${err} ${params.get('error_description') ?? ''}`.trim() };
  }
  const saved = await db.oauthState.get('main');
  await db.oauthState.delete('main');
  if (!saved || saved.state !== state || Date.now() - saved.createdAt > 15 * 60_000) {
    clean();
    return { handled: true, error: 'OAuth state mismatch; the sign-in was not started from this browser. Try again.' };
  }
  try {
    const tok = await relayPost<TokenResponse>('/token', { grant_type: 'authorization_code', code: code as string, redirect_uri: redirectUri() });
    await storeTokens(tok);
    clean();
    return { handled: true };
  } catch (e) {
    clean();
    return { handled: true, error: e instanceof Error ? e.message : String(e) };
  }
}

async function storeTokens(tok: TokenResponse): Promise<void> {
  const rec: WhoopTokens = {
    id: 'main',
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + (tok.expires_in - 60) * 1000,
    scope: tok.scope,
  };
  await db.whoopTokens.put(rec);
}

async function relayPost<T>(path: string, body: Record<string, string>): Promise<T> {
  const s = await getSettings();
  if (!s.whoopRelayUrl) throw new WhoopError('Relay URL not configured.');
  const r = await fetch(new URL(path, s.whoopRelayUrl.replace(/\/?$/, '/')).toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new WhoopError(`Relay ${path} failed: ${r.status} ${await r.text()}`, r.status);
  return (await r.json()) as T;
}

async function validAccessToken(): Promise<string> {
  const t = await db.whoopTokens.get('main');
  if (!t) throw new WhoopError('Not connected to WHOOP.', 401);
  if (Date.now() < t.expiresAt) return t.accessToken;
  if (!t.refreshToken) throw new WhoopError('WHOOP session expired; reconnect.', 401);
  const tok = await relayPost<TokenResponse>('/refresh', { grant_type: 'refresh_token', refresh_token: t.refreshToken });
  await storeTokens(tok);
  return tok.access_token;
}

export async function isConnected(): Promise<boolean> {
  return (await db.whoopTokens.get('main')) != null;
}

export async function disconnect(revoke = true): Promise<void> {
  if (revoke) {
    try {
      await apiFetch('/v2/user/access', { method: 'DELETE' });
    } catch {
      /* best effort */
    }
  }
  await db.whoopTokens.delete('main');
}

async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const s = await getSettings();
  const token = await validAccessToken();
  const base = s.whoopRelayUrl!.replace(/\/?$/, '/') + 'whoop';
  const r = await fetch(base + path, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` } });
  if (r.status === 429) throw new WhoopError('WHOOP rate limit hit (100/min, 10k/day). Try again shortly.', 429);
  if (r.status === 401) throw new WhoopError('WHOOP rejected the token; reconnect.', 401);
  if (!r.ok) throw new WhoopError(`WHOOP ${path}: ${r.status} ${await r.text()}`, r.status);
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

async function fetchAll<T>(path: string, start: string, end: string, max = 400): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined;
  do {
    const q = new URLSearchParams({ limit: '25', start, end });
    if (next) q.set('nextToken', next);
    const page = await apiFetch<Paginated<T>>(`${path}?${q.toString()}`);
    out.push(...page.records);
    next = page.next_token;
  } while (next && out.length < max);
  return out;
}

export function getProfile(): Promise<WhoopProfile> {
  return apiFetch<WhoopProfile>('/v2/user/profile/basic');
}

export function getSleeps(start: string, end: string): Promise<WhoopSleep[]> {
  return fetchAll<WhoopSleep>('/v2/activity/sleep', start, end);
}

export function getRecoveries(start: string, end: string): Promise<WhoopRecovery[]> {
  return fetchAll<WhoopRecovery>('/v2/recovery', start, end);
}

export function getCycles(start: string, end: string): Promise<WhoopCycle[]> {
  return fetchAll<WhoopCycle>('/v2/cycle', start, end);
}

/** Pull the last `days` days of sleep + recovery and store them locally. */
export async function syncRecent(days = 60): Promise<{ sleeps: number; recoveries: number }> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const [sleeps, recoveries] = await Promise.all([getSleeps(start.toISOString(), end.toISOString()), getRecoveries(start.toISOString(), end.toISOString())]);
  await db.transaction('rw', db.whoopSleeps, db.whoopRecoveries, async () => {
    await db.whoopSleeps.bulkPut(sleeps);
    await db.whoopRecoveries.bulkPut(
      recoveries.map((r) => ({ cycle_id: r.cycle_id, sleep_id: r.sleep_id, score_state: r.score_state, score: r.score, created_at: r.created_at })),
    );
  });
  return { sleeps: sleeps.length, recoveries: recoveries.length };
}
