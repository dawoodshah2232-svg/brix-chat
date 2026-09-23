// Brix Chat — support tickets: list, detail, create, assign, priority, SLA, bulk actions.

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { getApi } from '../lib/api';
import type { ApiMember, ApiTicket, TicketPriority, TicketStatus } from '../lib/api';
import { Avatar, Badge, Button, EmptyState, Input, Label, Modal, SearchInput, Select, Tabs, Textarea } from '../components/ui';
import { cx, timeAgo } from '../lib/utils';

const STATUS_TONE: Record<TicketStatus, 'cyan' | 'green' | 'slate'> = { new: 'cyan', open: 'green', resolved: 'slate' };
const PRIORITY_TONE: Record<TicketPriority, 'slate' | 'cyan' | 'amber' | 'rose'> = { low: 'slate', medium: 'cyan', high: 'amber', urgent: 'rose' };
const PRIORITIES: TicketPriority[] = ['low', 'medium', 'high', 'urgent'];

function isoAgo(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : timeAgo(t);
}

function slaBadge(slaDue: string | null): { label: string; tone: 'rose' | 'amber' | 'slate' | null } {
  if (!slaDue) return { label: 'No SLA', tone: null };
  const t = Date.parse(slaDue);
  if (Number.isNaN(t)) return { label: 'No SLA', tone: null };
  const diff = t - Date.now();
  if (diff < 0) return { label: 'SLA breached', tone: 'rose' };
  if (diff < 24 * 3600000) return { label: `SLA in ${Math.max(1, Math.round(diff / 3600000))}h`, tone: 'amber' };
  return { label: `SLA ${new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })}`, tone: 'slate' };
}

