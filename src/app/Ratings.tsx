// Brix Chat — Ratings: the client's CSAT/NPS dashboard — trend, per-agent
// averages, comment feed, and low-score alerts.

import { useEffect, useMemo, useState } from 'react';
import { Card, Select, Badge, EmptyState } from '../components/ui';
import { useClientApi } from '../components/dashboard/useClientApi';
import { Stat } from '../components/dashboard/Stat';
import type { ApiRating, ApiProperty, ApiMember } from '../lib/api';
import { timeAgo, cx } from '../lib/utils';

export default function Ratings() {
  const { api } = useClientApi();
  const [props, setProps] = useState<ApiProperty[]>([]);
  const [propId, setPropId] = useState('');
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [ratings, setRatings] = useState<ApiRating[]>([]);
  const [summary, setSummary] = useState<{ csat_avg: number | null; csat_count: number; nps_score: number | null; nps_count: number; promoters: number; passives: number; detractors: number; trend: Array<{ day: string; csat_avg: number | null; nps_avg: number | null; count: number }> } | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (!api) return;
    Promise.all([api.properties.list(), api.members.list()]).then(([{ data: p }, { data: m }]) => {
      setProps(p);
      setMembers(m);
      if (p.length && !propId) setPropId(p[0].id);
    }).catch(() => {});
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!api || !propId) return;
    api.ratings.summary(propId, days).then(({ data }) => setSummary(data)).catch(() => setSummary(null));
    api.ratings.list({ property_id: propId, limit: 100 }).then(({ data }) => setRatings(data.items)).catch(() => setRatings([]));
  }, [api, propId, days]);

  const agentName = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? 'Unassigned';

  const perAgent = useMemo(() => {
    const map = new Map<string, { csat: number[]; nps: number[] }>();
    for (const r of ratings) {
      const key = r.agent_id ?? 'none';
      if (!map.has(key)) map.set(key, { csat: [], nps: [] });
      const e = map.get(key)!;
      (r.kind === 'csat' ? e.csat : e.nps).push(r.score);
    }
    return [...map.entries()].map(([id, v]) => ({
      id,
      name: agentName(id === 'none' ? null : id),
      csat: v.csat.length ? v.csat.reduce((a, b) => a + b, 0) / v.csat.length : null,
      nps: v.nps.length ? v.nps.reduce((a, b) => a + b, 0) / v.nps.length : null,
      count: v.csat.length + v.nps.length,
    })).sort((a, b) => b.count - a.count);
  }, [ratings]); // eslint-disable-line react-hooks/exhaustive-deps

  const alerts = useMemo(
    () => ratings.filter((r) => (r.kind === 'csat' && r.score <= 2) || (r.kind === 'nps' && r.score <= 6)).slice(0, 10),
    [ratings],
  );

  const trendMax = Math.max(1, ...(summary?.trend.map((t) => t.count) ?? [1]));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Ratings</h1>
          <p className="text-sm text-slate-500 mt-1">How visitors rate their support experience.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={propId} onChange={(e) => setPropId(e.target.value)} className="min-w-44">
            {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </Select>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="CSAT average" icon="😊" value={summary?.csat_avg != null ? `${summary.csat_avg.toFixed(1)} / 5` : '—'} delta={`${summary?.csat_count ?? 0} responses`} spark={summary?.trend.map((t) => t.csat_avg ?? 0)} />
        <Stat label="NPS score" icon="📊" value={summary?.nps_score != null ? String(Math.round(summary.nps_score)) : '—'} delta={`${summary?.nps_count ?? 0} responses`} spark={summary?.trend.map((t) => t.nps_avg ?? 0)} tone={summary?.nps_score != null && summary.nps_score < 0 ? 'rose' : 'green'} />
        <Stat label="Promoters" icon="👍" value={String(summary?.promoters ?? 0)} delta="scored 9–10" tone="green" />
        <Stat label="Detractors" icon="👎" value={String(summary?.detractors ?? 0)} delta="scored 0–6" tone="rose" />
      </div>

      <Card className="p-6">
        <h2 className="font-bold text-slate-900 mb-4">Response volume</h2>
        {summary && summary.trend.some((t) => t.count > 0) ? (
          <div className="flex items-end gap-1 h-28">
            {summary.trend.map((t) => (
              <div key={t.day} className="flex-1 flex flex-col justify-end h-full group relative" title={`${t.day}: ${t.count} responses`}>
                <div className="rounded-t bg-brix-500/80 group-hover:bg-brix-600 transition-all" style={{ height: `${Math.max(3, (t.count / trendMax) * 100)}%` }} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No responses in this period yet.</p>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <Card className="p-6">
          <h2 className="font-bold text-slate-900 mb-4">Per agent</h2>
          {perAgent.length === 0 ? (
            <p className="text-sm text-slate-400">No rated conversations yet.</p>
          ) : (
            <div className="space-y-3">
              {perAgent.map((a) => (
                <div key={a.id} className="flex items-center gap-3">
                  <span className="font-semibold text-sm text-slate-800 w-32 truncate">{a.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-brix-500 to-cyan-400" style={{ width: `${a.csat != null ? (a.csat / 5) * 100 : 0}%` }} />
                  </div>
                  <span className="text-sm font-bold text-slate-700 w-20 text-right">{a.csat != null ? `${a.csat.toFixed(1)}/5` : '—'}</span>
                  <span className="text-xs text-slate-400 w-16 text-right">{a.count} ratings</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-bold text-slate-900 mb-1">Needs attention</h2>
          <p className="text-xs text-slate-400 mb-4">Low scores (CSAT ≤ 2, NPS ≤ 6) — follow up with these visitors.</p>
          {alerts.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing to follow up on. 🎉</p>
          ) : (
            <div className="space-y-2.5">
              {alerts.map((r) => (
                <div key={r.id} className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone="rose">{r.kind.toUpperCase()} {r.score}</Badge>
                    <span className="text-sm font-semibold text-slate-800">{agentName(r.agent_id)}</span>
                    <span className="ml-auto text-xs text-slate-400">{timeAgo(r.created_at)}</span>
                  </div>
                  {r.comment && <p className="text-sm text-slate-600 mt-1.5">“{r.comment}”</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="font-bold text-slate-900 mb-4">Recent comments</h2>
        {ratings.filter((r) => r.comment).length === 0 ? (
          <EmptyState icon="💬" title="No comments yet" hint="Written feedback from visitors will appear here." />
        ) : (
          <div className="space-y-2.5">
            {ratings.filter((r) => r.comment).slice(0, 20).map((r) => (
              <div key={r.id} className={cx('rounded-xl border p-3', r.kind === 'nps' && r.score <= 6 ? 'border-rose-200' : 'border-slate-200')}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone={r.kind === 'csat' ? (r.score >= 4 ? 'green' : r.score === 3 ? 'amber' : 'rose') : (r.score >= 9 ? 'green' : r.score >= 7 ? 'amber' : 'rose')}>
                    {r.kind.toUpperCase()} {r.score}
                  </Badge>
                  <span className="text-sm text-slate-500">{agentName(r.agent_id)}</span>
                  <span className="ml-auto text-xs text-slate-400">{timeAgo(r.created_at)}</span>
                </div>
                <p className="text-sm text-slate-700 mt-1.5">“{r.comment}”</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
