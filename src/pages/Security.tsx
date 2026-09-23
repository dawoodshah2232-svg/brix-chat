// Brix Chat — security page: local-first architecture, passcodes, what's stored where.

import { Link } from 'react-router-dom';
import { Seo, jsonLdBreadcrumb } from '../lib/seo';
import { PageHero, CtaBand } from '../components/marketing';

const PRACTICES = [
  {
    title: 'Local-first architecture',
    body: 'The product runs without a server today. Workspace data, member records, API keys and integration credentials live in your browser\u2019s localStorage under a single namespaced key — there is no database of yours on our side to breach.',
  },
  {
    title: 'Passcode access, role-gated screens',
    body: 'Workspaces are protected by passcodes, not shared links. Four roles — admin, agent, developer, viewer — gate every screen: developers can manage keys and webhooks but cannot read chat content, and viewers cannot change anything.',
  },
  {
    title: 'Signed webhooks',
    body: 'Every webhook delivery carries an HMAC-SHA256 signature over timestamp + body, with a stable event id for idempotent processing. Secrets are shown once and stored masked.',
  },
  {
    title: 'Visitor identity verification',
    body: 'Secure mode lets your server sign visitor identities with HMAC-SHA256 so names and emails passed to the widget cannot be forged from the browser console.',
  },
  {
    title: 'Session controls',
    body: 'Configurable session timeouts, minimum passcode lengths, and an audit log of every admin action — searchable by actor, action, and date.',
  },
  {
    title: 'Data retention on your terms',
    body: 'Set automatic purging of history older than N days, export everything as JSON any time, or wipe the demo dataset with one confirmed click.',
  },
];

const LIMITS = [
  'No 2FA yet — passcodes are the single factor in local mode (backend phase adds SSO/SAML + 2FA).',
  'No real-time cross-device sync — each browser holds its own workspace copy until the backend phase.',
  'Webhook test-fire signs real payloads locally, but no HTTP request leaves your browser yet.',
  'Third-party AI and messaging integrations are configured locally; live calls activate with the backend phase.',
];

export default function Security() {
  return (
    <main>
      <Seo
        title="Security — Brix Chat"
        description="How Brix Chat keeps your data safe: local-first architecture, passcode access with role gating, signed webhooks, identity verification, session controls, and honest limits."
        path="/security"
        jsonLd={jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Security', path: '/security' }])}
      />
      <PageHero
        kicker="Security"
        title="Secure by architecture, not by promise."
        sub="The strongest security claim we can make today is a structural one: in local mode, your data never leaves your machine."
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {PRACTICES.map((p) => (
            <div key={p.title} className="rounded-3xl border border-slate-200 bg-white p-7">
              <h2 className="font-display text-lg font-extrabold text-slate-900">{p.title}</h2>
              <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>

        <section className="mt-16 rounded-3xl border border-amber-200 bg-amber-50 p-8 sm:p-10" aria-label="Honest limits">
          <h2 className="font-display text-2xl font-extrabold text-slate-900">Honest limits</h2>
          <p className="mt-2 text-slate-600 max-w-2xl">
            Security pages usually list strengths and hide the rest. Here is what Brix Chat does <em>not</em> do yet —
            each is on the backend-phase roadmap:
          </p>
          <ul className="mt-5 space-y-2.5">
            {LIMITS.map((l) => (
              <li key={l} className="flex gap-3 text-sm text-slate-700">
                <span className="text-amber-600 font-bold shrink-0" aria-hidden>!</span>
                {l}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10 text-center">
          <p className="text-slate-600">
            Found a vulnerability? <Link to="/contact" className="text-brix-600 font-semibold hover:underline">Report it</Link> —
            choose “Security report” as the subject and we will respond within one business day.
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Our data-handling rules live in the <Link to="/privacy" className="text-brix-600 font-semibold hover:underline">privacy policy</Link>.
          </p>
        </section>
      </div>

      <CtaBand title="Evaluate the security yourself." sub="The whole product runs in your browser — inspect the storage, the network tab, everything." />
    </main>
  );
}
