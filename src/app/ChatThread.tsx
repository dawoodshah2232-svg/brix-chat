import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { getApi } from '../lib/api';
import type { ApiPlay } from '../lib/api';
import type { Canned, ChatMessage, ConvPriority, ConvStatus } from '../lib/types';
import { Avatar, Badge, Button, EmptyState, Input, Label, Select, Tabs, Textarea, Toggle } from '../components/ui';
import { cx, fmtDuration, timeAgo } from '../lib/utils';
import { botReply, botConfidence, OPENERS, DEFAULT_BOT_THRESHOLD, DEFAULT_HANDOFF_TIMEOUT_MINS } from '../lib/bot';
import { SentimentPill, QualityBadge } from '../components/dashboard/Sentiment';
import { suggestReplies } from '../lib/suggest';
import DispositionModal from '../components/dashboard/DispositionModal';
import { ReminderButton } from '../components/dashboard/Reminders';
import { TranslateControl, TranslatedText } from '../components/dashboard/TranslateControl';
import TranscriptExport from '../components/dashboard/TranscriptExport';
import { useDisposition } from '../lib/conversations';

interface Props {
  convId: string;
  input: string;
  setInput: (v: string | ((p: string) => string)) => void;
}

const EMOJIS = ['😀','😂','👍','👋','🙏','❤️','😊','🎉','✅','❌','⚠️','📌','📎','🔗','💡','🚀','⭐','🔥','💬','📞','📧','🕒','💰','🎯'];

import { fillCannedVars as fillVars } from '../lib/canned';

function VoiceMsg({ sec, mine }: { sec: number; mine: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const iv = window.setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= sec) { setPlaying(false); return 0; }
        return e + 1;
      });
    }, 1000);
    return () => window.clearInterval(iv);
  }, [playing, sec]);
  const bars = 14;
  return (
    <div className="flex items-center gap-2.5">
      <button
        onClick={() => setPlaying((p) => !p)}
        className={cx('w-8 h-8 rounded-full grid place-items-center text-sm shrink-0', mine ? 'bg-white/20 text-white' : 'bg-brix-100 text-brix-700')}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <div className="flex items-end gap-[3px] h-7">
        {Array.from({ length: bars }, (_, i) => (
          <span
            key={i}
            className="wave-bar w-1 rounded-full"
            style={{
              height: `${6 + ((i * 7) % 16)}px`,
              animationDelay: `${i * 90}ms`,
              animationPlayState: playing ? 'running' : 'paused',
              opacity: i / bars < elapsed / sec ? 1 : 0.45,
            }}
          />
        ))}
      </div>
      <span className={cx('text-xs font-semibold tabular-nums', mine ? 'text-white/80' : 'text-slate-500')}>
        {fmtDuration(playing ? elapsed : sec)}
      </span>
    </div>
  );
}

function MsgBubble({ m }: { m: ChatMessage }) {
  if (m.from === 'system') {
    return (
      <div className="flex justify-center my-1">
        <span className="px-3.5 py-1.5 rounded-full bg-slate-200/80 text-slate-600 text-xs font-medium max-w-[85%] text-center">
          {m.text}
        </span>
      </div>
    );
  }
  const mine = m.from === 'agent' || m.from === 'ai';
  return (
    <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
          m.from === 'visitor' && 'bg-white border border-slate-200/80 text-slate-800 rounded-tl-md',
          m.from === 'agent' && 'bg-brix-600 text-white rounded-tr-md',
          m.from === 'ai' && 'bg-violet-600 text-white rounded-tr-md',
        )}
      >
        {m.from === 'ai' && (
          <div className="text-[10px] font-bold uppercase tracking-wide text-violet-200 mb-1">🤖 Brix AI</div>
        )}
        {m.kind === 'text' && <div className="whitespace-pre-wrap"><TranslatedText text={m.text} /></div>}
        {m.kind === 'file' && (
          <div className="flex items-center gap-2">
            <span className="text-lg">📎</span>
            <div>
              <div className="font-semibold text-[13px]">{m.fileName ?? 'Attachment'}</div>
              <div className={cx('text-[11px]', mine ? 'text-white/70' : 'text-slate-500')}>{m.fileSize ?? ''}</div>
            </div>
          </div>
        )}
        {m.kind === 'voice' && <VoiceMsg sec={m.durationSec ?? 12} mine={mine} />}
        {m.kind === 'rating' && (
          <div className="flex items-center gap-2">
            <span className="text-base tracking-tight">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={i < (m.rating ?? 0) ? '' : 'opacity-25'}>⭐</span>
              ))}
            </span>
            <span className={cx('text-xs font-bold', mine ? 'text-white/80' : 'text-slate-500')}>{m.rating}/5</span>
          </div>
        )}
        <div className={cx('text-[10px] mt-1 font-medium', mine ? 'text-white/60 text-right' : 'text-slate-500')}>
          {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {m.name && mine && ` · ${m.name}`}
        </div>
      </div>
    </div>
  );
}

