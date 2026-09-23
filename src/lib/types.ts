// Brix Chat — shared domain types (demo mode: localStorage-backed, no backend)

export type MsgFrom = 'visitor' | 'agent' | 'ai' | 'system';
export type MsgKind = 'text' | 'file' | 'voice' | 'rating';

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
}

export interface InternalNote {
  id: string;
  text: string;
  ts: number;
  author: string;
}

export type ConvStatus = 'open' | 'closed' | 'spam' | 'missed';

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
}

export interface Canned {
  id: string;
  shortcut: string;
  title: string;
  body: string;
}

export interface TriggerRule {
  id: string;
  name: string;
  kind: 'proactive' | 'routing';
  conditions: string[];
  action: string;
  enabled: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  audience: string;
  message: string;
  schedule: string;
  status: 'draft' | 'scheduled' | 'sent';
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

export interface Settings {
  widget: WidgetSettings;
  departments: string[];
  team: TeamMember[];
  hours: OnlineSegment[];
  whiteLabel: boolean;
  aiEnabled: boolean;
  notifySound: boolean;
}

export type MemberRole = 'admin' | 'agent' | 'developer' | 'viewer';

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
  canned: Canned[];
  triggers: TriggerRule[];
  campaigns: Campaign[];
  settings: Settings;
}