/** P4-10: duplicate-ticket suggestions via keyword overlap. */
const DUP_STOP = new Set('the a an and or of to in on for with is are was were it this that what how do does did can could would should i you we they he she my your our their me him her them as at by from be been have has had will shall may might must not no yes if then than so but'.split(' '));
function dupKeys(t: string): string[] {
  return t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !DUP_STOP.has(w));
}
function duplicateScore(a: Pick<ApiTicket, 'subject' | 'message' | 'requester_email'>, b: Pick<ApiTicket, 'subject' | 'message' | 'requester_email'>): number {
  const ka = new Set(dupKeys(`${a.subject} ${a.message}`));
  let hit = 0;
  dupKeys(`${b.subject} ${b.message}`).forEach((w) => { if (ka.has(w)) hit += 1; });
  if (a.requester_email && b.requester_email && a.requester_email.toLowerCase() === b.requester_email.toLowerCase()) hit += 3;
  return hit;
}
function findDuplicates(t: Pick<ApiTicket, 'id' | 'subject' | 'message' | 'requester_email'>, all: ApiTicket[], limit = 3): Array<{ t: ApiTicket; score: number }> {
  return all
    .filter((x) => x.id !== t.id && x.status !== 'resolved')
    .map((x) => ({ t: x, score: duplicateScore(t, x) }))
    .filter((x) => x.score >= 3)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Tickets() {
  const { session, effectiveWorkspaceId } = useStore();
  const [params, setParams] = useSearchParams();
  const api = useMemo(() => (session ? getApi(effectiveWorkspaceId(), session.displayName) : null), [session]);

  const [tickets, setTickets] = useState<ApiTicket[]>([]);
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | TicketStatus>('all');
  const [q, setQ] = useState('');
  const [priority, setPriority] = useState<'all' | TicketPriority>('all');
  const [assignee, setAssignee] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAgent, setBulkAgent] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergePrimary, setMergePrimary] = useState('');

  // create form
  const [fSubject, setFSubject] = useState('');
  const [fName, setFName] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fMessage, setFMessage] = useState('');
  const [fPriority, setFPriority] = useState<TicketPriority>('medium');
  const [fAssignee, setFAssignee] = useState('');
  const [fSla, setFSla] = useState('');
  const [fTags, setFTags] = useState('');

  const ticketId = params.get('ticket');
  const active = tickets.find((t) => t.id === ticketId) ?? null;

  const refresh = async () => {
    if (!api) return;
    setLoading(true);
    try {
      const [{ data: page }, { data: ms }] = await Promise.all([
        api.tickets.list({ limit: 200 }),
        api.members.list(),
      ]);
      setTickets(page.items);
      setMembers(ms);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [session?.workspaceId, session?.viewingWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? 'Unassigned';

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return tickets
      .filter((x) => tab === 'all' || x.status === tab)
      .filter((x) => priority === 'all' || x.priority === priority)
      .filter((x) => assignee === 'all' || (assignee === 'unassigned' ? !x.assignee_id : x.assignee_id === assignee))
      .filter((x) =>
        !t ||
        x.subject.toLowerCase().includes(t) ||
        x.requester_name.toLowerCase().includes(t) ||
        x.requester_email.toLowerCase().includes(t) ||
        x.message.toLowerCase().includes(t),
      );
  }, [tickets, tab, q, priority, assignee]);

  const counts = useMemo(() => ({
    new: tickets.filter((t) => t.status === 'new').length,
    open: tickets.filter((t) => t.status === 'open').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
  }), [tickets]);

  const select = (id: string | null) => {
    if (id) setParams({ ticket: id }, { replace: true });
    else setParams({}, { replace: true });
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const bulk = async (action: 'resolve' | 'assign' | 'spam') => {
    if (!api || selected.size === 0) return;
    setBusy(true);
    try {
      await api.tickets.bulk([...selected], action, action === 'assign' ? bulkAgent || undefined : undefined);
      setSelected(new Set());
      refresh();
    } catch { /* ignore */ }
    setBusy(false);
  };

  /** P4-10: merge selected tickets into one. Sources are resolved + tagged (reversible), never deleted. */
  const mergeTickets = async () => {
    if (!api || selected.size < 2 || !mergePrimary) return;
    setBusy(true);
    try {
      const sel = tickets.filter((t) => selected.has(t.id));
      const primary = sel.find((t) => t.id === mergePrimary) ?? sel[0];
      const others = sel.filter((t) => t.id !== primary.id);
      const prioRank: TicketPriority[] = ['low', 'medium', 'high', 'urgent'];
      const topPrio = [...sel].sort((a, b) => prioRank.indexOf(b.priority) - prioRank.indexOf(a.priority))[0].priority;
      const slaDates = sel.map((t) => t.sla_due).filter(Boolean) as string[];
      const earliestSla = slaDates.length ? slaDates.sort()[0] : null;
      const { data: merged } = await api.tickets.create({
        subject: primary.subject,
        requester_name: primary.requester_name,
        requester_email: primary.requester_email,
        message: [primary.message, ...others.map((t) => `\n\n— merged from "${t.subject}" (${t.requester_name}) —\n${t.message}`)].join(''),
        priority: topPrio,
        assignee_id: primary.assignee_id,
        sla_due: earliestSla,
        conversation_id: primary.conversation_id,
        tags: [...new Set([...sel.flatMap((t) => t.tags), 'merged'])],
      });
      for (const t of others) {
        await api.tickets.update(t.id, { status: 'resolved', tags: [...new Set([...t.tags, `merged:${merged.id}`])] });
      }
      setTickets((xs) => [merged, ...xs.map((x) => (selected.has(x.id) && x.id !== primary.id
        ? { ...x, status: 'resolved' as TicketStatus, tags: [...new Set([...x.tags, `merged:${merged.id}`])] }
        : x))]);
      setSelected(new Set());
      setMergePrimary('');
      setMerging(false);
      select(merged.id);
    } catch { /* ignore */ }
    setBusy(false);
  };

  const patchTicket = async (id: string, patch: Parameters<NonNullable<typeof api>['tickets']['update']>[1]) => {
    if (!api) return;
    try {
      const { data: t } = await api.tickets.update(id, patch);
      setTickets((xs) => xs.map((x) => (x.id === id ? t : x)));
    } catch { /* ignore */ }
  };

  const create = async () => {
    if (!api || !fSubject.trim() || !fMessage.trim()) return;
    setBusy(true);
    try {
      const { data: t } = await api.tickets.create({
        subject: fSubject.trim(),
        requester_name: fName.trim() || 'Guest',
        requester_email: fEmail.trim(),
        message: fMessage.trim(),
        priority: fPriority,
        assignee_id: fAssignee || null,
        sla_due: fSla ? new Date(fSla).toISOString() : null,
        tags: fTags.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      });
      setTickets((xs) => [t, ...xs]);
      setCreating(false);
      setFSubject(''); setFName(''); setFEmail(''); setFMessage('');
      setFPriority('medium'); setFAssignee(''); setFSla(''); setFTags('');
      select(t.id);
    } catch { /* ignore */ }
    setBusy(false);
  };

  return (
    <div className="h-full flex">
      {/* List */}
      <div className={cx('w-full lg:w-96 xl:w-[26rem] shrink-0 flex flex-col border-r border-slate-200/80 bg-white', active && 'hidden lg:flex')}>
        <div className="p-4 pb-3 space-y-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-slate-900">Tickets</h2>
            <Button size="sm" onClick={() => setCreating(true)}>+ New ticket</Button>
          </div>
          <Tabs<'all' | TicketStatus>
            tabs={[
              { id: 'all', label: 'All', count: tickets.length },
              { id: 'new', label: 'New', count: counts.new },
              { id: 'open', label: 'Open', count: counts.open },
              { id: 'resolved', label: 'Resolved', count: counts.resolved },
            ]}
            active={tab}
            onChange={setTab}
          />
          <SearchInput value={q} onChange={setQ} placeholder="Search tickets…" />
          <div className="flex gap-2">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as 'all' | TicketPriority)} className="text-xs flex-1">
              <option value="all">Priority: all</option>
              {PRIORITIES.map((p) => <option key={p} value={p} className="capitalize">⚑ {p}</option>)}
            </Select>
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="text-xs flex-1">
              <option value="all">Assignee: all</option>
              <option value="unassigned">Unassigned</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
            </Select>
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-ink-950 text-white px-3 py-2 flex-wrap">
              <span className="text-xs font-bold">{selected.size} selected</span>
              <Select value={bulkAgent} onChange={(e) => setBulkAgent(e.target.value)} className="text-xs text-slate-900 max-w-28 py-1">
                <option value="">Assign…</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
              </Select>
              <button onClick={() => bulk('assign')} disabled={!bulkAgent || busy} className="text-xs font-semibold px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40">Apply</button>
              <button onClick={() => bulk('resolve')} disabled={busy} className="text-xs font-semibold px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20">✓ Resolve</button>
              {selected.size >= 2 && (
                <button onClick={() => { setMergePrimary([...selected][0]); setMerging(true); }} disabled={busy} className="text-xs font-semibold px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20">🔀 Merge</button>
              )}
              <button onClick={() => bulk('spam')} disabled={busy} className="text-xs font-semibold px-2 py-1 rounded-lg bg-rose-500/80 hover:bg-rose-500">🚫 Spam</button>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-300 hover:text-white">✕</button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto slim-scroll">
          {loading && <div className="p-6 text-center text-sm text-slate-400">Loading tickets…</div>}
          {!loading && list.length === 0 && (
            <EmptyState icon="🎫" title="No tickets" hint="Create one, or turn any chat into a ticket from the thread." />
          )}
          {list.map((t) => {
            const sla = slaBadge(t.sla_due);
            return (
              <div key={t.id} className={cx('flex gap-2.5 px-4 py-3.5 border-b border-slate-100 hover:bg-slate-50 transition', active?.id === t.id && 'bg-brix-50 hover:bg-brix-50 border-l-4 border-l-brix-600')}>
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)}
                  className="mt-1 w-4 h-4 rounded accent-brix-600 shrink-0" aria-label={`Select ticket ${t.subject}`} />
                <button onClick={() => select(t.id)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm text-slate-900 truncate">{t.subject}</span>
                    <span className="ml-auto text-[11px] text-slate-400 shrink-0">{isoAgo(t.updated_at)}</span>
                  </div>
                  <div className="text-[13px] text-slate-500 truncate mt-0.5">{t.requester_name} — {t.message.split('\n')[0]}</div>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                    <Badge tone={PRIORITY_TONE[t.priority]}>⚑ {t.priority}</Badge>
                    {sla.tone && <Badge tone={sla.tone}>{sla.label}</Badge>}
                    {t.conversation_id && <Badge tone="indigo">💬 chat</Badge>}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail */}
      <div className={cx('flex-1 min-w-0 bg-slate-50 overflow-y-auto slim-scroll', !active && 'hidden lg:block')}>
        {active ? (
          <div className="max-w-3xl mx-auto p-6">
            <button className="lg:hidden text-sm font-semibold text-brix-600 mb-3" onClick={() => select(null)}>← Back to tickets</button>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <Avatar name={active.requester_name} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display font-bold text-xl text-slate-900">{active.subject}</h2>
                  <div className="text-sm text-slate-500 mt-1">
                    {active.requester_name}{active.requester_email ? ` · ${active.requester_email}` : ''} · opened {isoAgo(active.created_at)}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <Badge tone={STATUS_TONE[active.status]}>{active.status}</Badge>
                    <Badge tone={PRIORITY_TONE[active.priority]}>⚑ {active.priority}</Badge>
                    {(() => { const s = slaBadge(active.sla_due); return s.tone ? <Badge tone={s.tone}>{s.label}</Badge> : null; })()}
                    {active.tags.map((tg) => <Badge key={tg} tone="slate">#{tg}</Badge>)}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-700 whitespace-pre-wrap max-h-64 overflow-y-auto slim-scroll">
                {active.message}
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mt-5">
                <div>
                  <Label>Status</Label>
                  <Select value={active.status} onChange={(e) => patchTicket(active.id, { status: e.target.value as TicketStatus })} className="w-full">
                    <option value="new">New</option>
                    <option value="open">Open</option>
                    <option value="resolved">Resolved</option>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={active.priority} onChange={(e) => patchTicket(active.id, { priority: e.target.value as TicketPriority })} className="w-full capitalize">
                    {PRIORITIES.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Assignee</Label>
                  <Select value={active.assignee_id ?? ''} onChange={(e) => patchTicket(active.id, { assignee_id: e.target.value || null })} className="w-full">
                    <option value="">Unassigned</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.display_name} ({m.role})</option>)}
                  </Select>
                </div>
                <div>
                  <Label>SLA due</Label>
                  <Input
                    type="datetime-local"
                    value={toLocalInput(active.sla_due)}
                    onChange={(e) => patchTicket(active.id, { sla_due: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    className="w-full"
                  />
                </div>
              </div>

              {(() => {
                const dups = findDuplicates(active, tickets);
                if (dups.length === 0) return null;
                return (
                  <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-2">Possible duplicates</div>
                    <div className="space-y-1.5">
                      {dups.map(({ t }) => (
                        <button key={t.id} onClick={() => select(t.id)} className="w-full text-left text-sm hover:underline">
                          <span className="font-semibold text-slate-800">{t.subject}</span>
                          <span className="text-slate-500"> · {t.requester_name} · {t.status} · ⚑ {t.priority}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="mt-4 text-xs text-slate-400">
                Assigned to {memberName(active.assignee_id)}{active.conversation_id ? ' · linked to a chat conversation' : ''}
              </div>

              <div className="flex gap-2 mt-5">
                {active.status !== 'resolved' && (
                  <Button size="sm" onClick={() => patchTicket(active.id, { status: 'resolved' })}>✓ Resolve</Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => { patchTicket(active.id, { status: 'resolved' }); patchTicket(active.id, { tags: [...active.tags, 'spam'] }); }}>🚫 Spam</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full grid place-items-center">
            <EmptyState icon="🎫" title="Select a ticket" hint="Pick a ticket from the list to see details and SLA." />
          </div>
        )}
      </div>

      {/* Merge modal */}
      <Modal open={merging} onClose={() => setMerging(false)} title={`Merge ${selected.size} tickets`}>
        <p className="text-sm text-slate-500 mb-4">
          Combines the selected tickets into one. The others are resolved and tagged — nothing is deleted.
        </p>
        <Label>Keep as primary</Label>
        <div className="space-y-2 mt-1">
          {tickets.filter((t) => selected.has(t.id)).map((t) => (
            <label key={t.id} className={cx('flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition',
              mergePrimary === t.id ? 'border-brix-500 bg-brix-50' : 'border-slate-200 hover:border-slate-300')}>
              <input type="radio" name="merge-primary" checked={mergePrimary === t.id}
                onChange={() => setMergePrimary(t.id)} className="mt-1 accent-brix-600" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">{t.subject}</div>
                <div className="text-xs text-slate-500">{t.requester_name} · {t.status} · ⚑ {t.priority}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setMerging(false)}>Cancel</Button>
          <Button onClick={mergeTickets} disabled={busy || !mergePrimary}>{busy ? 'Merging…' : 'Merge tickets'}</Button>
        </div>
      </Modal>

      {/* Create modal */}
      <Modal open={creating} onClose={() => setCreating(false)} title="New ticket" wide>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><Label>Subject</Label><Input value={fSubject} onChange={(e) => setFSubject(e.target.value)} placeholder="What is this about?" />
            {fSubject.trim().length > 4 && (() => {
              const dups = findDuplicates({ id: '', subject: fSubject, message: fMessage, requester_email: fEmail }, tickets);
              if (dups.length === 0) return null;
              return (
                <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Possible duplicates — reply there instead?</div>
                  {dups.map(({ t }) => (
                    <button key={t.id} onClick={() => { setCreating(false); select(t.id); }}
                      className="block w-full text-left text-xs mt-1 hover:underline">
                      <span className="font-semibold text-slate-800">{t.subject}</span>
                      <span className="text-slate-500"> · {t.status} · {isoAgo(t.updated_at)}</span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
          <div><Label>Requester name</Label><Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Jane Cooper" /></div>
          <div><Label>Requester email</Label><Input value={fEmail} onChange={(e) => setFEmail(e.target.value)} placeholder="jane@company.com" /></div>
          <div className="sm:col-span-2"><Label>Message</Label><Textarea value={fMessage} onChange={(e) => setFMessage(e.target.value)} rows={4} placeholder="Describe the issue…" /></div>
          <div><Label>Priority</Label><Select value={fPriority} onChange={(e) => setFPriority(e.target.value as TicketPriority)} className="w-full capitalize">{PRIORITIES.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}</Select></div>
          <div><Label>Assignee</Label><Select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} className="w-full"><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}</Select></div>
          <div><Label>SLA due</Label><Input type="datetime-local" value={fSla} onChange={(e) => setFSla(e.target.value)} className="w-full" /></div>
          <div><Label>Tags (comma separated)</Label><Input value={fTags} onChange={(e) => setFTags(e.target.value)} placeholder="billing, urgent" /></div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
          <Button onClick={create} disabled={busy || !fSubject.trim() || !fMessage.trim()}>{busy ? 'Creating…' : 'Create ticket'}</Button>
        </div>
      </Modal>
    </div>
  );
}
