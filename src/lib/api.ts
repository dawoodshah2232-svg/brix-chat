// Brix Chat — API layer.
//
// Typed implementation whose method names and shapes mirror the REST catalog
// documented in docs/API.md. Every method is async, returns a { data }
// envelope, and throws ApiError (HTTP-style code/status) on failure.
//
// TRANSPORTS: BrixApi (this file's original class) is the localStorage
// transport — all data lives in this browser. SupabaseBrixApi (bottom of this
// file) implements the SAME repository surface against Supabase/PostgREST.
// getTransport()/getApi() pick Supabase when VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY are set, else local. Method signatures and return
// shapes never change between transports — callers stay unchanged.

import { INTEGRATION_REGISTRY } from './integrations';
import { isSupabaseEnabled } from './supabase-client';

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
export type TeamRole = 'owner' | 'admin' | 'agent' | 'developer' | 'viewer';

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
  priority: TicketPriority;
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
  enabled: boolean; // disabled properties are hidden from widgets/checklists (local flag)
  created_at: string;
}

/** Client workspace record — one per workspace slug ('demo', 'acme', …). */
export interface ApiWorkspace {
  id: string; // slug, e.g. 'demo'
  name: string; // display name, e.g. 'Acme Store'
  slug: string;
  plan: 'trial' | 'growth' | 'scale' | string;
  seats: number;
  status: 'active' | 'suspended' | 'trial';
}

/** Campaign A/B test variant. */
export interface ApiCampaignVariant {
  id: string;
  name: string;
  body: string;
}

/** Per-variant funnel counters. */
export interface ApiVariantStats {
  sends: number;
  replies: number;
  goals: number;
}

export interface ApiCampaign {
  id: string;
  name: string;
  body: string; // control message (variant "A" content source)
  audience: string;
  status: 'draft' | 'scheduled' | 'sent';
  scheduled_at: string | null;
  goal: string;
  variants: ApiCampaignVariant[];
  winner_variant_id: string | null;
  stats: Record<string, ApiVariantStats>; // variant id -> counters
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
  active: boolean; // deactivated members are locked out and excluded from the team list actions
  passcode: string; // local-only: shown once at invite, stored in this browser
  created_at: string;
  last_login_at: string | null;
}

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ApiTicket {
  id: string;
  property_id: string | null;
  subject: string;
  requester_name: string;
  requester_email: string;
  message: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignee_id: string | null;
  sla_due: string | null; // ISO timestamp or null
  conversation_id: string | null;
  tags: string[];
  category_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiArticle {
  id: string;
  title: string;
  slug: string;
  body: string;
  category: string;
  category_id: string | null;
  status: 'draft' | 'published';
  views: number;
  updated_at: string;
}

export interface ApiCanned {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  category_id: string | null;
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
// Phase 2 — new domain types (timestamps are ISO strings, matching this
// file's existing convention; spec §9 shows numbers — see worker report)
// ---------------------------------------------------------------------------

export interface ApiNotification {
  id: string;
  type: 'chat.assigned' | 'ticket.sla' | 'ticket.created' | 'campaign.sent' | 'mention' | 'system' | 'attention';
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface ApiRating {
  id: string;
  property_id: string;
  conversation_id: string | null;
  agent_id: string | null;
  kind: 'csat' | 'nps';
  score: number;
  comment: string;
  created_at: number;
}

export interface ApiDepartment {
  id: string;
  property_id: string;
  name: string;
  description: string;
  agent_ids: string[];
  routing_mode: 'round-robin' | 'least-busy' | 'first-available';
  hours_override: Array<{ day: number; open: string; close: string }> | null;
  offline_behavior: 'ticket' | 'message' | 'hide';
  created_at: number;
}

export interface ApiCategory {
  id: string;
  scope: 'kb' | 'canned' | 'tickets';
  property_id: string;
  name: string;
  color: string;
  created_at: number;
}

export interface ApiSavedView {
  id: string;
  name: string;
  filters: { status?: string; priority?: string; tag?: string; assignee?: string; unreadOnly?: boolean };
  created_at: string;
}

export type PlayStepKind = 'reply' | 'tag' | 'assign' | 'priority' | 'note';
export interface ApiPlayStep { kind: PlayStepKind; value: string; }
export interface ApiPlay {
  id: string;
  name: string;
  steps: ApiPlayStep[];
  created_at: string;
}

export interface ApiGoal {
  id: string;
  name: string;
  event: string;
  revenue: number;
  created_at: string;
}

export interface ApiGoalEvent {
  id: string;
  goal_id: string;
  conversation_id: string | null;
  value: number;
  created_at: string;
}

export interface ApiBlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  tags: string[];
  author: string;
  published: boolean;
  reading_mins: number;
  created_at: string;
  updated_at: string;
}

export interface ApiHelpArticle {
  id: string;
  slug: string;
  title: string;
  body: string;
  category: string;
  order: number;
  updated_at: string;
}

export interface ApiContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface ApiStatusEntry {
  id: string;
  title: string;
  detail: string;
  state: 'operational' | 'degraded' | 'incident';
  created_at: string;
}

export interface ApiMember {
  id: string;
  display_name: string;
  initials: string;
  color: string;
  role: TeamRole;
  passcode: string;
  last_login: string | null;
  status: 'online' | 'away' | 'offline';
  job_title: string;
  avatar_data_url: string | null;
  department_ids: string[];
  created_at: string;
}

export interface ApiUnanswered {
  id: string;
  question: string;
  conversation_id: string | null;
  count: number;
  dismissed: boolean;
  created_at: string;
}

export interface ApiIntegration {
  id: string;
  name: string;
  description: string;
  fields: Array<{ name: string; label: string; secret: boolean }>;
  values: Record<string, string>;
  enabled: boolean;
  phase: 'local' | 'backend';
}

export interface PropertySettings {
  greeting_online: string;
  greeting_away: string;
  greeting_offline: string;
  offline_form_enabled: boolean;
  offline_form_fields: string[];
  prechat_enabled: boolean;
  prechat_fields: string[];
  departments: Array<{ id: string; name: string }>;
  business_hours: Array<{ day: number; open: string; close: string }>;
  timezone: string;
  blocked: string[];
  widget_color: string;
  // Branding (primary styling still comes from widget_color)
  brand_name: string;
  tagline: string;
  logo_data_url: string | null;
  theme: string;
  accent_color: string;
  widget_position: 'bottom-right' | 'bottom-left';
  launcher_style: 'bubble' | 'bar';
  language: string;
  booking_url: string;
}

export interface CopilotSettings {
  tone: 'friendly' | 'professional' | 'concise';
  autosuggest: boolean;
  summarize: boolean;
  translate: boolean;
  sources: string[];
  provider: 'local' | 'openai' | 'anthropic';
}

export interface SecuritySettings {
  session_timeout_mins: number;
  passcode_min_len: number;
  passcode_expiry_days: number;
}

export interface DataSettings {
  retention_days: number;
  auto_purge: boolean;
}

export interface GoalFunnel {
  visitors: number;
  chats: number;
  goals: Array<{ goal: ApiGoal; count: number; revenue: number }>;
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
  { name: 'ticket.sla_breached', description: 'A ticket passed its SLA due time unresolved' },
  { name: 'campaign.sent', description: 'A campaign finished sending' },
  { name: 'goal.completed', description: 'A tracked goal event fired' },
  { name: 'widget.rating', description: 'Visitor rates the widget experience' },
  { name: 'rating.created', description: 'Visitor submits a CSAT or NPS rating' },
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
  workspace: ApiWorkspace;
  properties: ApiProperty[];
  campaigns: ApiCampaign[];
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
  // phase 2
  notifications: ApiNotification[];
  ratings: ApiRating[];
  departments: ApiDepartment[];
  routing_counters: Record<string, number>; // department id -> round-robin counter
  categories: ApiCategory[];
  views: ApiSavedView[];
  plays: ApiPlay[];
  goals: ApiGoal[];
  goalEvents: ApiGoalEvent[];
  blogPosts: ApiBlogPost[];
  helpDocs: ApiHelpArticle[];
  contactMessages: ApiContactMessage[];
  statusEntries: ApiStatusEntry[];
  members: ApiMember[];
  unanswered: ApiUnanswered[];
  integrations: ApiIntegration[];
  propertySettings: Record<string, PropertySettings>;
  copilotSettings: CopilotSettings;
  securitySettings: SecuritySettings;
  dataSettings: DataSettings;
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

// ---------------------------------------------------------------------------
// Phase 2 seeds
// ---------------------------------------------------------------------------

function memberInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function seedMembers(): ApiMember[] {
  const now = isoNow();
  return [
    { id: uid('mem'), display_name: 'Demo Agent', initials: 'DA', color: '#4f46e5', role: 'admin', passcode: '3456', last_login: now, status: 'online', job_title: 'Support Lead', avatar_data_url: null, department_ids: [], created_at: now },
    { id: uid('mem'), display_name: 'Sara', initials: 'S', color: '#0891b2', role: 'agent', passcode: '1111', last_login: null, status: 'offline', job_title: '', avatar_data_url: null, department_ids: [], created_at: now },
    { id: uid('mem'), display_name: 'Omar', initials: 'O', color: '#f59e0b', role: 'viewer', passcode: '2222', last_login: null, status: 'offline', job_title: '', avatar_data_url: null, department_ids: [], created_at: now },
  ];
}

/** Demo departments for the demo property; agent_ids reference member ids. */
function seedDepartments(propId: string, members: ApiMember[]): ApiDepartment[] {
  const now = Date.now();
  const lead = members[0]?.id ?? '';
  const agentIds = lead ? [lead] : [];
  const defs: Array<[string, string, ApiDepartment['routing_mode'], ApiDepartment['offline_behavior']]> = [
    ['Sales', 'Pricing, plans and demos.', 'round-robin', 'ticket'],
    ['Support', 'Product help and troubleshooting.', 'least-busy', 'message'],
    ['Billing', 'Invoices, refunds and payments.', 'first-available', 'ticket'],
  ];
  return defs.map(([name, description, routing_mode, offline_behavior]) => ({
    id: uid('dep'), property_id: propId, name, description, agent_ids: agentIds,
    routing_mode, hours_override: null, offline_behavior, created_at: now,
  }));
}

function defaultPropertySettings(): PropertySettings {
  return {
    greeting_online: 'Hi there! How can we help you today?',
    greeting_away: 'We stepped away for a moment — leave a message and we will be right back.',
    greeting_offline: 'We are offline right now — leave a message and we will reply soon.',
    offline_form_enabled: true,
    offline_form_fields: ['name', 'email', 'message'],
    prechat_enabled: false,
    prechat_fields: ['name', 'email'],
    departments: [
      { id: 'sales', name: 'Sales' },
      { id: 'support', name: 'Support' },
      { id: 'billing', name: 'Billing' },
    ],
    business_hours: [
      { day: 1, open: '09:00', close: '18:00' },
      { day: 2, open: '09:00', close: '18:00' },
      { day: 3, open: '09:00', close: '18:00' },
      { day: 4, open: '09:00', close: '18:00' },
      { day: 5, open: '09:00', close: '18:00' },
    ],
    timezone: 'Asia/Dubai',
    blocked: [],
    widget_color: '#4f46e5',
    brand_name: 'Brix Chat',
    tagline: 'Chat with us — we reply fast.',
    logo_data_url: null,
    theme: 'light',
    accent_color: '#4f46e5',
    widget_position: 'bottom-right',
    launcher_style: 'bubble',
    language: 'en',
    booking_url: '',
  };
}

function seedIntegrations(): ApiIntegration[] {
  return INTEGRATION_REGISTRY.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    fields: r.keyFields.map((f) => ({ name: f.name, label: f.label, secret: f.secret })),
    values: {},
    enabled: r.enabled,
    phase: r.status,
  }));
}

function seedStatusEntries(): ApiStatusEntry[] {
  const now = isoNow();
  return [
    { id: uid('st'), title: 'All systems operational', detail: 'Chat, tickets and automations are running normally.', state: 'operational', created_at: now },
  ];
}

function seedGoals(): ApiGoal[] {
  const now = isoNow();
  return [
    { id: uid('goal'), name: 'Checkout completed', event: 'purchase', revenue: 99, created_at: now },
    { id: uid('goal'), name: 'Trial signup', event: 'signup', revenue: 0, created_at: now },
  ];
}

function seedPlays(): ApiPlay[] {
  const now = isoNow();
  return [
    {
      id: uid('play'), name: 'Qualify + route sales', created_at: now,
      steps: [
        { kind: 'reply', value: 'Thanks for reaching out! To point you at the right person — are you evaluating for a team or just yourself?' },
        { kind: 'tag', value: 'qualified' },
        { kind: 'assign', value: 'Sales' },
        { kind: 'priority', value: 'high' },
        { kind: 'note', value: 'Qualified via play: sent intro question, routed to Sales.' },
      ],
    },
    {
      id: uid('play'), name: 'VIP fast-track', created_at: now,
      steps: [
        { kind: 'priority', value: 'urgent' },
        { kind: 'tag', value: 'vip' },
        { kind: 'reply', value: 'You are on our priority list — a senior agent is joining this chat right now.' },
      ],
    },
  ];
}

function seedUnanswered(): ApiUnanswered[] {
  const now = isoNow();
  return [
    { id: uid('unq'), question: 'Do you offer SSO / SAML login on the free plan?', conversation_id: null, count: 3, dismissed: false, created_at: now },
    { id: uid('unq'), question: 'Can the widget be hidden on the checkout page?', conversation_id: null, count: 2, dismissed: false, created_at: now },
  ];
}

/** Demo CSAT + NPS ratings for the demo property (numeric created_at timestamps). */
function seedRatings(propId: string, convs: ApiConversation[], agents: ApiAgent[]): ApiRating[] {
  const DAY = 86400000;
  const base = Date.now();
  const rows: Array<[number, 'csat' | 'nps', number, string, number, number | null]> = [
    // [daysAgo, kind, score, comment, convIdx (-1 = none), agentIdx (null = none)]
    [1, 'csat', 5, 'Super helpful, solved in minutes!', 2, 0],
    [2, 'nps', 9, 'Great product, telling my team.', -1, null],
    [4, 'csat', 4, '', 2, 0],
    [6, 'nps', 10, '', -1, null],
    [8, 'csat', 5, 'Fast and friendly.', 0, 0],
    [11, 'csat', 2, 'Waited too long for a reply.', 1, null],
    [14, 'nps', 6, 'Good but onboarding was confusing.', -1, null],
    [18, 'csat', 5, '', 2, 1],
    [23, 'nps', 8, '', -1, null],
    [29, 'csat', 3, 'Okay, but took a while.', 0, 0],
  ];
  return rows.map(([daysAgo, kind, score, comment, convIdx, agentIdx], i) => ({
    id: uid('rt'),
    property_id: propId,
    conversation_id: convIdx >= 0 && convs[convIdx] ? convs[convIdx].id : null,
    agent_id: agentIdx !== null && agents[agentIdx] ? agents[agentIdx].id : null,
    kind,
    score,
    comment,
    created_at: Math.floor(base - daysAgo * DAY - ((i * 7) % 12) * 3600000),
  }));
}

function seedBlogPosts(): ApiBlogPost[] {
  const now = isoNow();
  const posts: Array<[string, string, string, string, string[], string, number]> = [
    ['why-visitors-leave-without-asking', 'Why visitors leave without asking: the 30-second support gap',
      'Most visitors decide within half a minute whether asking for help is worth it. Here is how to close that gap.',
      'A visitor lands on your pricing page with one question. They look for a way to ask, do not see it in five seconds, and bounce to a competitor whose chat bubble is already open.\n\nThe gap is not about staffing — it is about visibility. A chat launcher that appears after a short delay, plus one well-timed proactive nudge at 30–45 seconds on high-intent pages, catches the visitors who would otherwise leave silently.\n\nMeasure it: count chats started per 100 pricing-page visits before and after adding the nudge. Teams that do this usually see the number double.',
      ['strategy', 'conversion'], 'Brix Team', 4],
    ['pre-chat-forms-3-fields', 'Pre-chat forms: the 3 fields that qualify and the 5 that kill conversion',
      'Name, email and the question itself are all you need. Everything else costs you chats.',
      'A pre-chat form exists for one reason: to route the conversation well. Name and email let you follow up; the question (or topic picker) lets you route.\n\nThe five that kill conversion: phone number, company size, job title, budget range, and "how did you hear about us". Each extra field measurably lowers the chance a visitor starts a chat.\n\nRule of thumb: if a field does not change what the agent does in the first 30 seconds, collect it later in the conversation.',
      ['conversion', 'playbooks'], 'Brix Team', 5],
    ['canned-responses-that-dont-sound-canned', 'Canned responses that don’t sound canned',
      'Variables, one editable sentence, and a human review turn templates into conversations.',
      'The trick is structure, not wording. Start every canned reply with the visitor’s name via a variable, keep the middle sentence fixed, and end with one open question the agent personalizes.\n\nExample: "Hi {{visitor}}! I checked your order — it shipped this morning and arrives Thursday. Want me to text you the tracking link?"\n\nAudit your canned library monthly. Any reply agents consistently edit before sending is a reply that needs rewriting.',
      ['team', 'playbooks'], 'Brix Team', 4],
    ['chat-to-ticket-handoff', 'From chat to ticket: a clean handoff playbook',
      'When a chat cannot be solved live, the handoff to a ticket should carry the full context with it.',
      'Bad handoff: "I have created a ticket, someone will email you." Good handoff: a ticket created from the chat, carrying the transcript, the visitor’s details, a priority, and an SLA the visitor can see.\n\nThree rules: create the ticket while the visitor is still there, tell them the expected first-update time, and assign an owner — unowned tickets rot.\n\nIn Brix Chat, one click converts a chat into a ticket with the transcript attached and the SLA timer already running.',
      ['tickets', 'playbooks'], 'Brix Team', 6],
    ['csat-lagging-indicator', 'CSAT is a lagging indicator — measure first response instead',
      'By the time CSAT drops, the damage is done. First-response time tells you trouble is coming.',
      'CSAT measures how a conversation ended, days or hours after the moment that mattered. First-response time measures the moment itself: the seconds between a visitor’s first message and a human (or bot) reply.\n\nSet a target — say 60 seconds — and watch the percentage of chats answered inside it. When that number slips, CSAT will follow within a week. Fix staffing or add an auto-reply before the scores move.\n\nTrack both, but manage to first response.',
      ['analytics', 'metrics'], 'Brix Team', 4],
    ['proactive-chat-without-creepy', 'Proactive chat without being creepy: timing rules that work',
      'One nudge per visit, after real engagement, on a page that signals intent.',
      'The creepiness line is simple: did the visitor do something first? Page viewed, scrolled, added to cart, lingered — those are invitations. A bubble that opens on page load is an interruption.\n\nWorking defaults: pricing page, 45+ seconds on page → "Questions about plans? I can compare them for you." Cart over $100, idle 60 seconds → checkout help. Once per visit, always dismissible.\n\nTest one rule at a time for a week. If the reply rate is under 5%, the timing or the copy is wrong — not the channel.',
      ['proactive', 'conversion'], 'Brix Team', 5],
    ['unanswered-questions-log', 'The unanswered-questions log: turning misses into help articles',
      'Every question your team could not answer is a help article waiting to be written.',
      'Support teams lose the same knowledge twice: first when an agent cannot answer, then when nobody records what was asked.\n\nThe fix is a log. Every unanswered question gets recorded with a count of how often it appears. Once a question hits three occurrences, it graduates into a draft help article.\n\nTeams that run this loop for a quarter cut repeat questions by a third — because the articles start answering before the chat starts.',
      ['knowledge', 'process'], 'Brix Team', 4],
    ['local-first-support-software', 'Local-first support software: what stays in your browser and why',
      'Your conversations live in your browser — not on a server you cannot see.',
      'Most support tools upload every conversation to their cloud the moment it happens. Local-first software flips that: your workspace data lives in your browser’s storage, and nothing leaves the device until you choose to connect a backend.\n\nWhat that means in practice: no account can leak your chats in a breach, demos work offline, and you can export or wipe everything with one click.\n\nThe trade-off is honest: one browser, one dataset, no cross-device sync — until the backend phase arrives and you flip the switch yourself.',
      ['product', 'privacy'], 'Brix Team', 5],
  ];
  return posts.map(([slug, title, excerpt, body, tags, author, reading_mins]) => ({
    id: uid('post'), slug, title, excerpt, body, tags, author, published: true, reading_mins,
    created_at: now, updated_at: now,
  }));
}

function seedHelpDocs(): ApiHelpArticle[] {
  const now = isoNow();
  const docs: Array<[string, string, string, string, number]> = [
    ['create-workspace', 'Create your workspace', 'Signup takes under a minute: pick a workspace name, choose a display name, and set a passcode. That passcode is your login — share individual passcodes with teammates from the team settings.', 'Getting started', 1],
    ['install-widget', 'Install the widget', 'Copy the embed snippet from Settings → Embed code and paste it before the closing </body> tag of your site. The chat bubble appears immediately; no build step needed.', 'Getting started', 2],
    ['invite-team', 'Invite your team', 'Go to Settings → Team, add a member name, and share their passcode. Roles control what each person can see: admin, agent, developer, or viewer.', 'Getting started', 3],
    ['first-chat', 'Handle your first chat', 'Open the Inbox, pick an open conversation, and reply in the composer. Use canned responses (type /) for common answers, add internal notes, and resolve the chat when done.', 'Getting started', 4],
    ['pre-chat-form', 'Set up the pre-chat form', 'Property settings → Pre-chat lets you ask for name and email before the chat starts. Keep it to three fields or fewer — every extra field lowers the number of chats started.', 'How-to', 5],
    ['triggers', 'Build a trigger', 'Triggers → New rule: pick an event (chat started, message received…), add condition groups with AND/OR, then attach actions like send message, assign, or tag. Use Test run to simulate before enabling.', 'How-to', 6],
    ['campaigns', 'Schedule a campaign', 'Campaigns → New campaign: write the message, add audience rules (page URL, new vs returning, tags), pick a goal to track, and schedule it for later or send now.', 'How-to', 7],
    ['tickets', 'Work with tickets', 'Tickets are created from the offline form, missed chats, or one click from any chat. Set priority, assign an owner, and watch the SLA timer — overdue tickets highlight in red.', 'How-to', 8],
    ['webhooks', 'Connect webhooks', 'Developers → Webhooks: add your endpoint URL, subscribe to events, and test-fire a signed sample payload before going live.', 'How-to', 9],
    ['api-keys', 'Create API keys', 'Developers → API keys: create a key with only the scopes it needs. The full key is shown once — store it somewhere safe.', 'How-to', 10],
    ['canned-variables', 'Use variables in canned replies', 'In any canned response, use {{visitor}} for the visitor’s name, {{agent}} for yours, {{date}} for today, and {{property}} for the site name. They are replaced when the reply is inserted.', 'How-to', 11],
    ['keyboard-shortcuts', 'Keyboard shortcuts', 'Press ? anywhere in the dashboard to see every shortcut. Essentials: J/K move between conversations, R focuses the reply box, / jumps to search.', 'How-to', 12],
  ];
  return docs.map(([slug, title, body, category, order]) => ({
    id: uid('help'), slug, title, body, category, order, updated_at: now,
  }));
}

