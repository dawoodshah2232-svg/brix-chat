// Brix Chat — local API layer.
//
// Typed implementation whose method names and shapes mirror the REST catalog
// documented in docs/API.md. Backed by localStorage today; swapping the
// transport for HTTP later means re-implementing these same methods against
// fetch — callers stay unchanged. Every method is async, returns a { data }
// envelope, and throws ApiError (HTTP-style code/status) on failure.
//
// LOCAL-ONLY: all data lives in this browser's localStorage. There is no
// cross-device sync until a backend phase lands.

export interface Envelope<T> {
  data: T;
}
export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Domain types (API-facing)
// ---------------------------------------------------------------------------

export type ConvStatus = 'open' | 'closed' | 'spam' | 'missed';
export type MsgSender = 'visitor' | 'agent' | 'ai' | 'system';
export type MsgKind = 'text' | 'file' | 'voice' | 'rating';
export type TicketStatus = 'new' | 'open' | 'resolved';
export type TeamRole = 'admin' | 'agent' | 'developer' | 'viewer';
export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'dead' | 'test';

export interface ApiMessage {
  id: string;
  conversation_id: string;
  sender: MsgSender;
  kind: MsgKind;
  text: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ConvNote {
  author: string;
  text: string;
  created_at: string;
}

export interface ApiConversation {
  id: string;
  property_id: string;
  visitor_name: string;
  visitor_email: string;
  page_url: string;
  referrer: string;
  status: ConvStatus;
  department: string;
  agent_id: string | null;
  agent_name: string | null;
  tags: string[];
  notes: ConvNote[];
  rating: number | null;
  unread: number;
  ai_handled: boolean;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  messages: ApiMessage[];
}

export interface WidgetConfig {
  color: string;
  position: 'bottom-right' | 'bottom-left';
  bubble: 'round' | 'pill' | 'square';
  greeting: string;
  offline_text: string;
  agent_name: string;
  show_branding: boolean;
  prechat_form: boolean;
}

export interface ApiProperty {
  id: string;
  name: string;
  domain: string;
  public_key: string;
  widget_config: WidgetConfig;
  secure_mode: boolean;
  created_at: string;
}

export interface ApiContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  tags: string[];
  notes: string;
  source: string;
  chats: number;
  created_at: string;
  last_seen_at: string;
}

export interface ApiAgent {
  id: string;
  display_name: string;
  role: TeamRole;
  online: boolean;
  passcode: string; // local-only: shown once at invite, stored in this browser
  created_at: string;
  last_login_at: string | null;
}

export interface ApiTicket {
  id: string;
  property_id: string | null;
  subject: string;
  requester_name: string;
  requester_email: string;
  message: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
}

export interface ApiArticle {
  id: string;
  title: string;
  slug: string;
  body: string;
  category: string;
  status: 'draft' | 'published';
  views: number;
  updated_at: string;
}

export interface ApiCanned {
  id: string;
  shortcut: string;
  title: string;
  body: string;
}

export interface ApiWebhook {
  id: string;
  property_id: string;
  url: string;
  secret: string; // local-only: stored in this browser; shown masked after creation
  events: string[];
  enabled: boolean;
  auto_disable: boolean;
  consecutive_failures: number;
  created_at: string;
}

