// Brix Chat — dashboard topbar: breadcrumbs, global search, command-palette
// trigger, notification center, presence status + agent profile menu.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { getApi } from '../../lib/api';
import type { ApiNotification } from '../../lib/api';
import { Avatar, Badge, Button, Input, Label, SearchInput } from '../ui';
import { cx, timeAgo } from '../../lib/utils';
import { BellIcon, ChevronDownIcon, CommandIcon, MenuIcon } from './icons';

export const CRUMBS: Record<string, { section: string; label: string }> = {
  '/app': { section: 'Engage', label: 'Inbox' },
  '/app/visitors': { section: 'Engage', label: 'Live visitors' },
  '/app/campaigns': { section: 'Engage', label: 'Campaigns' },
  '/app/tickets': { section: 'Support', label: 'Tickets' },
  '/app/knowledge': { section: 'Support', label: 'Knowledge base' },
  '/app/canned': { section: 'Support', label: 'Canned responses' },
  '/app/analytics': { section: 'Grow', label: 'Analytics' },
  '/app/ratings': { section: 'Grow', label: 'Ratings' },
  '/app/feedback': { section: 'Grow', label: 'Feedback' },
  '/app/contacts': { section: 'Grow', label: 'Contacts' },
  '/app/triggers': { section: 'Automate', label: 'Triggers' },
  '/app/properties': { section: 'Workspace', label: 'Properties' },
  '/app/branding': { section: 'Workspace', label: 'Branding' },
  '/app/install': { section: 'Workspace', label: 'Install' },
  '/app/team': { section: 'Workspace', label: 'Team' },
  '/app/departments': { section: 'Workspace', label: 'Departments' },
  '/app/categories': { section: 'Workspace', label: 'Categories' },
  '/app/developers': { section: 'Workspace', label: 'Developers' },
  '/app/settings': { section: 'Workspace', label: 'Settings' },
};

function Breadcrumbs() {
  const location = useLocation();
  const crumb = CRUMBS[location.pathname];
  if (!crumb) return null;
  return (
    <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-2 text-sm min-w-0">
      <span className="text-slate-400 font-medium">{crumb.section}</span>
      <span className="text-slate-300">/</span>
      <span className="font-bold text-slate-900 truncate">{crumb.label}</span>
    </nav>
  );
}

const STATUS_DOT: Record<string, string> = {
  online: 'bg-emerald-500',
  away: 'bg-amber-500',
  offline: 'bg-slate-400',
};

function isoAgo(iso: string | null): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 'never' : timeAgo(t);
}