export default function ChatThread({ convId, input, setInput }: Props) {
  const {
    session, data, getConversation, addMessage, updateConversation,
    markRead, addNote, toggleTag, resolveConversation, trackCannedUsage,
    effectiveWorkspaceId,
  } = useStore();
  const navigate = useNavigate();

  const conv = getConversation(convId);

  const [typing, setTyping] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const [showPlays, setShowPlays] = useState(false);
  const [plays, setPlays] = useState<ApiPlay[]>([]);
  const [railTab, setRailTab] = useState<'details' | 'notes'>('details');
  const [noteText, setNoteText] = useState('');
  const [tagText, setTagText] = useState('');
  const [busy, setBusy] = useState(false);
  const [dispOpen, setDispOpen] = useState(false);
  const [disposition] = useDisposition(effectiveWorkspaceId(), convId);

  const timers = useRef<number[]>([]);
  const openerFired = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };

  // Open / switch conversation: mark read, reset local UI, maybe fire visitor opener
  useEffect(() => {
    markRead(convId);
    setTyping(false);
    setRecording(false);
    setShowEmoji(false);
    setShowCanned(false);
    setRailTab('details');
    const c = getConversation(convId);
    if (c && c.live && c.status === 'open' && !openerFired.current.has(convId)) {
      openerFired.current.add(convId);
      if (c.messages.filter((m) => m.from === 'visitor').length < 2) {
        later(() => {
          addMessage(convId, {
            from: 'visitor',
            kind: 'text',
            text: OPENERS[Math.floor(Math.random() * OPENERS.length)],
          });
        }, 2000);
      }
    }
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv?.messages.length, typing]);

  // Global "R" shortcut → focus the composer
  useEffect(() => {
    const focus = () => composerRef.current?.querySelector('input')?.focus();
    window.addEventListener('brix:focus-reply', focus);
    return () => window.removeEventListener('brix:focus-reply', focus);
  }, []);

  // Load plays for the runner (local API)
  useEffect(() => {
    if (!session || !showPlays) return;
    getApi(effectiveWorkspaceId(), session.displayName).plays.list()
      .then(({ data: p }) => setPlays(p))
      .catch(() => {});
  }, [session, showPlays]);

  if (!conv) {
    return (
      <div className="flex-1 grid place-items-center">
        <EmptyState icon="🔍" title="Conversation not found" />
      </div>
    );
  }

  const visitorTexts = conv.messages.filter((m) => m.from === 'visitor').map((m) => m.text);
  const agentName = session?.displayName ?? 'Agent';

  // ---- canned slash menu + variables -----------------------------------------
  const varCtx = () => ({
    name: agentName,
    visitor: conv.visitor,
    workspace: effectiveWorkspaceId(),
    department: conv.department,
  });
  const slashActive = input.startsWith('/');
  const slashQuery = slashActive ? input.slice(1).trim().toLowerCase() : '';
  const myCanned = data.canned.filter((c) => c.shared !== false || c.owner === agentName);
  const slashMatches = myCanned.filter((c) =>
    !slashQuery ||
    c.shortcut.toLowerCase().includes(slashQuery) ||
    c.title.toLowerCase().includes(slashQuery) ||
    c.body.toLowerCase().includes(slashQuery),
  );
  const insertCanned = (c: Canned) => {
    setInput(fillVars(c.body, varCtx()));
    trackCannedUsage(c.id);
    setShowCanned(false);
  };

  // ---- plays runner (applies steps to the local conversation) -----------------
  const runPlay = (play: ApiPlay) => {
    setShowPlays(false);
    const ctx = varCtx();
    for (const step of play.steps) {
      const value = fillVars(step.value, ctx);
      if (step.kind === 'reply' && value.trim()) {
        addMessage(convId, { from: 'agent', kind: 'text', text: value.trim(), name: agentName });
      } else if (step.kind === 'note' && value.trim()) {
        addNote(convId, `▶ ${play.name}: ${value.trim()}`);
      } else if (step.kind === 'tag' && value.trim()) {
        const t = value.trim().toLowerCase();
        if (!conv.tags.includes(t)) toggleTag(convId, t);
      } else if (step.kind === 'assign' && value.trim()) {
        updateConversation(convId, { agent: value.trim() });
      } else if (step.kind === 'priority') {
        const p = value.trim().toLowerCase();
        if (['low', 'medium', 'high', 'urgent'].includes(p)) updateConversation(convId, { priority: p as ConvPriority });
      }
    }
    addMessage(convId, { from: 'system', kind: 'text', text: `▶ Play “${play.name}” applied (${play.steps.length} steps).` });
  };

  // ---- unanswered-question logging (knowledge-gap loop) -----------------------
  const logUnanswered = async () => {
    if (!session || busy) return;
    const lastVisitor = [...conv.messages].reverse().find((m) => m.from === 'visitor' && m.text.trim());
    const question = input.trim() || lastVisitor?.text.trim() || '';
    if (!question) return;
    setBusy(true);
    try {
      await getApi(effectiveWorkspaceId(), session.displayName).unanswered.add(question, convId);
      addMessage(convId, { from: 'system', kind: 'text', text: '❓ Logged as an unanswered question — it will appear in the knowledge-gap log.' });
      setInput('');
    } catch { /* ignore */ }
    setBusy(false);
  };

  // ---- create ticket from this chat -------------------------------------------
  const createTicket = async () => {
    if (!session || busy) return;
    setBusy(true);
    try {
      const transcript = conv.messages.map((m) => `${m.from}: ${m.text}`).join('\n');
      const { data: t } = await getApi(effectiveWorkspaceId(), session.displayName).tickets.create({
        subject: `Chat with ${conv.visitor} (${conv.page})`,
        message: transcript || 'Created from chat.',
        requester_name: conv.visitor,
        priority: conv.priority ?? 'medium',
        conversation_id: convId,
        tags: conv.tags,
      });
      addMessage(convId, { from: 'system', kind: 'text', text: `🎫 Ticket created from this chat.` });
      navigate(`/app/tickets?ticket=${t.id}`);
    } catch { /* ignore */ }
    setBusy(false);
  };

  const send = () => {
    const text = input.trim();
    if (!text || conv.status !== 'open') return;
    // P4-18: confidence threshold gates AI auto-answering (heuristic, not AI certainty)
    const lastVisitor = [...conv.messages].reverse().find((m) => m.from === 'visitor');
    const conf = lastVisitor && lastVisitor.text ? botConfidence(lastVisitor.text) : 100;
    const threshold = data.settings.bot?.confidenceThreshold ?? DEFAULT_BOT_THRESHOLD;
    const lowConf = conv.aiHandled && conf < threshold;
    const asAi = conv.aiHandled && !lowConf;
    if (lowConf) {
      addMessage(convId, {
        from: 'system', kind: 'text',
        text: `Low AI confidence (${conf}% < ${threshold}% threshold) — routed to a human instead of auto-answering. Confidence is a keyword-heuristic estimate.`,
      });
    }
    addMessage(convId, {
      from: asAi ? 'ai' : 'agent',
      kind: 'text',
      text,
      name: asAi ? 'Brix AI' : agentName,
    });
    setInput('');
    setShowEmoji(false);
    setShowCanned(false);
    setTyping(true);
    later(() => {
      setTyping(false);
      addMessage(convId, { from: 'visitor', kind: 'text', text: botReply(text) });
    }, 1000 + Math.random() * 1200);
  };

  // Wrap-up disposition is collected first; resolve only after the agent picks one.
  const handleResolve = () => setDispOpen(true);

  const finishResolve = () => {
    setDispOpen(false);
    resolveConversation(convId);
    later(() => {
      const rating = Math.random() < 0.7 ? 5 : 4;
      addMessage(convId, { from: 'visitor', kind: 'rating', text: '', rating, name: conv.visitor });
      updateConversation(convId, { rating });
    }, 4000);
  };

  const handleTransferDept = (dept: string) => {
    if (!dept) return;
    updateConversation(convId, { department: dept, agent: 'Unassigned' });
    addMessage(convId, { from: 'system', kind: 'text', text: `Chat transferred to ${dept}` });
  };

  const handleTransferAgent = (name: string) => {
    if (!name) return;
    updateConversation(convId, { agent: name });
    addMessage(convId, { from: 'system', kind: 'text', text: `${name} joined the chat` });
  };

  const handleAttach = () => {
    const n = Math.floor(Math.random() * 900) + 120;
    addMessage(convId, {
      from: 'agent', kind: 'file', text: '',
      fileName: `screenshot_${Date.now().toString(36)}.png`,
      fileSize: `${(n / 1024).toFixed(1)} MB`,
      name: agentName,
    });
  };

  const handleMic = () => {
    if (recording) return;
    setRecording(true);
    later(() => {
      setRecording(false);
      addMessage(convId, {
        from: 'agent', kind: 'voice', text: '',
        durationSec: 7 + Math.floor(Math.random() * 17),
        name: agentName,
      });
    }, 2000);
  };

  const statusTone: Record<ConvStatus, 'green' | 'slate' | 'rose' | 'amber'> = {
    open: 'green', closed: 'slate', spam: 'rose', missed: 'amber',
  };

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Thread column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="shrink-0 bg-white border-b border-slate-200/80 px-4 sm:px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar name={conv.visitor} size="lg" />
              {conv.live && conv.status === 'open' && (
                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display font-bold text-slate-900">{conv.visitor}</span>
                <Badge tone={statusTone[conv.status]}>{conv.status}</Badge>
                {disposition && (
                  <span title={`Closed by ${disposition.by} — wrap-up note: ${disposition.note || 'none'}`}>
                    <Badge tone="indigo">✓ {disposition.code}</Badge>
                  </span>
                )}
                <SentimentPill texts={visitorTexts} />
                <QualityBadge conv={conv} />
                {conv.rating && <Badge tone="amber">⭐ {conv.rating}/5</Badge>}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">
                📍 {conv.city}, {conv.country} · 🖥 {conv.device} · {conv.page}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
              <TranslateControl />
              <ReminderButton workspace={effectiveWorkspaceId()} conversationId={convId} visitor={conv.visitor} />
              <TranscriptExport conv={conv} />
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500" title="AI handles this chat">
                🤖
                <Toggle checked={conv.aiHandled} onChange={(v) => updateConversation(convId, { aiHandled: v })} label="AI handles chat" />
              </label>
              {conv.status === 'open' && (
                <>
                  <Select value="" onChange={(e) => { handleTransferDept(e.target.value); e.target.value = ''; }} className="text-xs" title="Transfer to department">
                    <option value="">Transfer ↦</option>
                    {data.settings.departments.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Select>
                  <Select value="" onChange={(e) => { handleTransferAgent(e.target.value); e.target.value = ''; }} className="text-xs" title="Transfer to teammate">
                    <option value="">👤 Assign</option>
                    {data.settings.team.map((t) => (
                      <option key={t.name} value={t.name}>{t.name}{t.online ? ' 🟢' : ''}</option>
                    ))}
                  </Select>
                  <Button size="sm" variant="secondary" onClick={handleResolve}>✓ Resolve</Button>
                  <Button size="sm" variant="secondary" onClick={createTicket}>🎫 Ticket</Button>
                  <button onClick={logUnanswered} title="Log as unanswered question"
                    className="w-8 h-8 grid place-items-center rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-600 transition">
                    ❓
                  </button>
                  <button onClick={() => updateConversation(convId, { status: 'spam', live: false })} title="Mark as spam"
                    className="w-8 h-8 grid place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition">
                    🚫
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* P4-18: handoff-timeout escalation banner */}
        {(() => {
          const timeoutMs = (data.settings.bot?.handoffTimeoutMins ?? DEFAULT_HANDOFF_TIMEOUT_MINS) * 60000;
          const pickedUp = conv.messages.some((m) => m.from === 'agent');
          const waitingMins = Math.floor((Date.now() - conv.createdAt) / 60000);
          if (!conv.aiHandled || conv.status !== 'open' || pickedUp || Date.now() - conv.createdAt < timeoutMs) return null;
          return (
            <div className="shrink-0 mx-4 sm:mx-6 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-center gap-3">
              <span className="text-sm text-amber-800">
                ⏱ AI has handled this chat for <strong>{waitingMins} min</strong> with no agent pickup
                (timeout {data.settings.bot?.handoffTimeoutMins ?? DEFAULT_HANDOFF_TIMEOUT_MINS} min).
              </span>
              <button onClick={() => updateConversation(convId, { aiHandled: false })}
                className="ml-auto shrink-0 text-xs font-bold text-amber-900 bg-amber-200/70 hover:bg-amber-200 rounded-lg px-2.5 py-1.5 transition">
                Take over
              </button>
            </div>
          );
        })()}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto slim-scroll px-4 sm:px-6 py-5 space-y-3 bg-slate-50">
          {conv.messages.map((m) => (
            <MsgBubble key={m.id} m={m} />
          ))}
          {typing && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200/80 rounded-2xl rounded-tl-md px-4 py-3 flex gap-1.5 shadow-sm">
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        {conv.status === 'open' ? (
          <div className="shrink-0 bg-white border-t border-slate-200/80 px-4 sm:px-5 py-3">
            <div className="relative">
              {showEmoji && (
                <div className="absolute bottom-14 left-0 z-30 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 grid grid-cols-8 gap-1 animate-fade-up">
                  {EMOJIS.map((e) => (
                    <button key={e} onClick={() => setInput((v) => v + e)} className="w-9 h-9 grid place-items-center text-xl rounded-lg hover:bg-slate-100">
                      {e}
                    </button>
                  ))}
                </div>
              )}
              {showCanned && (
                <div className="absolute bottom-14 left-0 z-30 w-80 max-h-64 overflow-y-auto slim-scroll bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 animate-fade-up">
                  <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {slashActive ? `Canned — matching “${input}”` : 'Canned responses'} <span className="normal-case font-medium">(type / to search)</span>
                  </div>
                  {(slashActive ? slashMatches : myCanned).map((c) => (
                    <button key={c.id} onClick={() => insertCanned(c)}
                      className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-slate-50">
                      <div className="text-sm font-semibold text-slate-800">⚡ {c.title} <span className="text-slate-500 font-normal text-xs">/{c.shortcut}</span></div>
                      <div className="text-xs text-slate-500 truncate">{c.body}</div>
                    </button>
                  ))}
                  {slashMatches.length === 0 && slashActive && <div className="px-2.5 py-3 text-sm text-slate-500">No canned responses match.</div>}
                  {myCanned.length === 0 && !slashActive && <div className="px-2.5 py-3 text-sm text-slate-500">No canned responses yet.</div>}
                  <div className="px-2 py-1.5 text-[11px] text-slate-500 border-t border-slate-100 mt-1">
                    Variables: <code className="font-mono">{'{{name}} {{visitor}} {{workspace}} {{department}}'}</code>
                  </div>
                </div>
              )}
              {showPlays && (
                <div className="absolute bottom-14 left-12 z-30 w-80 max-h-64 overflow-y-auto slim-scroll bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 animate-fade-up">
                  <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">▶ Run a play</div>
                  {plays.map((p) => (
                    <button key={p.id} onClick={() => runPlay(p)}
                      className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-slate-50">
                      <div className="text-sm font-semibold text-slate-800">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.steps.length} step{p.steps.length === 1 ? '' : 's'} · {p.steps.map((s) => s.kind).join(', ')}</div>
                    </button>
                  ))}
                  {plays.length === 0 && <div className="px-2.5 py-3 text-sm text-slate-500">No plays yet — create one in Settings.</div>}
                </div>
              )}
              {(() => {
                const sg = suggestReplies({
                  visitorName: conv.visitor,
                  department: conv.department,
                  messages: conv.messages,
                  canned: data.canned,
                  articles: data.articles,
                }).slice(0, 3);
                if (sg.length === 0 || input.trim()) return null;
                return (
                  <div className="flex gap-2 overflow-x-auto pb-2 slim-scroll" title="Suggested replies — simulated drafts">
                    {sg.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => setInput(g.text)}
                        className="shrink-0 max-w-64 truncate text-left text-xs bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-900 rounded-full px-3 py-1.5 transition"
                        title={g.text}
                      >
                        ✨ {g.text.length > 60 ? g.text.slice(0, 60) + '…' : g.text}
                      </button>
                    ))}
                  </div>
                );
              })()}
              <div className="flex items-end gap-2" ref={composerRef}>
                <div className="flex gap-1 pb-1">
                  <button onClick={() => { setShowEmoji((v) => !v); setShowCanned(false); setShowPlays(false); }} className={cx('w-9 h-9 grid place-items-center rounded-xl text-lg hover:bg-slate-100', showEmoji && 'bg-slate-100')} title="Emoji">😊</button>
                  <button onClick={() => { setShowCanned((v) => !v); setShowEmoji(false); setShowPlays(false); }} className={cx('w-9 h-9 grid place-items-center rounded-xl text-lg hover:bg-slate-100', showCanned && 'bg-slate-100')} title="Canned responses">⚡</button>
                  <button onClick={() => { setShowPlays((v) => !v); setShowEmoji(false); setShowCanned(false); }} className={cx('w-9 h-9 grid place-items-center rounded-xl text-lg hover:bg-slate-100', showPlays && 'bg-slate-100')} title="Run a play">▶</button>
                  <button onClick={handleAttach} className="w-9 h-9 grid place-items-center rounded-xl text-lg hover:bg-slate-100" title="Attach file">📎</button>
                  <button onClick={handleMic} className={cx('w-9 h-9 grid place-items-center rounded-xl text-lg hover:bg-slate-100', recording && 'bg-rose-100 animate-pulse')} title="Voice message">
                    {recording ? '⏺' : '🎙'}
                  </button>
                </div>
                <div className="flex-1">
                  <Input
                    value={input}
                    onChange={(e) => { const v = e.target.value; setInput(v); if (v.startsWith('/')) { setShowCanned(true); setShowEmoji(false); setShowPlays(false); } }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (slashActive && showCanned && slashMatches.length > 0) insertCanned(slashMatches[0]);
                        else send();
                      }
                      if (e.key === 'Escape') { setShowCanned(false); setShowPlays(false); setShowEmoji(false); }
                    }}
                    placeholder={recording ? 'Recording… (2s)' : `Reply to ${conv.visitor.split(' ')[0]}… (type / for canned)`}
                    disabled={recording}
                  />
                </div>
                <Button onClick={send} disabled={!input.trim()}>Send ➤</Button>
              </div>
              {recording && <div className="text-xs text-rose-600 font-semibold mt-1.5">● Recording voice message…</div>}
            </div>
          </div>
        ) : (
          <div className="shrink-0 bg-white border-t border-slate-200/80 px-5 py-4 text-center text-sm text-slate-500">
            This conversation is {conv.status}. {conv.status === 'spam' && 'It was flagged as spam.'}
          </div>
        )}
      </div>

      {/* Right rail */}
      <div className="hidden md:flex w-72 shrink-0 flex-col bg-white border-l border-slate-200/80">
        <div className="p-3 border-b border-slate-100">
          <Tabs<'details' | 'notes'>
            tabs={[{ id: 'details', label: 'Details' }, { id: 'notes', label: `Notes (${conv.notes.length})` }]}
            active={railTab}
            onChange={setRailTab}
          />
        </div>
        <div className="flex-1 overflow-y-auto slim-scroll p-4">
          {railTab === 'details' ? (
            <div className="space-y-5">
              <div>
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {conv.tags.map((t) => (
                    <button key={t} onClick={() => toggleTag(convId, t)} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-brix-100 text-brix-700 text-[11px] font-semibold hover:bg-rose-100 hover:text-rose-700" title="Remove tag">
                      {t} ✕
                    </button>
                  ))}
                  {conv.tags.length === 0 && <span className="text-xs text-slate-500">No tags yet</span>}
                </div>
                <div className="flex gap-1.5">
                  <Input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Add tag…" className="py-1.5 text-xs"
                    onKeyDown={(e) => { if (e.key === 'Enter') { toggleTag(convId, tagText); setTagText(''); } }} />
                  <Button size="sm" variant="secondary" onClick={() => { toggleTag(convId, tagText); setTagText(''); }}>Add</Button>
                </div>
              </div>
              <div>
                <Label>Department</Label>
                <Select value={conv.department} onChange={(e) => updateConversation(convId, { department: e.target.value })} className="w-full">
                  {data.settings.departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </Select>
              </div>
              <div>
                <Label>Assigned agent</Label>
                <Select value={conv.agent ?? ''} onChange={(e) => updateConversation(convId, { agent: e.target.value })} className="w-full">
                  <option value="Unassigned">Unassigned</option>
                  {data.settings.team.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                </Select>
              </div>
              <div className="space-y-2 text-sm">
                <Label>Visitor info</Label>
                {[
                  ['🌐 Page', conv.page],
                  ['🖥 Device', conv.device],
                  ['📍 Location', `${conv.city}, ${conv.country}`],
                  ['🕒 Started', timeAgo(conv.createdAt)],
                  ['⭐ Satisfaction', conv.rating ? `${conv.rating}/5 CSAT` : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 text-xs">
                    <span className="text-slate-500 font-medium">{k}</span>
                    <span className="text-slate-800 font-semibold text-right truncate max-w-40" title={v}>{v}</span>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => navigate(`/app/contacts?search=${encodeURIComponent(conv.visitor)}`)}
              >
                📇 View contact timeline
              </Button>
              {disposition && (
                <div className="rounded-xl bg-brix-50 border border-brix-100 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-brix-600 mb-1">Wrap-up</div>
                  <div className="text-xs font-semibold text-slate-800">{disposition.code}</div>
                  {disposition.note && <div className="text-xs text-slate-500 mt-1">{disposition.note}</div>}
                  <div className="text-[11px] text-slate-500 mt-1">{disposition.by} · {timeAgo(disposition.at)}</div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="space-y-2.5 mb-4">
                {conv.notes.length === 0 && <div className="text-xs text-slate-500">No internal notes yet.</div>}
                {conv.notes.map((n) => (
                  <div key={n.id} className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <div className="text-[13px] text-slate-800 whitespace-pre-wrap">{n.text}</div>
                    <div className="text-[11px] text-slate-500 mt-1.5 font-medium">{n.author} · {timeAgo(n.ts)}</div>
                  </div>
                ))}
              </div>
              <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add an internal note…" rows={3} />
              <Button size="sm" variant="secondary" className="mt-2 w-full"
                disabled={!noteText.trim()}
                onClick={() => { addNote(convId, noteText.trim()); setNoteText(''); }}>
                Add note
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Conversation Operations: wrap-up disposition */}
      <DispositionModal
        open={dispOpen}
        workspace={effectiveWorkspaceId()}
        conversationId={convId}
        visitor={conv.visitor}
        agentName={agentName}
        onDone={finishResolve}
        onClose={() => setDispOpen(false)}
      />
    </div>
  );
}
