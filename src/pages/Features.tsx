// Brix Chat — features deep-dive page.

import { Link } from 'react-router-dom';
import { cx } from '../lib/utils';

interface Group {
  icon: string;
  title: string;
  blurb: string;
  items: string[];
}

const GROUPS: Group[] = [
  {
    icon: '💬',
    title: 'Chat widget',
    blurb: 'The thing your visitors actually touch. Designed to disappear into your brand.',
    items: [
      'Total appearance control — header, bubbles, position, corners, minimized or expanded',
      'Separate content for online, away and offline states with a timezone-aware schedule',
      'Optional pre-chat form and offline message form that creates a ticket',
      'File, image and GIF sharing plus emoji — and post-chat satisfaction ratings',
      'Proactive triggers: time-on-page, scroll depth, exit-intent, cart value, returning visitors',
      'Multi-condition rules, quick-reply buttons on auto-messages and one-time-per-visitor logic',
      'Auto-translation across 50+ languages, per message, both directions',
      'Visitor bans, country allow/block lists and per-site roles',
    ],
  },
  {
    icon: '🖥️',
    title: 'Agent dashboard',
    blurb: 'A fast inbox your team will open every morning without sighing.',
    items: [
      'Team inbox with chats, tickets and spam tabs; open, missed and closed states',
      'Real-time visitor monitoring — page, location, time on site, typing preview — start chats manually',
      'Departments with smart routing, transfers with full context, and internal whisper notes',
      'Collaboration built in: tags, notes on conversations, agent-to-agent chat',
      'Canned responses with shortcuts, links, files and chainable mini-flows',
      'Ticketing from missed chats, offline forms and support email with email-thread sync',
      'Hosted knowledge base with drafts, categories, slugs, translations and custom domains',
      'Contact records with journey view, custom attributes and notes',
      'Unlimited agents, unlimited websites, unlimited history — on the free core',
    ],
  },
  {
    icon: '🤖',
    title: 'AI & automation',
    blurb: 'Your team multiplied. The AI does the repetitive work; humans do the human work.',
    items: [
      'AI copilot drafts replies in your tone, rewrites for clarity and translates instantly',
      'Chatbot trained on your knowledge base answers 24/7 and hands off with full transcripts',
      'Smart replies inserted in one click; long threads summarized for clean handoffs',
      'Sentiment analysis flags frustrated visitors and auto-escalates before they churn',
      'Knowledge-gap tracking logs every question the AI could not answer — turn them into articles',
      'Workflow automation: chat start/end and ticket webhooks, no-code connector for 1,500+ apps',
      'Proactive campaigns to visitor segments with images — promos, announcements, launches',
    ],
  },
  {
    icon: '📊',
    title: 'Analytics',
    blurb: 'Numbers you can trust, presented like they were made for decisions.',
    items: [
      'Chat volume, missed chats, first-response time and satisfaction trends',
      'Agent performance and department breakdowns with date-range filters',
      'E-commerce view: cart visibility in the inbox and revenue attributed to chat',
      'Accurate tracking that cross-checks with your analytics stack — no mystery numbers',
      'CSAT and NPS surveys with trend dashboards',
      'CSV exports for anything, anytime',
    ],
  },
  {
    icon: '🛡️',
    title: 'Trust & controls',
    blurb: 'The unglamorous stuff that keeps you sleeping at night.',
    items: [
      'Verified-business badges so visitors know your widget is legitimate',
      'Proactive abuse handling — chat widgets are a phishing favorite; we fight that daily',
      'Reliable notifications with granular rules and SMS failover for critical alerts',
      'Auto data-retention: scheduled purge by age, plus export and delete on demand',
      'Sane defaults — no popup spam, no intrusive sounds, clean uninstall that leaves nothing behind',
      'Secure visitor identity verification for the JavaScript API',
    ],
  },
];

export default function Features() {
  return (
    <main>
      <section className="bg-ink-950 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -top-32 right-0 w-[480px] h-[480px] rounded-full bg-brix-600/25 blur-[140px]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-20 sm:py-28 text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-aqua-400">Features</div>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            The whole chat platform,{' '}
            <span className="bg-gradient-to-r from-brix-400 to-aqua-300 bg-clip-text text-transparent">end to end.</span>
          </h1>
          <p className="mt-5 text-lg text-slate-400 max-w-2xl mx-auto">
            Five areas, one product. Every capability below is part of the free core unless marked as an add-on.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20 space-y-20">
        {GROUPS.map((g, gi) => (
          <section key={g.title} aria-labelledby={`feat-${gi}`}>
            <div className="flex items-start gap-4 mb-8">
              <div className={cx('w-14 h-14 rounded-2xl grid place-items-center text-3xl shrink-0', gi % 2 ? 'bg-gradient-to-br from-aqua-100 to-brix-100' : 'bg-gradient-to-br from-brix-100 to-aqua-100')}>
                {g.icon}
              </div>
              <div>
                <h2 id={`feat-${gi}`} className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">{g.title}</h2>
                <p className="mt-1 text-slate-600">{g.blurb}</p>
              </div>
            </div>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {g.items.map((item) => (
                <li key={item} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-5 hover:border-brix-300 hover:shadow-lg hover:shadow-brix-600/5 transition">
                  <span className="text-emerald-500 font-bold shrink-0" aria-hidden>✓</span>
                  <span className="text-sm text-slate-700 leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="bg-ink-950">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-20 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Ready to try it all for free?
          </h2>
          <p className="mt-4 text-slate-400">No card. No trial timer. Just your new chat platform.</p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Link to="/signup" className="px-8 py-3.5 font-semibold text-white rounded-xl bg-gradient-to-r from-brix-600 to-aqua-500 hover:opacity-90 transition">
              Start free
            </Link>
            <Link to="/pricing" className="px-8 py-3.5 font-semibold text-white rounded-xl border border-white/20 hover:bg-white/10 transition">
              See add-on pricing
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
