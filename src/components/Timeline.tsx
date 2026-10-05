import type { Misalignment, PhaseEstimate } from '../lib/phase';
import type { GuidanceResult } from '../lib/prc';
import type { MctqResult } from '../lib/msfsc';
import { formatHours } from '../lib/time';

const W = 960;
const PAD_L = 8;
const PAD_R = 8;
const INNER = W - PAD_L - PAD_R;

/** Map relative hours (-12..12, noon to noon) to x. */
function x(rel: number): number {
  return PAD_L + ((rel + 12) / 24) * INNER;
}

/** Split [start, end] (hours, start in (-12,12]) into on-screen segments. */
function segments(start: number, end: number): [number, number][] {
  let s = start;
  while (s > 12) s -= 24;
  while (s <= -12) s += 24;
  const e = s + (end - start);
  if (e <= 12) return [[s, e]];
  return [
    [s, 12],
    [-12, e - 24],
  ];
}

interface Props {
  phase: PhaseEstimate;
  mctq: MctqResult;
  mis: Misalignment | null;
  guidance: GuidanceResult | null;
}

export function Timeline({ phase, mctq, mis, guidance }: Props) {
  const rows = {
    night: 34,
    free: 78,
    work: 104,
    guide: 140,
  };
  const GUIDE_ROW = 22;
  const H = guidance ? rows.guide + guidance.windows.length * GUIDE_ROW : 130;
  const band = (start: number, end: number, y: number, h: number, fill: string, opacity = 1, key = '') =>
    segments(start, end).map(([a, b], i) => <rect key={key + i} x={x(a)} y={y} width={Math.max(1, x(b) - x(a))} height={h} fill={fill} opacity={opacity} rx={3} />);

  const marker = (rel: number, label: string, color: string, dy: number) => (
    <g>
      <line x1={x(rel)} x2={x(rel)} y1={18} y2={H - 14} stroke={color} strokeWidth={2} strokeDasharray={label.startsWith('Required') ? '' : '4 3'} />
      <text x={x(rel) + 4} y={dy} fontSize={11} fill={color} fontWeight={600}>
        {label} {formatHours(rel)}
      </text>
    </g>
  );

  const guideColor: Record<string, string> = { light_seek: 'var(--light-seek)', light_avoid: 'var(--light-avoid)', melatonin_zone: 'var(--mel)' };

  return (
    <div>
      <svg className="timeline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="24-hour timeline of estimated biological night, sleep windows and required wake time">
        {/* hour grid */}
        {Array.from({ length: 25 }, (_, i) => i - 12).map((h) => (
          <g key={h}>
            <line x1={x(h)} x2={x(h)} y1={14} y2={H - 14} stroke="var(--line)" strokeWidth={h % 6 === 0 ? 1.5 : 0.5} />
            {h % 3 === 0 && (
              <text x={x(h)} y={10} fontSize={10} textAnchor={h === -12 ? 'start' : h === 12 ? 'end' : 'middle'} fill="var(--muted)">
                {formatHours(h)}
              </text>
            )}
          </g>
        ))}

        {/* biological night with uncertainty halo */}
        {band(phase.biologicalNight.start - phase.dlmoUncertainty, phase.biologicalNight.end + phase.dlmoUncertainty, rows.night - 10, 30, 'var(--night)', 0.18, 'halo')}
        {band(phase.biologicalNight.start, phase.biologicalNight.end, rows.night - 6, 22, 'var(--night)', 0.75, 'night')}
        <text x={x(phase.biologicalNight.start) + 6} y={rows.night + 9} fontSize={11} fill="white">
          est. melatonin window {formatHours(phase.dlmo)}–{formatHours(phase.melatoninOffset)} (±{phase.dlmoUncertainty} h)
        </text>

        {/* sleep windows */}
        {mctq.nFree > 0 && band(mctq.freeOnsetMean, mctq.freeWakeMean, rows.free - 8, 18, 'var(--sleep)', 0.8, 'free')}
        {mctq.nFree > 0 && (
          <text x={x(mctq.freeOnsetMean) + 6} y={rows.free + 5} fontSize={11} fill="white">
            free-day sleep (avg of {mctq.nFree})
          </text>
        )}
        {mctq.nWork > 0 && band(mctq.workOnsetMean, mctq.workWakeMean, rows.work - 8, 18, 'var(--sleep)', 0.45, 'work')}
        {mctq.nWork > 0 && (
          <text x={x(mctq.workOnsetMean) + 6} y={rows.work + 5} fontSize={11} fill="var(--text)">
            alarm-day sleep (avg of {mctq.nWork})
          </text>
        )}

        {/* guidance windows */}
        {guidance &&
          guidance.windows.map((w, i) => (
            <g key={w.kind}>
              {band(w.start, w.end, rows.guide - 8 + i * GUIDE_ROW, 16, guideColor[w.kind], 0.8, w.kind)}
              {(() => {
                const [a, b] = segments(w.start, w.end)[0];
                const narrow = x(b) - x(a) < 150;
                return (
                  <text x={narrow ? x(b) + 4 : x(a) + 4} y={rows.guide + 4 + i * GUIDE_ROW} fontSize={10} fill={narrow ? 'var(--text)' : 'white'}>
                    {w.label}
                  </text>
                );
              })()}
            </g>
          ))}

        {marker(phase.cbtMin, 'est. CBTmin', 'var(--cbt)', rows.free - 16)}
        {mis && marker(mis.requiredWake, 'Required wake', 'var(--wake)', rows.work - 16 + 36)}
      </svg>
      <div className="legend">
        <span style={{ ['--c' as string]: 'var(--night)' }}>Estimated biological night (melatonin elevated); pale halo = ±{phase.dlmoUncertainty} h uncertainty</span>
        <span style={{ ['--c' as string]: 'var(--sleep)' }}>Your logged sleep</span>
        <span style={{ ['--c' as string]: 'var(--cbt)' }}>Estimated core-temperature minimum</span>
        <span style={{ ['--c' as string]: 'var(--wake)' }}>Required wake</span>
        {guidance && <span style={{ ['--c' as string]: 'var(--light-seek)' }}>Seek bright light</span>}
        {guidance && <span style={{ ['--c' as string]: 'var(--light-avoid)' }}>Avoid bright light</span>}
        {guidance && <span style={{ ['--c' as string]: 'var(--mel)' }}>Melatonin PRC zone (timing only)</span>}
      </div>
    </div>
  );
}
