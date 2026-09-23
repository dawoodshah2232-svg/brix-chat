// Brix Chat — pricing page: free core + flat add-ons.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../lib/utils';

const ADDONS = [
  {
    name: 'White-label',
    price: '$19',
    per: '/mo per account',
    desc: 'Strip every trace of Brix branding across all your sites. One flat fee — not per property.',
    points: ['No “powered by” anywhere', 'Covers all your websites', 'Custom widget loader name'],
  },
  {
    name: 'AI packs',
    price: '$29',
    per: '/mo from',
    desc: 'More AI resolutions for busier teams. The free core already includes a generous allowance.',
    points: ['Bot answers & copilot drafts', 'Sentiment & summaries', 'Knowledge-gap tracking'],
  },
  {
    name: 'Voice + video',
    price: '$39',
    per: '/mo per account',
    desc: 'In-chat voice and video calls with screen sharing — for the conversations text cannot close.',
    points: ['WebRTC calls in-chat', 'Screen sharing', 'Call recording'],
  },
];

const ROWS: Array<{ label: string; free: string; whitelabel: string; ai: string; voice: string }> = [
  { label: 'Unlimited agents', free: '✓', whitelabel: '✓', ai: '✓', voice: '✓' },
  { label: 'Unlimited websites', free: '✓', whitelabel: '✓', ai: '✓', voice: '✓' },
  { label: 'Unlimited chat history', free: '✓', whitelabel: '✓', ai: '✓', voice: '✓' },
  { label: 'Chat widget + customization', free: '✓', whitelabel: '✓', ai: '✓', voice: '✓' },
  { label: 'Agent dashboard + inbox', free: '✓', whitelabel: '✓', ai: '✓', voice: '✓' },
  { label: 'Proactive triggers', free: '✓', whitelabel: '✓', ai: '✓', voice: '✓' },
  { label: 'Knowledge base + ticketing', free: '✓', whitelabel: '✓', ai: '✓', voice: '✓' },
  { label: 'Analytics + reports', free: '✓', whitelabel: '✓', ai: '✓', voice: '✓' },
  { label: 'Remove all Brix branding', free: '—', whitelabel: '✓', ai: '—', voice: '—' },
  { label: 'AI copilot & bot resolutions', free: 'Starter allowance', whitelabel: 'Starter allowance', ai: 'Expanded packs', voice: 'Starter allowance' },
  { label: 'Voice + video calling', free: '—', whitelabel: '—', ai: '—', voice: '✓' },
];

const PRICING_FAQ = [
  {
    q: 'What does “free forever” actually include?',
    a: 'Everything in the comparison table’s Free column: unlimited agents, sites and history, the full widget, dashboard, triggers, campaigns, knowledge base, ticketing and analytics. Add-ons are strictly optional.',
  },
  {
    q: 'Can I add or remove add-ons anytime?',
    a: 'Yes. Add-ons are month-to-month, per account (not per site). Remove one and you keep it until the end of the billing period — the free core keeps working either way.',
  },
  {
    q: 'How do AI packs work?',
    a: 'The free core ships with a starter allowance of AI resolutions each month — enough for most small teams. When you outgrow it, packs scale with your volume instead of your headcount, so adding agents never raises the bill.',
  },
];