export interface ApiDelivery {
  id: string;
  webhook_id: string;
  event: string;
  event_id: string;
  payload: Record<string, unknown>;
  status: DeliveryStatus;
  http_status: number | null;
  attempts: number;
  created_at: string;
  note?: string;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string; // e.g. bk_live_1a2b3c — shown in lists
  key_hash: string;
  scopes: string[];
  revoked: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string;
  meta: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Catalogs (shared with UI + docs)
// ---------------------------------------------------------------------------

export const WEBHOOK_EVENTS: Array<{ name: string; description: string }> = [
  { name: 'chat.started', description: 'Visitor sends the first message of a chat' },
  { name: 'chat.ended', description: 'Chat session ends' },
  { name: 'chat.transcript', description: 'Full transcript ready after a chat ends' },
  { name: 'message.created', description: 'Any new message (visitor, agent, or bot)' },
  { name: 'conversation.assigned', description: 'Chat assigned to an agent or department' },
  { name: 'conversation.status_changed', description: 'Status flips between open / closed / spam / missed' },
  { name: 'ticket.created', description: 'New support ticket (offline form, missed chat)' },
  { name: 'ticket.status_changed', description: 'Ticket resolved or reopened' },
  { name: 'contact.created', description: 'Contact record created' },
  { name: 'contact.updated', description: 'Contact record updated' },
  { name: 'satisfaction.received', description: 'Visitor submits a post-chat rating' },
  { name: 'widget.opened', description: 'Visitor opens the chat widget' },
];

export const API_SCOPES: Array<{ name: string; description: string }> = [
  { name: 'properties:read', description: 'List and view websites' },
  { name: 'properties:write', description: 'Create, update, and delete websites' },
  { name: 'conversations:read', description: 'Read conversations and messages' },
  { name: 'conversations:write', description: 'Send messages, assign, change status' },
  { name: 'contacts:read', description: 'Read contacts' },
  { name: 'contacts:write', description: 'Create and update contacts' },
  { name: 'tickets:read', description: 'Read tickets' },
  { name: 'tickets:write', description: 'Create and update tickets' },
  { name: 'kb:read', description: 'Read knowledge-base articles' },
  { name: 'kb:write', description: 'Create, update, and delete articles' },
  { name: 'webhooks:read', description: 'Read webhooks and delivery logs' },
  { name: 'webhooks:write', description: 'Manage webhook endpoints' },
  { name: 'metrics:read', description: 'Read analytics metrics' },
];

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const LS_KEY = 'brixchat_api_v1';

interface ApiDB {
  properties: ApiProperty[];
  conversations: ApiConversation[];
  contacts: ApiContact[];
  agents: ApiAgent[];
  tickets: ApiTicket[];
  articles: ApiArticle[];
  canned: ApiCanned[];
  webhooks: ApiWebhook[];
  deliveries: ApiDelivery[];
  apiKeys: ApiKeyRecord[];
  fullKeys: Record<string, string>; // key id -> full key (local-only, shown once)
  audit: AuditEntry[];
}

type DBMap = Record<string, ApiDB>;

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function isoNow(): string {
  return new Date().toISOString();
}
function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function defaultWidgetConfig(): WidgetConfig {
  return {
    color: '#4f46e5',
    position: 'bottom-right',
    bubble: 'round',
    greeting: 'Hi there! How can we help you today?',
    offline_text: 'We are currently offline. Leave a message and we will reply soon.',
    agent_name: 'Support Team',
    show_branding: true,
    prechat_form: false,
  };
}

function seedDB(): ApiDB {
  const now = isoNow();
  const propId = uid('prop');
  const convs: ApiConversation[] = [
    {
      id: uid('conv'), property_id: propId, visitor_name: 'Ayesha Khan', visitor_email: 'ayesha@example.com',
      page_url: '/pricing', referrer: 'https://google.com', status: 'open', department: 'Sales',
      agent_id: null, agent_name: null, tags: ['pricing'], notes: [], rating: null, unread: 2,
      ai_handled: false, created_at: now, updated_at: now, closed_at: null,
      messages: [
        { id: uid('msg'), conversation_id: '', sender: 'visitor', kind: 'text', text: 'Hi! Do you offer annual billing?', metadata: {}, created_at: now },
        { id: uid('msg'), conversation_id: '', sender: 'agent', kind: 'text', text: 'Yes — annual plans save you two months. Want a quick walkthrough?', metadata: {}, created_at: now },
        { id: uid('msg'), conversation_id: '', sender: 'visitor', kind: 'text', text: 'That would be great. Is there a trial?', metadata: {}, created_at: now },
      ],
    },
    {
      id: uid('conv'), property_id: propId, visitor_name: 'Omar Farouk', visitor_email: '',
      page_url: '/docs', referrer: '', status: 'open', department: 'Support',
      agent_id: null, agent_name: null, tags: ['integration'], notes: [], rating: null, unread: 1,
      ai_handled: true, created_at: now, updated_at: now, closed_at: null,
      messages: [
        { id: uid('msg'), conversation_id: '', sender: 'visitor', kind: 'text', text: 'How do I add the widget to WordPress?', metadata: {}, created_at: now },
        { id: uid('msg'), conversation_id: '', sender: 'ai', kind: 'text', text: 'Paste the embed snippet before the closing body tag, or use our one-click installer from the Install tab.', metadata: {}, created_at: now },
      ],
    },
    {
      id: uid('conv'), property_id: propId, visitor_name: 'Maria Santos', visitor_email: 'maria@example.com',
      page_url: '/', referrer: '', status: 'closed', department: 'Support',
      agent_id: null, agent_name: 'Demo Agent', tags: [], notes: [], rating: 5, unread: 0,
      ai_handled: false, created_at: now, updated_at: now, closed_at: now,
      messages: [
        { id: uid('msg'), conversation_id: '', sender: 'visitor', kind: 'text', text: 'Thanks, that solved it!', metadata: {}, created_at: now },
        { id: uid('msg'), conversation_id: '', sender: 'agent', kind: 'text', text: 'Happy to help. Have a great day!', metadata: {}, created_at: now },
      ],
    },
  ];
  convs.forEach((c) => c.messages.forEach((m) => { m.conversation_id = c.id; }));

  return {
    properties: [
      {
        id: propId, name: 'Demo Store', domain: 'demo.brixchat.com', public_key: 'bx_demo_7f3a9c1e',
        widget_config: defaultWidgetConfig(), secure_mode: false, created_at: now,
      },
    ],
    conversations: convs,
    contacts: [
      { id: uid('con'), name: 'Ayesha Khan', email: 'ayesha@example.com', phone: '', country: 'UAE', tags: ['lead'], notes: 'Asked about annual billing.', source: 'chat', chats: 2, created_at: now, last_seen_at: now },
      { id: uid('con'), name: 'Omar Farouk', email: '', phone: '', country: 'Egypt', tags: ['support'], notes: '', source: 'chat', chats: 1, created_at: now, last_seen_at: now },
      { id: uid('con'), name: 'Maria Santos', email: 'maria@example.com', phone: '', country: 'Spain', tags: ['customer'], notes: 'Happy with support.', source: 'chat', chats: 4, created_at: now, last_seen_at: now },
    ],
    agents: [
      { id: uid('ag'), display_name: 'Demo Agent', role: 'admin', online: true, passcode: '3456', created_at: now, last_login_at: now },
      { id: uid('ag'), display_name: 'Layla Haddad', role: 'agent', online: false, passcode: '220131', created_at: now, last_login_at: null },
    ],
    tickets: [
      { id: uid('t'), property_id: propId, subject: 'Refund request #1042', requester_name: 'Jonas Weber', requester_email: 'jonas@example.com', message: 'I was charged twice for the monthly plan.', status: 'new', created_at: now, updated_at: now },
      { id: uid('t'), property_id: propId, subject: 'Feature request: dark widget', requester_name: 'Priya Nair', requester_email: 'priya@example.com', message: 'Would love a dark-mode widget theme.', status: 'open', created_at: now, updated_at: now },
    ],
    articles: [
      { id: uid('kb'), title: 'Installing the widget', slug: 'installing-the-widget', body: 'Paste the embed snippet from Admin → Install before the closing </body> tag of every page.', category: 'Getting started', status: 'published', views: 128, updated_at: now },
      { id: uid('kb'), title: 'Setting up webhooks', slug: 'setting-up-webhooks', body: 'Create an endpoint in Admin → Webhooks, subscribe to events, and verify the X-Brix-Signature header.', category: 'Developers', status: 'published', views: 64, updated_at: now },
    ],
    canned: [
      { id: uid('can'), shortcut: '/greet', title: 'Greeting', body: 'Hi! Thanks for reaching out — how can I help you today?' },
      { id: uid('can'), shortcut: '/pricing', title: 'Pricing info', body: 'Our plans start free forever; paid add-ons are listed on the pricing page.' },
      { id: uid('can'), shortcut: '/offline', title: 'Offline reply', body: 'Thanks for your message! We are currently offline but will reply within one business day.' },
    ],
    webhooks: [
      {
        id: uid('wh'), property_id: propId, url: 'https://example.com/hooks/brix',
        secret: randomHex(24), events: ['chat.started', 'message.created'], enabled: false,
        auto_disable: true, consecutive_failures: 0, created_at: now,
      },
    ],
    deliveries: [],
    apiKeys: [],
    fullKeys: {},
    audit: [
      { id: uid('aud'), actor: 'system', action: 'workspace.seeded', entity: 'workspace', entity_id: 'demo', meta: {}, created_at: now },
    ],
  };
}

function loadAll(): DBMap {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as DBMap;
      if (p && typeof p === 'object') return p;
    }
  } catch {
    /* corrupted — reseed below */
  }
  return {};
}
function saveAll(map: DBMap): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    /* storage full — reads still work */
  }
}

