import { useState } from 'react';
import { db, saveSettings } from '../db/db';
import { durationHours, formatDuration, isValidClock, todayIso } from '../lib/time';
import type { SleepEntry } from '../lib/types';
import type { Model } from '../useModel';

const blank = (): SleepEntry => ({ date: todayIso(), onset: '23:30', wake: '07:00', alarm: true, grogginess: 3, lightNotes: '', melatoninTime: '', source: 'manual' });

export function LogTab({ m }: { m: Model }) {
  const [draft, setDraft] = useState<SleepEntry>(blank);
  const [err, setErr] = useState<string | null>(null);
  const sorted = [...m.entries].sort((a, b) => b.date.localeCompare(a.date));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidClock(draft.onset) || !isValidClock(draft.wake)) return setErr('Enter sleep onset and wake as HH:MM.');
    if (draft.melatoninTime && !isValidClock(draft.melatoninTime)) return setErr('Melatonin time must be HH:MM or blank.');
    const dur = durationHours(draft.onset, draft.wake);
    if (dur < 1 || dur > 16) return setErr(`That is ${formatDuration(dur)} of sleep; check the times.`);
    const rec: SleepEntry = { ...draft, melatoninTime: draft.melatoninTime || undefined, lightNotes: draft.lightNotes || undefined };
    await db.entries.put(rec);
    setErr(null);
    setDraft(blank());
  };

  return (
    <>
      <div className="card">
        <h2>Log a night</h2>
        <p className="muted">
          One row per night, keyed by the morning you woke. "Woke naturally" nights are the free days the MSFsc method relies on, so log weekends and holidays even if nothing else.
        </p>
        <form className="log" onSubmit={save}>
          <label>
            Wake date
            <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required />
          </label>
          <label>
            Fell asleep
            <input type="time" value={draft.onset} onChange={(e) => setDraft({ ...draft, onset: e.target.value })} required />
          </label>
          <label>
            Woke up
            <input type="time" value={draft.wake} onChange={(e) => setDraft({ ...draft, wake: e.target.value })} required />
          </label>
          <label>
            How you woke
            <select value={draft.alarm ? 'alarm' : 'natural'} onChange={(e) => setDraft({ ...draft, alarm: e.target.value === 'alarm' })}>
              <option value="alarm">Alarm / someone woke me</option>
              <option value="natural">Woke naturally</option>
            </select>
          </label>
          <label>
            Grogginess on waking (1 clear – 5 can't function)
            <select value={draft.grogginess ?? ''} onChange={(e) => setDraft({ ...draft, grogginess: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Melatonin taken at (optional)
            <input type="time" value={draft.melatoninTime ?? ''} onChange={(e) => setDraft({ ...draft, melatoninTime: e.target.value })} />
          </label>
          <label className="wide">
            Light exposure notes (optional)
            <input type="text" placeholder="e.g. phone in bed till 1am; walked outside 8am" value={draft.lightNotes ?? ''} onChange={(e) => setDraft({ ...draft, lightNotes: e.target.value })} />
          </label>
          <div className="row">
            <button className="primary" type="submit">
              Save night
            </button>
            {err && <span className="error">{err}</span>}
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Schedule</h2>
        <div className="row">
          <label className="row">
            <span className="muted">Required wake time</span>
            <input type="time" value={m.settings.requiredWake} onChange={(e) => saveSettings({ requiredWake: e.target.value })} />
          </label>
          <label className="row">
            <span className="muted">Days per week it applies</span>
            <input type="number" min={0} max={7} value={m.settings.requiredWakeDaysPerWeek} onChange={(e) => saveSettings({ requiredWakeDaysPerWeek: Number(e.target.value) })} style={{ width: 60 }} />
          </label>
        </div>
        <small>Days per week feeds the MCTQ sleep-debt correction (workdays vs free days).</small>
      </div>

      <div className="card">
        <h2>
          Logged nights <span className="pill">{sorted.length}</span>
        </h2>
        {sorted.length === 0 ? (
          <p className="muted">Nothing logged yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Wake date</th>
                  <th>Asleep</th>
                  <th>Woke</th>
                  <th>Duration</th>
                  <th>How</th>
                  <th>Grog</th>
                  <th>Melatonin</th>
                  <th>Light</th>
                  <th>Src</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <tr key={e.date}>
                    <td>{e.date}</td>
                    <td>{e.onset}</td>
                    <td>{e.wake}</td>
                    <td>{formatDuration(durationHours(e.onset, e.wake))}</td>
                    <td>{e.alarm ? 'alarm' : 'natural'}</td>
                    <td>{e.grogginess ?? ''}</td>
                    <td>{e.melatoninTime ?? ''}</td>
                    <td>{e.lightNotes ?? ''}</td>
                    <td className="muted">{e.source ?? 'manual'}</td>
                    <td className="no-print row">
                      <button className="secondary" onClick={() => setDraft({ ...e, lightNotes: e.lightNotes ?? '', melatoninTime: e.melatoninTime ?? '' })}>
                        Edit
                      </button>
                      <button className="danger" onClick={() => db.entries.delete(e.date)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
