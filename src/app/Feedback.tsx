// Brix Chat — Feedback: live CSAT + NPS feed, newest first.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { getApi } from '../lib/api';
import type { ApiRating, ApiMember } from '../lib/api';
import { Badge, Button, Card, EmptyState, PageHeader, Select } from '../components/ui';
import { toast } from '../components/dashboard/Toasts';
import { cx } from '../lib/utils';

type KindFilter = 'all' | 'csat' | 'nps';
type Sentiment = 'all' | 'low' | 'neutral' | 'high';

function bucket(r: ApiRating): 'low' | 'neutral' | 'high' {
  if (r.kind === 'csat') return r.score <= 2 ? 'low' : r.score === 3 ? 'neutral' : 'high';
  return r.score <= 6 ? 'low' : r.score <= 8 ? 'neutral' : 'high';
}

const BUCKET_TONE: Record<'low' | 'neutral' | 'high', 'rose' | 'amber' | 'green'> = {
  low: 'rose',
  neutral: 'amber',
  high: 'green',
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Feedback() {
  const { session, effectiveWorkspaceId } = useStore();
  const [ratings, setRatings] = useState<ApiRating[]>([]);
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [kind, setKind] = useState<KindFilter>('all');
  const [sentiment, setSentiment] = useState<Sentiment>('all');
  const [loading, setLoading] = useState(true);
  const [noted, setNoted] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);
  // P4-21: rating ids that already have a follow-up ticket (duplicate suppression)
  const [ticketed, setTicketed] = useState<Set<string>>(new Set());
  const [ticketing, setTicketing] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const api = getApi(effectiveWorkspaceId(), session.displayName);
    setLoading(true);
    Promise.all([api.ratings.list({ limit: 100 }), api.members.list(), api.tickets.list({ limit: 200 })])
      .then(([{ data: page }, { data: ms }, { data: tp }]) => {
        setRatings(page.items);
        setMembers(ms);
        const s = new Set<string>();
        tp.items.forEach((t) =>
          t.tags.forEach((tag) => {
            if (tag.startsWith('rating:')) s.add(tag.slice('rating:'.length));
          }),
        );
        setTicketed(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session]);

  const memberName = (id: string | null) =>
    (id && members.find((m) => m.id === id)?.display_name) || '—';

  const filtered = useMemo(
    () =>
      ratings.filter((r) => {
        if (kind !== 'all' && r.kind !== kind) return false;
        if (sentiment !== 'all' && bucket(r) !== sentiment) return false;
        return true;
      }),
    [ratings, kind, sentiment],
  );

  /** P4-21: negative-feedback follow-up ticket loop with duplicate suppression. */
  const createTicket = async (r: ApiRating) => {
    if (!session || ticketing) return;
    const api = getApi(effectiveWorkspaceId(), session.displayName);
    setTicketing(r.id);
    try {
      // Re-check live before creating — suppress duplicates.
      const { data: tp } = await api.tickets.list({ limit: 200 });
      const existing = tp.items.find((t) => t.tags.includes(`rating:${r.id}`));
      if (existing) {
        setTicketed((prev) => new Set(prev).add(r.id));
        toast.info('Follow-up ticket already exists', existing.subject);
        return;
      }
      const { data: t } = await api.tickets.create({
        subject: `Follow-up: ${r.kind.toUpperCase()} ${r.score} (${bucket(r)}) — ${memberName(r.agent_id)}`,
        requester_name: 'Feedback loop',
        message: [
          `A visitor left a ${bucket(r)} ${r.kind.toUpperCase()} rating of ${r.score}.`,
          r.comment ? `Comment: "${r.comment}"` : 'No comment left.',
          `Agent: ${memberName(r.agent_id)}`,
          r.conversation_id ? `Conversation: /app?c=${r.conversation_id}` : 'No linked conversation.',
          `Rating ID: ${r.id}`,
        ].join('\n'),
        priority: 'high',
        conversation_id: r.conversation_id,
        tags: ['feedback-followup', `rating:${r.id}`],
      });
      setTicketed((prev) => new Set(prev).add(r.id));
      toast.success('Follow-up ticket created', t.subject);
    } catch {
      toast.error('Could not create the follow-up ticket');
    }
    setTicketing(null);
  };

  const followUp = async (r: ApiRating) => {
    if (!session || !r.conversation_id || sending) return;
    setSending(r.id);
    try {
      const api = getApi(effectiveWorkspaceId(), session.displayName);
      await api.conversations.addNote(r.conversation_id, {
        author: session.displayName,
        text: `Follow-up on ${r.kind.toUpperCase()} ${r.score}${r.comment ? `: "${r.comment}"` : ' (no comment left)'}`,
      });
      setNoted((s) => new Set(s).add(r.id));
    } catch {
      /* keep the button usable on failure */
    }
    setSending(null);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Feedback"
        subtitle={`${ratings.length} ratings · CSAT & NPS · newest first`}
        actions={
          <div className="flex gap-2">
            <Select value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} aria-label="Filter by kind">
              <option value="all">All kinds</option>
              <option value="csat">CSAT</option>
              <option value="nps">NPS</option>
            </Select>
            <Select value={sentiment} onChange={(e) => setSentiment(e.target.value as Sentiment)} aria-label="Filter by sentiment">
              <option value="all">All scores</option>
              <option value="low">🔴 Low</option>
              <option value="neutral">🟡 Neutral</option>
              <option value="high">🟢 High</option>
            </Select>
          </div>
        }
      />

      {loading ? (
        <Card className="p-8 text-center text-sm text-slate-400">Loading ratings…</Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="⭐"
            title={ratings.length === 0 ? 'No ratings yet' : 'No ratings match these filters'}
            hint={ratings.length === 0 ? 'Ratings appear here as visitors submit them.' : 'Try widening the filters.'}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const b = bucket(r);
            const done = noted.has(r.id);
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-start gap-4">
                  <div
                    className={cx(
                      'w-12 h-12 rounded-xl grid place-items-center text-lg font-extrabold shrink-0',
                      b === 'high' && 'bg-emerald-100 text-emerald-700',
                      b === 'neutral' && 'bg-amber-100 text-amber-700',
                      b === 'low' && 'bg-rose-100 text-rose-700',
                    )}
                  >
                    {r.score}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={r.kind === 'csat' ? 'indigo' : 'cyan'}>{r.kind.toUpperCase()}</Badge>
                      <Badge tone={BUCKET_TONE[b]}>{b}</Badge>
                      <span className="text-xs text-slate-400">{fmtDate(r.created_at)}</span>
                      <span className="text-xs text-slate-400">· agent: {memberName(r.agent_id)}</span>
                    </div>
                    <p className="text-sm text-slate-700 mt-1.5">
                      {r.comment || <span className="text-slate-400 italic">No comment left.</span>}
                    </p>
                    <div className="flex items-center gap-3 mt-2.5">
                      {r.conversation_id ? (
                        <>
                          <Link
                            to={`/app?c=${r.conversation_id}`}
                            className="text-xs font-semibold text-brix-600 hover:text-brix-700"
                          >
                            Open chat →
                          </Link>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={done || sending === r.id}
                            onClick={() => followUp(r)}
                          >
                            {done ? '✓ Note added' : sending === r.id ? 'Adding…' : '↩ Reply as follow-up'}
                          </Button>
                          {b === 'low' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={ticketed.has(r.id) || ticketing === r.id}
                              onClick={() => createTicket(r)}
                            >
                              {ticketed.has(r.id) ? '✓ Ticket open' : ticketing === r.id ? 'Creating…' : '🎫 Follow-up ticket'}
                            </Button>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">No linked conversation</span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
