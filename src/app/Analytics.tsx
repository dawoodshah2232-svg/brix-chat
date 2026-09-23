// Brix Chat — Analytics: funnel, leaderboard, SLA, CSAT, date presets, per-section CSV.

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { getApi } from '../lib/api';
import type { ApiGoal, ApiTicket } from '../lib/api';
import { downloadCsv, fmtDuration, timeAgo } from '../lib/utils';
import { Card, StatCard } from '../components/ui';
import { cx } from '../lib/utils';

const DAY_MS = 86400000;

type Preset = '7d' | '30d' | '90d' | 'all';
const PRESETS: Array<{ id: Preset; label: string; days: number | null }> = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
];

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
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bar chart">
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

function FunnelBar({ label, value, pct, tone }: { label: string; value: number; pct: number; tone: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="tabular-nums font-bold text-slate-900">{value.toLocaleString()} <span className="text-xs font-medium text-slate-400">{pct}%</span></span>
      </div>
      <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
        <div className={cx('h-full rounded-full transition-all', tone)} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}

function SectionHead({ title, hint, onCsv }: { title: string; hint: string; onCsv: () => void }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <div className="font-semibold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{hint}</div>
      </div>
      <button onClick={onCsv} className="text-xs font-semibold text-slate-400 hover:text-brix-600 transition" title="Download this section as CSV">
        ⬇ CSV
      </button>
    </div>
  );
}

