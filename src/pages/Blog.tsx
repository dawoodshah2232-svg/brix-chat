// Brix Chat — blog listing page.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApi } from '../lib/api';
import { useStore } from '../lib/store';
import { asP2, seedBlogIfEmpty, type ApiBlogPost2 } from '../lib/contentSeed';
import { Seo, jsonLdWebSite, jsonLdBreadcrumb } from '../lib/seo';
import { PageHero, CtaBand } from '../components/marketing';

const ALL_TAGS = ['conversion', 'widget', 'forms', 'agents', 'productivity', 'tickets', 'workflow', 'analytics', 'metrics', 'campaigns', 'triggers', 'knowledge base', 'ai', 'privacy', 'security'];

function fmtDate(v: number | string): string {
  return new Date(typeof v === 'number' ? v : v).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function Blog() {
  const { session } = useStore();
  const [posts, setPosts] = useState<ApiBlogPost2[]>([]);
  const [tag, setTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const p2 = asP2(getApi(session?.workspace ?? 'demo', 'web'));
        await seedBlogIfEmpty(p2);
        const { data } = await p2.blog.list(true);
        setPosts([...data.items].sort((a, b) => b.created_at - a.created_at));
      } catch {
        setPosts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [session?.workspace]);

  const visible = tag ? posts.filter((p) => p.tags.includes(tag)) : posts;

  return (
    <main>
      <Seo
        title="Blog — Brix Chat"
        description="Practical guides on live chat, support workflows, and conversion: pre-chat forms, proactive chat timing, CSAT, tickets, and local-first support software."
        path="/blog"
        jsonLd={[jsonLdWebSite(), jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Blog', path: '/blog' }])]}
      />
      <PageHero
        kicker="Blog"
        title="Notes on support that actually works."
        sub="Field guides from the team building Brix Chat — on chat widgets, agent workflows, and the metrics that matter."
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14">
        <div className="flex flex-wrap gap-2 mb-10" role="group" aria-label="Filter by topic">
          <button
            onClick={() => setTag(null)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition ${tag === null ? 'bg-ink-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            All
          </button>
          {ALL_TAGS.map((t) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? null : t)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition ${tag === t ? 'bg-ink-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-slate-500">Loading articles…</p>
        ) : visible.length === 0 ? (
          <p className="text-slate-500">No articles here yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {visible.map((p) => (
              <article key={p.id} className="flex flex-col rounded-3xl border border-slate-200 bg-white overflow-hidden hover:shadow-xl hover:shadow-brix-600/5 hover:border-brix-200 transition">
                <Link to={`/blog/${p.slug}`} className="flex flex-col flex-1 p-7" aria-label={p.title}>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <time dateTime={new Date(p.created_at).toISOString()}>{fmtDate(p.created_at)}</time>
                    <span aria-hidden>·</span>
                    <span>{p.reading_mins} min read</span>
                  </div>
                  <h2 className="mt-3 font-display text-xl font-extrabold text-slate-900 leading-snug">{p.title}</h2>
                  <p className="mt-2.5 text-sm text-slate-600 leading-relaxed flex-1">{p.excerpt}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {p.tags.map((t) => (
                      <span key={t} className="text-[11px] font-semibold bg-brix-50 text-brix-700 rounded-full px-2.5 py-1">{t}</span>
                    ))}
                  </div>
                  <div className="mt-4 text-sm font-semibold text-brix-600">Read article →</div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>

      <CtaBand title="Want this thinking inside your support tool?" sub="Brix Chat ships the workflows these articles describe — try the free core." />
    </main>
  );
}