function AgentMenu() {
  const { session, logout, currentMember, updateProfile, setStatus, changePasscode, effectiveWorkspaceId: effWs } = useStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#4f46e5');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwOk, setPwOk] = useState(false);

  const member = currentMember;
  const status = (member?.status ?? 'online') as 'online' | 'away' | 'offline';

  const startEdit = () => {
    setName(member?.display_name ?? session?.displayName ?? '');
    setColor(member?.color ?? '#4f46e5');
    setEditing(true);
  };

  const saveProfile = async () => {
    if (!name.trim()) return;
    const res = await updateProfile({ displayName: name.trim(), color });
    if (res.ok) setEditing(false);
  };

  const savePasscode = async () => {
    setPwError('');
    setPwOk(false);
    if (!session) return;
    try {
      await getApi(effWs(), session.displayName).members.login(
        member?.display_name ?? session.displayName,
        currentPw,
      );
    } catch {
      setPwError('Current passcode is wrong.');
      return;
    }
    const res = await changePasscode(newPw);
    if (res.ok) {
      setPwOk(true);
      setCurrentPw('');
      setNewPw('');
      setTimeout(() => setPwOpen(false), 900);
    } else setPwError(res.error ?? 'Could not change passcode.');
  };

  const close = () => {
    setOpen(false);
    setEditing(false);
    setPwOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 p-1.5 pr-2 rounded-xl hover:bg-slate-100 transition"
        aria-label="Account menu"
        aria-expanded={open}
      >
        <span className="relative shrink-0">
          <Avatar name={member?.display_name ?? session?.displayName ?? 'Agent'} color={member?.color} />
          <span
            className={cx(
              'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white',
              STATUS_DOT[status],
            )}
          />
        </span>
        <ChevronDownIcon className="w-4 h-4 text-slate-400 hidden sm:block" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 text-slate-900 overflow-hidden animate-fade-up">
            <div className="flex items-center gap-3 p-4 pb-3 border-b border-slate-100">
              <Avatar name={member?.display_name ?? 'Agent'} color={member?.color} size="lg" />
              <div className="min-w-0">
                <div className="font-bold text-slate-900 truncate">{member?.display_name ?? session?.displayName}</div>
                <div className="text-xs text-slate-500 capitalize">
                  {session?.role} · last login {isoAgo(member?.last_login ?? null)}
                </div>
              </div>
            </div>

            <div className="p-4 py-3 border-b border-slate-100">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Presence</div>
              <div className="flex gap-1.5">
                {(['online', 'away', 'offline'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={cx(
                      'flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold capitalize border transition flex items-center justify-center gap-1.5',
                      status === s
                        ? 'bg-ink-950 text-white border-ink-950'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                    )}
                  >
                    <span className={cx('w-2 h-2 rounded-full', STATUS_DOT[s])} />
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {editing ? (
              <div className="p-4 space-y-3 border-b border-slate-100">
                <div>
                  <Label>Display name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label>Avatar color</Label>
                  <div className="flex items-center gap-2">
                    {['#4f46e5', '#0891b2', '#059669', '#f59e0b', '#8b5cf6', '#ef4444'].map((c) => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        aria-label={c}
                        className={cx(
                          'w-7 h-7 rounded-full border-2 transition',
                          color === c ? 'border-ink-950 scale-110' : 'border-transparent',
                        )}
                        style={{ background: c }}
                      />
                    ))}
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-7 h-7 rounded-full cursor-pointer border border-slate-200 p-0.5"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveProfile}>
                    Save
                  </Button>
                </div>
              </div>
            ) : pwOpen ? (
              <div className="p-4 space-y-3 border-b border-slate-100">
                <div>
                  <Label>Current passcode</Label>
                  <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
                </div>
                <div>
                  <Label>New passcode (min 4)</Label>
                  <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} minLength={4} />
                </div>
                {pwError && <p className="text-xs font-medium text-rose-600">{pwError}</p>}
                {pwOk && <p className="text-xs font-medium text-emerald-600">✓ Passcode changed</p>}
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setPwOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={savePasscode} disabled={newPw.length < 4}>
                    Change
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-2 border-b border-slate-100">
                <button
                  onClick={startEdit}
                  className="w-full text-left px-3 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Edit profile
                </button>
                <button
                  onClick={() => setPwOpen(true)}
                  className="w-full text-left px-3 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Change passcode
                </button>
                <Link
                  to="/app/settings"
                  onClick={close}
                  className="block w-full text-left px-3 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Preferences
                </Link>
              </div>
            )}

            <div className="p-2">
              <button
                onClick={logout}
                className="w-full px-3 py-2 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50 text-left"
              >
                Log out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    o.start();
    o.stop(ctx.currentTime + 0.15);
    setTimeout(() => ctx.close(), 300);
  } catch {
    /* audio unavailable */
  }
}

function NotificationBell() {
  const { session, data, effectiveWorkspaceId: effWs } = useStore();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const prevUnread = useRef(0);
  const seenIds = useRef<Set<string>>(new Set());
  const navigate = useNavigate();

  const prefs = data.settings.notifyPrefs;
  const soundOn = prefs?.sound ?? data.settings.notifySound;
  const bellOn = prefs?.desktopBell ?? false;

  const desktopNotify = (n: ApiNotification) => {
    try {
      if (!bellOn || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      if (prefs?.events && prefs.events[n.type] === false) return;
      const notif = new Notification(n.title, { body: n.body });
      notif.onclick = () => {
        window.focus();
        if (n.link) window.location.hash = `#${n.link}`;
        notif.close();
      };
    } catch {
      /* ignore */
    }
  };

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const api = getApi(effWs(), session.displayName);
      const { data: page } = await api.notifications.list({ limit: 30 });
      setItems(page.items);
      const u = page.items.filter((n) => !n.read).length;
      if (u > prevUnread.current && prevUnread.current >= 0) {
        page.items
          .filter((n) => !n.read && !seenIds.current.has(n.id))
          .forEach((n) => {
            if (prevUnread.current > 0) desktopNotify(n);
          });
        if (prevUnread.current > 0 && soundOn) beep();
      }
      page.items.forEach((n) => seenIds.current.add(n.id));
      prevUnread.current = u;
      setUnread(u);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, soundOn, bellOn, prefs]);

  useEffect(() => {
    refresh();
    const iv = window.setInterval(refresh, 30000);
    const onPing = () => refresh();
    window.addEventListener('brix:notify', onPing);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener('brix:notify', onPing);
    };
  }, [refresh]);

  const openBell = async () => {
    setOpen(true);
    if (!session) return;
    try {
      const api = getApi(effWs(), session.displayName);
      await api.notifications.markAllRead();
      setUnread(0);
      setItems((xs) => xs.map((n) => ({ ...n, read: true })));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => (open ? setOpen(false) : openBell())}
        className="relative w-9 h-9 grid place-items-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
        aria-label="Notifications"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[11px] font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden animate-fade-up">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="font-bold text-slate-900 text-sm">Notifications</span>
              <button
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600"
              >
                Close
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto slim-scroll">
              {items.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-400">
                  All caught up — no notifications.
                </div>
              )}
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (n.link) navigate(n.link);
                    setOpen(false);
                  }}
                  className={cx(
                    'w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition',
                    !n.read && 'bg-brix-50/50',
                  )}
                >
                  <div className="text-sm font-semibold text-slate-900">{n.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{isoAgo(n.created_at)}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Topbar({
  onMenu,
  onPalette,
  onHelp,
}: {
  onMenu: () => void;
  onPalette: () => void;
  onHelp: () => void;
}) {
  const { searchAll, effectiveWorkspaceId } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const results = q.trim() ? searchAll(q.trim()) : null;

  useEffect(() => {
    setQ('');
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const focus = () => searchWrapRef.current?.querySelector('input')?.focus();
    window.addEventListener('brix:focus-search', focus);
    return () => window.removeEventListener('brix:focus-search', focus);
  }, []);

  return (
    <header className="h-16 shrink-0 bg-white/90 backdrop-blur border-b border-slate-200/80 flex items-center gap-2 sm:gap-3 px-3 sm:px-6">
      <button
        className="lg:hidden w-9 h-9 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
        onClick={onMenu}
        aria-label="Open menu"
      >
        <MenuIcon />
      </button>

      <Breadcrumbs />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={onPalette}
          className="hidden md:flex items-center gap-2.5 pl-3 pr-1.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition text-sm text-slate-400 w-56"
          title="Command palette (⌘K)"
        >
          <CommandIcon className="w-4 h-4" />
          <span className="flex-1 text-left truncate">Jump to…</span>
          <kbd className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200 font-mono text-[11px] font-bold text-slate-500">
            ⌘K
          </kbd>
        </button>
        <div className="relative hidden sm:block" ref={searchWrapRef}>
          <SearchInput value={q} onChange={(v) => { setQ(v); setOpen(true); }} placeholder="Search ( / )" />
          {open && q.trim() && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
          {open && results && (
            <div
              className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto slim-scroll bg-white rounded-2xl border border-slate-200 shadow-2xl p-2 z-50 animate-fade-up"
              onClick={(e) => e.stopPropagation()}
            >
              {results.conversations.length === 0 && results.contacts.length === 0 ? (
                <div className="text-sm text-slate-500 px-3 py-4 text-center">No results for “{q.trim()}”</div>
              ) : (
                <>
                  {results.conversations.length > 0 && (
                    <div className="px-2 pt-1 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      Conversations
                    </div>
                  )}
                  {results.conversations.slice(0, 5).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { navigate(`/app?c=${c.id}`); setOpen(false); setQ(''); }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-slate-50 text-left"
                    >
                      <Avatar name={c.visitor} size="sm" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-800 truncate">{c.visitor}</span>
                        <span className="block text-xs text-slate-500 truncate">
                          {c.messages[c.messages.length - 1]?.text ?? ''}
                        </span>
                      </span>
                      <Badge tone={c.status === 'open' ? 'green' : 'slate'} className="ml-auto">
                        {c.status}
                      </Badge>
                    </button>
                  ))}
                  {results.contacts.length > 0 && (
                    <div className="px-2 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      Contacts
                    </div>
                  )}
                  {results.contacts.slice(0, 5).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { navigate('/app/contacts'); setOpen(false); setQ(''); }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-slate-50 text-left"
                    >
                      <Avatar name={c.name} size="sm" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-800 truncate">{c.name}</span>
                        <span className="block text-xs text-slate-500 truncate">{c.email}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onHelp}
          className="hidden md:grid w-9 h-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 text-sm font-bold"
          title="Keyboard shortcuts (?)"
        >
          ?
        </button>
        <NotificationBell />
        <span className="hidden xl:inline-flex text-xs font-semibold text-slate-500 bg-slate-100 rounded-lg px-2.5 py-1.5">
          {effectiveWorkspaceId()}
        </span>
        <div className="w-px h-6 bg-slate-200 hidden sm:block" />
        <AgentMenu />
      </div>
    </header>
  );
}
