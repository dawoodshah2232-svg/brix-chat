// Brix Chat — Categories: KB / canned-response / ticket category manager.
// Client-scoped per property.

import { useEffect, useState } from 'react';
import { Button, Card, Input, Label, Modal, Select, EmptyState, Tabs, useConfirm } from '../components/ui';
import { toast } from '../components/dashboard/Toasts';
import { useClientApi } from '../components/dashboard/useClientApi';
import type { ApiCategory, ApiProperty } from '../lib/api';


const SCOPES: Array<{ id: ApiCategory['scope']; label: string; hint: string }> = [
  { id: 'kb', label: 'Knowledge base', hint: 'Group help articles' },
  { id: 'canned', label: 'Canned responses', hint: 'Group reply shortcuts' },
  { id: 'tickets', label: 'Tickets', hint: 'Classify support tickets' },
];

const SWATCHES = ['#4f46e5', '#0d9488', '#059669', '#0284c7', '#e11d48', '#d97706', '#7c3aed', '#64748b'];

export default function Categories() {
  const { api } = useClientApi();
  const { confirm, dialog } = useConfirm();
  const [props, setProps] = useState<ApiProperty[]>([]);
  const [propId, setPropId] = useState('');
  const [scope, setScope] = useState<ApiCategory['scope']>('kb');
  const [items, setItems] = useState<ApiCategory[]>([]);
  const [draft, setDraft] = useState<Partial<ApiCategory> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!api) return;
    api.properties.list().then(({ data }) => {
      setProps(data);
      if (data.length && !propId) setPropId(data[0].id);
    }).catch(() => {});
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async () => {
    if (!api || !propId) return;
    try {
      const { data } = await api.categories.list(scope, propId);
      setItems(data);
    } catch { /* ignore */ }
  };
  useEffect(() => { refresh(); }, [api, propId, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!api || !draft?.name?.trim()) return;
    setBusy(true);
    try {
      if (draft.id) {
        await api.categories.update(draft.id, { name: draft.name.trim(), color: draft.color ?? '#64748b' });
        toast.success('Category renamed.');
      } else {
        await api.categories.create(scope, propId, draft.name.trim(), draft.color ?? '#64748b');
        toast.success('Category created.');
      }
      setDraft(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the category.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (c: ApiCategory) => {
    if (!api) return;
    confirm({
      title: 'Delete category?',
      body: `Delete the “${c.name}” category? Items using it become uncategorized.`,
      action: () => { void doRemove(c); },
    });
  };

  const doRemove = async (c: ApiCategory) => {
    if (!api) return;
    try {
      await api.categories.delete(c.id);
      toast.success('Category deleted.');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the category.');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {dialog}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Categories</h1>
          <p className="text-sm text-slate-500 mt-1">Organize articles, replies, and tickets on each website.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={propId} onChange={(e) => setPropId(e.target.value)} className="min-w-44">
            {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Button onClick={() => setDraft({ name: '', color: SWATCHES[items.length % SWATCHES.length] })} disabled={!propId}>+ New category</Button>
        </div>
      </div>

      <Tabs tabs={SCOPES.map((s) => ({ id: s.id, label: s.label }))} active={scope} onChange={setScope} />
      <p className="text-xs text-slate-500 -mt-2">{SCOPES.find((s) => s.id === scope)?.hint}</p>

      {items.length === 0 ? (
        <Card><EmptyState icon="🏷" title="No categories" hint={`Create the first ${SCOPES.find((s) => s.id === scope)?.label.toLowerCase()} category.`} /></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="w-8 h-8 rounded-lg grid place-items-center text-white text-sm font-bold shrink-0" style={{ background: c.color }}>
                  {c.name[0]?.toUpperCase()}
                </span>
                <span className="font-semibold text-slate-800 flex-1 truncate">{c.name}</span>
                <Button size="sm" variant="secondary" onClick={() => setDraft(c)}>Rename</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(c)}>🗑</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Rename category' : 'New category'}>
        <div className="space-y-4">
          <div>
            <Label>Category name</Label>
            <Input value={draft?.name ?? ''} onChange={(e) => setDraft((v) => v && { ...v, name: e.target.value })} placeholder="Billing" />
          </div>
          <div>
            <Label>Color</Label>
            <div className="flex gap-2 mt-1">
              {SWATCHES.map((s) => (
                <button
                  key={s}
                  onClick={() => setDraft((v) => v && { ...v, color: s })}
                  className={`w-9 h-9 rounded-xl transition ${draft?.color === s ? 'ring-2 ring-offset-2 ring-brix-600' : 'hover:scale-105'}`}
                  style={{ background: s }}
                  aria-label={s}
                />
              ))}
            </div>
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
