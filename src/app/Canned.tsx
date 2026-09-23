// Brix Chat — Canned responses manager.
import { useState } from 'react';
import { useStore } from '../lib/store';
import type { Canned } from '../lib/types';
import { uid } from '../lib/utils';
import { Button, Card, EmptyState, Input, Label, Modal, Textarea, useConfirm } from '../components/ui';

function blankCanned(): Canned {
  return { id: uid('cr'), shortcut: '/', title: '', body: '' };
}

export default function Canned() {
  const store = useStore();
  const { confirm, dialog } = useConfirm();
  const [editor, setEditor] = useState<Canned | null>(null);
  const [error, setError] = useState('');

  const save = () => {
    if (!editor) return;
    let shortcut = editor.shortcut.trim();
    if (!shortcut || shortcut === '/') { setError('Shortcut is required (e.g. /pricing).'); return; }
    if (!shortcut.startsWith('/')) shortcut = `/${shortcut}`;
    if (!editor.title.trim()) { setError('Title is required.'); return; }
    store.saveCanned({ ...editor, shortcut, title: editor.title.trim(), body: editor.body.trim() });
    setEditor(null);
    setError('');
  };

  const openEditor = (c: Canned) => { setEditor(c); setError(''); };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-extrabold text-slate-900">Canned responses</h1>
          <p className="text-sm text-slate-500 mt-0.5">Type a shortcut in the inbox to insert a saved reply</p>
        </div>
        <Button onClick={() => openEditor(blankCanned())}>+ New response</Button>
      </div>

      {store.data.canned.length === 0 ? (
        <Card><EmptyState icon="⚡" title="No canned responses" hint="Save your best replies so the team answers in one keystroke." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3 font-semibold">Shortcut</th>
                  <th className="px-5 py-3 font-semibold">Title</th>
                  <th className="px-5 py-3 font-semibold">Body</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {store.data.canned.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <code className="px-2 py-1 rounded-lg bg-brix-100 text-brix-700 font-mono text-xs font-bold">{c.shortcut}</code>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900">{c.title}</td>
                    <td className="px-5 py-3.5 text-slate-500 max-w-[380px] truncate">{c.body}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openEditor({ ...c })}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50"
                          onClick={() => confirm({
                            title: 'Delete canned response',
                            body: `Delete "${c.title}" (${c.shortcut})? This can't be undone.`,
                            action: () => store.deleteCanned(c.id),
                          })}>✕</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={editor !== null} onClose={() => setEditor(null)}
        title={editor && store.data.canned.some((c) => c.id === editor.id) ? 'Edit response' : 'New response'}>
        {editor && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Shortcut</Label><Input value={editor.shortcut} onChange={(e) => setEditor({ ...editor, shortcut: e.target.value })} placeholder="/pricing" className="font-mono" /></div>
              <div><Label>Title</Label><Input value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} placeholder="Pricing answer" /></div>
            </div>
            <div><Label>Body</Label><Textarea rows={5} value={editor.body} onChange={(e) => setEditor({ ...editor, body: e.target.value })} placeholder="The message agents will send…" /></div>
            {error && <p className="text-sm text-rose-600 font-medium">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditor(null)}>Cancel</Button>
              <Button onClick={save}>Save response</Button>
            </div>
          </div>
        )}
      </Modal>

      {dialog}
    </div>
  );
}