export default function Pricing() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <main>
      <section className="bg-ink-950 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -top-32 left-1/4 w-[480px] h-[480px] rounded-full bg-aqua-500/15 blur-[140px]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-20 sm:py-28 text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-aqua-400">Pricing</div>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            Free core.{' '}
            <span className="bg-gradient-to-r from-brix-400 to-aqua-300 bg-clip-text text-transparent">Honest add-ons.</span>
          </h1>
          <p className="mt-5 text-lg text-slate-400 max-w-2xl mx-auto">
            No per-agent seats. No per-site stacking. No 14-day trial that holds your chats hostage.
          </p>
        </div>
      </section>

      {/* free core + add-ons */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
        <div className="grid lg:grid-cols-4 gap-6">
          <div className="rounded-3xl border-2 border-brix-600 bg-white p-8 shadow-xl shadow-brix-600/10 relative">
            <div className="absolute -top-3.5 left-8 bg-brix-600 text-white text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              Core
            </div>
            <h2 className="font-display text-xl font-extrabold text-slate-900">Starter</h2>
            <p className="mt-2"><span className="font-display text-5xl font-extrabold text-slate-900">$0</span></p>
            <p className="text-sm text-slate-500">free forever, no card</p>
            <ul className="mt-6 space-y-2.5 text-sm text-slate-600">
              {['Unlimited agents', 'Unlimited sites', 'Unlimited history', 'Widget + dashboard', 'Triggers + campaigns', 'Knowledge base'].map((i) => (
                <li key={i} className="flex gap-2.5"><span className="text-emerald-500 font-bold">✓</span>{i}</li>
              ))}
            </ul>
            <Link to="/signup" className="mt-8 block text-center px-6 py-3 rounded-xl bg-brix-600 hover:bg-brix-700 text-white font-semibold transition">
              Start free
            </Link>
          </div>
          {ADDONS.map((a) => (
            <div key={a.name} className="rounded-3xl border border-slate-200 bg-slate-50 p-8 flex flex-col">
              <h2 className="font-display text-xl font-extrabold text-slate-900">{a.name}</h2>
              <p className="mt-2">
                <span className="font-display text-4xl font-extrabold text-slate-900">{a.price}</span>
                <span className="text-sm text-slate-500">{a.per}</span>
              </p>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">{a.desc}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600 flex-1">
                {a.points.map((p) => (
                  <li key={p} className="flex gap-2.5"><span className="text-brix-500 font-bold">✓</span>{p}</li>
                ))}
              </ul>
              <Link to="/signup" className="mt-6 block text-center px-6 py-3 rounded-xl border border-slate-300 hover:bg-white text-slate-800 font-semibold transition">
                Try free first
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* comparison table */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-20">
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 text-center mb-8">What’s included where</h2>
        <div className="overflow-x-auto rounded-3xl border border-slate-200">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left font-semibold text-slate-500 px-6 py-4">Capability</th>
                <th className="font-semibold text-slate-900 px-4 py-4">Free core</th>
                <th className="font-semibold text-slate-900 px-4 py-4">White-label</th>
                <th className="font-semibold text-slate-900 px-4 py-4">AI packs</th>
                <th className="font-semibold text-slate-900 px-4 py-4">Voice+video</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ROWS.map((r) => (
                <tr key={r.label} className="hover:bg-slate-50/60">
                  <td className="px-6 py-3.5 text-slate-700 font-medium">{r.label}</td>
                  {[r.free, r.whitelabel, r.ai, r.voice].map((v, i) => (
                    <td key={i} className={cx('text-center px-4 py-3.5', v === '✓' ? 'text-emerald-600 font-bold' : v === '—' ? 'text-slate-300' : 'text-slate-600')}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* faq */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 text-center mb-8">Pricing questions</h2>
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {PRICING_FAQ.map((f, i) => (
              <div key={f.q}>
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 py-5 text-left"
                  aria-expanded={open === i}
                >
                  <span className="font-display font-semibold text-slate-900">{f.q}</span>
                  <span className={cx('text-brix-600 transition-transform text-lg', open === i && 'rotate-45')}>+</span>
                </button>
                {open === i && <p className="pb-6 text-slate-600 leading-relaxed">{f.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="bg-ink-950">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-20 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Start free. Upgrade only if you feel like it.</h2>
          <Link
            to="/signup"
            className="mt-8 inline-block px-8 py-4 font-semibold text-white rounded-xl bg-gradient-to-r from-brix-600 to-aqua-500 hover:opacity-90 transition"
          >
            Create your workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