// ---------------------------------------------------------------------------
// Webhook signing (HMAC-SHA256 over the raw body, timestamp-bound)
// ---------------------------------------------------------------------------

export interface SignedPayload {
  headers: Record<string, string>;
  body: string; // JSON string actually sent
  payload: Record<string, unknown>;
}

export async function signWebhook(
  secret: string,
  event: string,
  propertyId: string,
  data: Record<string, unknown>,
): Promise<SignedPayload> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const eventId = uid('evt');
  const payload = { event, property_id: propertyId, timestamp: new Date().toISOString(), data };
  const body = JSON.stringify(payload);
  let signature: string;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
    signature = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    throw new ApiError('signing_unavailable', 'Test-fire needs a secure context (https or localhost) for WebCrypto.', 500);
  }
  return {
    headers: {
      'Content-Type': 'application/json',
      'X-Brix-Event': event,
      'X-Brix-Event-Id': eventId,
      'X-Brix-Timestamp': timestamp,
      'X-Brix-Delivery-Attempt': '1',
      'X-Brix-Signature': signature,
    },
    body,
    payload,
  };
}

// ---------------------------------------------------------------------------
// The API
// ---------------------------------------------------------------------------

export interface ListOpts {
  cursor?: string;
  limit?: number;
}

function paginate<T extends { id: string }>(items: T[], opts: ListOpts): Page<T> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let start = 0;
  if (opts.cursor) {
    const i = items.findIndex((x) => x.id === opts.cursor);
    start = i === -1 ? 0 : i + 1;
  }
  const slice = items.slice(start, start + limit);
  return {
    items: slice,
    next_cursor: start + limit < items.length ? slice[slice.length - 1].id : null,
  };
}

export class BrixApi {
  private workspace: string;
  private actor: string;

  constructor(workspace: string, actor = 'system') {
    this.workspace = workspace;
    this.actor = actor;
  }

  setActor(actor: string): void {
    this.actor = actor;
  }

  private db(): ApiDB {
    const all = loadAll();
    if (!all[this.workspace]) {
      all[this.workspace] = seedDB();
      saveAll(all);
    }
    return all[this.workspace];
  }

  private save(db: ApiDB): void {
    const all = loadAll();
    all[this.workspace] = db;
    saveAll(all);
  }

  private audit(db: ApiDB, action: string, entity: string, entityId = '', meta: Record<string, unknown> = {}): void {
    db.audit.unshift({ id: uid('aud'), actor: this.actor, action, entity, entity_id: entityId, meta, created_at: isoNow() });
    db.audit = db.audit.slice(0, 500);
  }

  private notFound(entity: string, id: string): ApiError {
    return new ApiError('not_found', `${entity} ${id} not found.`, 404);
  }

  // ---- properties ---------------------------------------------------------
  properties = {
    list: async (): Promise<Envelope<ApiProperty[]>> => {
      return { data: this.db().properties };
    },
    get: async (id: string): Promise<Envelope<ApiProperty>> => {
      const p = this.db().properties.find((x) => x.id === id);
      if (!p) throw this.notFound('Property', id);
      return { data: p };
    },
    getByPublicKey: async (publicKey: string): Promise<Envelope<ApiProperty>> => {
      const p = this.db().properties.find((x) => x.public_key === publicKey);
      if (!p) throw new ApiError('not_found', `No property with public key ${publicKey}.`, 404);
      return { data: p };
    },
    create: async (input: { name: string; domain?: string }): Promise<Envelope<ApiProperty>> => {
      if (!input.name.trim()) throw new ApiError('validation', 'Property name is required.', 422);
      const db = this.db();
      const p: ApiProperty = {
        id: uid('prop'), name: input.name.trim(), domain: (input.domain ?? '').trim(),
        public_key: `bx_${randomHex(9)}`, widget_config: defaultWidgetConfig(),
        secure_mode: false, created_at: isoNow(),
      };
      db.properties.unshift(p);
      this.audit(db, 'property.created', 'property', p.id, { name: p.name });
      this.save(db);
      return { data: p };
    },
    update: async (id: string, patch: Partial<Pick<ApiProperty, 'name' | 'domain' | 'secure_mode'>>): Promise<Envelope<ApiProperty>> => {
      const db = this.db();
      const p = db.properties.find((x) => x.id === id);
      if (!p) throw this.notFound('Property', id);
      Object.assign(p, patch);
      this.audit(db, 'property.updated', 'property', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: p };
    },
    regenerateKey: async (id: string): Promise<Envelope<{ public_key: string }>> => {
      const db = this.db();
      const p = db.properties.find((x) => x.id === id);
      if (!p) throw this.notFound('Property', id);
      p.public_key = `bx_${randomHex(9)}`;
      this.audit(db, 'property.key_regenerated', 'property', id, {});
      this.save(db);
      return { data: { public_key: p.public_key } };
    },
    remove: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.properties.some((x) => x.id === id)) throw this.notFound('Property', id);
      db.properties = db.properties.filter((x) => x.id !== id);
      this.audit(db, 'property.deleted', 'property', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
  };

