// Brix Chat — Trigger rules: visual builder (event → AND/OR conditions → actions) + test simulation.

import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import type { TriggerAction, TriggerCondition, TriggerConditionGroup, TriggerEvent, TriggerRule } from '../lib/types';
import { uid } from '../lib/utils';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Select, Tabs, Textarea, Toggle, useConfirm } from '../components/ui';
import { cx } from '../lib/utils';
import { TRIGGER_TEMPLATES, instantiateTemplate } from '../lib/triggerTemplates';
import { toast } from '../components/dashboard/Toasts';

type Tab = 'proactive' | 'routing';

const EVENTS: Array<{ id: TriggerEvent; label: string }> = [
  { id: 'chat.started', label: '💬 Chat started' },
  { id: 'message.received', label: '📩 Message received' },
  { id: 'visitor.idle', label: '⏳ Visitor idle' },
  { id: 'page.viewed', label: '🌐 Page viewed' },
  { id: 'chat.missed', label: '📵 Chat missed' },
];

const FIELDS: Array<{ id: TriggerCondition['field']; label: string; ops: TriggerCondition['op'][]; placeholder: string }> = [
  { id: 'page_url', label: 'Page URL', ops: ['contains', 'equals'], placeholder: '/pricing' },
  { id: 'time_on_page', label: 'Time on page (s)', ops: ['greater_than', 'less_than'], placeholder: '30' },
  { id: 'cart_value', label: 'Cart value ($)', ops: ['greater_than', 'less_than'], placeholder: '100' },
  { id: 'message_contains', label: 'Message text', ops: ['contains', 'equals'], placeholder: 'refund' },
  { id: 'contact_tag', label: 'Contact tag', ops: ['is'], placeholder: 'vip' },
  { id: 'department', label: 'Department', ops: ['is'], placeholder: 'Sales' },
];

const ACTION_KINDS: Array<{ id: TriggerAction['kind']; label: string; placeholder: string }> = [
  { id: 'message', label: '💬 Send message', placeholder: 'Hey! Need a hand with anything?' },
  { id: 'assign', label: '👤 Assign agent', placeholder: 'Sara' },
  { id: 'tag', label: '🏷 Add tag', placeholder: 'hot-lead' },
  { id: 'priority', label: '⚑ Set priority', placeholder: 'high' },
  { id: 'campaign', label: '📣 Enroll in campaign', placeholder: 'Spring sale blast' },
  { id: 'ticket', label: '🎫 Create ticket', placeholder: 'Follow up on missed chat' },
];

function blankRule(kind: Tab): TriggerRule {
  return {
    id: uid('tr'), name: '', kind, conditions: [], action: '', enabled: true,
    event: 'page.viewed',
    conditionGroups: [{ op: 'and', conditions: [{ field: 'page_url', op: 'contains', value: '' }] }],
    actions: [{ kind: 'message', value: '' }],
  };
}

const EXPLAINERS: Record<Tab, string> = {
  proactive: 'Proactive rules watch visitor behavior and trigger messages automatically — e.g. greeting a shopper who lingers on the pricing page.',
  routing: 'Smart routing decides which department or agent a conversation goes to, based on page, topic, or visitor data.',
};

// ---- test simulation --------------------------------------------------------

interface SimCtx {
  page_url: string;
  time_on_page: string;
  cart_value: string;
  message_contains: string;
  contact_tag: string;
  department: string;
}

function evalCondition(c: TriggerCondition, ctx: SimCtx): boolean {
  const v = String(ctx[c.field] ?? '');
  const target = c.value.trim();
  switch (c.op) {
    case 'contains': return v.toLowerCase().includes(target.toLowerCase());
    case 'equals':
    case 'is': return v.toLowerCase() === target.toLowerCase();
    case 'greater_than': return Number(v) > Number(target);
    case 'less_than': return Number(v) < Number(target);
    default: return false;
  }
}

function simulate(rule: TriggerRule, ctx: SimCtx): { matched: boolean; groupResults: Array<{ op: string; results: boolean[] }> } {
  const groups = rule.conditionGroups ?? [];
  if (groups.length === 0) return { matched: true, groupResults: [] };
  const groupResults = groups.map((g) => {
    const results = g.conditions.map((c) => evalCondition(c, ctx));
    return { op: g.op.toUpperCase(), results };
  });
  const groupBools = groupResults.map((g, i) => {
    const grp = groups[i];
    return grp.op === 'and' ? g.results.every(Boolean) : g.results.some(Boolean);
  });
  // Groups combine with AND across groups.
  return { matched: groupBools.every(Boolean), groupResults };
}

