// Brix Chat — status page: current state + incident history (admin-manageable).

import { useEffect, useState } from 'react';
import { getApi } from '../lib/api';
import { useStore } from '../lib/store';
import { asP2, fmtTs, type ApiStatusEntry2 } from '../lib/contentSeed';
import { Seo, jsonLdBreadcrumb } from '../lib/seo';
import { PageHero } from '../components/marketing';
import { cx } from '../lib/utils';

const STATE_META: Record<ApiStatusEntry2['state'], { label: string; dot: string; chip: string }> = {
  operational: { label: 'Operational', dot: 'bg-emerald-400', chip: 'bg-emerald-100 text-emerald-800' },
  degraded: { label: 'Degraded', dot: 'bg-amber-400', chip: 'bg-amber-100 text-amber-800' },
  incident: { label: 'Incident', dot: 'bg-rose-500', chip: 'bg-rose-100 text-rose-800' },
};

export default function Status() {
  const { session } = useStore();
  const [entries, setEntries] = useState<ApiStatusEntry2[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const p2 = asP2(getApi(session?.workspaceId ?? 'demo', 'web'));
        const { data } = await p2.statusEntries.list();
        setEntries([...data.items].sort((a, b) => b.created_at - a.created_at));
      } catch {
        setEntries([]);
      }
    })();
  }, [session?.workspaceId]);

  const latest = entries[0];
  const overall = latest && latest.state !== 'operational' ? latest.state : 'operational';
  const meta = STATE_META[overall];

  return (
    <main>
      <Seo
        title="Status — Brix Chat"
        description="Brix Chat system status: current operational state and incident history."
        path="/status"
        jsonLd={jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Status', path: '/status' }])}
      />
      <PageHero kicker="Status" title="System status." sub="Current state of Brix Chat services and recent history." />

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
        <div className={cx('rounded-3xl border p-8 flex items-center gap-5', overall === 'operational' ? 'border-emerald-200 bg-emerald-50' : overall === 'degraded' ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50')} role="status">
          <span className={cx('w-4 h-4 rounded-full animate-pulse shrink-0', meta.dot)} aria-hidden />
          <div>
            <div className="font-display text-2xl font-extrabold text-slate-900">
              {overall === 'operational' ? 'All systems operational' : meta.label}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {latest ? `Last update: ${latest.title} — ${fmtTs(latest.created_at)}` : 'No incidents reported. Local mode runs entirely in your browser.'}
            </p>
          </div>
        </div>

        <h2 className="font-display text-2xl font-extrabold text-slate-900 mt-12 mb-6">History</h2>
        {entries.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center">
            <div className="text-4xl mb-3" aria-hidden>📋</div>
            <p className="font-semibold text-slate-800">No incidents recorded</p>
            <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
              When something happens, it will appear here. Workspace admins can post updates from Admin → Content → Status page.
            </p>
          </div>
        ) : (
          <ol className="space-y-4">
            {entries.map((e) => {
              const m = STATE_META[e.state];
              return (
                <li key={e.id} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={cx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold', m.chip)}>
                      <span className={cx('w-2 h-2 rounded-full', m.dot)} aria-hidden />
                      {m.label}
                    </span>
                    <time className="text-sm text-slate-500" dateTime={new Date(e.created_at).toISOString()}>
                      {fmtTs(e.created_at)}
                    </time>
                  </div>
                  <div className="mt-2 font-bold text-slate-900">{e.title}</div>
                  {e.detail && <p className="mt-1 text-sm text-slate-600 leading-relaxed">{e.detail}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </main>
  );
}
