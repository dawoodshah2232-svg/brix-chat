# Brix Chat — SEO checklist

*Owner: replace the placeholder canonical domain before launch. Everything else
below is ready to execute on publish day.*

## 1. Canonical domain (do this first)

The entire public site assumes **`https://brixchat.com`** as the canonical
origin. Before launch, search the repo for `https://brixchat.com` and replace
with the real domain if different. Touched files:

| File | What to change |
|---|---|
| `src/lib/seo.ts` | `CANONICAL_BASE` constant (has an owner-replacement comment) |
| `index.html` | `<link rel="canonical">`, `og:url`, `og:image` |
| `public/sitemap.xml` | Every `<loc>` |
| `public/robots.txt` | `Sitemap:` line |
| `public/llms.txt` | Absolute page URLs |
| `src/pages/SitemapPage.tsx` | Rendered absolute links (uses the same base) |

`Seo` builds canonical + OG/Twitter URLs from `CANONICAL_BASE + path`, so one
constant change propagates everywhere.

## 2. Per-page title / description inventory

| Route | Title | Meta description |
|---|---|---|
| `/` | Brix Chat — Live Chat Widget, AI Copilot & Helpdesk for Modern Teams | Brix Chat is the modern live-chat platform: an embeddable website widget, a real-time agent dashboard, AI reply copilot, smart triggers, ticketing and analytics — free core, no per-agent fees. |
| `/features` | Features — Brix Chat | Everything in Brix Chat: chat widget, agent dashboard, AI copilot and automation, analytics, ticketing, knowledge base — free core, honest add-ons. |
| `/pricing` | Pricing — Brix Chat | Brix Chat pricing: a free core with unlimited agents, sites and history — plus honest flat add-ons: white-label, AI packs, voice + video. |
| `/blog` | Blog — Brix Chat | Practical guides on live chat, support workflows, and conversion: pre-chat forms, proactive chat timing, CSAT, tickets, and local-first support software. |
| `/blog/:slug` | `{post.title} — Brix Chat` | `{post.excerpt}` (8 original posts ship seeded) |
| `/help` | Help center — Brix Chat | Guides and how-tos for Brix Chat: create a workspace, install the widget, invite your team, build triggers and campaigns, manage tickets, webhooks and API keys. |
| `/help/:slug` | `{article.title} — Brix Chat help` | Step-by-step guide: {title}. Part of the Brix Chat help center. (12 original guides ship seeded) |
| `/kb/:propertyKey` | `{brandName} — Help center` | Property tagline, or “Help articles and guides for {brandName}.” — white-labelled, no Brix Chat branding |
| `/about` | About — Brix Chat | Brix Chat is a live-chat platform with a free core: widget, agent dashboard, AI copilot, tickets and analytics. Built in Dubai, UAE. |
| `/contact` | Contact — Brix Chat | Get in touch with the Brix Chat team: questions, feedback, partnerships, or support for your workspace. |
| `/privacy` | Privacy policy — Brix Chat | Brix Chat's privacy policy: local-first storage, no trackers, what we store, your visitors' data, cookies, and your data rights. |
| `/terms` | Terms of service — Brix Chat | Brix Chat's terms of service: the free core, add-on billing, your responsibilities, local-phase data notes, IP, liability, and changes. |
| `/security` | Security — Brix Chat | How Brix Chat keeps your data safe: local-first architecture, passcode access with role gating, signed webhooks, identity verification, session controls, and honest limits. |
| `/status` | Status — Brix Chat | Brix Chat system status: current operational state and incident history. |
| `/sitemap` | Sitemap — Brix Chat | Every page on brixchat.com: product, resources, company, legal, blog articles and help guides. |
| `/app/*`, `/admin`, `/widget` | Title-only (`{Screen} — Brix Chat`) | Not indexed (behind auth / app screens) |

All copy is original. No fake reviews, ratings, keyword stuffing, or ranking
promises anywhere.

## 3. Structured data inventory

| Page(s) | Schema |
|---|---|
| `/` | `Organization`, `WebSite` (with `SearchAction`), `SoftwareApplication` |
| `/features`, `/pricing` | `SoftwareApplication` |
| `/pricing` | `FAQPage` (pricing FAQ), `BreadcrumbList` |
| `/blog` | `Blog` + `ItemList` |
| `/blog/:slug` | `BlogPosting` (author, dates, word count) |
| `/help` | `FAQPage` (top questions) |
| `/help/:slug` | `Article` |
| `/kb/:propertyKey` | Brand-scoped page metadata (no Brix Chat organization markup, to keep it white-labelled) |

Helpers live in `src/lib/seo.ts` (`jsonLd.*`). The `Seo` component injects and
cleans up tags on route change (SPA-safe).

## 4. Google Search Console verification

`index.html` contains an **empty** verification meta tag:

```html
<meta name="google-site-verification" content="" />
```

On publish day: open Search Console → add the property → copy the verification
token → paste it into `content=""`. Do the same in Bing Webmaster Tools
(`<meta name="msvalidate.01" content="…">` — add the tag next to it).

## 5. Publish-day steps

1. Replace the canonical domain (§1) and the GSC token (§4).
2. `npm run build` and deploy the static bundle.
3. Submit `https://brixchat.com/sitemap.xml` in Search Console **and** Bing
   Webmaster Tools.
4. Use “URL inspection → Request indexing” for `/`, `/features`, `/pricing`,
   `/blog`, `/help`.
5. Check “Enhancements” after a week: FAQ rich results (pricing, help),
   article rich results (blog posts).

## 6. Sitemap regeneration & property KB URLs

- `public/sitemap.xml` is static. When blog posts or help guides are added,
  append `<url>` entries (or regenerate) and resubmit.
- **Property help centers are dynamic** (`/kb/<public_key>`) and cannot be
  listed with a literal `:propertyKey` parameter. The sitemap carries an XML
  comment with the exact snippet to append per published property:

```xml
<url><loc>https://brixchat.com/kb/pk_live_abc123</loc><lastmod>2026-09-23</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>
```

- Append the real URL each time a property publishes its help center, then
  resubmit the sitemap. The HTML sitemap at `/sitemap` links the same way.
- **Subdomains:** `acme.brixchat.com` custom-subdomain mapping activates with
  the backend phase. Until then, submit only the path-routed URLs
  (`brixchat.com/kb/<public_key>`), which work now.

## 7. Ongoing hygiene

- Every new blog post needs: unique title/description, one H1, `BlogPosting`
  schema (automatic), internal links to 2–3 related posts, and a sitemap entry.
- Keep `/status` truthful — a stale “all operational” during an incident
  destroys trust faster than any ranking gain.
- `public/robots.txt` allows everything and points at the sitemap; `/app/*`
  and `/admin` are behind auth and not linked publicly, so they stay out of
  the index naturally.
