// Brix Chat — Team: members, roles, invite with a one-time passcode,
// bulk role changes. Client-scoped. No 'owner' role is assignable here.

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Label, Modal, Select, Badge, EmptyState } from '../components/ui';
import { toast } from '../components/dashboard/Toasts';
import { useClientApi } from '../components/dashboard/useClientApi';
import { useStore } from '../lib/store';
import type { ApiMember, TeamRole } from '../lib/api';
import { useConfirm } from '../components/Confirm';
import { timeAgo } from '../lib/utils';

const ASSIGNABLE: TeamRole[] = ['admin', 'agent', 'developer', 'viewer'];

function randomPasscode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default function Team() {
  const { api } = useClientApi();
  const { session } = useStore();
  const { confirm, dialog } = useConfirm();
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkRole, setBulkRole] = useState<TeamRole>('agent');
  const [invite, setInvite] = useState<{ name: string; role: TeamRole } | null>(null);
  const [issued, setIssued] = useState<{ name: string; passcode: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!api) return;
    try {
      const { data } = await api.members.list();
      setMembers(data);
    } catch {
      /* ignore */
    }
  };
  useEffect(() => { refresh(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  const admins = useMemo(() => members.filter((m) => m.role === 'admin' || m.role === 'owner'), [members]);

  const doInvite = async () => {
    if (!api || !invite?.name.trim()) return;
    setBusy(true);
    try {
      const passcode = randomPasscode();
      const { data } = await api.members.create(invite.name.trim(), invite.role, passcode);
      setIssued({ name: data.display_name, passcode });
      setInvite(null);
      toast.success(`${data.display_name} added to the team.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add the member.');
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (m: ApiMember, role: TeamRole) => {
    if (!api || m.role === role) return;
    if (m.role !== 'viewer' && role === 'viewer' && admins.length <= 1 && (m.role === 'admin' || m.role === 'owner')) {
      toast.error('A workspace needs at least one admin.');
      return;
    }
    try {
      await api.members.update(m.id, { role });
      toast.success(`${m.display_name} is now ${role}.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change the role.');
    }
  };

  const bulkApply = async () => {
    if (!api || selected.length === 0) return;
    setBusy(true);
    try {
      for (const id of selected) {
        const m = members.find((x) => x.id === id);
        if (m && m.role !== bulkRole) await api.members.update(id, { role: bulkRole });
      }
      toast.success(`${selected.length} member${selected.length === 1 ? '' : 's'} set to ${bulkRole}.`);
      setSelected([]);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk update failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: ApiMember) => {
    if (!api) return;
    if (m.id === session?.memberId) {
      toast.error('You cannot remove yourself.');
      return;
    }
    if (!(await confirm(`Remove ${m.display_name} from the team? They will no longer be able to log in.`))) return;
    try {
      await api.members.remove(m.id);
      toast.success(`${m.display_name} removed.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove the member.');
    }
  };

  const toggleSel = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const roleTone = (r: string): 'indigo' | 'cyan' | 'green' | 'amber' | 'slate' =>
    r === 'owner' ? 'indigo' : r === 'admin' ? 'cyan' : r === 'agent' ? 'green' : r === 'developer' ? 'amber' : 'slate';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {dialog}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Team</h1>
          <p className="text-sm text-slate-500 mt-1">{members.length} member{members.length === 1 ? '' : 's'} in this workspace.</p>
        </div>
        <Button onClick={() => setInvite({ name: '', role: 'agent' })}>+ Invite member</Button>
      </div>

      {selected.length > 0 && (
        <Card className="p-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-slate-700">{selected.length} selected</span>
          <Select value={bulkRole} onChange={(e) => setBulkRole(e.target.value as TeamRole)}>
            {ASSIGNABLE.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
          <Button size="sm" onClick={bulkApply} disabled={busy}>Apply role</Button>
          <button onClick={() => setSelected([])} className="text-sm text-slate-500 hover:underline">Clear</button>
        </Card>
      )}

      <Card>
        {members.length === 0 ? (
          <EmptyState icon="👥" title="No team members" hint="Invite your first teammate to get started." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-4">
                <input
                  type="checkbox"
                  checked={selected.includes(m.id)}
                  onChange={() => toggleSel(m.id)}
                  disabled={m.role === 'owner'}
                  className="w-4 h-4 rounded accent-brix-600"
                  aria-label={`Select ${m.display_name}`}
                />
                <div className="w-10 h-10 rounded-full grid place-items-center text-white text-sm font-bold shrink-0" style={{ background: m.color }}>
                  {m.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{m.display_name}</span>
                    <Badge tone={roleTone(m.role)}>{m.role}</Badge>
                    <span className={`w-2 h-2 rounded-full ${m.status === 'online' ? 'bg-emerald-500' : m.status === 'away' ? 'bg-amber-500' : 'bg-slate-300'}`} title={m.status} />
                    {m.id === session?.memberId && <span className="text-xs text-slate-400">(you)</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {m.job_title || '—'} · Last login {m.last_login ? timeAgo(new Date(m.last_login).getTime()) : 'never'}
                  </div>
                </div>
                {m.role === 'owner' ? (
                  <span className="text-xs text-slate-400 font-medium">Platform owner</span>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <Select value={m.role} onChange={(e) => changeRole(m, e.target.value as TeamRole)} className="text-xs">
                      {ASSIGNABLE.map((r) => <option key={r} value={r}>{r}</option>)}
                    </Select>
                    <Button size="sm" variant="ghost" onClick={() => remove(m)} title="Remove">🗑</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={!!invite} onClose={() => setInvite(null)} title="Invite team member">
        <div className="space-y-4">
          <div>
            <Label>Display name</Label>
            <Input value={invite?.name ?? ''} onChange={(e) => setInvite((v) => v && { ...v, name: e.target.value })} placeholder="Ava Client" />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={invite?.role ?? 'agent'} onChange={(e) => setInvite((v) => v && { ...v, role: e.target.value as TeamRole })} className="w-full">
              <option value="admin">Admin — manages everything except billing</option>
              <option value="agent">Agent — chats, tickets, contacts</option>
              <option value="developer">Developer — API keys, webhooks, settings</option>
              <option value="viewer">Viewer — read-only dashboards</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setInvite(null)}>Cancel</Button>
            <Button onClick={doInvite} disabled={busy || !invite?.name.trim()}>{busy ? 'Adding…' : 'Create invite'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!issued} onClose={() => setIssued(null)} title="One-time passcode">
        <p className="text-sm text-slate-600">
          <strong>{issued?.name}</strong> logs in with your workspace name + this passcode. It is shown <strong>once</strong> — share it now.
        </p>
        <div className="mt-4 text-center">
          <code className="inline-block px-6 py-3 rounded-2xl bg-ink-950 text-white font-mono text-2xl font-bold tracking-[0.3em]">{issued?.passcode}</code>
        </div>
        <div className="flex justify-end mt-5">
          <Button onClick={() => setIssued(null)}>Done</Button>
        </div>
      </Modal>
    </div>
  );
}
