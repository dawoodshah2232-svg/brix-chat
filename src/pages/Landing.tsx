// Brix Chat — marketing landing page.

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { botReply } from '../lib/bot';
import { cx } from '../lib/utils';
import { Button } from '../components/ui';
import { Seo, jsonLdOrganization, jsonLdWebSite } from '../lib/seo';

// ---------------------------------------------------------------- live demo

interface DemoMsg {
  from: 'visitor' | 'bot';
  text: string;
}

const DEMO_GREETING: DemoMsg = {
  from: 'bot',
  text: 'Hey! I’m the Brix demo assistant — running right here in your browser. Ask me anything. Try “how much does it cost?” or “do you integrate with Shopify?”',
};

function LiveDemo() {
  const [messages, setMessages] = useState<DemoMsg[]>([DEMO_GREETING]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, typing]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || typing) return;
    setMessages((m) => [...m, { from: 'visitor', text }]);
    setInput('');
    setTyping(true);
    timerRef.current = window.setTimeout(() => {
      setMessages((m) => [...m, { from: 'bot', text: botReply(text) }]);
      setTyping(false);
    }, 900);
  };

  const suggestions = ['How much does it cost?', 'Do you integrate with Shopify?', 'What if nobody is online?'];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-brix-600/10 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-brix-600 to-aqua-500 text-white">
          <span className="w-10 h-10 rounded-full bg-white/20 grid place-items-center font-display font-bold">B</span>
          <div>
            <div className="font-semibold text-sm">Brix demo assistant</div>
            <div className="text-xs text-white/80 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" /> Online now
            </div>
          </div>
          <span className="ml-auto text-xs bg-white/20 rounded-full px-2.5 py-1 font-medium">Live demo</span>
        </div>
        <div className="h-80 overflow-y-auto px-5 py-5 space-y-3 slim-scroll bg-slate-50/60" role="log" aria-live="polite" aria-label="Demo chat">
          {messages.map((m, i) => (
            <div key={i} className={cx('flex', m.from === 'visitor' ? 'justify-end' : 'justify-start')}>
              <div
                className={cx(
                  'max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                  m.from === 'visitor'
                    ? 'bg-brix-600 text-white rounded-br-md'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm',
                )}
              >
                {m.text}
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5" aria-label="Assistant is typing">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
                    style={{ animationDelay: `${d * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="px-4 py-3 border-t border-slate-100 bg-white">
          <div className="flex flex-wrap gap-2 mb-3">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setInput(s);
                }}
                className="text-xs font-medium text-brix-700 bg-brix-50 hover:bg-brix-100 border border-brix-200 rounded-full px-3 py-1.5 transition"
              >
                {s}
              </button>
            ))}
          </div>
          <form onSubmit={send} className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message…"
              aria-label="Type a message"
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-brix-500/40 focus:border-brix-500"
            />
            <Button type="submit" size="md" disabled={!input.trim()}>
              Send
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- data

const FEATURES = [
  { icon: '💬', title: 'A widget your brand would wear', desc: 'Every color, corner and label is yours. No dated bubble, no forced branding — it matches your site pixel for pixel.' },
  { icon: '🤖', title: 'AI that answers first', desc: 'A chatbot trained on your help docs greets visitors, resolves the easy stuff and hands off with a full transcript.' },
  { icon: '👀', title: 'See visitors live', desc: 'Watch who is on your site, what page they are reading and what they are typing — then jump in before they bounce.' },
  { icon: '⚡', title: 'Proactive triggers', desc: 'Smart rules start the right conversation: exit-intent, cart value, time on pricing — with quick-reply buttons built in.' },
  { icon: '🌍', title: 'Speak their language', desc: 'Both sides type in their own language. Messages translate instantly, in over 50 languages.' },
  { icon: '📚', title: 'Help center included', desc: 'A hosted knowledge base with drafts, categories and custom URLs — so answers exist before anyone asks.' },
  { icon: '🔔', title: 'Alerts that actually arrive', desc: 'Granular notification rules with push and SMS failover. Missed chats become tickets automatically.' },
  { icon: '🛡️', title: 'Trust by default', desc: 'Verified-business badges, visitor bans, country controls and honest analytics you can check against GA.' },
];

const STEPS = [
  { n: '1', title: 'Paste one snippet', desc: 'Drop a tiny async script into your site — or one-click install on Shopify, WordPress, Wix and Squarespace.' },
  { n: '2', title: 'Make it yours', desc: 'Tune colors, position, greeting text and triggers in the dashboard. Preview every state: online, away, offline.' },
  { n: '3', title: 'Talk to visitors', desc: 'Your team answers from the inbox, iOS and Android apps or desktop — with the AI copilot drafting alongside.' },
];

const FAQS = [
  {
    q: 'Is the core really free?',
    a: 'Yes — unlimited agents, unlimited websites, unlimited chat history, the widget, the dashboard, triggers and the knowledge base. No trial clock, no card required. We earn from optional add-ons like white-label, AI packs and voice/video.',
  },
  {
    q: 'How long does setup take?',
    a: 'Minutes. Paste the snippet or use a one-click installer, tweak the look, and you are live. Most teams take their first real chat within an hour of signing up.',
  },
  {
    q: 'What happens when no agent is online?',
    a: 'The widget switches to your offline state automatically: visitors leave a message through a clean form, and it lands in your inbox as a ticket with email threading — so the conversation continues by email.',
  },
  {
    q: 'Can the AI handle conversations on its own?',
    a: 'It can greet visitors, answer from your knowledge base and qualify leads, then hand off to a human with a full transcript whenever it is unsure. You set the confidence threshold and the handoff rules.',
  },
  {
    q: 'Do visitors get translated messages?',
    a: 'Both sides type in their own language and every message is translated in real time — per message, in over 50 languages. No language packs to install.',
  },
  {
    q: 'How is Brix Chat different from other free chat tools?',
    a: 'Three things: a modern dashboard that does not look like 2012, notifications you can trust with SMS failover, and verified-business badges so visitors know the widget is safe. Free should not mean flaky.',
  },
];

const QUOTES = [
  {
    quote: 'We replaced a paid tool on a Tuesday afternoon. By Thursday our response time was under a minute and the team refused to switch back.',
    name: 'Layla Haddad', role: 'Head of CX, Noor Retail',
  },
  {
    quote: 'The triggers caught 40 carts we would have lost last month. It paid for the AI pack about eleven times over.',
    name: 'Omar Farouk', role: 'Founder, DesertCart Co.',
  },
  {
    quote: 'Finally a chat widget that does not embarrass our brand. The AI drafts are so on-tone that customers think we hired overnight staff.',
    name: 'Sofia Marchetti', role: 'Support Lead, Velora Studio',
  },
];

// ---------------------------------------------------------------- page

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto max-w-3xl divide-y divide-slate-200 border-y border-slate-200">
      {FAQS.map((f, i) => (
        <div key={f.q}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between gap-4 py-5 text-left"
            aria-expanded={open === i}
          >
            <span className="font-display font-semibold text-slate-900">{f.q}</span>
            <span className={cx('text-brix-600 transition-transform text-lg', open === i && 'rotate-45')}>+</span>
          </button>
          {open === i && <p className="pb-6 text-slate-600 leading-relaxed">{f.a}</p>}
        </div>
      ))}
    </div>
  );
}

function SectionHeading({ eyebrow, title, sub, dark = false }: { eyebrow: string; title: string; sub?: string; dark?: boolean }) {
  return (
    <div className="mx-auto max-w-3xl text-center mb-12">
      <div className={cx('text-xs font-bold uppercase tracking-widest', dark ? 'text-aqua-400' : 'text-brix-600')}>{eyebrow}</div>
      <h2 className={cx('mt-3 font-display text-3xl sm:text-4xl font-extrabold tracking-tight', dark ? 'text-white' : 'text-slate-900')}>
        {title}
      </h2>
      {sub && <p className={cx('mt-4 text-lg leading-relaxed', dark ? 'text-slate-400' : 'text-slate-600')}>{sub}</p>}
    </div>
  );
}

export default function Landing() {
  return (
    <main>
      <Seo
        title="Brix Chat — Live Chat Widget, AI Copilot & Helpdesk for Modern Teams"
        description="Brix Chat is the modern live-chat platform: an embeddable website widget, a real-time agent dashboard, AI reply copilot, smart triggers, ticketing and analytics — free core, no per-agent fees."
        path="/"
        jsonLd={[jsonLdOrganization(), jsonLdWebSite()]}
      />
      {/* hero */}
      <section className="relative overflow-hidden bg-ink-950">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -top-40 -left-40 w-[560px] h-[560px] rounded-full bg-brix-600/25 blur-[140px]" />
          <div className="absolute top-20 -right-40 w-[520px] h-[520px] rounded-full bg-aqua-500/15 blur-[140px]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_35%,black,transparent)]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-20 pb-24 sm:pt-28 sm:pb-32 grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-aqua-300 bg-aqua-500/10 border border-aqua-500/25 rounded-full px-3.5 py-1.5 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-aqua-400" /> Core product free forever
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.08]">
              Chat with your visitors like{' '}
              <span className="bg-gradient-to-r from-brix-400 via-brix-300 to-aqua-300 bg-clip-text text-transparent">
                you built the internet
              </span>{' '}
              yesterday.
            </h1>
            <p className="mt-6 text-lg text-slate-400 leading-relaxed max-w-xl">
              Brix Chat is live chat for modern teams: a beautiful widget, a fast agent inbox and an AI copilot — free at
              its core, live on your site in minutes.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                to="/signup"
                className="text-center px-7 py-3.5 text-base font-semibold text-white rounded-xl bg-gradient-to-r from-brix-600 to-aqua-500 hover:opacity-90 shadow-xl shadow-brix-600/30 transition"
              >
                Start free — no card
              </Link>
              <a
                href="#demo"
                className="text-center px-7 py-3.5 text-base font-semibold text-white rounded-xl border border-white/20 hover:bg-white/10 transition"
              >
                Try the live demo ↓
              </a>
            </div>
            <dl className="mt-10 flex gap-8">
              {[
                ['∞', 'Agents & sites'],
                ['50+', 'Languages'],
                ['<1m', 'Median setup'],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="font-display text-2xl font-extrabold text-white">{v}</dd>
                  <dd className="text-xs text-slate-500 mt-0.5">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          {/* floating chat mock */}
          <div className="relative hidden sm:block" aria-hidden>
            <div className="absolute inset-0 bg-gradient-to-br from-brix-600/20 to-aqua-500/10 blur-2xl rounded-full" />
            <div className="relative mx-auto max-w-sm rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5 shadow-2xl animate-[float_6s_ease-in-out_infinite]">
              <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                <span className="w-10 h-10 rounded-full bg-gradient-to-br from-brix-500 to-aqua-400 grid place-items-center text-white font-bold">S</span>
                <div>
                  <div className="text-sm font-semibold text-white">Sara — Support</div>
                  <div className="text-xs text-emerald-400">● Online</div>
                </div>
              </div>
              <div className="py-4 space-y-3 text-sm">
                <div className="bg-white/10 text-slate-200 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[85%]">
                  Do you ship to Riyadh? 🇸🇦
                </div>
                <div className="ml-auto bg-gradient-to-r from-brix-600 to-brix-500 text-white rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%]">
                  Yes — 2–3 days, free over $50. Want me to track your order too?
                </div>
                <div className="bg-white/10 text-slate-200 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[85%]">
                  That would be amazing, thank you!
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <div className="flex-1 h-10 rounded-xl bg-white/10" />
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brix-600 to-aqua-500 grid place-items-center text-white">➤</div>
              </div>
            </div>
            <style>{`@keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-12px) } }`}</style>
          </div>
        </div>
      </section>

      {/* live demo */}
      <section id="demo" className="py-24 sm:py-28 bg-slate-50 scroll-mt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="Live demo"
            title="Talk to it. Right now."
            sub="This is a real working chat powered by the Brix conversation engine — the same brain that will answer your visitors."
          />
          <LiveDemo />
          <p className="text-center text-sm text-slate-500 mt-6">
            Liked that? <Link to="/signup" className="font-semibold text-brix-600 hover:underline">Put it on your site</Link> in under a minute.
          </p>
        </div>
      </section>

      {/* features grid */}
      <section id="features" className="py-24 sm:py-28 scroll-mt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="Features"
            title="Everything a chat platform should do"
            sub="The full toolkit — widget, inbox, AI and automation — without the enterprise price tag or the 2012 interface."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f) => (
              <article key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-xl hover:shadow-brix-600/10 hover:-translate-y-1 transition group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brix-100 to-aqua-100 grid place-items-center text-2xl group-hover:scale-110 transition">
                  {f.icon}
                </div>
                <h3 className="mt-4 font-display font-bold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.desc}</p>
              </article>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link to="/features" className="inline-flex items-center gap-2 font-semibold text-brix-600 hover:underline">
              Explore every feature →
            </Link>
          </div>
        </div>
      </section>

      {/* how it works */}
      <section className="py-24 sm:py-28 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="Live in three steps" />
          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-3xl bg-ink-950 p-8 overflow-hidden">
                <div className="absolute -top-6 -right-2 font-display text-[120px] font-extrabold text-white/5 select-none" aria-hidden>
                  {s.n}
                </div>
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brix-500 to-aqua-400 grid place-items-center text-white font-display font-bold">
                  {s.n}
                </div>
                <h3 className="mt-5 font-display text-xl font-bold text-white">{s.title}</h3>
                <p className="mt-2 text-slate-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI section */}
      <section className="py-24 sm:py-28 bg-ink-950 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute top-0 left-1/3 w-[500px] h-[500px] rounded-full bg-brix-600/20 blur-[140px]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading
            dark
            eyebrow="Brix AI"
            title="An AI copilot on every chat"
            sub="Not a bolt-on chatbot — intelligence woven through the whole inbox, drafting, sensing and summarizing."
          />
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: '✍️', t: 'Drafts that sound like you', d: 'The copilot proposes replies in your tone, translates on the fly and rewrites rough notes into polished answers.' },
              { icon: '💡', t: 'Sentiment radar', d: 'Every thread gets a live mood read. Frustrated visitors get flagged and auto-escalated before they ask to cancel.' },
              { icon: '⚡', t: 'Smart replies & summaries', d: 'One click inserts a context-aware reply; one click condenses a 40-message thread into five lines for handoffs.' },
            ].map((c) => (
              <article key={c.t} className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-7">
                <div className="text-3xl">{c.icon}</div>
                <h3 className="mt-4 font-display text-lg font-bold text-white">{c.t}</h3>
                <p className="mt-2 text-slate-400 leading-relaxed">{c.d}</p>
              </article>
            ))}
          </div>
          <p className="text-center mt-8 text-slate-400">
            AI message packs start at <span className="text-white font-semibold">$29/mo</span> — with a generous free allowance built in.{' '}
            <Link to="/pricing" className="text-aqua-400 hover:underline font-medium">See pricing →</Link>
          </p>
        </div>
      </section>

      {/* pricing teaser */}
      <section className="py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="Pricing"
            title="Free where it matters. Fair where it doesn't."
            sub="The entire core is free forever. You only pay when you add superpowers."
          />
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="rounded-3xl border-2 border-brix-600 bg-white p-8 shadow-xl shadow-brix-600/10 relative">
              <div className="absolute -top-3.5 left-8 bg-brix-600 text-white text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                Most popular
              </div>
              <h3 className="font-display text-xl font-extrabold text-slate-900">Starter</h3>
              <p className="mt-2"><span className="font-display text-4xl font-extrabold text-slate-900">$0</span> <span className="text-slate-500">/ forever</span></p>
              <ul className="mt-6 space-y-2.5 text-sm text-slate-600">
                {['Unlimited agents, sites & history', 'Chat widget + agent dashboard', 'Proactive triggers & campaigns', 'Knowledge base & tickets'].map((i) => (
                  <li key={i} className="flex gap-2.5"><span className="text-emerald-500 font-bold">✓</span>{i}</li>
                ))}
              </ul>
              <Link to="/signup" className="mt-8 block text-center px-6 py-3 rounded-xl bg-brix-600 hover:bg-brix-700 text-white font-semibold transition">
                Start free
              </Link>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8">
              <h3 className="font-display text-xl font-extrabold text-slate-900">Add-ons</h3>
              <p className="mt-2 text-sm text-slate-500">Flat, per-account pricing. No per-site stacking.</p>
              <ul className="mt-6 space-y-4">
                {[
                  ['White-label', 'from $19/mo', 'Your brand only — zero Brix branding.'],
                  ['AI packs', 'from $29/mo', 'More AI resolutions for busier teams.'],
                  ['Voice + video', '$39/mo', 'In-chat calls and screen sharing.'],
                ].map(([t, p, d]) => (
                  <li key={t} className="flex items-start justify-between gap-4 bg-white rounded-2xl border border-slate-200 px-5 py-4">
                    <div>
                      <div className="font-semibold text-slate-900">{t}</div>
                      <div className="text-sm text-slate-500">{d}</div>
                    </div>
                    <div className="text-sm font-bold text-brix-600 whitespace-nowrap">{p}</div>
                  </li>
                ))}
              </ul>
              <Link to="/pricing" className="mt-8 block text-center px-6 py-3 rounded-xl border border-slate-300 hover:bg-white text-slate-800 font-semibold transition">
                Compare plans
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* testimonials */}
      <section className="py-24 sm:py-28 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading eyebrow="Loved by teams" title="Don't take our word for it" />
          <div className="grid md:grid-cols-3 gap-6">
            {QUOTES.map((q) => (
              <figure key={q.name} className="rounded-3xl bg-white border border-slate-200 p-7 flex flex-col">
                <div className="text-aqua-500 text-4xl font-display leading-none" aria-hidden>“</div>
                <blockquote className="mt-2 text-slate-700 leading-relaxed flex-1">{q.quote}</blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <span className="w-11 h-11 rounded-full bg-gradient-to-br from-brix-500 to-aqua-400 grid place-items-center text-white font-bold">
                    {q.name.split(' ').map((w) => w[0]).join('')}
                  </span>
                  <div>
                    <div className="font-semibold text-slate-900 text-sm">{q.name}</div>
                    <div className="text-xs text-slate-500">{q.role}</div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* faq */}
      <section className="py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading eyebrow="FAQ" title="Questions, answered" />
          <Faq />
        </div>
      </section>

      {/* final cta */}
      <section className="relative overflow-hidden bg-ink-950">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -bottom-40 left-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-brix-600/30 to-aqua-500/20 blur-[140px]" />
        </div>
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 py-24 text-center">
          <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            Your next customer is{' '}
            <span className="bg-gradient-to-r from-brix-400 to-aqua-300 bg-clip-text text-transparent">already on your site.</span>
          </h2>
          <p className="mt-5 text-lg text-slate-400">Be there to greet them. Free forever — live in minutes.</p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Link
              to="/signup"
              className="px-8 py-4 text-base font-semibold text-white rounded-xl bg-gradient-to-r from-brix-600 to-aqua-500 hover:opacity-90 shadow-xl shadow-brix-600/30 transition"
            >
              Start free today
            </Link>
            <Link to="/pricing" className="px-8 py-4 text-base font-semibold text-white rounded-xl border border-white/20 hover:bg-white/10 transition">
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
