import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { getApi } from '../lib/api';
import type { ApiSavedView } from '../lib/api';
import type { Conversation, ConvPriority, ConvStatus } from '../lib/types';
import { Avatar, Badge, Button, EmptyState, Input, SearchInput, Select, Tabs } from '../components/ui';
import { cx, timeAgo } from '../lib/utils';
import { threadSentiment } from '../lib/bot';
import ChatThread from './ChatThread';
import Copilot from './Copilot';

type Tab = ConvStatus;

const SENT_DOT = {
  positive: 'bg-emerald-500',
  neutral: 'bg-slate-300',
  negative: 'bg-rose-500',
} as const;

const STATUS_TONE = {
  open: 'green',
  closed: 'slate',
  spam: 'rose',
  missed: 'amber',
} as const;

const PRIORITY_TONE: Record<ConvPriority, 'slate' | 'cyan' | 'amber' | 'rose'> = {
  low: 'slate',
  medium: 'cyan',
  high: 'amber',
  urgent: 'rose',
};

const PRIORITY_ORDER: ConvPriority[] = ['low', 'medium', 'high', 'urgent'];

function snippet(c: Conversation): string {
  const m = c.messages[c.messages.length - 1];
  if (!m) return 'No messages yet';
  if (m.kind === 'file') return `📎 ${m.fileName ?? 'Attachment'}`;
  if (m.kind === 'voice') return '🎙 Voice message';
  if (m.kind === 'rating') return `⭐ Rated ${m.rating ?? ''}/5`;
  return m.text;
}

