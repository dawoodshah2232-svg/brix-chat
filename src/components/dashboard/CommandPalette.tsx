// Brix Chat — ⌘K command palette: fuzzy search across pages, actions, and
// conversations. Arrow keys navigate, Enter runs, Esc closes.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { cx } from '../../lib/utils';
import {
  ArrowLeftIcon,
  BoltIcon,
  BookIcon,
  BuildingIcon,
  ChartIcon,
  ChatIcon,
  CodeIcon,
  CogIcon,
  CommandIcon,
  ContactsIcon,
  GlobeIcon,
  HeartIcon,
  MegaphoneIcon,
  PaletteIcon,
  PlusIcon,
  StarIcon,
  TagIcon,
  TeamIcon,
  TerminalIcon,
  TicketIcon,
  TriggerIcon,
  UsersIcon,
} from './icons';
import type { ReactNode } from 'react';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  section: 'Actions';
  run: () => void;
  keywords?: string;
}

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  section: 'Pages' | 'Actions' | 'Conversations';
  run: () => void;
  hay: string;
}

const PAGES: Array<{ to: string; label: string; section: string; icon: ReactNode; keywords: string }> = [
  { to: '/app', label: 'Inbox', section: 'Engage', icon: <ChatIcon />, keywords: 'inbox chats conversations messages' },
  { to: '/app/visitors', label: 'Live visitors', section: 'Engage', icon: <UsersIcon />, keywords: 'visitors live online traffic' },
  { to: '/app/campaigns', label: 'Campaigns', section: 'Engage', icon: <MegaphoneIcon />, keywords: 'campaigns broadcast messages ab test' },
  { to: '/app/tickets', label: 'Tickets', section: 'Support', icon: <TicketIcon />, keywords: 'tickets support helpdesk sla' },
  { to: '/app/knowledge', label: 'Knowledge base', section: 'Support', icon: <BookIcon />, keywords: 'knowledge base articles help docs' },
  { to: '/app/canned', label: 'Canned responses', section: 'Support', icon: <BoltIcon />, keywords: 'canned responses shortcuts replies macros' },
  { to: '/app/analytics', label: 'Analytics', section: 'Grow', icon: <ChartIcon />, keywords: 'analytics reports stats metrics csat' },
  { to: '/app/ratings', label: 'Ratings', section: 'Grow', icon: <HeartIcon />, keywords: 'ratings csat nps scores reviews feedback' },
  { to: '/app/feedback', label: 'Feedback', section: 'Grow', icon: <StarIcon />, keywords: 'feedback csat nps ces ratings reviews' },
  { to: '/app/contacts', label: 'Contacts', section: 'Grow', icon: <ContactsIcon />, keywords: 'contacts crm customers' },
  { to: '/app/quality', label: 'Quality scorecards', section: 'Grow', icon: <StarIcon />, keywords: 'quality scorecards qa rubric agents' },
  { to: '/app/triggers', label: 'Triggers', section: 'Automate', icon: <TriggerIcon />, keywords: 'triggers automation workflows rules proactive' },
  { to: '/app/properties', label: 'Properties', section: 'Workspace', icon: <GlobeIcon />, keywords: 'properties websites domains public key' },
  { to: '/app/branding', label: 'Branding', section: 'Workspace', icon: <PaletteIcon />, keywords: 'branding logo colors theme widget appearance' },
  { to: '/app/install', label: 'Install', section: 'Workspace', icon: <CodeIcon />, keywords: 'install embed snippet widget javascript api' },
  { to: '/app/team', label: 'Team', section: 'Workspace', icon: <TeamIcon />, keywords: 'team members agents roles invite passcode' },
  { to: '/app/departments', label: 'Departments', section: 'Workspace', icon: <BuildingIcon />, keywords: 'departments routing sales support agents' },
  { to: '/app/categories', label: 'Categories', section: 'Workspace', icon: <TagIcon />, keywords: 'categories knowledge canned tickets organize' },
  { to: '/app/developers', label: 'Developers', section: 'Workspace', icon: <TerminalIcon />, keywords: 'developers api keys webhooks integrations' },
  { to: '/app/settings', label: 'Settings', section: 'Workspace', icon: <CogIcon />, keywords: 'settings preferences configuration' },
];

/** Fuzzy subsequence scorer — rewards prefix, word-boundary and contiguous matches. */
export function fuzzyScore(query: string, hay: string): number {
  const q = query.toLowerCase().trim();
  const h = hay.toLowerCase();
  if (!q) return 0;
  if (h === q) return 1000;
  if (h.startsWith(q)) return 500 + q.length * 4;
  let score = 0;
  let hi = 0;
  let run = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    const found = h.indexOf(ch, hi);
    if (found === -1) return 0;
    if (found === 0 || h[found - 1] === ' ' || h[found - 1] === '/') score += 24;
    if (found === hi) {
      run += 1;
      score += 6 + run * 2;
    } else {
      run = 0;
      score += 2;
    }
    hi = found + 1;
  }
  return score;
}

