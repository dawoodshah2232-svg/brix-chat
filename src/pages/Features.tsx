// Brix Chat — features deep-dive page.

import { cx } from '../lib/utils';
import { Seo, jsonLdSoftwareApp, jsonLdBreadcrumb } from '../lib/seo';
import { CtaBand } from '../components/marketing';

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
      'White-labelled help center per property — your logo, brand name, and colors at /kb/:propertyKey, with just a tiny “Powered by Brix Chat” note',
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

const CHECKLIST: Array<{ label: string; brix: string; typical: string }> = [
  { label: 'Agents on the free plan', brix: 'Unlimited', typical: 'Capped, then per-seat fees' },
  { label: 'Websites on the free plan', brix: 'Unlimited', typical: 'Capped or per-site add-ons' },
  { label: 'Ticketing', brix: 'Included in the core', typical: 'Often a separate paid product' },
  { label: 'Knowledge base', brix: 'Included in the core', typical: 'Included, sometimes gated by tier' },
  { label: 'Proactive triggers', brix: 'Included in the core', typical: 'Included, sometimes gated by tier' },
  { label: 'Chat history', brix: 'Unlimited, exportable', typical: 'Retention caps on lower tiers' },
  { label: 'AI copilot allowance', brix: 'Starter allowance free', typical: 'Paid from the first resolution' },
  { label: 'API + webhooks', brix: 'Included in the core', typical: 'Included, sometimes gated by tier' },
  { label: 'Unanswered-question log', brix: 'Included in the core', typical: 'Rare below enterprise tiers' },
  { label: 'Data retention controls', brix: 'Included in the core', typical: 'Manual or enterprise-only' },
];

export default function Features() {
  return (
    <main>
      <Seo
        title="Features — Brix Chat"
        description="Everything in Brix Chat: chat widget, agent dashboard, AI copilot and automation, analytics, ticketing, knowledge base — free core, honest add-ons."
        path="/features"
        jsonLd={[jsonLdSoftwareApp(), jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Features', path: '/features' }])]}
      />
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

      {/* illustration row */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pb-20" aria-label="Product highlights">
        <div className="grid sm:grid-cols-3 gap-5">
          {[
            {
              src: 'feat-copilot.png',
              alt: 'Abstract illustration of the AI copilot drafting a suggested reply beside a chat thread',
              title: 'AI copilot',
              text: 'Draft replies, summaries and tone rewrites appear right inside the thread — the agent stays in control.',
            },
            {
              src: 'feat-analytics.png',
              alt: 'Abstract illustration of live chat analytics: rising trend lines and satisfaction gauges',
              title: 'Analytics',
              text: 'Response times, CSAT and agent load at a glance — the numbers behind every staffing decision.',
            },
            {
              src: 'feat-automation.png',
              alt: 'Abstract illustration of automation rules routing chats between departments and triggers',
              title: 'Automation',
              text: 'Triggers, campaigns and ticket rules run the repetitive work while your team handles the humans.',
            },
          ].map((f) => (
            <figure
              key={f.src}
              className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-xl hover:shadow-brix-600/10 hover:-translate-y-1 transition"
            >
              <img
                src={`${import.meta.env.BASE_URL}images/${f.src}`}
                alt={f.alt}
                className="w-full h-48 object-cover"
                loading="lazy"
              />
              <figcaption className="p-5">
                <h3 className="font-display font-bold text-slate-900">{f.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{f.text}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* comparison-style checklist (original wording, generic market view) */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-4" aria-label="How Brix Chat compares">
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 text-center mb-3">
          What "included" actually means here
        </h2>
        <p className="text-center text-slate-500 max-w-2xl mx-auto mb-8">
          A plain comparison of what ships in the free core versus what typical chat suites reserve for paid tiers.
        </p>
        <div className="overflow-x-auto rounded-3xl border border-slate-200">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="bg-ink-950 text-left">
                <th className="font-semibold text-slate-300 px-6 py-4">Capability</th>
                <th className="font-semibold text-white px-4 py-4">Brix Chat core</th>
                <th className="font-semibold text-slate-400 px-4 py-4">Typical alternatives</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {CHECKLIST.map((r) => (
                <tr key={r.label} className="hover:bg-slate-50/60">
                  <td className="px-6 py-3.5 text-slate-700 font-medium">{r.label}</td>
                  <td className="px-4 py-3.5 text-emerald-700 font-semibold">{r.brix}</td>
                  <td className="px-4 py-3.5 text-slate-400">{r.typical}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-slate-400 text-center max-w-2xl mx-auto">
          General market observation, not a claim about any specific vendor — plans change, and the details above
          describe Brix Chat's own packaging.
        </p>
      </section>

      <CtaBand title="Ready to try it all for free?" sub="No card. No trial timer. Just your new chat platform." />
    </main>
  );
}