export default function Analytics() {
  const store = useStore();
  const { session, effectiveWorkspaceId } = store;
  const [preset, setPreset] = useState<Preset>('30d');
  const [goals, setGoals] = useState<ApiGoal[]>([]);
  const [tickets, setTickets] = useState<ApiTicket[]>([]);

  const days = PRESETS.find((p) => p.id === preset)?.days ?? null;
  const since = days ? Date.now() - days * DAY_MS : 0;

  useEffect(() => {
    if (!session) return;
    const api = getApi(effectiveWorkspaceId(), session.displayName);
    api.goals.list().then(({ data }) => setGoals(data)).catch(() => {});
    api.tickets.list({ limit: 500 }).then(({ data }) => setTickets(data.items)).catch(() => {});
  }, [session]);

  const convs = useMemo(
    () => store.data.conversations.filter((c) => c.createdAt >= since),
    [store.data.conversations, since],
  );
  const visitors = useMemo(
    // Visitor records carry no timestamp in local mode — funnel uses the full visitor list.
    () => store.data.visitors,
    [store.data.visitors],
  );

  const response = useMemo(() => {
    const times: number[] = [];
    convs.forEach((c) => {
      const firstVisitor = c.messages.find((m) => m.from === 'visitor');
      const firstReply = c.messages.find((m) => m.from === 'agent' || m.from === 'ai');
      if (firstVisitor && firstReply && firstReply.ts >= firstVisitor.ts) {
        times.push((firstReply.ts - firstVisitor.ts) / 1000);
      }
    });
    times.sort((a, b) => a - b);
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const median = times.length ? times[Math.floor(times.length / 2)] : 0;
    return { avg, median, n: times.length };
  }, [convs]);

  const csat = useMemo(() => {
    const rated = convs.filter((c) => c.rating !== undefined);
    const dist = [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: rated.filter((c) => c.rating === s).length }));
    const pct = rated.length ? Math.round((rated.reduce((a, c) => a + (c.rating ?? 0), 0) / rated.length / 5) * 100) : 0;
    return { rated: rated.length, pct, dist };
  }, [convs]);

  const funnel = useMemo(() => {
    const chats = convs.length;
    const resolved = convs.filter((c) => c.status === 'closed').length;
    const rated = convs.filter((c) => c.rating !== undefined).length;
    const v = Math.max(1, visitors.length);
    return [
      { label: '🌐 Visitors', value: visitors.length, pct: 100 },
      { label: '💬 Chats started', value: chats, pct: Math.round((chats / v) * 100) },
      { label: '✅ Chats resolved', value: resolved, pct: Math.round((resolved / v) * 100) },
      { label: '⭐ CSAT rated', value: rated, pct: Math.round((rated / v) * 100) },
    ];
  }, [convs, visitors]);

  const leaderboard = useMemo(() => {
    const map = new Map<string, { chats: number; resolved: number; ratings: number[]; resp: number[] }>();
    convs.forEach((c) => {
      const name = c.agent && c.agent !== 'Unassigned' ? c.agent : 'Unassigned';
      const e = map.get(name) ?? { chats: 0, resolved: 0, ratings: [], resp: [] };
      e.chats += 1;
      if (c.status === 'closed') e.resolved += 1;
      if (c.rating !== undefined) e.ratings.push(c.rating);
      const fv = c.messages.find((m) => m.from === 'visitor');
      const fr = c.messages.find((m) => m.from === 'agent' || m.from === 'ai');
      if (fv && fr && fr.ts >= fv.ts) e.resp.push((fr.ts - fv.ts) / 1000);
      map.set(name, e);
    });
    return [...map.entries()]
      .map(([name, e]) => ({
        name,
        chats: e.chats,
        resolution: e.chats ? Math.round((e.resolved / e.chats) * 100) : 0,
        csat: e.ratings.length ? Math.round((e.ratings.reduce((a, b) => a + b, 0) / e.ratings.length / 5) * 100) : null,
        avgResp: e.resp.length ? e.resp.reduce((a, b) => a + b, 0) / e.resp.length : null,
      }))
      .sort((a, b) => b.chats - a.chats);
  }, [convs]);

  const sla = useMemo(() => {
    const now = Date.now();
    const withSla = tickets.filter((t) => t.sla_due);
    const open = withSla.filter((t) => t.status !== 'resolved');
    const breached = open.filter((t) => Date.parse(t.sla_due!) < now);
    const atRisk = open.filter((t) => {
      const d = Date.parse(t.sla_due!) - now;
      return d >= 0 && d < 24 * 3600000;
    });
    return { total: withSla.length, breached: breached.length, atRisk: atRisk.length, onTrack: open.length - breached.length - atRisk.length };
  }, [tickets]);

  const daily = useMemo(() => {
    const n = Math.min(days ?? 30, 30);
    const today = dayStart(Date.now());
    const values: number[] = [];
    const labels: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const start = today - i * DAY_MS;
      const end = start + DAY_MS;
      values.push(convs.filter((c) => c.createdAt >= start && c.createdAt < end).length);
      labels.push(i === 0 ? 'Today' : dayLabel(start));
    }
    return { values, labels };
  }, [convs, days]);

  const byDept = useMemo(() => {
    const map = new Map<string, number>();
    convs.forEach((c) => map.set(c.department, (map.get(c.department) ?? 0) + 1));
    return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [convs]);

  // P4-18: bot handling + drop-off analytics.
  // Drop-off = visitor wrote, nobody (agent or AI) ever replied, and it isn't a "missed" chat.
  const botStats = useMemo(() => {
    const aiHandled = convs.filter((c) => c.aiHandled);
    const withVisitor = convs.filter((c) => c.messages.some((m) => m.from === 'visitor'));
    const dropoffs = withVisitor.filter(
      (c) => c.status !== 'missed' && !c.messages.some((m) => m.from === 'agent' || m.from === 'ai'),
    );
    const avgMsgs = dropoffs.length
      ? dropoffs.reduce((n, c) => n + c.messages.filter((m) => m.from === 'visitor').length, 0) / dropoffs.length
      : 0;
    return {
      aiHandled: aiHandled.length,
      dropoffs,
      dropRate: withVisitor.length ? Math.round((dropoffs.length / withVisitor.length) * 100) : 0,
      avgMsgs: Math.round(avgMsgs * 10) / 10,
    };
  }, [convs]);

  const csv = {
    conversations: () => downloadCsv('brix-conversations.csv', [
      ['id', 'visitor', 'country', 'status', 'department', 'agent', 'priority', 'messages', 'created', 'rating'],
      ...convs.map((c) => [c.id, c.visitor, c.country, c.status, c.department, c.agent ?? '', c.priority ?? 'medium', String(c.messages.length), new Date(c.createdAt).toISOString(), c.rating !== undefined ? String(c.rating) : '']),
    ]),
    funnel: () => downloadCsv('brix-funnel.csv', [
      ['stage', 'count', 'pct_of_visitors'],
      ...funnel.map((f) => [f.label, String(f.value), String(f.pct)]),
    ]),
    leaderboard: () => downloadCsv('brix-leaderboard.csv', [
      ['agent', 'chats', 'resolution_pct', 'csat_pct', 'avg_first_response_sec'],
      ...leaderboard.map((l) => [l.name, String(l.chats), String(l.resolution), l.csat === null ? '' : String(l.csat), l.avgResp === null ? '' : String(Math.round(l.avgResp))]),
    ]),
    dropoff: () => downloadCsv('brix-dropoff.csv', [
      ['id', 'visitor', 'status', 'department', 'ai_handled', 'visitor_messages', 'created'],
      ...botStats.dropoffs.map((c) => [c.id, c.visitor, c.status, c.department, c.aiHandled ? 'yes' : 'no',
        String(c.messages.filter((m) => m.from === 'visitor').length), new Date(c.createdAt).toISOString()]),
    ]),
    csat: () => downloadCsv('brix-csat.csv', [
      ['stars', 'count'],
      ...csat.dist.map((d) => [String(d.stars), String(d.count)]),
    ]),
    sla: () => downloadCsv('brix-sla.csv', [
      ['id', 'subject', 'status', 'priority', 'sla_due', 'breached'],
      ...tickets.filter((t) => t.sla_due).map((t) => [t.id, t.subject, t.status, t.priority, t.sla_due!, t.status !== 'resolved' && Date.parse(t.sla_due!) < Date.now() ? 'yes' : 'no']),
    ]),
    goals: () => downloadCsv('brix-goals.csv', [
      ['name', 'event', 'revenue'],
      ...goals.map((g) => [g.name, g.event, String(g.revenue)]),
    ]),
  };

  const presetLabel = PRESETS.find((p) => p.id === preset)?.label ?? '';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-display font-extrabold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Last {presetLabel.toLowerCase()} · {convs.length} conversations</p>
        </div>
        <div className="flex rounded-xl border border-slate-200 p-0.5 bg-white text-xs font-semibold">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => setPreset(p.id)}
              className={cx('px-3.5 py-1.5 rounded-lg transition', preset === p.id ? 'bg-ink-950 text-white' : 'text-slate-500 hover:text-slate-800')}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total conversations" value={String(convs.length)} icon="💬" tone="indigo" />
        <StatCard label="Avg first response" value={response.n ? fmtDuration(response.avg) : '—'} icon="⚡" tone="cyan"
          delta={response.n ? `median ${fmtDuration(response.median)}` : undefined} />
        <StatCard label="Satisfaction" value={csat.rated ? `${csat.pct}%` : '—'} icon="⭐" tone="green"
          delta={csat.rated ? `${csat.rated} rated` : undefined} />
        <StatCard label="Missed chats" value={String(convs.filter((c) => c.status === 'missed').length)} icon="📵" tone="rose" />
        <StatCard label="Chat drop-offs" value={String(botStats.dropoffs.length)} icon="🏃" tone="amber"
          delta={botStats.dropRate ? `${botStats.dropRate}% of chats` : undefined} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <SectionHead title="Conversion funnel" hint="Visitors → chats → resolved → rated" onCsv={csv.funnel} />
          <div className="space-y-4">
            {funnel.map((f, i) => (
              <FunnelBar key={f.label} label={f.label} value={f.value} pct={f.pct}
                tone={['bg-cyan-500', 'bg-brix-600', 'bg-emerald-500', 'bg-amber-400'][i]} />
            ))}
          </div>
          {goals.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Tracked goals</div>
                <button onClick={csv.goals} className="text-xs font-semibold text-slate-400 hover:text-brix-600">⬇ CSV</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {goals.map((g) => (
                  <span key={g.id} className="px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
                    🏁 {g.name} <span className="text-slate-400">· {g.event} · ${g.revenue}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionHead title="Agent leaderboard" hint="Chats, resolution rate, CSAT, response" onCsv={csv.leaderboard} />
          {leaderboard.length === 0 ? (
            <div className="text-sm text-slate-400 py-8 text-center">No data yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="py-2 font-semibold">Agent</th>
                    <th className="py-2 font-semibold text-right">Chats</th>
                    <th className="py-2 font-semibold text-right">Resolved</th>
                    <th className="py-2 font-semibold text-right">CSAT</th>
                    <th className="py-2 font-semibold text-right">1st resp.</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((l, i) => (
                    <tr key={l.name} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 font-semibold text-slate-800">
                        <span className="mr-2 text-xs font-extrabold text-slate-400">#{i + 1}</span>{l.name}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{l.chats}</td>
                      <td className="py-2.5 text-right tabular-nums">{l.resolution}%</td>
                      <td className="py-2.5 text-right tabular-nums">{l.csat === null ? '—' : `${l.csat}%`}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-500">{l.avgResp === null ? '—' : fmtDuration(l.avgResp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionHead title="SLA & response" hint="Ticket SLA status + first-response distribution" onCsv={csv.sla} />
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl bg-rose-50 border border-rose-100 p-3 text-center">
              <div className="text-2xl font-extrabold text-rose-600">{sla.breached}</div>
              <div className="text-xs text-rose-700 font-medium">Breached</div>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
              <div className="text-2xl font-extrabold text-amber-600">{sla.atRisk}</div>
              <div className="text-xs text-amber-700 font-medium">At risk &lt;24h</div>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
              <div className="text-2xl font-extrabold text-emerald-600">{sla.onTrack}</div>
              <div className="text-xs text-emerald-700 font-medium">On track</div>
            </div>
          </div>
          <div className="text-sm text-slate-600 space-y-1.5">
            <div className="flex justify-between"><span>Avg first response</span><span className="font-bold">{response.n ? fmtDuration(response.avg) : '—'}</span></div>
            <div className="flex justify-between"><span>Median first response</span><span className="font-bold">{response.n ? fmtDuration(response.median) : '—'}</span></div>
            <div className="flex justify-between"><span>Tickets with SLA set</span><span className="font-bold">{sla.total}</span></div>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHead title="CSAT breakdown" hint="Post-chat satisfaction ratings" onCsv={csv.csat} />
          {csat.rated === 0 ? (
            <div className="text-sm text-slate-400 py-8 text-center">No ratings yet.</div>
          ) : (
            <div className="space-y-2.5">
              {csat.dist.map((d) => (
                <div key={d.stars} className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-600 w-10">{d.stars} ⭐</span>
                  <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${(d.count / Math.max(1, csat.rated)) * 100}%` }} />
                  </div>
                  <span className="text-sm tabular-nums font-bold text-slate-800 w-8 text-right">{d.count}</span>
                </div>
              ))}
              <div className="text-sm text-slate-500 pt-1">Overall satisfaction: <span className="font-bold text-slate-900">{csat.pct}%</span> from {csat.rated} ratings</div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionHead title="Bot & drop-off" hint="AI-handled chats, handoff, and visitors who left unanswered" onCsv={csv.dropoff} />
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-center">
              <div className="text-2xl font-extrabold text-indigo-600">{botStats.aiHandled}</div>
              <div className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wide mt-0.5">AI-handled</div>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
              <div className="text-2xl font-extrabold text-amber-600">{botStats.dropoffs.length}</div>
              <div className="text-[11px] font-semibold text-amber-500 uppercase tracking-wide mt-0.5">Drop-offs</div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
              <div className="text-2xl font-extrabold text-slate-700">{botStats.avgMsgs}</div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">Msgs / drop-off</div>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Drop-off = visitor wrote but no agent or AI ever replied ({botStats.dropRate}% of chats with visitor messages).
            Low-confidence replies are routed to a human at the threshold set in Settings → Bot &amp; handoff.
          </p>
          {botStats.dropoffs.length === 0 ? (
            <div className="text-sm text-slate-400 py-4 text-center">No drop-offs in this period. 🎉</div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto slim-scroll">
              {botStats.dropoffs.slice(0, 8).map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-slate-800 truncate">{c.visitor}</span>
                  <span className="text-xs text-slate-400">
                    {c.messages.filter((m) => m.from === 'visitor').length} msg{c.messages.filter((m) => m.from === 'visitor').length === 1 ? '' : 's'} · {c.department} · {timeAgo(c.createdAt)}
                  </span>
                  {c.aiHandled && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600">AI</span>}
                </div>
              ))}
              {botStats.dropoffs.length > 8 && (
                <div className="text-xs text-slate-400">+ {botStats.dropoffs.length - 8} more — download CSV for the full list.</div>
              )}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionHead title="Conversations per day" hint={`Last ${Math.min(days ?? 30, 30)} days`} onCsv={csv.conversations} />
          <LineChart values={daily.values} labels={daily.labels} />
        </Card>
        <Card className="p-5">
          <SectionHead title="Conversations by department" hint={presetLabel} onCsv={csv.conversations} />
          {byDept.length ? <BarChart entries={byDept} /> : <div className="text-sm text-slate-400 py-8 text-center">No data yet.</div>}
        </Card>
      </div>
    </div>
  );
}