// ---- editor subcomponents ----------------------------------------------------

function ConditionRow({ cond, onChange, onRemove }: {
  cond: TriggerCondition; onChange: (c: TriggerCondition) => void; onRemove: () => void;
}) {
  const field = FIELDS.find((f) => f.id === cond.field)!;
  return (
    <div className="flex gap-2 items-center">
      <Select value={cond.field} onChange={(e) => {
        const nf = FIELDS.find((f) => f.id === e.target.value)!;
        onChange({ field: nf.id, op: nf.ops[0], value: '' });
      }} className="text-xs max-w-36">
        {FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
      </Select>
      <Select value={cond.op} onChange={(e) => onChange({ ...cond, op: e.target.value as TriggerCondition['op'] })} className="text-xs max-w-32">
        {field.ops.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
      </Select>
      <Input value={cond.value} onChange={(e) => onChange({ ...cond, value: e.target.value })}
        placeholder={field.placeholder} className="text-xs py-1.5 flex-1" />
      <button onClick={onRemove} className="text-slate-300 hover:text-rose-500 text-sm" title="Remove condition">✕</button>
    </div>
  );
}

function ActionRow({ action, onChange, onRemove }: {
  action: TriggerAction; onChange: (a: TriggerAction) => void; onRemove: () => void;
}) {
  const kind = ACTION_KINDS.find((k) => k.id === action.kind)!;
  return (
    <div className="flex gap-2 items-center">
      <Select value={action.kind} onChange={(e) => {
        const nk = ACTION_KINDS.find((k) => k.id === e.target.value)!;
        onChange({ kind: nk.id, value: '' });
      }} className="text-xs max-w-44">
        {ACTION_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
      </Select>
      <Input value={action.value} onChange={(e) => onChange({ ...action, value: e.target.value })}
        placeholder={kind.placeholder} className="text-xs py-1.5 flex-1" />
      <button onClick={onRemove} className="text-slate-300 hover:text-rose-500 text-sm" title="Remove action">✕</button>
    </div>
  );
}

function ruleSummary(rule: TriggerRule): string {
  if (rule.conditionGroups?.length || rule.actions?.length) {
    const g = rule.conditionGroups ?? [];
    const conds = g.map((grp) => grp.conditions.map((c) => `${c.field.replace(/_/g, ' ')} ${c.op.replace(/_/g, ' ')} “${c.value}”`).join(` ${grp.op.toUpperCase()} `)).join(' AND ');
    const acts = (rule.actions ?? []).map((a) => `${a.kind}: ${a.value}`).join(', ');
    return `WHEN ${rule.event} · IF ${conds || 'always'} · THEN ${acts || '—'}`;
  }
  return rule.action || 'No action set';
}

// ---- main component ----------------------------------------------------------

export default function Triggers() {
  const store = useStore();
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useState<Tab>('proactive');
  const [editor, setEditor] = useState<TriggerRule | null>(null);
  const [legacyText, setLegacyText] = useState('');
  const [simRule, setSimRule] = useState<TriggerRule | null>(null);
  const [gallery, setGallery] = useState(false);

  const installTemplate = (tplId: string) => {
    const tpl = TRIGGER_TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) return;
    const rule = instantiateTemplate(tpl);
    store.saveTrigger(rule);
    setGallery(false);
    setTab(rule.kind);
    toast.success('Template installed', rule.name);
  };
  const [simCtx, setSimCtx] = useState<SimCtx>({
    page_url: '/pricing', time_on_page: '45', cart_value: '0',
    message_contains: '', contact_tag: '', department: 'Sales',
  });

  const rules = store.data.triggers.filter((t) => t.kind === tab);
  const counts = useMemo(() => ({
    proactive: store.data.triggers.filter((t) => t.kind === 'proactive').length,
    routing: store.data.triggers.filter((t) => t.kind === 'routing').length,
  }), [store.data.triggers]);

  const openEditor = (rule: TriggerRule) => {
    setEditor(rule);
    setLegacyText(rule.conditions.join('\n'));
  };

  const setRule = (patch: Partial<TriggerRule>) => {
    if (!editor) return;
    setEditor({ ...editor, ...patch });
  };

  const updateGroup = (gi: number, patch: Partial<TriggerConditionGroup>) => {
    if (!editor) return;
    const groups = [...(editor.conditionGroups ?? [])];
    groups[gi] = { ...groups[gi], ...patch };
    setRule({ conditionGroups: groups });
  };

  const updateCond = (gi: number, ci: number, cond: TriggerCondition) => {
    if (!editor) return;
    const groups = [...(editor.conditionGroups ?? [])];
    const conds = [...groups[gi].conditions];
    conds[ci] = cond;
    groups[gi] = { ...groups[gi], conditions: conds };
    setRule({ conditionGroups: groups });
  };

  const save = () => {
    if (!editor || !editor.name.trim()) return;
    store.saveTrigger({
      ...editor,
      name: editor.name.trim(),
      conditions: legacyText.split('\n').map((c) => c.trim()).filter(Boolean),
    });
    setEditor(null);
  };

  const simResult = simRule ? simulate(simRule, simCtx) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-extrabold text-slate-900">Triggers</h1>
          <p className="text-sm text-slate-500 mt-0.5">Automate engagement and routing</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setGallery(true)}>📚 Templates</Button>
          <Button onClick={() => openEditor(blankRule(tab))}>+ New rule</Button>
        </div>
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
            <Card key={t.id} className={cx('p-5', !t.enabled && 'opacity-60')}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{t.name}</span>
                    <Badge tone={t.kind === 'proactive' ? 'indigo' : 'cyan'}>{t.kind}</Badge>
                    {!t.enabled && <Badge tone="slate">disabled</Badge>}
                  </div>
                  {t.description && <p className="text-xs text-slate-500 mt-1 italic">“{t.description}”</p>}
                  <p className="text-xs text-slate-500 mt-1.5 font-mono leading-relaxed">{ruleSummary(t)}</p>
                </div>
                <Toggle checked={t.enabled} onChange={() => store.toggleTrigger(t.id)} label={t.name} />
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setSimRule(t)}>🧪 Test</Button>
                <Button size="sm" variant="secondary" onClick={() => openEditor({ ...t })}>Edit</Button>
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

      {/* P4-19: template gallery */}
      <Modal open={gallery} onClose={() => setGallery(false)} wide title="📚 Trigger templates">
        <p className="text-sm text-slate-500 mb-4">One-click starting points — install one, then tweak the conditions to taste. All wording is original to Brix Chat.</p>
        <div className="grid md:grid-cols-2 gap-3">
          {TRIGGER_TEMPLATES.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-200 p-4 flex flex-col gap-2 hover:border-brix-300 transition">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 text-sm">{t.name}</span>
                <Badge tone={t.kind === 'proactive' ? 'indigo' : 'cyan'}>{t.kind}</Badge>
              </div>
              <p className="text-xs text-slate-500 italic">“{t.description}”</p>
              <p className="text-xs text-slate-600 font-mono leading-relaxed">{t.conditions.join(' · ')}</p>
              <div className="mt-auto pt-1">
                <Button size="sm" variant="secondary" onClick={() => installTemplate(t.id)}>Install template</Button>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Rule builder modal */}
      <Modal open={editor !== null} onClose={() => setEditor(null)} wide
        title={editor && store.data.triggers.some((t) => t.id === editor.id) ? 'Edit rule' : 'New rule'}>
        {editor && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Rule name</Label><Input value={editor.name} onChange={(e) => setRule({ name: e.target.value })} placeholder="Pricing page greeter" /></div>
              <div className="col-span-2">
                <Label>Description <span className="font-normal text-slate-400">(plain language — what does this rule do?)</span></Label>
                <Input value={editor.description ?? ''} onChange={(e) => setRule({ description: e.target.value })}
                  placeholder="Greet visitors who idle 60s on pricing" />
              </div>
              <div>
                <Label>Kind</Label>
                <Select value={editor.kind} onChange={(e) => setRule({ kind: e.target.value as Tab })} className="w-full">
                  <option value="proactive">Proactive rule</option>
                  <option value="routing">Smart routing</option>
                </Select>
              </div>
            </div>

            {/* WHEN */}
            <div className="rounded-2xl border-2 border-brix-100 bg-brix-50/50 p-4">
              <div className="text-sm font-extrabold text-slate-800 mb-2">⚡ WHEN <span className="font-normal text-slate-500">— the event that starts this rule</span></div>
              <Select value={editor.event ?? 'page.viewed'} onChange={(e) => setRule({ event: e.target.value as TriggerEvent })} className="w-full max-w-xs bg-white">
                {EVENTS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </Select>
            </div>

            {/* IF */}
            <div className="rounded-2xl border-2 border-cyan-100 bg-cyan-50/50 p-4 space-y-3">
              <div className="text-sm font-extrabold text-slate-800">🔎 IF <span className="font-normal text-slate-500">— conditions (groups combine with AND)</span></div>
              {(editor.conditionGroups ?? []).map((grp, gi) => (
                <div key={gi} className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs font-bold">
                      {(['and', 'or'] as const).map((op) => (
                        <button key={op} onClick={() => updateGroup(gi, { op })}
                          className={cx('px-3 py-1 rounded-md uppercase transition', grp.op === op ? 'bg-ink-950 text-white' : 'text-slate-500')}>
                          {op}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setRule({ conditionGroups: (editor.conditionGroups ?? []).filter((_, i) => i !== gi) })}
                      className="text-xs text-slate-400 hover:text-rose-600">Remove group</button>
                  </div>
                  {grp.conditions.map((c, ci) => (
                    <ConditionRow key={ci} cond={c}
                      onChange={(nc) => updateCond(gi, ci, nc)}
                      onRemove={() => updateGroup(gi, { conditions: grp.conditions.filter((_, i) => i !== ci) })} />
                  ))}
                  <button onClick={() => updateGroup(gi, { conditions: [...grp.conditions, { field: 'page_url', op: 'contains', value: '' }] })}
                    className="text-xs font-semibold text-cyan-700 hover:text-cyan-800">+ Add condition</button>
                </div>
              ))}
              <button onClick={() => setRule({ conditionGroups: [...(editor.conditionGroups ?? []), { op: 'and', conditions: [{ field: 'page_url', op: 'contains', value: '' }] }] })}
                className="text-xs font-semibold text-cyan-700 hover:text-cyan-800">+ Add condition group</button>
            </div>

            {/* THEN */}
            <div className="rounded-2xl border-2 border-emerald-100 bg-emerald-50/50 p-4 space-y-2">
              <div className="text-sm font-extrabold text-slate-800 mb-1">🚀 THEN <span className="font-normal text-slate-500">— actions to run, in order</span></div>
              {(editor.actions ?? []).map((a, i) => (
                <ActionRow key={i} action={a}
                  onChange={(na) => setRule({ actions: (editor.actions ?? []).map((x, j) => (j === i ? na : x)) })}
                  onRemove={() => setRule({ actions: (editor.actions ?? []).filter((_, j) => j !== i) })} />
              ))}
              <button onClick={() => setRule({ actions: [...(editor.actions ?? []), { kind: 'message', value: '' }] })}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">+ Add action</button>
            </div>

            {/* Legacy free-text (back-compat for old rules) */}
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer font-semibold">Legacy free-text conditions</summary>
              <Textarea rows={2} value={legacyText} onChange={(e) => setLegacyText(e.target.value)}
                placeholder="one condition per line (kept for old rules)" className="font-mono text-xs mt-2" />
            </details>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditor(null)}>Cancel</Button>
              <Button onClick={save} disabled={!editor.name.trim()}>Save rule</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Test simulation modal */}
      <Modal open={simRule !== null} onClose={() => setSimRule(null)} wide title={`Test: ${simRule?.name ?? ''}`}>
        {simRule && (
          <div className="space-y-5">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
              <div className="text-sm font-bold text-slate-800 mb-3">🧪 Simulate a visitor</div>
              <div className="grid sm:grid-cols-2 gap-3">
                {(Object.keys(simCtx) as Array<keyof SimCtx>).map((k) => (
                  <div key={k}>
                    <Label>{k.replace(/_/g, ' ')}</Label>
                    <Input value={simCtx[k]} onChange={(e) => setSimCtx({ ...simCtx, [k]: e.target.value })} className="text-xs" />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {(simRule.conditionGroups ?? []).map((grp, gi) => (
                <div key={gi} className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400 mb-2">Group {gi + 1} ({grp.op})</div>
                  {grp.conditions.map((c, ci) => {
                    const ok = evalCondition(c, simCtx);
                    return (
                      <div key={ci} className="flex items-center gap-2 text-xs py-1">
                        <span className={cx('w-5 h-5 grid place-items-center rounded-full font-bold', ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
                          {ok ? '✓' : '✕'}
                        </span>
                        <span className="font-mono text-slate-600">
                          {c.field.replace(/_/g, ' ')} {c.op.replace(/_/g, ' ')} “{c.value}”
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {(!simRule.conditionGroups || simRule.conditionGroups.length === 0) && (
                <p className="text-sm text-slate-500">No visual conditions — this rule always applies.</p>
              )}
            </div>

            <div className={cx('rounded-xl border px-4 py-3 text-sm font-semibold',
              simResult?.matched ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600')}>
              {simResult?.matched
                ? `✅ Rule would fire — actions: ${(simRule.actions ?? []).map((a) => `${a.kind} (“${a.value}”)`).join(', ') || 'none'}`
                : '❌ Rule would not fire for this visitor.'}
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setSimRule(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>

      {dialog}
    </div>
  );
}
