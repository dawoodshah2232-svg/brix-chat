// Brix Chat — Trigger rules: proactive engagement + smart routing.
import { useState } from 'react';
import { useStore } from '../lib/store';
import type { TriggerRule } from '../lib/types';
import { uid } from '../lib/utils';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Select, Tabs, Textarea, Toggle, useConfirm } from '../components/ui';

type Tab = 'proactive' | 'routing';

function blankRule(kind: Tab): TriggerRule {
  return { id: uid('tr'), name: '', kind, conditions: [], action: '', enabled: true };
}

const EXPLAINERS: Record<Tab, string> = {
  proactive: 'Proactive rules watch visitor behavior and trigger messages automatically — e.g. greeting a shopper who lingers on the pricing page.',
  routing: 'Smart routing decides which department or agent a conversation goes to, based on page, topic, or visitor data.',
};

export default function Triggers() {
  const store = useStore();
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useState<Tab>('proactive');
  const [editor, setEditor] = useState<{ rule: TriggerRule; conditionsText: string } | null>(null);

  const rules = store.data.triggers.filter((t) => t.kind === tab);
  const counts = {
    proactive: store.data.triggers.filter((t) => t.kind === 'proactive').length,
    routing: store.data.triggers.filter((t) => t.kind === 'routing').length,
  };

  const save = () => {
    if (!editor || !editor.rule.name.trim()) return;
    store.saveTrigger({
      ...editor.rule,
      name: editor.rule.name.trim(),
      action: editor.rule.action.trim(),
      conditions: editor.conditionsText.split('\n').map((c) => c.trim()).filter(Boolean),
    });
    setEditor(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-extrabold text-slate-900">Triggers</h1>
          <p className="text-sm text-slate-500 mt-0.5">Automate engagement and routing</p>
        </div>
        <Button onClick={() => setEditor({ rule: blankRule(tab), conditionsText: '' })}>+ New rule</Button>
      </div>

      <Tabs<Tab>
        tabs={[
          { id: 'proactive', label: 'Proactive rules', count: counts.proactive },
          { id: 'routing', label: 'Smart routing', count: counts.routing },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="rounded-xl bg-cyan-50 border border-cyan-200 px-4 py-3 text-sm text-cyan-900">
        💡 {EXPLAINERS[tab]}
      </div>

      {rules.length === 0 ? (
        <Card><EmptyState icon="🤖" title={tab === 'proactive' ? 'No proactive rules' : 'No routing rules'}
          hint="Create a rule to automate this part of your chat flow." /></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rules.map((t) => (
            <Card key={t.id} className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{t.name}</span>
                    <Badge tone={t.kind === 'proactive' ? 'indigo' : 'cyan'}>{t.kind}</Badge>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">→ {t.action || 'No action set'}</p>
                </div>
                <Toggle checked={t.enabled} onChange={() => store.toggleTrigger(t.id)} label={t.name} />
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {t.conditions.map((c, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">{c}</span>
                ))}
                {t.conditions.length === 0 && <span className="text-xs text-slate-400">No conditions — always applies</span>}
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditor({ rule: { ...t }, conditionsText: t.conditions.join('\n') })}>Edit</Button>
                <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50"
                  onClick={() => confirm({
                    title: 'Delete rule',
                    body: `Delete "${t.name}"? This can't be undone.`,
                    action: () => store.deleteTrigger(t.id),
                  })}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={editor !== null} onClose={() => setEditor(null)}
        title={editor && store.data.triggers.some((t) => t.id === editor.rule.id) ? 'Edit rule' : 'New rule'}>
        {editor && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Name</Label><Input value={editor.rule.name} onChange={(e) => setEditor({ ...editor, rule: { ...editor.rule, name: e.target.value } })} placeholder="Pricing page greeter" /></div>
              <div>
                <Label>Kind</Label>
                <Select value={editor.rule.kind} onChange={(e) => setEditor({ ...editor, rule: { ...editor.rule, kind: e.target.value as Tab } })}>
                  <option value="proactive">Proactive rule</option>
                  <option value="routing">Smart routing</option>
                </Select>
              </div>
            </div>
            <div>
              <Label>Conditions (one per line)</Label>
              <Textarea rows={3} value={editor.conditionsText}
                onChange={(e) => setEditor({ ...editor, conditionsText: e.target.value })}
                placeholder={'page contains /pricing\ntime on page > 30s'} className="font-mono text-[13px]" />
            </div>
            <div><Label>Action</Label><Input value={editor.rule.action} onChange={(e) => setEditor({ ...editor, rule: { ...editor.rule, action: e.target.value } })} placeholder="Send greeting message / route to Sales" /></div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditor(null)}>Cancel</Button>
              <Button onClick={save} disabled={!editor.rule.name.trim()}>Save rule</Button>
            </div>
          </div>
        )}
      </Modal>

      {dialog}
    </div>
  );
}
