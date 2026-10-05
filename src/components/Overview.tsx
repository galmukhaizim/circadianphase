import { chronotypeLabel } from '../lib/msfsc';
import { classifyMelatoninTiming } from '../lib/prc';
import { clockToRel, formatDuration, formatHours } from '../lib/time';
import type { Model } from '../useModel';
import { Timeline } from './Timeline';
import { saveSettings } from '../db/db';

function Pill({ level }: { level: string }) {
  return <span className={`pill ${level}`}>{level} confidence</span>;
}

export function Overview({ m }: { m: Model }) {
  const { phase, mctq, misalignment: mis, guidance, settings } = m;

  if (!phase) {
    return (
      <div className="card">
        <h2>No estimate yet</h2>
        <p>
          Log a few nights in the <strong>Log</strong> tab. The estimate needs at least one night where you woke up without an alarm; three or more alarm nights
          and four or more alarm-free nights make it worth trusting.
        </p>
        <p className="muted">{mctq.confidence.reasons.join(' ')}</p>
      </div>
    );
  }

  const gap = mis?.gapHours ?? 0;
  const melLogged = m.entries.filter((e) => e.melatoninTime);
  const melClass = melLogged.length ? classifyMelatoninTiming(phase, clockToRel(melLogged[melLogged.length - 1].melatoninTime!)) : null;

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Biological night vs. required schedule</h2>
          <label className="row no-print">
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Required wake
            </span>
            <input type="time" value={settings.requiredWake} onChange={(e) => saveSettings({ requiredWake: e.target.value })} />
          </label>
        </div>
        <Timeline phase={phase} mctq={mctq} mis={mis} guidance={guidance} />
      </div>

      <div className="grid">
        <div className="card stat">
          <span className="label">Gap between required wake and estimated biological wake</span>
          <span className="big" style={{ color: Math.abs(gap) >= 2 ? 'var(--bad)' : Math.abs(gap) >= 1 ? '#b7791f' : 'var(--ok)' }}>
            {gap >= 0 ? formatDuration(gap) : formatDuration(-gap)} {gap >= 0 ? 'early' : 'late'}
          </span>
          <span className="muted">
            Required wake {settings.requiredWake} vs. natural wake ≈ {formatHours(phase.naturalWake)} (average of {mctq.nFree} alarm-free night{mctq.nFree === 1 ? '' : 's'}).
          </span>
          <Pill level={phase.confidence.level} />
        </div>

        <div className="card stat">
          <span className="label">Sleep inertia at required wake</span>
          <span className="big">
            <span className={`pill ${mis?.inertia.level} ${mis?.inertia.level === 'moderate' ? 'inertia-moderate' : ''}`} style={{ fontSize: '1.2rem' }}>
              {mis?.inertia.level ?? '—'}
            </span>
          </span>
          <ul className="tight">
            {mis?.inertia.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {!Number.isNaN(m.grog.alarmMean) && !Number.isNaN(m.grog.naturalMean) && (
            <span className="muted">
              Cross-check from your own log: grogginess averaged {m.grog.alarmMean.toFixed(1)}/5 on alarm mornings vs {m.grog.naturalMean.toFixed(1)}/5 on natural wake mornings.
            </span>
          )}
        </div>

        <div className="card stat">
          <span className="label">Estimated phase markers</span>
          <table>
            <tbody>
              <tr>
                <td>MSFsc (sleep-corrected mid-sleep, free days)</td>
                <td>
                  <strong>{formatHours(mctq.msfsc!)}</strong> <span className="muted">({chronotypeLabel(mctq.msfsc!)})</span>
                </td>
              </tr>
              <tr>
                <td>Estimated DLMO (melatonin onset)</td>
                <td>
                  <strong>{formatHours(phase.dlmo)}</strong> <span className="muted">± {phase.dlmoUncertainty} h</span>
                </td>
              </tr>
              <tr>
                <td>Estimated sleep gate opens</td>
                <td>{formatHours(phase.sleepGate)}</td>
              </tr>
              <tr>
                <td>Estimated core-temperature minimum</td>
                <td>
                  <strong>{formatHours(phase.cbtMin)}</strong>{' '}
                  <span className="muted">{phase.cbtMinSource === 'hr_nadir' ? `(heart-rate nadir, ${m.hrNadir?.nights} night(s))` : '(wake − 2.5 h rule)'}</span>
                </td>
              </tr>
              <tr>
                <td>Estimated melatonin offset</td>
                <td>{formatHours(phase.melatoninOffset)}</td>
              </tr>
              <tr>
                <td>Social jetlag (free − alarm mid-sleep)</td>
                <td>{Number.isNaN(mctq.socialJetlag) ? '—' : formatDuration(mctq.socialJetlag)}</td>
              </tr>
              <tr>
                <td>Sleep-debt correction applied to MSF</td>
                <td>{formatDuration(mctq.debtCorrectionHours)}</td>
              </tr>
            </tbody>
          </table>
          <Pill level={mctq.confidence.level} />
          <details>
            <summary>Why this confidence, and what is assumed</summary>
            <ul className="tight">
              {phase.confidence.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
              {phase.assumptions.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </details>
        </div>
      </div>

      {guidance && (
        <div className="card">
          <h2>Phase-shifting windows ({guidance.direction === 'advance' ? 'to shift earlier' : 'to shift later'})</h2>
          <p className="muted">
            Timing windows derived from the human light and melatonin phase response curves, anchored on the estimated CBTmin and DLMO above. They move
            with the estimate, so they carry the same uncertainty. Timing only; nothing here is a dose or a recommendation to take anything.
          </p>
          {guidance.warnings.map((w) => (
            <div className="banner" key={w}>
              <strong>Watch out:</strong> {w}
            </div>
          ))}
          <div className="windows">
            {guidance.windows.map((w) => (
              <div className="window" key={w.kind} style={{ ['--c' as string]: w.kind === 'light_seek' ? 'var(--light-seek)' : w.kind === 'light_avoid' ? 'var(--light-avoid)' : 'var(--mel)' }}>
                <div>{w.label}</div>
                <div className="time">
                  {formatHours(w.start)} – {formatHours(w.end)}
                </div>
                <small>{w.rationale}</small>
              </div>
            ))}
          </div>
          {melClass && (
            <p style={{ marginTop: 10 }}>
              <strong>Logged melatonin:</strong> last logged at {melLogged[melLogged.length - 1].melatoninTime} on {melLogged[melLogged.length - 1].date}. {melClass.note}
            </p>
          )}
        </div>
      )}
    </>
  );
}
