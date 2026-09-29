// Brix Chat — privacy policy (production: Laravel + MySQL backend on our own hosting).

import { Seo, jsonLdBreadcrumb } from '../lib/seo';
import { PageHero } from '../components/marketing';

const SECTIONS: Array<{ h: string; body: string[] }> = [
  {
    h: 'The short version',
    body: [
      'Brix Chat stores your workspace data — chats, contacts, tickets, settings — on our own servers (bridgingfx.com) so your team can work together in real time. We do not sell your data, we run no third-party advertising trackers on our marketing pages, and you can export or delete your workspace data at any time from the dashboard.',
    ],
  },
  {
    h: 'What we store',
    body: [
      'Account data: your workspace name, member display names, roles, and passcodes. Passcodes are stored as salted hashes — we cannot read them.',
      'Workspace data you create: websites (properties), conversations and messages, visitor details, contacts, tickets, knowledge-base articles, canned responses, triggers, flows, campaigns, and analytics derived from that data.',
      'Configuration you enter: widget settings, business hours, API keys, webhook secrets, third-party integration credentials. Secrets are stored encrypted and displayed obfuscated.',
      'Technical data: login sessions (strictly-necessary session cookies/tokens), audit logs of admin actions, and standard server logs (IP address, user agent) kept for security and debugging.',
    ],
  },
  {
    h: 'What we do not collect',
    body: [
      'We do not run third-party analytics, advertising pixels, or cross-site trackers on our marketing pages. We do not sell personal data. We do not use your workspace content to train models, and AI features only send data to a provider when you explicitly enable that integration.',
    ],
  },
  {
    h: 'Cookies',
    body: [
      'The marketing site sets no tracking cookies. The product uses strictly-necessary session storage: login tokens (and a session cookie on the API) that keep you signed in, plus browser localStorage for UI preferences and offline resilience. Nothing here is used for advertising.',
    ],
  },
  {
    h: 'Your visitors\u2019 data',
    body: [
      'When you embed the Brix Chat widget on your website, visitor conversations are stored in your workspace database on our servers. You are the data controller for your visitors\u2019 personal data: tell your visitors in your own privacy notice, and use the data-retention setting (Admin \u2192 Data) to auto-purge history older than N days. Export and deletion run on demand.',
      'If you enable integrations (email, CRM, AI providers), visitor data flows to those providers per their own policies and your configuration. Those flows are off by default.',
    ],
  },
  {
    h: 'Data rights',
    body: [
      'You can exercise your rights directly in the product: export everything (Admin \u2192 Data \u2192 Export), delete workspace data, or remove a member. For requests we must handle manually (for example, a message you sent through the contact form), contact us and we will respond within 30 days.',
    ],
  },
  {
    h: 'Security',
    body: [
      'Traffic is encrypted with TLS (HTTPS). Passcodes are salted-hashed, API keys are shown once at creation, and admin actions are audit-logged. No system is perfectly secure — use Export regularly for anything you cannot afford to lose.',
    ],
  },
  {
    h: 'Changes to this policy',
    body: [
      'We may update this policy as the product evolves. Material changes will be announced on the blog and, for logged-in workspaces, inside the product. The \u201clast updated\u201d date below always reflects the current version.',
    ],
  },
];

export default function Privacy() {
  return (
    <main>
      <Seo
        title="Privacy policy — Brix Chat"
        description="Brix Chat's privacy policy: what we store on our own servers, cookies, your visitors' data, your data rights, and security."
        path="/privacy"
        jsonLd={jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Privacy policy', path: '/privacy' }])}
      />
      <PageHero kicker="Legal" title="Privacy policy." sub="Last updated: September 29, 2026." />

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16">
        {SECTIONS.map((s) => (
          <section key={s.h} className="mb-10" aria-label={s.h}>
            <h2 className="font-display text-2xl font-extrabold text-slate-900 mb-3">{s.h}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="text-slate-600 leading-relaxed mb-3">{p}</p>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
