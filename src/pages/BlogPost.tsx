// Brix Chat — blog article page + shared markdown-lite renderer (also used by HelpArticle).

import { Fragment, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getApi } from '../lib/api';
import { useStore } from '../lib/store';
import { asP2, seedBlogIfEmpty, type ApiBlogPost2 } from '../lib/contentSeed';
import { Seo, jsonLdBlogPost, jsonLdBreadcrumb } from '../lib/seo';
import { CtaBand } from '../components/marketing';

function inline(text: string): ReactNode[] {
  // **bold** support
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/** Minimal markdown-lite: ## headings, - bullets, 1. ordered lists, > quotes, paragraphs. */
export function RichText({ body }: { body: string }) {
  const blocks = body.split(/\n\n+/).filter((b) => b.trim().length > 0);
  return (
    <div className="space-y-5 text-[17px] leading-relaxed text-slate-700">
      {blocks.map((block, bi) => {
        const b = block.trim();
        if (b.startsWith('## ')) {
          return (
            <h2 key={bi} className="font-display text-2xl font-extrabold text-slate-900 pt-4">
              {inline(b.slice(3))}
            </h2>
          );
        }
        if (b.startsWith('> ')) {
          return (
            <blockquote key={bi} className="border-l-4 border-brix-500 bg-brix-50/60 rounded-r-2xl px-5 py-4 text-slate-800 italic">
              {inline(b.replace(/^> /gm, ''))}
            </blockquote>
          );
        }
        const lines = b.split('\n');
        if (lines.every((l) => l.trim().startsWith('- '))) {
          return (
            <ul key={bi} className="space-y-2.5">
              {lines.map((l, li) => (
                <li key={li} className="flex gap-3">
                  <span className="text-brix-600 font-bold shrink-0" aria-hidden>•</span>
                  <span>{inline(l.trim().slice(2))}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\d+\.\s/.test(l.trim()))) {
          return (
            <ol key={bi} className="space-y-2.5 list-none">
              {lines.map((l, li) => (
                <li key={li} className="flex gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-ink-950 text-white text-xs font-bold grid place-items-center" aria-hidden>
                    {li + 1}
                  </span>
                  <span className="pt-0.5">{inline(l.trim().replace(/^\d+\.\s/, ''))}</span>
                </li>
              ))}
            </ol>
          );
        }
        return <p key={bi}>{inline(b)}</p>;
      })}
    </div>
  );
}

function AuthorBox({ author }: { author: string }) {
  return (
    <div className="mt-12 flex items-center gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-6">
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brix-500 to-aqua-500 grid place-items-center text-white font-extrabold text-lg" aria-hidden>
        {author.split(' ').map((w) => w[0]).join('')}
      </div>
      <div>
        <div className="font-bold text-slate-900">{author}</div>
        <div className="text-sm text-slate-500">Brix Chat team — we build the product we write about.</div>
      </div>
    </div>
  );
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const { session } = useStore();
  const [post, setPost] = useState<ApiBlogPost2 | null>(null);
  const [related, setRelated] = useState<ApiBlogPost2[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p2 = asP2(getApi(session?.workspace ?? 'demo', 'web'));
        await seedBlogIfEmpty(p2);
        const { data } = await p2.blog.getBySlug(slug ?? '');
        setPost(data);
        const all = await p2.blog.list(true);
        setRelated(
          all.data.items
            .filter((p) => p.slug !== data.slug && p.tags.some((t) => data.tags.includes(t)))
            .slice(0, 3),
        );
      } catch {
        setMissing(true);
      }
    })();
  }, [slug, session?.workspace]);

  if (missing) {
    return (
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-24 text-center">
        <Seo title="Article not found — Brix Chat" path="/blog" />
        <h1 className="font-display text-3xl font-extrabold text-slate-900">That article doesn't exist.</h1>
        <p className="mt-3 text-slate-500">It may have been moved or unpublished.</p>
        <Link to="/blog" className="mt-6 inline-block px-6 py-3 rounded-xl bg-ink-950 text-white font-semibold text-sm">
          Back to the blog
        </Link>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-24">
        <p className="text-slate-500">Loading article…</p>
      </main>
    );
  }

  return (
    <main>
      <Seo
        title={`${post.title} — Brix Chat`}
        description={post.excerpt}
        path={`/blog/${post.slug}`}
        type="article"
        publishedTime={new Date(post.created_at).toISOString()}
        updatedTime={new Date(post.updated_at).toISOString()}
        jsonLd={[
          jsonLdBlogPost({ title: post.title, excerpt: post.excerpt, slug: post.slug, author: post.author, createdAt: post.created_at, updatedAt: post.updated_at }),
          jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Blog', path: '/blog' }, { name: post.title, path: `/blog/${post.slug}` }]),
        ]}
      />

      <article className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-20">
        <Link to="/blog" className="text-sm font-semibold text-brix-600 hover:underline">← All articles</Link>
        <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
          <time dateTime={new Date(post.created_at).toISOString()}>
            {new Date(post.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </time>
          <span aria-hidden>·</span>
          <span>{post.reading_mins} min read</span>
          <span aria-hidden>·</span>
          <span>By {post.author}</span>
        </div>
        <h1 className="mt-4 font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
          {post.title}
        </h1>
        <p className="mt-5 text-xl text-slate-500 leading-relaxed">{post.excerpt}</p>
        <div className="mt-6 flex flex-wrap gap-1.5">
          {post.tags.map((t) => (
            <span key={t} className="text-[11px] font-semibold bg-brix-50 text-brix-700 rounded-full px-2.5 py-1">{t}</span>
          ))}
        </div>
        <hr className="my-10 border-slate-200" />
        <RichText body={post.body} />
        <AuthorBox author={post.author} />

        {related.length > 0 && (
          <section className="mt-14" aria-label="Related articles">
            <h2 className="font-display text-2xl font-extrabold text-slate-900 mb-6">Keep reading</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {related.map((r) => (
                <Link key={r.id} to={`/blog/${r.slug}`} className="rounded-2xl border border-slate-200 p-5 hover:border-brix-300 hover:shadow-lg transition">
                  <div className="text-xs text-slate-500">{r.reading_mins} min read</div>
                  <div className="mt-2 font-bold text-slate-900 leading-snug">{r.title}</div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>

      <CtaBand title="Put these ideas to work." sub="The workflows in this article are built into Brix Chat's free core." />
    </main>
  );
}
