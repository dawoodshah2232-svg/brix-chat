// Brix Chat — admin-scoped global search (⌘/Ctrl+K, /).
// Searches properties, members, webhooks, API keys, KB articles, canned
// replies, tickets, and contacts. Enter jumps to the right tab and
// highlights the row.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Badge } from '../ui';
import { cx } from '../../lib/utils';
import type { BrixApi, ApiTicket, ApiContact, ApiCanned } from '../../lib/api';

export type AdminTabId =
  | 'overview' | 'content' | 'properties' | 'branding' | 'ratings' | 'departments'
  | 'keys' | 'integrations' | 'webhooks' | 'team' | 'audit' | 'install' | 'reports';

export interface SearchItem {
  kind: string;
  id: string;
  title: string;
  subtitle: string;
  tab: AdminTabId;
}

const KIND_TONE: Record<string, 'indigo' | 'green' | 'amber' | 'rose' | 'cyan' | 'slate'> = {
  Property: 'indigo', Member: 'green', Webhook: 'amber', 'API key': 'rose',
  Article: 'cyan', Canned: 'slate', Ticket: 'rose', Contact: 'indigo',
};

export async function collectAdminSearchItems(api: BrixApi, p2: any): Promise<SearchItem[]> {
  const items: SearchItem[] = [];
  const push = (i: SearchItem) => items.push(i);
  const results = await Promise.allSettled([
    api.properties.list(),
    api.agents.list(),
    api.webhooks.list(),
    api.apiKeys.list(),
    api.canned.list(),
    api.tickets.list({ limit: 200 }),
    api.contacts.list({ limit: 200 }),
    p2.helpDocs.list().catch(() => ({ data: [] as unknown[] })),
  ]);
  const ok = <T,>(r: PromiseSettledResult<{ data: T }>, fallback: T): T =>
    r.status === 'fulfilled' ? r.value.data : fallback;
  const arr = <T,>(d: { items: T[] } | T[]): T[] => (Array.isArray(d) ? d : d.items ?? []);

  for (const p of ok(results[0], [])) {
    push({ kind: 'Property', id: p.id, title: p.name, subtitle: p.domain || p.public_key, tab: 'properties' });
  }
  for (const a of ok(results[1], [])) {
    push({ kind: 'Member', id: a.id, title: a.display_name, subtitle: `${a.role}${a.active === false ? ' · deactivated' : ''}`, tab: 'team' });
  }
  for (const w of ok(results[2], [])) {
    push({ kind: 'Webhook', id: w.id, title: w.url, subtitle: `${w.events.length} events${w.enabled ? '' : ' · disabled'}`, tab: 'webhooks' });
  }
  for (const k of ok(results[3], [])) {
    push({ kind: 'API key', id: k.id, title: k.name, subtitle: `${k.prefix}…${k.revoked ? ' · revoked' : ''}`, tab: 'keys' });
  }
  for (const c of ok(results[4], [])) {
    push({ kind: 'Canned', id: c.id, title: c.title, subtitle: c.shortcut || c.body.slice(0, 60), tab: 'content' });
  }
  for (const t of arr(ok(results[5], { items: [] as ApiTicket[] }))) {
    push({ kind: 'Ticket', id: t.id, title: t.subject, subtitle: `${t.status} · ${t.priority}`, tab: 'team' });
  }
  for (const c of arr(ok(results[6], { items: [] as ApiContact[] }))) {
    push({ kind: 'Contact', id: c.id, title: c.name || c.email, subtitle: c.email || c.phone || '', tab: 'content' });
  }
  for (const a of arr(ok(results[7], [] as Array<{ id: string; title: string; category?: string }>))) {
    push({ kind: 'Article', id: a.id, title: a.title, subtitle: a.category ?? '', tab: 'content' });
  }
  return items;
}

export function AdminCommandPalette({
  open,
  onClose,
  items,
  loading,
  onJump,
}: {
  open: boolean;
  onClose: () => void;
  items: SearchItem[];
  loading: boolean;
  onJump: (tab: AdminTabId, id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open ]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.slice(0, 12);
    return items
      .filter((i) => `${i.kind} ${i.title} ${i.subtitle}`.toLowerCase().includes(needle))
      .slice(0, 25);
  }, [items, q]);

  useEffect(() => setSel(0), [q]);

  const go = (i: SearchItem) => {
    onJump(i.tab, i.id);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && filtered[sel]) go(filtered[sel]);
  };

  const grouped = useMemo(() => {
    const map = new Map<string, SearchItem[]>();
    for (const i of filtered) {
      const g = map.get(i.kind) ?? [];
      g.push(i);
      map.set(i.kind, g);
    }
    return [...map.entries()];
  }, [filtered]);

  let flat = 0;

  return (
    <Modal open={open} onClose={onClose} title="Admin search">
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search properties, members, webhooks, keys, articles…"
        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brix-300 mb-3"
      />
      {loading ? (
        <p className="text-sm text-slate-400 py-6 text-center">Indexing admin entities…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">No matches. Try a name, URL, or key prefix.</p>
      ) : (
        <div className="max-h-[50vh] overflow-auto slim-scroll -mx-1 px-1">
          {grouped.map(([kind, list]) => (
            <div key={kind} className="mb-3">
              <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 px-2 mb-1">{kind}s</div>
              {list.map((i) => {
                const idx = flat++;
                return (
                  <button
                    key={i.kind + i.id}
                    onClick={() => go(i)}
                    onMouseEnter={() => setSel(idx)}
                    className={cx(
                      'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                      sel === idx ? 'bg-brix-50 ring-1 ring-brix-200' : 'hover:bg-slate-50',
                    )}
                  >
                    <Badge tone={KIND_TONE[i.kind] ?? 'slate'}>{i.kind}</Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-900 truncate">{i.title}</span>
                      <span className="block text-xs text-slate-400 truncate">{i.subtitle}</span>
                    </span>
                    <span className="text-xs font-bold text-brix-600 shrink-0">Jump →</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-2">↑↓ to move · Enter to jump to the tab and highlight the row · Esc to close</p>
    </Modal>
  );
}