  // ---- widget config -------------------------------------------------------
  widget = {
    getConfig: async (propertyId: string): Promise<Envelope<WidgetConfig>> => {
      const { data: p } = await this.properties.get(propertyId);
      return { data: p.widget_config };
    },
    updateConfig: async (propertyId: string, patch: Partial<WidgetConfig>): Promise<Envelope<WidgetConfig>> => {
      const db = this.db();
      const p = db.properties.find((x) => x.id === propertyId);
      if (!p) throw this.notFound('Property', propertyId);
      p.widget_config = { ...p.widget_config, ...patch };
      this.audit(db, 'widget.updated', 'property', propertyId, patch as Record<string, unknown>);
      this.save(db);
      return { data: p.widget_config };
    },
  };

  // ---- conversations -------------------------------------------------------
  conversations = {
    list: async (opts: { propertyId?: string; status?: ConvStatus; tag?: string; q?: string } & ListOpts = {}): Promise<Envelope<Page<ApiConversation>>> => {
      let items = [...this.db().conversations].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      if (opts.propertyId) items = items.filter((c) => c.property_id === opts.propertyId);
      if (opts.status) items = items.filter((c) => c.status === opts.status);
      if (opts.tag) items = items.filter((c) => c.tags.includes(opts.tag as string));
      if (opts.q) {
        const q = opts.q.toLowerCase();
        items = items.filter((c) => c.visitor_name.toLowerCase().includes(q) || c.messages.some((m) => m.text.toLowerCase().includes(q)));
      }
      return { data: paginate(items, opts) };
    },
    get: async (id: string): Promise<Envelope<ApiConversation>> => {
      const c = this.db().conversations.find((x) => x.id === id);
      if (!c) throw this.notFound('Conversation', id);
      return { data: c };
    },
    startSession: async (propertyId: string, visitor: { name?: string; email?: string; page_url?: string; referrer?: string }): Promise<Envelope<ApiConversation>> => {
      const db = this.db();
      const prop = db.properties.find((x) => x.id === propertyId);
      if (!prop) throw this.notFound('Property', propertyId);
      const now = isoNow();
      const c: ApiConversation = {
        id: uid('conv'), property_id: propertyId,
        visitor_name: visitor.name?.trim() || 'Guest', visitor_email: visitor.email?.trim() || '',
        page_url: visitor.page_url || '', referrer: visitor.referrer || '',
        status: 'open', department: 'Support', agent_id: null, agent_name: null,
        tags: [], notes: [], rating: null, unread: 0, ai_handled: false,
        created_at: now, updated_at: now, closed_at: null,
        messages: [{
          id: uid('msg'), conversation_id: '', sender: 'agent', kind: 'text',
          text: prop.widget_config.greeting, metadata: {}, created_at: now,
        }],
      };
      c.messages.forEach((m) => { m.conversation_id = c.id; });
      db.conversations.unshift(c);
      this.audit(db, 'conversation.started', 'conversation', c.id, { visitor: c.visitor_name });
      this.save(db);
      return { data: c };
    },
    sendMessage: async (id: string, input: { sender: MsgSender; text: string; kind?: MsgKind; metadata?: Record<string, unknown> }): Promise<Envelope<ApiMessage>> => {
      if (!input.text.trim()) throw new ApiError('validation', 'Message text is required.', 422);
      const db = this.db();
      const c = db.conversations.find((x) => x.id === id);
      if (!c) throw this.notFound('Conversation', id);
      const m: ApiMessage = {
        id: uid('msg'), conversation_id: id, sender: input.sender, kind: input.kind ?? 'text',
        text: input.text.trim(), metadata: input.metadata ?? {}, created_at: isoNow(),
      };
      c.messages.push(m);
      c.updated_at = isoNow();
      if (input.sender === 'visitor') c.unread += 1;
      if (c.status !== 'open') { c.status = 'open'; c.closed_at = null; }
      this.save(db);
      return { data: m };
    },
    assign: async (id: string, input: { agent_id?: string | null; department?: string }): Promise<Envelope<ApiConversation>> => {
      const db = this.db();
      const c = db.conversations.find((x) => x.id === id);
      if (!c) throw this.notFound('Conversation', id);
      if (input.agent_id !== undefined) {
        const a = db.agents.find((x) => x.id === input.agent_id);
        c.agent_id = input.agent_id;
        c.agent_name = a ? a.display_name : null;
      }
      if (input.department) c.department = input.department;
      c.updated_at = isoNow();
      this.audit(db, 'conversation.assigned', 'conversation', id, { agent: c.agent_name, department: c.department });
      this.save(db);
      return { data: c };
    },
    setStatus: async (id: string, status: ConvStatus): Promise<Envelope<ApiConversation>> => {
      const db = this.db();
      const c = db.conversations.find((x) => x.id === id);
      if (!c) throw this.notFound('Conversation', id);
      const old = c.status;
      c.status = status;
      c.updated_at = isoNow();
      c.closed_at = status === 'closed' ? isoNow() : null;
      if (status !== 'open') c.unread = 0;
      this.audit(db, 'conversation.status_changed', 'conversation', id, { from: old, to: status });
      this.save(db);
      return { data: c };
    },
    setTags: async (id: string, tags: string[]): Promise<Envelope<ApiConversation>> => {
      const db = this.db();
      const c = db.conversations.find((x) => x.id === id);
      if (!c) throw this.notFound('Conversation', id);
      c.tags = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
      c.updated_at = isoNow();
      this.save(db);
      return { data: c };
    },
    addNote: async (id: string, input: { author: string; text: string }): Promise<Envelope<ConvNote>> => {
      if (!input.text.trim()) throw new ApiError('validation', 'Note text is required.', 422);
      const db = this.db();
      const c = db.conversations.find((x) => x.id === id);
      if (!c) throw this.notFound('Conversation', id);
      const n: ConvNote = { author: input.author, text: input.text.trim(), created_at: isoNow() };
      c.notes.push(n);
      c.updated_at = isoNow();
      this.save(db);
      return { data: n };
    },
    setRating: async (id: string, rating: number): Promise<Envelope<ApiConversation>> => {
      if (rating < 1 || rating > 5) throw new ApiError('validation', 'Rating must be 1–5.', 422);
      const db = this.db();
      const c = db.conversations.find((x) => x.id === id);
      if (!c) throw this.notFound('Conversation', id);
      c.rating = rating;
      c.updated_at = isoNow();
      this.save(db);
      return { data: c };
    },
    markRead: async (id: string): Promise<Envelope<{ unread: number }>> => {
      const db = this.db();
      const c = db.conversations.find((x) => x.id === id);
      if (!c) throw this.notFound('Conversation', id);
      c.unread = 0;
      this.save(db);
      return { data: { unread: 0 } };
    },
  };

