// Brix Chat — chromeless widget route (loaded inside the iframe injected by widget.js).
// No marketing chrome here: just the chat window. Bot-powered demo.

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { botReply } from '../lib/bot';
import { uid, fmtTime, cx } from '../lib/utils';

interface WMsg { id: string; from: 'visitor' | 'agent' | 'system'; text: string; ts: number; kind?: 'rating'; rating?: number }

const EMOJIS = ['😊', '👍', '🙏', '🎉', '❤️', '😅', '👋', '✅'];

export default function WidgetPage() {
  const [params] = useSearchParams();
  const { data } = useStore();
  const w = data.settings.widget;
  const accent = params.get('color') || w.color;

  const [msgs, setMsgs] = useState<WMsg[]>([
    { id: uid('w'), from: 'agent', text: w.greeting, ts: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [rated, setRated] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, typing]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const push = (m: Omit<WMsg, 'id' | 'ts'>) =>
    setMsgs((prev) => [...prev, { ...m, id: uid('w'), ts: Date.now() }]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    push({ from: 'visitor', text: t });
    setInput('');
    setTyping(true);
    const reply = botReply(t);
    timers.current.push(window.setTimeout(() => {
      setTyping(false);
      push({ from: 'agent', text: reply });
    }, 1200 + Math.random() * 1200));
  };

  const endChat = () => {
    push({ from: 'system', text: 'Chat ended. Thanks for chatting with us!' });
  };

  const radius = w.bubble === 'pill' ? 24 : w.bubble === 'square' ? 6 : w.radius;

  return (
    <div className="h-screen w-screen flex flex-col bg-white overflow-hidden" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* header */}
      <div className="px-4 py-3.5 flex items-center gap-3 text-white shrink-0" style={{ background: `linear-gradient(135deg, ${accent}, #06b6d4)` }}>
        <div className="w-10 h-10 rounded-full bg-white/20 grid place-items-center font-bold">
          {w.agentName.split(' ').map((x) => x[0]).slice(0, 2).join('')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[15px] leading-tight">{w.agentName}</div>
          <div className="text-xs text-white/85 flex items-center gap-1.5">
            <span className="relative flex w-2 h-2">
              <span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-emerald-300" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300" />
            </span>
            Online — replies instantly
          </div>
        </div>
        <button
          onClick={() => window.parent.postMessage('brixchat:close', '*')}
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
              <button key={n} onClick={() => { setRated(true); push({ from: 'system', text: `You rated this chat ${n}/5. Thank you!` }); }}
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
          <button onClick={() => push({ from: 'system', text: '📎 File sharing is available in the full dashboard demo.' })} className="w-9 h-9 grid place-items-center rounded-full hover:bg-slate-100 text-slate-500" aria-label="Attach">📎</button>
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
          {w.showBranding ? (
            <span className="text-[10px] text-slate-400">Powered by <span className="font-semibold text-slate-500">Brix Chat</span></span>
          ) : <span />}
          <button onClick={endChat} className="text-[10px] text-slate-400 hover:text-slate-600 underline">End chat</button>
        </div>
      </div>
    </div>
  );
}
