// Brix Chat — saved named filter sets for admin lists.
// Persisted per-workspace in localStorage; quick-apply chips with delete.

import { useCallback, useEffect, useState } from 'react';
import { cx } from '../../lib/utils';

export interface SavedFilter {
  id: string;
  name: string;
  value: Record<string, string>; // e.g. { role: 'agent', status: 'active', q: 'layla' }
}

function keyFor(scope: string, workspace: string): string {
  return `brix.admin.savedFilters.${workspace}.${scope}`;
}

export function useSavedFilters(scope: string, workspace: string): {
  filters: SavedFilter[];
  save: (name: string, value: Record<string, string>) => void;
  remove: (id: string) => void;
} {
  const [filters, setFilters] = useState<SavedFilter[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(keyFor(scope, workspace));
      setFilters(raw ? (JSON.parse(raw) as SavedFilter[]) : []);
    } catch {
      setFilters([]);
    }
  }, [scope, workspace]);

  const persist = useCallback(
    (next: SavedFilter[]) => {
      setFilters(next);
      try {
        localStorage.setItem(keyFor(scope, workspace), JSON.stringify(next));
      } catch {
        /* storage full/blocked — filters just don't persist */
      }
    },
    [scope, workspace],
  );

  const save = useCallback(
    (name: string, value: Record<string, string>) => {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(value)) if (v) cleaned[k] = v;
      persist([...filters.filter((f) => f.name.toLowerCase() !== name.trim().toLowerCase()), {
        id: `sf_${Date.now().toString(36)}`,
        name: name.trim(),
        value: cleaned,
      }]);
    },
    [filters, persist],
  );

  const remove = useCallback((id: string) => persist(filters.filter((f) => f.id !== id)), [filters, persist]);

  return { filters, save, remove };
}

/** Chip bar: quick-apply saved filters, save the current one, delete saved ones. */
export function SavedFilterBar({
  scope,
  workspace,
  current,
  onApply,
  saveName,
  setSaveName,
  hint,
}: {
  scope: string;
  workspace: string;
  current: Record<string, string>;
  onApply: (value: Record<string, string>) => void;
  saveName: string;
  setSaveName: (v: string) => void;
  hint?: string;
}) {
  const { filters, save, remove } = useSavedFilters(scope, workspace);
  const hasActive = Object.values(current).some(Boolean);

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => {
          const isActive = JSON.stringify(f.value) === JSON.stringify(current);
          return (
            <span
              key={f.id}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full pl-3 pr-1.5 py-1 text-xs font-bold border transition',
                isActive
                  ? 'bg-brix-600 border-brix-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-brix-300 hover:text-brix-700',
              )}
            >
              <button onClick={() => onApply(f.value)} title="Apply filter">{f.name}</button>
              <button
                onClick={() => remove(f.id)}
                className={cx('w-5 h-5 rounded-full grid place-items-center text-[10px]', isActive ? 'hover:bg-white/20' : 'hover:bg-slate-100 text-slate-400')}
                title="Delete saved filter"
                aria-label={`Delete filter ${f.name}`}
              >
                ✕
              </button>
            </span>
          );
        })}
        <div className="flex items-center gap-1.5 ml-1">
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Name this filter…"
            className="w-36 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-brix-200"
          />
          <button
            disabled={!saveName.trim() || !hasActive}
            onClick={() => {
              save(saveName, current);
              setSaveName('');
            }}
            className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-xs font-bold hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none"
            title={hasActive ? 'Save current filters' : 'Set a filter first'}
          >
            Save
          </button>
        </div>
      </div>
      {hint && <p className="text-[11px] text-slate-400 mt-1.5">{hint}</p>}
    </div>
  );
}
