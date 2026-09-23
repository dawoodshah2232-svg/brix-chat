// Brix Chat — customer ticket portal + shared widget helpers (no login required).
//
// This module is the contract between three surfaces:
//   1. src/pages/TicketPortal.tsx — the public /support page (submit + track).
//   2. public/widget.js — the dependency-free embed loader (callback flow,
//      queue flag). It re-implements the small documented shapes below in
//      vanilla JS because it cannot import this module.
//   3. src/widget/WidgetPage.tsx — the in-app widget demo/preview.
//
// ---------------------------------------------------------------------------
// PORTAL → DASHBOARD BRIDGE (read this before changing ticket persistence)
// ---------------------------------------------------------------------------
// The client dashboard's Tickets page (src/app/Tickets.tsx) does NOT read
// tickets from the 'brixchat_v1' store — ChatData has no `tickets` field and
// store.tsx must not be edited. Tickets.tsx reads through the local API:
//
//   getApi(workspace, actor).tickets.list()
//     → localStorage['brixchat_api_v1']            (DBMap = Record<workspaceId, ApiDB>)
//       → [workspaceId].tickets                    (ApiTicket[])
//
// So the bridge below writes portal tickets via `getApi(ws).tickets.create()`
// — the exact same write path the dashboard itself uses (correct ApiTicket
// shape, audit entry, and dashboard notification included). The portal also
// keeps its own copy under PORTAL_TICKETS_KEY (public BX-#### ids, status
// timeline, replies) because the dashboard has no customer-facing lookup.
// Cross-reference: every bridged dashboard ticket is tagged `portal:<BX-id>`
// and the portal record stores the dashboard ticket id back.
//
// Workspace note: the public portal has no login, so it targets the 'demo'
// workspace — the same workspace the widget (WidgetPage) uses via
// getApi('demo', 'widget'). A production backend would resolve the workspace
// from the property key instead.

import { getApi } from './api';
import type { ApiTicket } from './api';
import { uid } from './utils';

/** Portal's own ticket records (public BX-#### ids, timeline, replies). */
export const PORTAL_TICKETS_KEY = 'brixchat_portal_tickets_v1';
/** Honest local fallback for callback requests created while the API db is unreachable. */
export const CALLBACK_QUEUE_KEY = 'brixchat_callback_queue_v1';
/**
 * SHARED CHAT-QUEUE KEY — also read/written by public/widget.js (loader) and
 * src/widget/WidgetPage.tsx (widget panel).
 * Shape: Record<propertyId, QueueEntry[]> — waiting visitors, oldest first.
 * A new joiner's position = 1 + (entries already waiting).
 */
export const QUEUE_LS_KEY = 'brixchat_queue_v1';

/** The demo workspace the no-login surfaces (portal + widget) write into. */
export const PORTAL_WORKSPACE = 'demo';

export type PortalTicketStatus = 'open' | 'in_progress' | 'resolved';

export interface PortalReply {
  id: string;
  from: 'system' | 'agent';
  text: string;
  /** epoch ms */
  at: number;
}

export interface PortalTicket {
  /** Public id, e.g. "BX-4821" — the customer keeps this to track the ticket. */
  id: string;
  workspace: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  message: string;
  preferredTime?: string;
  status: PortalTicketStatus;
  replies: PortalReply[];
  source: 'portal';
  /** Id of the mirrored ticket in the dashboard API db (set when the bridge succeeds). */
  dashboardTicketId?: string;
  createdAt: number;
  updatedAt: number;
}

export const PORTAL_CATEGORIES = ['General question', 'Billing', 'Technical issue', 'Sales', 'Feedback'] as const;
export const PORTAL_PRIORITIES: Array<PortalTicket['priority']> = ['low', 'medium', 'high', 'urgent'];

const TIMELINE: PortalTicketStatus[] = ['open', 'in_progress', 'resolved'];
export const TIMELINE_LABELS: Record<PortalTicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
};
export function timelineSteps(current: PortalTicketStatus): Array<{ id: PortalTicketStatus; label: string; done: boolean; current: boolean }> {
  const idx = TIMELINE.indexOf(current);
  return TIMELINE.map((id, i) => ({ id, label: TIMELINE_LABELS[id], done: i < idx, current: i === idx }));
}

/* ------------------------------ storage ------------------------------ */

export function loadPortalTickets(): PortalTicket[] {
  try {
    const raw = localStorage.getItem(PORTAL_TICKETS_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as PortalTicket[]) : [];
  } catch {
    return [];
  }
}

export function savePortalTickets(tickets: PortalTicket[]): void {
  try {
    localStorage.setItem(PORTAL_TICKETS_KEY, JSON.stringify(tickets));
  } catch {
    /* storage unavailable — reads still work */
  }
}

/** Unique public id like "BX-4821". */
export function newPortalTicketId(existing: PortalTicket[]): string {
  const taken = new Set(existing.map((t) => t.id));
  let id = '';
  do {
    id = `BX-${1000 + Math.floor(Math.random() * 9000)}`;
  } while (taken.has(id));
  return id;
}

export function findPortalTicket(tickets: PortalTicket[], id: string, email: string): PortalTicket | null {
  const wantId = id.trim().toUpperCase();
  const wantEmail = email.trim().toLowerCase();
  return tickets.find((t) => t.id.toUpperCase() === wantId && t.email.toLowerCase() === wantEmail) ?? null;
}

