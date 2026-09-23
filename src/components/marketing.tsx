// Brix Chat — marketing site chrome: header, footer, layout.

import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import Logo from './Logo';
import { cx } from '../lib/utils';

const NAV = [
  { to: '/features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
];

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 bg-ink-950/85 backdrop-blur-md border-b border-white/10">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between" aria-label="Main">
        <Link to="/" aria-label="Brix Chat home">
          <Logo dark />
        </Link>
        <div className="hidden md:flex items-center gap-8">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="text-sm font-medium text-slate-300 hover:text-white transition">
              {n.label}
            </Link>
          ))}
        </div>
        <div className="hidden md:flex items-center gap-2">
          <Link to="/login" className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white rounded-xl transition">
            Log in
          </Link>
          <Link
            to="/signup"
            className="px-4 py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-brix-600 to-aqua-500 hover:opacity-90 shadow-lg shadow-brix-600/30 transition"
          >
            Start free
          </Link>
        </div>
        <button
          className="md:hidden w-10 h-10 grid place-items-center rounded-xl text-slate-200 hover:bg-white/10"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? '✕' : '☰'}
        </button>
      </nav>
      {open && (
        <div className="md:hidden border-t border-white/10 px-4 py-4 space-y-1 bg-ink-950">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              onClick={() => setOpen(false)}
              className="block px-3 py-2.5 rounded-xl text-sm font-medium text-slate-200 hover:bg-white/10"
            >
              {n.label}
            </Link>
          ))}
          <div className="flex gap-2 pt-2">
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="flex-1 text-center px-4 py-2.5 text-sm font-semibold text-slate-200 rounded-xl border border-white/15"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              onClick={() => setOpen(false)}
              className="flex-1 text-center px-4 py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-brix-600 to-aqua-500"
            >
              Start free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

const COLS: Array<{ title: string; links: Array<{ label: string; to: string }> }> = [
  {
    title: 'Product',
    links: [
      { label: 'Features', to: '/features' },
      { label: 'Pricing', to: '/pricing' },
      { label: 'Live demo', to: '/widget' },
      { label: 'AI copilot', to: '/features' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '#' },
      { label: 'Blog', to: '#' },
      { label: 'Careers', to: '#' },
      { label: 'Contact', to: '#' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', to: '#' },
      { label: 'Terms', to: '#' },
      { label: 'Security', to: '#' },
      { label: 'Data processing', to: '#' },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="bg-ink-950 border-t border-white/10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo dark />
            <p className="mt-4 text-sm text-slate-400 max-w-xs leading-relaxed">
              Live chat that feels like it was designed this decade — free at its core, with AI that actually helps your
              team.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
              All systems operational
            </div>
          </div>
          {COLS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">{c.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link to={l.to} className="text-sm text-slate-400 hover:text-white transition">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-500">© 2026 Brix Chat. Built for teams that answer fast.</p>
          <p className="text-xs text-slate-600">Made with care in Dubai, UAE.</p>
        </div>
      </div>
    </footer>
  );
}

export function MarketingLayout() {
  return (
    <div className={cx('min-h-screen flex flex-col bg-white text-slate-900 antialiased')}>
      <MarketingHeader />
      <div className="flex-1">
        <Outlet />
      </div>
      <MarketingFooter />
    </div>
  );
}