export default function Inbox() {
  const { session, data, updateConversation, resolveConversation } = useStore();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('open');
  const [dept, setDept] = useState('all');
  const [q, setQ] = useState('');
  const [input, setInput] = useState('');
  const [copilotOpen, setCopilotOpen] = useState(false);

  // phase 2 filters
  const [priority, setPriority] = useState<'all' | ConvPriority>('all');
  const [assignee, setAssignee] = useState('all');
  const [tag, setTag] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [unreadFirst, setUnreadFirst] = useState(false);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAgent, setBulkAgent] = useState('');

  // saved views
  const [views, setViews] = useState<ApiSavedView[]>([]);
  const [viewName, setViewName] = useState('');
  const [savingView, setSavingView] = useState(false);
  const [activeView, setActiveView] = useState<string | null>(null);

  const api = useMemo(() => (session ? getApi(session.workspace, session.displayName) : null), [session]);

  const refreshViews = async () => {
    if (!api) return;
    try {
      const { data: v } = await api.views.list();
      setViews(v);
    } catch { /* ignore */ }
  };

  useEffect(() => { refreshViews(); }, [session?.workspace]); // eslint-disable-line react-hooks/exhaustive-deps

  const convId = params.get('c');
  const conv = convId ? data.conversations.find((c) => c.id === convId) : undefined;

  const allTags = useMemo(() => {
    const s = new Set<string>();
    data.conversations.forEach((c) => c.tags.forEach((t) => s.add(t)));
    return [...s].sort();
  }, [data.conversations]);

  const counts = useMemo(() => {
    const base = data.conversations.filter((c) => dept === 'all' || c.department === dept);
    return {
      open: base.filter((c) => c.status === 'open').length,
      closed: base.filter((c) => c.status === 'closed').length,
      spam: base.filter((c) => c.status === 'spam').length,
      missed: base.filter((c) => c.status === 'missed').length,
    };
  }, [data.conversations, dept]);

  const snoozedCount = useMemo(
    () => data.conversations.filter((c) => c.snoozeUntil && c.snoozeUntil > Date.now()).length,
    [data.conversations],
  );

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const me = session?.displayName;
    const filtered = data.conversations
      .filter((c) => c.status === tab)
      .filter((c) => dept === 'all' || c.department === dept)
      .filter((c) => priority === 'all' || (c.priority ?? 'medium') === priority)
      .filter((c) => {
        if (assignee === 'all') return true;
        if (assignee === 'unassigned') return !c.agent;
        if (assignee === 'me') return c.agent === me;
        return c.agent === assignee;
      })
      .filter((c) => tag === 'all' || c.tags.includes(tag))
      .filter((c) => !unreadOnly || c.unread > 0)
      .filter((c) => showSnoozed || !(c.snoozeUntil && c.snoozeUntil > Date.now()))
      .filter(
        (c) =>
          !t ||
          c.visitor.toLowerCase().includes(t) ||
          c.messages.some((m) => m.text.toLowerCase().includes(t)) ||
          c.tags.some((tag) => tag.includes(t)),
      );
    filtered.sort((a, b) => {
      if (unreadFirst && (a.unread > 0) !== (b.unread > 0)) return a.unread > 0 ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
    return filtered;
  }, [data.conversations, tab, dept, q, priority, assignee, tag, unreadOnly, unreadFirst, showSnoozed, session?.displayName]);

  const select = (id: string | null) => {
    if (id) setParams({ c: id }, { replace: true });
    else setParams({}, { replace: true });
    setInput('');
  };

  // j/k keyboard navigation
  useEffect(() => {
    const onMove = (e: Event) => {
      const dir = (e as CustomEvent<number>).detail ?? 1;
      if (!list.length) return;
      const idx = convId ? list.findIndex((c) => c.id === convId) : -1;
      const next = list[(idx + dir + list.length) % list.length];
      if (next) select(next.id);
    };
    window.addEventListener('brix:inbox-move', onMove);
    return () => window.removeEventListener('brix:inbox-move', onMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, convId]);

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const clearFilters = () => {
    setPriority('all'); setAssignee('all'); setTag('all');
    setUnreadOnly(false); setDept('all'); setQ('');
    setActiveView(null);
  };

  const applyView = (v: ApiSavedView) => {
    const f = v.filters;
    if (f.status && ['open', 'closed', 'spam', 'missed'].includes(f.status)) setTab(f.status as Tab);
    setPriority((f.priority as ConvPriority) ?? 'all');
    setTag(f.tag ?? 'all');
    setAssignee(f.assignee ?? 'all');
    setUnreadOnly(!!f.unreadOnly);
    setActiveView(v.id);
  };

  const saveView = async () => {
    if (!api || !viewName.trim()) return;
    try {
      await api.views.create(viewName.trim(), {
        status: tab,
        priority: priority === 'all' ? undefined : priority,
        tag: tag === 'all' ? undefined : tag,
        assignee: assignee === 'all' ? undefined : assignee,
        unreadOnly: unreadOnly || undefined,
      });
      setViewName('');
      setSavingView(false);
      refreshViews();
    } catch { /* ignore */ }
  };

  const deleteView = async (id: string) => {
    if (!api) return;
    try {
      await api.views.delete(id);
      if (activeView === id) setActiveView(null);
      refreshViews();
    } catch { /* ignore */ }
  };

  const bulkResolve = () => { selected.forEach((id) => resolveConversation(id)); setSelected(new Set()); };
  const bulkSpam = () => { selected.forEach((id) => updateConversation(id, { status: 'spam', live: false })); setSelected(new Set()); };
  const bulkAssign = () => {
    if (!bulkAgent) return;
    selected.forEach((id) => updateConversation(id, { agent: bulkAgent === 'unassigned' ? 'Unassigned' : bulkAgent }));
    setSelected(new Set());
  };
  const bulkSnooze = () => {
    const until = Date.now() + 3600000;
    selected.forEach((id) => updateConversation(id, { snoozeUntil: until }));
    setSelected(new Set());
  };

  const snoozeOne = (id: string) => updateConversation(id, { snoozeUntil: Date.now() + 3600000 });
  const unsnoozeOne = (id: string) => updateConversation(id, { snoozeUntil: undefined });

  const cyclePriority = (c: Conversation) => {
    const cur = c.priority ?? 'medium';
    const next = PRIORITY_ORDER[(PRIORITY_ORDER.indexOf(cur) + 1) % PRIORITY_ORDER.length];
    updateConversation(c.id, { priority: next });
  };

  const teamNames = data.settings.team.map((t) => t.name);

  return (
    <div className="h-full flex">
      {/* Conversation list */}
      <div className={cx('w-full lg:w-96 xl:w-[26rem] shrink-0 flex flex-col border-r border-slate-200/80 bg-white', conv && 'hidden lg:flex')}>
        <div className="p-4 pb-3 space-y-3 border-b border-slate-100">
          <Tabs<Tab>
            tabs={[
              { id: 'open', label: 'Open', count: counts.open },
              { id: 'closed', label: 'Closed', count: counts.closed },
              { id: 'spam', label: 'Spam', count: counts.spam },
              { id: 'missed', label: 'Missed', count: counts.missed },
            ]}
            active={tab}
            onChange={(t) => { setTab(t); setActiveView(null); }}
          />

          {/* Saved views */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {views.map((v) => (
              <span key={v.id} className={cx('inline-flex items-center rounded-full border text-xs font-semibold transition',
                activeView === v.id ? 'bg-brix-600 text-white border-brix-600' : 'bg-white text-slate-600 border-slate-200')}>
                <button onClick={() => applyView(v)} className="pl-2.5 pr-1 py-1">{v.name}</button>
                <button onClick={() => deleteView(v.id)} className="pr-2 pl-0.5 opacity-60 hover:opacity-100" title="Delete view">✕</button>
              </span>
            ))}
            {savingView ? (
              <span className="inline-flex items-center gap-1">
                <Input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="View name…" className="py-1 text-xs w-32"
                  onKeyDown={(e) => { if (e.key === 'Enter') saveView(); }} autoFocus />
                <Button size="sm" onClick={saveView} disabled={!viewName.trim()}>Save</Button>
                <button onClick={() => setSavingView(false)} className="text-xs text-slate-400">✕</button>
              </span>
            ) : (
              <button onClick={() => setSavingView(true)} className="text-xs font-semibold text-brix-600 hover:text-brix-700">
                + Save current filters
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <div className="flex-1"><SearchInput value={q} onChange={setQ} placeholder="Search conversations…" /></div>
            <Select value={dept} onChange={(e) => setDept(e.target.value)} className="max-w-32">
              <option value="all">All teams</option>
              {data.settings.departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Select>
          </div>

          {/* Advanced filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as 'all' | ConvPriority)} className="text-xs max-w-28" title="Priority">
              <option value="all">Priority: all</option>
              {PRIORITY_ORDER.map((p) => <option key={p} value={p} className="capitalize">⚑ {p}</option>)}
            </Select>
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="text-xs max-w-32" title="Assignee">
              <option value="all">Assignee: all</option>
              <option value="me">👤 Me</option>
              <option value="unassigned">Unassigned</option>
              {teamNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
            <Select value={tag} onChange={(e) => setTag(e.target.value)} className="text-xs max-w-28" title="Tag">
              <option value="all">Tag: all</option>
              {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
            </Select>
            <button
              onClick={() => setUnreadOnly((v) => !v)}
              className={cx('px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition',
                unreadOnly ? 'bg-brix-600 text-white border-brix-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}
              title="Unread only"
            >
              ● Unread
            </button>
            <button
              onClick={() => setUnreadFirst((v) => !v)}
              className={cx('px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition',
                unreadFirst ? 'bg-brix-600 text-white border-brix-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}
              title="Sort unread first"
            >
              ⇅ Unread first
            </button>
            {(priority !== 'all' || assignee !== 'all' || tag !== 'all' || unreadOnly || q) && (
              <button onClick={clearFilters} className="text-xs font-semibold text-slate-400 hover:text-slate-600">Clear</button>
            )}
          </div>

          {snoozedCount > 0 && (
            <button onClick={() => setShowSnoozed((v) => !v)} className="text-xs font-semibold text-amber-700 hover:text-amber-800">
              ⏰ {snoozedCount} snoozed {showSnoozed ? '(hide)' : '(show)'}
            </button>
          )}

          {/* Bulk bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-ink-950 text-white px-3 py-2">
              <span className="text-xs font-bold">{selected.size} selected</span>
              <Select value={bulkAgent} onChange={(e) => setBulkAgent(e.target.value)} className="text-xs text-slate-900 max-w-28 py-1">
                <option value="">Assign…</option>
                <option value="unassigned">Unassigned</option>
                {teamNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
              <button onClick={bulkAssign} disabled={!bulkAgent} className="text-xs font-semibold px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40">Apply</button>
              <button onClick={bulkResolve} className="text-xs font-semibold px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20">✓ Resolve</button>
              <button onClick={bulkSnooze} className="text-xs font-semibold px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20">⏰ 1h</button>
              <button onClick={bulkSpam} className="text-xs font-semibold px-2 py-1 rounded-lg bg-rose-500/80 hover:bg-rose-500">🚫 Spam</button>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-300 hover:text-white">✕</button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto slim-scroll">
          {list.length === 0 && (
            <EmptyState icon="💬" title={`No ${tab} conversations`} hint="New chats will land here when visitors message you." />
          )}
          {list.map((c) => {
            const snoozed = c.snoozeUntil && c.snoozeUntil > Date.now();
            return (
              <div
                key={c.id}
                className={cx(
                  'w-full text-left px-4 py-3.5 border-b border-slate-100 hover:bg-slate-50 transition flex gap-3 group',
                  conv?.id === c.id && 'bg-brix-50 hover:bg-brix-50 border-l-4 border-l-brix-600',
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggleSelect(c.id)}
                  className="mt-1 w-4 h-4 rounded accent-brix-600 shrink-0"
                  aria-label={`Select conversation with ${c.visitor}`}
                />
                <button onClick={() => select(c.id)} className="flex gap-3 flex-1 min-w-0 text-left">
                  <div className="relative shrink-0">
                    <Avatar name={c.visitor} />
                    {c.live && c.status === 'open' && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-sm text-slate-900 truncate">{c.visitor}</span>
                      <span className={cx('w-2 h-2 rounded-full shrink-0', SENT_DOT[threadSentiment(c.messages)])} title={threadSentiment(c.messages)} />
                      <span className="ml-auto text-[11px] text-slate-400 shrink-0">{timeAgo(c.updatedAt)}</span>
                    </div>
                    <div className="text-[13px] text-slate-500 truncate mt-0.5">{snippet(c)}</div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                      <Badge tone="indigo">{c.department}</Badge>
                      <Badge tone={PRIORITY_TONE[c.priority ?? 'medium']}>⚑ {c.priority ?? 'medium'}</Badge>
                      {snoozed && <Badge tone="amber">⏰ snoozed</Badge>}
                      {c.unread > 0 && (
                        <span className="ml-auto min-w-5 h-5 px-1 grid place-items-center rounded-full bg-brix-600 text-white text-[11px] font-bold">
                          {c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                  <button
                    onClick={() => cyclePriority(c)}
                    title={`Priority: ${c.priority ?? 'medium'} — click to cycle`}
                    className="w-7 h-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-amber-600 text-sm"
                  >
                    ⚑
                  </button>
                  {snoozed ? (
                    <button
                      onClick={() => unsnoozeOne(c.id)}
                      title="Unsnooze"
                      className="w-7 h-7 grid place-items-center rounded-lg text-amber-600 hover:bg-amber-50 text-sm"
                    >
                      ⏰
                    </button>
                  ) : (
                    <button
                      onClick={() => snoozeOne(c.id)}
                      title="Snooze 1 hour"
                      className="w-7 h-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-amber-600 text-sm"
                    >
                      ⏰
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Thread + copilot */}
      <div className={cx('flex-1 min-w-0 flex', !conv && 'hidden lg:flex')}>
        {conv ? (
          <>
            <div className="flex-1 min-w-0 flex flex-col bg-slate-50">
              <button
                className="lg:hidden m-3 mb-0 w-fit text-sm font-semibold text-brix-600 hover:text-brix-700"
                onClick={() => select(null)}
              >
                ← Back to inbox
              </button>
              <ChatThread convId={conv.id} input={input} setInput={setInput} />
            </div>
            <div className={cx('shrink-0 w-80 border-l border-slate-200/80 bg-white', !copilotOpen && 'hidden xl:block')}>
              <Copilot convId={conv.id} onInsert={(t) => setInput((v) => (v ? v + ' ' + t : t))} />
            </div>
            <button
              className="xl:hidden fixed bottom-6 right-6 z-30 w-12 h-12 rounded-full bg-brix-600 text-white text-xl shadow-xl shadow-brix-600/40"
              onClick={() => setCopilotOpen((v) => !v)}
              aria-label="Toggle AI Copilot"
            >
              ✨
            </button>
            {copilotOpen && (
              <div className="xl:hidden fixed inset-0 z-40">
                <div className="absolute inset-0 bg-ink-950/50" onClick={() => setCopilotOpen(false)} />
                <div className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-2xl animate-fade-up">
                  <Copilot convId={conv.id} onInsert={(t) => { setInput((v) => (v ? v + ' ' + t : t)); }} />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 grid place-items-center bg-slate-50">
            <EmptyState icon="💬" title="Select a conversation" hint="Pick a chat from the list to start helping your visitor." />
          </div>
        )}
      </div>
    </div>
  );
}