/* ------------------------------ bridge ------------------------------ */

/**
 * Mirror a portal ticket into the dashboard's ticket store via the same
 * `tickets.create` path /app Tickets uses. Returns the dashboard ticket id,
 * or null when the API write failed (the portal keeps its own copy either way).
 */
export async function bridgeTicketToDashboard(t: PortalTicket): Promise<string | null> {
  try {
    const api = getApi(t.workspace, 'support-portal');
    const detail: string[] = [
      t.message,
      '',
      `— submitted through the customer support portal (ref ${t.id}) —`,
    ];
    if (t.phone) detail.push(`Phone: ${t.phone}`);
    if (t.preferredTime) detail.push(`Preferred contact time: ${t.preferredTime}`);
    const { data } = await api.tickets.create({
      subject: t.subject,
      requester_name: t.name,
      requester_email: t.email,
      message: detail.join('\n'),
      priority: t.priority,
      tags: ['portal', `portal:${t.id}`, t.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')],
    });
    return data.id;
  } catch {
    return null;
  }
}

const DASH_TO_PORTAL: Record<ApiTicket['status'], PortalTicketStatus> = {
  new: 'open',
  open: 'in_progress',
  resolved: 'resolved',
};

/**
 * Pull the latest status from the mirrored dashboard ticket so the customer
 * sees what the team did in /app Tickets (status changes, resolution).
 * Agent replies: /app Tickets has no reply composer in this build, so the
 * portal surfaces status milestones as read-only timeline updates instead of
 * inventing agent messages.
 */
export async function syncTicketFromDashboard(t: PortalTicket): Promise<PortalTicket> {
  if (!t.dashboardTicketId) return t;
  try {
    const api = getApi(t.workspace, 'support-portal');
    const { data } = await api.tickets.get(t.dashboardTicketId);
    const mapped = DASH_TO_PORTAL[data.status] ?? 'open';
    if (mapped === t.status) return t;
    const replies = [...t.replies];
    if (mapped === 'in_progress' && t.status === 'open') {
      replies.push({
        id: uid('r'), from: 'system', at: Date.now(),
        text: 'A teammate has picked up your request and is working on it.',
      });
    }
    if (mapped === 'resolved' && t.status !== 'resolved') {
      replies.push({
        id: uid('r'), from: 'system', at: Date.now(),
        text: 'Marked as resolved by our team. If anything is still wrong, submit a new request and mention this ticket ID.',
      });
    }
    return { ...t, status: mapped, replies, updatedAt: Date.now() };
  } catch {
    return t;
  }
}

/* ------------------------------ chat queue ------------------------------ */

export interface QueueEntry {
  id: string;
  joinedAt: number;
  name?: string;
}

function readQueueMap(): Record<string, QueueEntry[]> {
  try {
    const raw = localStorage.getItem(QUEUE_LS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, QueueEntry[]>) : {};
  } catch {
    return {};
  }
}

function writeQueueMap(map: Record<string, QueueEntry[]>): void {
  try {
    localStorage.setItem(QUEUE_LS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Entries older than this are treated as abandoned sessions and pruned on read. */
export const QUEUE_ENTRY_TTL_MS = 30 * 60 * 1000;

/** Waiting entries for a property, oldest first (abandoned entries pruned). */
export function readQueue(propertyId: string): QueueEntry[] {
  const map = readQueueMap();
  const raw = map[propertyId];
  const list = Array.isArray(raw) ? raw : [];
  const cutoff = Date.now() - QUEUE_ENTRY_TTL_MS;
  const fresh = list.filter((e) => e && typeof e.joinedAt === 'number' && e.joinedAt >= cutoff);
  if (fresh.length !== list.length) {
    if (fresh.length === 0) delete map[propertyId];
    else map[propertyId] = fresh;
    writeQueueMap(map);
  }
  return fresh;
}

/**
 * Join the queue. Returns the entry id and the 1-based position —
 * 1 + the number of entries already waiting (simple, honest).
 */
export function joinQueue(propertyId: string, name?: string): { id: string; position: number } {
  const map = readQueueMap();
  const list = readQueue(propertyId);
  const entry: QueueEntry = { id: uid('q'), joinedAt: Date.now(), name: name?.slice(0, 80) || undefined };
  const position = list.length + 1;
  map[propertyId] = [...list, entry].slice(-200);
  writeQueueMap(map);
  return { id: entry.id, position };
}

/** Leave the queue (chat ended, or an agent picked the visitor up). */
export function leaveQueue(propertyId: string, id: string): void {
  const map = readQueueMap();
  const list = readQueue(propertyId).filter((e) => e.id !== id);
  if (list.length === 0) delete map[propertyId];
  else map[propertyId] = list;
  writeQueueMap(map);
}

/** Current 1-based position of an entry; 0 when it is not (or no longer) queued. */
export function queuePosition(propertyId: string, id: string): number {
  const idx = readQueue(propertyId).findIndex((e) => e.id === id);
  return idx === -1 ? 0 : idx + 1;
}

/**
 * Wait estimate for display: (position − 1) × 2 minutes, minimum 1.
 * A rough estimate only — the UI labels it "about".
 */
export function queueWaitMins(position: number): number {
  return Math.max(1, (position - 1) * 2);
}

export function queueLine(position: number): string {
  return `You're #${position} in line — about ${queueWaitMins(position)} min wait`;
}
