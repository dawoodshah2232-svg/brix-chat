// Brix Chat — Properties: the client's websites. CRUD, public key copy,
// regenerate, enable/disable. Client-scoped to the effective workspace.

import { useEffect, useState } from 'react';
import { Button, Card, Input, Label, Modal, Badge, EmptyState, Select, useConfirm } from '../components/ui';
import { toast } from '../components/dashboard/Toasts';
import { useClientApi } from '../components/dashboard/useClientApi';
import type { ApiProperty } from '../lib/api';


export default function Properties() {
  const { api } = useClientApi();
  const { confirm, dialog } = useConfirm();
  const [items, setItems] = useState<ApiProperty[]>([]);
  const [editor, setEditor] = useState<Partial<ApiProperty> | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!api) return;
    try {
      const { data } = await api.properties.list();
      setItems(data);
    } catch {
      /* ignore */
    }
  };
  useEffect(() => { refresh(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!api || !editor?.name?.trim()) return;
    setBusy(true);
    try {
      if (editor.id) {
        await api.properties.update(editor.id, {
          name: editor.name.trim(),
          domain: editor.domain ?? '',
          enabled: editor.enabled ?? true,
        });
        toast.success('Property saved.');
      } else {
        await api.properties.create({ name: editor.name.trim(), domain: editor.domain ?? '' });
        toast.success('Property added. Copy its public key into the Install page.');
      }
      setEditor(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the property.');
    } finally {
      setBusy(false);
    }
  };

  const regen = (p: ApiProperty) => {
    if (!api) return;
    confirm({
      title: 'Regenerate public key?',
      body: `Regenerate the public key for “${p.name}”? The old embed snippet will stop working.`,
      action: () => { void doRegen(p); },
    });
  };

  const doRegen = async (p: ApiProperty) => {
    if (!api) return;
    try {
      const { data } = await api.properties.regenerateKey(p.id);
      toast.success(`New public key: ${data.public_key}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not regenerate the key.');
    }
  };

  const remove = (p: ApiProperty) => {
    if (!api) return;
    confirm({
      title: 'Delete property?',
      body: `Delete “${p.name}” and its widget configuration? This cannot be undone.`,
      action: () => { void doRemove(p); },
    });
  };

  const doRemove = async (p: ApiProperty) => {
    if (!api) return;
    try {
      await api.properties.remove(p.id);
      toast.success('Property deleted.');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the property.');
    }
  };

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success('Public key copied.');
    } catch {
      toast.error('Copy failed — select the key manually.');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {dialog}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Properties</h1>
          <p className="text-sm text-slate-500 mt-1">Your websites — each one gets its own public key and widget settings.</p>
        </div>
        <Button onClick={() => setEditor({ name: '', domain: '', enabled: true })}>+ Add website</Button>
      </div>

      {items.length === 0 ? (
        <Card><EmptyState icon="🌐" title="No websites yet" hint="Add your first website to get an embed snippet." action={<Button onClick={() => setEditor({ name: '', domain: '', enabled: true })}>+ Add website</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((p) => (
            <Card key={p.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-slate-900 truncate">{p.name}</h2>
                    <Badge tone={p.enabled ? 'green' : 'slate'}>{p.enabled ? 'Enabled' : 'Disabled'}</Badge>
                  </div>
                  {p.domain && <div className="text-sm text-slate-500 truncate mt-0.5">{p.domain}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="secondary" onClick={() => setEditor(p)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => regen(p)}>🔑</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(p)}>🗑</Button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate px-2.5 py-1.5 rounded-lg bg-slate-100 font-mono text-xs text-slate-700">{p.public_key}</code>
                <Button size="sm" variant="secondary" onClick={() => copyKey(p.public_key)}>Copy key</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!editor} onClose={() => setEditor(null)} title={editor?.id ? 'Edit website' : 'Add website'}>
        <div className="space-y-4">
          <div>
            <Label>Website name</Label>
            <Input value={editor?.name ?? ''} onChange={(e) => setEditor((v) => v && { ...v, name: e.target.value })} placeholder="Acme Store" />
          </div>
          <div>
            <Label>Domain</Label>
            <Input value={editor?.domain ?? ''} onChange={(e) => setEditor((v) => v && { ...v, domain: e.target.value })} placeholder="acme-store.example" />
          </div>
          {editor?.id && (
            <div>
              <Label>Status</Label>
              <Select value={editor.enabled ? 'on' : 'off'} onChange={(e) => setEditor((v) => v && { ...v, enabled: e.target.value === 'on' })} className="w-full">
                <option value="on">Enabled — widget serves chats</option>
                <option value="off">Disabled — widget hidden</option>
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setEditor(null)}>Cancel</Button>
            <Button onClick={save} disabled={busy || !editor?.name?.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