function seedDB(): ApiDB {
  const now = isoNow();
  const propId = uid('prop');
  const convs: ApiConversation[] = [
    {
      id: uid('conv'), property_id: propId, visitor_name: 'Ayesha Khan', visitor_email: 'ayesha@example.com',
      page_url: '/pricing', referrer: 'https://google.com', status: 'open', department: 'Sales',
      agent_id: null, agent_name: null, tags: ['pricing'], priority: 'medium', notes: [], rating: null, unread: 2,
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
      agent_id: null, agent_name: null, tags: ['integration'], priority: 'low', notes: [], rating: null, unread: 1,
      ai_handled: true, created_at: now, updated_at: now, closed_at: null,
      messages: [
        { id: uid('msg'), conversation_id: '', sender: 'visitor', kind: 'text', text: 'How do I add the widget to WordPress?', metadata: {}, created_at: now },
        { id: uid('msg'), conversation_id: '', sender: 'ai', kind: 'text', text: 'Paste the embed snippet before the closing body tag, or use our one-click installer from the Install tab.', metadata: {}, created_at: now },
      ],
    },
    {
      id: uid('conv'), property_id: propId, visitor_name: 'Maria Santos', visitor_email: 'maria@example.com',
      page_url: '/', referrer: '', status: 'closed', department: 'Support',
      agent_id: null, agent_name: 'Demo Agent', tags: [], priority: 'medium', notes: [], rating: 5, unread: 0,
      ai_handled: false, created_at: now, updated_at: now, closed_at: now,
      messages: [
        { id: uid('msg'), conversation_id: '', sender: 'visitor', kind: 'text', text: 'Thanks, that solved it!', metadata: {}, created_at: now },
        { id: uid('msg'), conversation_id: '', sender: 'agent', kind: 'text', text: 'Happy to help. Have a great day!', metadata: {}, created_at: now },
      ],
    },
  ];
  convs.forEach((c) => c.messages.forEach((m) => { m.conversation_id = c.id; }));
  const members = seedMembers();
  const departments = seedDepartments(propId, members);
  if (members[0]) members[0].department_ids = departments.map((d) => d.id);
  const agents: ApiAgent[] = [
    { id: uid('ag'), display_name: 'Demo Agent', role: 'admin', online: true, active: true, passcode: '3456', created_at: now, last_login_at: now },
    { id: uid('ag'), display_name: 'Layla Haddad', role: 'agent', online: false, active: true, passcode: '220131', created_at: now, last_login_at: null },
  ];

  return {
    workspace: { id: 'demo', name: 'Demo', slug: 'demo', plan: 'scale', seats: 25, status: 'active' },
    properties: [
      {
        id: propId, name: 'Demo Store', domain: 'demo.brixchat.com', public_key: 'bx_demo_7f3a9c1e',
        widget_config: defaultWidgetConfig(), secure_mode: false, enabled: true, created_at: now,
      },
    ],
    campaigns: [],
    conversations: convs,
    contacts: [
      { id: uid('con'), name: 'Ayesha Khan', email: 'ayesha@example.com', phone: '', country: 'UAE', tags: ['lead'], notes: 'Asked about annual billing.', source: 'chat', chats: 2, created_at: now, last_seen_at: now },
      { id: uid('con'), name: 'Omar Farouk', email: '', phone: '', country: 'Egypt', tags: ['support'], notes: '', source: 'chat', chats: 1, created_at: now, last_seen_at: now },
      { id: uid('con'), name: 'Maria Santos', email: 'maria@example.com', phone: '', country: 'Spain', tags: ['customer'], notes: 'Happy with support.', source: 'chat', chats: 4, created_at: now, last_seen_at: now },
    ],
    agents,
    ratings: seedRatings(propId, convs, agents),
    departments,
    routing_counters: {},
    categories: [],
    tickets: [
      { id: uid('t'), property_id: propId, subject: 'Refund request #1042', requester_name: 'Jonas Weber', requester_email: 'jonas@example.com', message: 'I was charged twice for the monthly plan.', status: 'new', priority: 'high', assignee_id: null, sla_due: new Date(Date.now() + 20 * 3600000).toISOString(), conversation_id: null, tags: ['billing'], category_id: null, created_at: now, updated_at: now },
      { id: uid('t'), property_id: propId, subject: 'Feature request: dark widget', requester_name: 'Priya Nair', requester_email: 'priya@example.com', message: 'Would love a dark-mode widget theme.', status: 'open', priority: 'low', assignee_id: null, sla_due: null, conversation_id: null, tags: ['feature'], category_id: null, created_at: now, updated_at: now },
    ],
    articles: [
      { id: uid('kb'), title: 'Installing the widget', slug: 'installing-the-widget', body: 'Paste the embed snippet from Admin → Install before the closing </body> tag of every page.', category: 'Getting started', category_id: null, status: 'published', views: 128, updated_at: now },
      { id: uid('kb'), title: 'Setting up webhooks', slug: 'setting-up-webhooks', body: 'Create an endpoint in Admin → Webhooks, subscribe to events, and verify the X-Brix-Signature header.', category: 'Developers', category_id: null, status: 'published', views: 64, updated_at: now },
    ],
    canned: [
      { id: uid('can'), shortcut: '/greet', title: 'Greeting', body: 'Hi! Thanks for reaching out — how can I help you today?', category_id: null },
      { id: uid('can'), shortcut: '/pricing', title: 'Pricing info', body: 'Our plans start free forever; paid add-ons are listed on the pricing page.', category_id: null },
      { id: uid('can'), shortcut: '/offline', title: 'Offline reply', body: 'Thanks for your message! We are currently offline but will reply within one business day.', category_id: null },
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
    notifications: [],
    views: [],
    plays: seedPlays(),
    goals: seedGoals(),
    goalEvents: [],
    blogPosts: seedBlogPosts(),
    helpDocs: seedHelpDocs(),
    contactMessages: [],
    statusEntries: seedStatusEntries(),
    members,
    unanswered: seedUnanswered(),
    integrations: seedIntegrations(),
    propertySettings: { [propId]: defaultPropertySettings() },
    copilotSettings: { tone: 'friendly', autosuggest: true, summarize: true, translate: false, sources: ['knowledge-base'], provider: 'local' },
    securitySettings: { session_timeout_mins: 480, passcode_min_len: 4, passcode_expiry_days: 90 },
    dataSettings: { retention_days: 365, auto_purge: false },
  };
}

/** Workspace record for a slug. */
function defaultWorkspace(slug: string): ApiWorkspace {
  return {
    id: slug,
    name: slug === 'demo' ? 'Demo' : slug.charAt(0).toUpperCase() + slug.slice(1),
    slug,
    plan: slug === 'demo' ? 'scale' : 'trial',
    seats: slug === 'demo' ? 25 : 5,
    status: slug === 'demo' ? 'active' : 'trial',
  };
}

/** Seed a workspace db, with per-slug demo content for 'demo' (platform) and 'acme' (client). */
function seedWorkspace(slug: string): ApiDB {
  const db = seedDB();
  db.workspace = defaultWorkspace(slug);
  if (slug === 'demo') {
    // Platform workspace: the primary member is the platform owner.
    const owner = db.members[0];
    if (owner) {
      owner.role = 'owner';
      owner.job_title = 'Platform Owner';
    }
    return db;
  }
  if (slug === 'acme') {
    const now = isoNow();
    db.workspace = { id: 'acme', name: 'Acme Store', slug: 'acme', plan: 'growth', seats: 10, status: 'active' };
    const propId = 'bx_acme_9d2b4f8a';
    db.properties = [{
      id: propId, name: 'Acme Store', domain: 'acme-store.example', public_key: 'bx_pk_acme_9d2b4f8a',
      widget_config: defaultWidgetConfig(), secure_mode: false, enabled: true, created_at: now,
    }];
    db.propertySettings[propId] = {
      ...defaultPropertySettings(),
      brand_name: 'Acme Store',
      tagline: 'Quality gear, shipped fast.',
      widget_color: '#0d9488',
      accent_color: '#14b8a6',
      theme: 'teal',
    };
    const ava: ApiMember = {
      id: uid('mem'), display_name: 'Ava Client', initials: 'AC', color: '#0d9488', role: 'admin',
      passcode: '7890', last_login: null, status: 'offline', job_title: 'Store Owner',
      avatar_data_url: null, department_ids: [], created_at: now,
    };
    const ben: ApiMember = {
      id: uid('mem'), display_name: 'Ben Agent', initials: 'BA', color: '#4f46e5', role: 'agent',
      passcode: '2468', last_login: null, status: 'offline', job_title: 'Support Agent',
      avatar_data_url: null, department_ids: [], created_at: now,
    };
    db.members = [ava, ben];
    const mkMsgs = (list: Array<[string, string]>): ApiConversation['messages'] =>
      list.map(([sender, text]) => ({
        id: uid('msg'), conversation_id: '', sender: sender as 'visitor' | 'agent',
        kind: 'text', text, metadata: {}, created_at: now,
      }));
    const convs: ApiConversation[] = [
      {
        id: uid('conv'), property_id: propId, visitor_name: 'Lena Meyer', visitor_email: 'lena@example.com',
        page_url: '/products/trail-pack', referrer: 'https://google.com', status: 'open', department: 'Support',
        agent_id: ben.id, agent_name: 'Ben Agent', tags: ['shipping'], priority: 'medium', notes: [],
        rating: null, unread: 1, ai_handled: false, created_at: now, updated_at: now, closed_at: null,
        messages: mkMsgs([
          ['visitor', 'Hi! When will my trail pack ship?'],
          ['agent', 'Hi Lena! It ships within 24 hours — tracking lands in your inbox once the courier scans it.'],
          ['visitor', 'Great, thanks!'],
        ]),
      },
      {
        id: uid('conv'), property_id: propId, visitor_name: 'Ravi Patel', visitor_email: 'ravi@example.com',
        page_url: '/checkout', referrer: '', status: 'open', department: 'Sales',
        agent_id: null, agent_name: null, tags: ['pricing'], priority: 'high', notes: [],
        rating: null, unread: 2, ai_handled: false, created_at: now, updated_at: now, closed_at: null,
        messages: mkMsgs([
          ['visitor', 'This is the third time I am asking — my discount code still does not work!!'],
          ['visitor', 'Nobody is answering. This is ridiculous.'],
        ]),
      },
      {
        id: uid('conv'), property_id: propId, visitor_name: 'Sofia Rossi', visitor_email: 'sofia@example.com',
        page_url: '/products/camp-stove', referrer: '', status: 'closed', department: 'Sales',
        agent_id: ava.id, agent_name: 'Ava Client', tags: [], priority: 'low', notes: [],
        rating: 5, unread: 0, ai_handled: false, created_at: now, updated_at: now, closed_at: now,
        messages: mkMsgs([
          ['visitor', 'Does the camp stove work with standard gas canisters?'],
          ['agent', 'Yes — it fits all standard screw-top canisters. Happy camping!'],
          ['visitor', 'Perfect, ordering now. Thank you!'],
        ]),
      },
      {
        id: uid('conv'), property_id: propId, visitor_name: 'Tom Becker', visitor_email: 'tom@example.com',
        page_url: '/returns', referrer: '', status: 'open', department: 'Support',
        agent_id: ben.id, agent_name: 'Ben Agent', tags: ['returns'], priority: 'medium', notes: [],
        rating: null, unread: 0, ai_handled: false, created_at: now, updated_at: now, closed_at: null,
        messages: mkMsgs([
          ['visitor', 'Hi, I need to return a jacket — wrong size.'],
          ['agent', 'No problem, Tom. I started a return for you — the label is on its way to your email.'],
        ]),
      },
    ];
    convs.forEach((c) => c.messages.forEach((m) => { m.conversation_id = c.id; }));
    db.conversations = convs;
    db.tickets = [
      {
        id: uid('t'), property_id: propId, subject: 'Order #4821 arrived damaged', requester_name: 'Lena Meyer',
        requester_email: 'lena@example.com', message: 'The trail pack arrived with a torn strap. Please advise.',
        status: 'new', priority: 'high', assignee_id: ben.id,
        sla_due: new Date(Date.now() + 4 * 3600000).toISOString(), conversation_id: null,
        tags: ['shipping'], category_id: null, created_at: now, updated_at: now,
      },
      {
        id: uid('t'), property_id: propId, subject: 'Discount code not applying', requester_name: 'Ravi Patel',
        requester_email: 'ravi@example.com', message: 'WELCOME10 is rejected at checkout.',
        status: 'open', priority: 'medium', assignee_id: null, sla_due: null, conversation_id: null,
        tags: ['billing'], category_id: null, created_at: now, updated_at: now,
      },
    ];
    db.contacts = [
      { id: uid('con'), name: 'Lena Meyer', email: 'lena@example.com', phone: '', country: 'Germany', tags: ['customer'], notes: 'Trail pack buyer.', source: 'chat', chats: 2, created_at: now, last_seen_at: now },
      { id: uid('con'), name: 'Ravi Patel', email: 'ravi@example.com', phone: '', country: 'India', tags: ['lead'], notes: 'Discount issue at checkout.', source: 'chat', chats: 1, created_at: now, last_seen_at: now },
      { id: uid('con'), name: 'Sofia Rossi', email: 'sofia@example.com', phone: '', country: 'Italy', tags: ['customer'], notes: 'Happy with support.', source: 'chat', chats: 3, created_at: now, last_seen_at: now },
    ];
    db.canned = [
      { id: uid('can'), shortcut: 'ship', title: 'Shipping times', body: 'Orders ship within 24 hours and tracking appears in your account once the courier scans the parcel.', category_id: null },
      { id: uid('can'), shortcut: 'return', title: 'Start a return', body: 'I can start a return for you right away — the prepaid label will land in your inbox within a few minutes.', category_id: null },
      { id: uid('can'), shortcut: 'discount', title: 'Discount help', body: 'Sorry about that! Discount codes apply to full-price items only and cannot be combined. Want me to check your code manually?', category_id: null },
      { id: uid('can'), shortcut: 'thanks', title: 'Warm close', body: 'You are very welcome! If anything else comes up, just ping us here.', category_id: null },
    ];
    db.helpDocs = [
      { id: uid('kb'), slug: 'shipping-info', title: 'Shipping information', body: 'Orders placed before 2pm Gulf time ship the same day. Delivery takes 2–4 business days across the UAE and 5–8 days internationally. Tracking is emailed once the courier scans your parcel.', category: 'Orders', order: 1, updated_at: now },
      { id: uid('kb'), slug: 'returns', title: 'Returns & exchanges', body: 'You have 30 days to return unused items in original packaging. Start a return from your account page or ask us in chat and we will email a prepaid label.', category: 'Orders', order: 2, updated_at: now },
      { id: uid('kb'), slug: 'discount-codes', title: 'Using discount codes', body: 'Enter your code at checkout before paying. Codes apply to full-price items, one code per order, and cannot be combined with other promotions.', category: 'Billing', order: 3, updated_at: now },
    ];
    db.campaigns = [
      {
        id: uid('cmp'), name: 'Spring gear launch', body: 'New trail collection is live — early birds get 15% off this week.',
        audience: 'all visitors', status: 'draft', scheduled_at: null, goal: 'purchase',
        variants: [], winner_variant_id: null, stats: {}, created_at: now,
      },
    ];
    db.ratings = [
      { id: uid('rt'), property_id: propId, conversation_id: convs[2]?.id ?? null, agent_id: ava.id, kind: 'csat', score: 5, comment: 'Quick and friendly!', created_at: Date.now() - 86400000 },
      { id: uid('rt'), property_id: propId, conversation_id: convs[0]?.id ?? null, agent_id: ben.id, kind: 'csat', score: 4, comment: 'Helpful.', created_at: Date.now() - 43200000 },
    ];
    return db;
  }
  return db;
}

/** Backfill phase-2 collections into workspaces seeded before phase 2. Idempotent. */
function ensureDefaults(db: ApiDB, slug = 'demo'): void {
  const seeded = seedWorkspace(slug);
  (Object.keys(seeded) as Array<keyof ApiDB>).forEach((k) => {
    if (db[k] === undefined || db[k] === null) {
      (db as unknown as Record<string, unknown>)[k] = seeded[k];
    }
  });
  if (!db.workspace) db.workspace = defaultWorkspace(slug);
  if (db.members.length === 0) db.members = seedMembers();
  if (db.integrations.length === 0) db.integrations = seedIntegrations();
  db.conversations.forEach((c) => { if (!c.priority) c.priority = 'medium'; });
  db.tickets.forEach((t) => {
    if (!t.priority) t.priority = 'medium';
    if (t.assignee_id === undefined) t.assignee_id = null;
    if (t.sla_due === undefined) t.sla_due = null;
    if (t.conversation_id === undefined) t.conversation_id = null;
    if (!t.tags) t.tags = [];
    if (t.category_id === undefined) t.category_id = null;
  });
  db.members.forEach((m) => {
    if (m.job_title === undefined) m.job_title = '';
    if (m.avatar_data_url === undefined) m.avatar_data_url = null;
    if (m.department_ids === undefined) m.department_ids = [];
  });
  db.articles.forEach((a) => { if (a.category_id === undefined) a.category_id = null; });
  db.canned.forEach((c) => { if (c.category_id === undefined) c.category_id = null; });
  if (!db.routing_counters) db.routing_counters = {};
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
  protected workspace: string;
  protected actor: string;

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
      all[this.workspace] = seedWorkspace(this.workspace);
    } else {
      ensureDefaults(all[this.workspace], this.workspace);
    }
    saveAll(all);
    return all[this.workspace];
  }

  private save(db: ApiDB): void {
    const all = loadAll();
    all[this.workspace] = db;
    saveAll(all);
  }

  private logAudit(db: ApiDB, action: string, entity: string, entityId = '', meta: Record<string, unknown> = {}): void {
    db.audit.unshift({ id: uid('aud'), actor: this.actor, action, entity, entity_id: entityId, meta, created_at: isoNow() });
    db.audit = db.audit.slice(0, 500);
  }

  private notFound(entity: string, id: string): ApiError {
    return new ApiError('not_found', `${entity} ${id} not found.`, 404);
  }

  // ---- properties ---------------------------------------------------------
  properties = {
    list: async (): Promise<Envelope<ApiProperty[]>> => {
      // Normalize legacy localStorage rows (pre-enabled era) to enabled.
      return { data: this.db().properties.map((p) => ({ ...p, enabled: p.enabled ?? true })) };
    },
    get: async (id: string): Promise<Envelope<ApiProperty>> => {
      const p = this.db().properties.find((x) => x.id === id);
      if (!p) throw this.notFound('Property', id);
      return { data: { ...p, enabled: p.enabled ?? true } };
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
        secure_mode: false, enabled: true, created_at: isoNow(),
      };
      db.properties.unshift(p);
      this.logAudit(db, 'property.created', 'property', p.id, { name: p.name });
      this.save(db);
      return { data: p };
    },
    update: async (id: string, patch: Partial<Pick<ApiProperty, 'name' | 'domain' | 'secure_mode' | 'enabled'>>): Promise<Envelope<ApiProperty>> => {
      const db = this.db();
      const p = db.properties.find((x) => x.id === id);
      if (!p) throw this.notFound('Property', id);
      Object.assign(p, patch);
      this.logAudit(db, 'property.updated', 'property', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: p };
    },
    regenerateKey: async (id: string): Promise<Envelope<{ public_key: string }>> => {
      const db = this.db();
      const p = db.properties.find((x) => x.id === id);
      if (!p) throw this.notFound('Property', id);
      p.public_key = `bx_${randomHex(9)}`;
      this.logAudit(db, 'property.key_regenerated', 'property', id, {});
      this.save(db);
      return { data: { public_key: p.public_key } };
    },
    remove: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.properties.some((x) => x.id === id)) throw this.notFound('Property', id);
      db.properties = db.properties.filter((x) => x.id !== id);
      this.logAudit(db, 'property.deleted', 'property', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
  };

  // ---- workspace record ----------------------------------------------------
  workspaceInfo = {
    /** The client workspace record for this API instance's workspace. */
    get: async (): Promise<Envelope<ApiWorkspace>> => {
      return { data: this.db().workspace };
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
      this.logAudit(db, 'widget.updated', 'property', propertyId, patch as Record<string, unknown>);
      this.save(db);
      return { data: p.widget_config };
    },
  };

  // ---- conversations -------------------------------------------------------
  conversations = {
    list: async (opts: { propertyId?: string; status?: ConvStatus; tag?: string; priority?: TicketPriority; assignee?: string; q?: string } & ListOpts = {}): Promise<Envelope<Page<ApiConversation>>> => {
      let items = [...this.db().conversations].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      if (opts.propertyId) items = items.filter((c) => c.property_id === opts.propertyId);
      if (opts.status) items = items.filter((c) => c.status === opts.status);
      if (opts.tag) items = items.filter((c) => c.tags.includes(opts.tag as string));
      if (opts.priority) items = items.filter((c) => (c.priority ?? 'medium') === opts.priority);
      if (opts.assignee) {
        items = opts.assignee === 'unassigned'
          ? items.filter((c) => !c.agent_id)
          : items.filter((c) => c.agent_id === opts.assignee);
      }
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
        status: 'open', department: 'Support', agent_id: null, agent_name: null, priority: 'medium',
        tags: [], notes: [], rating: null, unread: 0, ai_handled: false,
        created_at: now, updated_at: now, closed_at: null,
        messages: [{
          id: uid('msg'), conversation_id: '', sender: 'agent', kind: 'text',
          text: prop.widget_config.greeting, metadata: {}, created_at: now,
        }],
      };
      c.messages.forEach((m) => { m.conversation_id = c.id; });
      db.conversations.unshift(c);
      this.logAudit(db, 'conversation.started', 'conversation', c.id, { visitor: c.visitor_name });
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
      this.logAudit(db, 'conversation.assigned', 'conversation', id, { agent: c.agent_name, department: c.department });
      this.save(db);
      return { data: c };
    },
    /** Transfer a chat to another agent and/or department. Records a system message
     *  in the thread timeline, an internal note, and notifies the receiving agent. */
    transfer: async (id: string, target: { agent_id?: string | null; department_id?: string | null }, note: string): Promise<Envelope<ApiConversation>> => {
      const db = this.db();
      const c = db.conversations.find((x) => x.id === id);
      if (!c) throw this.notFound('Conversation', id);
      const fromAgent = c.agent_name ?? 'Unassigned';
      const fromDept = c.department;
      if (target.agent_id !== undefined) {
        const m = target.agent_id ? db.members.find((x) => x.id === target.agent_id) : null;
        if (target.agent_id && !m) throw this.notFound('Member', target.agent_id);
        c.agent_id = target.agent_id ?? null;
        c.agent_name = m ? m.display_name : null;
      }
      if (target.department_id) {
        const d = db.departments.find((x) => x.id === target.department_id);
        if (!d) throw this.notFound('Department', target.department_id);
        c.department = d.name;
      }
      const toAgent = c.agent_name ?? 'Unassigned';
      const summary = `Transferred from ${fromAgent} (${fromDept}) to ${toAgent} (${c.department})${note.trim() ? ` — ${note.trim()}` : ''}`;
      c.messages.push({
        id: uid('msg'), conversation_id: c.id, sender: 'system', kind: 'text',
        text: `🔀 ${summary}`, metadata: { transfer: true }, created_at: isoNow(),
      });
      c.notes.push({ author: this.actor, text: summary, created_at: isoNow() });
      c.updated_at = isoNow();
      // Notify the receiving agent — same db instance so the save below keeps it.
      if (target.agent_id) {
        const m = db.members.find((x) => x.id === target.agent_id);
        db.notifications.unshift({
          id: uid('notif'), type: 'chat.assigned',
          title: `Chat transferred to ${m?.display_name ?? 'you'}`,
          body: `${c.visitor_name} — ${summary}`,
          link: `/app?c=${c.id}`, read: false, created_at: isoNow(),
        });
        db.notifications = db.notifications.slice(0, 200);
      }
      this.logAudit(db, 'conversation.transferred', 'conversation', id, {
        from: `${fromAgent} / ${fromDept}`, to: `${toAgent} / ${c.department}`, note: note.trim(),
      });
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
      this.logAudit(db, 'conversation.status_changed', 'conversation', id, { from: old, to: status });
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
      this.logAudit(db, 'contact.created', 'contact', c.id, { name: c.name });
      this.save(db);
      return { data: c };
    },
    update: async (id: string, patch: Partial<Pick<ApiContact, 'name' | 'email' | 'phone' | 'country' | 'tags' | 'notes'>>): Promise<Envelope<ApiContact>> => {
      const db = this.db();
      const c = db.contacts.find((x) => x.id === id);
      if (!c) throw this.notFound('Contact', id);
      Object.assign(c, patch, { last_seen_at: isoNow() });
      this.logAudit(db, 'contact.updated', 'contact', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: c };
    },
    remove: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.contacts.some((x) => x.id === id)) throw this.notFound('Contact', id);
      db.contacts = db.contacts.filter((x) => x.id !== id);
      this.logAudit(db, 'contact.deleted', 'contact', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
  };

  // ---- agents / team --------------------------------------------------------
  agents = {
    list: async (): Promise<Envelope<ApiAgent[]>> => {
      // Normalize legacy localStorage rows (pre-active era) to active.
      return { data: this.db().agents.map((a) => ({ ...a, active: a.active ?? true })) };
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
        id: uid('ag'), display_name: name, role: input.role ?? 'agent', online: false, active: true,
        passcode, created_at: isoNow(), last_login_at: null,
      };
      db.agents.push(a);
      this.logAudit(db, 'agent.invited', 'agent', a.id, { name, role: a.role });
      this.save(db);
      // Local-only: email invites activate with the backend phase; the
      // passcode below is the member's login credential — share it directly.
      return { data: { agent: a, passcode } };
    },
    update: async (id: string, patch: Partial<Pick<ApiAgent, 'role' | 'online' | 'display_name' | 'active'>>): Promise<Envelope<ApiAgent>> => {
      const db = this.db();
      const a = db.agents.find((x) => x.id === id);
      if (!a) throw this.notFound('Agent', id);
      Object.assign(a, patch);
      this.logAudit(db, 'agent.updated', 'agent', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: a };
    },
    remove: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.agents.some((x) => x.id === id)) throw this.notFound('Agent', id);
      db.agents = db.agents.filter((x) => x.id !== id);
      this.logAudit(db, 'agent.removed', 'agent', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
  };

  // ---- tickets --------------------------------------------------------------
  tickets = {
    list: async (opts: { status?: TicketStatus; priority?: TicketPriority; assignee?: string; q?: string; category?: string } & ListOpts = {}): Promise<Envelope<Page<ApiTicket>>> => {
      let items = [...this.db().tickets].sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (opts.status) items = items.filter((t) => t.status === opts.status);
      if (opts.priority) items = items.filter((t) => t.priority === opts.priority);
      if (opts.category) items = items.filter((t) => t.category_id === opts.category);
      if (opts.assignee) {
        items = opts.assignee === 'unassigned'
          ? items.filter((t) => !t.assignee_id)
          : items.filter((t) => t.assignee_id === opts.assignee);
      }
      if (opts.q) {
        const q = opts.q.toLowerCase();
        items = items.filter((t) =>
          t.subject.toLowerCase().includes(q) || t.requester_name.toLowerCase().includes(q) ||
          t.requester_email.toLowerCase().includes(q) || t.message.toLowerCase().includes(q),
        );
      }
      return { data: paginate(items, opts) };
    },
    get: async (id: string): Promise<Envelope<ApiTicket>> => {
      const t = this.db().tickets.find((x) => x.id === id);
      if (!t) throw this.notFound('Ticket', id);
      return { data: t };
    },
    create: async (input: {
      subject: string; requester_name: string; requester_email?: string; message: string;
      property_id?: string | null; priority?: TicketPriority; assignee_id?: string | null;
      sla_due?: string | null; conversation_id?: string | null; tags?: string[]; category_id?: string | null;
    }): Promise<Envelope<ApiTicket>> => {
      if (!input.subject.trim() || !input.message.trim()) throw new ApiError('validation', 'Subject and message are required.', 422);
      const db = this.db();
      const now = isoNow();
      const t: ApiTicket = {
        id: uid('t'), property_id: input.property_id ?? null, subject: input.subject.trim(),
        requester_name: input.requester_name.trim() || 'Guest', requester_email: (input.requester_email ?? '').trim(),
        message: input.message.trim(), status: 'new', priority: input.priority ?? 'medium',
        assignee_id: input.assignee_id ?? null, sla_due: input.sla_due ?? null,
        conversation_id: input.conversation_id ?? null, tags: input.tags ?? [],
        category_id: input.category_id ?? null,
        created_at: now, updated_at: now,
      };
      db.tickets.unshift(t);
      this.logAudit(db, 'ticket.created', 'ticket', t.id, { subject: t.subject, priority: t.priority });
      await this.notifications.push('ticket.created', `New ticket: ${t.subject}`, `From ${t.requester_name} · priority ${t.priority}`, '/app/tickets');
      this.save(db);
      return { data: t };
    },
    update: async (id: string, patch: Partial<Pick<ApiTicket, 'subject' | 'message' | 'requester_name' | 'requester_email' | 'tags' | 'sla_due' | 'property_id' | 'status' | 'priority' | 'assignee_id' | 'category_id'>>): Promise<Envelope<ApiTicket>> => {
      const db = this.db();
      const t = db.tickets.find((x) => x.id === id);
      if (!t) throw this.notFound('Ticket', id);
      Object.assign(t, patch, { updated_at: isoNow() });
      this.logAudit(db, 'ticket.updated', 'ticket', id, patch as Record<string, unknown>);
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
      this.logAudit(db, 'ticket.status_changed', 'ticket', id, { from, to: status });
      this.save(db);
      return { data: t };
    },
    assign: async (id: string, agentId: string | null): Promise<Envelope<ApiTicket>> => {
      const db = this.db();
      const t = db.tickets.find((x) => x.id === id);
      if (!t) throw this.notFound('Ticket', id);
      t.assignee_id = agentId;
      t.updated_at = isoNow();
      const m = agentId ? db.members.find((x) => x.id === agentId) : null;
      this.logAudit(db, 'ticket.assigned', 'ticket', id, { assignee: m?.display_name ?? null });
      if (m) await this.notifications.push('chat.assigned', `Ticket assigned to ${m.display_name}`, t.subject, '/app/tickets');
      this.save(db);
      return { data: t };
    },
    setPriority: async (id: string, p: TicketPriority): Promise<Envelope<ApiTicket>> => {
      const db = this.db();
      const t = db.tickets.find((x) => x.id === id);
      if (!t) throw this.notFound('Ticket', id);
      const from = t.priority;
      t.priority = p;
      t.updated_at = isoNow();
      this.logAudit(db, 'ticket.priority_changed', 'ticket', id, { from, to: p });
      this.save(db);
      return { data: t };
    },
    /** Bulk ops. 'spam' has no dedicated ticket status — it tags + resolves the ticket. */
    bulk: async (ids: string[], action: 'resolve' | 'assign' | 'spam', agentId?: string): Promise<Envelope<{ updated: number }>> => {
      if (!ids.length) throw new ApiError('validation', 'Select at least one ticket.', 422);
      if (action === 'assign' && !agentId) throw new ApiError('validation', 'An assignee is required for bulk assign.', 422);
      const db = this.db();
      let updated = 0;
      ids.forEach((id) => {
        const t = db.tickets.find((x) => x.id === id);
        if (!t) return;
        if (action === 'resolve') t.status = 'resolved';
        if (action === 'assign') t.assignee_id = agentId ?? null;
        if (action === 'spam') { t.status = 'resolved'; if (!t.tags.includes('spam')) t.tags.push('spam'); }
        t.updated_at = isoNow();
        updated += 1;
      });
      this.logAudit(db, `ticket.bulk_${action}`, 'ticket', ids.join(','), { count: updated });
      this.save(db);
      return { data: { updated } };
    },
    /** Create a ticket linked to a conversation (carries context; works even if
     *  the conversation lives outside the API db — the link is kept by id). */
    fromConversation: async (convId: string, input: { subject?: string; message?: string; priority?: TicketPriority; requester_name?: string; requester_email?: string }): Promise<Envelope<ApiTicket>> => {
      const db = this.db();
      const conv = db.conversations.find((x) => x.id === convId);
      const name = input.requester_name ?? conv?.visitor_name ?? 'Guest';
      const email = input.requester_email ?? conv?.visitor_email ?? '';
      const transcript = conv
        ? conv.messages.map((m) => `${m.sender}: ${m.text}`).join('\n')
        : '';
      const subject = input.subject?.trim() || `Chat with ${name}${conv ? ` (${conv.page_url})` : ''}`;
      const message = input.message?.trim() || transcript || 'Created from chat.';
      return this.tickets.create({
        subject, requester_name: name, requester_email: email, message,
        property_id: conv?.property_id ?? null,
        priority: input.priority ?? conv?.priority ?? 'medium',
        conversation_id: convId,
        tags: conv?.tags ?? [],
      });
    },
  };

  // ---- notifications -----------------------------------------------------------
  notifications = {
    list: async (opts: { unreadOnly?: boolean } & ListOpts = {}): Promise<Envelope<Page<ApiNotification>>> => {
      let items = [...this.db().notifications].sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (opts.unreadOnly) items = items.filter((n) => !n.read);
      return { data: paginate(items, opts) };
    },
    markRead: async (id: string): Promise<Envelope<ApiNotification>> => {
      const db = this.db();
      const n = db.notifications.find((x) => x.id === id);
      if (!n) throw this.notFound('Notification', id);
      n.read = true;
      this.save(db);
      return { data: n };
    },
    markAllRead: async (): Promise<Envelope<{ read: number }>> => {
      const db = this.db();
      let read = 0;
      db.notifications.forEach((n) => { if (!n.read) { n.read = true; read += 1; } });
      this.save(db);
      return { data: { read } };
    },
    /** Internal helper — also used by ticket/campaign/goal methods. */
    push: async (type: ApiNotification['type'], title: string, body: string, link: string | null = null): Promise<Envelope<ApiNotification>> => {
      const db = this.db();
      const n: ApiNotification = { id: uid('notif'), type, title, body, link, read: false, created_at: isoNow() };
      db.notifications.unshift(n);
      db.notifications = db.notifications.slice(0, 200);
      this.save(db);
      return { data: n };
    },
  };

  // ---- ratings (CSAT + NPS) -----------------------------------------------------
  ratings = {
    create: async (input: {
      property_id: string; conversation_id?: string | null; agent_id?: string | null;
      kind: 'csat' | 'nps'; score: number; comment?: string;
    }): Promise<Envelope<ApiRating>> => {
      if (!input.property_id?.trim()) throw new ApiError('validation', 'property_id is required.', 422);
      if (!Number.isFinite(input.score)) throw new ApiError('validation', 'Score must be a number.', 422);
      if (input.kind === 'csat' && (input.score < 1 || input.score > 5)) {
        throw new ApiError('validation', 'CSAT score must be between 1 and 5.', 422);
      }
      if (input.kind === 'nps' && (input.score < 0 || input.score > 10)) {
        throw new ApiError('validation', 'NPS score must be between 0 and 10.', 422);
      }
      const db = this.db();
      const r: ApiRating = {
        id: uid('rt'), property_id: input.property_id, conversation_id: input.conversation_id ?? null,
        agent_id: input.agent_id ?? null, kind: input.kind, score: input.score,
        comment: (input.comment ?? '').trim(), created_at: Date.now(),
      };
      db.ratings.unshift(r);
      this.logAudit(db, 'rating.created', 'rating', r.id, { kind: r.kind, score: r.score });
      // Low-rating alert. Written into this same db instance (not via notifications.push,
      // which reloads+saves a separate instance) so it survives the save below.
      const isLow = input.kind === 'csat' ? input.score <= 2 : input.score <= 6;
      if (isLow) {
        const scale = input.kind === 'csat' ? '5' : '10';
        db.notifications.unshift({
          id: uid('notif'), type: 'system', title: 'New low rating',
          body: `${input.kind.toUpperCase()} ${input.score}/${scale}${r.comment ? ` — "${r.comment}"` : ''}`,
          link: r.conversation_id ? `/app?c=${r.conversation_id}` : '/app/analytics',
          read: false, created_at: isoNow(),
        });
        db.notifications = db.notifications.slice(0, 200);
      }
      this.save(db);
      return { data: r };
    },
    list: async (opts: {
      property_id?: string; agent_id?: string; kind?: 'csat' | 'nps'; from?: number; to?: number;
    } & ListOpts = {}): Promise<Envelope<Page<ApiRating>>> => {
      const { property_id, agent_id, kind, from, to } = opts;
      let items = [...this.db().ratings].sort((a, b) => b.created_at - a.created_at);
      if (property_id) items = items.filter((r) => r.property_id === property_id);
      if (agent_id) items = items.filter((r) => r.agent_id === agent_id);
      if (kind) items = items.filter((r) => r.kind === kind);
      if (from !== undefined) items = items.filter((r) => r.created_at >= from);
      if (to !== undefined) items = items.filter((r) => r.created_at <= to);
      return { data: paginate(items, opts) };
    },
    summary: async (propertyId: string, days = 30): Promise<Envelope<{
      csat_avg: number | null; csat_count: number; nps_score: number | null; nps_count: number;
      promoters: number; passives: number; detractors: number;
      trend: Array<{ day: string; csat_avg: number | null; nps_avg: number | null; count: number }>;
    }>> => {
      const cutoff = Date.now() - days * 86400000;
      const items = this.db().ratings.filter((r) => r.property_id === propertyId && r.created_at >= cutoff);
      const csat = items.filter((r) => r.kind === 'csat');
      const nps = items.filter((r) => r.kind === 'nps');
      const round1 = (n: number) => Math.round(n * 10) / 10;
      const avg = (xs: ApiRating[]) => xs.length ? round1(xs.reduce((a, r) => a + r.score, 0) / xs.length) : null;
      const promoters = nps.filter((r) => r.score >= 9).length;
      const passives = nps.filter((r) => r.score === 7 || r.score === 8).length;
      const detractors = nps.filter((r) => r.score <= 6).length;
      const nps_score = nps.length
        ? Math.round((promoters / nps.length) * 100 - (detractors / nps.length) * 100)
        : null;
      const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);
      const trend: Array<{ day: string; csat_avg: number | null; nps_avg: number | null; count: number }> = [];
      for (let i = days - 1; i >= 0; i--) {
        const key = dayKey(Date.now() - i * 86400000);
        const dayItems = items.filter((r) => dayKey(r.created_at) === key);
        trend.push({
          day: key,
          csat_avg: avg(dayItems.filter((r) => r.kind === 'csat')),
          nps_avg: avg(dayItems.filter((r) => r.kind === 'nps')),
          count: dayItems.length,
        });
      }
      return {
        data: {
          csat_avg: avg(csat), csat_count: csat.length,
          nps_score, nps_count: nps.length,
          promoters, passives, detractors, trend,
        },
      };
    },
  };

  // ---- departments (per property) -------------------------------------------------
  departments = {
    list: async (propertyId: string): Promise<Envelope<ApiDepartment[]>> => {
      return { data: this.db().departments.filter((d) => d.property_id === propertyId) };
    },
    create: async (propertyId: string, input: {
      name: string; description?: string; agent_ids?: string[];
      routing_mode?: ApiDepartment['routing_mode'];
      hours_override?: ApiDepartment['hours_override'];
      offline_behavior?: ApiDepartment['offline_behavior'];
    }): Promise<Envelope<ApiDepartment>> => {
      if (!input.name.trim()) throw new ApiError('validation', 'Department name is required.', 422);
      const db = this.db();
      const d: ApiDepartment = {
        id: uid('dep'), property_id: propertyId, name: input.name.trim(),
        description: (input.description ?? '').trim(), agent_ids: input.agent_ids ?? [],
        routing_mode: input.routing_mode ?? 'round-robin',
        hours_override: input.hours_override ?? null,
        offline_behavior: input.offline_behavior ?? 'message',
        created_at: Date.now(),
      };
      db.departments.push(d);
      this.logAudit(db, 'department.created', 'department', d.id, { name: d.name, property: propertyId });
      this.save(db);
      return { data: d };
    },
    update: async (id: string, patch: Partial<Pick<ApiDepartment, 'name' | 'description' | 'agent_ids' | 'routing_mode' | 'hours_override' | 'offline_behavior'>>): Promise<Envelope<ApiDepartment>> => {
      const db = this.db();
      const d = db.departments.find((x) => x.id === id);
      if (!d) throw this.notFound('Department', id);
      if (patch.name !== undefined) {
        if (!patch.name.trim()) throw new ApiError('validation', 'Department name is required.', 422);
        d.name = patch.name.trim();
      }
      if (patch.description !== undefined) d.description = patch.description;
      if (patch.agent_ids !== undefined) d.agent_ids = [...patch.agent_ids];
      if (patch.routing_mode !== undefined) d.routing_mode = patch.routing_mode;
      if (patch.hours_override !== undefined) d.hours_override = patch.hours_override;
      if (patch.offline_behavior !== undefined) d.offline_behavior = patch.offline_behavior;
      this.logAudit(db, 'department.updated', 'department', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: d };
    },
    delete: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.departments.some((x) => x.id === id)) throw this.notFound('Department', id);
      db.departments = db.departments.filter((x) => x.id !== id);
      delete db.routing_counters[id];
      this.logAudit(db, 'department.deleted', 'department', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
  };

  // ---- smart routing (local simulation) -------------------------------------------
  routing = {
    routeChat: async (propertyId: string, departmentId?: string | null): Promise<Envelope<{ agent_id: string | null; department_id: string | null }>> => {
      const db = this.db();
      const dept = departmentId
        ? db.departments.find((d) => d.id === departmentId && d.property_id === propertyId)
        : db.departments.find((d) => d.property_id === propertyId);
      if (!dept) return { data: { agent_id: null, department_id: null } };
      const byId = new Map(db.members.map((m) => [m.id, m]));
      let candidates = dept.agent_ids
        .map((id) => byId.get(id))
        .filter((m): m is ApiMember => !!m && m.status === 'online');
      if (!candidates.length) candidates = [...db.members]; // fallback: anyone when nobody is online
      if (!candidates.length) return { data: { agent_id: null, department_id: dept.id } };
      let agent: ApiMember;
      if (dept.routing_mode === 'least-busy') {
        const open = new Map<string, number>();
        db.conversations.forEach((c) => {
          if (c.status === 'open' && c.agent_id) open.set(c.agent_id, (open.get(c.agent_id) ?? 0) + 1);
        });
        agent = candidates.slice().sort((a, b) => (open.get(a.id) ?? 0) - (open.get(b.id) ?? 0))[0];
      } else if (dept.routing_mode === 'first-available') {
        agent = candidates[0];
      } else {
        const n = db.routing_counters[dept.id] ?? 0;
        agent = candidates[n % candidates.length];
        db.routing_counters[dept.id] = n + 1;
        this.save(db);
      }
      return { data: { agent_id: agent.id, department_id: dept.id } };
    },
  };

  // ---- categories -------------------------------------------------------------------
  categories = {
    list: async (scope: ApiCategory['scope'], propertyId?: string): Promise<Envelope<ApiCategory[]>> => {
      let items = this.db().categories.filter((c) => c.scope === scope);
      if (propertyId) items = items.filter((c) => c.property_id === propertyId);
      return { data: items };
    },
    create: async (scope: ApiCategory['scope'], propertyId: string, name: string, color?: string): Promise<Envelope<ApiCategory>> => {
      if (!name.trim()) throw new ApiError('validation', 'Category name is required.', 422);
      const db = this.db();
      const c: ApiCategory = {
        id: uid('cat'), scope, property_id: propertyId, name: name.trim(),
        color: color?.trim() || '#4f46e5', created_at: Date.now(),
      };
      db.categories.push(c);
      this.logAudit(db, 'category.created', 'category', c.id, { scope, name: c.name });
      this.save(db);
      return { data: c };
    },
    update: async (id: string, patch: Partial<Pick<ApiCategory, 'name' | 'color'>>): Promise<Envelope<ApiCategory>> => {
      const db = this.db();
      const c = db.categories.find((x) => x.id === id);
      if (!c) throw this.notFound('Category', id);
      if (patch.name !== undefined) {
        if (!patch.name.trim()) throw new ApiError('validation', 'Category name is required.', 422);
        c.name = patch.name.trim();
      }
      if (patch.color !== undefined) c.color = patch.color;
      this.logAudit(db, 'category.updated', 'category', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: c };
    },
    delete: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.categories.some((x) => x.id === id)) throw this.notFound('Category', id);
      db.categories = db.categories.filter((x) => x.id !== id);
      // Clear references so nothing points at a deleted category.
      db.tickets.forEach((t) => { if (t.category_id === id) t.category_id = null; });
      db.articles.forEach((a) => { if (a.category_id === id) a.category_id = null; });
      db.canned.forEach((x) => { if (x.category_id === id) x.category_id = null; });
      this.logAudit(db, 'category.deleted', 'category', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
  };

  // ---- saved views ------------------------------------------------------------
  views = {
    list: async (): Promise<Envelope<ApiSavedView[]>> => {
      return { data: this.db().views };
    },
    create: async (name: string, filters: ApiSavedView['filters']): Promise<Envelope<ApiSavedView>> => {
      if (!name.trim()) throw new ApiError('validation', 'View name is required.', 422);
      const db = this.db();
      const v: ApiSavedView = { id: uid('view'), name: name.trim(), filters, created_at: isoNow() };
      db.views.push(v);
      this.logAudit(db, 'view.created', 'view', v.id, { name: v.name });
      this.save(db);
      return { data: v };
    },
    delete: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.views.some((x) => x.id === id)) throw this.notFound('View', id);
      db.views = db.views.filter((x) => x.id !== id);
      this.logAudit(db, 'view.deleted', 'view', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
  };

  // ---- plays (multi-step macros) ------------------------------------------------
  plays = {
    list: async (): Promise<Envelope<ApiPlay[]>> => {
      return { data: this.db().plays };
    },
    create: async (name: string, steps: ApiPlayStep[]): Promise<Envelope<ApiPlay>> => {
      if (!name.trim()) throw new ApiError('validation', 'Play name is required.', 422);
      if (!steps.length) throw new ApiError('validation', 'A play needs at least one step.', 422);
      const db = this.db();
      const p: ApiPlay = { id: uid('play'), name: name.trim(), steps, created_at: isoNow() };
      db.plays.push(p);
      this.logAudit(db, 'play.created', 'play', p.id, { name: p.name, steps: steps.length });
      this.save(db);
      return { data: p };
    },
    delete: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.plays.some((x) => x.id === id)) throw this.notFound('Play', id);
      db.plays = db.plays.filter((x) => x.id !== id);
      this.logAudit(db, 'play.deleted', 'play', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
    /** Run a play against a conversation: applies each step in order. */
    run: async (conversationId: string, playId: string): Promise<Envelope<{ applied: string[] }>> => {
      const db = this.db();
      const play = db.plays.find((x) => x.id === playId);
      if (!play) throw this.notFound('Play', playId);
      const conv = db.conversations.find((x) => x.id === conversationId);
      if (!conv) throw this.notFound('Conversation', conversationId);
      const applied: string[] = [];
      for (const step of play.steps) {
        if (step.kind === 'reply' && step.value.trim()) {
          conv.messages.push({ id: uid('msg'), conversation_id: conv.id, sender: 'agent', kind: 'text', text: step.value.trim(), metadata: { play: play.name }, created_at: isoNow() });
          applied.push(`reply sent (${step.value.trim().slice(0, 40)}…)`);
        } else if (step.kind === 'tag' && step.value.trim()) {
          const tag = step.value.trim().toLowerCase();
          if (!conv.tags.includes(tag)) conv.tags.push(tag);
          applied.push(`tag added: ${tag}`);
        } else if (step.kind === 'assign') {
          const agent = db.agents.find((a) => a.display_name.toLowerCase() === step.value.trim().toLowerCase());
          const member = db.members.find((m) => m.display_name.toLowerCase() === step.value.trim().toLowerCase());
          const name = agent?.display_name ?? member?.display_name ?? step.value.trim();
          const dept = db.properties.length && ['sales', 'support', 'billing'].includes(step.value.trim().toLowerCase())
            ? step.value.trim() : null;
          if (dept) { conv.department = dept.charAt(0).toUpperCase() + dept.slice(1); applied.push(`routed to ${conv.department}`); }
          else { conv.agent_name = name; applied.push(`assigned to ${name}`); }
        } else if (step.kind === 'priority' && ['low', 'medium', 'high', 'urgent'].includes(step.value)) {
          conv.priority = step.value as TicketPriority;
          applied.push(`priority set to ${step.value}`);
        } else if (step.kind === 'note' && step.value.trim()) {
          conv.notes.push({ author: this.actor, text: step.value.trim(), created_at: isoNow() });
          applied.push('note added');
        }
      }
      conv.updated_at = isoNow();
      this.logAudit(db, 'play.run', 'play', playId, { conversation: conversationId, applied: applied.length });
      this.save(db);
      return { data: { applied } };
    },
  };

  // ---- goals & attribution -------------------------------------------------------
  goals = {
    list: async (): Promise<Envelope<ApiGoal[]>> => {
      return { data: this.db().goals };
    },
    create: async (name: string, event: string, revenue = 0): Promise<Envelope<ApiGoal>> => {
      if (!name.trim() || !event.trim()) throw new ApiError('validation', 'Name and event key are required.', 422);
      const db = this.db();
      const g: ApiGoal = { id: uid('goal'), name: name.trim(), event: event.trim(), revenue: Number(revenue) || 0, created_at: isoNow() };
      db.goals.push(g);
      this.logAudit(db, 'goal.created', 'goal', g.id, { name: g.name, event: g.event });
      this.save(db);
      return { data: g };
    },
    delete: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.goals.some((x) => x.id === id)) throw this.notFound('Goal', id);
      db.goals = db.goals.filter((x) => x.id !== id);
      db.goalEvents = db.goalEvents.filter((x) => x.goal_id !== id);
      this.logAudit(db, 'goal.deleted', 'goal', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
    track: async (goalId: string, conversationId: string | null = null, value?: number): Promise<Envelope<ApiGoalEvent>> => {
      const db = this.db();
      const goal = db.goals.find((x) => x.id === goalId);
      if (!goal) throw this.notFound('Goal', goalId);
      const e: ApiGoalEvent = { id: uid('gev'), goal_id: goalId, conversation_id: conversationId, value: value ?? goal.revenue, created_at: isoNow() };
      db.goalEvents.unshift(e);
      this.logAudit(db, 'goal.completed', 'goal', goalId, { conversation: conversationId, value: e.value });
      await this.notifications.push('system', `Goal completed: ${goal.name}`, `Event "${goal.event}"${conversationId ? ' from a chat' : ''} · value ${e.value}`, '/app/analytics');
      this.save(db);
      return { data: e };
    },
    /** Conversion funnel: visitors → chats → goal completions over the last N days. */
    funnel: async (days = 30): Promise<Envelope<GoalFunnel>> => {
      const db = this.db();
      const since = Date.now() - Math.min(Math.max(days, 1), 365) * 86400000;
      const convs = db.conversations.filter((c) => Date.parse(c.created_at) >= since);
      const visitors = new Set(convs.map((c) => `${c.visitor_name}|${c.visitor_email}`)).size;
      const events = db.goalEvents.filter((e) => Date.parse(e.created_at) >= since);
      const goals = db.goals.map((goal) => {
        const evts = events.filter((e) => e.goal_id === goal.id);
        return { goal, count: evts.length, revenue: evts.reduce((s, e) => s + (e.value || 0), 0) };
      });
      return { data: { visitors, chats: convs.length, goals } };
    },
  };

  // ---- blog -----------------------------------------------------------------------
  blog = {
    list: async (publishedOnly = true): Promise<Envelope<ApiBlogPost[]>> => {
      let items = [...this.db().blogPosts].sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (publishedOnly) items = items.filter((p) => p.published);
      return { data: items };
    },
    getBySlug: async (slug: string): Promise<Envelope<ApiBlogPost>> => {
      const p = this.db().blogPosts.find((x) => x.slug === slug);
      if (!p) throw this.notFound('Blog post', slug);
      return { data: p };
    },
    create: async (input: { slug: string; title: string; excerpt?: string; body?: string; tags?: string[]; author?: string; published?: boolean; reading_mins?: number }): Promise<Envelope<ApiBlogPost>> => {
      if (!input.title.trim() || !input.slug.trim()) throw new ApiError('validation', 'Title and slug are required.', 422);
      const db = this.db();
      if (db.blogPosts.some((p) => p.slug === input.slug.trim())) throw new ApiError('conflict', 'A post with that slug already exists.', 409);
      const now = isoNow();
      const p: ApiBlogPost = {
        id: uid('post'), slug: input.slug.trim(), title: input.title.trim(),
        excerpt: input.excerpt ?? '', body: input.body ?? '', tags: input.tags ?? [],
        author: input.author ?? 'Brix Team', published: input.published ?? false,
        reading_mins: input.reading_mins ?? 3, created_at: now, updated_at: now,
      };
      db.blogPosts.unshift(p);
      this.logAudit(db, 'blog.created', 'blog', p.id, { title: p.title });
      this.save(db);
      return { data: p };
    },
    update: async (id: string, patch: Partial<Pick<ApiBlogPost, 'slug' | 'title' | 'excerpt' | 'body' | 'tags' | 'author' | 'published' | 'reading_mins'>>): Promise<Envelope<ApiBlogPost>> => {
      const db = this.db();
      const p = db.blogPosts.find((x) => x.id === id);
      if (!p) throw this.notFound('Blog post', id);
      Object.assign(p, patch, { updated_at: isoNow() });
      this.logAudit(db, 'blog.updated', 'blog', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: p };
    },
    delete: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.blogPosts.some((x) => x.id === id)) throw this.notFound('Blog post', id);
      db.blogPosts = db.blogPosts.filter((x) => x.id !== id);
      this.logAudit(db, 'blog.deleted', 'blog', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
    /** Seed helper for Worker B: fills the blog with the given posts when empty. */
    seedIfEmpty: async (posts: Array<Omit<ApiBlogPost, 'id' | 'created_at' | 'updated_at'>>): Promise<Envelope<{ seeded: number }>> => {
      const db = this.db();
      if (db.blogPosts.length > 0) return { data: { seeded: 0 } };
      const now = isoNow();
      db.blogPosts = posts.map((p) => ({ ...p, id: uid('post'), created_at: now, updated_at: now }));
      this.logAudit(db, 'blog.seeded', 'blog', '', { count: posts.length });
      this.save(db);
      return { data: { seeded: posts.length } };
    },
  };

  // ---- help docs -------------------------------------------------------------------
  helpDocs = {
    list: async (): Promise<Envelope<ApiHelpArticle[]>> => {
      const items = [...this.db().helpDocs].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
      return { data: items };
    },
    getBySlug: async (slug: string): Promise<Envelope<ApiHelpArticle>> => {
      const a = this.db().helpDocs.find((x) => x.slug === slug);
      if (!a) throw this.notFound('Help article', slug);
      return { data: a };
    },
    create: async (input: { slug: string; title: string; body?: string; category?: string; order?: number }): Promise<Envelope<ApiHelpArticle>> => {
      if (!input.title.trim() || !input.slug.trim()) throw new ApiError('validation', 'Title and slug are required.', 422);
      const db = this.db();
      if (db.helpDocs.some((a) => a.slug === input.slug.trim())) throw new ApiError('conflict', 'An article with that slug already exists.', 409);
      const a: ApiHelpArticle = {
        id: uid('help'), slug: input.slug.trim(), title: input.title.trim(), body: input.body ?? '',
        category: input.category ?? 'General', order: input.order ?? db.helpDocs.length + 1, updated_at: isoNow(),
      };
      db.helpDocs.push(a);
      this.logAudit(db, 'helpdoc.created', 'helpdoc', a.id, { title: a.title });
      this.save(db);
      return { data: a };
    },
    update: async (id: string, patch: Partial<Pick<ApiHelpArticle, 'slug' | 'title' | 'body' | 'category' | 'order'>>): Promise<Envelope<ApiHelpArticle>> => {
      const db = this.db();
      const a = db.helpDocs.find((x) => x.id === id);
      if (!a) throw this.notFound('Help article', id);
      Object.assign(a, patch, { updated_at: isoNow() });
      this.logAudit(db, 'helpdoc.updated', 'helpdoc', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: a };
    },
    delete: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.helpDocs.some((x) => x.id === id)) throw this.notFound('Help article', id);
      db.helpDocs = db.helpDocs.filter((x) => x.id !== id);
      this.logAudit(db, 'helpdoc.deleted', 'helpdoc', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
    /** Seed helper for Worker B: fills help docs with the given articles when empty. */
    seedIfEmpty: async (articles: Array<Omit<ApiHelpArticle, 'id' | 'updated_at'>>): Promise<Envelope<{ seeded: number }>> => {
      const db = this.db();
      if (db.helpDocs.length > 0) return { data: { seeded: 0 } };
      db.helpDocs = articles.map((a) => ({ ...a, id: uid('help'), updated_at: isoNow() }));
      this.logAudit(db, 'helpdoc.seeded', 'helpdoc', '', { count: articles.length });
      this.save(db);
      return { data: { seeded: articles.length } };
    },
  };

  // ---- contact form messages ----------------------------------------------------------
  contactMessages = {
    create: async (input: { name: string; email: string; subject: string; message: string }): Promise<Envelope<ApiContactMessage>> => {
      if (!input.name.trim() || !input.message.trim()) throw new ApiError('validation', 'Name and message are required.', 422);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) throw new ApiError('validation', 'A valid email is required.', 422);
      const db = this.db();
      const m: ApiContactMessage = {
        id: uid('cm'), name: input.name.trim(), email: input.email.trim(),
        subject: input.subject.trim() || 'Website contact', message: input.message.trim(),
        read: false, created_at: isoNow(),
      };
      db.contactMessages.unshift(m);
      this.logAudit(db, 'contact.created', 'contactMessage', m.id, { from: m.email });
      await this.notifications.push('mention', `New contact message: ${m.subject}`, `From ${m.name} (${m.email})`, '/admin');
      this.save(db);
      return { data: m };
    },
    list: async (opts: ListOpts = {}): Promise<Envelope<Page<ApiContactMessage>>> => {
      const items = [...this.db().contactMessages].sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { data: paginate(items, opts) };
    },
    markRead: async (id: string): Promise<Envelope<ApiContactMessage>> => {
      const db = this.db();
      const m = db.contactMessages.find((x) => x.id === id);
      if (!m) throw this.notFound('Contact message', id);
      m.read = true;
      this.save(db);
      return { data: m };
    },
  };

  // ---- status page entries ---------------------------------------------------------------
  statusEntries = {
    list: async (): Promise<Envelope<ApiStatusEntry[]>> => {
      const items = [...this.db().statusEntries].sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { data: items };
    },
    create: async (input: { title: string; detail?: string; state?: ApiStatusEntry['state'] }): Promise<Envelope<ApiStatusEntry>> => {
      if (!input.title.trim()) throw new ApiError('validation', 'Title is required.', 422);
      const db = this.db();
      const e: ApiStatusEntry = {
        id: uid('st'), title: input.title.trim(), detail: input.detail ?? '',
        state: input.state ?? 'operational', created_at: isoNow(),
      };
      db.statusEntries.unshift(e);
      this.logAudit(db, 'status.created', 'status', e.id, { state: e.state });
      this.save(db);
      return { data: e };
    },
    delete: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.statusEntries.some((x) => x.id === id)) throw this.notFound('Status entry', id);
      db.statusEntries = db.statusEntries.filter((x) => x.id !== id);
      this.logAudit(db, 'status.deleted', 'status', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
  };

  // ---- members (agent auth) ------------------------------------------------------------------
  members = {
    list: async (): Promise<Envelope<ApiMember[]>> => {
      return { data: this.db().members };
    },
    get: async (id: string): Promise<Envelope<ApiMember>> => {
      const m = this.db().members.find((x) => x.id === id);
      if (!m) throw this.notFound('Member', id);
      return { data: m };
    },
    create: async (displayName: string, role: TeamRole, passcode: string, extras?: {
      job_title?: string; avatar_data_url?: string | null; department_ids?: string[];
    }): Promise<Envelope<ApiMember>> => {
      const name = displayName.trim();
      if (!name) throw new ApiError('validation', 'Display name is required.', 422);
      if (passcode.length < 4) throw new ApiError('validation', 'Passcode must be at least 4 characters.', 422);
      const db = this.db();
      if (db.members.some((m) => m.display_name.toLowerCase() === name.toLowerCase())) {
        throw new ApiError('conflict', 'A member with that name already exists.', 409);
      }
      const m: ApiMember = {
        id: uid('mem'), display_name: name, initials: memberInitials(name),
        color: ['#4f46e5', '#0891b2', '#059669', '#f59e0b', '#8b5cf6'][db.members.length % 5],
        role, passcode, last_login: null, status: 'offline',
        job_title: (extras?.job_title ?? '').trim(),
        avatar_data_url: extras?.avatar_data_url ?? null,
        department_ids: extras?.department_ids ?? [],
        created_at: isoNow(),
      };
      db.members.push(m);
      this.logAudit(db, 'member.created', 'member', m.id, { name, role });
      this.save(db);
      return { data: m };
    },
    update: async (id: string, patch: Partial<Pick<ApiMember, 'display_name' | 'color' | 'role' | 'status' | 'job_title' | 'avatar_data_url' | 'department_ids'>>): Promise<Envelope<ApiMember>> => {
      const db = this.db();
      const m = db.members.find((x) => x.id === id);
      if (!m) throw this.notFound('Member', id);
      if (patch.display_name !== undefined) {
        if (!patch.display_name.trim()) throw new ApiError('validation', 'Display name is required.', 422);
        m.display_name = patch.display_name.trim();
        m.initials = memberInitials(m.display_name);
      }
      if (patch.color !== undefined) m.color = patch.color;
      if (patch.role !== undefined) m.role = patch.role;
      if (patch.status !== undefined) m.status = patch.status;
      if (patch.job_title !== undefined) m.job_title = patch.job_title.trim();
      if (patch.avatar_data_url !== undefined) m.avatar_data_url = patch.avatar_data_url;
      if (patch.department_ids !== undefined) m.department_ids = [...patch.department_ids];
      this.logAudit(db, 'member.updated', 'member', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: m };
    },
    remove: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      const m = db.members.find((x) => x.id === id);
      if (!m) throw this.notFound('Member', id);
      if (db.members.length <= 1) throw new ApiError('validation', 'A workspace needs at least one member.', 422);
      db.members = db.members.filter((x) => x.id !== id);
      this.logAudit(db, 'member.removed', 'member', id, { name: m.display_name });
      this.save(db);
      return { data: { deleted: true } };
    },
    /** Returns the member when the passcode matches, throws ApiError otherwise.
     *  An empty displayName matches any member with that passcode (kiosk login). */
    login: async (displayName: string, passcode: string): Promise<Envelope<ApiMember>> => {
      const db = this.db();
      const name = displayName.trim().toLowerCase();
      const m = name
        ? db.members.find((x) => x.display_name.toLowerCase() === name && x.passcode === passcode)
        : db.members.find((x) => x.passcode === passcode);
      if (!m) throw new ApiError('unauthorized', 'Wrong name or passcode.', 401);
      return { data: m };
    },
    setPasscode: async (id: string, passcode: string): Promise<Envelope<{ updated: true }>> => {
      if (passcode.length < 4) throw new ApiError('validation', 'Passcode must be at least 4 characters.', 422);
      const db = this.db();
      const m = db.members.find((x) => x.id === id);
      if (!m) throw this.notFound('Member', id);
      m.passcode = passcode;
      this.logAudit(db, 'member.passcode_changed', 'member', id, {});
      this.save(db);
      return { data: { updated: true } };
    },
    touchLogin: async (id: string): Promise<Envelope<ApiMember>> => {
      const db = this.db();
      const m = db.members.find((x) => x.id === id);
      if (!m) throw this.notFound('Member', id);
      m.last_login = isoNow();
      m.status = 'online';
      this.save(db);
      return { data: m };
    },
    setStatus: async (id: string, status: ApiMember['status']): Promise<Envelope<ApiMember>> => {
      const db = this.db();
      const m = db.members.find((x) => x.id === id);
      if (!m) throw this.notFound('Member', id);
      m.status = status;
      this.logAudit(db, 'member.status_changed', 'member', id, { status });
      this.save(db);
      return { data: m };
    },
  };

  // ---- property settings ----------------------------------------------------------------------
  propertySettings = {
    get: async (propertyId: string): Promise<Envelope<PropertySettings>> => {
      const db = this.db();
      // Merge branding defaults so workspaces seeded before the branding fields exist get them.
      db.propertySettings[propertyId] = { ...defaultPropertySettings(), ...(db.propertySettings[propertyId] ?? {}) };
      this.save(db);
      return { data: db.propertySettings[propertyId] };
    },
    patch: async (propertyId: string, patch: Partial<PropertySettings>): Promise<Envelope<PropertySettings>> => {
      const db = this.db();
      const current = { ...defaultPropertySettings(), ...(db.propertySettings[propertyId] ?? {}) };
      db.propertySettings[propertyId] = { ...current, ...patch };
      this.logAudit(db, 'property_settings.updated', 'property', propertyId, patch as Record<string, unknown>);
      this.save(db);
      return { data: db.propertySettings[propertyId] };
    },
  };

  // ---- workspace-level settings ------------------------------------------------------------------
  copilotSettings = {
    get: async (): Promise<Envelope<CopilotSettings>> => {
      return { data: this.db().copilotSettings };
    },
    patch: async (patch: Partial<CopilotSettings>): Promise<Envelope<CopilotSettings>> => {
      const db = this.db();
      db.copilotSettings = { ...db.copilotSettings, ...patch };
      this.logAudit(db, 'copilot_settings.updated', 'settings', 'copilot', patch as Record<string, unknown>);
      this.save(db);
      return { data: db.copilotSettings };
    },
  };
  securitySettings = {
    get: async (): Promise<Envelope<SecuritySettings>> => {
      return { data: this.db().securitySettings };
    },
    patch: async (patch: Partial<SecuritySettings>): Promise<Envelope<SecuritySettings>> => {
      const db = this.db();
      db.securitySettings = { ...db.securitySettings, ...patch };
      this.logAudit(db, 'security_settings.updated', 'settings', 'security', patch as Record<string, unknown>);
      this.save(db);
      return { data: db.securitySettings };
    },
  };
  dataSettings = {
    get: async (): Promise<Envelope<DataSettings>> => {
      return { data: this.db().dataSettings };
    },
    patch: async (patch: Partial<DataSettings>): Promise<Envelope<DataSettings>> => {
      const db = this.db();
      db.dataSettings = { ...db.dataSettings, ...patch };
      this.logAudit(db, 'data_settings.updated', 'settings', 'data', patch as Record<string, unknown>);
      this.save(db);
      return { data: db.dataSettings };
    },
  };

  // ---- integrations ----------------------------------------------------------------------------------
  integrations = {
    list: async (): Promise<Envelope<ApiIntegration[]>> => {
      return { data: this.db().integrations };
    },
    patch: async (id: string, patch: Partial<Pick<ApiIntegration, 'values' | 'enabled'>>): Promise<Envelope<ApiIntegration>> => {
      const db = this.db();
      const i = db.integrations.find((x) => x.id === id);
      if (!i) throw this.notFound('Integration', id);
      if (patch.values !== undefined) i.values = { ...patch.values };
      if (patch.enabled !== undefined) i.enabled = patch.enabled;
      this.logAudit(db, 'integration.updated', 'integration', id, { enabled: i.enabled, fields: Object.keys(i.values) });
      this.save(db);
      return { data: i };
    },
  };

  // ---- unanswered questions -------------------------------------------------------------------------------
  unanswered = {
    list: async (opts: { includeDismissed?: boolean } & ListOpts = {}): Promise<Envelope<Page<ApiUnanswered>>> => {
      let items = [...this.db().unanswered].sort((a, b) => b.count - a.count || b.created_at.localeCompare(a.created_at));
      if (!opts.includeDismissed) items = items.filter((u) => !u.dismissed);
      return { data: paginate(items, opts) };
    },
    add: async (question: string, conversationId: string | null = null): Promise<Envelope<ApiUnanswered>> => {
      const q = question.trim();
      if (!q) throw new ApiError('validation', 'Question is required.', 422);
      const db = this.db();
      const existing = db.unanswered.find((u) => u.question.toLowerCase() === q.toLowerCase() && !u.dismissed);
      if (existing) {
        existing.count += 1;
        this.save(db);
        return { data: existing };
      }
      const u: ApiUnanswered = { id: uid('unq'), question: q, conversation_id: conversationId, count: 1, dismissed: false, created_at: isoNow() };
      db.unanswered.unshift(u);
      this.logAudit(db, 'unanswered.added', 'unanswered', u.id, { question: q.slice(0, 80) });
      this.save(db);
      return { data: u };
    },
    dismiss: async (id: string): Promise<Envelope<ApiUnanswered>> => {
      const db = this.db();
      const u = db.unanswered.find((x) => x.id === id);
      if (!u) throw this.notFound('Unanswered question', id);
      u.dismissed = true;
      this.logAudit(db, 'unanswered.dismissed', 'unanswered', id, {});
      this.save(db);
      return { data: u };
    },
    /** Promote to a KB article draft (knowledge-gap loop). */
    promote: async (id: string): Promise<Envelope<ApiArticle>> => {
      const db = this.db();
      const u = db.unanswered.find((x) => x.id === id);
      if (!u) throw this.notFound('Unanswered question', id);
      const { data: article } = await this.kb.create({
        title: u.question,
        body: `Draft from the unanswered-questions log (asked ${u.count}×). Write the answer here.`,
        category: 'Unanswered',
        status: 'draft',
      });
      u.dismissed = true;
      this.logAudit(db, 'unanswered.promoted', 'unanswered', id, { article: article.id });
      this.save(db);
      return { data: article };
    },
  };

  // ---- audit search -------------------------------------------------------------------------------------------
  audit = {
    search: async (opts: { actor?: string; action?: string; from?: string; to?: string } & ListOpts = {}): Promise<Envelope<Page<AuditEntry>>> => {
      let items = [...this.db().audit].sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (opts.actor) items = items.filter((e) => e.actor.toLowerCase().includes(opts.actor!.toLowerCase()));
      if (opts.action) items = items.filter((e) => e.action.toLowerCase().includes(opts.action!.toLowerCase()));
      if (opts.from) items = items.filter((e) => e.created_at >= opts.from!);
      if (opts.to) items = items.filter((e) => e.created_at <= opts.to!);
      return { data: paginate(items, opts) };
    },
  };

  // ---- data management -------------------------------------------------------------------------------------------
  /** Export the whole workspace db as JSON (one-click backup). */
  dataExport = async (): Promise<Envelope<{ workspace: string; exported_at: string; db: ApiDB }>> => {
    return { data: { workspace: this.workspace, exported_at: isoNow(), db: this.db() } };
  };
  /** Replace the workspace db from a previous export. */
  dataImport = async (json: unknown): Promise<Envelope<{ imported: true }>> => {
    const payload = json as { db?: Partial<ApiDB>; workspace?: string } | null;
    if (!payload || typeof payload !== 'object' || !payload.db || typeof payload.db !== 'object') {
      throw new ApiError('validation', 'Not a valid Brix Chat export file.', 422);
    }
    if (!Array.isArray(payload.db.conversations) || !Array.isArray(payload.db.properties)) {
      throw new ApiError('validation', 'Export is missing required collections.', 422);
    }
    const db = payload.db as ApiDB;
    ensureDefaults(db, this.workspace);
    this.logAudit(db, 'data.imported', 'workspace', this.workspace, {});
    const all = loadAll();
    all[this.workspace] = db;
    saveAll(all);
    return { data: { imported: true } };
  };
  /** Reseed the workspace with demo data. */
  dataReset = async (): Promise<Envelope<{ reset: true }>> => {
    const db = seedWorkspace(this.workspace);
    db.audit = [{ id: uid('aud'), actor: this.actor, action: 'data.reset', entity: 'workspace', entity_id: this.workspace, meta: {}, created_at: isoNow() }];
    const all = loadAll();
    all[this.workspace] = db;
    saveAll(all);
    return { data: { reset: true } };
  };

  // ---- knowledge base --------------------------------------------------------
  kb = {
    list: async (opts: { status?: 'draft' | 'published'; category?: string } & ListOpts = {}): Promise<Envelope<Page<ApiArticle>>> => {
      let items = [...this.db().articles].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      if (opts.status) items = items.filter((a) => a.status === opts.status);
      if (opts.category) items = items.filter((a) => a.category_id === opts.category);
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
    create: async (input: { title: string; body?: string; category?: string; category_id?: string | null; status?: 'draft' | 'published' }): Promise<Envelope<ApiArticle>> => {
      if (!input.title.trim()) throw new ApiError('validation', 'Title is required.', 422);
      const db = this.db();
      const slug = input.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid('kb');
      const a: ApiArticle = {
        id: uid('kb'), title: input.title.trim(), slug, body: input.body ?? '',
        category: input.category ?? 'General', category_id: input.category_id ?? null,
        status: input.status ?? 'draft',
        views: 0, updated_at: isoNow(),
      };
      db.articles.unshift(a);
      this.logAudit(db, 'article.created', 'article', a.id, { title: a.title });
      this.save(db);
      return { data: a };
    },
    update: async (id: string, patch: Partial<Pick<ApiArticle, 'title' | 'body' | 'category' | 'category_id' | 'status'>>): Promise<Envelope<ApiArticle>> => {
      const db = this.db();
      const a = db.articles.find((x) => x.id === id);
      if (!a) throw this.notFound('Article', id);
      Object.assign(a, patch, { updated_at: isoNow() });
      this.logAudit(db, 'article.updated', 'article', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: a };
    },
    remove: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.articles.some((x) => x.id === id)) throw this.notFound('Article', id);
      db.articles = db.articles.filter((x) => x.id !== id);
      this.logAudit(db, 'article.deleted', 'article', id, {});
      this.save(db);
      return { data: { deleted: true } };
    },
  };

  // ---- canned responses -------------------------------------------------------
  canned = {
    list: async (opts: { category?: string } = {}): Promise<Envelope<ApiCanned[]>> => {
      let items = this.db().canned;
      if (opts.category) items = items.filter((c) => c.category_id === opts.category);
      return { data: items };
    },
    create: async (input: { shortcut: string; title: string; body: string; category_id?: string | null }): Promise<Envelope<ApiCanned>> => {
      if (!input.title.trim() || !input.body.trim()) throw new ApiError('validation', 'Title and body are required.', 422);
      const db = this.db();
      const c: ApiCanned = { id: uid('can'), shortcut: input.shortcut.trim(), title: input.title.trim(), body: input.body.trim(), category_id: input.category_id ?? null };
      db.canned.unshift(c);
      this.logAudit(db, 'canned.created', 'canned', c.id, { title: c.title });
      this.save(db);
      return { data: c };
    },
    update: async (id: string, patch: Partial<Pick<ApiCanned, 'shortcut' | 'title' | 'body' | 'category_id'>>): Promise<Envelope<ApiCanned>> => {
      const db = this.db();
      const c = db.canned.find((x) => x.id === id);
      if (!c) throw this.notFound('Canned response', id);
      Object.assign(c, patch);
      this.logAudit(db, 'canned.updated', 'canned', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: c };
    },
    remove: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.canned.some((x) => x.id === id)) throw this.notFound('Canned response', id);
      db.canned = db.canned.filter((x) => x.id !== id);
      this.logAudit(db, 'canned.deleted', 'canned', id, {});
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
      this.logAudit(db, 'webhook.created', 'webhook', w.id, { url, events: w.events });
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
      this.logAudit(db, 'webhook.updated', 'webhook', id, patch as Record<string, unknown>);
      this.save(db);
      return { data: w };
    },
    rotateSecret: async (id: string): Promise<Envelope<{ secret: string }>> => {
      const db = this.db();
      const w = db.webhooks.find((x) => x.id === id);
      if (!w) throw this.notFound('Webhook', id);
      const secret = randomHex(24);
      w.secret = secret;
      this.logAudit(db, 'webhook.secret_rotated', 'webhook', id, {});
      this.save(db);
      return { data: { secret } };
    },
    remove: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.webhooks.some((x) => x.id === id)) throw this.notFound('Webhook', id);
      db.webhooks = db.webhooks.filter((x) => x.id !== id);
      db.deliveries = db.deliveries.filter((x) => x.webhook_id !== id);
      this.logAudit(db, 'webhook.deleted', 'webhook', id, {});
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
      this.logAudit(db, 'webhook.test_fired', 'webhook', webhookId, { event });
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
      this.logAudit(db, 'api_key.created', 'api_key', record.id, { name: record.name, scopes: record.scopes });
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
      this.logAudit(db, 'api_key.rotated', 'api_key', id, { name: r.name });
      this.save(db);
      return { data: { record: r, key: raw } };
    },
    revoke: async (id: string): Promise<Envelope<ApiKeyRecord>> => {
      const db = this.db();
      const r = db.apiKeys.find((x) => x.id === id);
      if (!r) throw this.notFound('API key', id);
      r.revoked = true;
      this.logAudit(db, 'api_key.revoked', 'api_key', id, { name: r.name });
      this.save(db);
      return { data: r };
    },
    remove: async (id: string): Promise<Envelope<{ deleted: true }>> => {
      const db = this.db();
      if (!db.apiKeys.some((x) => x.id === id)) throw this.notFound('API key', id);
      db.apiKeys = db.apiKeys.filter((x) => x.id !== id);
      delete db.fullKeys[id];
      this.logAudit(db, 'api_key.deleted', 'api_key', id, {});
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
    case 'ticket.sla_breached':
      return { ticket: { id: 't_7h2k', subject: 'Refund request #1042', priority: 'high' }, sla_due: '2026-09-23T10:00:00Z', overdue_by_min: 42 };
    case 'campaign.sent':
      return { campaign: { id: 'cp_1a2b', name: 'Spring AI add-on launch' }, recipients: 312, goal: 'signup' };
    case 'goal.completed':
      return { goal: { id: 'goal_9z8y', name: 'Checkout completed', event: 'purchase' }, conversation_id: conv.id, value: 99 };
    case 'widget.rating':
      return { conversation_id: conv.id, rating: 5, comment: 'Super helpful!' };
    case 'rating.created':
      return { rating: { id: 'rt_8k2m', kind: 'csat', score: 5, comment: 'Super helpful!' }, conversation_id: conv.id };
    default:
      return { conversation_id: conv.id };
  }
}

