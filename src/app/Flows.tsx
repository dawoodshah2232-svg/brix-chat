// Brix Chat — visual chatbot flow builder: flow list + drag-and-drop canvas
// (pan/zoom, connect ports, inspector) + test-run chat simulator.
//
// Flows persist per workspace in localStorage ('brixchat_flows_v1').
// Webhook steps are simulated locally in test runs — no network calls.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useStore } from '../lib/store';
import { cx, uid, timeAgo } from '../lib/utils';
import {
  Badge, Button, Card, EmptyState, Input, Label, Modal, PageHeader,
  Select, Textarea, Toggle, useConfirm,
} from '../components/ui';
import { toast } from '../components/dashboard/Toasts';
import type {
  ConditionOperator, EdgePort, Flow, FlowEdge, FlowNode, FlowNodeConfig, NodeKind, SimEvent, SimState,
} from '../lib/flows';
import {
  NODE_KINDS, NODE_META, createEdge, createFlow, createNode, duplicateFlow,
  loadFlows, sanitizeVariable, saveFlows, simAnswer, simBegin,
  starterTemplateFlow, validateFlow,
} from '../lib/flows';

// ------------------------------------------------------------ canvas geometry

const NODE_W = 232;
const HEADER_H = 46;

interface Pt { x: number; y: number }

function inputAnchor(n: FlowNode): Pt {
  return { x: n.x, y: n.y + HEADER_H / 2 };
}

function outputAnchors(n: FlowNode): Array<{ port: EdgePort; x: number; y: number; label: string }> {
  if (n.kind === 'condition') {
    return [
      { port: 'true', x: n.x + NODE_W, y: n.y + 15, label: 'Yes' },
      { port: 'false', x: n.x + NODE_W, y: n.y + HEADER_H - 15, label: 'No' },
    ];
  }
  return [{ port: 'out', x: n.x + NODE_W, y: n.y + HEADER_H / 2, label: '' }];
}

