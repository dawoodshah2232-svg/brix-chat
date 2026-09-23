// Brix Chat — Canned responses manager: variables, shortcuts, personal vs shared, usage.

import { useState } from 'react';
import { useStore } from '../lib/store';
import type { Canned } from '../lib/types';
import { uid } from '../lib/utils';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Textarea, Toggle, useConfirm } from '../components/ui';
import { fillCannedVars } from '../lib/canned';
import { cx } from '../lib/utils';

const VARS = ['{{name}}', '{{visitor}}', '{{workspace}}', '{{department}}'];

function blankCanned(owner: string): Canned {
  return { id: uid('cr'), shortcut: '/', title: '', body: '', shared: true, owner, usage: 0 };
}

export default function Canned() {
  const { data, saveCanned, deleteCanned, session } = useStore();
  const { confirm, dialog } = useConfirm();
  const [editor, setEditor] = useState<Canned | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'shared' | 'mine'>('all');

  const me = session?.displayName ?? '';

  const save = () => {
    if (!editor) return;
    let shortcut = editor.shortcut.trim();
    if (!shortcut || shortcut === '/') { setError('Shortcut is required (e.g. /pricing).'); return; }
    if (!shortcut.startsWith('/')) shortcut = `/${shortcut}`;
    if (!editor.title.trim()) { setError('Title is required.'); return; }
    if (!editor.body.trim()) { setError('Body is required.'); return; }
    saveCanned({
      ...editor,
      shortcut,
      title: editor.title.trim(),
      body: editor.body.trim(),
      owner: editor.shared ? undefined : me,
    });
    setEditor(null);
    setError('');
  };

  const openEditor = (c: Canned) => { setEditor(c); setError(''); };

  const list = data.canned.filter((c) => {
    if (filter === 'shared') return c.shared !== false;
    if (filter === 'mine') return c.shared === false && c.owner === me;
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-display font-extrabold text-slate-900">Canned responses</h1>
          <p className="text-sm text-slate-500 mt-0.5">Type <code className="font-mono bg-slate-100 px-1 rounded">/</code> in any chat to insert a saved reply</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 p-0.5 bg-white text-xs font-semibold">
            {(['all', 'shared', 'mine'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={cx('px-3 py-1.5 rounded-lg capitalize transition', filter === f ? 'bg-ink-950 text-white' : 'text-slate-500 hover:text-slate-800')}>
                {f === 'mine' ? 'My personal' : f}
              </button>
            ))}
          </div>
          <Button onClick={() => openEditor(blankCanned(me))}>+ New response</Button>
        </div>
      </div>

      <div className="rounded-xl bg-brix-50 border border-brix-100 px-4 py-3 text-sm text-slate-600">
        💡 <span className="font-semibold">Variables</span> are filled in automatically:{' '}
        {VARS.map((v) => <code key={v} className="font-mono bg-white border border-brix-100 rounded px-1.5 py-0.5 mx-0.5">{v}</code>)}
      </div>

      {list.length === 0 ? (
        <Card><EmptyState icon="⚡" title="No canned responses" hint="Save your best replies so the team answers in one keystroke." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3 font-semibold">Shortcut</th>
                  <th className="px-5 py-3 font-semibold">Title</th>
                  <th className="px-5 py-3 font-semibold">Scope</th>
                  <th className="px-5 py-3 font-semibold">Used</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <code className="px-2 py-1 rounded-lg bg-brix-100 text-brix-700 font-mono text-xs font-bold">{c.shortcut}</code>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-800">{c.title}</div>
                      <div className="text-xs text-slate-500 truncate max-w-72 mt-0.5">{c.body}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      {c.shared !== false
                        ? <Badge tone="indigo">👥 Shared</Badge>
                        : <Badge tone="slate">👤 {c.owner || 'Personal'}</Badge>}
                    </td>
                    <td className="px-5 py-3.5 tabular-nums text-slate-600">{c.usage ?? 0}×</td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <Button size="sm" variant="secondary" onClick={() => openEditor({ ...c })}>Edit</Button>{' '}
                      <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50"
                        onClick={() => confirm({
                          title: 'Delete canned response',
                          body: `Delete "${c.title}"? This can't be undone.`,
                          action: () => deleteCanned(c.id),
                        })}>✕</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={editor !== null} onClose={() => setEditor(null)}
        title={editor && data.canned.some((c) => c.id === editor.id) ? 'Edit canned response' : 'New canned response'}>
        {editor && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Shortcut</Label><Input value={editor.shortcut} onChange={(e) => setEditor({ ...editor, shortcut: e.target.value })} placeholder="/pricing" className="font-mono" /></div>
              <div><Label>Title</Label><Input value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} placeholder="Pricing answer" /></div>
            </div>
            <div>
              <Label>Body</Label>
              <Textarea rows={5} value={editor.body} onChange={(e) => setEditor({ ...editor, body: e.target.value })} placeholder={'Hi {{visitor}}, this is {{name}} from {{workspace}}…'} />
              <div className="flex flex-wrap gap-1 mt-2">
                {VARS.map((v) => (
                  <button key={v} onClick={() => setEditor({ ...editor, body: editor.body + v })}
                    className="text-[11px] font-mono px-2 py-1 rounded-lg bg-slate-100 hover:bg-brix-100 hover:text-brix-700 text-slate-600 transition">
                    + {v}
                  </button>
                ))}
              </div>
              {editor.body.includes('{{') && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 mb-1">👁 Preview with sample values</div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {fillCannedVars(editor.body, {
                      name: me || 'Ava',
                      visitor: 'Layla Haddad',
                      workspace: session?.workspaceId ?? 'workspace',
                      department: data.settings.departments[0] ?? 'Support',
                    })}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <div>
                <div className="text-sm font-bold text-slate-800">Shared with the team</div>
                <div className="text-xs text-slate-500">{editor.shared !== false ? 'Everyone can use this response' : 'Only you can use this response'}</div>
              </div>
              <Toggle checked={editor.shared !== false} onChange={(v) => setEditor({ ...editor, shared: v })} label="Shared with the team" />
            </div>
            {error && <p role="alert" className="text-sm font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">{error}</p>}
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
