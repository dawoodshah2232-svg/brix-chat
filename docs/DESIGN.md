# Brix Chat — Design System

Source: `src/index.css` (`@theme` tokens), components, Logo.tsx.

## Brand

- **Colors** (Tailwind v4 tokens):
  - `brix` — indigo scale, primary: `brix-500 #6366f1`, deep `brix-700 #4338ca`,
    soft `brix-50 #eef2ff`
  - `aqua` — cyan accent: `aqua-400 #22d3ee`, `aqua-500 #06b6d4`
  - `ink` — dark surfaces: `ink-950 #0b1020` (page bg), `ink-900 #101736`,
    `ink-800 #182046`, `ink-700 #232d5c`
- **Logo**: `src/components/Logo.tsx` — use the official mark raw,
  never inside a card/box; `public/favicon` used for favicon/loader.

## Typography

- Current code: `--font-sans: Inter, ui-sans-serif, system-ui…`,
  `--font-display: Sora, Inter…` (`font-display` class).
- **Owner rule (standing): use the Apple font stack as primary**
  `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
  "Helvetica Neue", Helvetica, Arial, sans-serif` —
  never Roboto/Titillium/Montserrat as the primary UI font.
  → TODO: migrate `--font-sans` to the Apple stack; decide where Sora/Inter
  still fits (marketing display only).

## UI conventions

- **No emojis in UI.** Icons = inline SVG only (`src/components/icons.tsx`,
  `src/components/dashboard/icons.tsx`) — Heroicons-style line icons.
- Chat-specific motion: typing dots (`typing-bounce`), soft hero float
  (`floaty`), slim 6px scrollbars on chat panes.
- Widget theming: class-based dark mode — the widget root gets a `dark`
  class (property theme dark, or auto + OS dark); `@custom-variant dark`.
- Apple-design + web-animations standards apply to UI work
  (`~/workspace/skills/apple-design/`, `~/workspace/skills/web-animations/`):
  physical motion, interruptible animations, real data states.
- Selection color: `#6366f1`; antialiased body text, `scroll-behavior: smooth`.

## Don'ts

- No card/background boxes behind logos or product imagery.
- No invented brand colors — only the `brix`/`aqua`/`ink` scales above.
- No fake stats/ratings in marketing copy; content honesty rules
  (`docs/SEO_CHECKLIST.md`).