function edgePathD(a: Pt, b: Pt): string {
  const dx = Math.max(48, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

function truncate(s: string, len: number): string {
  const t = s.trim();
  return t.length > len ? `${t.slice(0, Math.max(0, len - 1))}…` : t;
}

function nodeSummary(n: FlowNode): string {
  const c = n.config;
  switch (n.kind) {
    case 'start':
      return 'Entry point — every chat starts here';
    case 'message':
      return c.text?.trim() ? truncate(c.text, 60) : 'No text yet';
    case 'question': {
      const v = sanitizeVariable(c.variable ?? '');
      return `${c.text?.trim() ? truncate(c.text, 40) : 'No prompt yet'} → {${v || '…'}}`;
    }
    case 'condition': {
      const v = sanitizeVariable(c.variable ?? '') || '…';
      const op = c.operator === 'equals' ? 'equals' : 'contains';
      return `If {${v}} ${op} “${truncate(c.value ?? '', 14)}”`;
    }
    case 'handoff':
      return `Route to ${c.department?.trim() || '…'}`;
    case 'webhook':
      return `POST ${c.url?.trim() ? truncate(c.url, 28) : 'no URL yet'}`;
  }
}

type Selection = { type: 'node' | 'edge'; id: string } | null;
type PendingConn = { nodeId: string; port: EdgePort } | null;

// ---------------------------------------------------------------- node card

function FlowNodeCard({
  node, selected, pending, onHeaderDown, onSelect, onOutputPort, onInputPort,
}: {
  node: FlowNode;
  selected: boolean;
  pending: PendingConn;
  onHeaderDown: (e: ReactMouseEvent<HTMLDivElement>, n: FlowNode) => void;
  onSelect: (id: string) => void;
  onOutputPort: (nodeId: string, port: EdgePort) => void;
  onInputPort: (nodeId: string) => void;
}) {
  const meta = NODE_META[node.kind];
  return (
    <div
      data-node
      onMouseDown={(e) => { e.stopPropagation(); onSelect(node.id); }}
      className={cx(
        'absolute rounded-xl bg-white shadow-md border-2 overflow-visible transition-shadow',
        selected ? 'border-brix-600 shadow-xl shadow-brix-600/20' : 'border-slate-200 hover:shadow-lg',
      )}
      style={{ left: node.x, top: node.y, width: NODE_W }}
    >
      <div
        onMouseDown={(e) => onHeaderDown(e, node)}
        className={cx('flex items-center gap-2 px-3 text-white font-bold text-[13px] cursor-grab active:cursor-grabbing rounded-t-[10px]', meta.headerClass)}
        style={{ height: HEADER_H }}
      >
        <span aria-hidden>{meta.icon}</span>
        <span className="truncate">{meta.label}</span>
      </div>
      <div className="px-3 py-2.5 text-xs text-slate-600 leading-snug min-h-10 rounded-b-[10px] bg-white">
        {nodeSummary(node)}
      </div>

      {node.kind !== 'start' && (
        <button
          data-port
          type="button"
          title={pending ? 'Click to connect here' : 'Input'}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onInputPort(node.id); }}
          className={cx(
            'absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow cursor-crosshair transition-all z-10',
            pending ? 'bg-amber-400 scale-150 ring-2 ring-amber-300 animate-pulse' : 'bg-slate-400 hover:bg-brix-500 hover:scale-125',
          )}
          style={{ left: -7, top: HEADER_H / 2 - 7 }}
        />
      )}
      {outputAnchors(node).map((o) => {
        const isPendingFrom = pending?.nodeId === node.id && pending.port === o.port;
        return (
          <span key={o.port}>
            <button
              data-port
              type="button"
              title={o.label ? `${o.label} output — click, then click an input` : 'Output — click, then click an input'}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onOutputPort(node.id, o.port); }}
              className={cx(
                'absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow cursor-crosshair transition-all z-10',
                isPendingFrom ? 'bg-brix-700 scale-150 ring-2 ring-brix-300' : 'bg-brix-500 hover:scale-125',
              )}
              style={{ left: o.x - node.x - 7, top: o.y - node.y - 7 }}
            />
            {o.label && (
              <span
                className="absolute text-[10px] font-extrabold uppercase tracking-wide text-slate-500 pointer-events-none"
                style={{ left: o.x - node.x + 9, top: o.y - node.y - 8 }}
              >
                {o.label}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ edges

function FlowEdges({
  flow, sel, pendingAnchor, mouseWorld, onSelectEdge,
}: {
  flow: Flow;
  sel: Selection;
  pendingAnchor: Pt | null;
  mouseWorld: Pt | null;
  onSelectEdge: (id: string) => void;
}) {
  const byId = useMemo(() => new Map(flow.nodes.map((n) => [n.id, n])), [flow.nodes]);
  return (
    <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width={10} height={10}>
      <defs>
        <marker id="brix-flow-arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#94a3b8" />
        </marker>
        <marker id="brix-flow-arrow-sel" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#4f46e5" />
        </marker>
      </defs>
      {flow.edges.map((e: FlowEdge) => {
        const from = byId.get(e.from);
        const to = byId.get(e.to);
        if (!from || !to) return null;
        const anchor = outputAnchors(from).find((o) => o.port === e.fromPort) ?? outputAnchors(from)[0];
        const d = edgePathD(anchor, inputAnchor(to));
        const isSel = sel?.type === 'edge' && sel.id === e.id;
        return (
          <g
            key={e.id}
            className="pointer-events-auto cursor-pointer"
            onClick={(ev) => { ev.stopPropagation(); onSelectEdge(e.id); }}
          >
            <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
            <path
              d={d}
              fill="none"
              stroke={isSel ? '#4f46e5' : '#94a3b8'}
              strokeWidth={isSel ? 3 : 2.25}
              markerEnd={isSel ? 'url(#brix-flow-arrow-sel)' : 'url(#brix-flow-arrow)'}
            />
          </g>
        );
      })}
      {pendingAnchor && mouseWorld && (
        <path d={edgePathD(pendingAnchor, mouseWorld)} fill="none" stroke="#4f46e5" strokeWidth={2} strokeDasharray="6 4" />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------- inspector

function Inspector({
  flow, sel, onConfig, onDeleteNode, onDeleteEdge, onDeselect,
}: {
  flow: Flow;
  sel: Selection;
  onConfig: (id: string, patch: Partial<FlowNodeConfig>) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  onDeselect: () => void;
}) {
  const node = sel?.type === 'node' ? flow.nodes.find((n) => n.id === sel.id) : undefined;
  const edge = sel?.type === 'edge' ? flow.edges.find((e) => e.id === sel.id) : undefined;

  if (edge) {
    const from = flow.nodes.find((n) => n.id === edge.from);
    const to = flow.nodes.find((n) => n.id === edge.to);
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-slate-900 text-sm">Connection</h3>
          <button onClick={onDeselect} className="text-slate-500 hover:text-slate-700 text-lg leading-none" aria-label="Deselect">✕</button>
        </div>
        <p className="text-sm text-slate-600">
          {from ? NODE_META[from.kind].label : '?'} → {to ? NODE_META[to.kind].label : '?'}
          {edge.fromPort !== 'out' && <span className="ml-1 text-xs font-bold text-slate-500 uppercase">({edge.fromPort})</span>}
        </p>
        <Button variant="danger" size="sm" className="mt-4 w-full" onClick={() => onDeleteEdge(edge.id)}>
          Delete connection
        </Button>
        <p className="text-xs text-slate-500 mt-3">Tip: press Delete to remove the selected connection.</p>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="p-4">
        <h3 className="font-display font-bold text-slate-900 text-sm mb-2">Inspector</h3>
        <p className="text-sm text-slate-500 leading-relaxed">
          Select a node to edit its content, or click a connection to remove it.
        </p>
        <div className="mt-4 rounded-xl bg-brix-50 border border-brix-100 p-3 text-xs text-brix-700 leading-relaxed">
          Click a colored output dot, then click a grey input dot to connect two steps. Drag a node by its header to move it.
        </div>
      </div>
    );
  }

  const meta = NODE_META[node.kind];
  const cfg = node.config;
  const set = (patch: Partial<FlowNodeConfig>) => onConfig(node.id, patch);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-slate-900 text-sm flex items-center gap-2">
          <span className={cx('w-6 h-6 rounded-lg grid place-items-center text-white text-xs', meta.headerClass)}>{meta.icon}</span>
          {meta.label}
        </h3>
        <button onClick={onDeselect} className="text-slate-500 hover:text-slate-700 text-lg leading-none" aria-label="Deselect">✕</button>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed -mt-2">{meta.description}</p>

      {node.kind === 'start' && (
        <p className="text-sm text-slate-600">Chats always enter here. Connect its output to your first step.</p>
      )}

      {node.kind === 'message' && (
        <div>
          <Label>Bot message</Label>
          <Textarea rows={4} value={cfg.text ?? ''} onChange={(e) => set({ text: e.target.value })} placeholder="Hi {visitor_name}!" />
          <p className="text-xs text-slate-500 mt-1.5">{'{visitor_name}'} greets by name; {'{variable}'} inserts a saved answer.</p>
        </div>
      )}

      {node.kind === 'question' && (
        <>
          <div>
            <Label>Question prompt</Label>
            <Textarea rows={3} value={cfg.text ?? ''} onChange={(e) => set({ text: e.target.value })} placeholder="What are you looking for today?" />
          </div>
          <div>
            <Label>Save answer as variable</Label>
            <Input value={cfg.variable ?? ''} onChange={(e) => set({ variable: sanitizeVariable(e.target.value) })} placeholder="topic" />
            <p className="text-xs text-slate-500 mt-1.5">Lowercase letters, numbers and underscores.</p>
          </div>
        </>
      )}

      {node.kind === 'condition' && (
        <>
          <div>
            <Label>Variable to test</Label>
            <Input value={cfg.variable ?? ''} onChange={(e) => set({ variable: sanitizeVariable(e.target.value) })} placeholder="intent" />
          </div>
          <div>
            <Label>Operator</Label>
            <Select value={cfg.operator ?? 'contains'} onChange={(e) => set({ operator: e.target.value as ConditionOperator })} className="w-full">
              <option value="contains">contains</option>
              <option value="equals">equals</option>
            </Select>
          </div>
          <div>
            <Label>Value</Label>
            <Input value={cfg.value ?? ''} onChange={(e) => set({ value: e.target.value })} placeholder="sales" />
          </div>
          <p className="text-xs text-slate-500">Matching answers take the Yes path; everything else takes No.</p>
        </>
      )}

      {node.kind === 'handoff' && (
        <>
          <div>
            <Label>Department or agent</Label>
            <Input value={cfg.department ?? ''} onChange={(e) => set({ department: e.target.value })} placeholder="Sales" />
          </div>
          <div>
            <Label>Note for the agent (optional)</Label>
            <Textarea rows={3} value={cfg.note ?? ''} onChange={(e) => set({ note: e.target.value })} placeholder="Context the agent should see…" />
          </div>
        </>
      )}

      {node.kind === 'webhook' && (
        <div>
          <Label>POST URL</Label>
          <Input value={cfg.url ?? ''} onChange={(e) => set({ url: e.target.value.trim() })} placeholder="https://example.com/hook" inputMode="url" />
          <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 leading-relaxed">
            <span className="font-extrabold">Test mode</span> — deliveries are simulated locally in test runs. No real request is ever sent from the builder.
          </div>
        </div>
      )}

      <Button variant="danger" size="sm" className="w-full" onClick={() => onDeleteNode(node.id)}>
        Delete node
      </Button>
    </div>
  );
}

// ------------------------------------------------------------- test-run modal

interface ChatLine {
  id: string;
  kind: 'bot' | 'visitor' | 'note' | 'webhook' | 'handoff' | 'end';
  text: string;
  detail?: string;
}

function eventToLines(e: SimEvent): ChatLine[] {
  switch (e.kind) {
    case 'bot':
      return [{ id: uid('cl'), kind: 'bot', text: e.text }];
    case 'branch':
      return [{
        id: uid('cl'),
        kind: 'note',
        text: `Checked “${e.variable}” ${e.operator} “${e.value}” → ${e.matched ? 'Yes' : 'No'} path`,
        detail: e.actual ? `Saved value: “${e.actual}”` : 'No value saved yet',
      }];
    case 'webhook':
      return [{ id: uid('cl'), kind: 'webhook', text: 'Webhook delivery simulated', detail: e.url }];
    case 'handoff':
      return [{ id: uid('cl'), kind: 'handoff', text: `Handed off to ${e.department}`, detail: e.note }];
    case 'end':
      return [{ id: uid('cl'), kind: 'end', text: e.reason }];
  }
}

function TestRunModal({ open, onClose, flow, onBumpRuns }: {
  open: boolean;
  onClose: () => void;
  flow: Flow;
  onBumpRuns: () => void;
}) {
  const [visitor, setVisitor] = useState('');
  const [name, setName] = useState('');
  const [sim, setSim] = useState<SimState | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [answer, setAnswer] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines]);

  const appendFromState = (st: SimState, prevEventCount: number) => {
    const fresh = st.events.slice(prevEventCount).flatMap(eventToLines);
    const q: ChatLine[] = st.waiting ? [{ id: uid('cl'), kind: 'bot', text: st.waiting.prompt }] : [];
    setLines((prev) => [...prev, ...fresh, ...q]);
    setSim(st);
  };

  const start = () => {
    const v = name.trim() || 'Visitor';
    setVisitor(v);
    onBumpRuns();
    appendFromState(simBegin(flow, v), 0);
  };

  const send = () => {
    if (!sim?.waiting || !answer.trim()) return;
    const visitorLine: ChatLine = { id: uid('cl'), kind: 'visitor', text: answer.trim() };
    setLines((prev) => [...prev, visitorLine]);
    const st = simAnswer(sim, flow, answer.trim(), visitor);
    const fresh = st.events.slice(sim.events.length).flatMap(eventToLines);
    const q: ChatLine[] = st.waiting ? [{ id: uid('cl'), kind: 'bot', text: st.waiting.prompt }] : [];
    setLines((prev) => [...prev, ...fresh, ...q]);
    setSim(st);
    setAnswer('');
  };

  return (
    <Modal open={open} onClose={onClose} title={`Test run — ${flow.name}`} wide>
      {!sim ? (
        <div className="max-w-sm mx-auto text-center py-6">
          <div className="text-4xl mb-3">🧪</div>
          <p className="text-sm text-slate-600 mb-4">
            Walk the flow as a visitor would. Type answers, watch branches get taken, and see exactly what the visitor sees.
          </p>
          <Label>Visitor name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sara" className="text-center mb-4"
            onKeyDown={(e) => { if (e.key === 'Enter') start(); }} />
          <Button onClick={start} className="w-full">Start test run</Button>
        </div>
      ) : (
        <div>
          <div ref={scrollRef} className="h-96 overflow-y-auto slim-scroll rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            {lines.map((l) => {
              if (l.kind === 'bot') {
                return (
                  <div key={l.id} className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-brix-600 text-white grid place-items-center text-xs font-black shrink-0">B</div>
                    <div className="max-w-[80%] bg-white border border-slate-200 rounded-2xl rounded-tl-md px-4 py-2.5 text-sm text-slate-800 shadow-sm whitespace-pre-wrap">{l.text}</div>
                  </div>
                );
              }
              if (l.kind === 'visitor') {
                return (
                  <div key={l.id} className="flex justify-end">
                    <div className="max-w-[80%] bg-brix-600 text-white rounded-2xl rounded-tr-md px-4 py-2.5 text-sm shadow-sm whitespace-pre-wrap">{l.text}</div>
                  </div>
                );
              }
              if (l.kind === 'note') {
                return (
                  <div key={l.id} className="flex justify-center">
                    <div className="text-[11px] font-semibold text-slate-500 bg-slate-200/70 rounded-full px-3 py-1 text-center">
                      🔀 {l.text}{l.detail ? ` · ${l.detail}` : ''}
                    </div>
                  </div>
                );
              }
              if (l.kind === 'webhook') {
                return (
                  <div key={l.id} className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm">
                    <div className="flex items-center gap-2 font-bold text-amber-800 text-xs">
                      📡 {l.text} <Badge tone="amber">TEST MODE</Badge>
                    </div>
                    <div className="text-amber-700 text-xs mt-1 font-mono break-all">{l.detail}</div>
                    <div className="text-amber-600 text-[11px] mt-1">Recorded locally — no real request was sent.</div>
                  </div>
                );
              }
              if (l.kind === 'handoff') {
                return (
                  <div key={l.id} className="rounded-xl bg-cyan-50 border border-cyan-200 p-3 text-sm">
                    <div className="font-bold text-cyan-800 text-xs">🙋 {l.text}</div>
                    {l.detail && <div className="text-cyan-700 text-xs mt-1">{l.detail}</div>}
                  </div>
                );
              }
              return (
                <div key={l.id} className="text-center text-xs text-slate-500 italic py-1">— {l.text} —</div>
              );
            })}
          </div>

          {Object.keys(sim.vars).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {Object.entries(sim.vars).map(([k, v]) => (
                <span key={k} className="text-[11px] font-mono bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-slate-600">
                  {k} = “{v}”
                </span>
              ))}
            </div>
          )}

          <div className="mt-4">
            {sim.waiting ? (
              <div className="flex gap-2">
                <Input
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Type the visitor's answer…"
                  onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                  autoFocus
                />
                <Button onClick={send} disabled={!answer.trim()}>Send</Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500">Run finished</span>
                <Button variant="secondary" onClick={start}>Restart</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------- builder

function FlowBuilder({ flow, onSave, onClose }: {
  flow: Flow;
  onSave: (f: Flow) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Flow>(flow);
  const [dirty, setDirty] = useState(false);
  const [viewport, setViewport] = useState({ x: 60, y: 40, z: 0.85 });
  const [sel, setSel] = useState<Selection>(null);
  const [pending, setPending] = useState<PendingConn>(null);
  const [mouseWorld, setMouseWorld] = useState<Pt | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [simSession, setSimSession] = useState(0);
  const openSim = () => {
    setSimSession((s) => s + 1);
    setSimOpen(true);
  };

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; sx: number; sy: number; nx: number; ny: number } | null>(null);
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const viewportRef = useRef(viewport);
  const draftRef = useRef(draft);
  const onSaveRef = useRef(onSave);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  const touch = useCallback((next: Flow) => {
    setDraft(next);
    setDirty(true);
  }, []);

  const validation = useMemo(() => validateFlow(draft), [draft]);

  // ---- node / edge mutations

  const addNode = (kind: NodeKind) => {
    const d = draftRef.current;
    if (kind === 'start' && d.nodes.some((n) => n.kind === 'start')) {
      toast.error('Only one Start node is allowed');
      return;
    }
    const el = canvasRef.current;
    const cw = el?.clientWidth ?? 800;
    const ch = el?.clientHeight ?? 500;
    const v = viewportRef.current;
    const jitter = () => (Math.random() - 0.5) * 80;
    const node = createNode(
      kind,
      (cw / 2 - v.x) / v.z - NODE_W / 2 + jitter(),
      (ch / 2 - v.y) / v.z - 60 + jitter(),
    );
    touch({ ...d, nodes: [...d.nodes, node] });
    setSel({ type: 'node', id: node.id });
  };

  const setNodeConfig = (id: string, patch: Partial<FlowNodeConfig>) => {
    const d = draftRef.current;
    touch({
      ...d,
      nodes: d.nodes.map((n) => (n.id === id ? { ...n, config: { ...n.config, ...patch } } : n)),
    });
  };

  const deleteNode = (id: string) => {
    const d = draftRef.current;
    touch({
      ...d,
      nodes: d.nodes.filter((n) => n.id !== id),
      edges: d.edges.filter((e) => e.from !== id && e.to !== id),
    });
    setSel(null);
    setPending((p) => (p && p.nodeId === id ? null : p));
  };

  const deleteEdge = (id: string) => {
    const d = draftRef.current;
    touch({ ...d, edges: d.edges.filter((e) => e.id !== id) });
    setSel(null);
  };

  const onOutputPort = (nodeId: string, port: EdgePort) => {
    setPending((p) => (p && p.nodeId === nodeId && p.port === port ? null : { nodeId, port }));
  };

  const onInputPort = (toId: string) => {
    const p = pending;
    if (!p) return;
    const d = draftRef.current;
    if (p.nodeId === toId) {
      setPending(null);
      return;
    }
    // One edge per output port; one incoming edge per input — replace existing.
    const nextEdges = d.edges.filter((e) => !(e.from === p.nodeId && e.fromPort === p.port) && e.to !== toId);
    const edge = createEdge(p.nodeId, p.port, toId);
    touch({ ...d, edges: [...nextEdges, edge] });
    setPending(null);
    setSel({ type: 'edge', id: edge.id });
  };

  // ---- canvas interaction

  const toWorld = (clientX: number, clientY: number): Pt => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const v = viewportRef.current;
    return {
      x: (clientX - (rect?.left ?? 0) - v.x) / v.z,
      y: (clientY - (rect?.top ?? 0) - v.y) / v.z,
    };
  };

  const onCanvasMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('[data-node]') || t.closest('[data-port]')) return;
    panRef.current = {
      sx: e.clientX, sy: e.clientY,
      vx: viewportRef.current.x, vy: viewportRef.current.y,
      moved: false,
    };
  };

  const onCanvasMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    setMouseWorld(toWorld(e.clientX, e.clientY));
  };

  const onNodeHeaderDown = (e: ReactMouseEvent<HTMLDivElement>, n: FlowNode) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-port]')) return;
    e.stopPropagation();
    setSel({ type: 'node', id: n.id });
    dragRef.current = { id: n.id, sx: e.clientX, sy: e.clientY, nx: n.x, ny: n.y };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const dr = dragRef.current;
      if (dr) {
        const v = viewportRef.current;
        const nx = Math.round(dr.nx + (e.clientX - dr.sx) / v.z);
        const ny = Math.round(dr.ny + (e.clientY - dr.sy) / v.z);
        setDraft((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => (n.id === dr.id ? { ...n, x: nx, y: ny } : n)),
        }));
        setDirty(true);
        return;
      }
      const pr = panRef.current;
      if (pr) {
        if (Math.abs(e.clientX - pr.sx) + Math.abs(e.clientY - pr.sy) > 4) pr.moved = true;
        const z = viewportRef.current.z;
        setViewport({ x: pr.vx + (e.clientX - pr.sx), y: pr.vy + (e.clientY - pr.sy), z });
      }
    };
    const onUp = () => {
      if (panRef.current && !panRef.current.moved) {
        setSel(null);
        setPending(null);
      }
      dragRef.current = null;
      panRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Zoom toward cursor (native listener so preventDefault works).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setViewport((v) => {
        const nz = Math.min(1.75, Math.max(0.35, v.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        return {
          z: nz,
          x: mx - ((mx - v.x) * nz) / v.z,
          y: my - ((my - v.y) * nz) / v.z,
        };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Delete / Escape shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === 'Escape') {
        setPending(null);
        setSel(null);
        return;
      }
      if (typing) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault();
        if (sel.type === 'node') deleteNode(sel.id);
        else deleteEdge(sel.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const fitView = useCallback(() => {
    const el = canvasRef.current;
    const d = draftRef.current;
    if (!el || d.nodes.length === 0) return;
    const pad = 80;
    const minX = Math.min(...d.nodes.map((n) => n.x)) - pad;
    const minY = Math.min(...d.nodes.map((n) => n.y)) - pad;
    const maxX = Math.max(...d.nodes.map((n) => n.x + NODE_W)) + pad;
    const maxY = Math.max(...d.nodes.map((n) => n.y + 220)) + pad;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const z = Math.min(1.15, Math.max(0.25, Math.min(cw / (maxX - minX), ch / (maxY - minY))));
    setViewport({
      z,
      x: (cw - (maxX - minX) * z) / 2 - minX * z,
      y: (ch - (maxY - minY) * z) / 2 - minY * z,
    });
  }, []);

  useEffect(() => {
    fitView();
  }, [fitView]);

  const zoomBy = (f: number) => {
    const el = canvasRef.current;
    if (!el) return;
    const mx = el.clientWidth / 2;
    const my = el.clientHeight / 2;
    setViewport((v) => {
      const nz = Math.min(1.75, Math.max(0.35, v.z * f));
      return { z: nz, x: mx - ((mx - v.x) * nz) / v.z, y: my - ((my - v.y) * nz) / v.z };
    });
  };

  // ---- save / publish

  const save = () => {
    const next = { ...draftRef.current, updatedAt: Date.now() };
    setDraft(next);
    onSaveRef.current(next);
    setDirty(false);
    toast.success('Flow saved');
  };

  const togglePublish = (v: boolean) => {
    if (v) {
      const res = validateFlow(draftRef.current);
      if (res.errors.length > 0) {
        toast.error('Fix validation errors before publishing', res.errors[0]);
        return;
      }
      if (res.warnings.length > 0) {
        toast.warning('Published with warnings', `${res.warnings.length} warning${res.warnings.length === 1 ? '' : 's'} — worth a review.`);
      } else {
        toast.success('Flow published');
      }
    }
    const d = draftRef.current;
    touch({ ...d, published: v });
  };

  const bumpRuns = useCallback(() => {
    const next = { ...draftRef.current, runs: draftRef.current.runs + 1, updatedAt: Date.now() };
    setDraft(next);
    onSaveRef.current(next);
  }, []);

  const pendingAnchor: Pt | null = (() => {
    if (!pending) return null;
    const n = draft.nodes.find((x) => x.id === pending.nodeId);
    if (!n) return null;
    return outputAnchors(n).find((o) => o.port === pending.port) ?? null;
  })();

  const hasStart = draft.nodes.some((n) => n.kind === 'start');

  return (
    <div className="flex flex-col h-[calc(100dvh-190px)] min-h-[560px]">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-slate-200 bg-white shrink-0">
        <Button variant="ghost" size="sm" onClick={onClose}>← All flows</Button>
        <Input
          value={draft.name}
          onChange={(e) => touch({ ...draftRef.current, name: e.target.value })}
          className="w-52 font-display font-bold"
          aria-label="Flow name"
        />
        {dirty
          ? <Badge tone="amber">● Unsaved changes</Badge>
          : <Badge tone="green">✓ Saved</Badge>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge tone="slate">▶ {draft.runs} test run{draft.runs === 1 ? '' : 's'}</Badge>
          <Button variant="secondary" size="sm" onClick={openSim}>🧪 Test run</Button>
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Toggle checked={draft.published} onChange={togglePublish} label="Publish flow" />
            {draft.published ? 'Published' : 'Draft'}
          </span>
          <Button size="sm" onClick={save} disabled={!dirty}>Save</Button>
        </div>
      </div>

      {/* validation messages */}
      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="px-4 pt-3 space-y-2 shrink-0 max-h-36 overflow-y-auto slim-scroll">
          {validation.errors.map((m, i) => (
            <div key={`e${i}`} className="flex gap-2 items-start text-[13px] font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              <span aria-hidden>⛔</span><span>{m}</span>
            </div>
          ))}
          {validation.warnings.map((m, i) => (
            <div key={`w${i}`} className="flex gap-2 items-start text-[13px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <span aria-hidden>⚠️</span><span>{m}</span>
            </div>
          ))}
        </div>
      )}

      {/* main area */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 p-4 gap-4">
        {/* palette */}
        <div className="lg:w-60 shrink-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 mb-2 px-1">Add steps</div>
          <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1">
            {NODE_KINDS.map((k) => {
              const meta = NODE_META[k];
              const disabled = k === 'start' && hasStart;
              return (
                <button
                  key={k}
                  disabled={disabled}
                  onClick={() => addNode(k)}
                  title={disabled ? 'This flow already has a Start node' : meta.description}
                  className="min-w-44 lg:min-w-0 w-full text-left p-3 rounded-xl border border-slate-200 bg-white hover:border-brix-300 hover:shadow-md transition disabled:opacity-40 disabled:pointer-events-none shrink-0"
                >
                  <div className="flex items-center gap-2">
                    <span className={cx('w-7 h-7 rounded-lg grid place-items-center text-white text-sm shrink-0', meta.headerClass)}>{meta.icon}</span>
                    <span className="text-sm font-bold text-slate-800">{meta.label}</span>
                    <span className="ml-auto text-slate-300 font-black">＋</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 leading-snug hidden lg:block">{meta.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* canvas */}
        <div
          ref={canvasRef}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          className="relative flex-1 min-w-0 min-h-[420px] overflow-hidden bg-slate-100 rounded-2xl border border-slate-200 select-none cursor-grab active:cursor-grabbing"
          style={{ backgroundImage: 'radial-gradient(circle, #cbd5e1 1.2px, transparent 1.2px)', backgroundSize: '24px 24px' }}
        >
          <div
            className="absolute left-0 top-0"
            style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.z})`, transformOrigin: '0 0' }}
          >
            <FlowEdges
              flow={draft}
              sel={sel}
              pendingAnchor={pendingAnchor}
              mouseWorld={pending ? mouseWorld : null}
              onSelectEdge={(id) => setSel({ type: 'edge', id })}
            />
            {draft.nodes.map((n) => (
              <FlowNodeCard
                key={n.id}
                node={n}
                selected={sel?.type === 'node' && sel.id === n.id}
                pending={pending}
                onHeaderDown={onNodeHeaderDown}
                onSelect={(id) => setSel({ type: 'node', id })}
                onOutputPort={onOutputPort}
                onInputPort={onInputPort}
              />
            ))}
          </div>

          <div className="absolute left-3 bottom-3 flex items-center gap-1 bg-white/90 backdrop-blur border border-slate-200 rounded-xl p-1 shadow-sm">
            <button onClick={() => zoomBy(1 / 1.2)} className="w-8 h-8 grid place-items-center rounded-lg text-slate-600 hover:bg-slate-100 font-black" aria-label="Zoom out">−</button>
            <span className="text-xs font-bold text-slate-500 w-11 text-center">{Math.round(viewport.z * 100)}%</span>
            <button onClick={() => zoomBy(1.2)} className="w-8 h-8 grid place-items-center rounded-lg text-slate-600 hover:bg-slate-100 font-black" aria-label="Zoom in">＋</button>
            <button onClick={fitView} className="h-8 px-2.5 grid place-items-center rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100" aria-label="Fit to view">Fit</button>
          </div>
          <div className="absolute right-3 bottom-3 text-[11px] font-medium text-slate-500 bg-white/80 backdrop-blur rounded-lg px-2.5 py-1.5 border border-slate-200 pointer-events-none">
            Drag canvas to pan · scroll to zoom · click a colored dot, then a grey dot, to connect
          </div>
          {pending && (
            <div className="absolute left-1/2 -translate-x-1/2 top-3 text-xs font-bold text-brix-700 bg-brix-50 border border-brix-200 rounded-full px-4 py-1.5 shadow-sm pointer-events-none animate-pulse">
              Now click a grey input dot to connect — Esc to cancel
            </div>
          )}
        </div>

        {/* inspector */}
        <div className="lg:w-80 shrink-0 bg-white rounded-2xl border border-slate-200 overflow-y-auto slim-scroll min-h-0 max-h-[420px] lg:max-h-none">
          <Inspector
            flow={draft}
            sel={sel}
            onConfig={setNodeConfig}
            onDeleteNode={deleteNode}
            onDeleteEdge={deleteEdge}
            onDeselect={() => setSel(null)}
          />
        </div>
      </div>

      <TestRunModal key={simSession} open={simOpen} onClose={() => setSimOpen(false)} flow={draft} onBumpRuns={bumpRuns} />
    </div>
  );
}

// --------------------------------------------------------------------- page

/** Load this workspace's flows, seeding the starter template on first visit. */
function loadOrSeed(wsId: string): Flow[] {
  const list = loadFlows(wsId);
  if (list.length > 0) return list;
  const seeded = [starterTemplateFlow()];
  saveFlows(wsId, seeded);
  return seeded;
}

export default function Flows() {
  const { effectiveWorkspaceId } = useStore();
  const wsId = effectiveWorkspaceId();
  const [cache, setCache] = useState(() => ({ wsId, flows: loadOrSeed(wsId) }));
  // Workspace switched (e.g. view-as): reload from storage during render.
  if (cache.wsId !== wsId) {
    setCache({ wsId, flows: loadOrSeed(wsId) });
  }
  const flows = cache.wsId === wsId ? cache.flows : loadOrSeed(wsId);
  const [openId, setOpenId] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const persist = (next: Flow[]) => {
    setCache((c) => ({ ...c, flows: next }));
    saveFlows(wsId, next);
  };

  const newFlow = () => {
    const f = createFlow('Untitled flow');
    persist([...flows, f]);
    setOpenId(f.id);
  };

  const duplicate = (id: string) => {
    const f = flows.find((x) => x.id === id);
    if (!f) return;
    const copy = duplicateFlow(f);
    persist([...flows, copy]);
    toast.success('Flow duplicated');
  };

  const askDelete = (f: Flow) => {
    confirm({
      title: `Delete “${f.name}”?`,
      body: 'This removes the flow permanently. This cannot be undone.',
      action: () => {
        persist(flows.filter((x) => x.id !== f.id));
        if (openId === f.id) setOpenId(null);
        toast.success('Flow deleted');
      },
    });
  };

  const openFlow = flows.find((f) => f.id === openId);

  if (openFlow) {
    return (
      <FlowBuilder
        key={openFlow.id}
        flow={openFlow}
        onSave={(updated) => persist(flows.map((f) => (f.id === updated.id ? updated : f)))}
        onClose={() => setOpenId(null)}
      />
    );
  }

  const sorted = [...flows].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto">
      <PageHeader
        title="Chatbot flows"
        subtitle="Design automated chat journeys — greet visitors, ask questions, branch on answers, and hand off to your team."
        actions={<Button onClick={newFlow}>＋ New flow</Button>}
      />
      {sorted.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔀"
            title="No flows yet"
            hint="Create your first flow to automate greetings, qualifying questions, and handoffs."
            action={<Button onClick={newFlow}>＋ New flow</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((f) => (
            <Card key={f.id} className="p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display font-bold text-slate-900 truncate">{f.name}</h3>
                {f.published ? <Badge tone="green">Published</Badge> : <Badge tone="slate">Draft</Badge>}
              </div>
              <div className="flex gap-4 text-xs text-slate-500 font-semibold">
                <span>{f.nodes.length} steps</span>
                <span>{f.edges.length} connections</span>
                <span>▶ {f.runs} test run{f.runs === 1 ? '' : 's'}</span>
              </div>
              <div className="text-xs text-slate-500">Updated {timeAgo(f.updatedAt)}</div>
              <div className="flex gap-2 mt-auto pt-1">
                <Button size="sm" onClick={() => setOpenId(f.id)}>Open builder</Button>
                <Button size="sm" variant="secondary" onClick={() => duplicate(f.id)}>Duplicate</Button>
                <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => askDelete(f)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {dialog}
    </div>
  );
}
