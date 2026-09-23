// Brix Chat — admin-scoped keyboard shortcuts.
// g then <key> jumps tabs, / opens search, ? opens help, Cmd/Ctrl+K opens search.

import { useEffect, useRef } from 'react';
import { Modal } from '../ui';
import { cx } from '../../lib/utils';

export interface ShortcutDef {
  keys: string;
  label: string;
}

export const ADMIN_SHORTCUTS: ShortcutDef[] = [
  { keys: 'g then o', label: 'Overview' },
  { keys: 'g then c', label: 'Clients' },
  { keys: 'g then p', label: 'Properties' },
  { keys: 'g then b', label: 'Plans & billing' },
  { keys: 'g then n', label: 'Content' },
  { keys: 'g then s', label: 'System' },
  { keys: 'g then a', label: 'Audit log' },
  { keys: 'g then e', label: 'Settings' },
  { keys: '/', label: 'Focus admin search' },
  { keys: '⌘/Ctrl + K', label: 'Admin search (jump to any entity)' },
  { keys: '?', label: 'This help' },
  { keys: 'Esc', label: 'Close dialog' },
];

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

/** Wires admin-wide shortcuts. Handlers must be stable (use refs internally). */
export function useAdminShortcuts(handlers: {
  onGo: (tab: string) => void;
  onSearch: () => void;
  onHelp: () => void;
  enabled: boolean;
}) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!ref.current.enabled) return;
    let pendingG = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    const cancelG = () => {
      pendingG = false;
      if (gTimer) clearTimeout(gTimer);
      gTimer = null;
    };

    const onKey = (e: KeyboardEvent) => {
      const h = ref.current;
      if (!h.enabled) return;
      const meta = e.metaKey || e.ctrlKey;

      if (e.key === 'Escape') {
        cancelG();
        return; // Modals handle their own close.
      }
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        h.onSearch();
        cancelG();
        return;
      }
      if (isEditable(e.target) || meta || e.altKey) {
        cancelG();
        return;
      }

      if (pendingG) {
        const k = e.key.toLowerCase();
        const map: Record<string, string> = {
          o: 'overview', c: 'clients', p: 'properties', b: 'plans',
          n: 'content', s: 'system', a: 'audit', e: 'settings',
        };
        const tab = map[k];
        if (tab) {
          e.preventDefault();
          h.onGo(tab);
        }
        cancelG();
        return;
      }

      if (e.key === 'g') {
        pendingG = true;
        gTimer = setTimeout(cancelG, 1200);
      } else if (e.key === '/') {
        e.preventDefault();
        h.onSearch();
      } else if (e.key === '?') {
        e.preventDefault();
        h.onHelp();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function ShortcutsHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts">
      <p className="text-[13px] text-slate-500 mb-4">
        Shortcuts work anywhere in the admin console except while typing in a field. Press <Kbd>g</Kbd> then a letter to jump between tabs.
      </p>
      <div className="space-y-1.5">
        {ADMIN_SHORTCUTS.map((s) => (
          <div key={s.keys + s.label} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50">
            <span className="text-sm text-slate-700">{s.label}</span>
            <Kbd>{s.keys}</Kbd>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-4">Admin search (⌘/Ctrl+K) finds properties, members, webhooks, API keys, articles, canned replies, tickets, and contacts — and jumps to the right tab.</p>
    </Modal>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className={cx('inline-block rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold font-mono text-slate-600')}>
      {children}
    </kbd>
  );
}
