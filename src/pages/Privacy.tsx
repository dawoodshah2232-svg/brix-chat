// Brix Chat — privacy policy (original, local-first themed).

import { Seo, jsonLdBreadcrumb } from '../lib/seo';
import { PageHero } from '../components/marketing';

const SECTIONS: Array<{ h: string; body: string[] }> = [
  {
    h: 'The short version',
    body: [
      'Brix Chat is local-first. In the current local mode, everything you put into the product — chats, contacts, tickets, settings, keys — is stored in your own browser\u2019s localStorage and never sent to us, because there is no server to send it to. When the backend phase launches, this policy will be updated before any data leaves your machine.',
    ],
  },
  {
    h: 'What we store in local mode',
    body: [
      'Workspace data you create: websites, conversations and messages, contacts, tickets, knowledge-base articles, canned responses, triggers, campaigns, analytics derived from that data.',
      'Access data: member names, roles, passcodes (stored in your browser so the demo login works), and session state.',
      'Configuration and secrets you enter: widget settings, business hours, API keys, webhook secrets, third-party integration credentials. These are stored locally and displayed obfuscated.',
      'None of this leaves your device in local mode. There is no analytics beacon, no tracking pixel, and no account system on our side to receive it.',
    ],
  },
  {
    h: 'What we do not collect',
    body: [
      'We do not run accounts, so we hold no emails or passwords for the marketing site. We do not use third-party trackers on brixchat.com pages. We do not sell data — there is no data of yours in our possession to sell.',
    ],
  },
  {
    h: 'Your visitors\u2019 data',
    body: [
      'When you embed the Brix Chat widget, visitor conversations are stored wherever your workspace data lives — today, in your browser. You are the data controller for your visitors\u2019 personal data. Our data-retention setting (Admin \u2192 Data) lets you auto-purge history older than N days, and export/delete run on demand.',
      'If you enable integrations later (email, CRM, AI providers), visitor data will flow to those providers per their own policies and your configuration. Those flows are off by default and clearly badged as backend-phase.',
    ],
  },
  {
    h: 'Cookies',
    body: [
      'The marketing site sets no tracking cookies. The product uses browser localStorage and sessionStorage for workspace data and login sessions — strictly functional, never advertising.',
    ],
  },
  {
    h: 'Data rights',
    body: [
      'Because your data lives in your browser, you can exercise your rights directly: export everything (Admin \u2192 Data \u2192 Export), delete it (Reset demo data), or clear site data in your browser settings. For backend-phase accounts, deletion and portability requests will be handled through the dashboard and support.',
    ],
  },
  {
    h: 'Changes to this policy',
    body: [
      'The backend phase is the one change that matters: before any customer data is stored on our servers, this page will describe exactly what is stored, where, for how long, and under which subprocessors — and the product will ask you to accept it. The “last updated” date below always reflects the current version.',
    ],
  },
];

export default function Privacy() {
  return (
    <main>
      <Seo
        title="Privacy policy — Brix Chat"
        description="Brix Chat's privacy policy: local-first storage, no trackers, what we store, your visitors' data, cookies, and your data rights."
        path="/privacy"
        jsonLd={jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Privacy policy', path: '/privacy' }])}
      />
      <PageHero kicker="Legal" title="Privacy policy." sub="Last updated: September 23, 2026." />

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
