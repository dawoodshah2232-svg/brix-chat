// Brix Chat — chromeless widget route (loaded inside the iframe injected by widget.js).
// Uses the local API layer (src/lib/api.ts): the session is persisted in this
// browser's localStorage; agent replies are simulated by the demo bot until a
// backend phase wires up realtime. Talks to the loader via postMessage
// (brixchat:* events in, brixchat:cmd commands out).

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getApi } from '../lib/api';
import type { ApiConversation, ApiProperty } from '../lib/api';
import { botReply } from '../lib/bot';
import { uid, fmtTime, cx } from '../lib/utils';

const EMOJIS = ['😊', '👍', '🙏', '🎉', '❤️', '😅', '👋', '✅'];
const NS = 'brixchat';

interface WMsg {
  id: string;
  from: 'visitor' | 'agent' | 'system';
  text: string;
  ts: number;
}

function postToParent(type: string, payload: Record<string, unknown> = {}) {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ t: `${NS}:${type}`, payload }, '*');
    }
  } catch {
    /* not embedded */
  }
}

export default function WidgetPage() {
  const [params] = useSearchParams();
  const api = getApi('demo', 'widget');

  const propertyKey = params.get('property') || params.get('key') || '';
  const paramColor = params.get('color') || '';
  const paramGreeting = params.get('greeting') || '';
  const visitorName = params.get('v') || '';
  const visitorEmail = params.get('e') || '';
  const visitorHash = params.get('h') || '';

  const [property, setProperty] = useState<ApiProperty | null>(null);
  const [propError, setPropError] = useState('');
  const [conv, setConv] = useState<ApiConversation | null>(null);
  const [msgs, setMsgs] = useState<WMsg[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [rated, setRated] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const convRef = useRef<ApiConversation | null>(null);
  const chatStartedRef = useRef(false);

  convRef.current = conv;

  const accent = paramColor || property?.widget_config.color || '#4f46e5';
  const w = property?.widget_config;

  // resolve property + start session
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!propertyKey) {
        setPropError('Missing property key. Add data-property="bx_…" to the embed snippet.');
        return;
      }
      try {
        const { data: p } = await api.properties.getByPublicKey(propertyKey);
        if (cancelled) return;
        setProperty(p);
        const { data: c } = await api.conversations.startSession(p.id, {
          name: visitorName || undefined,
          email: visitorEmail || undefined,
          page_url: document.referrer || '',
        });
        if (cancelled) return;
        // apply greeting override
        if (paramGreeting && c.messages[0]) {
          c.messages[0].text = paramGreeting;
        }
        setConv(c);
        setMsgs(c.messages.map((m) => ({ id: m.id, from: m.sender === 'visitor' ? 'visitor' : m.sender === 'system' ? 'system' : 'agent', text: m.text, ts: new Date(m.created_at).getTime() })));
        postToParent('ready', { property: propertyKey, secureHash: Boolean(visitorHash) });
      } catch {
        if (!cancelled) setPropError(`Unknown property key "${propertyKey}". Check the embed snippet in Admin → Install.`);
      }
    })();
    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, typing]);

  // parent commands
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as { t?: string; cmd?: string; payload?: Record<string, unknown> };
      if (!d || d.t !== `${NS}:cmd`) return;
      const payload = d.payload ?? {};
      switch (d.cmd) {
        case 'config': {
          const v = payload.visitor as { name?: string; email?: string; hash?: string } | undefined;
          if (v?.name || v?.email) {
            // identity arrives after boot — stored for the transcript
            setAttributes((a) => ({ ...a, _visitor_name: v.name ?? '', _visitor_email: v.email ?? '' }));
          }
          break;
        }
        case 'setVisitor': {
          const v = payload.visitor as { name?: string; email?: string } | undefined;
          if (v) setAttributes((a) => ({ ...a, _visitor_name: v.name ?? '', _visitor_email: v.email ?? '' }));
          break;
        }
        case 'setAttributes':
          setAttributes((a) => ({ ...a, ...((payload.attributes as Record<string, string>) ?? {}) }));
          break;
        case 'setTags':
          setTags((payload.tags as string[]) ?? []);
          break;
        case 'trackEvent':
          // local-only: logged on the session for future analytics
          setAttributes((a) => ({ ...a, _last_event: String((payload as { name?: string }).name ?? '') }));
          break;
        case 'endChat':
          void endChat();
          break;
        case 'reset':
          window.location.reload();
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushLocal = (m: Omit<WMsg, 'id' | 'ts'>) =>
    setMsgs((prev) => [...prev, { ...m, id: uid('w'), ts: Date.now() }]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || !convRef.current) return;
    const c = convRef.current;
    pushLocal({ from: 'visitor', text: t });
    setInput('');
    postToParent('message', { dir: 'out', message: { text: t } });
    if (!chatStartedRef.current) {
      chatStartedRef.current = true;
      postToParent('chatStarted', {
        conversation_id: c.id,
        visitor: { name: c.visitor_name, attributes, tags },
        identity_hash: Boolean(visitorHash),
      });
    }
    void api.conversations.sendMessage(c.id, { sender: 'visitor', text: t });
    setTyping(true);
    const reply = botReply(t);
    timers.current.push(window.setTimeout(() => {
      const cc = convRef.current;
      setTyping(false);
      pushLocal({ from: 'agent', text: reply });
      postToParent('message', { dir: 'in', message: { text: reply } });
      if (cc) void api.conversations.sendMessage(cc.id, { sender: 'agent', text: reply });
    }, 1200 + Math.random() * 1200));
  };

  const endChat = async () => {
    const c = convRef.current;
    pushLocal({ from: 'system', text: 'Chat ended. Thanks for chatting with us!' });
    if (c) {
      await api.conversations.setStatus(c.id, 'closed');
      postToParent('chatEnded', { conversation_id: c.id });
    } else {
      postToParent('chatEnded', {});
    }
  };

  const rate = (n: number) => {
    setRated(true);
    pushLocal({ from: 'system', text: `You rated this chat ${n}/5. Thank you!` });
    const c = convRef.current;
    if (c) void api.conversations.setRating(c.id, n);
  };

  if (propError) {
    return (
      <div className="h-screen w-screen grid place-items-center bg-slate-50 p-6 text-center">
        <div className="max-w-sm">
          <div className="text-4xl mb-3">🧱</div>
          <div className="font-bold text-slate-900 mb-1">Widget not configured</div>
          <p className="text-sm text-slate-500">{propError}</p>
        </div>
      </div>
    );
  }

  if (!conv || !w) {
    return (
      <div className="h-screen w-screen grid place-items-center bg-white">
        <div className="flex gap-1.5">
          <span className="typing-dot w-2 h-2 rounded-full bg-slate-400 inline-block" />
          <span className="typing-dot w-2 h-2 rounded-full bg-slate-400 inline-block" />
          <span className="typing-dot w-2 h-2 rounded-full bg-slate-400 inline-block" />
        </div>
      </div>
    );
  }

  const radius = w.bubble === 'pill' ? 24 : w.bubble === 'square' ? 6 : 16;

  return (
    <div className="h-screen w-screen flex flex-col bg-white overflow-hidden" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* header */}
      <div className="px-4 py-3.5 flex items-center gap-3 text-white shrink-0" style={{ background: `linear-gradient(135deg, ${accent}, #06b6d4)` }}>
        <div className="w-10 h-10 rounded-full bg-white/20 grid place-items-center font-bold">
          {w.agent_name.split(' ').map((x) => x[0]).slice(0, 2).join('')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[15px] leading-tight">{w.agent_name}</div>
          <div className="text-xs text-white/85 flex items-center gap-1.5">
            <span className="relative flex w-2 h-2">
              <span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-emerald-300" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300" />
            </span>
            Online — replies instantly
          </div>
        </div>
        <button
          onClick={() => postToParent('close')}
          className="w-8 h-8 grid place-items-center rounded-lg hover:bg-white/20 text-white/90"
          aria-label="Close chat">✕</button>
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto slim-scroll px-4 py-4 space-y-3 bg-slate-50">
        {msgs.map((m) => m.from === 'system' ? (
          <div key={m.id} className="text-center">
            <span className="inline-block text-[11px] text-slate-500 bg-slate-200/70 px-3 py-1 rounded-full">{m.text}</span>
          </div>
        ) : (
          <div key={m.id} className={cx('flex', m.from === 'visitor' ? 'justify-end' : 'justify-start')}>
            <div className="max-w-[82%]">
              <div
                className={cx('px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-sm', m.from === 'visitor' ? 'text-white' : 'bg-white text-slate-800 border border-slate-100')}
                style={{ borderRadius: radius, background: m.from === 'visitor' ? accent : undefined }}>
                {m.text}
              </div>
              <div className={cx('text-[10px] text-slate-400 mt-1', m.from === 'visitor' ? 'text-right' : 'text-left')}>
                {fmtTime(m.ts)}
              </div>
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3 shadow-sm flex gap-1.5">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* CSAT */}
      {!rated && msgs.length > 3 && (
        <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100 flex items-center justify-between shrink-0">
          <span className="text-xs font-medium text-amber-900">How was this chat?</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => rate(n)}
                className="text-xl hover:scale-125 transition-transform" aria-label={`${n} stars`}>⭐</button>
            ))}
          </div>
        </div>
      )}

      {/* input */}
      <div className="p-3 border-t border-slate-100 bg-white shrink-0">
        {showEmoji && (
          <div className="grid grid-cols-8 gap-1 mb-2 p-2 bg-slate-50 rounded-xl">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => { setInput((v) => v + e); setShowEmoji(false); }} className="text-xl hover:scale-125 transition-transform">{e}</button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEmoji((v) => !v)} className="w-9 h-9 grid place-items-center rounded-full hover:bg-slate-100 text-lg" aria-label="Emoji">😊</button>
          <button onClick={() => pushLocal({ from: 'system', text: '📎 File sharing arrives with the backend phase.' })} className="w-9 h-9 grid place-items-center rounded-full hover:bg-slate-100 text-slate-500" aria-label="Attach">📎</button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(input)}
            placeholder="Type your message…"
            className="flex-1 px-3.5 py-2.5 rounded-full border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-brix-500/40 focus:border-brix-500"
          />
          <button onClick={() => send(input)} disabled={!input.trim()}
            className="w-10 h-10 rounded-full grid place-items-center text-white disabled:opacity-40 shrink-0"
            style={{ background: accent }} aria-label="Send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12l14-7-4 14-4-5-6-2z" fill="currentColor" /></svg>
          </button>
        </div>
        <div className="flex items-center justify-between mt-2 px-1">
          {w.show_branding ? (
            <span className="text-[10px] text-slate-400">Powered by <span className="font-semibold text-slate-500">Brix Chat</span></span>
          ) : <span />}
          <button onClick={() => void endChat()} className="text-[10px] text-slate-400 hover:text-slate-600 underline">End chat</button>
        </div>
      </div>
    </div>
  );
}