/** Factory: one API instance per workspace (actor = signed-in display name).
 *  Returns the active transport (Supabase when configured, else localStorage). */
export function getApi(workspace: string, actor = 'system'): BrixApi {
  return getTransport(workspace, actor);
}

// ===========================================================================
// TRANSPORT LAYER — Supabase (PostgREST) implementation
//
// SupabaseBrixApi extends BrixApi and overrides namespace methods with
// PostgREST implementations. Signatures and { data } envelopes are identical
// to the localStorage transport; getTransport() picks this class only when
// VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are both set.
//
// REAL SCHEMA (supabase/migrations/001_brix_core.sql, 002_seed_demo.sql,
// 003_backend_contract.sql — read before touching this file):
//   * UUID primary keys (gen_random_uuid()); this transport mints ids with
//     crypto.randomUUID(). API id fields stay strings, so UUIDs fit.
//   * Every table is scoped by workspace_id (uuid, NOT NULL). The local
//     workspace slug (e.g. 'demo') is resolved to its UUID once per
//     instance (wsId()) and applied to every query/insert.
//   * conversations reference departments/members by UUID (department_id,
//     assignee_id) — names are hydrated on read. Internal notes live in
//     conversation_notes, NOT on the conversation row. Department membership
//     is a join table (department_members). KB/canned/ticket categories are
//     three separate tables (kb_categories, canned_categories,
//     ticket_categories) with no scope column.
//   * created_at/updated_at are timestamptz; the API's numeric created_at
//     fields (ratings, departments, categories) are mapped epoch-millis.
//   * Passcodes live in member_credentials (deny-all; RPCs only) — the
//     browser NEVER reads or writes them directly. member_login() is the
//     only anon-callable auth surface and returns safe columns only.
//   * webhooks.secret_encrypted / webhooks.secret and api_keys.key_hash are
//     excluded from member SELECT grants by design — the webhooks namespace
//     stays on the local transport (a browser cannot mint an app-layer
//     encrypted signing secret), and API keys store only SHA-256 hashes.
//   * RLS: anon gets NO direct table access (widget RPCs + member_login
//     only). Table reads/writes need an authenticated session whose
//     auth.users id is linked via members.auth_user_id. Until such a
//     session exists, PostgREST calls fail auth and guard() falls back to
//     the localStorage transport — this is the designed graceful
//     degradation, not a bug.
//
// GRACEFUL DEGRADATION: every remote call runs inside guard(). On
// network/auth/PostgREST failure the call falls back to the localStorage
// implementation with a non-blocking console warning. validation,
// not_found, conflict and not_supported ApiErrors propagate (they are data
// errors, not transport errors).
//
// Namespaces with no remote table (blog, helpDocs, contactMessages,
// statusEntries, copilotSettings, securitySettings, dataSettings,
// webhooks, deliveries, dataExport/dataImport/dataReset) intentionally keep
// the localStorage implementation via the base class.
//
// REALTIME: the constructor calls ensureBrixRealtime(), which subscribes to
// postgres_changes on conversations + messages + visitors (the tables the
// migration publishes) and forwards events to onRemoteChange() listeners
// (re-exported from this module).
// ===========================================================================

