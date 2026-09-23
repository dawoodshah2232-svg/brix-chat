// Brix Chat — Quality: agent scorecards from the heuristic conversation
// quality model. Every score is an auto estimate (keyword/signals heuristic,
// not AI) and is labeled as such.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { analyzeSentiment, scoreConversationQuality, DEFAULT_QUALITY_WEIGHTS, type QualityWeights, type QualitySentiment } from '../lib/quality';
import { AUTO_ESTIMATE, SENTIMENT_META } from '../components/dashboard/Sentiment';
import { Avatar, Button, Card, EmptyState, Modal, PageHeader, StatCard } from '../components/ui';
import { toast } from '../components/dashboard/Toasts';
import { cx, timeAgo } from '../lib/utils';

const WEIGHT_KEYS: Array<{ key: keyof QualityWeights; label: string; hint: string }> = [
  { key: 'firstResponse', label: 'First response', hint: 'Speed of the first agent reply' },
  { key: 'sentiment', label: 'Visitor sentiment', hint: 'Tone of visitor messages' },
  { key: 'resolution', label: 'Resolution', hint: 'Closed + rated outcomes' },
  { key: 'efficiency', label: 'Efficiency', hint: 'Few agent touches per message' },
  { key: 'engagement', label: 'Engagement', hint: 'Substantive back-and-forth' },
  { key: 'freshness', label: 'Freshness', hint: 'No long-open stale chats' },
];

function scoreTone(s: number): 'green' | 'amber' | 'rose' {
  return s >= 75 ? 'green' : s >= 50 ? 'amber' : 'rose';
}

