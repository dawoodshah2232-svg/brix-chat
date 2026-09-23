// Brix Chat — Live visitors page.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import type { Visitor } from '../lib/types';
import { fmtDuration, timeAgo } from '../lib/utils';
import { Badge, Button, Card, EmptyState, Modal, Tabs } from '../components/ui';

const FLAGS: Record<string, string> = {
  'UAE': '🇦🇪',
  'Saudi Arabia': '🇸🇦',
  'Germany': '🇩🇪',
  'Italy': '🇮🇹',
  'India': '🇮🇳',
  'UK': '🇬🇧',
  'US': '🇺🇸',
  'United Kingdom': '🇬🇧',
  'United States': '🇺🇸',
};

function flag(country: string): string {
  return FLAGS[country] ?? '🌍';
}

function CobrowseMock({ visitor }: { visitor: Visitor }) {
  return (
    <div>
      <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 font-medium">
        👁️ View-only co-browsing (simulated) — visitor screen mirror
      </div>
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        {/* fake browser chrome */}
        <div className="bg-slate-100 px-3 py-2 flex items-center gap-2 border-b border-slate-200">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="ml-2 flex-1 bg-white rounded-md px-3 py-1 text-xs text-slate-500 truncate">
            {visitor.page}
          </span>
        </div>
        {/* fake mini webpage */}
        <div className="bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="w-16 h-5 rounded bg-brix-600/80" />
            <div className="flex gap-3">
              <div className="w-10 h-2.5 rounded bg-slate-200" />
              <div className="w-10 h-2.5 rounded bg-slate-200" />
              <div className="w-10 h-2.5 rounded bg-slate-200" />
            </div>
          </div>
          <div className="mx-4 my-4 rounded-xl h-24 bg-gradient-to-br from-brix-100 via-cyan-100 to-brix-200 grid place-items-center">
            <div className="text-center">
              <div className="w-36 h-3.5 rounded bg-ink-950/70 mx-auto" />
              <div className="w-24 h-2.5 rounded bg-slate-400/70 mx-auto mt-2" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 px-4 pb-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg border border-slate-100 p-2">
                <div className="h-12 rounded bg-slate-100" />
                <div className="w-3/4 h-2 rounded bg-slate-200 mt-2" />
                <div className="w-1/2 h-2 rounded bg-brix-200 mt-1.5" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Mirroring <span className="font-semibold text-slate-700">{visitor.name}</span>'s tab · {flag(visitor.country)} {visitor.city}, {visitor.country} · read-only, no control granted.
      </p>
    </div>
  );
}

/** P4-14 — real-time operations monitor. Reads live local state; the parent
 *  page ticks every second, so queue depth and wait timers update as you work. */
