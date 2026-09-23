// Brix Chat — about page.

import { Seo, jsonLdOrganization, jsonLdBreadcrumb } from '../lib/seo';
import { PageHero, CtaBand } from '../components/marketing';

const PRINCIPLES = [
  {
    title: 'Free means free',
    body: 'The core product — unlimited agents, sites, history — costs nothing, forever. We sell optional add-ons, not access to your own conversations.',
  },
  {
    title: 'Everything in one product',
    body: 'Tickets, knowledge base, campaigns and analytics belong inside the chat platform. Splitting them into separate paid products punishes the teams that need them most.',
  },
  {
    title: 'Local-first, honest about limits',
    body: 'The full demo runs in your browser with nothing leaving your machine. Where a server is genuinely needed — real-time sync, email, AI calls — we say so plainly and badge it.',
  },
  {
    title: 'Simple beats powerful-but-confusing',
    body: 'Triggers, goals and automations should be explainable in one sentence. If a feature needs a certification course, we have failed.',
  },
];

export default function About() {
  return (
    <main>
      <Seo
        title="About — Brix Chat"
        description="Brix Chat is a live-chat platform with a free core: widget, agent dashboard, AI copilot, tickets and analytics. Built in Dubai, UAE."
        path="/about"
        jsonLd={[jsonLdOrganization(), jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'About', path: '/about' }])]}
      />
      <PageHero
        kicker="About"
        title="Support software without the gotchas."
        sub="Brix Chat started from a simple observation: the chat tools teams actually love are either free-but-limited or powerful-but-punishing. We're building the third option."
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <section aria-label="Our story">
            <h2 className="font-display text-3xl font-extrabold text-slate-900">Our story</h2>
            <div className="mt-5 space-y-4 text-slate-600 leading-relaxed">
              <p>
                We spent years watching support teams wrestle with tools that charged per agent, hid ticketing in a
                separate product, and made simple automations feel like filing taxes. The teams doing the best support
                work were often the ones paying the most for the privilege.
              </p>
              <p>
                Brix Chat is our answer: a complete live-chat platform — widget, inbox, tickets, knowledge base,
                campaigns, analytics — with a genuinely free core and honest, optional add-ons. No per-seat math, no
                trial timers holding your history hostage.
              </p>
              <p>
                We build in Dubai, UAE, for teams everywhere. The product runs local-first today: you can evaluate
                the entire platform in your browser, with your data never leaving your machine, before you commit to
                anything.
              </p>
            </div>
          </section>
          <section aria-label="Principles">
            <h2 className="font-display text-3xl font-extrabold text-slate-900">What we believe</h2>
            <div className="mt-5 space-y-4">
              {PRINCIPLES.map((p) => (
                <div key={p.title} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h3 className="font-bold text-slate-900">{p.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{p.body}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section aria-label="Team" className="mt-20 rounded-3xl bg-slate-50 border border-slate-200 p-10 text-center">
          <h2 className="font-display text-2xl font-extrabold text-slate-900">The team</h2>
          <p className="mt-3 text-slate-600 max-w-xl mx-auto">
            We're a small, distributed team of engineers and support nerds. Team profiles are coming soon — for now,
            you'll meet us in the product, the docs, and the changelog.
          </p>
        </section>
      </div>

      <CtaBand />
    </main>
  );
}
