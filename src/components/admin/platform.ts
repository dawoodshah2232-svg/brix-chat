// Brix Chat — platform admin data helpers. All platform data (clients,
// plans, settings, audit) lives on the server behind /api/admin/* — see
// src/lib/admin-api.ts. This module only derives UI-side views from it.

import { adminApi } from '../../lib/admin-api';
import type { SearchItem } from './search';

export type {
  AdminWorkspace as ClientRecord,
  Plan as PlanRecord,
  ClientStatus,
  AdminProperty as PropertyRow,
  AdminAuditEntry as ScopedAuditEntry,
  PlatformSettings,
} from '../../lib/admin-api';

/** Platform command-palette index. */
export async function collectPlatformSearchItems(): Promise<SearchItem[]> {
  const [clients, plans, properties] = await Promise.all([
    adminApi.workspaces().catch(() => []),
    adminApi.plans().catch(() => []),
    adminApi.properties().catch(() => []),
  ]);
  const items: SearchItem[] = [];
  clients.forEach((c) => {
    const plan = plans.find((p) => p.id === c.plan_id);
    items.push({ kind: 'Client', id: c.id, title: c.name, subtitle: `${c.slug} · ${plan?.name ?? c.plan_id ?? 'no plan'} · ${c.status}`, tab: 'clients' });
  });
  plans.forEach((p) => {
    items.push({ kind: 'Plan', id: p.id, title: p.name, subtitle: `$${p.price}/mo · ${p.seats} seats`, tab: 'plans' });
  });
  properties.forEach((r) => {
    items.push({ kind: 'Property', id: r.id, title: r.name, subtitle: `${r.workspace_name} · ${r.domain}`, tab: 'properties' });
  });
  return items;
}