function OpsMonitor() {
  const store = useStore();
  const navigate = useNavigate();
  const team = store.data.settings.team;
  const open = store.data.conversations.filter((c) => c.status === 'open');
  const queue = open.filter((c) => !c.agent);

  const lastVisitorTs = (c: (typeof open)[number]) => {
    const vm = c.messages.filter((m) => m.from === 'visitor');
    return vm.length ? vm[vm.length - 1].ts : c.createdAt;
  };
  const waits = open.map((c) => ({ c, wait: Date.now() - lastVisitorTs(c) }));
  const longest = waits.length ? waits.reduce((a, b) => (b.wait > a.wait ? b : a)) : null;

  const online = team.filter((t) => t.online);
  const away = team.filter((t) => !t.online);
  const loadOf = (name: string) => open.filter((c) => c.agent === name).length;

  const events = store.data.conversations.flatMap((c) => {
    const ev: Array<{ ts: number; icon: string; text: string; convId: string }> = [
      { ts: c.createdAt, icon: '💬', text: `Chat opened — ${c.visitor}`, convId: c.id },
    ];
    const ratingMsg = c.messages.find((m) => m.kind === 'rating' && m.rating);
    if (ratingMsg?.rating) ev.push({ ts: ratingMsg.ts, icon: '⭐', text: `${c.visitor} rated ${ratingMsg.rating}/5`, convId: c.id });
    if (c.status === 'closed') ev.push({ ts: c.updatedAt, icon: '✅', text: `Chat closed — ${c.visitor}`, convId: c.id });
    return ev;
  }).sort((a, b) => b.ts - a.ts).slice(0, 8);

  const stats = [
    { label: 'Agents online', value: `${online.length}/${team.length}`, sub: away.length ? `${away.length} away` : 'Everyone in' },
    { label: 'Open chats', value: String(open.length), sub: `${open.filter((c) => c.live).length} live now` },
    { label: 'Unassigned queue', value: String(queue.length), sub: queue.length ? 'Needs an agent' : 'All assigned' },
    { label: 'Longest wait', value: longest ? fmtDuration(longest.wait) : '—', sub: longest ? longest.c.visitor : 'No open chats' },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-brix-200 bg-brix-50/60 px-4 py-2.5 text-xs text-brix-800">
        ⚡ Live operations — updates as you work. Local mode: no server push, figures refresh from your workspace state.
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((st) => (
          <Card key={st.label} className="!p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{st.label}</div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">{st.value}</div>
            <div className="text-xs text-slate-500 mt-0.5 truncate">{st.sub}</div>
          </Card>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900">Agent load</div>
          <div className="divide-y divide-slate-50">
            {[...online, ...away].map((t) => (
              <div key={t.name} className="flex items-center gap-3 px-5 py-3">
                <span className={'w-2.5 h-2.5 rounded-full ' + (t.online ? 'bg-emerald-500' : 'bg-slate-300')} />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-800">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.role}{t.online ? '' : ' · away'}</div>
                </div>
                <Badge tone={loadOf(t.name) > 3 ? 'rose' : loadOf(t.name) > 0 ? 'amber' : 'slate'}>
                  {loadOf(t.name)} open
                </Badge>
              </div>
            ))}
            {team.length === 0 && <div className="px-5 py-6 text-sm text-slate-500">No team members.</div>}
          </div>
        </Card>
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900">Recent events</div>
          <div className="divide-y divide-slate-50">
            {events.map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                <span className="text-base">{e.icon}</span>
                <div className="flex-1 text-sm text-slate-700">{e.text}</div>
                <button onClick={() => navigate(`/app?c=${e.convId}`)} className="text-xs font-semibold text-brix-600 hover:underline">Open</button>
                <div className="text-[11px] text-slate-500 whitespace-nowrap">{timeAgo(e.ts)}</div>
              </div>
            ))}
            {events.length === 0 && <div className="px-5 py-6 text-sm text-slate-500">No events yet.</div>}
          </div>
        </Card>
      </div>
      {queue.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900">Unassigned queue</div>
          <div className="divide-y divide-slate-50">
            {queue.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-800">{c.visitor}</div>
                  <div className="text-xs text-slate-500">waiting {fmtDuration(Date.now() - lastVisitorTs(c))} · {c.department}</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => navigate(`/app?c=${c.id}`)}>Assign</Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export default function Visitors() {
  const store = useStore();
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [mirror, setMirror] = useState<Visitor | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const visitors = [...store.data.visitors].sort(
    (a, b) => Number(b.online) - Number(a.online) || b.timeOnSite - a.timeOnSite,
  );
  const onlineCount = store.data.visitors.filter((v) => v.online).length;

  const engage = (v: Visitor) => {
    const id = store.newProactiveChat(v.id, "Hi 👋 I noticed you're browsing — any questions I can help with?");
    navigate(`/app?c=${id}`);
  };

  const [tab, setTab] = useState<'visitors' | 'ops'>('visitors');

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-display font-extrabold text-slate-900">Live visitors</h1>
          <p className="text-sm text-slate-500 mt-0.5">Everyone browsing your site right now</p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs
            tabs={[
              { id: 'visitors', label: 'Visitors' },
              { id: 'ops', label: '⚡ Operations' },
            ]}
            active={tab}
            onChange={(id) => setTab(id as 'visitors' | 'ops')}
          />
          <Badge tone="green" className="text-sm px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> {onlineCount} online
          </Badge>
        </div>
      </div>

      {tab === 'ops' ? <OpsMonitor /> : (
      <>
      {visitors.length === 0 ? (
        <Card><EmptyState icon="👥" title="No visitors on your site" hint="Visitors will appear here in real time once the widget is embedded." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                  <th className="px-5 py-3 font-semibold">Visitor</th>
                  <th className="px-5 py-3 font-semibold">Current page</th>
                  <th className="px-5 py-3 font-semibold">Location</th>
                  <th className="px-5 py-3 font-semibold">Device</th>
                  <th className="px-5 py-3 font-semibold">Time on site</th>
                  <th className="px-5 py-3 font-semibold">Activity</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visitors.map((v) => (
                  <tr key={v.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="relative flex w-2.5 h-2.5">
                          <span className={v.online ? 'w-2.5 h-2.5 rounded-full bg-emerald-500' : 'w-2.5 h-2.5 rounded-full bg-slate-300'} />
                        </span>
                        <div>
                          <div className="font-semibold text-slate-900">{v.name}</div>
                          <div className="text-xs text-slate-500">{v.pages} page{v.pages === 1 ? '' : 's'} viewed</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 font-mono text-xs max-w-[200px] truncate">{v.page}</td>
                    <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">
                      <span className="mr-1.5">{flag(v.country)}</span>{v.city}, {v.country}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{v.device} · {v.browser}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-800 whitespace-nowrap tabular-nums">
                      {fmtDuration(v.timeOnSite + (v.online ? tick : 0))}
                      {v.online && <span className="ml-1.5 text-[10px] font-bold text-emerald-600 uppercase">live</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-1.5">
                        {v.typing && <span className="text-xs text-brix-600 font-medium">💬 typing: {v.typing}…</span>}
                        {v.cartValue !== undefined && <Badge tone="amber">🛒 ${v.cartValue.toFixed(2)}</Badge>}
                        {!v.typing && v.cartValue === undefined && <span className="text-xs text-slate-500">—</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setMirror(v)}>Co-browse</Button>
                        <Button size="sm" onClick={() => engage(v)} disabled={!v.online}>Engage</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={mirror !== null} onClose={() => setMirror(null)} wide
        title={mirror ? `Co-browsing · ${mirror.name}` : 'Co-browsing'}>
        {mirror && <CobrowseMock visitor={mirror} />}
      </Modal>
      </>
      )}
    </div>
  );
}