export default function Quality() {
  const store = useStore();
  const { data, session } = store;
  const weights: QualityWeights = data.settings.qualityRubric ?? DEFAULT_QUALITY_WEIGHTS;
  const canEditRubric = (session?.role ?? 'agent') === 'admin' || (session?.role ?? 'agent') === 'owner';
  const [rubricOpen, setRubricOpen] = useState(false);
  const [draft, setDraft] = useState<QualityWeights>(weights);

  const scored = useMemo(
    () =>
      data.conversations.map((c) => ({
        conv: c,
        quality: scoreConversationQuality(c, weights),
        sentiment: analyzeSentiment(c.messages.filter((m) => m.from === 'visitor').map((m) => m.text)).label as QualitySentiment,
      })),
    [data.conversations, weights],
  );

  const summary = useMemo(() => {
    if (scored.length === 0) return null;
    const avg = Math.round(scored.reduce((a, s) => a + s.quality.score, 0) / scored.length);
    const rated = scored.filter((s) => s.conv.rating !== undefined);
    const avgRating = rated.length ? (rated.reduce((a, s) => a + (s.conv.rating ?? 0), 0) / rated.length).toFixed(1) : '—';
    const pos = scored.filter((s) => s.sentiment === 'positive').length;
    const neg = scored.filter((s) => s.sentiment === 'negative' || s.sentiment === 'frustrated' || s.sentiment === 'urgent').length;
    return { avg, count: scored.length, avgRating, posPct: Math.round((pos / scored.length) * 100), neg };
  }, [scored]);

  const agentCards = useMemo(() => {
    const names = data.settings.team.map((t) => t.name);
    const rows = names.map((name) => {
      const mine = scored.filter((s) => s.conv.agent === name);
      if (mine.length === 0) return { name, count: 0, avg: 0, avgRating: '—', sentiments: {} as Record<string, number>, worst: null as null | (typeof scored)[number] };
      const avg = Math.round(mine.reduce((a, s) => a + s.quality.score, 0) / mine.length);
      const rated = mine.filter((s) => s.conv.rating !== undefined);
      const sentiments: Record<string, number> = {};
      mine.forEach((s) => { sentiments[s.sentiment] = (sentiments[s.sentiment] ?? 0) + 1; });
      const worst = [...mine].sort((a, b) => a.quality.score - b.quality.score)[0];
      return {
        name,
        count: mine.length,
        avg,
        avgRating: rated.length ? (rated.reduce((a, s) => a + (s.conv.rating ?? 0), 0) / rated.length).toFixed(1) : '—',
        sentiments,
        worst,
      };
    });
    const unassigned = scored.filter((s) => !s.conv.agent);
    return { rows, unassigned: unassigned.length };
  }, [scored, data.settings.team]);

  const lowest = useMemo(() => [...scored].sort((a, b) => a.quality.score - b.quality.score).slice(0, 5), [scored]);

  const saveRubric = () => {
    const total = Object.values(draft).reduce((a, b) => a + b, 0);
    if (total <= 0) {
      toast.error('Rubric weights must add up to more than zero');
      return;
    }
    store.updateSettings({ qualityRubric: { ...draft } });
    setRubricOpen(false);
    toast.success('Scoring rubric saved', 'New weights apply to all quality scores');
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Quality"
        subtitle={`Agent scorecards from conversation signals · ${AUTO_ESTIMATE}`}
        actions={canEditRubric ? (
          <Button variant="secondary" onClick={() => { setDraft({ ...weights }); setRubricOpen(true); }}>
            ⚖ Scoring rubric
          </Button>
        ) : undefined}
      />

      {!summary ? (
        <EmptyState icon="⭐" title="No conversations yet" hint="Quality scorecards appear once conversations exist in this workspace." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Avg quality score" value={`${summary.avg}/100`} icon="⭐" tone={scoreTone(summary.avg)} delta={AUTO_ESTIMATE} />
            <StatCard label="Conversations scored" value={String(summary.count)} icon="💬" tone="indigo" />
            <StatCard label="Avg visitor rating" value={`${summary.avgRating}/5`} icon="❤" tone="green" />
            <StatCard label="Needs attention" value={String(summary.neg)} icon="⚠" tone={summary.neg > 0 ? 'amber' : 'green'} delta="negative / frustrated / urgent threads" />
          </div>

          <Card className="p-6">
            <h2 className="font-display font-bold text-slate-900 mb-1">Agent scorecards</h2>
            <p className="text-xs text-slate-500 mb-4">Scores are {AUTO_ESTIMATE} — use them for coaching, not payroll.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {agentCards.rows.map((r) => {
                const member = data.settings.team.find((t) => t.name === r.name);
                return (
                  <div key={r.name} className="rounded-2xl border border-slate-200 p-4 bg-white">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.name} color={member?.color} />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-slate-900 truncate">{r.name}</div>
                        <div className="text-xs text-slate-500">{member?.role ?? 'Agent'} · {r.count} conversation{r.count === 1 ? '' : 's'}</div>
                      </div>
                      <div className={cx('ml-auto text-2xl font-display font-extrabold',
                        r.count === 0 ? 'text-slate-300' : r.avg >= 75 ? 'text-emerald-600' : r.avg >= 50 ? 'text-amber-600' : 'text-rose-600')}>
                        {r.count === 0 ? '—' : r.avg}
                      </div>
                    </div>
                    {r.count > 0 && (
                      <>
                        <div className="h-2 rounded-full bg-slate-100 mt-3 overflow-hidden">
                          <div
                            className={cx('h-full rounded-full', r.avg >= 75 ? 'bg-emerald-500' : r.avg >= 50 ? 'bg-amber-500' : 'bg-rose-500')}
                            style={{ width: `${r.avg}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                          {(Object.keys(SENTIMENT_META) as QualitySentiment[]).map((k) => (
                            r.sentiments[k] ? (
                              <span key={k} title={`${SENTIMENT_META[k].label} threads`} className="text-xs text-slate-600">
                                {SENTIMENT_META[k].emoji} {r.sentiments[k]}
                              </span>
                            ) : null
                          ))}
                          <span className="ml-auto text-xs text-slate-500">⭐ rated {r.avgRating}</span>
                        </div>
                        {r.worst && (
                          <Link
                            to={`/app/inbox?c=${r.worst.conv.id}`}
                            className="mt-3 block text-xs text-slate-500 hover:text-brix-700 rounded-lg bg-slate-50 hover:bg-brix-50 px-2.5 py-2 transition"
                            title={`Lowest-scored thread (${r.worst.quality.score}/100) — open in Inbox`}
                          >
                            Needs coaching: <span className="font-semibold text-slate-700">{r.worst.conv.visitor}</span>
                            <span className="text-slate-400"> · {r.worst.quality.score}/100 · {timeAgo(r.worst.conv.updatedAt)}</span>
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {agentCards.unassigned > 0 && (
              <p className="text-xs text-slate-400 mt-3">{agentCards.unassigned} conversation{agentCards.unassigned === 1 ? '' : 's'} not assigned to an agent.</p>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="font-display font-bold text-slate-900 mb-1">Lowest-scored threads</h2>
            <p className="text-xs text-slate-500 mb-4">Start coaching here. Scores are {AUTO_ESTIMATE}.</p>
            <div className="divide-y divide-slate-100">
              {lowest.map(({ conv, quality, sentiment }) => (
                <Link key={conv.id} to={`/app/inbox?c=${conv.id}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50 rounded-lg px-2 -mx-2 transition">
                  <Avatar name={conv.visitor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 truncate">{conv.visitor}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {SENTIMENT_META[sentiment].emoji} {sentiment} · {conv.agent ?? 'unassigned'} · {timeAgo(conv.updatedAt)}
                    </div>
                  </div>
                  <span className={cx('text-sm font-extrabold font-display',
                    quality.score >= 75 ? 'text-emerald-600' : quality.score >= 50 ? 'text-amber-600' : 'text-rose-600')}>
                    {quality.score}
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}

      <Modal open={rubricOpen} onClose={() => setRubricOpen(false)} title="Scoring rubric" wide>
        <p className="text-sm text-slate-500 mb-4">
          Weights control how much each signal counts toward the 0–100 score. Changes apply everywhere scores are shown.
          Heuristic only — {AUTO_ESTIMATE}.
        </p>
        <div className="space-y-4">
          {WEIGHT_KEYS.map(({ key, label, hint }) => (
            <div key={key}>
              <div className="flex items-baseline justify-between mb-1">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{label}</div>
                  <div className="text-xs text-slate-500">{hint}</div>
                </div>
                <div className="text-sm font-bold text-slate-900 w-10 text-right">{draft[key]}</div>
              </div>
              <input
                type="range"
                min={0}
                max={40}
                step={1}
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))}
                className="w-full accent-brix-600"
                aria-label={`${label} weight`}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-6">
          <div className="text-xs text-slate-500">
            Total weight: <span className="font-bold text-slate-900">{Object.values(draft).reduce((a, b) => a + b, 0)}</span>
            <button
              className="ml-3 text-brix-700 hover:underline font-semibold"
              onClick={() => setDraft({ ...DEFAULT_QUALITY_WEIGHTS })}
            >
              Reset to defaults
            </button>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setRubricOpen(false)}>Cancel</Button>
            <Button onClick={saveRubric}>Save rubric</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
