// Brix Chat — SEO helpers: Seo component + JSON-LD builders + canonical base.
//
// The Seo component sets document.title, meta description, canonical link,
// Open Graph / Twitter card tags and injects a JSON-LD script on route mount.
// Every marketing page renders <Seo .../>; JSON-LD types follow schema.org.

import { useEffect } from 'react';

/**
 * Canonical base for every page. The owner replaces this with the real
 * production domain before launch (e.g. https://brixchat.com). Everything
 * SEO-related (canonical links, og:url, sitemap.xml, llms.txt) derives from it.
 */
export const SEO_CANONICAL_BASE = 'https://brixchat.com';

const OG_IMAGE = `${SEO_CANONICAL_BASE}/og-cover.png`;

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLinkCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export interface SeoProps {
  /** Full page title, e.g. "Blog — Brix Chat" */
  title: string;
  description?: string;
  /** Site path, e.g. "/blog/my-post". Canonical + og:url derive from it. */
  path?: string;
  /** og:type — 'website' (default) or 'article' */
  type?: 'website' | 'article';
  /** JSON-LD object(s) injected as application/ld+json */
  jsonLd?: object | object[];
  publishedTime?: string;
  updatedTime?: string;
}

export function Seo({ title, description, path, type = 'website', jsonLd, publishedTime, updatedTime }: SeoProps): null {
  useEffect(() => {
    document.title = title;
    const canonical = path ? `${SEO_CANONICAL_BASE}${path}` : SEO_CANONICAL_BASE;

    if (description) {
      upsertMeta('name', 'description', description);
      upsertMeta('property', 'og:description', description);
      upsertMeta('name', 'twitter:description', description);
    }
    upsertMeta('property', 'og:title', title);
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:url', canonical);
    upsertMeta('property', 'og:site_name', 'Brix Chat');
    upsertMeta('property', 'og:image', OG_IMAGE);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:image', OG_IMAGE);
    upsertLinkCanonical(canonical);
    if (publishedTime) upsertMeta('property', 'article:published_time', publishedTime);
    if (updatedTime) upsertMeta('property', 'article:modified_time', updatedTime);

    // JSON-LD injection (removed on unmount so stale schema never lingers)
    const scripts: HTMLScriptElement[] = [];
    const blocks = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];
    for (const block of blocks) {
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.setAttribute('data-seo-jsonld', '1');
      s.textContent = JSON.stringify(block);
      document.head.appendChild(s);
      scripts.push(s);
    }
    return () => {
      for (const s of scripts) s.remove();
    };
  }, [title, description, path, type, jsonLd, publishedTime, updatedTime]);
  return null;
}

// ---------------------------------------------------------------------------
// JSON-LD builders (schema.org)
// ---------------------------------------------------------------------------

export function jsonLdOrganization(): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Brix Chat',
    url: SEO_CANONICAL_BASE,
    logo: `${SEO_CANONICAL_BASE}/logo.svg`,
    description:
      'Live chat platform: embeddable website widget, real-time agent dashboard, AI reply copilot, triggers, ticketing and analytics.',
    sameAs: [],
  };
}

export function jsonLdWebSite(): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Brix Chat',
    url: SEO_CANONICAL_BASE,
    inLanguage: 'en',
  };
}

export function jsonLdSoftwareApp(): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Brix Chat',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SEO_CANONICAL_BASE,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description:
      'Live chat platform with an embeddable widget, agent dashboard, AI copilot, triggers, ticketing, knowledge base and analytics.',
  };
}

export function jsonLdFaq(faqs: Array<{ q: string; a: string }>): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export interface BlogLdInput {
  title: string;
  excerpt: string;
  slug: string;
  author: string;
  createdAt: number | string;
  updatedAt: number | string;
}

export function jsonLdBlogPost(p: BlogLdInput): object {
  const iso = (v: number | string) => (typeof v === 'number' ? new Date(v).toISOString() : v);
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: p.title,
    description: p.excerpt,
    url: `${SEO_CANONICAL_BASE}/blog/${p.slug}`,
    image: OG_IMAGE,
    author: { '@type': 'Person', name: p.author },
    publisher: { '@type': 'Organization', name: 'Brix Chat', logo: { '@type': 'ImageObject', url: `${SEO_CANONICAL_BASE}/logo.svg` } },
    datePublished: iso(p.createdAt),
    dateModified: iso(p.updatedAt),
    mainEntityOfPage: `${SEO_CANONICAL_BASE}/blog/${p.slug}`,
  };
}

export function jsonLdBreadcrumb(trail: Array<{ name: string; path: string }>): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: `${SEO_CANONICAL_BASE}${t.path}`,
    })),
  };
}
