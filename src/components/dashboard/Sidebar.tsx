// Brix Chat — grouped, collapsible dashboard sidebar.

import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cx } from '../../lib/utils';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

export interface SidebarItem {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  end?: boolean;
  title?: string;
}

export interface SidebarGroup {
  label: string;
  items: SidebarItem[];
}

function BadgePill({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={cx(
        'ml-auto min-w-6 h-6 px-1.5 grid place-items-center rounded-full text-[11px] font-bold shrink-0',
        active ? 'bg-white text-brix-700' : 'bg-rose-500 text-white',
      )}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

export function DashboardSidebar({
  groups,
  bottomGroups,
  collapsed,
  onToggle,
  footer,
}: {
  groups: SidebarGroup[];
  bottomGroups?: SidebarGroup[];
  collapsed: boolean;
  onToggle: () => void;
  footer?: ReactNode;
}) {
  const renderItem = (item: SidebarItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : item.title}
      className={({ isActive }) =>
        cx(
          'relative flex items-center gap-3 rounded-xl text-sm font-semibold transition-all group/item',
          collapsed ? 'justify-center px-0 py-3' : 'px-3.5 py-2.5',
          isActive
            ? collapsed
              ? 'bg-brix-600 text-white shadow-lg shadow-brix-600/30'
              : 'bg-brix-600 text-white shadow-lg shadow-brix-600/30 translate-x-0.5'
            : 'text-slate-300 hover:bg-white/[0.07] hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-cyan-300" />
          )}
          <span className={cx('shrink-0', collapsed && 'relative')}>
            {item.icon}
            {collapsed && item.badge != null && item.badge > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 border-2 border-ink-950" />
            )}
          </span>
          {!collapsed && (
            <>
              <span className="truncate">{item.label}</span>
              {item.badge != null && item.badge > 0 && <BadgePill n={item.badge} active={isActive} />}
            </>
          )}
          {collapsed && (
            <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-ink-950 border border-white/10 text-white text-xs font-semibold whitespace-nowrap opacity-0 group-hover/item:opacity-100 transition-opacity z-50 shadow-xl">
              {item.label}
              {item.badge != null && item.badge > 0 && (
                <span className="ml-1.5 text-rose-300 font-bold">{item.badge > 99 ? '99+' : item.badge}</span>
              )}
            </span>
          )}
        </>
      )}
    </NavLink>
  );

  const renderGroup = (g: SidebarGroup, idx: number) => (
    <div key={`${g.label}-${idx}`} className={cx(collapsed ? 'px-2.5' : 'px-3')}>
      {!collapsed && (
        <div className="px-3.5 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
          {g.label}
        </div>
      )}
      {collapsed && idx > 0 && <div className="my-2 mx-1 border-t border-white/10" />}
      <div className="space-y-1">{g.items.map(renderItem)}</div>
    </div>
  );

  return (
    <aside
      className={cx(
        'hidden lg:flex shrink-0 bg-ink-950 flex-col transition-[width] duration-200 border-r border-white/5',
        collapsed ? 'w-[76px]' : 'w-60',
      )}
    >
      <div className={cx('flex items-center gap-2.5 py-5', collapsed ? 'justify-center px-0' : 'px-5')}>
        <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-brix-500 to-cyan-400 grid place-items-center text-white text-lg font-black shadow-lg shadow-brix-600/30">
          B
        </div>
        {!collapsed && (
          <div className="font-display font-extrabold text-white text-lg tracking-tight whitespace-nowrap">
            Brix<span className="text-cyan-300">Chat</span>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto slim-scroll pb-3">
        {groups.map(renderGroup)}
        {bottomGroups && bottomGroups.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/10">{bottomGroups.map(renderGroup)}</div>
        )}
      </nav>

      <div className={cx('border-t border-white/10', collapsed ? 'p-2.5' : 'p-3')}>
        <button
          onClick={onToggle}
          className={cx(
            'w-full flex items-center gap-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition text-xs font-semibold',
            collapsed ? 'justify-center py-2.5' : 'px-3.5 py-2.5',
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          {!collapsed && <span>Collapse</span>}
        </button>
        {footer}
      </div>
    </aside>
  );
}
