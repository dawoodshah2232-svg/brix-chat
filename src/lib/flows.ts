// Brix Chat — visual chatbot flow builder: flow model, validation, local
// persistence (per workspace), and a pure test-run simulator.
//
// All flow types live here. Webhook deliveries are NEVER sent over the
// network from this module — the simulator only records a local entry.

export type NodeKind = 'start' | 'message' | 'question' | 'condition' | 'handoff' | 'webhook';
export type ConditionOperator = 'contains' | 'equals';
export type EdgePort = 'out' | 'true' | 'false';

export interface FlowNodeConfig {
  /** message: bot text (supports {visitor_name} and {variable}); question: prompt */
  text?: string;
  /** question: variable the answer is saved to; condition: variable under test */
  variable?: string;
  /** condition: comparison operator */
  operator?: ConditionOperator;
  /** condition: value to compare against */
  value?: string;
  /** handoff: target department or agent */
  department?: string;
  /** handoff: optional note attached to the handoff */
  note?: string;
  /** webhook: POST URL (test mode — simulated locally, never requested) */
  url?: string;
}

export interface FlowNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  config: FlowNodeConfig;
}

export interface FlowEdge {
  id: string;
  from: string;
  fromPort: EdgePort;
  to: string;
}

export interface Flow {
  id: string;
  name: string;
  published: boolean;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** number of test runs performed */
  runs: number;
  createdAt: number;
  updatedAt: number;
}

export interface NodeKindMeta {
  label: string;
  icon: string;
  description: string;
  headerClass: string;
  dotClass: string;
}

/** Presentation metadata per node kind (labels + palette copy, all original). */
export const NODE_META: Record<NodeKind, NodeKindMeta> = {
  start: {
    label: 'Start',
    icon: '🚀',
    description: 'Where every chat enters the flow. Exactly one per flow.',
    headerClass: 'bg-emerald-600',
    dotClass: 'bg-emerald-500',
  },
  message: {
    label: 'Message',
    icon: '💬',
    description: 'Send the visitor a bot message. Use {visitor_name} to personalize.',
    headerClass: 'bg-brix-600',
    dotClass: 'bg-brix-500',
  },
  question: {
    label: 'Question',
    icon: '❓',
    description: 'Ask the visitor something and save their answer to a variable.',
    headerClass: 'bg-amber-500',
    dotClass: 'bg-amber-400',
  },
  condition: {
    label: 'Condition',
    icon: '🔀',
    description: 'Branch the flow: if a variable contains or equals a value, take the Yes path.',
    headerClass: 'bg-rose-600',
    dotClass: 'bg-rose-500',
  },
  handoff: {
    label: 'Handoff',
    icon: '🙋',
    description: 'Route the chat to a department or agent, with an optional note.',
    headerClass: 'bg-cyan-600',
    dotClass: 'bg-cyan-500',
  },
  webhook: {
    label: 'Webhook',
    icon: '📡',
    description: 'POST the collected answers to a URL. Test mode — simulated locally.',
    headerClass: 'bg-violet-600',
    dotClass: 'bg-violet-500',
  },
};

export const NODE_KINDS: NodeKind[] = ['start', 'message', 'question', 'condition', 'handoff', 'webhook'];

let counter = 0;
/** Unique ids scoped to this module (safe alongside lib/utils uid). */
export function flowUid(prefix = 'fl'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/** Default config for a freshly added node. */
export function defaultConfig(kind: NodeKind): FlowNodeConfig {
  switch (kind) {
    case 'start':
      return {};
    case 'message':
      return { text: 'Hi {visitor_name}! How can I help you today?' };
    case 'question':
      return { text: 'What can we help you with?', variable: 'topic' };
    case 'condition':
      return { variable: 'topic', operator: 'contains', value: '' };
    case 'handoff':
      return { department: 'Sales', note: '' };
    case 'webhook':
      return { url: 'https://example.com/brix-hook' };
  }
}

export function createNode(kind: NodeKind, x: number, y: number): FlowNode {
  return { id: flowUid('nd'), kind, x, y, config: defaultConfig(kind) };
}

export function createEdge(from: string, fromPort: EdgePort, to: string): FlowEdge {
  return { id: flowUid('eg'), from, fromPort, to };
}

/** Keep variable names tidy: lowercase letters, numbers, underscores. */
export function sanitizeVariable(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/** Replace {visitor_name} and {variable} tokens. Unknown tokens stay as-is. */
export function interpolate(text: string, vars: Record<string, string>, visitorName: string): string {
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, key: string) => {
    if (key === 'visitor_name') return visitorName || 'there';
    const v = vars[key];
    return v !== undefined ? v : m;
  });
}

// ---------------------------------------------------------------- persistence

