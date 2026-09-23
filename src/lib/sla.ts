// Brix Chat — SLA policies + countdown helpers (P4-16).
// Policies live in workspace settings (ChatData); the Tickets page applies
// them when creating tickets and renders live countdowns / breach filters.

export type SlaPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface SlaPolicy {
  priority: SlaPriority;
  enabled: boolean;
  /** Target hours for first agent response. */
  firstResponseHours: number;
  /** Target hours for resolution (drives the ticket's sla_due). */
  resolveHours: number;
}

export const DEFAULT_SLA_POLICIES: SlaPolicy[] = [
  { priority: 'urgent', enabled: true, firstResponseHours: 1, resolveHours: 4 },
  { priority: 'high', enabled: true, firstResponseHours: 4, resolveHours: 24 },
  { priority: 'medium', enabled: true, firstResponseHours: 8, resolveHours: 72 },
  { priority: 'low', enabled: false, firstResponseHours: 24, resolveHours: 168 },
];

export function policyFor(policies: SlaPolicy[] | undefined, priority: SlaPriority): SlaPolicy | null {
  const list = policies && policies.length > 0 ? policies : DEFAULT_SLA_POLICIES;
  return list.find((p) => p.priority === priority && p.enabled) ?? null;
}

export type SlaState = 'none' | 'ok' | 'risk' | 'breached';

/** Classify an sla_due ISO timestamp. "risk" = due within 24h. */
export function slaState(slaDue: string | null | undefined, now = Date.now()): SlaState {
  if (!slaDue) return 'none';
  const t = Date.parse(slaDue);
  if (Number.isNaN(t)) return 'none';
  const diff = t - now;
  if (diff < 0) return 'breached';
  if (diff < 24 * 3600000) return 'risk';
  return 'ok';
}

/** Human countdown: "in 45m", "in 3h 12m", "in 2d", "breached 3h ago". */
export function slaCountdown(slaDue: string | null | undefined, now = Date.now()): string {
  if (!slaDue) return 'No SLA';
  const t = Date.parse(slaDue);
  if (Number.isNaN(t)) return 'No SLA';
  const diff = t - now;
  const abs = Math.abs(diff);
  const m = Math.floor(abs / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const body = d > 0 ? `${d}d${h % 24 > 0 ? ` ${h % 24}h` : ''}` : h > 0 ? `${h}h${m % 60 > 0 ? ` ${m % 60}m` : ''}` : `${Math.max(1, m)}m`;
  return diff < 0 ? `breached ${body} ago` : `in ${body}`;
}

/** Proposed sla_due for a new ticket from its priority policy. */
export function slaDueFromPolicy(policies: SlaPolicy[] | undefined, priority: SlaPriority, from = Date.now()): string | null {
  const p = policyFor(policies, priority);
  if (!p) return null;
  return new Date(from + p.resolveHours * 3600000).toISOString();
}
