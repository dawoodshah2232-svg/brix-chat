// Brix Chat — changelog: real shipped milestones, newest first. Sourced from git history.

import { Link } from 'react-router-dom';
import { Seo, jsonLdBreadcrumb } from '../lib/seo';
import { PageHero, CtaBand } from '../components/marketing';

interface Entry {
  version: string;
  date: string;
  tagline: string;
  items: string[];
}

const ENTRIES: Entry[] = [
  {
    version: 'v0.5',
    date: '2026-09-23',
    tagline: 'Platform console, ticketing depth, QA pass',
    items: [
      'Every route now sets its own document title — marketing, auth, admin, widget and help pages.',
      'Tickets grew up: split a ticket into child tickets, link parent-child and side threads, and deep-link between them.',
      'New Operations monitor: agents online/away with open-chat load, unassigned queue depth, longest current wait and a live events feed (labeled local-mode).',
      'Trigger template library: 10 one-click automation templates with plain-language descriptions.',
      'CES surveys alongside CSAT and NPS on the Feedback page, with 1–7 banding.',
      'Campaign A/B testing: declare a winner, and future sends route 100% to it.',
      'Ticket duplicates and merge — keyword-overlap suggestions in the create modal and bulk merge that never deletes.',
      'SLA policies with per-priority targets, apply-policy button on ticket create, and live 30s countdown badges.',
      'Knowledge base revision history: every article edit snapshots the previous version (up to 25), with line diffs and one-click restore.',
      'Contact privacy tools: display-only PII masking toggle, JSON export per contact or in bulk, and GDPR-style erasure with audit trail.',
      'Contextual reply-suggestion engine (KB, canned responses and intent matching), shown with labeled sources in Copilot.',
      'Quality page: agent scorecards, lowest-scored threads and an editable scoring rubric.',
    ],
  },
  {
    version: 'v0.4',
    date: '2026-09-23',
    tagline: 'Dashboard shell, widget v2, admin console',
    items: [
      'New dashboard shell: grouped collapsible sidebar, breadcrumbs, topbar, ⌘K command palette, toasts and a chart/stat kit.',
      'Widget v2 upgrades: triggers, knowledge-base search, guides, surveys and voice notes inside the chat bubble.',
      'Admin console rewrite with client registry, plan catalog, platform settings, audit search and view-as impersonation.',
      'Widget dark theme and an integrations connect UI (WhatsApp, Twilio, Resend, Slack, Shopify, WordPress, Zapier, Google Calendar, OpenAI, Anthropic).',
      'Per-workspace seeding — demo workspaces start with realistic conversations, visitors, contacts and settings.',
    ],
  },
  {
    version: 'v0.3',
    date: '2026-09-23',
    tagline: 'Backend scaffolding and realtime',
    items: [
      'Supabase transport with realtime notifications for the agent dashboard.',
      'Schema migrations and edge-function contracts aligned through bridge migrations.',
      'JS widget API documented: identify, track, open, prefill — plus a real widget loader script.',
    ],
  },
  {
    version: 'v0.2',
    date: '2026-09-23',
    tagline: 'Dashboard core, tickets, marketing site',
    items: [
      'Workspace login and signup with member passcodes, roles and remember-me.',
      'Tickets, feedback feed, analytics, triggers, canned responses and knowledge base in the agent dashboard.',
      'AI Copilot, security and data-management (export/import/retention) settings.',
      'Full marketing site: landing, features, pricing, blog, help center, legal, status and HTML sitemap — with an SEO kit (meta, canonicals, sitemaps, JSON-LD).',
      'Scoped API keys and signed webhooks with a delivery log and test fire; API and webhook docs published.',
    ],
  },
  {
    version: 'v0.1',
    date: '2026-09-23',
    tagline: 'First working chat',
    items: [
      'Project scaffold: React + TypeScript + Tailwind, router, chat store, bot engine and seed data.',
      'The chat widget: launcher, threads, department routing, CSAT ratings and branding.',
      'Landing, features, pricing, signup and login pages.',
      'Local-first architecture: everything runs in the browser on a typed localStorage API.',
    ],
  },
];

const NEXT = [
  {
    title: 'Backend sync',
    body: 'Hosted realtime, provider-powered AI, signed webhooks and API keys that leave the browser — the local-first demo graduates to a real backend.',
  },
  {
    title: 'Native mobile apps',
    body: 'Agent apps for iOS and Android so teams can answer from the floor, not just the desk.',
  },
  {
    title: 'More property power',
    body: 'Subdomain help centers, richer campaign targeting and integrations that authenticate for real.',
  },
];

export default function Changelog() {
  return (
    <main>
      <Seo
        title="Changelog — Brix Chat"
        description="Every Brix Chat release, newest first: the actual features that shipped — ticketing depth, AI copilot, widget upgrades, dashboard shell and more."
        path="/changelog"
        jsonLd={jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Changelog', path: '/changelog' }])}
      />
      <PageHero
        kicker="Changelog"
        title="Built in the open, shipped often."
        sub="Every release, newest first — plain language, no filler. What’s next is listed too, honestly."
      />

      <section className="mx-auto max-w-3xl px-4 sm:px-6 py-16">
        <div className="space-y-12">
          {ENTRIES.map((e) => (
            <article key={e.version} aria-labelledby={e.version}>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  id={e.version}
                  className="font-display text-lg font-extrabold text-white bg-brix-600 rounded-xl px-3.5 py-1.5"
                >
                  {e.version}
                </span>
                <time dateTime={e.date} className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {e.date}
                </time>
              </div>
              <h2 className="mt-3 font-display text-xl font-extrabold text-slate-900">{e.tagline}</h2>
              <ul className="mt-4 space-y-2.5">
                {e.items.map((i) => (
                  <li key={i.slice(0, 48)} className="flex gap-3 text-[15px] text-slate-600 leading-relaxed">
                    <span className="text-brix-500 font-bold mt-0.5" aria-hidden>·</span>
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* what's next */}
      <section className="bg-ink-950 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-xs font-bold uppercase tracking-widest text-aqua-400 text-center">What’s next</div>
          <h2 className="mt-3 font-display text-2xl sm:text-3xl font-extrabold text-white text-center tracking-tight">
            The honest roadmap.
          </h2>
          <p className="mt-3 text-slate-400 text-center max-w-xl mx-auto">
            No dates we can’t keep. These are the next real milestones the demo needs to become a hosted product.
          </p>
          <div className="mt-10 grid md:grid-cols-3 gap-6">
            {NEXT.map((n) => (
              <div key={n.title} className="rounded-3xl border border-white/10 bg-white/5 p-8">
                <h3 className="font-display text-lg font-extrabold text-white">{n.title}</h3>
                <p className="mt-3 text-sm text-slate-400 leading-relaxed">{n.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              to="/signup"
              className="inline-block px-8 py-3.5 font-semibold text-white rounded-xl bg-gradient-to-r from-brix-600 to-aqua-500 hover:opacity-90 transition"
            >
              Try the current build free
            </Link>
          </div>
        </div>
      </section>

      <CtaBand />
    </main>
  );
}
