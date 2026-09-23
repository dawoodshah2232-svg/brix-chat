// Brix Chat — Campaign composer (demo: no backend sending).
import { useState } from 'react';
import { useStore } from '../lib/store';
import type { Campaign } from '../lib/types';
import { uid } from '../lib/utils';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Select, Textarea, useConfirm } from '../components/ui';

function blankCampaign(): Campaign {
  return { id: uid('cp'), name: '', audience: '', message: '', schedule: '', status: 'draft' };
}

const STATUS_TONE: Record<Campaign['status'], 'slate' | 'amber' | 'green'> = {
  draft: 'slate',
  scheduled: 'amber',
  sent: 'green',
};

export default function Campaigns() {
  const store = useStore();
  const { confirm, dialog } = useConfirm();
  const [editor, setEditor] = useState<Campaign | null>(null);

  const save = () => {
    if (!editor || !editor.name.trim()) return;
    store.saveCampaign({ ...editor, name: editor.name.trim() });
    setEditor(null);
  };

  const markSent = (c: Campaign) => store.saveCampaign({ ...c, status: 'sent' });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-extrabold text-slate-900">Campaigns</h1>
          <p className="text-sm text-slate-500 mt-0.5">Compose broadcast messages for your audience</p>
        </div>
        <Button onClick={() => setEditor(blankCampaign())}>+ New campaign</Button>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        🚧 <span className="font-semibold">Demo:</span> campaigns are composed here; sending needs a backend.
      </div>

      {store.data.campaigns.length === 0 ? (
        <Card><EmptyState icon="📣" title="No campaigns yet" hint="Draft a broadcast message — schedule it for later or send it now." /></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {store.data.campaigns.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="font-semibold text-slate-900">{c.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Audience: {c.audience || '—'}{c.schedule && ` · ⏰ ${c.schedule}`}</div>
                </div>
                <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
              </div>
              <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3 mb-4 whitespace-pre-wrap">{c.message || 'No message yet.'}</p>
              <div className="flex justify-end gap-2">
                {c.status === 'scheduled' && <Button size="sm" onClick={() => markSent(c)}>Mark sent</Button>}
                <Button size="sm" variant="secondary" onClick={() => setEditor({ ...c })}>Edit</Button>
                <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50"
                  onClick={() => confirm({
                    title: 'Delete campaign',
                    body: `Delete "${c.name}"? This can't be undone.`,
                    action: () => store.deleteCampaign(c.id),
                  })}>✕</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={editor !== null} onClose={() => setEditor(null)}
        title={editor && store.data.campaigns.some((c) => c.id === editor.id) ? 'Edit campaign' : 'New campaign'}>
        {editor && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Name</Label><Input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="Spring sale blast" /></div>
              <div><Label>Audience</Label><Input value={editor.audience} onChange={(e) => setEditor({ ...editor, audience: e.target.value })} placeholder="All visitors · tag: vip" /></div>
            </div>
            <div>
              <Label>Message</Label>
              <Textarea rows={4} value={editor.message} onChange={(e) => setEditor({ ...editor, message: e.target.value })} placeholder="Hey! We've got something for you…" />
              <div className="text-xs text-slate-400 mt-1 text-right tabular-nums">{editor.message.length} chars</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Schedule</Label>
                <Input type="datetime-local" value={editor.schedule} onChange={(e) => setEditor({ ...editor, schedule: e.target.value })} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editor.status} onChange={(e) => setEditor({ ...editor, status: e.target.value as Campaign['status'] })} className="w-full">
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditor(null)}>Cancel</Button>
              <Button onClick={save} disabled={!editor.name.trim()}>Save campaign</Button>
            </div>
          </div>
        )}
      </Modal>

      {dialog}
    </div>
  );
}