export function CommandPalette({
  open,
  onClose,
  onHelp,
}: {
  open: boolean;
  onClose: () => void;
  onHelp: () => void;
}) {
  const { session, searchAll, setStatus, logout } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const actions: PaletteAction[] = useMemo(
    () => [
      {
        id: 'act-chat',
        label: 'Start proactive chat',
        hint: 'Pick a visitor to message',
        icon: <ChatIcon />,
        section: 'Actions',
        keywords: 'new conversation proactive chat message visitor start',
        run: () => navigate('/app/visitors'),
      },
      {
        id: 'act-ticket',
        label: 'New ticket',
        icon: <PlusIcon />,
        section: 'Actions',
        keywords: 'new ticket create support',
        run: () => navigate('/app/tickets?new=1'),
      },
      {
        id: 'act-campaign',
        label: 'New campaign',
        icon: <PlusIcon />,
        section: 'Actions',
        keywords: 'new campaign create broadcast ab',
        run: () => navigate('/app/campaigns?new=1'),
      },
      {
        id: 'act-kb',
        label: 'New knowledge article',
        icon: <PlusIcon />,
        section: 'Actions',
        keywords: 'new article knowledge base help doc write',
        run: () => navigate('/app/knowledge?new=1'),
      },
      {
        id: 'act-canned',
        label: 'New canned response',
        icon: <PlusIcon />,
        section: 'Actions',
        keywords: 'new canned response shortcut macro',
        run: () => navigate('/app/canned?new=1'),
      },
      {
        id: 'act-trigger',
        label: 'New trigger rule',
        icon: <PlusIcon />,
        section: 'Actions',
        keywords: 'new trigger rule automation workflow',
        run: () => navigate('/app/triggers?new=1'),
      },
      {
        id: 'act-contact',
        label: 'Add contact',
        icon: <PlusIcon />,
        section: 'Actions',
        keywords: 'new contact add crm',
        run: () => navigate('/app/contacts?new=1'),
      },
      {
        id: 'act-online',
        label: 'Go online',
        icon: <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />,
        section: 'Actions',
        keywords: 'status online available presence',
        run: () => setStatus('online'),
      },
      {
        id: 'act-away',
        label: 'Go away',
        icon: <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />,
        section: 'Actions',
        keywords: 'status away busy presence',
        run: () => setStatus('away'),
      },
      {
        id: 'act-offline',
        label: 'Go offline',
        icon: <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />,
        section: 'Actions',
        keywords: 'status offline invisible presence',
        run: () => setStatus('offline'),
      },
      {
        id: 'act-help',
        label: 'Keyboard shortcuts',
        hint: '?',
        icon: <CommandIcon />,
        section: 'Actions',
        keywords: 'keyboard shortcuts help keys',
        run: () => onHelp(),
      },
      {
        id: 'act-logout',
        label: 'Log out',
        icon: <ArrowLeftIcon />,
        section: 'Actions',
        keywords: 'log out sign out exit',
        run: () => logout(),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.workspaceId, session?.viewingWorkspaceId],
  );

  const items = useMemo<PaletteItem[]>(() => {
    const all: PaletteItem[] = [
      ...PAGES.map((p) => ({
        id: `page-${p.to}`,
        label: p.label,
        hint: p.section,
        icon: p.icon,
        section: 'Pages' as const,
        run: () => navigate(p.to),
        hay: `${p.label} ${p.keywords}`,
      })),
      ...actions.map((a) => ({
        id: a.id,
        label: a.label,
        hint: a.hint,
        icon: a.icon,
        section: a.section,
        run: a.run,
        hay: `${a.label} ${a.keywords ?? ''}`,
      })),
    ];
    const trimmed = q.trim();
    if (trimmed) {
      const convs = searchAll(trimmed)
        .conversations.slice(0, 5)
        .map((c) => ({
          id: `conv-${c.id}`,
          label: c.visitor,
          hint: c.status,
          icon: <ChatIcon />,
          section: 'Conversations' as const,
          run: () => navigate(`/app?c=${c.id}`),
          hay: `${c.visitor} ${c.messages.map((m) => m.text).join(' ').slice(0, 300)}`,
        }));
      all.push(...convs);
      return all
        .map((i) => ({ i, s: fuzzyScore(trimmed, i.hay) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 12)
        .map((x) => x.i);
    }
    return [
      ...all.filter((i) => i.section === 'Actions').slice(0, 5),
      ...all.filter((i) => i.section === 'Pages'),
    ];
  }, [q, actions, navigate, searchAll]);

  useEffect(() => {
    if (open) {
      setQ('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open ]);

  useEffect(() => {
    setCursor(0);
  }, [items.length]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(items.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[cursor];
      if (item) {
        onClose();
        item.run();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  let lastSection = '';
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-[14vh] px-4">
      <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-up">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          <CommandIcon className="w-5 h-5 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Type a page, action, or visitor name…"
            className="flex-1 text-[15px] outline-none placeholder:text-slate-400 text-slate-900"
          />
          <kbd className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 font-mono text-[11px] font-bold text-slate-500">
            esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto slim-scroll p-2">
          {items.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              No matches for “{q.trim()}”. Try a page name or action.
            </div>
          )}
          {items.map((item, idx) => {
            const head =
              item.section !== lastSection ? (
                <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  {item.section}
                </div>
              ) : null;
            lastSection = item.section;
            return (
              <div key={item.id}>
                {head}
                <button
                  data-idx={idx}
                  onClick={() => {
                    onClose();
                    item.run();
                  }}
                  onMouseEnter={() => setCursor(idx)}
                  className={cx(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition',
                    cursor === idx ? 'bg-brix-50' : 'hover:bg-slate-50',
                  )}
                >
                  <span
                    className={cx(
                      'w-8 h-8 grid place-items-center rounded-lg shrink-0',
                      cursor === idx ? 'bg-brix-100 text-brix-700' : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900 truncate">{item.label}</span>
                    {item.hint && <span className="block text-xs text-slate-400 truncate">{item.hint}</span>}
                  </span>
                  {cursor === idx && <span className="text-xs text-slate-300 font-mono">⏎</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 flex items-center gap-4 text-[11px] text-slate-400">
          <span>
            <kbd className="font-mono font-bold">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="font-mono font-bold">⏎</kbd> open
          </span>
          <span className="ml-auto">{items.length} result{items.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}
