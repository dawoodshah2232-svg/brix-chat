// Brix Chat — dashboard shell: grouped collapsible sidebar, topbar with
// breadcrumbs + command palette, notification center, presence + profile.

import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useStore } from '../lib/store';
import { getApi } from '../lib/api';
import { Modal, Button } from '../components/ui';
import { cx } from '../lib/utils';
import { ToastHost } from '../components/dashboard/Toasts';
import { Topbar } from '../components/dashboard/Topbar';
import { CommandPalette } from '../components/dashboard/CommandPalette';
import { DashboardSidebar } from '../components/dashboard/Sidebar';
import type { SidebarGroup } from '../components/dashboard/Sidebar';
import {
  BoltIcon,
  BookIcon,
  ChartIcon,
  ChatIcon,
  CogIcon,
  ContactsIcon,
  MegaphoneIcon,
  MenuIcon,
  ShieldIcon,
  StarIcon,
  TicketIcon,
  TriggerIcon,
  UsersIcon,
  XIcon,
} from '../components/dashboard/icons';

const COLLAPSE_KEY = 'brixchat_sidebar_collapsed';

const SHORTCUTS: Array<[string, string]> = [
  ['⌘K / Ctrl+K', 'Open the command palette'],
  ['J / K', 'Move to next / previous conversation'],
  ['R', 'Focus the reply box'],
  ['/', 'Jump to search'],
  ['?', 'Open this shortcuts help'],
  ['Esc', 'Close menus'],
];

function useBadges() {
  const { session, data } = useStore();
  const [ticketBadge, setTicketBadge] = useState(0);
  const unread = data.conversations.reduce((n, c) => n + (c.status === 'open' ? c.unread : 0), 0);
  const onlineVisitors = data.visitors.filter((v) => v.online).length;

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const api = getApi(session.workspace, session.displayName);
      const { data: page } = await api.tickets.list({ limit: 200 });
      setTicketBadge(page.items.filter((t) => t.status !== 'resolved').length);
    } catch {
      /* ignore */
    }
  }, [session]);

  useEffect(() => {
    refresh();
    const iv = window.setInterval(refresh, 60000);
    window.addEventListener('brix:notify', refresh);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener('brix:notify', refresh);
    };
  }, [refresh]);

  return { unread, onlineVisitors, ticketBadge };
}

