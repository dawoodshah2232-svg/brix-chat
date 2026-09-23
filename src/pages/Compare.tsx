// Brix Chat — comparison page: traditional live chat vs Brix Chat, generic (no brand names).

import { Link } from 'react-router-dom';
import { Seo, jsonLdFaq, jsonLdBreadcrumb } from '../lib/seo';
import { PageHero } from '../components/marketing';

interface Row {
  feature: string;
  traditional: string;
  brix: string;
  note?: string;
}

const ROWS: Row[] = [
  {
    feature: 'Setup time',
    traditional: 'Script install plus account tiers and per-seat provisioning.',
    brix: 'One script tag; workspace, widget and demo data ready in minutes.',
  },
  {
    feature: 'Pricing model',
    traditional: 'Usually priced per agent seat — costs grow every time you hire.',
    brix: 'Free core with unlimited agents and sites. Optional flat add-ons, never per seat.',
  },
  {
    feature: 'Widget weight',
    traditional: 'Varies by vendor; heavyweight bundles with trackers are common.',
    brix: 'Lightweight single loader; you choose exactly which modules run.',
  },
  {
    feature: 'AI copilot',
    traditional: 'Often an extra add-on, a separate product, or an enterprise tier.',
    brix: 'Copilot drafts, thread summaries and sentiment included; AI packs scale with volume, not headcount.',
  },
  {
    feature: 'Chatbot flows',
    traditional: 'Builder exists, but training and knowledge sync often cost extra.',
    brix: 'Bot engine, trigger templates and canned-response flows ship in the core; answers from your knowledge base.',
  },
  {
    feature: 'Ticket portal',
    traditional: 'Ticketing is usually a separate module or a separate product entirely.',
    brix: 'Tickets, SLA policies, merge and split live in the same dashboard as chat.',
  },
  {
    feature: 'Translation',
    traditional: 'Often a premium add-on or limited to top tiers.',
    brix: 'Built-in message translation so agents can answer in the visitor’s language.',
  },
  {
    feature: 'Data ownership',
    traditional: 'Data lives in the vendor cloud; export quality varies by plan.',
    brix: 'Local-first in this demo build — JSON export/import of your data anytime, no gate.',
  },
];

const BENEFITS = [
  {
    title: 'One bill, not a seat tax',
    body: 'Most traditional tools charge per agent, so every new hire raises the invoice. Brix Chat’s core is free with unlimited agents, and the paid add-ons are flat per account. Growing your team stays a headcount decision, not a software purchase.',
  },
  {
    title: 'Chat and tickets in one place',
    body: 'When a conversation can’t be closed live, traditional stacks send you to a different product for the ticket. In Brix Chat the ticket system, SLA countdowns and the knowledge base sit in the same dashboard — nothing gets lost in the handoff.',
  },
  {
    title: 'Leave when you want',
    body: 'Switching tools is usually held hostage by data lock-in. Your chats, contacts, articles and tickets export to JSON whenever you like. We’d rather earn your stay than trap it.',
  },
];

const FAQ = [
  {
    q: 'Can I try Brix Chat without changing my website?',
    a: 'Yes. The free core includes a live widget demo on this site and a full local workspace, so you can evaluate the whole platform before touching a line of your production site.',
  },
  {
    q: 'Do I have to name my current vendor to get help migrating?',
    a: 'No. The widget installs with a single script tag, and import/export tooling in the dashboard moves your data in standard formats — whichever platform you’re leaving.',
  },
];

export default function Compare() {
  return (
    <main>
      <Seo
        title="Why teams move on from traditional live chat — Brix Chat"
        description="A factual, side-by-side comparison of traditional live-chat tools versus Brix Chat: pricing, widget weight, AI copilot, chatbot flows, ticketing, translation and data ownership."
        path="/compare"
        jsonLd={[
          jsonLdFaq(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Compare', path: '/compare' }]),
        ]}
      />
      <PageHero
        kicker="Compare"
        title="Why teams move on from traditional live chat."
        sub="An honest, side-by-side look at the old per-seat model — and what we built instead. No brand names, no gotchas."
      />

      {/* comparison table */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <div className="overflow-x-auto rounded-3xl border border-slate-200 shadow-sm">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left font-semibold text-slate-500 px-6 py-5 bg-slate-50 w-[18%]">Capability</th>
                <th className="text-left font-display font-extrabold text-slate-700 px-6 py-5 bg-slate-100 w-[41%]">
                  Traditional live-chat tools
                </th>
                <th className="text-left font-display font-extrabold text-white px-6 py-5 bg-brix-600 w-[41%]">
                  Brix Chat
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ROWS.map((r) => (
                <tr key={r.feature} className="hover:bg-slate-50/60">
                  <td className="px-6 py-5 text-slate-800 font-semibold align-top">{r.feature}</td>
                  <td className="px-6 py-5 text-slate-500 leading-relaxed align-top">{r.traditional}</td>
                  <td className="px-6 py-5 text-slate-700 leading-relaxed align-top">
                    <span className="text-brix-600 font-bold mr-2">✓</span>
                    {r.brix}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Descriptions are generalizations about the market, not claims about any single vendor. Capabilities and
          pricing change — verify against any vendor you’re evaluating.
        </p>
      </section>

      {/* migration benefits */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 text-center">
            What the switch actually feels like
          </h2>
          <div className="mt-10 grid md:grid-cols-3 gap-6">
            {BENEFITS.map((b) => (
              <div key={b.title} className="rounded-3xl bg-white border border-slate-200 p-8">
                <h3 className="font-display text-lg font-extrabold text-slate-900">{b.title}</h3>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* faq */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 py-16" aria-label="Comparison questions">
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 text-center">Switching questions</h2>
        <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
          {FAQ.map((f) => (
            <div key={f.q} className="py-6">
              <p className="font-display font-semibold text-slate-900">{f.q}</p>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* honest limitations */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-20">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 sm:p-10">
          <h2 className="font-display text-xl font-extrabold text-slate-900">What Brix Chat doesn’t do yet</h2>
          <p className="mt-2 text-sm text-slate-600">Fair is fair — here’s the short list, in our own words:</p>
          <ul className="mt-5 space-y-3 text-sm text-slate-700">
            <li className="flex gap-3">
              <span className="font-bold text-amber-600">—</span>
              <span><strong>No native mobile apps yet.</strong> The dashboard is a web app and works on mobile browsers, but there are no iOS/Android apps on the roadmap’s first release.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-amber-600">—</span>
              <span><strong>No real-time backend sync yet.</strong> The current demo is local-first — your data lives in the browser. Hosted realtime, provider-powered AI and webhooks go live with the backend phase.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-amber-600">—</span>
              <span><strong>AI drafting is assistive, not autonomous.</strong> The copilot suggests and summarizes; a human sends. If you want a bot that closes chats alone, that isn’t this product.</span>
            </li>
          </ul>
        </div>

        {/* cta */}
        <div className="mt-12 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">Run the numbers for your team</h2>
          <p className="mt-3 text-slate-600">See what a per-seat-free model could save you each month.</p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Link to="/roi" className="px-8 py-3.5 font-semibold text-white rounded-xl bg-brix-600 hover:bg-brix-700 transition">
              Try the ROI calculator
            </Link>
            <Link to="/signup" className="px-8 py-3.5 font-semibold text-brix-700 rounded-xl border border-brix-200 bg-white hover:bg-brix-50 transition">
              Start free
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