  // ---- contacts ------------------------------------------------------------
  contacts = {
    list: async (opts: { q?: string; tag?: string } & ListOpts = {}): Promise<Envelope<Page<ApiContact>>> => {
      let items = [...this.db().contacts].sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at));
      if (opts.q) {
        const q = opts.q.toLowerCase();
        items = items.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
      }
      if (opts.tag) items = items.filter((c) => c.tags.includes(opts.tag as string));
      return { data: paginate(items, opts) };
    },
    get: async (id: string): Promise<Envelope<ApiContact>> => {
      const c = this.db().contacts.find((x) => x.id === id);
      if (!c) throw this.notFound('Contact', id);
      return { data: c };
    },
    create: async (input: { name: string; email?: string; phone?: string; country?: string; tags?: string[]; notes?: string; source?: string }): Promise<Envelope<ApiContact>> => {
      if (!input.name.trim()) throw new ApiError('validation', 'Contact name is required.', 422);
      const db = this.db();
      const now = isoNow();
      const c: ApiContact = {
        id: uid('con'), name: input.name.trim(), email: (input.email ?? '').trim(),
        phone: (input.phone ?? '').trim(), country: (input.country ?? '').trim(),
        tags: input.tags ?? [], notes: input.notes ?? '', source: input.source ?? 'api',
        chats: 0, created_at: now, last_seen_at: now,
      };
      db.contacts.unshift(c);
      this.audit(db, 'contact.created', 'contact', c.id, { name: c.name });
      this.save(db);
      return { data: c };
    },
    update: async (id: string, patch: Partial<Pick<ApiContact, 'name' | 'email' | 'phone' | 'country' | 'tags' | 'notes'>>): Promise<Envelope<ApiContact>> => {
      const db = this.db();
      const c = db.contacts.find((x) => x.id === id);
      if (!c) throw this.notFound('Contact', id);
      Object.assign(c, patch, { last_seen_at: isoNow() });
      this.audit(db, 'contact.updated', 'contact', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: c };
    },
    remove: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.contacts.some((x) => x.id === id)) throw this.notFound('Contact', id);
      db.contacts = db.contacts.filter((x) => x.id !== id);
      this.audit(db, 'contact.deleted', 'contact', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
  };

  // ---- agents / team --------------------------------------------------------
  agents = {
    list: async (): Promise<Envelope<ApiAgent[]>> => {
      return { data: this.db().agents };
    },
    invite: async (input: { display_name: string; role?: TeamRole }): Promise<Envelope<{ agent: ApiAgent; passcode: string }>> => {
      const name = input.display_name.trim();
      if (!name) throw new ApiError('validation', 'Display name is required.', 422);
      const db = this.db();
      if (db.agents.some((a) => a.display_name.toLowerCase() === name.toLowerCase())) {
        throw new ApiError('conflict', 'A team member with that name already exists.', 409);
      }
      const passcode = String(Math.floor(100000 + Math.random() * 900000));
      const a: ApiAgent = {
        id: uid('ag'), display_name: name, role: input.role ?? 'agent', online: false,
        passcode, created_at: isoNow(), last_login_at: null,
      };
      db.agents.push(a);
      this.audit(db, 'agent.invited', 'agent', a.id, { name, role: a.role });
      this.save(db);
      // Local-only: email invites activate with the backend phase; the
      // passcode below is the member's login credential — share it directly.
      return { data: { agent: a, passcode } };
    },
    update: async (id: string, patch: Partial<Pick<ApiAgent, 'role' | 'online' | 'display_name'>>): Promise<Envelope<ApiAgent>> => {
      const db = this.db();
      const a = db.agents.find((x) => x.id === id);
      if (!a) throw this.notFound('Agent', id);
      Object.assign(a, patch);
      this.audit(db, 'agent.updated', 'agent', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: a };
    },
    remove: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.agents.some((x) => x.id === id)) throw this.notFound('Agent', id);
      db.agents = db.agents.filter((x) => x.id !== id);
      this.audit(db, 'agent.removed', 'agent', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
  };

  // ---- tickets --------------------------------------------------------------
  tickets = {
    list: async (opts: { status?: TicketStatus } & ListOpts = {}): Promise<Envelope<Page<ApiTicket>>> => {
      let items = [...this.db().tickets].sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (opts.status) items = items.filter((t) => t.status === opts.status);
      return { data: paginate(items, opts) };
    },
    get: async (id: string): Promise<Envelope<ApiTicket>> => {
      const t = this.db().tickets.find((x) => x.id === id);
      if (!t) throw this.notFound('Ticket', id);
      return { data: t };
    },
    create: async (input: { subject: string; requester_name: string; requester_email?: string; message: string; property_id?: string | null }): Promise<Envelope<ApiTicket>> => {
      if (!input.subject.trim() || !input.message.trim()) throw new ApiError('validation', 'Subject and message are required.', 422);
      const db = this.db();
      const now = isoNow();
      const t: ApiTicket = {
        id: uid('t'), property_id: input.property_id ?? null, subject: input.subject.trim(),
        requester_name: input.requester_name.trim() || 'Guest', requester_email: (input.requester_email ?? '').trim(),
        message: input.message.trim(), status: 'new', created_at: now, updated_at: now,
      };
      db.tickets.unshift(t);
      this.audit(db, 'ticket.created', 'ticket', t.id, { subject: t.subject });
      this.save(db);
      return { data: t };
    },
    setStatus: async (id: string, status: TicketStatus): Promise<Envelope<ApiTicket>> => {
      const db = this.db();
      const t = db.tickets.find((x) => x.id === id);
      if (!t) throw this.notFound('Ticket', id);
      const from = t.status;
      t.status = status;
      t.updated_at = isoNow();
      this.audit(db, 'ticket.status_changed', 'ticket', id, { from, to: status });
      this.save(db);
      return { data: t };
    },
  };

  // ---- knowledge base --------------------------------------------------------
  kb = {
    list: async (opts: { status?: 'draft' | 'published' } & ListOpts = {}): Promise<Envelope<Page<ApiArticle>>> => {
      let items = [...this.db().articles].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      if (opts.status) items = items.filter((a) => a.status === opts.status);
      return { data: paginate(items, opts) };
    },
    search: async (q: string): Promise<Envelope<ApiArticle[]>> => {
      const t = q.trim().toLowerCase();
      if (!t) return { data: [] };
      const items = this.db().articles.filter(
(a) => a.status === 'published' && (a.title.toLowerCase().includes(t) || a.body.toLowerCase().includes(t)),
      );
      return { data: items };
    },
    get: async (id: string): Promise<Envelope<ApiArticle>> => {
      const a = this.db().articles.find((x) => x.id === id);
      if (!a) throw this.notFound('Article', id);
      return { data: a };
    },
    create: async (input: { title: string; body?: string; category?: string; status?: 'draft' | 'published' }): Promise<Envelope<ApiArticle>> => {
      if (!input.title.trim()) throw new ApiError('validation', 'Title is required.', 422);
      const db = this.db();
      const slug = input.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid('kb');
      const a: ApiArticle = {
        id: uid('kb'), title: input.title.trim(), slug, body: input.body ?? '',
        category: input.category ?? 'General', status: input.status ?? 'draft',
        views: 0, updated_at: isoNow(),
      };
      db.articles.unshift(a);
      this.audit(db, 'article.created', 'article', a.id, { title: a.title });
      this.save(db);
      return { data: a };
    },
    update: async (id: string, patch: Partial<Pick<ApiArticle, 'title' | 'body' | 'category' | 'status'>>): Promise<Envelope<ApiArticle>> => {
      const db = this.db();
      const a = db.articles.find((x) => x.id === id);
      if (!a) throw this.notFound('Article', id);
      Object.assign(a, patch, { updated_at: isoNow() });
      this.audit(db, 'article.updated', 'article', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: a };
    },
    remove: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.articles.some((x) => x.id === id)) throw this.notFound('Article', id);
      db.articles = db.articles.filter((x) => x.id !== id);
      this.audit(db, 'article.deleted', 'article', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
  };

  // ---- canned responses -------------------------------------------------------
  canned = {
    list: async (): Promise<Envelope<ApiCanned[]>> => {
      return { data: this.db().canned };
    },
    create: async (input: { shortcut: string; title: string; body: string }): Promise<Envelope<ApiCanned>> => {
      if (!input.title.trim() || !input.body.trim()) throw new ApiError('validation', 'Title and body are required.', 422);
      const db = this.db();
      const c: ApiCanned = { id: uid('can'), shortcut: input.shortcut.trim(), title: input.title.trim(), body: input.body.trim() };
      db.canned.unshift(c);
      this.audit(db, 'canned.created', 'canned', c.id, { title: c.title });
      this.save(db);
      return { data: c };
    },
    update: async (id: string, patch: Partial<Pick<ApiCanned, 'shortcut' | 'title' | 'body'>>): Promise<Envelope<ApiCanned>> => {
      const db = this.db();
      const c = db.canned.find((x) => x.id === id);
      if (!c) throw this.notFound('Canned response', id);
      Object.assign(c, patch);
      this.audit(db, 'canned.updated', 'canned', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: c };
    },
    remove: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.canned.some((x) => x.id === id)) throw this.notFound('Canned response', id);
      db.canned = db.canned.filter((x) => x.id !== id);
      this.audit(db, 'canned.deleted', 'canned', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
  };

  // ---- webhooks ---------------------------------------------------------------
  webhooks = {
    list: async (propertyId?: string): Promise<Envelope<ApiWebhook[]>> => {
      let items = this.db().webhooks;
      if (propertyId) items = items.filter((w) => w.property_id === propertyId);
      return { data: items };
    },
    get: async (id: string): Promise<Envelope<ApiWebhook>> => {
      const w = this.db().webhooks.find((x) => x.id === id);
      if (!w) throw this.notFound('Webhook', id);
      return { data: w };
    },
    create: async (input: { property_id: string; url: string; events: string[]; enabled?: boolean }): Promise<Envelope<{ webhook: ApiWebhook; secret: string }>> => {
      const url = input.url.trim();
      if (!/^https?:\/\/.+\..+/.test(url)) throw new ApiError('validation', 'A valid http(s) URL is required.', 422);
      if (!input.events.length) throw new ApiError('validation', 'Subscribe to at least one event.', 422);
      const db = this.db();
      const secret = randomHex(24);
      const w: ApiWebhook = {
        id: uid('wh'), property_id: input.property_id, url, secret,
        events: [...new Set(input.events)], enabled: input.enabled ?? true,
        auto_disable: true, consecutive_failures: 0, created_at: isoNow(),
      };
      db.webhooks.unshift(w);
      this.audit(db, 'webhook.created', 'webhook', w.id, { url, events: w.events });
      this.save(db);
      // Local-only: the secret is stored in this browser; show it once, then masked.
      return { data: { webhook: w, secret } };
    },
    update: async (id: string, patch: Partial<Pick<ApiWebhook, 'url' | 'events' | 'enabled' | 'auto_disable'>>): Promise<Envelope<ApiWebhook>> => {
      const db = this.db();
      const w = db.webhooks.find((x) => x.id === id);
      if (!w) throw this.notFound('Webhook', id);
      if (patch.url !== undefined) {
        if (!/^https?:\/\/.+\..+/.test(patch.url.trim())) throw new ApiError('validation', 'A valid http(s) URL is required.', 422);
        w.url = patch.url.trim();
      }
      if (patch.events !== undefined) {
        if (!patch.events.length) throw new ApiError('validation', 'Subscribe to at least one event.', 422);
        w.events = [...new Set(patch.events)];
      }
      if (patch.enabled !== undefined) w.enabled = patch.enabled;
      if (patch.auto_disable !== undefined) w.auto_disable = patch.auto_disable;
      this.audit(db, 'webhook.updated', 'webhook', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: w };
    },
    rotateSecret: async (id: string): Promise<Envelope<{ secret: string }>> => {
      const db = this.db();
      const w = db.webhooks.find((x) => x.id === id);
      if (!w) throw this.notFound('Webhook', id);
      const secret = randomHex(24);
      w.secret = secret;
      this.audit(db, 'webhook.secret_rotated', 'webhook', id, {});
      this.save(db);
      return { data: { secret } };
    },
    remove: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.webhooks.some((x) => x.id === id)) throw this.notFound('Webhook', id);
      db.webhooks = db.webhooks.filter((x) => x.id !== id);
      db.deliveries = db.deliveries.filter((x) => x.webhook_id !== id);
      this.audit(db, 'webhook.deleted', 'webhook', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
  };

  // ---- webhook deliveries ------------------------------------------------------
  deliveries = {
    list: async (webhookId: string, opts: ListOpts = {}): Promise<Envelope<Page<ApiDelivery>>> => {
      const items = this.db().deliveries
        .filter((d) => d.webhook_id === webhookId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { data: paginate(items, opts) };
    },
    /** Local-only test fire: builds the exact signed payload that WOULD be
     *  POSTed, and records it in the delivery log as a "test" entry.
     *  Real HTTP delivery activates with the backend phase. */
    testFire: async (webhookId: string, event: string): Promise<Envelope<{ signed: SignedPayload; delivery: ApiDelivery }>> => {
      const db = this.db();
      const w = db.webhooks.find((x) => x.id === webhookId);
      if (!w) throw this.notFound('Webhook', webhookId);
      if (!w.events.includes(event)) throw new ApiError('validation', `Webhook is not subscribed to ${event}.`, 422);
      const sampleData = samplePayload(event);
      const signed = await signWebhook(w.secret, event, w.property_id, sampleData);
      const delivery: ApiDelivery = {
        id: uid('dlv'), webhook_id: webhookId, event, event_id: signed.headers['X-Brix-Event-Id'],
        payload: signed.payload, status: 'test', http_status: null, attempts: 1,
        created_at: isoNow(), note: 'Test fire — payload preview only. Real HTTP delivery activates with the backend phase.',
      };
      db.deliveries.unshift(delivery);
      db.deliveries = db.deliveries.slice(0, 500);
      this.audit(db, 'webhook.test_fired', 'webhook', webhookId, { event });
      this.save(db);
      return { data: { signed, delivery } };
    },
  };

  // ---- api keys ------------------------------------------------------------------
  apiKeys = {
    list: async (): Promise<Envelope<ApiKeyRecord[]>> => {
      return { data: this.db().apiKeys };
    },
    create: async (input: { name: string; scopes: string[] }): Promise<Envelope<{ record: ApiKeyRecord; key: string }>> => {
      if (!input.name.trim()) throw new ApiError('validation', 'Key name is required.', 422);
      if (!input.scopes.length) throw new ApiError('validation', 'Select at least one scope.', 422);
      const db = this.db();
      const raw = `bk_live_${randomHex(24)}`;
      const prefix = raw.slice(0, 14);
      const record: ApiKeyRecord = {
        id: uid('key'), name: input.name.trim(), prefix, key_hash: await sha256Hex(raw),
        scopes: [...new Set(input.scopes)], revoked: false, usage_count: 0,
        last_used_at: null, created_at: isoNow(),
      };
      db.apiKeys.unshift(record);
      db.fullKeys[record.id] = raw; // local-only: retrievable in this browser; UI shows it once
      this.audit(db, 'api_key.created', 'api_key', record.id, { name: record.name, scopes: record.scopes });
      this.save(db);
      return { data: { record, key: raw } };
    },
    revealOnce: async (id: string): Promise<Envelope<{ key: string | null }>> => {
      // Local-only convenience: returns the stored key the first time it is
      // asked for, then forgets it — mirroring "shown once" server behavior.
      const db = this.db();
      const key = db.fullKeys[id] ?? null;
      if (key) {
        delete db.fullKeys[id];
        this.save(db);
      }
      return { data: { key } };
    },
    rotate: async (id: string): Promise<Envelope<{ record: ApiKeyRecord; key: string }>> => {
      const db = this.db();
      const r = db.apiKeys.find((x) => x.id === id);
      if (!r) throw this.notFound('API key', id);
      const raw = `bk_live_${randomHex(24)}`;
      r.prefix = raw.slice(0, 14);
      r.key_hash = await sha256Hex(raw);
      r.revoked = false;
      db.fullKeys[r.id] = raw;
      this.audit(db, 'api_key.rotated', 'api_key', id, { name: r.name });
      this.save(db);
      return { data: { record: r, key: raw } };
    },
    revoke: async (id: string): Promise<Envelope<ApiKeyRecord>> => {
      const db = this.db();
      const r = db.apiKeys.find((x) => x.id === id);
      if (!r) throw this.notFound('API key', id);
      r.revoked = true;
      this.audit(db, 'api_key.revoked', 'api_key', id, { name: r.name });
      this.save(db);
      return { data: r };
    },
    remove: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.apiKeys.some((x) => x.id === id)) throw this.notFound('API key', id);
      db.apiKeys = db.apiKeys.filter((x) => x.id !== id);
      delete db.fullKeys[id];
      this.audit(db, 'api_key.deleted', 'api_key', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
  };

  // ---- metrics ----------------------------------------------------------------------
  metrics = {
    chats: async (opts: { days?: number } = {}): Promise<Envelope<{ date: string; total: number; missed: number }[]>> => {
      const days = Math.min(Math.max(opts.days ?? 14, 1), 90);
      const convs = this.db().conversations;
      const out: { date: string; total: number; missed: number }[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const day = convs.filter((c) => c.created_at.slice(0, 10) === key);
        out.push({ date: key, total: day.length, missed: day.filter((c) => c.status === 'missed').length });
      }
      return { data: out };
    },
    responseTimes: async (): Promise<Envelope<{ avg_first_response_sec: number; p95_first_response_sec: number; samples: number }>> => {
      const samples: number[] = [];
      for (const c of this.db().conversations) {
        const firstVisitor = c.messages.find((m) => m.sender === 'visitor');
        const firstAgent = c.messages.find((m) => m.sender === 'agent' || m.sender === 'ai');
        if (firstVisitor && firstAgent) {
          const s = (new Date(firstAgent.created_at).getTime() - new Date(firstVisitor.created_at).getTime()) / 1000;
          if (s >= 0 && s < 86400) samples.push(s);
        }
      }
      samples.sort((a, b) => a - b);
      const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
      const p95 = samples.length ? samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))] : 0;
      return { data: { avg_first_response_sec: Math.round(avg), p95_first_response_sec: Math.round(p95), samples: samples.length } };
    },
    satisfaction: async (): Promise<Envelope<{ rated: number; distribution: Record<string, number>; csat_pct: number }>> => {
      const rated = this.db().conversations.filter((c) => c.rating != null);
      const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
      rated.forEach((c) => { distribution[String(c.rating)] += 1; });
      const happy = rated.filter((c) => (c.rating ?? 0) >= 4).length;
      return { data: { rated: rated.length, distribution, csat_pct: rated.length ? Math.round((happy / rated.length) * 100) : 0 } };
    },
    tickets: async (): Promise<Envelope<Record<TicketStatus, number>>> => {
      const counts: Record<TicketStatus, number> = { new: 0, open: 0, resolved: 0 };
      this.db().tickets.forEach((t) => { counts[t.status] += 1; });
      return { data: counts };
    },
  };

  // ---- audit ---------------------------------------------------------------------------
  auditLog = {
    list: async (opts: ListOpts = {}): Promise<Envelope<Page<AuditEntry>>> => {
      const items = [...this.db().audit].sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { data: paginate(items, opts) };
    },
  };
}