export default function AppShell() {
  const { session } = useStore();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const { unread, onlineVisitors, ticketBadge } = useBadges();

  const role = session?.role ?? 'agent';
  const canAdmin = role === 'admin' || role === 'developer';
  const showQuality = role !== 'viewer';

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  useEffect(() => {
    setMobileOpen(false);
    setPaletteOpen(false);
  }, [location.pathname]);

  // Global keyboard shortcuts (ignored while typing, except ⌘K).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        setHelpOpen(false);
        setPaletteOpen(false);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key === '/') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('brix:focus-search'));
      } else if (e.key === 'j') window.dispatchEvent(new CustomEvent('brix:inbox-move', { detail: 1 }));
      else if (e.key === 'k') window.dispatchEvent(new CustomEvent('brix:inbox-move', { detail: -1 }));
      else if (e.key === 'r') window.dispatchEvent(new CustomEvent('brix:focus-reply'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const groups: SidebarGroup[] = [
    {
      label: 'Engage',
      items: [
        { to: '/app', label: 'Inbox', icon: <ChatIcon />, end: true, badge: unread },
        { to: '/app/visitors', label: 'Live visitors', icon: <UsersIcon />, badge: onlineVisitors },
        { to: '/app/campaigns', label: 'Campaigns', icon: <MegaphoneIcon /> },
      ],
    },
    {
      label: 'Support',
      items: [
        { to: '/app/tickets', label: 'Tickets', icon: <TicketIcon />, badge: ticketBadge },
        { to: '/app/knowledge', label: 'Knowledge base', icon: <BookIcon /> },
        { to: '/app/canned', label: 'Canned responses', icon: <BoltIcon /> },
      ],
    },
    {
      label: 'Grow',
      items: [
        { to: '/app/analytics', label: 'Analytics', icon: <ChartIcon /> },
        { to: '/app/feedback', label: 'Feedback', icon: <StarIcon /> },
        { to: '/app/contacts', label: 'Contacts', icon: <ContactsIcon /> },
        ...(showQuality
          ? [{ to: '/app/quality', label: 'Quality', icon: <StarIcon />, title: 'Agent quality scorecards' }]
          : []),
      ],
    },
    {
      label: 'Automate',
      items: [{ to: '/app/triggers', label: 'Triggers', icon: <TriggerIcon /> }],
    },
  ];

  const bottomGroups: SidebarGroup[] = [
    {
      label: 'Workspace',
      items: [
        { to: '/app/settings', label: 'Settings', icon: <CogIcon /> },
        ...(canAdmin ? [{ to: '/admin', label: 'Admin console', icon: <ShieldIcon /> }] : []),
      ],
    },
  ];

  const mobileTabs = [
    { to: '/app', label: 'Inbox', icon: <ChatIcon />, end: true as const, badge: unread },
    { to: '/app/visitors', label: 'Visitors', icon: <UsersIcon />, badge: onlineVisitors },
    { to: '/app/tickets', label: 'Tickets', icon: <TicketIcon />, badge: ticketBadge },
  ];

  const mobileNavList = (
    <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto slim-scroll">
      {[...groups, ...bottomGroups].map((g) => (
        <div key={g.label}>
          <div className="px-3.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
            {g.label}
          </div>
          <div className="space-y-1">
            {g.items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition',
                    isActive
                      ? 'bg-brix-600 text-white shadow-lg shadow-brix-600/30'
                      : 'text-slate-300 hover:bg-white/[0.07] hover:text-white',
                  )
                }
              >
                <span className="shrink-0">{n.icon}</span>
                <span className="truncate">{n.label}</span>
                {n.badge != null && n.badge > 0 && (
                  <span className="ml-auto min-w-6 h-6 px-1.5 grid place-items-center rounded-full bg-rose-500 text-white text-[11px] font-bold">
                    {n.badge > 99 ? '99+' : n.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="h-screen flex bg-slate-50 text-slate-900 overflow-hidden">
      <ToastHost />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onHelp={() => setHelpOpen(true)} />

      <DashboardSidebar
        groups={groups}
        bottomGroups={bottomGroups}
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        footer={
          !collapsed ? (
            <div className="mt-2 px-3.5 py-2 rounded-xl bg-white/5 text-[11px] text-slate-400 font-medium truncate">
              {session?.workspace ?? ''}
            </div>
          ) : undefined
        }
      />

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-ink-950 flex flex-col animate-fade-up">
            <div className="flex items-center justify-between px-5 py-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brix-500 to-cyan-400 grid place-items-center text-white text-lg font-black shadow-lg shadow-brix-600/30">
                  B
                </div>
                <div className="font-display font-extrabold text-white text-lg tracking-tight">
                  Brix<span className="text-cyan-300">Chat</span>
                </div>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="w-9 h-9 grid place-items-center rounded-lg text-slate-400 hover:bg-white/10"
                aria-label="Close menu"
              >
                <XIcon />
              </button>
            </div>
            {mobileNavList}
            <div className="p-4 border-t border-white/10">
              <button
                onClick={() => setMobileOpen(false)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-300 bg-white/5 hover:bg-white/10"
              >
                <MenuIcon /> Close menu
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          onMenu={() => setMobileOpen(true)}
          onPalette={() => setPaletteOpen(true)}
          onHelp={() => setHelpOpen(true)}
        />
        <main className="flex-1 min-h-0 overflow-y-auto slim-scroll pb-20 lg:pb-0">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200/80 px-2 pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-4">
            {mobileTabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cx(
                    'relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition',
                    isActive ? 'text-brix-700' : 'text-slate-400',
                  )
                }
              >
                <span className="relative">
                  {t.icon}
                  {t.badge != null && t.badge > 0 && (
                    <span className="absolute -top-1 -right-2 min-w-4 h-4 px-0.5 grid place-items-center rounded-full bg-rose-500 text-white text-[9px] font-bold">
                      {t.badge > 99 ? '99+' : t.badge}
                    </span>
                  )}
                </span>
                {t.label}
              </NavLink>
            ))}
            <button
              onClick={() => setMobileOpen(true)}
              className="flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold text-slate-400"
            >
              <MenuIcon />
              More
            </button>
          </div>
        </nav>
      </div>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts">
        <div className="space-y-2.5">
          {SHORTCUTS.map(([keys, desc]) => (
            <div key={keys} className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-600">{desc}</span>
              <kbd className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 font-mono text-xs font-bold text-slate-700 whitespace-nowrap">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-4">
          Tip: press <kbd className="font-mono font-bold">⌘K</kbd> anywhere to jump to any page or run an action.
        </p>
        <div className="flex justify-end mt-5">
          <Button onClick={() => setHelpOpen(false)}>Done</Button>
        </div>
      </Modal>
    </div>
  );
}
