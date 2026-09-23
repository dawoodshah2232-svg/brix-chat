// Brix Chat — terms of service (original).

import { Seo, jsonLdBreadcrumb } from '../lib/seo';
import { PageHero } from '../components/marketing';

const SECTIONS: Array<{ h: string; body: string[] }> = [
  {
    h: '1. What Brix Chat is',
    body: [
      'Brix Chat (“the Service”) is a live-chat platform comprising an embeddable website widget, an agent dashboard, and an admin console. In the current local phase, the Service runs entirely in your browser; a backend phase will add server-side features later. These terms apply to the marketing site and the product together.',
    ],
  },
  {
    h: '2. The free core and add-ons',
    body: [
      'The core product is free: unlimited agents, websites, and chat history, with no credit card required. Optional add-ons (white-label, AI packs, voice + video) are billed per account, month-to-month, and can be cancelled any time. Removing an add-on never disables the free core.',
      'We will never charge you for the free core, and we will never hold your conversation history hostage behind a paywall.',
    ],
  },
  {
    h: '3. Your responsibilities',
    body: [
      'You are responsible for the content sent through your workspace — by your team and by your visitors — and for complying with the laws that apply to you (including privacy and marketing-consent laws in your jurisdiction).',
      'Do not use the Service for spam, phishing, fraud, harassment, or any unlawful purpose. Do not attempt to disrupt the Service or other users\u2019 workspaces. We may suspend workspaces used abusively, with notice where practical.',
      'In local mode, your data lives in your browser: keep your device and passcodes secure. Treat invite passcodes like temporary passwords.',
    ],
  },
  {
    h: '4. Local phase: no warranties on persistence',
    body: [
      'The local phase stores data in browser localStorage, which browsers can clear (private-mode exits, storage quotas, manual clears). Use Export regularly for anything you cannot afford to lose. The Service is provided “as is”, without warranties of any kind, to the maximum extent permitted by law.',
    ],
  },
  {
    h: '5. Intellectual property',
    body: [
      'We own the Service, its design, and its content. You own your data — every message, contact, and setting in your workspace. Export it any time; it is yours.',
      'Feedback you send us may be used to improve the product without obligation or compensation.',
    ],
  },
  {
    h: '6. Liability',
    body: [
      'To the maximum extent permitted by law, Brix Chat is not liable for indirect, incidental, or consequential damages — including lost revenue from missed chats or cleared browser storage. Our total liability for paid add-ons is limited to the fees you paid in the 12 months before the claim.',
    ],
  },
  {
    h: '7. Changes',
    body: [
      'We may update these terms as the product evolves — most notably when the backend phase launches, which will add sections on accounts, billing, SLAs, and data processing. Material changes will be announced on the blog and, for logged-in workspaces, inside the product. Continued use after a change takes effect means you accept it.',
    ],
  },
  {
    h: '8. Contact',
    body: [
      'Questions about these terms: use the contact page and choose “Legal” as the subject, or write to the team through the addresses published there.',
    ],
  },
];

export default function Terms() {
  return (
    <main>
      <Seo
        title="Terms of service — Brix Chat"
        description="Brix Chat's terms of service: the free core, add-on billing, your responsibilities, local-phase data notes, IP, liability, and changes."
        path="/terms"
        jsonLd={jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Terms of service', path: '/terms' }])}
      />
      <PageHero kicker="Legal" title="Terms of service." sub="Last updated: September 23, 2026." />

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
