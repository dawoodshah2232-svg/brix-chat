import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getApi } from '../lib/api';
import type { ApiProperty } from '../lib/api';
import { asP2 } from '../lib/contentSeed';
import type { ApiHelpArticle2, PropertySettings2 } from '../lib/contentSeed';
import { Seo } from '../lib/seo';
import { getKbVisibility } from '../lib/conversations';
import { RichText } from './BlogPost';

/**
 * White-labelled public help center for one property: /kb/:propertyKey.
 * The :propertyKey segment is the property's public key. Branding (logo,
 * brand name, colors) comes from propertySettings; articles from helpDocs.
 */
export default function PropertyKb() {
  const { propertyKey } = useParams<{ propertyKey: string }>();
  const [prop, setProp] = useState<ApiProperty | null>(null);
  const [settings, setSettings] = useState<PropertySettings2 | null>(null);
  const [articles, setArticles] = useState<ApiHelpArticle2[]>([]);
  const [badKey, setBadKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyKey) return;
    (async () => {
      setLoading(true);
      setBadKey(false);
      try {
        const api = getApi('demo', 'kb');
        // Prefer the contract name; fall back to the in-flight name or a list scan.
        const propsApi = api.properties as unknown as Record<string, ((k: string) => Promise<{ data: ApiProperty }>) | undefined>;
        let property: ApiProperty | null = null;
        const byKey = propsApi?.['getByKey'] ?? propsApi?.['getByPublicKey'];
        if (typeof byKey === 'function') {
          try {
            property = (await byKey.call(propsApi, propertyKey)).data;
          } catch { property = null; }
        }
        if (!property) {
          const { data } = await api.properties.list();
          property = (data as ApiProperty[]).find((p) => p.public_key === propertyKey) ?? null;
        }
        if (!property) {
          setBadKey(true);
          return;
        }
        setProp(property);
        const p2 = asP2(api);
        try {
          const { data } = await p2.propertySettings.get(property.id);
          setSettings(data);
        } catch { setSettings(null); }
        try {
          const { data } = await p2.helpDocs.list();
          const items = (data.items as ApiHelpArticle2[]).filter((a) =>
            (!('published' in a) || (a as ApiHelpArticle2).published !== false) &&
            getKbVisibility(a.id) !== 'internal', // internal-only articles never show publicly
          );
          setArticles([...items].sort((a, b) => a.order - b.order));
          if (items.length > 0) setActiveSlug(items[0].slug);
        } catch { setArticles([]); }
      } finally {
        setLoading(false);
      }
    })();
  }, [propertyKey]);

  const brandName = (settings?.brand_name || '').trim() || prop?.name || 'Help center';
  const primary = settings?.widget_color || '#4f46e5';
  const accent = settings?.accent_color || '#0d9488';
  const logo = settings?.logo_data_url || '';
  const tagline = (settings?.tagline || '').trim();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q),
    );
  }, [articles, query]);

  const active = articles.find((a) => a.slug === activeSlug) ?? null;

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-white">
        <p className="text-slate-400 text-sm">Loading help center…</p>
      </div>
    );
  }

  if (badKey) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 px-4">
        <Seo title="Help center not found" description="This help center link is not valid." />
        <div className="max-w-md text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900 mb-2">Help center not found</h1>
          <p className="text-slate-500 text-sm mb-6">
            This help-center link doesn't match any property. Check the URL or ask the site owner for the right link.
          </p>
          <Link to="/" className="inline-block rounded-xl bg-slate-900 text-white text-sm font-bold px-5 py-2.5">
            Go to Brix Chat home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Seo
        title={`${brandName} — Help center`}
        description={tagline || `Help articles and guides for ${brandName}.`}
      />
      <header className="border-b border-slate-100" style={{ background: `linear-gradient(135deg, ${primary}14, ${accent}14)` }}>
        <div className="max-w-5xl mx-auto px-4 py-8 flex items-center gap-4">
          {logo ? (
            <img src={logo} alt={`${brandName} logo`} className="w-12 h-12 rounded-2xl object-contain bg-white border border-slate-100 p-1" />
          ) : (
            <span className="w-12 h-12 rounded-2xl grid place-items-center text-white text-lg font-black" style={{ background: primary }}>
              {brandName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">{brandName}</h1>
            {(settings?.tagline || 'Help center').trim() && (
              <p className="text-sm text-slate-500 mt-0.5">{tagline || 'Help center'}</p>
            )}
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 pb-6">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles…"
            className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm shadow-sm outline-none focus:ring-2"
            style={{ ['--tw-ring-color' as string]: `${primary}55` }}
          />
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full grid md:grid-cols-[240px_1fr] gap-8 items-start">
        <nav className="md:sticky md:top-6 space-y-1 max-h-[70vh] overflow-y-auto slim-scroll pr-1" aria-label="Articles">
          {filtered.length === 0 && (
            <p className="text-sm text-slate-400">No articles match “{query}”.</p>
          )}
          {filtered.map((a) => (
            <button
              key={a.id}
              onClick={() => setActiveSlug(a.slug)}
              className={`w-full text-left rounded-xl px-3.5 py-2.5 text-sm transition ${
                a.slug === activeSlug ? 'font-bold text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
              style={a.slug === activeSlug ? { background: `${primary}14`, color: primary } : undefined}
            >
              {a.title}
            </button>
          ))}
        </nav>
        <article className="min-w-0">
          {active ? (
            <>
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: accent }}>{active.category}</p>
              <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 mb-6">{active.title}</h2>
              <div className="prose-brix text-slate-700 leading-relaxed">
                <RichText body={active.body} />
              </div>
            </>
          ) : (
            <p className="text-slate-400 text-sm">Select an article to read it.</p>
          )}
        </article>
      </main>

      <footer className="border-t border-slate-100 py-5">
        <p className="text-center text-xs text-slate-400">
          {brandName} help center
          <span className="mx-2">·</span>
          <span className="opacity-70">Powered by Brix Chat</span>
        </p>
      </footer>
    </div>
  );
}
