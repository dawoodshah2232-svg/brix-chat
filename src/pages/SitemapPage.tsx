// Brix Chat — HTML sitemap: every route, including blog/help slugs.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApi } from '../lib/api';
import { useStore } from '../lib/store';
import { asP2, seedBlogIfEmpty, seedHelpIfEmpty } from '../lib/contentSeed';
import { Seo, jsonLdBreadcrumb } from '../lib/seo';
import { PageHero } from '../components/marketing';

const STATIC: Array<{ group: string; links: Array<{ to: string; label: string; desc: string }> }> = [
  {
    group: 'Product',
    links: [
      { to: '/', label: 'Home', desc: 'Brix Chat overview' },
      { to: '/features', label: 'Features', desc: 'The full platform, end to end' },
      { to: '/pricing', label: 'Pricing', desc: 'Free core, honest add-ons' },
      { to: '/widget', label: 'Live demo', desc: 'Try the widget right now' },
      { to: '/security', label: 'Security', desc: 'How we keep your data safe' },
      { to: '/status', label: 'Status', desc: 'System status and history' },
    ],
  },
  {
    group: 'Resources',
    links: [
      { to: '/blog', label: 'Blog', desc: 'Notes on support that works' },
      { to: '/roi', label: 'ROI calculator', desc: 'Estimate your support savings' },
      { to: '/compare', label: 'Compare', desc: 'Why teams move on from traditional live chat' },
      { to: '/changelog', label: 'Changelog', desc: 'Every release, newest first' },
      { to: '/help', label: 'Help center', desc: 'Guides and how-tos' },
      { to: '/support', label: 'Support', desc: 'Submit and track a ticket — no account needed' },
      { to: '/sitemap', label: 'Sitemap', desc: 'This page' },
    ],
  },
  {
    group: 'Company',
    links: [
      { to: '/about', label: 'About', desc: 'Our story and principles' },
      { to: '/contact', label: 'Contact', desc: 'Talk to a human' },
    ],
  },
  {
    group: 'Legal',
    links: [
      { to: '/privacy', label: 'Privacy policy', desc: 'Local-first data handling' },
      { to: '/terms', label: 'Terms of service', desc: 'The rules of the road' },
    ],
  },
  {
    group: 'Account',
    links: [
      { to: '/login', label: 'Log in', desc: 'Access your workspace' },
      { to: '/signup', label: 'Sign up', desc: 'Create a free workspace' },
    ],
  },
];

export default function SitemapPage() {
  const { session } = useStore();
  const [blogSlugs, setBlogSlugs] = useState<Array<{ slug: string; title: string }>>([]);
  const [helpSlugs, setHelpSlugs] = useState<Array<{ slug: string; title: string }>>([]);

  useEffect(() => {
    (async () => {
      try {
        const p2 = asP2(getApi(session?.workspaceId ?? 'demo', 'web'));
        await seedBlogIfEmpty(p2);
        await seedHelpIfEmpty(p2);
        const b = await p2.blog.list(true);
        setBlogSlugs(b.data.items.map((p) => ({ slug: p.slug, title: p.title })));
        const h = await p2.helpDocs.list();
        setHelpSlugs(h.data.items.map((a) => ({ slug: a.slug, title: a.title })));
      } catch {
        /* static links still render */
      }
    })();
  }, [session?.workspaceId]);

  return (
    <main>
      <Seo
        title="Sitemap — Brix Chat"
        description="Every page on brixchat.com: product, resources, company, legal, blog articles and help guides."
        path="/sitemap"
        jsonLd={jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Sitemap', path: '/sitemap' }])}
      />
      <PageHero kicker="Sitemap" title="Every page, one list." sub="The whole site on a single page." />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {STATIC.map((g) => (
            <nav key={g.group} aria-label={g.group}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">{g.group}</h2>
              <ul className="space-y-2.5">
                {g.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-[15px] font-semibold text-slate-800 hover:text-brix-600 transition">
                      {l.label}
                    </Link>
                    <span className="text-sm text-slate-400"> — {l.desc}</span>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <nav aria-label="Blog articles">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Blog articles</h2>
            <ul className="space-y-2.5">
              {blogSlugs.map((b) => (
                <li key={b.slug}>
                  <Link to={`/blog/${b.slug}`} className="text-[15px] font-medium text-slate-700 hover:text-brix-600 transition">
                    {b.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Help guides">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Help guides</h2>
            <ul className="space-y-2.5">
              {helpSlugs.map((h) => (
                <li key={h.slug}>
                  <Link to={`/help/${h.slug}`} className="text-[15px] font-medium text-slate-700 hover:text-brix-600 transition">
                    {h.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </main>
  );
}