/** Sample payload bodies used for test fires and docs. */
export function samplePayload(event: string): Record<string, unknown> {
  const conv = {
    id: 'conv_9f3k2m', visitor: { name: 'Ayesha Khan', email: 'ayesha@example.com', country: 'UAE', city: 'Dubai' },
    page_url: 'https://demo.brixchat.com/pricing', status: 'open', department: 'Sales',
  };
  switch (event) {
    case 'chat.started':
      return { conversation: conv };
    case 'chat.ended':
      return { conversation_id: conv.id, duration_sec: 184, message_count: 7, agent: 'Demo Agent' };
    case 'chat.transcript':
      return { conversation_id: conv.id, visitor: conv.visitor, messages: [{ sender: 'visitor', text: 'Hi! Do you offer annual billing?', at: '2026-09-23T14:00:00Z' }] };
    case 'message.created':
      return { message_id: 'msg_1a2b3c', conversation_id: conv.id, sender: 'visitor', text: 'Hi! Do you offer annual billing?' };
    case 'conversation.assigned':
      return { conversation_id: conv.id, assignee: { type: 'agent', name: 'Demo Agent' } };
    case 'conversation.status_changed':
      return { conversation_id: conv.id, old_status: 'open', new_status: 'closed' };
    case 'ticket.created':
      return { ticket: { id: 't_7h2k', subject: 'Refund request #1042', requester: 'Jonas Weber' } };
    case 'ticket.status_changed':
      return { ticket_id: 't_7h2k', old_status: 'new', new_status: 'resolved' };
    case 'contact.created':
    case 'contact.updated':
      return { contact: { id: 'con_4d5e', name: 'Ayesha Khan', email: 'ayesha@example.com' } };
    case 'satisfaction.received':
      return { conversation_id: conv.id, rating: 5 };
    case 'widget.opened':
      return { page_url: 'https://demo.brixchat.com/pricing', visitor: { name: 'Guest' } };
    default:
      return { conversation_id: conv.id };
  }
}

/** Factory: one API instance per workspace (actor = signed-in display name). */
export function getApi(workspace: string, actor = 'system'): BrixApi {
  return new BrixApi(workspace, actor);
}
