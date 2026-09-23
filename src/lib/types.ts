// Brix Chat — shared domain types (demo mode: localStorage-backed, no backend)

import type { QualityWeights } from './quality';
import type { SlaPolicy } from './sla';

export type MsgFrom = 'visitor' | 'agent' | 'ai' | 'system';
// phase 4 (P4-17): 'audio' = widget/dashboard voice-note message (HTML5 player,
// blob persisted in localStorage size-capped; ChatThread renders its side).
export type MsgKind = 'text' | 'file' | 'voice' | 'audio' | 'rating';

export interface ChatMessage {
  id: string;
  from: MsgFrom;
  kind: MsgKind;
  text: string;
  ts: number;
  name?: string;
  fileName?: string;
  fileSize?: string;
  durationSec?: number;
  rating?: number; // 1..5 for kind === 'rating'
  audio_url?: string; // P4-17: playback URL for kind === 'audio' (object URL or data URL)
  audio_duration_secs?: number; // P4-17: voice-note length in seconds
}

export interface InternalNote {
  id: string;
  text: string;
  ts: number;
  author: string;
}

export type ConvStatus = 'open' | 'closed' | 'spam' | 'missed';

export type ConvPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Conversation {
  id: string;
  visitor: string;
  email?: string;
  country: string;
  city: string;
  page: string;
  device: string;
  status: ConvStatus;
  department: string;
  agent?: string;
  tags: string[];
  messages: ChatMessage[];
  notes: InternalNote[];
  rating?: number;
  unread: number;
  aiHandled: boolean;
  createdAt: number;
  updatedAt: number;
  live?: boolean; // simulated live visitor (bot keeps chatting)
  priority?: ConvPriority; // phase 2: inbox priority flag
  snoozeUntil?: number; // phase 2: local snooze — hidden from inbox until this timestamp
}

export interface Visitor {
  id: string;
  name: string;
  page: string;
  pages: number;
  country: string;
  city: string;
  device: string;
  browser: string;
  timeOnSite: number; // seconds
  typing?: string;
  online: boolean;
  cartValue?: number;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  country: string;
  tags: string[];
  notes: string;
  chats: number;
  lastSeen: number;
  source: string;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  body: string;
  category: string;
  status: 'draft' | 'published';
  updatedAt: number;
  views: number;
  helpful?: number; // phase 2: "was this helpful" up-votes
  notHelpful?: number; // phase 2: down-votes
  // phase 4 (P4-4): guided troubleshooting trees. kind defaults to 'article'
  // when unset; 'guide' articles carry ordered guide_steps.
  kind?: ArticleKind;
  guide_steps?: GuideStep[];
}

// phase 4 (P4-20) — a snapshot of an article before it was edited.
export interface ArticleRevision {
  id: string;
  articleId: string;
  at: number;
  by: string;
  title: string;
  body: string;
  category: string;
  status: 'draft' | 'published';
}

// phase 4 (P4-4) — shared contract for guided troubleshooting trees.
// A guide is an ordered list of steps; each step's options branch to another
// step by id. A step with no options is terminal (resolution reached).
export type ArticleKind = 'article' | 'guide';

export interface GuideOption {
  label: string;
  next_step_id: string;
}

export interface GuideStep {
  id: string;
  title: string;
  body?: string;
  options: GuideOption[];
}

export interface Canned {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  shared?: boolean; // phase 2: false = personal to owner
  owner?: string; // phase 2: display name of the personal owner
  usage?: number; // phase 2: times inserted from the inbox
}

export interface TriggerRule {
  id: string;
  name: string;
  kind: 'proactive' | 'routing';
  conditions: string[];
  action: string;
  enabled: boolean;
  // phase 2: visual step-builder fields (legacy rules keep conditions/action)
  event?: TriggerEvent;
  conditionGroups?: TriggerConditionGroup[];
  actions?: TriggerAction[];
}

export type TriggerEvent = 'chat.started' | 'message.received' | 'visitor.idle' | 'page.viewed' | 'chat.missed';

export interface TriggerCondition {
  field: 'page_url' | 'time_on_page' | 'cart_value' | 'message_contains' | 'contact_tag' | 'department';
  op: 'contains' | 'equals' | 'greater_than' | 'less_than' | 'is';
  value: string;
}

export interface TriggerConditionGroup {
  op: 'and' | 'or';
  conditions: TriggerCondition[];
}

export interface TriggerAction {
  kind: 'message' | 'assign' | 'tag' | 'priority' | 'campaign' | 'ticket';
  value: string;
}

export interface Campaign {
  id: string;
  name: string;
  audience: string;
  message: string;
  schedule: string;
  status: 'draft' | 'scheduled' | 'sent';
  // phase 2: scheduling + audience rules + goal tracking
  scheduleAt?: number; // timestamp for "send later"
  audienceRules?: { urlContains?: string; visitorType?: 'any' | 'new' | 'returning'; tags?: string[] };
  goalId?: string;
}

export interface TeamMember {
  name: string;
  role: 'Admin' | 'Agent';
  online: boolean;
  color: string;
}

export interface WidgetSettings {
  color: string;
  position: 'bottom-right' | 'bottom-left';
  bubble: 'round' | 'pill' | 'square';
  radius: number;
  greeting: string;
  offlineText: string;
  agentName: string;
  showBranding: boolean;
}

export interface OnlineSegment {
  day: string;
  from: string;
  to: string;
  enabled: boolean;
}

export interface NotifyPrefs {
  sound: boolean;
  desktopBell: boolean;
  events: Record<string, boolean>; // event key -> enabled
}

export interface Settings {
  widget: WidgetSettings;
  departments: string[];
  team: TeamMember[];
  hours: OnlineSegment[];
  whiteLabel: boolean;
  aiEnabled: boolean;
  notifySound: boolean;
  notifyPrefs?: NotifyPrefs; // phase 2
  /** Distress alerts (P4-6): heuristic visitor-distress detection on new messages. */
  distress?: DistressSettings;
  /** Admin-editable quality rubric weights (P4-7). Falls back to DEFAULT_QUALITY_WEIGHTS. */
  qualityRubric?: QualityWeights;
  /** SLA policies per ticket priority (P4-16). Falls back to DEFAULT_SLA_POLICIES. */
  slaPolicies?: SlaPolicy[];
  /** Bot & handoff config (P4-18). */
  bot?: {
    /** Auto-reply confidence below this (0–100) → route to a human instead. */
    confidenceThreshold: number;
    /** Minutes an AI-handled chat may wait for agent pickup before escalation. */
    handoffTimeoutMins: number;
  };
}

export interface DistressSettings {
  /** When false, no distress detection runs. Default true. */
  enabled: boolean;
  /** Extra words/phrases (comma input in Settings) that trigger a distress alert. */
  customWords: string[];
}

export type MemberRole = 'owner' | 'admin' | 'agent' | 'developer' | 'viewer';

export interface Workspace {
  name: string;
  displayName: string;
  passcode: string;
  role: MemberRole; // role of this login inside the workspace (demo: admin)
  createdAt: number;
}

export interface ChatData {
  conversations: Conversation[];
  visitors: Visitor[];
  contacts: Contact[];
  articles: Article[];
  /** P4-20: KB revision history (previous versions of articles). */
  articleRevisions?: ArticleRevision[];
  canned: Canned[];
  triggers: TriggerRule[];
  campaigns: Campaign[];
  settings: Settings;
}
