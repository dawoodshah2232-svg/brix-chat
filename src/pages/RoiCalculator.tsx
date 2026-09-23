// Brix Chat — ROI calculator: interactive support-cost estimator.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Seo, jsonLdBreadcrumb } from '../lib/seo';
import { PageHero } from '../components/marketing';
import { cx } from '../lib/utils';

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm font-semibold text-slate-800">{label}</label>
        <span className="text-sm font-bold text-brix-700 tabular-nums">
          {value.toLocaleString()}
          <span className="font-medium text-slate-500">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-brix-600"
        aria-label={label}
      />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
  prefix = '',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-800">{label}</label>
      <div className="mt-2 relative">
        {prefix && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">{prefix}</span>
        )}
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className={cx(
            'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-brix-500 focus:ring-2 focus:ring-brix-500/20',
            prefix && 'pl-7',
          )}
          aria-label={label}
        />
      </div>
    </div>
  );
}

export default function RoiCalculator() {
  const [agents, setAgents] = useState(5);
  const [chatsPerDay, setChatsPerDay] = useState(12);
  const [handleMin, setHandleMin] = useState(8);
  const [costPerHour, setCostPerHour] = useState(22);
  const [aiResolution, setAiResolution] = useState(25);
  const [timeReduction, setTimeReduction] = useState(20);
  const [planPrice, setPlanPrice] = useState(29);

  const r = useMemo(() => {
    const workingDays = 22;
    const chatsMonth = Math.max(0, agents * chatsPerDay * workingDays);
    const handleHours = (chatsMonth * handleMin) / 60;
    const currentCost = handleHours * costPerHour;
    // AI-resolved chats save the full handle time; the rest get faster handles.
    const savedHours =
      (chatsMonth * ((aiResolution / 100) * handleMin + (1 - aiResolution / 100) * handleMin * (timeReduction / 100))) / 60;
    const savings = savedHours * costPerHour;
    const withBrix = Math.max(0, currentCost - savings) + planPrice;
    const netMonthly = currentCost - withBrix;
    const paybackDays = savings > 0 ? (planPrice / (savings / 30)) : Infinity;
    const maxBar = Math.max(currentCost, withBrix, 1);
    return { chatsMonth, handleHours, currentCost, savedHours, savings, withBrix, netMonthly, paybackDays, maxBar };
  }, [agents, chatsPerDay, handleMin, costPerHour, aiResolution, timeReduction, planPrice]);

  return (
    <main>
      <Seo
        title="ROI calculator — Brix Chat"
        description="Estimate what AI-assisted live chat could save your support team: enter your agents, chat volume and handle time, and see projected savings."
        path="/roi"
        jsonLd={jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'ROI calculator', path: '/roi' }])}
      />
      <PageHero
        kicker="ROI calculator"
        title="Do the support math."
        sub="Tune the numbers to match your team. See what AI-assisted chat and a free core could mean for your monthly support cost."
      />

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-8 items-start">
          {/* inputs */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
            <h2 className="font-display text-lg font-extrabold text-slate-900">Your team</h2>
            <div className="mt-6 grid sm:grid-cols-2 gap-6">
              <NumInput label="Support agents" value={agents} onChange={setAgents} />
              <NumInput label="Cost per agent hour" value={costPerHour} onChange={setCostPerHour} prefix="$" />
            </div>
            <div className="mt-6 space-y-6">
              <SliderRow label="Chats per agent per day" value={chatsPerDay} min={1} max={60} unit=" chats" onChange={setChatsPerDay} />
              <SliderRow label="Average handle time" value={handleMin} min={1} max={60} unit=" min" onChange={setHandleMin} />
            </div>

            <h2 className="mt-10 font-display text-lg font-extrabold text-slate-900">AI uplift assumptions</h2>
            <p className="mt-1 text-sm text-slate-500">Conservative defaults. Lower them if your team is skeptical.</p>
            <div className="mt-6 space-y-6">
              <SliderRow
                label="Chats resolved by AI without an agent"
                value={aiResolution}
                min={0}
                max={80}
                unit="%"
                hint="Deflected by the chatbot answering from your knowledge base."
                onChange={setAiResolution}
              />
              <SliderRow
                label="Handle-time reduction on the rest"
                value={timeReduction}
                min={0}
                max={60}
                unit="%"
                hint="Faster replies from copilot drafts, canned responses and summaries."
                onChange={setTimeReduction}
              />
            </div>

            <h2 className="mt-10 font-display text-lg font-extrabold text-slate-900">Your Brix Chat cost</h2>
            <div className="mt-6 grid sm:grid-cols-2 gap-6 items-end">
              <NumInput label="Plan price per month" value={planPrice} onChange={setPlanPrice} prefix="$" />
              <p className="text-xs text-slate-500 leading-relaxed">
                Defaults to the AI packs add-on at $29/mo. The Starter core is $0; white-label is $19; voice + video
                is $39. <Link to="/pricing" className="text-brix-600 font-semibold hover:underline">See pricing</Link>.
              </p>
            </div>
          </div>

          {/* results */}
          <div className="space-y-6 lg:sticky lg:top-24">
            <div className="rounded-3xl bg-ink-950 p-6 sm:p-8 text-white overflow-hidden relative">
              <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-brix-600/25 blur-[100px] pointer-events-none" aria-hidden />
              <div className="relative">
                <div className="text-xs font-bold uppercase tracking-widest text-aqua-400">Projected result</div>
                <div className="mt-6 grid grid-cols-2 gap-6">
                  <div>
                    <div className="font-display text-3xl sm:text-4xl font-extrabold tabular-nums">
                      {Math.round(r.savedHours).toLocaleString()}h
                    </div>
                    <div className="mt-1 text-sm text-slate-400">agent hours saved / month</div>
                  </div>
                  <div>
                    <div className="font-display text-3xl sm:text-4xl font-extrabold tabular-nums">{USD.format(r.savings)}</div>
                    <div className="mt-1 text-sm text-slate-400">estimated cost savings / month</div>
                  </div>
                  <div>
                    <div className={cx('font-display text-3xl sm:text-4xl font-extrabold tabular-nums', r.netMonthly >= 0 ? 'text-emerald-300' : 'text-amber-300')}>
                      {r.netMonthly >= 0 ? '+' : '−'}{USD.format(Math.abs(r.netMonthly))}
                    </div>
                    <div className="mt-1 text-sm text-slate-400">net after plan cost / month</div>
                  </div>
                  <div>
                    <div className="font-display text-3xl sm:text-4xl font-extrabold tabular-nums">
                      {Number.isFinite(r.paybackDays) && r.savings > 0 ? `${Math.max(1, Math.ceil(r.paybackDays))} days` : '—'}
                    </div>
                    <div className="mt-1 text-sm text-slate-400">payback period</div>
                  </div>
                </div>
                <p className="mt-6 text-sm text-slate-400">
                  {r.chatsMonth.toLocaleString()} chats per month across your team, at{' '}
                  {Math.round(r.handleHours).toLocaleString()} handle hours.
                </p>
              </div>
            </div>

            {/* bar viz */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
              <h3 className="font-display text-base font-extrabold text-slate-900">Monthly support cost</h3>
              <div className="mt-6 space-y-5" role="img" aria-label={`Cost without Brix Chat ${USD.format(r.currentCost)} versus ${USD.format(r.withBrix)} with Brix Chat`}>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-semibold text-slate-600">Without Brix Chat</span>
                    <span className="font-bold text-slate-900 tabular-nums">{USD.format(r.currentCost)}</span>
                  </div>
                  <div className="h-9 rounded-xl bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-xl bg-gradient-to-r from-slate-400 to-slate-500 transition-all duration-500"
                      style={{ width: `${(r.currentCost / r.maxBar) * 100}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-semibold text-brix-700">With Brix Chat</span>
                    <span className="font-bold text-slate-900 tabular-nums">{USD.format(r.withBrix)}</span>
                  </div>
                  <div className="h-9 rounded-xl bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-xl bg-gradient-to-r from-brix-600 to-aqua-500 transition-all duration-500"
                      style={{ width: `${(r.withBrix / r.maxBar) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
              <p className="mt-5 text-xs text-slate-500 leading-relaxed">
                <strong className="text-slate-700">Estimates only</strong> — based on your inputs, not a guarantee. Your
                actual savings depend on your team, your customers and how fully you use the tools.
              </p>
            </div>
          </div>
        </div>

        {/* cta */}
        <div className="mt-16 rounded-3xl bg-brix-50 border border-brix-100 p-8 sm:p-12 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">Like the numbers? Try them for real.</h2>
          <p className="mt-3 text-slate-600 max-w-xl mx-auto">
            Start on the free core — unlimited agents, sites and chat history. Add AI packs only when your volume
            justifies it.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Link to="/signup" className="px-8 py-3.5 font-semibold text-white rounded-xl bg-brix-600 hover:bg-brix-700 transition">
              Start free
            </Link>
            <Link to="/pricing" className="px-8 py-3.5 font-semibold text-brix-700 rounded-xl border border-brix-200 bg-white hover:bg-brix-50 transition">
              Compare plans
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