const STORAGE_KEY = 'brixchat_flows_v1';

function readStore(): Record<string, Flow[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, Flow[]>;
    }
  } catch {
    /* corrupted store — start fresh */
  }
  return {};
}

function writeStore(store: Record<string, Flow[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage full or unavailable — the page surfaces the failure on save */
  }
}

/** Load this workspace's flows (empty array when none yet). */
export function loadFlows(workspaceId: string): Flow[] {
  const list = readStore()[workspaceId];
  return Array.isArray(list) ? list : [];
}

/** Persist this workspace's flows. */
export function saveFlows(workspaceId: string, flows: Flow[]): void {
  const store = readStore();
  store[workspaceId] = flows;
  writeStore(store);
}

/** Blank flow with a single Start node, ready to build on. */
export function createFlow(name: string): Flow {
  const now = Date.now();
  return {
    id: flowUid('fl'),
    name: name.trim() || 'Untitled flow',
    published: false,
    nodes: [{ id: flowUid('nd'), kind: 'start', x: 80, y: 220, config: {} }],
    edges: [],
    runs: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** Deep-copy a flow under fresh ids (used for duplication). */
export function duplicateFlow(flow: Flow): Flow {
  const idMap = new Map<string, string>();
  const nodes = flow.nodes.map((n) => {
    const nid = flowUid('nd');
    idMap.set(n.id, nid);
    return { ...n, id: nid, config: { ...n.config } };
  });
  const edges = flow.edges
    .map((e) => ({
      ...e,
      id: flowUid('eg'),
      from: idMap.get(e.from) ?? e.from,
      to: idMap.get(e.to) ?? e.to,
    }))
    .filter((e) => idMap.has(e.from) && idMap.has(e.to));
  const now = Date.now();
  return {
    ...flow,
    id: flowUid('fl'),
    name: `${flow.name} (copy)`,
    published: false,
    nodes,
    edges,
    runs: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ------------------------------------------------------------ starter template

/**
 * Pre-installed template so the page is never empty: greets the visitor,
 * asks what they need, branches on their answer, and hands off to the
 * right team.
 */
export function starterTemplateFlow(): Flow {
  const now = Date.now();
  const n = (kind: NodeKind, x: number, y: number, config: FlowNodeConfig): FlowNode => ({
    id: flowUid('nd'),
    kind,
    x,
    y,
    config,
  });
  const start = n('start', 60, 240, {});
  const hello = n('message', 340, 240, {
    text: 'Hi {visitor_name}! Welcome — I can point you to the right team.',
  });
  const ask = n('question', 620, 240, {
    text: 'Are you looking for sales help or product support today?',
    variable: 'intent',
  });
  const branch = n('condition', 900, 240, { variable: 'intent', operator: 'contains', value: 'sales' });
  const salesMsg = n('message', 1180, 90, {
    text: 'Perfect — our sales team replies in under a minute. Passing you over now.',
  });
  const salesHook = n('webhook', 1460, 90, { url: 'https://example.com/crm/new-lead' });
  const salesGo = n('handoff', 1740, 90, { department: 'Sales', note: 'Qualified by welcome flow' });
  const supportMsg = n('message', 1180, 390, {
    text: 'No problem — let me connect you with a support specialist.',
  });
  const supportGo = n('handoff', 1460, 390, { department: 'Support', note: 'Qualified by welcome flow' });

  const e = (from: FlowNode, fromPort: EdgePort, to: FlowNode): FlowEdge => ({
    id: flowUid('eg'),
    from: from.id,
    fromPort,
    to: to.id,
  });

  return {
    id: flowUid('fl'),
    name: 'Welcome + qualify + handoff',
    published: false,
    nodes: [start, hello, ask, branch, salesMsg, salesHook, salesGo, supportMsg, supportGo],
    edges: [
      e(start, 'out', hello),
      e(hello, 'out', ask),
      e(ask, 'out', branch),
      e(branch, 'true', salesMsg),
      e(branch, 'false', supportMsg),
      e(salesMsg, 'out', salesHook),
      e(salesHook, 'out', salesGo),
      e(supportMsg, 'out', supportGo),
    ],
    runs: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------- validation

export interface FlowValidation {
  errors: string[];
  warnings: string[];
}

function outEdges(flow: Flow, nodeId: string, port?: EdgePort): FlowEdge[] {
  return flow.edges.filter((e) => e.from === nodeId && (port === undefined || e.fromPort === port));
}

function reachableFrom(flow: Flow, startId: string): Set<string> {
  const seen = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    for (const e of flow.edges) {
      if (e.from === cur && !seen.has(e.to)) {
        seen.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return seen;
}

/** Loops are only allowed when they pass through a Condition branch. */
function invalidCycles(flow: Flow): string[] {
  const problems: string[] = [];
  const adj = new Map<string, string[]>();
  for (const n of flow.nodes) adj.set(n.id, []);
  for (const e of flow.edges) adj.get(e.from)?.push(e.to);

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  const reported = new Set<string>();

  const kindOf = (id: string): NodeKind | undefined => flow.nodes.find((n) => n.id === id)?.kind;

  function dfs(u: string): void {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v) ?? WHITE;
      if (c === GRAY) {
        // back edge u -> v: cycle = stack slice from v to u
        const idx = stack.indexOf(v);
        const cycle = stack.slice(idx);
        const key = [...cycle].sort().join(',');
        const throughCondition = cycle.some((id) => kindOf(id) === 'condition');
        if (!throughCondition && !reported.has(key)) {
          reported.add(key);
          problems.push('A loop was found that does not pass through a Condition — route repeating steps through a Yes/No branch.');
        }
      } else if (c === WHITE) {
        dfs(v);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  }

  for (const n of flow.nodes) {
    if ((color.get(n.id) ?? WHITE) === WHITE) dfs(n.id);
  }
  return problems;
}

export function validateFlow(flow: Flow): FlowValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const starts = flow.nodes.filter((n) => n.kind === 'start');
  if (starts.length === 0) errors.push('Add exactly one Start node — every flow needs a single entry point.');
  if (starts.length > 1) errors.push('Only one Start node is allowed — remove the extras so the flow has a single entry point.');

  if (starts.length === 1) {
    const reached = reachableFrom(flow, starts[0].id);
    const orphans = flow.nodes.filter((n) => n.kind !== 'start' && !reached.has(n.id));
    if (orphans.length > 0) {
      warnings.push(
        `${orphans.length} node${orphans.length === 1 ? ' is' : 's are'} not connected to the Start path and will never run: ${orphans
          .slice(0, 3)
          .map((o) => NODE_META[o.kind].label)
          .join(', ')}${orphans.length > 3 ? '…' : ''}.`,
      );
    }
  }

  for (const node of flow.nodes) {
    const cfg = node.config;
    switch (node.kind) {
      case 'start':
        break;
      case 'message':
        if (!cfg.text?.trim()) warnings.push('A Message node has no text yet.');
        if (outEdges(flow, node.id).length === 0) warnings.push('A Message node has no next step connected.');
        break;
      case 'question':
        if (!cfg.text?.trim()) warnings.push('A Question node has no prompt yet.');
        if (!sanitizeVariable(cfg.variable ?? '')) warnings.push('A Question node needs a variable name to store the answer.');
        if (outEdges(flow, node.id).length === 0) warnings.push('A Question node has no next step connected.');
        break;
      case 'condition':
        if (!sanitizeVariable(cfg.variable ?? '')) warnings.push('A Condition node needs a variable to test.');
        if (outEdges(flow, node.id, 'true').length === 0 || outEdges(flow, node.id, 'false').length === 0) {
          warnings.push(`The “${cfg.variable || 'condition'}” Condition is missing its Yes or No connection.`);
        }
        break;
      case 'handoff':
        if (!cfg.department?.trim()) warnings.push('A Handoff node needs a department or agent name.');
        break;
      case 'webhook':
        if (!cfg.url?.trim()) warnings.push('A Webhook node has no URL yet.');
        if (outEdges(flow, node.id).length === 0) warnings.push('A Webhook node has no next step connected.');
        break;
    }
  }

  for (const p of invalidCycles(flow)) errors.push(p);
  return { errors, warnings };
}

// ---------------------------------------------------------------- simulation

/** One visible entry in the test-run chat. */
export type SimEvent =
  | { kind: 'bot'; text: string }
  | { kind: 'branch'; variable: string; operator: ConditionOperator; value: string; actual: string; matched: boolean }
  | { kind: 'webhook'; url: string }
  | { kind: 'handoff'; department: string; note?: string }
  | { kind: 'end'; reason: string };

export interface SimQuestion {
  nodeId: string;
  prompt: string;
  variable: string;
}

export interface SimState {
  /** next node to process; null when finished */
  nodeId: string | null;
  vars: Record<string, string>;
  events: SimEvent[];
  waiting: SimQuestion | null;
  finished: boolean;
}

const MAX_STEPS = 400;

function findNode(flow: Flow, id: string): FlowNode | undefined {
  return flow.nodes.find((n) => n.id === id);
}

function nextNodeId(flow: Flow, node: FlowNode, port: EdgePort): string | null {
  const edge = outEdges(flow, node.id, port)[0];
  return edge ? edge.to : null;
}

function evalCondition(variable: string, operator: ConditionOperator, value: string, vars: Record<string, string>): { actual: string; matched: boolean } {
  const actual = vars[variable] ?? '';
  const target = value.trim().toLowerCase();
  if (operator === 'equals') return { actual, matched: actual.trim().toLowerCase() === target };
  return { actual, matched: actual.toLowerCase().includes(target) };
}

/**
 * Walk the flow until it needs a visitor answer or finishes.
 * Webhook deliveries are recorded as simulated — no network call is made.
 */
function advance(flow: Flow, startId: string, vars: Record<string, string>, events: SimEvent[], visitorName: string): SimState {
  let nodeId: string | null = startId;
  let steps = 0;
  while (nodeId && steps < MAX_STEPS) {
    steps += 1;
    const node = findNode(flow, nodeId);
    if (!node) {
      events.push({ kind: 'end', reason: 'A connection points to a removed node — reconnect it on the canvas.' });
      return { nodeId: null, vars, events, waiting: null, finished: true };
    }
    switch (node.kind) {
      case 'start': {
        const next = nextNodeId(flow, node, 'out');
        if (!next) {
          events.push({ kind: 'end', reason: 'Flow ended — the Start node has no next step.' });
          return { nodeId: null, vars, events, waiting: null, finished: true };
        }
        nodeId = next;
        break;
      }
      case 'message': {
        events.push({ kind: 'bot', text: interpolate(node.config.text ?? '', vars, visitorName) });
        const next = nextNodeId(flow, node, 'out');
        if (!next) {
          events.push({ kind: 'end', reason: 'Conversation ended.' });
          return { nodeId: null, vars, events, waiting: null, finished: true };
        }
        nodeId = next;
        break;
      }
      case 'question': {
        const variable = sanitizeVariable(node.config.variable ?? '') || 'answer';
        return {
          nodeId,
          vars,
          events,
          waiting: { nodeId, prompt: interpolate(node.config.text ?? '', vars, visitorName), variable },
          finished: false,
        };
      }
      case 'condition': {
        const variable = sanitizeVariable(node.config.variable ?? '');
        const operator = node.config.operator ?? 'contains';
        const value = node.config.value ?? '';
        const { actual, matched } = evalCondition(variable, operator, value, vars);
        events.push({ kind: 'branch', variable, operator, value, actual, matched });
        const next = nextNodeId(flow, node, matched ? 'true' : 'false');
        if (!next) {
          events.push({ kind: 'end', reason: `Flow ended — the ${matched ? 'Yes' : 'No'} branch is not connected.` });
          return { nodeId: null, vars, events, waiting: null, finished: true };
        }
        nodeId = next;
        break;
      }
      case 'handoff': {
        events.push({ kind: 'handoff', department: node.config.department?.trim() || 'an agent', note: node.config.note?.trim() || undefined });
        events.push({ kind: 'end', reason: 'Handed off — a teammate takes it from here.' });
        return { nodeId: null, vars, events, waiting: null, finished: true };
      }
      case 'webhook': {
        events.push({ kind: 'webhook', url: node.config.url?.trim() || '(no URL set)' });
        const next = nextNodeId(flow, node, 'out');
        if (!next) {
          events.push({ kind: 'end', reason: 'Flow ended after the webhook step.' });
          return { nodeId: null, vars, events, waiting: null, finished: true };
        }
        nodeId = next;
        break;
      }
    }
  }
  if (steps >= MAX_STEPS) {
    events.push({ kind: 'end', reason: 'Stopped after 400 steps — the flow may loop forever. Check your connections.' });
  }
  return { nodeId, vars, events, waiting: null, finished: nodeId === null };
}

/** Begin a test run as a visitor. */
export function simBegin(flow: Flow, visitorName: string): SimState {
  const start = flow.nodes.find((n) => n.kind === 'start');
  if (!start) {
    return { nodeId: null, vars: {}, events: [{ kind: 'end', reason: 'This flow has no Start node yet.' }], waiting: null, finished: true };
  }
  return advance(flow, start.id, {}, [], visitorName);
}

/** Submit a visitor answer to the pending question and continue the run. */
export function simAnswer(state: SimState, flow: Flow, answer: string, visitorName: string): SimState {
  if (!state.waiting) return state;
  const node = findNode(flow, state.waiting.nodeId);
  const vars = { ...state.vars, [state.waiting.variable]: answer };
  const events = [...state.events];
  if (!node) {
    events.push({ kind: 'end', reason: 'The question node was removed — reconnect it on the canvas.' });
    return { nodeId: null, vars, events, waiting: null, finished: true };
  }
  const next = nextNodeId(flow, node, 'out');
  if (!next) {
    events.push({ kind: 'end', reason: 'Conversation ended.' });
    return { nodeId: null, vars, events, waiting: null, finished: true };
  }
  return advance(flow, next, vars, events, visitorName);
}
