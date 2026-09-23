// Brix Chat — help center listing page.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApi } from '../lib/api';
import { useStore } from '../lib/store';
import { asP2, seedHelpIfEmpty, type ApiHelpArticle2 } from '../lib/contentSeed';
import { Seo, jsonLdFaq, jsonLdBreadcrumb } from '../lib/seo';
import { PageHero, CtaBand } from '../components/marketing';

const HELP_FAQ = [
  { q: 'How do I install Brix Chat on my website?', a: 'Add a website in Admin → Properties, copy the embed snippet, and paste it before the closing </body> tag. The launcher appears within seconds.' },
  { q: 'Is there really a free plan?', a: 'Yes — the core is free with unlimited agents, websites and chat history. Optional add-ons (white-label, AI packs, voice + video) are paid.' },
  { q: 'Where is my data stored?', a: 'In local mode, everything lives in your browser’s localStorage — nothing leaves your machine. A backend phase moves storage server-side later.' },
  { q: 'How do I invite my team?', a: 'In Admin → Team, enter a name and role, then share the one-time passcode that appears. They log in with the workspace name + passcode.' },
];

export default function Help() {
  const { session } = useStore();
  const [articles, setArticles] = useState<ApiHelpArticle2[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const p2 = asP2(getApi(session?.workspaceId ?? 'demo', 'web'));
        await seedHelpIfEmpty(p2);
        const { data } = await p2.helpDocs.list();
        setArticles([...data.items].sort((a, b) => a.order - b.order));
      } catch {
        setArticles([]);
      }
    })();
  }, [session?.workspaceId]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return articles;
    return articles.filter(
      (a) => a.title.toLowerCase().includes(t) || a.body.toLowerCase().includes(t) || a.category.toLowerCase().includes(t),
    );
  }, [articles, q]);

  const groups = useMemo(() => {
    const m = new Map<string, ApiHelpArticle2[]>();
    for (const a of filtered) {
      if (!m.has(a.category)) m.set(a.category, []);
      m.get(a.category)!.push(a);
    }
    return [...m.entries()];
  }, [filtered]);

  return (
    <main>
      <Seo
        title="Help center — Brix Chat"
        description="Guides and how-tos for Brix Chat: create a workspace, install the widget, invite your team, build triggers and campaigns, manage tickets, webhooks and API keys."
        path="/help"
        jsonLd={[jsonLdFaq(HELP_FAQ), jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Help center', path: '/help' }])]}
      />
      <PageHero
        kicker="Help center"
        title="How can we help?"
        sub="Setup guides and how-tos. Search below or browse by topic."
      />

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-14">
        <div className="relative max-w-xl mx-auto -mt-2 mb-12">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search guides…"
            aria-label="Search help articles"
            className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-slate-200 bg-white shadow-sm text-[15px] outline-none focus:ring-2 focus:ring-brix-500/40 focus:border-brix-500"
          />
        </div>

        {groups.length === 0 ? (
          <p className="text-center text-slate-500">No guides match “{q}”.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-8">
            {groups.map(([cat, items]) => (
              <section key={cat} aria-label={cat} className="rounded-3xl border border-slate-200 bg-white p-7">
                <h2 className="font-display text-xl font-extrabold text-slate-900 mb-4">{cat}</h2>
                <ul className="space-y-1">
                  {items.map((a) => (
                    <li key={a.id}>
                      <Link
                        to={`/help/${a.slug}`}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium text-slate-700 hover:bg-brix-50 hover:text-brix-700 transition"
                      >
                        {a.title}
                        <span className="text-slate-300" aria-hidden>→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <section className="mt-16" aria-label="Frequently asked questions">
          <h2 className="font-display text-2xl font-extrabold text-slate-900 text-center mb-8">Quick answers</h2>
          <div className="max-w-3xl mx-auto divide-y divide-slate-200 border-y border-slate-200">
            {HELP_FAQ.map((f) => (
              <details key={f.q} className="py-5 group">
                <summary className="font-semibold text-slate-900 cursor-pointer list-none flex items-center justify-between gap-4">
                  {f.q}
                  <span className="text-brix-600 text-lg group-open:rotate-45 transition-transform" aria-hidden>+</span>
                </summary>
                <p className="mt-2 text-slate-600 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>

      <CtaBand title="Still stuck?" sub="Open a chat from any page once you're signed in — or send us a note via the contact page." />
    </main>
  );
}
