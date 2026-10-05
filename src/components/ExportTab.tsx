import { entriesToCsv } from '../lib/export';
import { chronotypeLabel } from '../lib/msfsc';
import { formatDuration, formatHours, todayIso } from '../lib/time';
import type { Model } from '../useModel';
import { db, wipeAll } from '../db/db';

function download(name: string, text: string, type = 'text/csv') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportTab({ m }: { m: Model }) {
  const { phase, mctq, misalignment: mis, guidance } = m;
  const exportJson = async () => {
    const dump = {
      exportedAt: new Date().toISOString(),
      settings: { ...m.settings, whoopClientId: undefined, whoopRelayUrl: undefined },
      entries: await db.entries.toArray(),
      hrSeries: await db.hrSeries.toArray(),
    };
    download(`circadianphase-backup-${todayIso()}.json`, JSON.stringify(dump, null, 2), 'application/json');
  };
  const importJson = async (file: File) => {
    const d = JSON.parse(await file.text());
    if (Array.isArray(d.entries)) await db.entries.bulkPut(d.entries);
    if (Array.isArray(d.hrSeries)) await db.hrSeries.bulkPut(d.hrSeries);
    if (d.settings) await db.settings.put({ ...d.settings, id: 'main' });
  };

  return (
    <>
      <div className="card no-print">
        <h2>Export</h2>
        <div className="row">
          <button className="primary" onClick={() => download(`circadian-log-${todayIso()}.csv`, entriesToCsv(m.entries))} disabled={!m.entries.length}>
            Download log as CSV
          </button>
          <button className="primary" onClick={() => window.print()} disabled={!phase}>
            Print one-page summary (or save as PDF)
          </button>
          <button className="secondary" onClick={exportJson}>
            Backup everything (JSON)
          </button>
          <label className="secondary" style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--accent)', cursor: 'pointer' }}>
            Restore backup
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </label>
          <button
            className="danger"
            onClick={() => {
              if (confirm('Delete every log entry, setting and WHOOP record stored in this browser?')) wipeAll();
            }}
          >
            Erase all local data
          </button>
        </div>
        <small>The summary below is what prints. Everything lives in this browser's IndexedDB; nothing is sent anywhere.</small>
      </div>

      <div className="card summary">
        <h1>Circadian phase summary</h1>
        <p className="muted">
          Prepared {todayIso()} from a self-logged sleep diary{m.hrNadir ? ' and an imported heart-rate series' : ''}. Personal-interest tool, not a medical device. Every value below is an
          estimate from population-average relationships, not a measurement; delayed sleep phase disorder is diagnosed by a clinician, usually with a sleep diary, actigraphy and, where
          available, salivary dim-light melatonin onset (DLMO).
        </p>
        {!phase ? (
          <p>Not enough data yet: no alarm-free nights logged.</p>
        ) : (
          <>
            <h3>Headline</h3>
            <p>
              Required wake time is <strong>{m.settings.requiredWake}</strong>. Estimated natural wake time is <strong>{formatHours(phase.naturalWake)}</strong>, a gap of{' '}
              <strong>{formatDuration(Math.abs(mis?.gapHours ?? 0))}</strong> ({(mis?.gapHours ?? 0) >= 0 ? 'required wake is earlier' : 'required wake is later'}). Predicted sleep
              inertia at the required wake: <strong>{mis?.inertia.level}</strong>.
            </p>
            <h3>Sleep diary (MCTQ method)</h3>
            <table>
              <tbody>
                <tr>
                  <td>Nights logged</td>
                  <td>
                    {mctq.nTotal} ({mctq.nWork} alarm, {mctq.nFree} natural wake)
                  </td>
                </tr>
                <tr>
                  <td>Alarm-day sleep</td>
                  <td>{mctq.nWork ? `${formatHours(mctq.workOnsetMean)} – ${formatHours(mctq.workWakeMean)}, ${formatDuration(mctq.sdW)}` : '—'}</td>
                </tr>
                <tr>
                  <td>Free-day sleep</td>
                  <td>
                    {formatHours(mctq.freeOnsetMean)} – {formatHours(mctq.freeWakeMean)}, {formatDuration(mctq.sdF)}
                  </td>
                </tr>
                <tr>
                  <td>MSFsc (sleep-corrected mid-sleep, free days)</td>
                  <td>
                    {formatHours(mctq.msfsc!)} ({chronotypeLabel(mctq.msfsc!)}; sleep-debt correction {formatDuration(mctq.debtCorrectionHours)})
                  </td>
                </tr>
                <tr>
                  <td>Social jetlag</td>
                  <td>{Number.isNaN(mctq.socialJetlag) ? '—' : formatDuration(mctq.socialJetlag)}</td>
                </tr>
                {!Number.isNaN(m.grog.alarmMean) && (
                  <tr>
                    <td>Self-rated grogginess (1–5)</td>
                    <td>
                      {m.grog.alarmMean.toFixed(1)} on alarm mornings (n={m.grog.nAlarm}); {Number.isNaN(m.grog.naturalMean) ? '—' : m.grog.naturalMean.toFixed(1)} on natural mornings (n=
                      {m.grog.nNatural})
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <h3>Estimated circadian markers (confidence: {phase.confidence.level})</h3>
            <table>
              <tbody>
                <tr>
                  <td>Estimated DLMO</td>
                  <td>
                    {formatHours(phase.dlmo)} ± {phase.dlmoUncertainty} h (MSFsc − 7 h)
                  </td>
                </tr>
                <tr>
                  <td>Estimated core-temperature minimum</td>
                  <td>
                    {formatHours(phase.cbtMin)} ({phase.cbtMinSource === 'hr_nadir' ? 'overnight heart-rate nadir' : 'natural wake − 2.5 h'})
                  </td>
                </tr>
                <tr>
                  <td>Estimated melatonin window</td>
                  <td>
                    {formatHours(phase.dlmo)} – {formatHours(phase.melatoninOffset)}
                  </td>
                </tr>
                <tr>
                  <td>Required wake relative to CBTmin</td>
                  <td>{mis ? `${formatDuration(Math.abs(mis.wakeVsCbtMin))} ${mis.wakeVsCbtMin < 0 ? 'before' : 'after'}` : '—'}</td>
                </tr>
              </tbody>
            </table>
            <ul className="tight">
              {mis?.inertia.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {guidance && (
              <>
                <h3>Timing windows from the phase response curves ({guidance.direction})</h3>
                <ul className="tight">
                  {guidance.windows.map((w) => (
                    <li key={w.kind}>
                      {w.label}: {formatHours(w.start)} – {formatHours(w.end)}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h3>Assumptions</h3>
            <ul className="tight">
              {phase.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
              {phase.confidence.reasons.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
