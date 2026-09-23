// Brix Chat — Campaign composer (local demo: sending is simulated).

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { getApi } from '../lib/api';
import type { ApiGoal } from '../lib/api';
import type { Campaign } from '../lib/types';
import { uid } from '../lib/utils';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Select, Textarea, useConfirm } from '../components/ui';
import { cx } from '../lib/utils';

function blankCampaign(): Campaign {
  return { id: uid('cp'), name: '', audience: '', message: '', schedule: '', status: 'draft' };
}

const STATUS_TONE: Record<Campaign['status'], 'slate' | 'amber' | 'green'> = {
  draft: 'slate',
  scheduled: 'amber',
  sent: 'green',
};

function toLocalInput(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function audienceLabel(c: Campaign): string {
  const r = c.audienceRules;
  if (!r) return c.audience || 'Everyone';
  const parts: string[] = [];
  if (r.urlContains) parts.push(`page contains “${r.urlContains}”`);
  if (r.visitorType && r.visitorType !== 'any') parts.push(`${r.visitorType} visitors`);
  if (r.tags?.length) parts.push(`tags: ${r.tags.join(', ')}`);
  return parts.length ? parts.join(' · ') : 'Everyone';
}

export default function Campaigns() {
  const store = useStore();
  const { session } = store;
  const { confirm, dialog } = useConfirm();
  const [editor, setEditor] = useState<Campaign | null>(null);
  const [sendLater, setSendLater] = useState(false);
  const [goals, setGoals] = useState<ApiGoal[]>([]);

  useEffect(() => {
    if (!session) return;
    getApi(session.workspace, session.displayName).goals.list()
      .then(({ data }) => setGoals(data))
      .catch(() => {});
  }, [session]);

  const goalName = useMemo(() => {
    const m = new Map(goals.map((g) => [g.id, g.name]));
    return (id?: string) => (id ? m.get(id) ?? '—' : '—');
  }, [goals]);

  const save = () => {
    if (!editor || !editor.name.trim()) return;
    store.saveCampaign({ ...editor, name: editor.name.trim(), status: sendLater ? 'scheduled' : editor.status });
    setEditor(null);
  };

  const markSent = (c: Campaign) => store.saveCampaign({ ...c, status: 'sent' });

  const openEditor = (c: Campaign) => {
    setEditor(c);
    setSendLater(!!c.scheduleAt);
  };

  const estimatedReach = (c: Campaign): number => {
    const r = c.audienceRules;
    let vs = store.data.visitors;
    if (r?.urlContains) vs = vs.filter((v) => v.page.toLowerCase().includes(r.urlContains!.toLowerCase()));
    if (r?.visitorType === 'new') vs = vs.filter((v) => v.pages <= 1);
    if (r?.visitorType === 'returning') vs = vs.filter((v) => v.pages > 1);
    // Visitor records carry no tags in local mode — tag rules can't narrow reach here.
    return vs.length;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-extrabold text-slate-900">Campaigns</h1>
          <p className="text-sm text-slate-500 mt-0.5">Compose broadcast messages, schedule them, and track goals</p>
        </div>
        <Button onClick={() => openEditor(blankCampaign())}>+ New campaign</Button>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        🚧 <span className="font-semibold">Local demo:</span> campaigns are composed and scheduled here; actual delivery needs the backend phase.
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
                  <div className="text-xs text-slate-500 mt-0.5">
                    🎯 {audienceLabel(c)} · ~{estimatedReach(c)} recipients
                    {c.scheduleAt && c.status === 'scheduled' && ` · ⏰ ${new Date(c.scheduleAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                  </div>
                  {c.goalId && (
                    <div className="text-xs text-slate-500 mt-0.5">🏁 Goal: <span className="font-semibold text-slate-700">{goalName(c.goalId)}</span></div>
                  )}
                </div>
                <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
              </div>
              <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3 mb-4 whitespace-pre-wrap">{c.message || 'No message yet.'}</p>
              <div className="flex justify-end gap-2">
                {(c.status === 'draft' || c.status === 'scheduled') && <Button size="sm" onClick={() => markSent(c)}>📤 Send now</Button>}
                <Button size="sm" variant="secondary" onClick={() => openEditor({ ...c })}>Edit</Button>
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
        title={editor && store.data.campaigns.some((c) => c.id === editor.id) ? 'Edit campaign' : 'New campaign'} wide>
        {editor && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Name</Label><Input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="Spring sale blast" /></div>
              <div>
                <Label>Goal (optional)</Label>
                <Select value={editor.goalId ?? ''} onChange={(e) => setEditor({ ...editor, goalId: e.target.value || undefined })} className="w-full">
                  <option value="">No goal</option>
                  {goals.map((g) => <option key={g.id} value={g.id}>🏁 {g.name} ({g.event})</option>)}
                </Select>
              </div>
            </div>
            <div>
              <Label>Message</Label>
              <Textarea rows={4} value={editor.message} onChange={(e) => setEditor({ ...editor, message: e.target.value })} placeholder="Hey! We've got something for you…" />
              <div className="text-xs text-slate-400 mt-1 text-right tabular-nums">{editor.message.length} chars</div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-bold text-slate-800 mb-3">🎯 Audience rules</div>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <Label>Page URL contains</Label>
                  <Input value={editor.audienceRules?.urlContains ?? ''} onChange={(e) => setEditor({ ...editor, audienceRules: { ...editor.audienceRules, urlContains: e.target.value || undefined } })} placeholder="/pricing" />
                </div>
                <div>
                  <Label>Visitor type</Label>
                  <Select value={editor.audienceRules?.visitorType ?? 'any'} onChange={(e) => setEditor({ ...editor, audienceRules: { ...editor.audienceRules, visitorType: e.target.value as 'any' | 'new' | 'returning' } })} className="w-full">
                    <option value="any">Anyone</option>
                    <option value="new">New visitors</option>
                    <option value="returning">Returning visitors</option>
                  </Select>
                </div>
                <div>
                  <Label>Visitor tags</Label>
                  <Input value={(editor.audienceRules?.tags ?? []).join(', ')} onChange={(e) => setEditor({ ...editor, audienceRules: { ...editor.audienceRules, tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })} placeholder="vip, trial" />
                </div>
              </div>
              <div className="text-xs text-slate-500 mt-2">~{editor ? estimatedReach(editor) : 0} visitors match these rules right now.</div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-bold text-slate-800 mb-3">⏰ Scheduling</div>
              <div className="flex gap-2 mb-3">
                {(['now', 'later'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setSendLater(m === 'later')}
                    className={cx('px-4 py-2 rounded-xl text-sm font-semibold border transition',
                      (m === 'later') === sendLater ? 'bg-ink-950 text-white border-ink-950' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}
                  >
                    {m === 'now' ? '📤 Send now' : '⏰ Send later'}
                  </button>
                ))}
              </div>
              {sendLater && (
                <div>
                  <Label>Send at</Label>
                  <Input
                    type="datetime-local"
                    value={toLocalInput(editor.scheduleAt)}
                    min={toLocalInput(Date.now())}
                    onChange={(e) => setEditor({ ...editor, scheduleAt: e.target.value ? new Date(e.target.value).getTime() : undefined, schedule: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditor(null)}>Cancel</Button>
              <Button onClick={save} disabled={!editor.name.trim()}>{sendLater ? 'Schedule campaign' : 'Save campaign'}</Button>
            </div>
          </div>
        )}
      </Modal>

      {dialog}
    </div>
  );
}
