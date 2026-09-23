// Brix Chat — Analytics: stats, inline SVG charts, CSV export.
import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { downloadCsv, fmtDuration } from '../lib/utils';
import { Button, Card, StatCard } from '../components/ui';

const DAY_MS = 86400000;

function dayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString([], { weekday: 'short' });
}

function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function LineChart({ values, labels }: { values: number[]; labels: string[] }) {
  const W = 640, H = 220, PL = 36, PR = 16, PT = 16, PB = 30;
  const max = Math.max(1, ...values);
  const px = (i: number) => PL + (i / Math.max(1, values.length - 1)) * (W - PL - PR);
  const py = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  const pts = values.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const area = `M${PL},${H - PB} L${pts.split(' ').join(' L')} L${W - PR},${H - PB} Z`;
  const grid = [0, 0.5, 1].map((f) => f * max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Chats per day">
      <defs>
        <linearGradient id="brixLineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid.map((g) => (
        <g key={g}>
          <line x1={PL} x2={W - PR} y1={py(g)} y2={py(g)} stroke="#e2e8f0" strokeDasharray="4 4" />
          <text x={PL - 8} y={py(g) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{Math.round(g)}</text>
        </g>
      ))}
      <path d={area} fill="url(#brixLineFill)" />
      <polyline points={pts} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => (
        <g key={i}>
          <circle cx={px(i)} cy={py(v)} r="4" fill="#4f46e5" stroke="#fff" strokeWidth="2" />
          <text x={px(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="#64748b" fontWeight="600">{labels[i]}</text>
          {v > 0 && <text x={px(i)} y={py(v) - 10} textAnchor="middle" fontSize="11" fill="#334155" fontWeight="700">{v}</text>}
        </g>
      ))}
    </svg>
  );
}

function BarChart({ entries }: { entries: Array<{ label: string; value: number }> }) {
  const W = 640, H = Math.max(160, entries.length * 46 + 30), PL = 130, PR = 40, PT = 10;
  const max = Math.max(1, ...entries.map((e) => e.value));
  const bw = W - PL - PR;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Chats by department">
      <defs>
        <linearGradient id="brixBarFill" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      {entries.map((e, i) => {
        const y = PT + i * 46;
        const w = (e.value / max) * bw;
        return (
          <g key={e.label}>
            <text x={PL - 12} y={y + 22} textAnchor="end" fontSize="12" fill="#475569" fontWeight="600">
              {e.label.length > 18 ? e.label.slice(0, 17) + '…' : e.label}
            </text>
            <rect x={PL} y={y + 8} width={Math.max(2, w)} height="18" rx="9" fill="url(#brixBarFill)" />
            <text x={PL + Math.max(2, w) + 8} y={y + 22} fontSize="12" fill="#334155" fontWeight="700">{e.value}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Analytics() {
  const store = useStore();
  const convs = store.data.conversations;

  const stats = useMemo(() => {
    const responseTimes: number[] = [];
    convs.forEach((c) => {
      const firstVisitor = c.messages.find((m) => m.from === 'visitor');
      const firstReply = c.messages.find((m) => m.from === 'agent' || m.from === 'ai');
      if (firstVisitor && firstReply && firstReply.ts >= firstVisitor.ts) {
        responseTimes.push((firstReply.ts - firstVisitor.ts) / 1000);
      }
    });
    const avgResponse = responseTimes.length
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;
    const rated = convs.filter((c) => c.rating !== undefined);
    const satisfaction = rated.length
      ? (rated.reduce((a, c) => a + (c.rating ?? 0), 0) / rated.length / 5) * 100
      : 0;
    const missed = convs.filter((c) => c.status === 'missed').length;
    return { avgResponse, satisfaction, ratedCount: rated.length, missed };
  }, [convs]);

  const last7 = useMemo(() => {
    const today = dayStart(Date.now());
    const values: number[] = [];
    const labels: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const start = today - i * DAY_MS;
      const end = start + DAY_MS;
      values.push(convs.filter((c) => c.createdAt >= start && c.createdAt < end).length);
      labels.push(i === 0 ? 'Today' : dayLabel(start));
    }
    return { values, labels };
  }, [convs]);

  const byDept = useMemo(() => {
    const map = new Map<string, number>();
    convs.forEach((c) => map.set(c.department, (map.get(c.department) ?? 0) + 1));
    return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [convs]);

  const exportCsv = () => {
    const rows: string[][] = [
      ['id', 'visitor', 'email', 'country', 'status', 'department', 'agent', 'messages', 'created', 'rating'],
      ...convs.map((c) => [
        c.id, c.visitor, c.email ?? '', c.country, c.status, c.department, c.agent ?? '',
        String(c.messages.length), new Date(c.createdAt).toISOString(), c.rating !== undefined ? String(c.rating) : '',
      ]),
    ];
    downloadCsv('brix-analytics.csv', rows);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-extrabold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Last 7 days · updated {new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </p>
        </div>
        <Button variant="secondary" onClick={exportCsv}>⬇ Export CSV</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total conversations" value={String(convs.length)} icon="💬" tone="indigo" />
        <StatCard label="Avg first response" value={stats.avgResponse ? fmtDuration(stats.avgResponse) : '—'} icon="⚡" tone="cyan" />
        <StatCard label="Satisfaction" value={stats.ratedCount ? `${Math.round(stats.satisfaction)}%` : '—'} icon="⭐" tone="green"
          delta={stats.ratedCount ? `${stats.ratedCount} rated` : undefined} />
        <StatCard label="Missed chats" value={String(stats.missed)} icon="📵" tone="rose" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="font-semibold text-slate-900 mb-1">Conversations per day</div>
          <div className="text-xs text-slate-500 mb-3">Derived from conversation creation dates</div>
          <LineChart values={last7.values} labels={last7.labels} />
        </Card>
        <Card className="p-5">
          <div className="font-semibold text-slate-900 mb-1">Conversations by department</div>
          <div className="text-xs text-slate-500 mb-3">All time</div>
          {byDept.length ? <BarChart entries={byDept} /> : <div className="text-sm text-slate-400 py-8 text-center">No data yet.</div>}
        </Card>
      </div>
    </div>
  );
}
