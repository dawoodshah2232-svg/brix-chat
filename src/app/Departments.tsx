// Brix Chat — Departments: the client's own support departments.
// CRUD, agent assignment, routing modes. Client-scoped per property.

import { useEffect, useState } from 'react';
import { Button, Card, Input, Label, Modal, Select, Badge, EmptyState, useConfirm } from '../components/ui';
import { toast } from '../components/dashboard/Toasts';
import { useClientApi } from '../components/dashboard/useClientApi';
import type { ApiDepartment, ApiMember, ApiProperty } from '../lib/api';

import { cx } from '../lib/utils';

const ROUTING: Array<{ id: ApiDepartment['routing_mode']; label: string; hint: string }> = [
  { id: 'round-robin', label: 'Round robin', hint: 'Deal chats out evenly, in turn' },
  { id: 'least-busy', label: 'Least busy', hint: 'Route to the agent with fewest open chats' },
  { id: 'first-available', label: 'First available', hint: 'Route to the first online agent' },
];

export default function Departments() {
  const { api } = useClientApi();
  const { confirm, dialog } = useConfirm();
  const [props, setProps] = useState<ApiProperty[]>([]);
  const [propId, setPropId] = useState('');
  const [depts, setDepts] = useState<ApiDepartment[]>([]);
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [draft, setDraft] = useState<Partial<ApiDepartment> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!api) return;
    Promise.all([api.properties.list(), api.members.list()]).then(([{ data: p }, { data: m }]) => {
      setProps(p);
      setMembers(m);
      if (p.length && !propId) setPropId(p[0].id);
    }).catch(() => {});
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async () => {
    if (!api || !propId) return;
    try {
      const { data } = await api.departments.list(propId);
      setDepts(data);
    } catch { /* ignore */ }
  };
  useEffect(() => { refresh(); }, [api, propId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!api || !draft?.name?.trim()) return;
    setBusy(true);
    try {
      if (draft.id) {
        await api.departments.update(draft.id, {
          name: draft.name.trim(),
          description: draft.description ?? '',
          agent_ids: draft.agent_ids ?? [],
          routing_mode: draft.routing_mode ?? 'round-robin',
          offline_behavior: draft.offline_behavior ?? 'ticket',
        });
        toast.success('Department updated.');
      } else {
        await api.departments.create(propId, {
          name: draft.name.trim(),
          description: draft.description ?? '',
          agent_ids: draft.agent_ids ?? [],
          routing_mode: draft.routing_mode ?? 'round-robin',
        });
        toast.success('Department created.');
      }
      setDraft(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the department.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (d: ApiDepartment) => {
    if (!api) return;
    confirm({
      title: 'Delete department?',
      body: `Delete the “${d.name}” department? Chats route to the fallback afterwards.`,
      action: () => { void doRemove(d); },
    });
  };

  const doRemove = async (d: ApiDepartment) => {
    if (!api) return;
    try {
      await api.departments.delete(d.id);
      toast.success('Department deleted.');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the department.');
    }
  };

  const toggleAgent = (id: string) => {
    setDraft((v) => {
      if (!v) return v;
      const ids = v.agent_ids ?? [];
      return { ...v, agent_ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] };
    });
  };

  const agentName = (id: string) => members.find((m) => m.id === id)?.display_name ?? 'Unknown';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {dialog}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Departments</h1>
          <p className="text-sm text-slate-500 mt-1">Route chats to the right team on each website.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={propId} onChange={(e) => setPropId(e.target.value)} className="min-w-44">
            {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Button onClick={() => setDraft({ name: '', description: '', agent_ids: [], routing_mode: 'round-robin', offline_behavior: 'ticket' })} disabled={!propId}>+ New department</Button>
        </div>
      </div>

      {depts.length === 0 ? (
        <Card><EmptyState icon="🏢" title="No departments" hint="Create departments like Sales and Support to route chats." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {depts.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900">{d.name}</h2>
                  {d.description && <p className="text-sm text-slate-500 mt-0.5">{d.description}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="secondary" onClick={() => setDraft(d)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(d)}>🗑</Button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Badge tone="cyan">{ROUTING.find((r) => r.id === d.routing_mode)?.label ?? d.routing_mode}</Badge>
                <Badge tone={d.offline_behavior === 'hide' ? 'slate' : 'amber'}>
                  {d.offline_behavior === 'ticket' ? 'Offline → ticket' : d.offline_behavior === 'message' ? 'Offline → message' : 'Hidden offline'}
                </Badge>
              </div>
              <div className="mt-3">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Agents ({d.agent_ids.length})</div>
                {d.agent_ids.length === 0 ? (
                  <span className="text-xs text-slate-400">No agents assigned — chats wait unassigned.</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {d.agent_ids.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                        <span className="w-5 h-5 rounded-full grid place-items-center text-white text-[9px] font-bold" style={{ background: members.find((m) => m.id === id)?.color ?? '#64748b' }}>
                          {(agentName(id)[0] ?? '?').toUpperCase()}
                        </span>
                        {agentName(id)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit department' : 'New department'}>
        <div className="space-y-4">
          <div>
            <Label>Department name</Label>
            <Input value={draft?.name ?? ''} onChange={(e) => setDraft((v) => v && { ...v, name: e.target.value })} placeholder="Sales" />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={draft?.description ?? ''} onChange={(e) => setDraft((v) => v && { ...v, description: e.target.value })} placeholder="Pre-sales questions and demos" />
          </div>
          <div>
            <Label>Routing mode</Label>
            <div className="grid gap-2 mt-1">
              {ROUTING.map((r) => (
                <label key={r.id} className={cx('flex items-center gap-3 px-3.5 py-2.5 rounded-xl border cursor-pointer transition', draft?.routing_mode === r.id ? 'border-brix-500 bg-brix-50' : 'border-slate-200 hover:border-slate-300')}>
                  <input type="radio" checked={draft?.routing_mode === r.id} onChange={() => setDraft((v) => v && { ...v, routing_mode: r.id })} className="accent-brix-600" />
                  <span>
                    <span className="block text-sm font-bold text-slate-800">{r.label}</span>
                    <span className="block text-xs text-slate-500">{r.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label>Agents in this department</Label>
            <div className="grid grid-cols-2 gap-2 mt-1 max-h-44 overflow-y-auto slim-scroll">
              {members.map((m) => (
                <label key={m.id} className={cx('flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer transition', draft?.agent_ids?.includes(m.id) ? 'border-brix-500 bg-brix-50 font-semibold text-brix-800' : 'border-slate-200 text-slate-600')}>
                  <input type="checkbox" checked={draft?.agent_ids?.includes(m.id)} onChange={() => toggleAgent(m.id)} className="accent-brix-600" />
                  {m.display_name} <span className="text-xs text-slate-400">({m.role})</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label>When everyone is offline</Label>
            <Select value={draft?.offline_behavior ?? 'ticket'} onChange={(e) => setDraft((v) => v && { ...v, offline_behavior: e.target.value as ApiDepartment['offline_behavior'] })} className="w-full">
              <option value="ticket">Create a ticket</option>
              <option value="message">Take a message</option>
              <option value="hide">Hide the widget</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={save} disabled={busy || !draft?.name?.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
