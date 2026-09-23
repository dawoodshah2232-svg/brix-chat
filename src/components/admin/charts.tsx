// Brix Chat — lightweight hand-rolled SVG charts for the admin area.
// No dependencies; brand palette (brix crimson + cyan).

import { cx } from '../../lib/utils';

export const BRAND = {
  brix: '#e11d48', // brix-600
  brixDark: '#be123c', // brix-700
  brixLight: '#fecdd3', // brix-200
  cyan: '#22d3ee',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  slate: '#94a3b8',
  ink: '#0f172a',
};

function points(values: number[], w: number, h: number, pad: number): string {
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const n = values.length;
  return values
    .map((v, i) => {
      const x = n === 1 ? w / 2 : pad + (i / (n - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Tiny trend line for metric cards. */
export function Sparkline({
  values,
  width = 96,
  height = 30,
  color = BRAND.brix,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}) {
  if (values.length === 0) return <span className={cx('text-xs text-slate-300', className)}>—</span>;
  const pad = 3;
  const pts = points(values, width, height, pad);
  const max = Math.max(1, ...values);
  const baseline = (height - pad - ((0 - Math.min(0, ...values)) / (max - Math.min(0, ...values) || 1)) * (height - pad * 2)).toFixed(1);
  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      <polyline points={`${pad},${baseline} ${width - pad},${baseline}`} stroke="#e2e8f0" strokeWidth="1" />
      <polygon points={`${pad},${height - pad} ${pts} ${width - pad},${height - pad}`} fill={color} opacity="0.15" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {values.length > 0 && (
        <circle
          cx={Number(pts.split(' ').pop()!.split(',')[0])}
          cy={Number(pts.split(' ').pop()!.split(',')[1])}
          r="3"
          fill={color}
          stroke="#fff"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}

/** Labeled line chart with gridlines + tooltips (SVG title). */
export function LineChart({
  series,
  labels,
  height = 180,
  className,
}: {
  series: Array<{ name: string; color: string; values: number[] }>;
  labels: string[];
  height?: number;
  className?: string;
}) {
  const n = Math.max(1, ...series.map((s) => s.values.length));
  const W = 560;
  const H = height;
  const padL = 8;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const xAt = (i: number) => (n === 1 ? W / 2 : padL + (i / (n - 1)) * (W - padL - padR));
  const yAt = (v: number) => H - padB - (v / max) * (H - padT - padB);
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Line chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={yAt(t)} y2={yAt(t)} stroke="#eef2f7" strokeWidth="1" />
            <text x={padL + 2} y={yAt(t) - 3} fontSize="9" fill="#94a3b8" fontFamily="monospace">{t}</text>
          </g>
        ))}
        {series.map((s) => {
          const pts = s.values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
          const area = `${padL},${H - padB} ${pts} ${xAt(s.values.length - 1).toFixed(1)},${H - padB}`;
          return (
            <g key={s.name}>
              <polygon points={area} fill={s.color} opacity="0.08" />
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {s.values.map((v, i) => (
                <circle key={i} cx={xAt(i)} cy={yAt(v)} r="3.5" fill={s.color} stroke="#fff" strokeWidth="1.5">
                  <title>{s.name} · {labels[i] ?? ''}: {v}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {labels.map((l, i) =>
          i % Math.ceil(n / 8) === 0 ? (
            <text key={i} x={xAt(i)} y={H - 6} fontSize="9" fill="#94a3b8" textAnchor="middle" fontFamily="monospace">
              {l}
            </text>
          ) : null,
        )}
      </svg>
      {series.length > 1 && (
        <div className="flex gap-4 mt-2">
          {series.map((s) => (
            <span key={s.name} className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Vertical bar chart with value labels + tooltips. */
export function BarChart({
  data,
  height = 180,
  className,
  color = BRAND.brix,
}: {
  data: Array<{ label: string; value: number; color?: string; title?: string }>;
  height?: number;
  className?: string;
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={className}>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0 h-full justify-end" title={d.title ?? `${d.label}: ${d.value}`}>
            <span className="text-[10px] font-bold text-slate-500 font-mono">{d.value}</span>
            <div
              className="w-full rounded-t-md transition-all"
              style={{
                height: `${Math.max(4, (d.value / max) * 100)}%`,
                background: `linear-gradient(to top, ${d.color ?? color}cc, ${d.color ?? color})`,
                opacity: d.value === 0 ? 0.25 : 1,
              }}
            />
            <span className="text-[10px] text-slate-400 font-mono truncate w-full text-center">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Donut chart with center label and legend. */
export function Donut({
  segments,
  size = 150,
  thickness = 22,
  centerLabel,
  centerValue,
  className,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  className?: string;
}) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className={cx('flex items-center gap-5', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
          {segments.map((s) => {
            const frac = s.value / total;
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${(frac * c).toFixed(1)} ${c.toFixed(1)}`}
                strokeDashoffset={(-acc * c).toFixed(1)}
                strokeLinecap="butt"
              >
                <title>{s.label}: {s.value}</title>
              </circle>
            );
            acc += frac;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            {centerValue && <div className="text-2xl font-black text-slate-900">{centerValue}</div>}
            {centerLabel && <div className="text-[11px] font-semibold text-slate-400">{centerLabel}</div>}
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-[13px]">
            <span className="w-3 h-3 rounded-sm" style={{ background: s.color }} />
            <span className="font-bold text-slate-800">{s.value}</span>
            <span className="text-slate-500">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Circular progress ring (0–100%). */
export function ProgressRing({
  pct,
  size = 72,
  thickness = 8,
  className,
}: {
  pct: number; // 0..100
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className={cx('relative', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={p >= 100 ? BRAND.emerald : BRAND.brix}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${((p / 100) * c).toFixed(1)} ${c.toFixed(1)}`}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-sm font-black text-slate-900">{Math.round(p)}%</span>
      </div>
    </div>
  );
}