import { getSupabase, ensureBrixRealtime } from './supabase-client';
import type { SupabaseClient } from '@supabase/supabase-js';

export { onRemoteChange } from './supabase-client';
export type { RemoteChange, RemoteChangeListener } from './supabase-client';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
type Query = any;

/** Map a PostgREST error to an ApiError. Auth/RLS denials become
 *  'unauthorized' so guard() falls back to the local transport. */
function supaError(e: unknown): ApiError {
  const err = e as { code?: string; message?: string; status?: number };
  const code = err?.code ?? '';
  const msg = err?.message ?? 'Supabase request failed.';
  if (code === 'PGRST116') return new ApiError('not_found', 'Record not found.', 404);
  if (code === '23505') return new ApiError('conflict', msg, 409);
  if (code === '23503') return new ApiError('validation', `Related record not found: ${msg}`, 422);
  if (code === '23514') return new ApiError('validation', msg, 422);
  if (code === '42501' || code === '28000' || err?.status === 401 || err?.status === 403) {
    return new ApiError('unauthorized', msg, err?.status === 401 ? 401 : 403);
  }
  if (err?.status === 400) return new ApiError('validation', msg, 400);
  return new ApiError('supabase_error', msg, err?.status ?? 500);
}

const asArr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const isoOf = (v: unknown): string => (typeof v === 'string' && v ? v : new Date().toISOString());
const msOf = (v: unknown): number => {
  const t = typeof v === 'string' && v ? Date.parse(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(t) ? t : Date.now();
};
/** Escape user text for a PostgREST ilike/or pattern. */
const escLike = (s: string): string => s.replace(/[%_,*()]/g, (c) => `\\${c}`);

// ---- row → API mappers (pure; mirror the migration column names) ----------

const mapProperty = (r: Row): ApiProperty => ({
  id: r.id,
  name: r.name,
  domain: r.domain ?? '',
  public_key: r.public_key,
  widget_config: { ...defaultWidgetConfig(), ...((r.widget_config ?? {}) as WidgetConfig) },
  secure_mode: !!r.secure_mode,
  enabled: r.enabled ?? true,
  created_at: isoOf(r.created_at),
});

const mapMessage = (r: Row): ApiMessage => ({
  id: r.id,
  conversation_id: r.conversation_id,
  sender: (['visitor', 'agent', 'ai', 'system'] as MsgSender[]).includes(r.sender) ? r.sender : 'system',
  kind: (['text', 'file', 'voice', 'rating'] as MsgKind[]).includes(r.kind) ? r.kind : 'text',
  text: r.text ?? '',
  metadata: (r.metadata ?? {}) as Record<string, unknown>,
  created_at: isoOf(r.created_at),
});

const mapContact = (r: Row): ApiContact => ({
  id: r.id,
  name: r.name,
  email: r.email ?? '',
  phone: r.phone ?? '',
  country: r.country ?? '',
  tags: asArr<string>(r.tags),
  notes: r.notes ?? '',
  source: r.source ?? 'chat',
  chats: r.chats_count ?? 0,
  created_at: isoOf(r.created_at),
  last_seen_at: isoOf(r.last_seen_at),
});

/** members table → legacy ApiAgent shape. passcode is NEVER readable
 *  remotely (member_credentials is deny-all); it is '' here by design. */
const mapAgent = (r: Row): ApiAgent => ({
  id: r.id,
  display_name: r.display_name,
  role: r.role ?? 'agent',
  online: r.status === 'online',
  active: r.active ?? true,
  passcode: '',
  created_at: isoOf(r.created_at),
  last_login_at: r.last_login_at ? isoOf(r.last_login_at) : null,
});

const mapTicket = (r: Row): ApiTicket => ({
  id: r.id,
  property_id: r.property_id ?? null,
  subject: r.subject,
  requester_name: r.requester_name ?? 'Guest',
  requester_email: r.requester_email ?? '',
  message: r.message ?? '',
  status: r.status ?? 'new',
  priority: r.priority ?? 'medium',
  assignee_id: r.assignee_id ?? null,
  sla_due: r.sla_due ? isoOf(r.sla_due) : null,
  conversation_id: r.conversation_id ?? null,
  tags: asArr<string>(r.tags),
  category_id: r.category_id ?? null,
  created_at: isoOf(r.created_at),
  updated_at: isoOf(r.updated_at),
});

const mapNotification = (r: Row): ApiNotification => ({
  id: r.id,
  type: r.type,
  title: r.title,
  body: r.body ?? '',
  link: r.link ?? null,
  read: !!r.read,
  created_at: isoOf(r.created_at),
});

const mapRating = (r: Row): ApiRating => ({
  id: r.id,
  property_id: r.property_id,
  conversation_id: r.conversation_id ?? null,
  agent_id: r.member_id ?? null,
  kind: r.kind,
  score: r.score,
  comment: r.comment ?? '',
  created_at: msOf(r.created_at),
});

const mapCategory = (scope: ApiCategory['scope']) => (r: Row): ApiCategory => ({
  id: r.id,
  scope,
  property_id: r.property_id ?? '',
  name: r.name,
  color: r.color ?? '#4f46e5',
  created_at: msOf(r.created_at),
});

const CATEGORY_TABLES: Record<ApiCategory['scope'], string> = {
  kb: 'kb_categories',
  canned: 'canned_categories',
  tickets: 'ticket_categories',
};

const mapView = (r: Row): ApiSavedView => ({
  id: r.id,
  name: r.name,
  filters: (r.filters ?? {}) as ApiSavedView['filters'],
  created_at: isoOf(r.created_at),
});

const mapPlay = (r: Row): ApiPlay => ({
  id: r.id,
  name: r.name,
  steps: asArr<ApiPlayStep>(r.steps),
  created_at: isoOf(r.created_at),
});

const mapGoal = (r: Row): ApiGoal => ({
  id: r.id,
  name: r.name,
  event: r.event,
  revenue: Number(r.revenue ?? 0),
  created_at: isoOf(r.created_at),
});

const mapGoalEvent = (r: Row): ApiGoalEvent => ({
  id: r.id,
  goal_id: r.goal_id,
  conversation_id: r.conversation_id ?? null,
  value: Number(r.value ?? 0),
  created_at: isoOf(r.created_at),
});

const mapCanned = (r: Row): ApiCanned => ({
  id: r.id,
  shortcut: r.shortcut ?? '',
  title: r.title,
  body: r.body ?? '',
  category_id: r.category_id ?? null,
});

/** api_keys: key_hash is excluded from member SELECT grants by design, so it
 *  is always '' here. The raw key is returned once at creation/rotation and
 *  never persisted anywhere. */
const mapApiKey = (r: Row): ApiKeyRecord => ({
  id: r.id,
  name: r.name,
  prefix: r.prefix,
  key_hash: '',
  scopes: asArr<string>(r.scopes),
  revoked: !!r.revoked,
  usage_count: Number(r.usage_count ?? 0),
  last_used_at: r.last_used_at ? isoOf(r.last_used_at) : null,
  created_at: isoOf(r.created_at),
});

const mapAudit = (r: Row): AuditEntry => ({
  id: r.id,
  actor: r.actor_name ?? 'system',
  action: r.action,
  entity: r.entity ?? '',
  entity_id: r.entity_id ?? '',
  meta: (r.meta ?? {}) as Record<string, unknown>,
  created_at: isoOf(r.created_at),
});

const mapUnanswered = (r: Row): ApiUnanswered => ({
  id: r.id,
  question: r.question,
  conversation_id: r.conversation_id ?? null,
  count: r.count ?? 1,
  dismissed: !!r.dismissed,
  created_at: isoOf(r.created_at),
});


// ===========================================================================
// SupabaseBrixApi
// ===========================================================================

export class SupabaseBrixApi extends BrixApi {
  private wsCache: string | null = null;

  constructor(workspace: string, actor = 'system') {
    super(workspace, actor);
    ensureBrixRealtime();
    this.wireNamespaces();
  }

  private sb(): SupabaseClient {
    const c = getSupabase();
    if (!c) throw new ApiError('supabase_unavailable', 'Supabase is not configured.', 503);
    return c;
  }

  private rid(): string {
    return crypto.randomUUID();
  }

  /**
   * Resolve the local workspace slug (e.g. 'demo') to its UUID, caching the
   * result. Throws unauthorized when the workspace is not provisioned in
   * Supabase — guard() then falls back to the local transport, so an
   * un-migrated project keeps working on localStorage.
   */
  private async wsId(): Promise<string> {
    if (this.wsCache) return this.wsCache;
    const { data, error } = await this.sb()
      .from('workspaces')
      .select('id')
      .eq('slug', this.workspace)
      .maybeSingle();
    if (error) throw supaError(error);
    if (!data) {
      throw new ApiError('unauthorized', `Workspace '${this.workspace}' is not provisioned in Supabase.`, 401);
    }
    this.wsCache = (data as Row).id as string;
    return this.wsCache;
  }

  /**
   * Run a remote op; on transport failure (network/auth/RLS/PostgREST)
   * fall back to the localStorage implementation with a non-blocking
   * warning. validation / not_found / conflict / not_supported propagate —
   * they are data errors, not transport errors.
   */
  private async guard<T>(remote: () => Promise<T>, local: () => Promise<T>): Promise<T> {
    try {
      return await remote();
    } catch (e) {
      if (
        e instanceof ApiError &&
        (e.code === 'validation' || e.code === 'not_found' || e.code === 'conflict' || e.code === 'not_supported')
      ) {
        throw e;
      }
      // eslint-disable-next-line no-console
      console.warn('[brix-chat] Supabase transport failed — using local data instead:', e instanceof Error ? e.message : e);
      return local();
    }
  }

  // ---- PostgREST primitives -------------------------------------------------

  /** Select rows scoped to this workspace. */
  private async selWs<T>(table: string, map: (r: Row) => T, mod?: (q: Query) => Query): Promise<T[]> {
    const ws = await this.wsId();
    let q: Query = this.sb().from(table).select('*').eq('workspace_id', ws);
    if (mod) q = mod(q);
    const { data, error } = await q;
    if (error) throw supaError(error);
    return ((data ?? []) as Row[]).map(map);
  }

  private async oneWs<T>(table: string, map: (r: Row) => T, id: string, entity: string): Promise<T> {
    const ws = await this.wsId();
    const { data, error } = await this.sb()
      .from(table)
      .select('*')
      .eq('workspace_id', ws)
      .eq('id', id)
      .maybeSingle();
    if (error) throw supaError(error);
    if (!data) throw new ApiError('not_found', `${entity} ${id} not found.`, 404);
    return map(data as Row);
  }

  private async oneWsRaw(table: string, id: string, entity: string): Promise<Row> {
    return this.oneWs(table, (r: Row) => r, id, entity);
  }

  private async ins<T>(table: string, row: Row, map: (r: Row) => T): Promise<T> {
    const { data, error } = await this.sb().from(table).insert(row).select().single();
    if (error) throw supaError(error);
    return map(data as Row);
  }

  private async updWs<T>(table: string, id: string, patch: Row, map: (r: Row) => T, entity: string): Promise<T> {
    const ws = await this.wsId();
    const { data, error } = await this.sb()
      .from(table)
      .update(patch)
      .eq('workspace_id', ws)
      .eq('id', id)
      .select();
    if (error) throw supaError(error);
    const rows = (data ?? []) as Row[];
    if (!rows.length) throw new ApiError('not_found', `${entity} ${id} not found.`, 404);
    return map(rows[0]);
  }

  private async delWs(table: string, id: string, entity: string): Promise<void> {
    const ws = await this.wsId();
    const { data, error } = await this.sb()
      .from(table)
      .delete()
      .eq('workspace_id', ws)
      .eq('id', id)
      .select('id');
    if (error) throw supaError(error);
    if (!((data ?? []) as Row[]).length) throw new ApiError('not_found', `${entity} ${id} not found.`, 404);
  }

  /** Best-effort audit via the log_audit() RPC (authenticated-only). Audit
   *  must never break the app, so all failures are swallowed. */
  private async auditRemote(action: string, entity: string, entityId = '', meta: Row = {}): Promise<void> {
    try {
      const { error } = await this.sb().rpc('log_audit', {
        p_action: action,
        p_entity: entity,
        p_entity_id: entityId,
        p_meta: meta,
      });
      if (error) throw supaError(error);
    } catch {
      /* audit must never break the app */
    }
  }

  /** Best-effort in-app notification. Swallowed on failure so a notification
   *  can never turn a successful primary write into a local-fallback
   *  duplicate. */
  private async notify(
    type: ApiNotification['type'],
    title: string,
    body: string,
    link: string | null = null,
    memberId: string | null = null,
  ): Promise<void> {
    try {
      const ws = await this.wsId();
      const { error } = await this.sb().from('notifications').insert({
        id: this.rid(),
        workspace_id: ws,
        member_id: memberId,
        type,
        title,
        body,
        link,
        read: false,
      });
      if (error) throw supaError(error);
    } catch {
      /* notifications must never break the app */
    }
  }

  // ---- hydration helpers ----------------------------------------------------

  /** conversations → ApiConversation: joins messages, conversation_notes,
   *  department names and assignee display names. */
  private async hydrateConvs(rows: Row[]): Promise<ApiConversation[]> {
    const ids = rows.map((r) => r.id as string);
    const msgByConv = new Map<string, ApiMessage[]>();
    const notesByConv = new Map<string, ConvNote[]>();
    if (ids.length) {
      const { data: msgs, error: mErr } = await this.sb()
        .from('messages')
        .select('*')
        .in('conversation_id', ids)
        .order('created_at', { ascending: true });
      if (mErr) throw supaError(mErr);
      for (const m of (msgs ?? []) as Row[]) {
        const arr = msgByConv.get(m.conversation_id) ?? [];
        arr.push(mapMessage(m));
        msgByConv.set(m.conversation_id, arr);
      }
      const { data: notes, error: nErr } = await this.sb()
        .from('conversation_notes')
        .select('*')
        .in('conversation_id', ids)
        .order('created_at', { ascending: true });
      if (nErr) throw supaError(nErr);
      for (const n of (notes ?? []) as Row[]) {
        const arr = notesByConv.get(n.conversation_id) ?? [];
        arr.push({ author: n.author_name ?? '', text: n.text ?? '', created_at: isoOf(n.created_at) });
        notesByConv.set(n.conversation_id, arr);
      }
    }
    const depIds = [...new Set(rows.map((r) => r.department_id).filter(Boolean))];
    const memIds = [...new Set(rows.map((r) => r.assignee_id).filter(Boolean))];
    const depName = new Map<string, string>();
    const memName = new Map<string, string>();
    if (depIds.length) {
      const { data, error } = await this.sb().from('departments').select('id,name').in('id', depIds);
      if (!error) for (const d of (data ?? []) as Row[]) depName.set(d.id, d.name);
    }
    if (memIds.length) {
      const { data, error } = await this.sb().from('members').select('id,display_name').in('id', memIds);
      if (!error) for (const m of (data ?? []) as Row[]) memName.set(m.id, m.display_name);
    }
    return rows.map((r) => ({
      id: r.id,
      property_id: r.property_id,
      visitor_name: r.visitor_name ?? 'Guest',
      visitor_email: r.visitor_email ?? '',
      page_url: r.page_url ?? '',
      referrer: r.referrer ?? '',
      status: r.status ?? 'open',
      department: r.department_id ? (depName.get(r.department_id) ?? '') : '',
      agent_id: r.assignee_id ?? null,
      agent_name: r.assignee_id ? (memName.get(r.assignee_id) ?? null) : null,
      tags: asArr<string>(r.tags),
      priority: r.priority ?? 'medium',
      notes: notesByConv.get(r.id) ?? [],
      rating: r.rating ?? null,
      unread: r.unread ?? 0,
      ai_handled: !!r.ai_handled,
      created_at: isoOf(r.created_at),
      updated_at: isoOf(r.updated_at),
      closed_at: r.closed_at ? isoOf(r.closed_at) : null,
      messages: msgByConv.get(r.id) ?? [],
    }));
  }

  /** departments → ApiDepartment: agent_ids come from department_members. */
  private async hydrateDepts(rows: Row[]): Promise<ApiDepartment[]> {
    const ids = rows.map((r) => r.id as string);
    const memByDep = new Map<string, string[]>();
    if (ids.length) {
      const { data, error } = await this.sb()
        .from('department_members')
        .select('department_id,member_id')
        .in('department_id', ids);
      if (error) throw supaError(error);
      for (const j of (data ?? []) as Row[]) {
        const arr = memByDep.get(j.department_id) ?? [];
        arr.push(j.member_id);
        memByDep.set(j.department_id, arr);
      }
    }
    return rows.map((r) => ({
      id: r.id,
      property_id: r.property_id,
      name: r.name,
      description: r.description ?? '',
      agent_ids: memByDep.get(r.id) ?? [],
      routing_mode: r.routing_mode ?? 'round-robin',
      hours_override: r.hours_override ?? null,
      offline_behavior: r.offline_behavior ?? 'message',
      created_at: msOf(r.created_at),
    }));
  }

  /** members → ApiMember: department_ids come from department_members.
   *  passcode is always '' remotely (member_credentials is deny-all). */
  private async hydrateMembers(rows: Row[]): Promise<ApiMember[]> {
    const ids = rows.map((r) => r.id as string);
    const depByMem = new Map<string, string[]>();
    if (ids.length) {
      const { data, error } = await this.sb()
        .from('department_members')
        .select('department_id,member_id')
        .in('member_id', ids);
      if (error) throw supaError(error);
      for (const j of (data ?? []) as Row[]) {
        const arr = depByMem.get(j.member_id) ?? [];
        arr.push(j.department_id);
        depByMem.set(j.member_id, arr);
      }
    }
    return rows.map((r) => ({
      id: r.id,
      display_name: r.display_name,
      initials: r.initials || memberInitials(r.display_name),
      color: r.color ?? '#4f46e5',
      role: r.role ?? 'agent',
      passcode: '',
      last_login: r.last_login_at ? isoOf(r.last_login_at) : null,
      status: r.status ?? 'offline',
      job_title: r.job_title ?? '',
      avatar_data_url: r.avatar_url ?? null,
      department_ids: depByMem.get(r.id) ?? [],
      created_at: isoOf(r.created_at),
    }));
  }

  /** kb_articles → ApiArticle: category name resolved from kb_categories. */
  private async hydrateArticles(rows: Row[]): Promise<ApiArticle[]> {
    const ws = await this.wsId();
    const catName = new Map<string, string>();
    const { data, error } = await this.sb()
      .from('kb_categories')
      .select('id,name')
      .eq('workspace_id', ws);
    if (!error) for (const c of (data ?? []) as Row[]) catName.set(c.id, c.name);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      body: r.body ?? '',
      category: r.category_id ? (catName.get(r.category_id) ?? '') : 'General',
      category_id: r.category_id ?? null,
      status: r.status ?? 'draft',
      views: r.views ?? 0,
      updated_at: isoOf(r.updated_at),
    }));
  }

  /** Sync the department_members join rows for one department or member. */
  private async syncDeptMembers(departmentId: string, memberIds: string[]): Promise<void> {
    const { error: delErr } = await this.sb()
      .from('department_members')
      .delete()
      .eq('department_id', departmentId);
    if (delErr) throw supaError(delErr);
    if (memberIds.length) {
      const { error: insErr } = await this.sb()
        .from('department_members')
        .insert(memberIds.map((member_id) => ({ department_id: departmentId, member_id })));
      if (insErr) throw supaError(insErr);
    }
  }

  /** Resolve a department name to its UUID within a property (null when absent). */
  private async deptIdByName(propertyId: string, name: string): Promise<string | null> {
    const ws = await this.wsId();
    const { data, error } = await this.sb()
      .from('departments')
      .select('id')
      .eq('workspace_id', ws)
      .eq('property_id', propertyId)
      .ilike('name', name)
      .maybeSingle();
    if (error) throw supaError(error);
    return (data as Row | null)?.id ?? null;
  }


  private wireNamespaces(): void {
    // ---- properties -----------------------------------------------------
    const base_properties = this.properties;
    this.properties = {
      ...base_properties,
      list: () =>
        this.guard(
          async () => ({
            data: await this.selWs('properties', mapProperty, (q) => q.order('created_at', { ascending: false })),
          }),
          () => base_properties.list(),
        ),
      get: (id: string) =>
        this.guard(async () => ({ data: await this.oneWs('properties', mapProperty, id, 'Property') }), () =>
          base_properties.get(id),
        ),
      getByPublicKey: (publicKey: string) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            const { data, error } = await this.sb()
              .from('properties')
              .select('*')
              .eq('workspace_id', ws)
              .eq('public_key', publicKey)
              .maybeSingle();
            if (error) throw supaError(error);
            if (!data) throw new ApiError('not_found', `No property with public key ${publicKey}.`, 404);
            return { data: mapProperty(data as Row) };
          },
          () => base_properties.getByPublicKey(publicKey),
        ),
      create: (input: { name: string; domain?: string }) =>
        this.guard(
          async () => {
            if (!input.name.trim()) throw new ApiError('validation', 'Property name is required.', 422);
            const ws = await this.wsId();
            const row = {
              id: this.rid(),
              workspace_id: ws,
              name: input.name.trim(),
              domain: (input.domain ?? '').trim(),
              public_key: `bx_${randomHex(9)}`,
              widget_config: defaultWidgetConfig(),
              secure_mode: false,
            };
            const out = await this.ins('properties', row, mapProperty);
            await this.auditRemote('property.created', 'property', row.id, { name: row.name });
            return { data: out };
          },
          () => base_properties.create(input),
        ),
      update: (id: string, patch: Partial<Pick<ApiProperty, 'name' | 'domain' | 'secure_mode' | 'enabled'>>) =>
        this.guard(
          // enabled is a local-only flag for now — no properties.enabled column exists remotely.
          async () => {
            const { enabled: _enabled, ...remote } = patch;
            return { data: await this.updWs('properties', id, { ...remote }, mapProperty, 'Property') };
          },
          () => base_properties.update(id, patch),
        ),
      regenerateKey: (id: string) =>
        this.guard(
          async () => {
            const public_key = `bx_${randomHex(9)}`;
            await this.updWs('properties', id, { public_key }, mapProperty, 'Property');
            await this.auditRemote('property.key_regenerated', 'property', id, {});
            return { data: { public_key } };
          },
          () => base_properties.regenerateKey(id),
        ),
      remove: (id: string) =>
        this.guard(
          async () => {
            await this.delWs('properties', id, 'Property');
            await this.auditRemote('property.deleted', 'property', id, {});
            return { data: { deleted: true as const } };
          },
          () => base_properties.remove(id),
        ),
    };

    // ---- widget config ----------------------------------------------------
    const base_widget = this.widget;
    this.widget = {
      ...base_widget,
      getConfig: (propertyId: string) =>
        this.guard(
          async () => ({ data: (await this.oneWs('properties', mapProperty, propertyId, 'Property')).widget_config }),
          () => base_widget.getConfig(propertyId),
        ),
      updateConfig: (propertyId: string, patch: Partial<WidgetConfig>) =>
        this.guard(
          async () => {
            const p = await this.oneWs('properties', mapProperty, propertyId, 'Property');
            const widget_config = { ...p.widget_config, ...patch };
            await this.updWs('properties', propertyId, { widget_config }, mapProperty, 'Property');
            await this.auditRemote('widget.updated', 'property', propertyId, patch as Row);
            return { data: widget_config };
          },
          () => base_widget.updateConfig(propertyId, patch),
        ),
    };

    // ---- conversations --------------------------------------------------
    const base_conversations = this.conversations;
    this.conversations = {
      ...base_conversations,
      list: (
        opts: { propertyId?: string; status?: ConvStatus; tag?: string; priority?: TicketPriority; assignee?: string; q?: string } & ListOpts = {},
      ) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            let q: Query = this.sb()
              .from('conversations')
              .select('*')
              .eq('workspace_id', ws)
              .order('updated_at', { ascending: false });
            if (opts.propertyId) q = q.eq('property_id', opts.propertyId);
            if (opts.status) q = q.eq('status', opts.status);
            if (opts.priority) q = q.eq('priority', opts.priority);
            if (opts.tag) q = q.contains('tags', [opts.tag]);
            if (opts.assignee) {
              q = opts.assignee === 'unassigned' ? q.is('assignee_id', null) : q.eq('assignee_id', opts.assignee);
            }
            const { data, error } = await q;
            if (error) throw supaError(error);
            let convs = await this.hydrateConvs((data ?? []) as Row[]);
            if (opts.q) {
              const ql = opts.q.toLowerCase();
              convs = convs.filter(
                (c) =>
                  c.visitor_name.toLowerCase().includes(ql) ||
                  c.messages.some((m) => m.text.toLowerCase().includes(ql)),
              );
            }
            return { data: paginate(convs, opts) };
          },
          () => base_conversations.list(opts),
        ),
      get: (id: string) =>
        this.guard(
          async () => ({ data: (await this.hydrateConvs([await this.oneWsRaw('conversations', id, 'Conversation')]))[0] }),
          () => base_conversations.get(id),
        ),
      startSession: (propertyId: string, visitor: { name?: string; email?: string; page_url?: string; referrer?: string }) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            const prop = await this.oneWs('properties', mapProperty, propertyId, 'Property');
            const convId = this.rid();
            const department_id = await this.deptIdByName(propertyId, 'Support').catch(() => null);
            await this.ins('conversations', {
              id: convId,
              workspace_id: ws,
              property_id: propertyId,
              visitor_name: visitor.name?.trim() || 'Guest',
              visitor_email: visitor.email?.trim() || '',
              page_url: visitor.page_url || '',
              referrer: visitor.referrer || '',
              status: 'open',
              department_id,
            }, (r: Row) => r);
            const greeting = await this.ins('messages', {
              id: this.rid(),
              workspace_id: ws,
              conversation_id: convId,
              sender: 'agent',
              kind: 'text',
              text: prop.widget_config.greeting,
              metadata: {},
            }, mapMessage);
            await this.auditRemote('conversation.started', 'conversation', convId, { visitor: visitor.name || 'Guest' });
            const [conv] = await this.hydrateConvs([await this.oneWsRaw('conversations', convId, 'Conversation')]);
            conv.messages = [greeting, ...conv.messages.filter((m) => m.id !== greeting.id)];
            return { data: conv };
          },
          () => base_conversations.startSession(propertyId, visitor),
        ),
      sendMessage: (id: string, input: { sender: MsgSender; text: string; kind?: MsgKind; metadata?: Record<string, unknown> }) =>
        this.guard(
          async () => {
            if (!input.text.trim()) throw new ApiError('validation', 'Message text is required.', 422);
            const row = await this.oneWsRaw('conversations', id, 'Conversation');
            const m = await this.ins('messages', {
              id: this.rid(),
              workspace_id: row.workspace_id,
              conversation_id: id,
              sender: input.sender,
              kind: input.kind ?? 'text',
              text: input.text.trim(),
              metadata: input.metadata ?? {},
            }, mapMessage);
            const patch: Row = {};
            if (input.sender === 'visitor') patch.unread = (row.unread ?? 0) + 1;
            if (row.status !== 'open') {
              patch.status = 'open';
              patch.closed_at = null;
            }
            if (Object.keys(patch).length) await this.updWs('conversations', id, patch, (r: Row) => r, 'Conversation');
            return { data: m };
          },
          () => base_conversations.sendMessage(id, input),
        ),
      assign: (id: string, input: { agent_id?: string | null; department?: string }) =>
        this.guard(
          async () => {
            const row = await this.oneWsRaw('conversations', id, 'Conversation');
            const patch: Row = {};
            if (input.agent_id !== undefined) {
              patch.assignee_id = input.agent_id;
              if (input.agent_id) {
                const mem = await this.oneWsRaw('members', input.agent_id, 'Member');
                await this.auditRemote('conversation.assigned', 'conversation', id, {
                  agent: mem.display_name,
                  department: input.department,
                });
              }
            }
            if (input.department) {
              patch.department_id = await this.deptIdByName(row.property_id, input.department);
            }
            const updated = await this.updWs('conversations', id, patch, (r: Row) => r, 'Conversation');
            return { data: (await this.hydrateConvs([updated]))[0] };
          },
          () => base_conversations.assign(id, input),
        ),
      transfer: (id: string, target: { agent_id?: string | null; department_id?: string | null }, note: string) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            const [conv] = await this.hydrateConvs([await this.oneWsRaw('conversations', id, 'Conversation')]);
            const fromAgent = conv.agent_name ?? 'Unassigned';
            const fromDept = conv.department;
            const patch: Row = {};
            let toAgent = 'Unassigned';
            if (target.agent_id !== undefined) {
              patch.assignee_id = target.agent_id;
              if (target.agent_id) {
                const mem = await this.oneWsRaw('members', target.agent_id, 'Member');
                toAgent = mem.display_name;
              }
            } else {
              toAgent = fromAgent;
            }
            let toDept = fromDept;
            if (target.department_id) {
              const dep = await this.oneWsRaw('departments', target.department_id, 'Department');
              patch.department_id = dep.id;
              toDept = dep.name;
            }
            const summary = `Transferred from ${fromAgent} (${fromDept}) to ${toAgent} (${toDept})${note.trim() ? ` — ${note.trim()}` : ''}`;
            await this.updWs('conversations', id, patch, (r: Row) => r, 'Conversation');
            await this.ins('conversation_notes', {
              id: this.rid(),
              workspace_id: ws,
              conversation_id: id,
              author_name: this.actor,
              text: summary,
            }, (r: Row) => r);
            await this.ins('messages', {
              id: this.rid(),
              workspace_id: ws,
              conversation_id: id,
              sender: 'system',
              kind: 'text',
              text: `🔀 ${summary}`,
              metadata: { transfer: true },
            }, mapMessage);
            if (target.agent_id) {
              await this.notify('chat.assigned', `Chat transferred to ${toAgent}`, `${conv.visitor_name} — ${summary}`, `/app?c=${id}`, target.agent_id);
            }
            await this.auditRemote('conversation.transferred', 'conversation', id, {
              from: `${fromAgent} / ${fromDept}`,
              to: `${toAgent} / ${toDept}`,
              note: note.trim(),
            });
            return { data: (await this.hydrateConvs([await this.oneWsRaw('conversations', id, 'Conversation')]))[0] };
          },
          () => base_conversations.transfer(id, target, note),
        ),
      setStatus: (id: string, status: ConvStatus) =>
        this.guard(
          async () => {
            const row = await this.oneWsRaw('conversations', id, 'Conversation');
            const patch: Row = { status, closed_at: status === 'closed' ? new Date().toISOString() : null };
            if (status !== 'open') patch.unread = 0;
            const updated = await this.updWs('conversations', id, patch, (r: Row) => r, 'Conversation');
            await this.auditRemote('conversation.status_changed', 'conversation', id, { from: row.status, to: status });
            return { data: (await this.hydrateConvs([updated]))[0] };
          },
          () => base_conversations.setStatus(id, status),
        ),
      setTags: (id: string, tags: string[]) =>
        this.guard(
          async () => {
            const clean = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
            const updated = await this.updWs('conversations', id, { tags: clean }, (r: Row) => r, 'Conversation');
            return { data: (await this.hydrateConvs([updated]))[0] };
          },
          () => base_conversations.setTags(id, tags),
        ),
      addNote: (id: string, input: { author: string; text: string }) =>
        this.guard(
          async () => {
            if (!input.text.trim()) throw new ApiError('validation', 'Note text is required.', 422);
            const row = await this.oneWsRaw('conversations', id, 'Conversation');
            const { data, error } = await this.sb()
              .from('conversation_notes')
              .insert({
                id: this.rid(),
                workspace_id: row.workspace_id,
                conversation_id: id,
                author_name: input.author,
                text: input.text.trim(),
              })
              .select()
              .single();
            if (error) throw supaError(error);
            const n: ConvNote = {
              author: (data as Row).author_name ?? '',
              text: (data as Row).text ?? '',
              created_at: isoOf((data as Row).created_at),
            };
            return { data: n };
          },
          () => base_conversations.addNote(id, input),
        ),
      setRating: (id: string, rating: number) =>
        this.guard(
          async () => {
            if (rating < 1 || rating > 5) throw new ApiError('validation', 'Rating must be 1–5.', 422);
            const updated = await this.updWs('conversations', id, { rating }, (r: Row) => r, 'Conversation');
            return { data: (await this.hydrateConvs([updated]))[0] };
          },
          () => base_conversations.setRating(id, rating),
        ),
      markRead: (id: string) =>
        this.guard(
          async () => {
            await this.updWs('conversations', id, { unread: 0 }, (r: Row) => r, 'Conversation');
            return { data: { unread: 0 } };
          },
          () => base_conversations.markRead(id),
        ),
    };

    // ---- contacts ---------------------------------------------------------
    const base_contacts = this.contacts;
    this.contacts = {
      ...base_contacts,
      list: (opts: { q?: string; tag?: string } & ListOpts = {}) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            let q: Query = this.sb()
              .from('contacts')
              .select('*')
              .eq('workspace_id', ws)
              .order('last_seen_at', { ascending: false });
            if (opts.q) {
              const t = `%${escLike(opts.q.trim())}%`;
              q = q.or(`name.ilike.${t},email.ilike.${t}`);
            }
            if (opts.tag) q = q.contains('tags', [opts.tag]);
            const { data, error } = await q;
            if (error) throw supaError(error);
            return { data: paginate(((data ?? []) as Row[]).map(mapContact), opts) };
          },
          () => base_contacts.list(opts),
        ),
      get: (id: string) =>
        this.guard(async () => ({ data: await this.oneWs('contacts', mapContact, id, 'Contact') }), () =>
          base_contacts.get(id),
        ),
      create: (input: { name: string; email?: string; phone?: string; country?: string; tags?: string[]; notes?: string; source?: string }) =>
        this.guard(
          async () => {
            if (!input.name.trim()) throw new ApiError('validation', 'Contact name is required.', 422);
            const ws = await this.wsId();
            const out = await this.ins('contacts', {
              id: this.rid(),
              workspace_id: ws,
              name: input.name.trim(),
              email: (input.email ?? '').trim(),
              phone: (input.phone ?? '').trim(),
              country: (input.country ?? '').trim(),
              tags: input.tags ?? [],
              notes: input.notes ?? '',
              source: input.source ?? 'api',
            }, mapContact);
            await this.auditRemote('contact.created', 'contact', out.id, { name: out.name });
            return { data: out };
          },
          () => base_contacts.create(input),
        ),
      update: (id: string, patch: Partial<Pick<ApiContact, 'name' | 'email' | 'phone' | 'country' | 'tags' | 'notes'>>) =>
        this.guard(
          async () => {
            const row: Row = { ...patch, last_seen_at: new Date().toISOString() };
            const out = await this.updWs('contacts', id, row, mapContact, 'Contact');
            await this.auditRemote('contact.updated', 'contact', id, patch as Row);
            return { data: out };
          },
          () => base_contacts.update(id, patch),
        ),
      remove: (id: string) =>
        this.guard(
          async () => {
            await this.delWs('contacts', id, 'Contact');
            await this.auditRemote('contact.deleted', 'contact', id, {});
            return { data: { deleted: true as const } };
          },
          () => base_contacts.remove(id),
        ),
    };

    // ---- agents / team (legacy surface → members table) --------------------
    const base_agents = this.agents;
    this.agents = {
      ...base_agents,
      list: () =>
        this.guard(
          async () => ({
            data: await this.selWs('members', mapAgent, (q) => q.order('display_name', { ascending: true })),
          }),
          () => base_agents.list(),
        ),
      invite: (input: { display_name: string; role?: TeamRole }) =>
        this.guard(
          async () => {
            const name = input.display_name.trim();
            if (!name) throw new ApiError('validation', 'Display name is required.', 422);
            const ws = await this.wsId();
            const existing = await this.selWs('members', (r: Row) => r.display_name as string);
            if (existing.some((n) => n.toLowerCase() === name.toLowerCase())) {
              throw new ApiError('conflict', 'A team member with that name already exists.', 409);
            }
            const passcode = String(Math.floor(100000 + Math.random() * 900000));
            const id = this.rid();
            await this.ins('members', {
              id,
              workspace_id: ws,
              display_name: name,
              initials: memberInitials(name),
              color: ['#4f46e5', '#0891b2', '#059669', '#f59e0b', '#8b5cf6'][existing.length % 5],
              role: input.role ?? 'agent',
              status: 'offline',
            }, (r: Row) => r);
            // Store the passcode hash server-side when the session allows it
            // (member_set_passcode is authenticated-only; without a session
            // the member exists but the passcode must be set from team
            // settings once signed in).
            try {
              const { error } = await this.sb().rpc('member_set_passcode', { p_member_id: id, p_passcode: passcode });
              if (error) throw supaError(error);
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn('[brix-chat] invite: passcode could not be stored remotely:', e instanceof Error ? e.message : e);
            }
            await this.auditRemote('agent.invited', 'agent', id, { name, role: input.role ?? 'agent' });
            const agent = await this.oneWs('members', mapAgent, id, 'Agent');
            return { data: { agent: { ...agent, passcode }, passcode } };
          },
          () => base_agents.invite(input),
        ),
      update: (id: string, patch: Partial<Pick<ApiAgent, 'role' | 'online' | 'display_name'>>) =>
        this.guard(
          async () => {
            const row: Row = {};
            if (patch.role !== undefined) row.role = patch.role;
            if (patch.display_name !== undefined) {
              if (!patch.display_name.trim()) throw new ApiError('validation', 'Display name is required.', 422);
              row.display_name = patch.display_name.trim();
              row.initials = memberInitials(row.display_name);
            }
            if (patch.online !== undefined) row.status = patch.online ? 'online' : 'offline';
            const out = await this.updWs('members', id, row, mapAgent, 'Agent');
            await this.auditRemote('agent.updated', 'agent', id, patch as Row);
            return { data: out };
          },
          () => base_agents.update(id, patch),
        ),
      remove: (id: string) =>
        this.guard(
          async () => {
            await this.delWs('members', id, 'Agent');
            await this.auditRemote('agent.removed', 'agent', id, {});
            return { data: { deleted: true as const } };
          },
          () => base_agents.remove(id),
        ),
    };

    // ---- tickets ------------------------------------------------------------
    const base_tickets = this.tickets;
    this.tickets = {
      ...base_tickets,
      list: (opts: { status?: TicketStatus; priority?: TicketPriority; assignee?: string; q?: string; category?: string } & ListOpts = {}) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            let q: Query = this.sb()
              .from('tickets')
              .select('*')
              .eq('workspace_id', ws)
              .order('created_at', { ascending: false });
            if (opts.status) q = q.eq('status', opts.status);
            if (opts.priority) q = q.eq('priority', opts.priority);
            if (opts.category) q = q.eq('category_id', opts.category);
            if (opts.assignee) {
              q = opts.assignee === 'unassigned' ? q.is('assignee_id', null) : q.eq('assignee_id', opts.assignee);
            }
            const { data, error } = await q;
            if (error) throw supaError(error);
            let items = ((data ?? []) as Row[]).map(mapTicket);
            if (opts.q) {
              const ql = opts.q.toLowerCase();
              items = items.filter(
                (t) =>
                  t.subject.toLowerCase().includes(ql) ||
                  t.requester_name.toLowerCase().includes(ql) ||
                  t.requester_email.toLowerCase().includes(ql) ||
                  t.message.toLowerCase().includes(ql),
              );
            }
            return { data: paginate(items, opts) };
          },
          () => base_tickets.list(opts),
        ),
      get: (id: string) =>
        this.guard(async () => ({ data: await this.oneWs('tickets', mapTicket, id, 'Ticket') }), () =>
          base_tickets.get(id),
        ),
      create: (input: {
        subject: string; requester_name: string; requester_email?: string; message: string;
        property_id?: string | null; priority?: TicketPriority; assignee_id?: string | null;
        sla_due?: string | null; conversation_id?: string | null; tags?: string[]; category_id?: string | null;
      }) =>
        this.guard(
          async () => {
            if (!input.subject.trim() || !input.message.trim()) {
              throw new ApiError('validation', 'Subject and message are required.', 422);
            }
            const ws = await this.wsId();
            const out = await this.ins('tickets', {
              id: this.rid(),
              workspace_id: ws,
              property_id: input.property_id ?? null,
              subject: input.subject.trim(),
              message: input.message.trim(),
              requester_name: input.requester_name.trim() || 'Guest',
              requester_email: (input.requester_email ?? '').trim(),
              status: 'new',
              priority: input.priority ?? 'medium',
              assignee_id: input.assignee_id ?? null,
              sla_due: input.sla_due ?? null,
              conversation_id: input.conversation_id ?? null,
              tags: input.tags ?? [],
              category_id: input.category_id ?? null,
            }, mapTicket);
            await this.auditRemote('ticket.created', 'ticket', out.id, { subject: out.subject, priority: out.priority });
            await this.notify('ticket.created', `New ticket: ${out.subject}`, `From ${out.requester_name} · priority ${out.priority}`, '/app/tickets');
            return { data: out };
          },
          () => base_tickets.create(input),
        ),
      update: (id: string, patch: Partial<Pick<ApiTicket, 'subject' | 'message' | 'requester_name' | 'requester_email' | 'tags' | 'sla_due' | 'property_id' | 'status' | 'priority' | 'assignee_id' | 'category_id'>>) =>
        this.guard(
          async () => {
            const out = await this.updWs('tickets', id, { ...patch }, mapTicket, 'Ticket');
            await this.auditRemote('ticket.updated', 'ticket', id, patch as Row);
            return { data: out };
          },
          () => base_tickets.update(id, patch),
        ),
      setStatus: (id: string, status: TicketStatus) =>
        this.guard(
          async () => {
            const row = await this.oneWsRaw('tickets', id, 'Ticket');
            const out = await this.updWs('tickets', id, { status }, mapTicket, 'Ticket');
            await this.auditRemote('ticket.status_changed', 'ticket', id, { from: row.status, to: status });
            return { data: out };
          },
          () => base_tickets.setStatus(id, status),
        ),
      assign: (id: string, agentId: string | null) =>
        this.guard(
          async () => {
            const out = await this.updWs('tickets', id, { assignee_id: agentId }, mapTicket, 'Ticket');
            let name: string | null = null;
            if (agentId) {
              const mem = await this.oneWsRaw('members', agentId, 'Member');
              name = mem.display_name;
            }
            await this.auditRemote('ticket.assigned', 'ticket', id, { assignee: name });
            if (agentId) {
              await this.notify('chat.assigned', `Ticket assigned to ${name}`, out.subject, '/app/tickets', agentId);
            }
            return { data: out };
          },
          () => base_tickets.assign(id, agentId),
        ),
      setPriority: (id: string, p: TicketPriority) =>
        this.guard(
          async () => {
            const row = await this.oneWsRaw('tickets', id, 'Ticket');
            const out = await this.updWs('tickets', id, { priority: p }, mapTicket, 'Ticket');
            await this.auditRemote('ticket.priority_changed', 'ticket', id, { from: row.priority, to: p });
            return { data: out };
          },
          () => base_tickets.setPriority(id, p),
        ),
      bulk: (ids: string[], action: 'resolve' | 'assign' | 'spam', agentId?: string) =>
        this.guard(
          async () => {
            if (!ids.length) throw new ApiError('validation', 'Select at least one ticket.', 422);
            if (action === 'assign' && !agentId) throw new ApiError('validation', 'An assignee is required for bulk assign.', 422);
            const ws = await this.wsId();
            let updated = 0;
            for (const tid of ids) {
              const patch: Row = {};
              if (action === 'resolve') patch.status = 'resolved';
              if (action === 'assign') patch.assignee_id = agentId ?? null;
              if (action === 'spam') {
                patch.status = 'resolved';
                const row = await this.oneWsRaw('tickets', tid, 'Ticket').catch(() => null);
                if (!row) continue;
                const tags = asArr<string>(row.tags);
                if (!tags.includes('spam')) tags.push('spam');
                patch.tags = tags;
              }
              const { data, error } = await this.sb()
                .from('tickets')
                .update(patch)
                .eq('workspace_id', ws)
                .eq('id', tid)
                .select('id');
              if (error) throw supaError(error);
              if ((data ?? []).length) updated += 1;
            }
            await this.auditRemote(`ticket.bulk_${action}`, 'ticket', ids.join(','), { count: updated });
            return { data: { updated } };
          },
          () => base_tickets.bulk(ids, action, agentId),
        ),
      fromConversation: (convId: string, input: { subject?: string; message?: string; priority?: TicketPriority; requester_name?: string; requester_email?: string }) =>
        this.guard(
          async () => {
            const [conv] = await this.hydrateConvs([await this.oneWsRaw('conversations', convId, 'Conversation')]);
            const name = input.requester_name ?? conv.visitor_name ?? 'Guest';
            const email = input.requester_email ?? conv.visitor_email ?? '';
            const transcript = conv.messages.map((m) => `${m.sender}: ${m.text}`).join('\n');
            const subject = input.subject?.trim() || `Chat with ${name}${conv.page_url ? ` (${conv.page_url})` : ''}`;
            const message = input.message?.trim() || transcript || 'Created from chat.';
            return this.tickets.create({
              subject,
              requester_name: name,
              requester_email: email,
              message,
              property_id: conv.property_id,
              priority: input.priority ?? conv.priority ?? 'medium',
              conversation_id: convId,
              tags: conv.tags ?? [],
            });
          },
          () => base_tickets.fromConversation(convId, input),
        ),
    };


    // ---- notifications ----------------------------------------------------
    const base_notifications = this.notifications;
    this.notifications = {
      ...base_notifications,
      list: (opts: { unreadOnly?: boolean } & ListOpts = {}) =>
        this.guard(
          async () => {
            let items = await this.selWs('notifications', mapNotification, (q) =>
              q.order('created_at', { ascending: false }),
            );
            if (opts.unreadOnly) items = items.filter((n) => !n.read);
            return { data: paginate(items, opts) };
          },
          () => base_notifications.list(opts),
        ),
      markRead: (id: string) =>
        this.guard(
          async () => ({ data: await this.updWs('notifications', id, { read: true }, mapNotification, 'Notification') }),
          () => base_notifications.markRead(id),
        ),
      markAllRead: () =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            const { data, error } = await this.sb()
              .from('notifications')
              .update({ read: true })
              .eq('workspace_id', ws)
              .eq('read', false)
              .select('id');
            if (error) throw supaError(error);
            return { data: { read: ((data ?? []) as Row[]).length } };
          },
          () => base_notifications.markAllRead(),
        ),
      push: (type: ApiNotification['type'], title: string, body: string, link: string | null = null) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            const out = await this.ins('notifications', {
              id: this.rid(),
              workspace_id: ws,
              member_id: null,
              type,
              title,
              body,
              link,
              read: false,
            }, mapNotification);
            return { data: out };
          },
          () => base_notifications.push(type, title, body, link),
        ),
    };

    // ---- ratings (CSAT + NPS) -------------------------------------------------
    const base_ratings = this.ratings;
    this.ratings = {
      ...base_ratings,
      create: (input: {
        property_id: string; conversation_id?: string | null; agent_id?: string | null;
        kind: 'csat' | 'nps'; score: number; comment?: string;
      }) =>
        this.guard(
          async () => {
            if (!input.property_id?.trim()) throw new ApiError('validation', 'property_id is required.', 422);
            if (!Number.isFinite(input.score)) throw new ApiError('validation', 'Score must be a number.', 422);
            if (input.kind === 'csat' && (input.score < 1 || input.score > 5)) {
              throw new ApiError('validation', 'CSAT score must be between 1 and 5.', 422);
            }
            if (input.kind === 'nps' && (input.score < 0 || input.score > 10)) {
              throw new ApiError('validation', 'NPS score must be between 0 and 10.', 422);
            }
            const ws = await this.wsId();
            const out = await this.ins('ratings', {
              id: this.rid(),
              workspace_id: ws,
              property_id: input.property_id,
              conversation_id: input.conversation_id ?? null,
              member_id: input.agent_id ?? null,
              kind: input.kind,
              score: input.score,
              comment: (input.comment ?? '').trim(),
            }, mapRating);
            await this.auditRemote('rating.created', 'rating', out.id, { kind: out.kind, score: out.score });
            const isLow = input.kind === 'csat' ? input.score <= 2 : input.score <= 6;
            if (isLow) {
              const scale = input.kind === 'csat' ? '5' : '10';
              await this.notify(
                'system',
                'New low rating',
                `${input.kind.toUpperCase()} ${input.score}/${scale}${out.comment ? ` — "${out.comment}"` : ''}`,
                out.conversation_id ? `/app?c=${out.conversation_id}` : '/app/analytics',
              );
            }
            return { data: out };
          },
          () => base_ratings.create(input),
        ),
      list: (opts: {
        property_id?: string; agent_id?: string; kind?: 'csat' | 'nps'; from?: number; to?: number;
      } & ListOpts = {}) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            let q: Query = this.sb()
              .from('ratings')
              .select('*')
              .eq('workspace_id', ws)
              .order('created_at', { ascending: false });
            if (opts.property_id) q = q.eq('property_id', opts.property_id);
            if (opts.agent_id) q = q.eq('member_id', opts.agent_id);
            if (opts.kind) q = q.eq('kind', opts.kind);
            if (opts.from !== undefined) q = q.gte('created_at', new Date(opts.from).toISOString());
            if (opts.to !== undefined) q = q.lte('created_at', new Date(opts.to).toISOString());
            const { data, error } = await q;
            if (error) throw supaError(error);
            return { data: paginate(((data ?? []) as Row[]).map(mapRating), opts) };
          },
          () => base_ratings.list(opts),
        ),
      summary: (propertyId: string, days = 30) =>
        this.guard(
          async () => {
            const cutoff = Date.now() - days * 86400000;
            const ws = await this.wsId();
            const { data, error } = await this.sb()
              .from('ratings')
              .select('*')
              .eq('workspace_id', ws)
              .eq('property_id', propertyId)
              .gte('created_at', new Date(cutoff).toISOString());
            if (error) throw supaError(error);
            const items = ((data ?? []) as Row[]).map(mapRating);
            const csat = items.filter((r) => r.kind === 'csat');
            const nps = items.filter((r) => r.kind === 'nps');
            const round1 = (n: number) => Math.round(n * 10) / 10;
            const avg = (xs: ApiRating[]) => (xs.length ? round1(xs.reduce((a, r) => a + r.score, 0) / xs.length) : null);
            const promoters = nps.filter((r) => r.score >= 9).length;
            const passives = nps.filter((r) => r.score === 7 || r.score === 8).length;
            const detractors = nps.filter((r) => r.score <= 6).length;
            const nps_score = nps.length
              ? Math.round((promoters / nps.length) * 100 - (detractors / nps.length) * 100)
              : null;
            const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);
            const trend: Array<{ day: string; csat_avg: number | null; nps_avg: number | null; count: number }> = [];
            for (let i = days - 1; i >= 0; i--) {
              const key = dayKey(Date.now() - i * 86400000);
              const dayItems = items.filter((r) => dayKey(r.created_at) === key);
              trend.push({
                day: key,
                csat_avg: avg(dayItems.filter((r) => r.kind === 'csat')),
                nps_avg: avg(dayItems.filter((r) => r.kind === 'nps')),
                count: dayItems.length,
              });
            }
            return {
              data: {
                csat_avg: avg(csat),
                csat_count: csat.length,
                nps_score,
                nps_count: nps.length,
                promoters,
                passives,
                detractors,
                trend,
              },
            };
          },
          () => base_ratings.summary(propertyId, days),
        ),
    };

    // ---- departments --------------------------------------------------------
    const base_departments = this.departments;
    this.departments = {
      ...base_departments,
      list: (propertyId: string) =>
        this.guard(
          async () => ({
            data: await this.hydrateDepts(
              await this.selWs('departments', (r: Row) => r, (q) => q.eq('property_id', propertyId)),
            ),
          }),
          () => base_departments.list(propertyId),
        ),
      create: (propertyId: string, input: {
        name: string; description?: string; agent_ids?: string[];
        routing_mode?: ApiDepartment['routing_mode'];
        hours_override?: ApiDepartment['hours_override'];
        offline_behavior?: ApiDepartment['offline_behavior'];
      }) =>
        this.guard(
          async () => {
            if (!input.name.trim()) throw new ApiError('validation', 'Department name is required.', 422);
            const ws = await this.wsId();
            const id = this.rid();
            const row = await this.ins('departments', {
              id,
              workspace_id: ws,
              property_id: propertyId,
              name: input.name.trim(),
              description: (input.description ?? '').trim(),
              routing_mode: input.routing_mode ?? 'round-robin',
              hours_override: input.hours_override ?? null,
              offline_behavior: input.offline_behavior ?? 'message',
            }, (r: Row) => r);
            try {
              await this.syncDeptMembers(id, input.agent_ids ?? []);
            } catch (e) {
              // Roll back the department so a half-created row never lingers.
              await this.delWs('departments', id, 'Department').catch(() => undefined);
              throw e;
            }
            await this.auditRemote('department.created', 'department', id, { name: row.name, property: propertyId });
            return { data: (await this.hydrateDepts([row]))[0] };
          },
          () => base_departments.create(propertyId, input),
        ),
      update: (id: string, patch: Partial<Pick<ApiDepartment, 'name' | 'description' | 'agent_ids' | 'routing_mode' | 'hours_override' | 'offline_behavior'>>) =>
        this.guard(
          async () => {
            const row: Row = {};
            if (patch.name !== undefined) {
              if (!patch.name.trim()) throw new ApiError('validation', 'Department name is required.', 422);
              row.name = patch.name.trim();
            }
            if (patch.description !== undefined) row.description = patch.description;
            if (patch.routing_mode !== undefined) row.routing_mode = patch.routing_mode;
            if (patch.hours_override !== undefined) row.hours_override = patch.hours_override;
            if (patch.offline_behavior !== undefined) row.offline_behavior = patch.offline_behavior;
            const updated = await this.updWs('departments', id, row, (r: Row) => r, 'Department');
            if (patch.agent_ids !== undefined) await this.syncDeptMembers(id, [...patch.agent_ids]);
            await this.auditRemote('department.updated', 'department', id, patch as Row);
            return { data: (await this.hydrateDepts([updated]))[0] };
          },
          () => base_departments.update(id, patch),
        ),
      delete: (id: string) =>
        this.guard(
          async () => {
            await this.delWs('departments', id, 'Department');
            await this.auditRemote('department.deleted', 'department', id, {});
            return { data: { deleted: true as const } };
          },
          () => base_departments.delete(id),
        ),
    };

    // ---- smart routing --------------------------------------------------------
    // No routing_counters table in the migration: round-robin counters are
    // kept in this browser's localStorage (per workspace+department).
    const base_routing = this.routing;
    this.routing = {
      ...base_routing,
      routeChat: (propertyId: string, departmentId?: string | null) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            const depts = await this.hydrateDepts(
              await this.selWs('departments', (r: Row) => r, (q) => q.eq('property_id', propertyId)),
            );
            const dept = departmentId ? depts.find((d) => d.id === departmentId) : depts[0];
            if (!dept) return { data: { agent_id: null, department_id: null } };
            const members = await this.hydrateMembers(await this.selWs('members', (r: Row) => r));
            const byId = new Map(members.map((m) => [m.id, m]));
            let candidates = dept.agent_ids
              .map((mid) => byId.get(mid))
              .filter((m): m is ApiMember => !!m && m.status === 'online');
            if (!candidates.length) candidates = [...members];
            if (!candidates.length) return { data: { agent_id: null, department_id: dept.id } };
            let agent: ApiMember;
            if (dept.routing_mode === 'least-busy') {
              const { data, error } = await this.sb()
                .from('conversations')
                .select('assignee_id')
                .eq('workspace_id', ws)
                .eq('status', 'open')
                .not('assignee_id', 'is', null);
              if (error) throw supaError(error);
              const open = new Map<string, number>();
              for (const c of (data ?? []) as Row[]) {
                open.set(c.assignee_id, (open.get(c.assignee_id) ?? 0) + 1);
              }
              agent = candidates.slice().sort((a, b) => (open.get(a.id) ?? 0) - (open.get(b.id) ?? 0))[0];
            } else if (dept.routing_mode === 'first-available') {
              agent = candidates[0];
            } else {
              const key = `brix_rr_${this.workspace}_${dept.id}`;
              const n = Number(localStorage.getItem(key) ?? 0) || 0;
              agent = candidates[n % candidates.length];
              try {
                localStorage.setItem(key, String(n + 1));
              } catch {
                /* storage unavailable — routing still works this once */
              }
            }
            return { data: { agent_id: agent.id, department_id: dept.id } };
          },
          () => base_routing.routeChat(propertyId, departmentId),
        ),
    };

    // ---- categories (three tables: kb / canned / tickets) ----------------------
    const base_categories = this.categories;
    this.categories = {
      ...base_categories,
      list: (scope: ApiCategory['scope'], propertyId?: string) =>
        this.guard(
          async () => {
            let items = await this.selWs(CATEGORY_TABLES[scope], mapCategory(scope));
            if (propertyId) items = items.filter((c) => !c.property_id || c.property_id === propertyId);
            return { data: items };
          },
          () => base_categories.list(scope, propertyId),
        ),
      create: (scope: ApiCategory['scope'], propertyId: string, name: string, color?: string) =>
        this.guard(
          async () => {
            if (!name.trim()) throw new ApiError('validation', 'Category name is required.', 422);
            const ws = await this.wsId();
            const out = await this.ins(CATEGORY_TABLES[scope], {
              id: this.rid(),
              workspace_id: ws,
              property_id: propertyId?.trim() || null,
              name: name.trim(),
              color: color?.trim() || '#4f46e5',
            }, mapCategory(scope));
            await this.auditRemote('category.created', 'category', out.id, { scope, name: out.name });
            return { data: out };
          },
          () => base_categories.create(scope, propertyId, name, color),
        ),
      update: (id: string, patch: Partial<Pick<ApiCategory, 'name' | 'color'>>) =>
        this.guard(
          async () => {
            if (patch.name !== undefined && !patch.name.trim()) {
              throw new ApiError('validation', 'Category name is required.', 422);
            }
            // The scope is not in the id; find which table holds this row.
            for (const scope of Object.keys(CATEGORY_TABLES) as ApiCategory['scope'][]) {
              try {
                const out = await this.updWs(CATEGORY_TABLES[scope], id, {
                  ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
                  ...(patch.color !== undefined ? { color: patch.color } : {}),
                }, mapCategory(scope), 'Category');
                await this.auditRemote('category.updated', 'category', id, patch as Row);
                return { data: out };
              } catch (e) {
                if (e instanceof ApiError && e.code === 'not_found') continue;
                throw e;
              }
            }
            throw new ApiError('not_found', `Category ${id} not found.`, 404);
          },
          () => base_categories.update(id, patch),
        ),
      delete: (id: string) =>
        this.guard(
          async () => {
            // FKs are ON DELETE SET NULL, so references clear themselves.
            for (const scope of Object.keys(CATEGORY_TABLES) as ApiCategory['scope'][]) {
              try {
                await this.delWs(CATEGORY_TABLES[scope], id, 'Category');
                await this.auditRemote('category.deleted', 'category', id, {});
                return { data: { deleted: true as const } };
              } catch (e) {
                if (e instanceof ApiError && e.code === 'not_found') continue;
                throw e;
              }
            }
            throw new ApiError('not_found', `Category ${id} not found.`, 404);
          },
          () => base_categories.delete(id),
        ),
    };

    // ---- saved views ------------------------------------------------------------
    const base_views = this.views;
    this.views = {
      ...base_views,
      list: () =>
        this.guard(
          async () => ({ data: await this.selWs('saved_views', mapView) }),
          () => base_views.list(),
        ),
      create: (name: string, filters: ApiSavedView['filters']) =>
        this.guard(
          async () => {
            if (!name.trim()) throw new ApiError('validation', 'View name is required.', 422);
            const ws = await this.wsId();
            const out = await this.ins('saved_views', {
              id: this.rid(),
              workspace_id: ws,
              member_id: null,
              name: name.trim(),
              filters,
            }, mapView);
            await this.auditRemote('view.created', 'view', out.id, { name: out.name });
            return { data: out };
          },
          () => base_views.create(name, filters),
        ),
      delete: (id: string) =>
        this.guard(
          async () => {
            await this.delWs('saved_views', id, 'View');
            await this.auditRemote('view.deleted', 'view', id, {});
            return { data: { deleted: true as const } };
          },
          () => base_views.delete(id),
        ),
    };

    // ---- plays --------------------------------------------------------------------
    const base_plays = this.plays;
    this.plays = {
      ...base_plays,
      list: () =>
        this.guard(
          async () => ({ data: await this.selWs('plays', mapPlay) }),
          () => base_plays.list(),
        ),
      create: (name: string, steps: ApiPlayStep[]) =>
        this.guard(
          async () => {
            if (!name.trim()) throw new ApiError('validation', 'Play name is required.', 422);
            if (!steps.length) throw new ApiError('validation', 'A play needs at least one step.', 422);
            const ws = await this.wsId();
            const out = await this.ins('plays', {
              id: this.rid(),
              workspace_id: ws,
              name: name.trim(),
              steps,
            }, mapPlay);
            await this.auditRemote('play.created', 'play', out.id, { name: out.name, steps: steps.length });
            return { data: out };
          },
          () => base_plays.create(name, steps),
        ),
      delete: (id: string) =>
        this.guard(
          async () => {
            await this.delWs('plays', id, 'Play');
            await this.auditRemote('play.deleted', 'play', id, {});
            return { data: { deleted: true as const } };
          },
          () => base_plays.delete(id),
        ),
      run: (conversationId: string, playId: string) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            const play = await this.oneWs('plays', mapPlay, playId, 'Play');
            const [conv] = await this.hydrateConvs([await this.oneWsRaw('conversations', conversationId, 'Conversation')]);
            const applied: string[] = [];
            for (const step of play.steps) {
              if (step.kind === 'reply' && step.value.trim()) {
                await this.ins('messages', {
                  id: this.rid(),
                  workspace_id: ws,
                  conversation_id: conv.id,
                  sender: 'agent',
                  kind: 'text',
                  text: step.value.trim(),
                  metadata: { play: play.name },
                }, mapMessage);
                applied.push(`reply sent (${step.value.trim().slice(0, 40)}…)`);
              } else if (step.kind === 'tag' && step.value.trim()) {
                const tag = step.value.trim().toLowerCase();
                const tags = [...new Set([...conv.tags, tag])];
                await this.updWs('conversations', conv.id, { tags }, (r: Row) => r, 'Conversation');
                conv.tags = tags;
                applied.push(`tag added: ${tag}`);
              } else if (step.kind === 'assign') {
                const depts = await this.selWs('departments', (r: Row) => r, (q) =>
                  q.eq('property_id', conv.property_id),
                );
                const dept = depts.find((d) => d.name.toLowerCase() === step.value.trim().toLowerCase());
                if (dept) {
                  await this.updWs('conversations', conv.id, { department_id: dept.id }, (r: Row) => r, 'Conversation');
                  applied.push(`routed to ${dept.name}`);
                } else {
                  const { data, error } = await this.sb()
                    .from('members')
                    .select('id,display_name')
                    .eq('workspace_id', ws)
                    .ilike('display_name', step.value.trim())
                    .maybeSingle();
                  if (error) throw supaError(error);
                  const mem = data as Row | null;
                  if (mem) {
                    await this.updWs('conversations', conv.id, { assignee_id: mem.id }, (r: Row) => r, 'Conversation');
                    applied.push(`assigned to ${mem.display_name}`);
                  } else {
                    applied.push(`assigned to ${step.value.trim()}`);
                  }
                }
              } else if (step.kind === 'priority' && ['low', 'medium', 'high', 'urgent'].includes(step.value)) {
                await this.updWs('conversations', conv.id, { priority: step.value }, (r: Row) => r, 'Conversation');
                applied.push(`priority set to ${step.value}`);
              } else if (step.kind === 'note' && step.value.trim()) {
                await this.ins('conversation_notes', {
                  id: this.rid(),
                  workspace_id: ws,
                  conversation_id: conv.id,
                  author_name: this.actor,
                  text: step.value.trim(),
                }, (r: Row) => r);
                applied.push('note added');
              }
            }
            await this.auditRemote('play.run', 'play', playId, { conversation: conversationId, applied: applied.length });
            return { data: { applied } };
          },
          () => base_plays.run(conversationId, playId),
        ),
    };

    // ---- goals & attribution -------------------------------------------------------
    const base_goals = this.goals;
    this.goals = {
      ...base_goals,
      list: () =>
        this.guard(
          async () => ({ data: await this.selWs('goals', mapGoal) }),
          () => base_goals.list(),
        ),
      create: (name: string, event: string, revenue = 0) =>
        this.guard(
          async () => {
            if (!name.trim() || !event.trim()) throw new ApiError('validation', 'Name and event key are required.', 422);
            const ws = await this.wsId();
            const out = await this.ins('goals', {
              id: this.rid(),
              workspace_id: ws,
              property_id: null,
              name: name.trim(),
              event: event.trim(),
              revenue: Number(revenue) || 0,
            }, mapGoal);
            await this.auditRemote('goal.created', 'goal', out.id, { name: out.name, event: out.event });
            return { data: out };
          },
          () => base_goals.create(name, event, revenue),
        ),
      delete: (id: string) =>
        this.guard(
          async () => {
            await this.delWs('goals', id, 'Goal');
            await this.auditRemote('goal.deleted', 'goal', id, {});
            return { data: { deleted: true as const } };
          },
          () => base_goals.delete(id),
        ),
      track: (goalId: string, conversationId: string | null = null, value?: number) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            const goal = await this.oneWs('goals', mapGoal, goalId, 'Goal');
            const out = await this.ins('goal_events', {
              id: this.rid(),
              workspace_id: ws,
              goal_id: goalId,
              conversation_id: conversationId,
              value: value ?? goal.revenue,
            }, mapGoalEvent);
            await this.auditRemote('goal.completed', 'goal', goalId, { conversation: conversationId, value: out.value });
            await this.notify(
              'system',
              `Goal completed: ${goal.name}`,
              `Event "${goal.event}"${conversationId ? ' from a chat' : ''} · value ${out.value}`,
              '/app/analytics',
            );
            return { data: out };
          },
          () => base_goals.track(goalId, conversationId, value),
        ),
      funnel: (days = 30) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            const since = new Date(Date.now() - Math.min(Math.max(days, 1), 365) * 86400000).toISOString();
            const { data: convRows, error: cErr } = await this.sb()
              .from('conversations')
              .select('id,visitor_name,visitor_email,created_at')
              .eq('workspace_id', ws)
              .gte('created_at', since);
            if (cErr) throw supaError(cErr);
            const convs = (convRows ?? []) as Row[];
            const { data: evtRows, error: eErr } = await this.sb()
              .from('goal_events')
              .select('*')
              .eq('workspace_id', ws)
              .gte('created_at', since);
            if (eErr) throw supaError(eErr);
            const events = ((evtRows ?? []) as Row[]).map(mapGoalEvent);
            const goals = await this.selWs('goals', mapGoal);
            const visitors = new Set(convs.map((c) => `${c.visitor_name}|${c.visitor_email}`)).size;
            return {
              data: {
                visitors,
                chats: convs.length,
                goals: goals.map((goal) => {
                  const evts = events.filter((e) => e.goal_id === goal.id);
                  return { goal, count: evts.length, revenue: evts.reduce((s, e) => s + (e.value || 0), 0) };
                }),
              },
            };
          },
          () => base_goals.funnel(days),
        ),
    };


    // ---- members ------------------------------------------------------------------
    const base_members = this.members;
    this.members = {
      ...base_members,
      list: () =>
        this.guard(
          async () => ({
            data: await this.hydrateMembers(
              await this.selWs('members', (r: Row) => r, (q) => q.order('display_name', { ascending: true })),
            ),
          }),
          () => base_members.list(),
        ),
      get: (id: string) =>
        this.guard(
          async () => ({ data: (await this.hydrateMembers([await this.oneWsRaw('members', id, 'Member')]))[0] }),
          () => base_members.get(id),
        ),
      create: (displayName: string, role: TeamRole, passcode: string, extras?: {
        job_title?: string; avatar_data_url?: string | null; department_ids?: string[];
      }) =>
        this.guard(
          async () => {
            const name = displayName.trim();
            if (!name) throw new ApiError('validation', 'Display name is required.', 422);
            if (passcode.length < 4) throw new ApiError('validation', 'Passcode must be at least 4 characters.', 422);
            const ws = await this.wsId();
            const existing = await this.selWs('members', (r: Row) => r.display_name as string);
            if (existing.some((n) => n.toLowerCase() === name.toLowerCase())) {
              throw new ApiError('conflict', 'A member with that name already exists.', 409);
            }
            const id = this.rid();
            await this.ins('members', {
              id,
              workspace_id: ws,
              display_name: name,
              initials: memberInitials(name),
              color: ['#4f46e5', '#0891b2', '#059669', '#f59e0b', '#8b5cf6'][existing.length % 5],
              role,
              email: '',
              job_title: (extras?.job_title ?? '').trim(),
              avatar_url: extras?.avatar_data_url ?? null,
              status: 'offline',
            }, (r: Row) => r);
            // bcrypt-hash the passcode server-side when the session allows it
            // (authenticated-only RPC; without a session the member exists but
            // the passcode must be set from team settings once signed in).
            try {
              const { error } = await this.sb().rpc('member_set_passcode', { p_member_id: id, p_passcode: passcode });
              if (error) throw supaError(error);
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn('[brix-chat] member create: passcode could not be stored remotely:', e instanceof Error ? e.message : e);
            }
            for (const depId of extras?.department_ids ?? []) {
              const { error } = await this.sb()
                .from('department_members')
                .insert({ department_id: depId, member_id: id });
              if (error) throw supaError(error);
            }
            await this.auditRemote('member.created', 'member', id, { name, role });
            return { data: (await this.hydrateMembers([await this.oneWsRaw('members', id, 'Member')]))[0] };
          },
          () => base_members.create(displayName, role, passcode, extras),
        ),
      update: (id: string, patch: Partial<Pick<ApiMember, 'display_name' | 'color' | 'role' | 'status' | 'job_title' | 'avatar_data_url' | 'department_ids'>>) =>
        this.guard(
          async () => {
            const row: Row = {};
            if (patch.display_name !== undefined) {
              if (!patch.display_name.trim()) throw new ApiError('validation', 'Display name is required.', 422);
              row.display_name = patch.display_name.trim();
              row.initials = memberInitials(row.display_name);
            }
            if (patch.color !== undefined) row.color = patch.color;
            if (patch.role !== undefined) row.role = patch.role;
            if (patch.status !== undefined) row.status = patch.status;
            if (patch.job_title !== undefined) row.job_title = patch.job_title.trim();
            if (patch.avatar_data_url !== undefined) row.avatar_url = patch.avatar_data_url;
            const updated = await this.updWs('members', id, row, (r: Row) => r, 'Member');
            if (patch.department_ids !== undefined) {
              await this.sb().from('department_members').delete().eq('member_id', id).then(({ error }) => {
                if (error) throw supaError(error);
              });
              if (patch.department_ids.length) {
                const { error } = await this.sb()
                  .from('department_members')
                  .insert(patch.department_ids.map((department_id) => ({ department_id, member_id: id })));
                if (error) throw supaError(error);
              }
            }
            await this.auditRemote('member.updated', 'member', id, patch as Row);
            return { data: (await this.hydrateMembers([updated]))[0] };
          },
          () => base_members.update(id, patch),
        ),
      remove: (id: string) =>
        this.guard(
          async () => {
            const all = await this.selWs('members', (r: Row) => r.id as string);
            if (all.length <= 1) throw new ApiError('validation', 'A workspace needs at least one member.', 422);
            const row = await this.oneWsRaw('members', id, 'Member');
            await this.delWs('members', id, 'Member');
            await this.auditRemote('member.removed', 'member', id, { name: row.display_name });
            return { data: { deleted: true as const } };
          },
          () => base_members.remove(id),
        ),
      /**
       * Remote login via the member_login() RPC — the one auth surface the
       * anon key may call. Bad credentials, an un-provisioned workspace and
       * network failure are indistinguishable here, so any RPC failure falls
       * through to the local transport (demo seeds keep working); the local
       * login throws the proper unauthorized error when truly invalid.
       */
      login: (displayName: string, passcode: string) =>
        (async () => {
          const name = displayName.trim();
          if (name && isSupabaseEnabled()) {
            try {
              const { data, error } = await this.sb().rpc('member_login', {
                p_workspace_slug: this.workspace,
                p_display_name: name,
                p_passcode: passcode,
              });
              if (!error && data) {
                const r = data as Row;
                const m: ApiMember = {
                  id: r.id,
                  display_name: r.display_name,
                  initials: r.initials || memberInitials(r.display_name),
                  color: r.color || '#4f46e5',
                  role: r.role || 'agent',
                  passcode: '',
                  last_login: isoNow(),
                  status: 'online',
                  job_title: '',
                  avatar_data_url: null,
                  department_ids: [],
                  created_at: isoNow(),
                };
                return { data: m };
              }
            } catch {
              /* fall through to local */
            }
          }
          return base_members.login(displayName, passcode);
        })(),
      setPasscode: (id: string, passcode: string) =>
        this.guard(
          async () => {
            if (passcode.length < 4) throw new ApiError('validation', 'Passcode must be at least 4 characters.', 422);
            // member_set_passcode is authenticated-only (admins may reset
            // anyone's; members may change their own). Without a session this
            // throws and guard() falls back to the local transport.
            const { error } = await this.sb().rpc('member_set_passcode', { p_member_id: id, p_passcode: passcode });
            if (error) throw supaError(error);
            await this.auditRemote('member.passcode_changed', 'member', id, {});
            return { data: { updated: true as const } };
          },
          () => base_members.setPasscode(id, passcode),
        ),
      touchLogin: (id: string) =>
        this.guard(
          async () => {
            const updated = await this.updWs(
              'members',
              id,
              { last_login_at: new Date().toISOString(), status: 'online' },
              (r: Row) => r,
              'Member',
            );
            return { data: (await this.hydrateMembers([updated]))[0] };
          },
          () => base_members.touchLogin(id),
        ),
      setStatus: (id: string, status: ApiMember['status']) =>
        this.guard(
          async () => {
            // Self-service path: member_set_status() only ever touches the
            // caller's own row, so use it only when the target IS the caller
            // (checked via current_member_id()); otherwise admins write the
            // members row directly.
            let self = false;
            try {
              const { data, error } = await this.sb().rpc('current_member_id');
              if (!error && data) self = data === id;
            } catch {
              /* ignore — fall through to the direct write */
            }
            let row: Row;
            if (self) {
              const { error } = await this.sb().rpc('member_set_status', { p_status: status });
              if (error) throw supaError(error);
              row = await this.oneWsRaw('members', id, 'Member');
            } else {
              row = await this.updWs('members', id, { status }, (r: Row) => r, 'Member');
            }
            await this.auditRemote('member.status_changed', 'member', id, { status });
            return { data: (await this.hydrateMembers([row]))[0] };
          },
          () => base_members.setStatus(id, status),
        ),
    };

    // ---- property settings (property_settings + branding merge) -------------------
    const base_propertySettings = this.propertySettings;
    const BRAND_KEYS = new Set([
      'brand_name', 'tagline', 'logo_data_url', 'theme', 'accent_color',
      'widget_color', 'widget_position', 'launcher_style', 'language',
    ]);
    this.propertySettings = {
      ...base_propertySettings,
      get: (propertyId: string) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            const [{ data: ps, error: psErr }, { data: br, error: brErr }] = await Promise.all([
              this.sb()
                .from('property_settings')
                .select('*')
                .eq('workspace_id', ws)
                .eq('property_id', propertyId)
                .maybeSingle(),
              this.sb()
                .from('branding')
                .select('*')
                .eq('workspace_id', ws)
                .eq('property_id', propertyId)
                .maybeSingle(),
            ]);
            if (psErr) throw supaError(psErr);
            if (brErr) throw supaError(brErr);
            const merged: PropertySettings = {
              ...defaultPropertySettings(),
              ...(((ps as Row | null)?.settings ?? {}) as Partial<PropertySettings>),
            };
            const b = (br as Row | null) ?? null;
            if (b) {
              if (b.brand_name) merged.brand_name = b.brand_name;
              if (b.tagline) merged.tagline = b.tagline;
              if (b.logo_url !== undefined) merged.logo_data_url = b.logo_url;
              if (b.theme) merged.theme = b.theme;
              if (b.accent_color) merged.accent_color = b.accent_color;
              if (b.widget_color) merged.widget_color = b.widget_color;
              if (b.widget_position) merged.widget_position = b.widget_position;
              if (b.launcher_style) merged.launcher_style = b.launcher_style;
              if (b.language) merged.language = b.language;
            }
            const depts = await this.selWs('departments', (r: Row) => r, (q) => q.eq('property_id', propertyId));
            merged.departments = depts.map((d) => ({ id: d.id, name: d.name }));
            return { data: merged };
          },
          () => base_propertySettings.get(propertyId),
        ),
      patch: (propertyId: string, patch: Partial<PropertySettings>) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            const brandPatch: Row = {};
            const settingsPatch: Row = {};
            for (const [k, v] of Object.entries(patch)) {
              if (k === 'departments') continue; // managed via the departments namespace
              if (BRAND_KEYS.has(k)) brandPatch[k === 'logo_data_url' ? 'logo_url' : k] = v;
              else settingsPatch[k] = v;
            }
            if (Object.keys(brandPatch).length) {
              const { error } = await this.sb()
                .from('branding')
                .upsert({ workspace_id: ws, property_id: propertyId, ...brandPatch }, { onConflict: 'property_id' });
              if (error) throw supaError(error);
            }
            if (Object.keys(settingsPatch).length) {
              const { data: cur, error: curErr } = await this.sb()
                .from('property_settings')
                .select('settings')
                .eq('workspace_id', ws)
                .eq('property_id', propertyId)
                .maybeSingle();
              if (curErr) throw supaError(curErr);
              const settings = { ...(((cur as Row | null)?.settings ?? {}) as Row), ...settingsPatch };
              const { error } = await this.sb()
                .from('property_settings')
                .upsert({ workspace_id: ws, property_id: propertyId, settings }, { onConflict: 'property_id' });
              if (error) throw supaError(error);
            }
            await this.auditRemote('property_settings.updated', 'property', propertyId, patch as Row);
            return this.propertySettings.get(propertyId);
          },
          () => base_propertySettings.patch(propertyId, patch),
        ),
    };

    // ---- integrations (provider registry state) -----------------------------------
    // Remote rows are keyed by provider; name/description/fields/phase come
    // from the local INTEGRATION_REGISTRY, values/enabled from the row's
    // config. Secrets in config are app-layer encrypted server-side per the
    // migration contract — the browser only ever sends what the admin typed.
    const base_integrations = this.integrations;
    const toApiIntegration = (def: (typeof INTEGRATION_REGISTRY)[number], row: Row | null): ApiIntegration => ({
      id: def.id,
      name: row?.name ?? def.name,
      description: def.description,
      fields: def.keyFields.map((f) => ({ name: f.name, label: f.label, secret: f.secret })),
      values: (row?.config ?? {}) as Record<string, string>,
      enabled: !!row?.enabled,
      phase: def.status,
    });
    this.integrations = {
      ...base_integrations,
      list: () =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            const { data, error } = await this.sb()
              .from('integrations')
              .select('*')
              .eq('workspace_id', ws);
            if (error) throw supaError(error);
            const byProvider = new Map(((data ?? []) as Row[]).map((r) => [r.provider as string, r]));
            return { data: INTEGRATION_REGISTRY.map((def) => toApiIntegration(def, byProvider.get(def.id) ?? null)) };
          },
          () => base_integrations.list(),
        ),
      patch: (id: string, patch: Partial<Pick<ApiIntegration, 'values' | 'enabled'>>) =>
        this.guard(
          async () => {
            const def = INTEGRATION_REGISTRY.find((d) => d.id === id);
            if (!def) throw new ApiError('not_found', `Integration ${id} not found.`, 404);
            const ws = await this.wsId();
            const { data: cur, error: curErr } = await this.sb()
              .from('integrations')
              .select('*')
              .eq('workspace_id', ws)
              .eq('provider', id)
              .maybeSingle();
            if (curErr) throw supaError(curErr);
            const row = (cur as Row | null) ?? null;
            const values = patch.values !== undefined ? { ...patch.values } : ((row?.config ?? {}) as Record<string, string>);
            const enabled = patch.enabled !== undefined ? patch.enabled : !!row?.enabled;
            const { data, error } = await this.sb()
              .from('integrations')
              .upsert(
                { workspace_id: ws, provider: id, name: def.name, config: values, enabled },
                { onConflict: 'workspace_id,provider' },
              )
              .select()
              .single();
            if (error) throw supaError(error);
            await this.auditRemote('integration.updated', 'integration', id, {
              enabled,
              fields: Object.keys(values),
            });
            return { data: toApiIntegration(def, data as Row) };
          },
          () => base_integrations.patch(id, patch),
        ),
    };

    // ---- unanswered questions -------------------------------------------------------
    const base_unanswered = this.unanswered;
    this.unanswered = {
      ...base_unanswered,
      list: (opts: { includeDismissed?: boolean } & ListOpts = {}) =>
        this.guard(
          async () => {
            let items = await this.selWs('unanswered_questions', mapUnanswered, (q) =>
              q.order('count', { ascending: false }).order('created_at', { ascending: false }),
            );
            if (!opts.includeDismissed) items = items.filter((u) => !u.dismissed);
            return { data: paginate(items, opts) };
          },
          () => base_unanswered.list(opts),
        ),
      add: (question: string, conversationId: string | null = null) =>
        this.guard(
          async () => {
            const q = question.trim();
            if (!q) throw new ApiError('validation', 'Question is required.', 422);
            const ws = await this.wsId();
            // property_id is NOT NULL remotely — resolve it from the conversation.
            let property_id: string | null = null;
            if (conversationId) {
              const conv = await this.oneWsRaw('conversations', conversationId, 'Conversation');
              property_id = conv.property_id;
            }
            if (!property_id) {
              throw new ApiError(
                'not_supported',
                'Unanswered questions need a conversation link in Supabase mode (property_id is required).',
                501,
              );
            }
            const existing = await this.selWs('unanswered_questions', (r: Row) => r, (qq) =>
              qq.eq('dismissed', false).ilike('question', q),
            );
            if (existing.length) {
              const row = existing[0];
              const out = await this.updWs(
                'unanswered_questions',
                row.id,
                { count: (row.count ?? 1) + 1 },
                mapUnanswered,
                'Unanswered question',
              );
              return { data: out };
            }
            const out = await this.ins('unanswered_questions', {
              id: this.rid(),
              workspace_id: ws,
              property_id,
              question: q,
              conversation_id: conversationId,
              count: 1,
            }, mapUnanswered);
            await this.auditRemote('unanswered.added', 'unanswered', out.id, { question: q.slice(0, 80) });
            return { data: out };
          },
          () => base_unanswered.add(question, conversationId),
        ),
      dismiss: (id: string) =>
        this.guard(
          async () => {
            const out = await this.updWs('unanswered_questions', id, { dismissed: true }, mapUnanswered, 'Unanswered question');
            await this.auditRemote('unanswered.dismissed', 'unanswered', id, {});
            return { data: out };
          },
          () => base_unanswered.dismiss(id),
        ),
      promote: (id: string) =>
        this.guard(
          async () => {
            const u = await this.oneWs('unanswered_questions', mapUnanswered, id, 'Unanswered question');
            const { data: article } = await this.kb.create({
              title: u.question,
              body: `Draft from the unanswered-questions log (asked ${u.count}×). Write the answer here.`,
              category: 'Unanswered',
              status: 'draft',
            });
            await this.updWs('unanswered_questions', id, { dismissed: true }, mapUnanswered, 'Unanswered question');
            await this.auditRemote('unanswered.promoted', 'unanswered', id, { article: article.id });
            return { data: article };
          },
          () => base_unanswered.promote(id),
        ),
    };

    // ---- audit search -----------------------------------------------------------------
    const base_audit = this.audit;
    this.audit = {
      ...base_audit,
      search: (opts: { actor?: string; action?: string; from?: string; to?: string } & ListOpts = {}) =>
        this.guard(
          async () => {
            let items = await this.selWs('audit_log', mapAudit, (q) => q.order('created_at', { ascending: false }));
            if (opts.actor) items = items.filter((e) => e.actor.toLowerCase().includes(opts.actor!.toLowerCase()));
            if (opts.action) items = items.filter((e) => e.action.toLowerCase().includes(opts.action!.toLowerCase()));
            if (opts.from) items = items.filter((e) => e.created_at >= opts.from!);
            if (opts.to) items = items.filter((e) => e.created_at <= opts.to!);
            return { data: paginate(items, opts) };
          },
          () => base_audit.search(opts),
        ),
    };

    // ---- knowledge base ---------------------------------------------------------------
    const base_kb = this.kb;
    this.kb = {
      ...base_kb,
      list: (opts: { status?: 'draft' | 'published'; category?: string } & ListOpts = {}) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            let q: Query = this.sb()
              .from('kb_articles')
              .select('*')
              .eq('workspace_id', ws)
              .order('updated_at', { ascending: false });
            if (opts.status) q = q.eq('status', opts.status);
            if (opts.category) q = q.eq('category_id', opts.category);
            const { data, error } = await q;
            if (error) throw supaError(error);
            return { data: paginate(await this.hydrateArticles((data ?? []) as Row[]), opts) };
          },
          () => base_kb.list(opts),
        ),
      search: (q: string) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            const t = escLike(q.trim());
            if (!t) return { data: [] };
            const { data, error } = await this.sb()
              .from('kb_articles')
              .select('*')
              .eq('workspace_id', ws)
              .eq('status', 'published')
              .or(`title.ilike.%${t}%,body.ilike.%${t}%`);
            if (error) throw supaError(error);
            return { data: await this.hydrateArticles((data ?? []) as Row[]) };
          },
          () => base_kb.search(q),
        ),
      get: (id: string) =>
        this.guard(
          async () => ({ data: (await this.hydrateArticles([await this.oneWsRaw('kb_articles', id, 'Article')]))[0] }),
          () => base_kb.get(id),
        ),
      create: (input: { title: string; body?: string; category?: string; category_id?: string | null; status?: 'draft' | 'published' }) =>
        this.guard(
          async () => {
            if (!input.title.trim()) throw new ApiError('validation', 'Title is required.', 422);
            const ws = await this.wsId();
            let category_id = input.category_id ?? null;
            if (!category_id && input.category) {
              const { data, error } = await this.sb()
                .from('kb_categories')
                .select('id')
                .eq('workspace_id', ws)
                .ilike('name', input.category.trim())
                .maybeSingle();
              if (error) throw supaError(error);
              category_id = (data as Row | null)?.id ?? null;
            }
            // slug is unique per workspace — dedupe with a numeric suffix.
            const baseSlug =
              input.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || this.rid();
            const { data: slugRows, error: slugErr } = await this.sb()
              .from('kb_articles')
              .select('slug')
              .eq('workspace_id', ws)
              .like('slug', `${escLike(baseSlug)}%`);
            if (slugErr) throw supaError(slugErr);
            const taken = new Set(((slugRows ?? []) as Row[]).map((r) => r.slug as string));
            let slug = baseSlug;
            for (let n = 2; taken.has(slug); n++) slug = `${baseSlug}-${n}`;
            const out = await this.ins('kb_articles', {
              id: this.rid(),
              workspace_id: ws,
              property_id: null,
              category_id,
              title: input.title.trim(),
              slug,
              body: input.body ?? '',
              status: input.status ?? 'draft',
            }, (r: Row) => r);
            await this.auditRemote('article.created', 'article', out.id, { title: out.title });
            return { data: (await this.hydrateArticles([out]))[0] };
          },
          () => base_kb.create(input),
        ),
      update: (id: string, patch: Partial<Pick<ApiArticle, 'title' | 'body' | 'category' | 'category_id' | 'status'>>) =>
        this.guard(
          async () => {
            const row: Row = {};
            if (patch.title !== undefined) row.title = patch.title;
            if (patch.body !== undefined) row.body = patch.body;
            if (patch.category_id !== undefined) row.category_id = patch.category_id;
            if (patch.status !== undefined) row.status = patch.status;
            if (patch.category !== undefined && patch.category_id === undefined) {
              const ws = await this.wsId();
              const { data, error } = await this.sb()
                .from('kb_categories')
                .select('id')
                .eq('workspace_id', ws)
                .ilike('name', patch.category.trim())
                .maybeSingle();
              if (error) throw supaError(error);
              row.category_id = (data as Row | null)?.id ?? null;
            }
            const updated = await this.updWs('kb_articles', id, row, (r: Row) => r, 'Article');
            await this.auditRemote('article.updated', 'article', id, patch as Row);
            return { data: (await this.hydrateArticles([updated]))[0] };
          },
          () => base_kb.update(id, patch),
        ),
      remove: (id: string) =>
        this.guard(
          async () => {
            await this.delWs('kb_articles', id, 'Article');
            await this.auditRemote('article.deleted', 'article', id, {});
            return { data: { deleted: true as const } };
          },
          () => base_kb.remove(id),
        ),
    };

    // ---- canned responses ---------------------------------------------------------------
    const base_canned = this.canned;
    this.canned = {
      ...base_canned,
      list: (opts: { category?: string } = {}) =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            let q: Query = this.sb().from('canned_responses').select('*').eq('workspace_id', ws);
            if (opts.category) q = q.eq('category_id', opts.category);
            const { data, error } = await q;
            if (error) throw supaError(error);
            return { data: ((data ?? []) as Row[]).map(mapCanned) };
          },
          () => base_canned.list(opts),
        ),
      create: (input: { shortcut: string; title: string; body: string; category_id?: string | null }) =>
        this.guard(
          async () => {
            if (!input.title.trim() || !input.body.trim()) {
              throw new ApiError('validation', 'Title and body are required.', 422);
            }
            const ws = await this.wsId();
            const out = await this.ins('canned_responses', {
              id: this.rid(),
              workspace_id: ws,
              property_id: null,
              category_id: input.category_id ?? null,
              shortcut: input.shortcut.trim(),
              title: input.title.trim(),
              body: input.body.trim(),
            }, mapCanned);
            await this.auditRemote('canned.created', 'canned', out.id, { title: out.title });
            return { data: out };
          },
          () => base_canned.create(input),
        ),
      update: (id: string, patch: Partial<Pick<ApiCanned, 'shortcut' | 'title' | 'body' | 'category_id'>>) =>
        this.guard(
          async () => {
            const out = await this.updWs('canned_responses', id, { ...patch }, mapCanned, 'Canned response');
            await this.auditRemote('canned.updated', 'canned', id, patch as Row);
            return { data: out };
          },
          () => base_canned.update(id, patch),
        ),
      remove: (id: string) =>
        this.guard(
          async () => {
            await this.delWs('canned_responses', id, 'Canned response');
            await this.auditRemote('canned.deleted', 'canned', id, {});
            return { data: { deleted: true as const } };
          },
          () => base_canned.remove(id),
        ),
    };

    // NOTE: webhooks + deliveries intentionally keep the localStorage
    // implementation (base class). The migration excludes signing secrets
    // from member SELECT grants and expects app-layer encryption before
    // insert — a browser cannot mint a server-signable remote webhook, and
    // test-fire signing needs the secret. Local mode keeps secrets in this
    // browser only, exactly as before.

    // ---- api keys -------------------------------------------------------------------------
    // Only SHA-256 hashes + prefixes are stored remotely (per the migration
    // contract). The raw key is returned once at creation/rotation and never
    // persisted. usage_count/last_used_at are maintained by server-side
    // workers (no member write grants), so they are read-only here.
    const base_apiKeys = this.apiKeys;
    this.apiKeys = {
      ...base_apiKeys,
      list: () =>
        this.guard(
          async () => ({ data: await this.selWs('api_keys', mapApiKey, (q) => q.order('created_at', { ascending: false })) }),
          () => base_apiKeys.list(),
        ),
      create: (input: { name: string; scopes: string[] }) =>
        this.guard(
          async () => {
            if (!input.name.trim()) throw new ApiError('validation', 'Key name is required.', 422);
            if (!input.scopes.length) throw new ApiError('validation', 'Select at least one scope.', 422);
            const ws = await this.wsId();
            const raw = `bk_live_${randomHex(24)}`;
            const out = await this.ins('api_keys', {
              id: this.rid(),
              workspace_id: ws,
              name: input.name.trim(),
              prefix: raw.slice(0, 14),
              key_hash: await sha256Hex(raw),
              scopes: [...new Set(input.scopes)],
            }, mapApiKey);
            await this.auditRemote('api_key.created', 'api_key', out.id, { name: out.name, scopes: out.scopes });
            return { data: { record: out, key: raw } };
          },
          () => base_apiKeys.create(input),
        ),
      revealOnce: (_id: string) =>
        // Raw keys are never persisted server-side — there is nothing to reveal.
        Promise.resolve({ data: { key: null as string | null } }),
      rotate: (id: string) =>
        this.guard(
          async () => {
            const cur = await this.oneWsRaw('api_keys', id, 'API key');
            const raw = `bk_live_${randomHex(24)}`;
            // key_hash is not in the member UPDATE grant, so rotation is a
            // delete + re-insert preserving the id and original created_at.
            await this.delWs('api_keys', id, 'API key');
            const out = await this.ins('api_keys', {
              id,
              workspace_id: cur.workspace_id,
              name: cur.name,
              prefix: raw.slice(0, 14),
              key_hash: await sha256Hex(raw),
              scopes: cur.scopes ?? [],
              revoked: false,
              created_at: cur.created_at,
            }, mapApiKey);
            await this.auditRemote('api_key.rotated', 'api_key', id, { name: cur.name });
            return { data: { record: out, key: raw } };
          },
          () => base_apiKeys.rotate(id),
        ),
      revoke: (id: string) =>
        this.guard(
          async () => {
            const out = await this.updWs('api_keys', id, { revoked: true }, mapApiKey, 'API key');
            await this.auditRemote('api_key.revoked', 'api_key', id, { name: out.name });
            return { data: out };
          },
          () => base_apiKeys.revoke(id),
        ),
      remove: (id: string) =>
        this.guard(
          async () => {
            await this.delWs('api_keys', id, 'API key');
            await this.auditRemote('api_key.deleted', 'api_key', id, {});
            return { data: { deleted: true as const } };
          },
          () => base_apiKeys.remove(id),
        ),
    };

    // ---- metrics ------------------------------------------------------------------------------
    const base_metrics = this.metrics;
    this.metrics = {
      ...base_metrics,
      chats: (opts: { days?: number } = {}) =>
        this.guard(
          async () => {
            const days = Math.min(Math.max(opts.days ?? 14, 1), 90);
            const ws = await this.wsId();
            const { data, error } = await this.sb()
              .from('conversations')
              .select('created_at,status')
              .eq('workspace_id', ws)
              .gte('created_at', new Date(Date.now() - days * 86400000).toISOString());
            if (error) throw supaError(error);
            const convs = (data ?? []) as Row[];
            const out: { date: string; total: number; missed: number }[] = [];
            for (let i = days - 1; i >= 0; i--) {
              const d = new Date();
              d.setDate(d.getDate() - i);
              const key = d.toISOString().slice(0, 10);
              const day = convs.filter((c) => isoOf(c.created_at).slice(0, 10) === key);
              out.push({ date: key, total: day.length, missed: day.filter((c) => c.status === 'missed').length });
            }
            return { data: out };
          },
          () => base_metrics.chats(opts),
        ),
      responseTimes: () =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            const { data, error } = await this.sb()
              .from('messages')
              .select('conversation_id,sender,created_at')
              .eq('workspace_id', ws)
              .order('created_at', { ascending: true });
            if (error) throw supaError(error);
            const firstByConv = new Map<string, { visitor?: number; agent?: number }>();
            for (const m of (data ?? []) as Row[]) {
              const e = firstByConv.get(m.conversation_id) ?? {};
              const t = Date.parse(m.created_at);
              if (m.sender === 'visitor' && e.visitor === undefined) e.visitor = t;
              if ((m.sender === 'agent' || m.sender === 'ai') && e.agent === undefined) e.agent = t;
              firstByConv.set(m.conversation_id, e);
            }
            const samples: number[] = [];
            for (const e of firstByConv.values()) {
              if (e.visitor !== undefined && e.agent !== undefined) {
                const s = (e.agent - e.visitor) / 1000;
                if (s >= 0 && s < 86400) samples.push(s);
              }
            }
            samples.sort((a, b) => a - b);
            const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
            const p95 = samples.length ? samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))] : 0;
            return {
              data: {
                avg_first_response_sec: Math.round(avg),
                p95_first_response_sec: Math.round(p95),
                samples: samples.length,
              },
            };
          },
          () => base_metrics.responseTimes(),
        ),
      satisfaction: () =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            const { data, error } = await this.sb()
              .from('conversations')
              .select('rating')
              .eq('workspace_id', ws)
              .not('rating', 'is', null);
            if (error) throw supaError(error);
            const rated = ((data ?? []) as Row[]).map((r) => r.rating as number);
            const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
            rated.forEach((r) => {
              distribution[String(r)] = (distribution[String(r)] ?? 0) + 1;
            });
            const happy = rated.filter((r) => r >= 4).length;
            return {
              data: {
                rated: rated.length,
                distribution,
                csat_pct: rated.length ? Math.round((happy / rated.length) * 100) : 0,
              },
            };
          },
          () => base_metrics.satisfaction(),
        ),
      tickets: () =>
        this.guard(
          async () => {
            const ws = await this.wsId();
            const { data, error } = await this.sb()
              .from('tickets')
              .select('status')
              .eq('workspace_id', ws);
            if (error) throw supaError(error);
            const counts: Record<TicketStatus, number> = { new: 0, open: 0, resolved: 0 };
            for (const t of (data ?? []) as Row[]) {
              if (t.status in counts) counts[t.status as TicketStatus] += 1;
            }
            return { data: counts };
          },
          () => base_metrics.tickets(),
        ),
    };

    // ---- audit log ------------------------------------------------------------------------------
    const base_auditLog = this.auditLog;
    this.auditLog = {
      ...base_auditLog,
      list: (opts: ListOpts = {}) =>
        this.guard(
          async () => ({
            data: paginate(
              await this.selWs('audit_log', mapAudit, (q) => q.order('created_at', { ascending: false })),
              opts,
            ),
          }),
          () => base_auditLog.list(opts),
        ),
    };

    // NOTE: blog, helpDocs, contactMessages, statusEntries, copilotSettings,
    // securitySettings, dataSettings, webhooks, deliveries and
    // dataExport/dataImport/dataReset have no remote tables in the migration
    // and intentionally keep the localStorage implementation (base class).
  }
}

/** The localStorage-backed transport (default; works offline, no env vars). */
export { BrixApi as localTransport };
/** The Supabase/PostgREST-backed transport (active when env vars are set). */
export { SupabaseBrixApi as supabaseTransport };

/**
 * Pick the active transport: Supabase when VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY are both configured, otherwise localStorage.
 * Signatures and return shapes are identical either way.
 */
export function getTransport(workspace: string, actor = 'system'): BrixApi {
  return isSupabaseEnabled() ? new SupabaseBrixApi(workspace, actor) : new BrixApi(workspace, actor);
}

/* eslint-enable @typescript-eslint/no-explicit-any */
