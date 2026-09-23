// Brix Chat — rich stat card with sparkline + delta, and a standalone sparkline.

import { useId } from 'react';
import { cx } from '../../lib/utils';
import { Card } from '../ui';

const TONES: Record<string, string> = {
  indigo: 'bg-brix-100 text-brix-600',
  green: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
  rose: 'bg-rose-100 text-rose-600',
  cyan: 'bg-cyan-100 text-cyan-600',
};

export function Sparkline({
  values,
  className,
  stroke = '#4f46e5',
  fill = true,
}: {
  values: number[];
  className?: string;
  stroke?: string;
  fill?: boolean;
}) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const W = 120;
  const H = 36;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const px = (i: number) => (i / Math.max(1, values.length - 1)) * W;
  const py = (v: number) => H - 3 - ((v - min) / (max - min || 1)) * (H - 8);
  const pts = values.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const area = `M0,${H} L${pts.split(' ').join(' L')} L${W},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cx('w-28 h-9', className)} aria-hidden="true">
      <defs>
        <linearGradient id={`spk-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#spk-${gid})`} />}
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {values.length > 0 && (
        <circle cx={px(values.length - 1)} cy={py(values[values.length - 1])} r="2.5" fill={stroke} />
      )}
    </svg>
  );
}

export function Stat({
  label,
  value,
  delta,
  deltaUp,
  icon,
  tone = 'indigo',
  spark,
  sparkStroke,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaUp?: boolean;
  icon: string;
  tone?: 'indigo' | 'green' | 'amber' | 'rose' | 'cyan';
  spark?: number[];
  sparkStroke?: string;
}) {
  return (
    <Card className="p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
          <div className="mt-1.5 text-3xl font-display font-extrabold text-slate-900 tabular-nums">{value}</div>
          {delta && (
            <div
              className={cx(
                'mt-1.5 text-xs font-semibold inline-flex items-center gap-1',
                deltaUp === undefined ? 'text-slate-500' : deltaUp ? 'text-emerald-600' : 'text-rose-600',
              )}
            >
              {deltaUp !== undefined && <span>{deltaUp ? '▲' : '▼'}</span>}
              {delta}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className={cx('w-10 h-10 rounded-xl grid place-items-center text-lg', TONES[tone])}>{icon}</div>
          {spark && spark.length > 1 && <Sparkline values={spark} stroke={sparkStroke} />}
        </div>
      </div>
    </Card>
  );
}
