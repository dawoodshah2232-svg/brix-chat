import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import type { Conversation, ConvStatus } from '../lib/types';
import { Avatar, Badge, EmptyState, SearchInput, Select, Tabs } from '../components/ui';
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

function snippet(c: Conversation): string {
  const m = c.messages[c.messages.length - 1];
  if (!m) return 'No messages yet';
  if (m.kind === 'file') return `📎 ${m.fileName ?? 'Attachment'}`;
  if (m.kind === 'voice') return '🎙 Voice message';
  if (m.kind === 'rating') return `⭐ Rated ${m.rating ?? ''}/5`;
  return m.text;
}

export default function Inbox() {
  const { data } = useStore();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('open');
  const [dept, setDept] = useState('all');
  const [q, setQ] = useState('');
  const [input, setInput] = useState('');
  const [copilotOpen, setCopilotOpen] = useState(false);

  const convId = params.get('c');
  const conv = convId ? data.conversations.find((c) => c.id === convId) : undefined;

  const counts = useMemo(() => {
    const base = data.conversations.filter((c) => dept === 'all' || c.department === dept);
    return {
      open: base.filter((c) => c.status === 'open').length,
      closed: base.filter((c) => c.status === 'closed').length,
      spam: base.filter((c) => c.status === 'spam').length,
      missed: base.filter((c) => c.status === 'missed').length,
    };
  }, [data.conversations, dept]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return data.conversations
      .filter((c) => c.status === tab)
      .filter((c) => dept === 'all' || c.department === dept)
      .filter(
        (c) =>
          !t ||
          c.visitor.toLowerCase().includes(t) ||
          c.messages.some((m) => m.text.toLowerCase().includes(t)) ||
          c.tags.some((tag) => tag.includes(t)),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [data.conversations, tab, dept, q]);

  const select = (id: string | null) => {
    if (id) setParams({ c: id }, { replace: true });
    else setParams({}, { replace: true });
    setInput('');
  };

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
            onChange={setTab}
          />
          <div className="flex gap-2">
            <div className="flex-1"><SearchInput value={q} onChange={setQ} placeholder="Search conversations…" /></div>
            <Select value={dept} onChange={(e) => setDept(e.target.value)} className="max-w-32">
              <option value="all">All teams</option>
              {data.settings.departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto slim-scroll">
          {list.length === 0 && (
            <EmptyState icon="💬" title={`No ${tab} conversations`} hint="New chats will land here when visitors message you." />
          )}
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => select(c.id)}
              className={cx(
                'w-full text-left px-4 py-3.5 border-b border-slate-100 hover:bg-slate-50 transition flex gap-3',
                conv?.id === c.id && 'bg-brix-50 hover:bg-brix-50 border-l-4 border-l-brix-600',
              )}
            >
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
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  <Badge tone="indigo">{c.department}</Badge>
                  {c.unread > 0 && (
                    <span className="ml-auto min-w-5 h-5 px-1 grid place-items-center rounded-full bg-brix-600 text-white text-[11px] font-bold">
                      {c.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
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
