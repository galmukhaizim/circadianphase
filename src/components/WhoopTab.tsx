import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, saveSettings } from '../db/db';
import { parseSeriesCsv, stageDistribution, whoopSleepToEntry } from '../lib/markers';
import { formatDuration, formatHours } from '../lib/time';
import type { Model } from '../useModel';
import { beginAuthorization, disconnect, normalizeRelayUrl, redirectUri, syncRecent, testRelay } from '../whoop/client';
import { WHOOP_SCOPES } from '../whoop/types';

export function WhoopTab({ m, oauthMessage }: { m: Model; oauthMessage: string | null }) {
  const tokens = useLiveQuery(() => db.whoopTokens.get('main'), []);
  const sleeps = useLiveQuery(() => db.whoopSleeps.orderBy('end').reverse().toArray(), []) ?? [];
  const recoveries = useLiveQuery(() => db.whoopRecoveries.toArray(), []) ?? [];
  const series = useLiveQuery(() => db.hrSeries.toArray(), []) ?? [];
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(oauthMessage);
  const [clientId, setClientId] = useState(m.settings.whoopClientId ?? '');
  const [relay, setRelay] = useState(m.settings.whoopRelayUrl ?? '');
  const [csvDate, setCsvDate] = useState('');
  const [csvTz, setCsvTz] = useState(() => {
    const off = -new Date().getTimezoneOffset();
    const s = off < 0 ? '-' : '+';
    const a = Math.abs(off);
    return `${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
  });

  const connected = tokens != null;
  const recByCycle = new Map(recoveries.map((r) => [r.sleep_id, r]));

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      setMsg(await fn());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const importSleeps = async () => {
    let n = 0;
    for (const s of sleeps) {
      const existing = await db.entries.get(s.end.slice(0, 10));
      const e = whoopSleepToEntry(s, existing?.alarm ?? true);
      if (!e) continue;
      // Keep the user's own annotations; replace only the measured window.
      await db.entries.put({ ...(existing ?? {}), ...e, grogginess: existing?.grogginess, lightNotes: existing?.lightNotes, melatoninTime: existing?.melatoninTime, alarm: existing?.alarm ?? true });
      n++;
    }
    return `Imported ${n} WHOOP sleep windows into the log. Nights without an existing entry were marked "alarm" (WHOOP cannot tell); fix that in the Log tab for nights you woke naturally.`;
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const samples = parseSeriesCsv(text);
    if (!samples.length) throw new Error('No "timestamp,value" rows found.');
    const date = csvDate || new Date(samples[samples.length - 1].t).toISOString().slice(0, 10);
    await db.hrSeries.put({ date, kind: 'hr', samples, tzOffset: csvTz, importedAt: Date.now() });
    return `Stored ${samples.length} heart-rate samples for ${date}.`;
  };

  return (
    <>
      <div className="card">
        <h2>WHOOP (optional)</h2>
        <p className="muted">
          Checked against the WHOOP developer docs and OpenAPI spec (October 2026): current API is <strong>v2</strong> at <code>api.prod.whoop.com/developer</code>. OAuth 2.0 is the
          authorization-code grant with a server-side client secret and no documented PKCE, so a small token relay is needed; see <code>relay/README.md</code>. Scopes requested:{' '}
          {WHOOP_SCOPES.join(', ')}.
        </p>
        <div className="banner">
          <strong>What WHOOP's public API can and cannot give this tool.</strong> It returns each sleep's start/end, timezone, stage totals (light / slow-wave / REM / awake), sleep need
          and debt, and one resting-heart-rate and HRV value per recovery. It does <em>not</em> expose an intra-night heart-rate or HRV time series, so the time of the overnight
          heart-rate nadir (the CBTmin proxy) and time of peak HRV cannot be derived from the API. The CSV import below accepts a per-minute series from any device export.
        </div>
        {!connected ? (
          <form
            className="log"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await saveSettings({ whoopClientId: clientId.trim(), whoopRelayUrl: normalizeRelayUrl(relay) });
                await testRelay(relay);
                await beginAuthorization();
                return 'Redirecting to WHOOP…';
              });
            }}
          >
            <label>
              Client ID
              <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} required />
            </label>
            <label>
              Relay URL
              <input type="text" placeholder="http://localhost:8787" value={relay} onChange={(e) => setRelay(e.target.value)} required />
            </label>
            <label className="wide">
              Redirect URL to register in the WHOOP dashboard
              <code>{redirectUri()}</code>
            </label>
            <div className="row">
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const h = await testRelay(relay);
                    await saveSettings({ whoopRelayUrl: normalizeRelayUrl(relay) });
                    return `Relay reachable at ${normalizeRelayUrl(relay)} and configured. Allowed origins: ${(h.allowedOrigins ?? []).join(', ')}. Now click Connect WHOOP.`;
                  })
                }
              >
                Test relay
              </button>
              <button className="primary" type="submit" disabled={busy}>
                Connect WHOOP
              </button>
            </div>
          </form>
        ) : (
          <div className="row">
            <span className="ok">Connected.</span>
            <button className="primary" disabled={busy} onClick={() => run(async () => { const r = await syncRecent(60); return `Fetched ${r.sleeps} sleeps and ${r.recoveries} recoveries from the last 60 days.`; })}>
              Sync last 60 days
            </button>
            <button className="secondary" disabled={busy || !sleeps.length} onClick={() => run(importSleeps)}>
              Use WHOOP sleep windows in the log
            </button>
            <button className="danger" disabled={busy} onClick={() => run(async () => { await disconnect(true); return 'Disconnected and access revoked.'; })}>
              Disconnect
            </button>
          </div>
        )}
        {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
      </div>

      <div className="card">
        <h3>Heart-rate series import (any device)</h3>
        <p className="muted">
          CSV with <code>timestamp,bpm</code> rows (ISO 8601 or epoch). The smoothed overnight minimum, ignoring the first hour after sleep onset, is used as the CBTmin proxy. The
          assumption inline: the core-temperature minimum sits roughly 2–3 h before natural wake and near the heart-rate nadir; heart rate is also moved by posture, arousals and sleep
          stage, so this is a noisy marker.
        </p>
        <div className="row">
          <label className="row">
            <span className="muted">Wake date</span>
            <input type="date" value={csvDate} onChange={(e) => setCsvDate(e.target.value)} />
          </label>
          <label className="row">
            <span className="muted">Timezone offset</span>
            <input type="text" value={csvTz} onChange={(e) => setCsvTz(e.target.value)} style={{ width: 80 }} />
          </label>
          <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && run(() => importCsv(e.target.files![0]))} />
        </div>
        {series.length > 0 && (
          <p>
            {series.length} night(s) imported. {m.hrNadir ? `Mean heart-rate nadir ≈ ${formatHours(m.hrNadir.rel)} across ${m.hrNadir.nights} night(s).` : ''}
            <button className="danger" style={{ marginLeft: 8 }} onClick={() => db.hrSeries.clear()}>
              Clear series
            </button>
          </p>
        )}
      </div>

      {sleeps.length > 0 && (
        <div className="card">
          <h3>Synced WHOOP sleeps</h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Wake date</th>
                  <th>Window (local)</th>
                  <th>In bed</th>
                  <th>SWS</th>
                  <th>REM</th>
                  <th>Light</th>
                  <th>Awake</th>
                  <th>RHR</th>
                  <th>HRV</th>
                  <th>Debt</th>
                </tr>
              </thead>
              <tbody>
                {sleeps.filter((s) => !s.nap).map((s) => {
                  const e = whoopSleepToEntry(s);
                  const d = stageDistribution(s);
                  const r = recByCycle.get(s.id);
                  const pct = (x?: number) => (x == null ? '—' : `${Math.round(x * 100)}%`);
                  return (
                    <tr key={s.id}>
                      <td>{e?.date}</td>
                      <td>
                        {e?.onset} – {e?.wake}
                      </td>
                      <td>{d ? formatDuration(d.inBedHours) : s.score_state}</td>
                      <td>{pct(d?.sws)}</td>
                      <td>{pct(d?.rem)}</td>
                      <td>{pct(d?.light)}</td>
                      <td>{pct(d?.awake)}</td>
                      <td>{r?.score?.resting_heart_rate ?? '—'}</td>
                      <td>{r?.score ? Math.round(r.score.hrv_rmssd_milli) : '—'}</td>
                      <td>{s.score?.sleep_needed ? formatDuration(s.score.sleep_needed.need_from_sleep_debt_milli / 3_600_000) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <small>Stage percentages are of in-bed time. A high slow-wave share early in the night plus an alarm within ~3 h of onset is the deep-sleep inertia case flagged on the overview.</small>
        </div>
      )}
    </>
  );
}
