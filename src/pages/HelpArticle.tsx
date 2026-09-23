// Brix Chat — help article (guide) page.

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getApi } from '../lib/api';
import { useStore } from '../lib/store';
import { asP2, seedHelpIfEmpty, type ApiHelpArticle2 } from '../lib/contentSeed';
import { Seo, jsonLdBreadcrumb } from '../lib/seo';
import { CtaBand } from '../components/marketing';
import { RichText } from './BlogPost';

export default function HelpArticle() {
  const { slug } = useParams<{ slug: string }>();
  const { session } = useStore();
  const [article, setArticle] = useState<ApiHelpArticle2 | null>(null);
  const [siblings, setSiblings] = useState<ApiHelpArticle2[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p2 = asP2(getApi(session?.workspaceId ?? 'demo', 'web'));
        await seedHelpIfEmpty(p2);
        const { data } = await p2.helpDocs.getBySlug(slug ?? '');
        setArticle(data);
        const all = await p2.helpDocs.list();
        setSiblings(
          all.data.items
            .filter((a) => a.category === data.category && a.slug !== data.slug)
            .sort((a, b) => a.order - b.order),
        );
      } catch {
        setMissing(true);
      }
    })();
  }, [slug, session?.workspaceId]);

  if (missing) {
    return (
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-24 text-center">
        <Seo title="Guide not found — Brix Chat" path="/help" />
        <h1 className="font-display text-3xl font-extrabold text-slate-900">That guide doesn't exist.</h1>
        <p className="mt-3 text-slate-500">It may have been renamed or removed.</p>
        <Link to="/help" className="mt-6 inline-block px-6 py-3 rounded-xl bg-ink-950 text-white font-semibold text-sm">
          Back to the help center
        </Link>
      </main>
    );
  }

  if (!article) {
    return (
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-24">
        <p className="text-slate-500">Loading guide…</p>
      </main>
    );
  }

  return (
    <main>
      <Seo
        title={`${article.title} — Brix Chat help`}
        description={`Step-by-step guide: ${article.title}. Part of the Brix Chat help center.`}
        path={`/help/${article.slug}`}
        updatedTime={new Date(article.updated_at).toISOString()}
        jsonLd={jsonLdBreadcrumb([
          { name: 'Home', path: '/' },
          { name: 'Help center', path: '/help' },
          { name: article.title, path: `/help/${article.slug}` },
        ])}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14 grid lg:grid-cols-[1fr_280px] gap-12">
        <article className="max-w-3xl">
          <nav aria-label="Breadcrumb" className="text-sm text-slate-500 mb-6">
            <Link to="/help" className="text-brix-600 font-semibold hover:underline">Help center</Link>
            <span className="mx-2" aria-hidden>/</span>
            <span>{article.category}</span>
          </nav>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
            {article.title}
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            Updated <time dateTime={new Date(article.updated_at).toISOString()}>
              {new Date(article.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </time>
          </p>
          <hr className="my-8 border-slate-200" />
          <RichText body={article.body} />
          <div className="mt-12 rounded-3xl border border-slate-200 bg-slate-50 p-6">
            <div className="font-bold text-slate-900">Was this guide helpful?</div>
            <p className="mt-1 text-sm text-slate-500">
              If something is missing or unclear, tell us via the <Link to="/contact" className="text-brix-600 font-semibold hover:underline">contact page</Link> and we'll improve it.
            </p>
          </div>
        </article>

        {siblings.length > 0 && (
          <aside aria-label="More in this section" className="lg:sticky lg:top-24 h-fit">
            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">More in {article.category}</h2>
              <ul className="space-y-1">
                {siblings.map((s) => (
                  <li key={s.id}>
                    <Link to={`/help/${s.slug}`} className="block px-3 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-brix-50 hover:text-brix-700 transition">
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}
      </div>

      <CtaBand title="Try it as you read." sub="Every guide here maps to a real screen in your free Brix Chat workspace." />
    </main>
  );
}
