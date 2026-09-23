# Brix Chat

Advanced live-chat widget platform: an embeddable website chat widget, a real-time
agent dashboard, and a marketing site — same concept as the classic live-chat tools,
with a fully original design and a deeper feature set (AI assist, sentiment insights,
smart routing, proactive triggers, omnichannel-ready inbox, analytics).

## Project layout (planned)

- `src/pages/` — marketing site (landing, pricing, features)
- `src/widget/` — embeddable chat widget (standalone bundle)
- `src/app/` — agent dashboard (inbox, visitors, contacts, analytics, settings)
- `src/lib/` — shared demo data layer (localStorage-backed until backend lands)

## Develop

```bash
npm install
npm run dev
```

## Deploy (GitHub Pages)

```bash
npm run deploy
```

Live preview: https://dawoodshah2232-svg.github.io/brix-chat/
