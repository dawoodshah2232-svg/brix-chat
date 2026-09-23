import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { getApi } from '../lib/api';
import type { ApiNotification } from '../lib/api';
import { Avatar, Badge, Button, Input, Label, Modal, SearchInput } from '../components/ui';
import { cx, timeAgo } from '../lib/utils';

const NAV = [
  { to: '/app', label: 'Inbox', icon: '💬', end: true },
  { to: '/app/tickets', label: 'Tickets', icon: '🎫' },
  { to: '/app/visitors', label: 'Visitors', icon: '🟢' },
  { to: '/app/contacts', label: 'Contacts', icon: '👥' },
  { to: '/app/analytics', label: 'Analytics', icon: '📊' },
  { to: '/app/knowledge', label: 'Knowledge base', icon: '📚' },
  { to: '/app/canned', label: 'Canned', icon: '⚡' },
  { to: '/app/triggers', label: 'Triggers', icon: '🎯' },
  { to: '/app/campaigns', label: 'Campaigns', icon: '📣' },
  { to: '/app/settings', label: 'Settings', icon: '⚙️' },
];

const TITLES: Record<string, string> = {
  '/app': 'Inbox',
  '/app/tickets': 'Tickets',
  '/app/visitors': 'Visitors',
  '/app/contacts': 'Contacts',
  '/app/analytics': 'Analytics',
  '/app/knowledge': 'Knowledge base',
  '/app/canned': 'Canned responses',
  '/app/triggers': 'Triggers',
  '/app/campaigns': 'Campaigns',
  '/app/settings': 'Settings',
  '/admin': 'Admin',
};

const STATUS_DOT: Record<string, string> = {
  online: 'bg-emerald-500',
  away: 'bg-amber-500',
  offline: 'bg-slate-400',
};

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brix-500 to-cyan-400 grid place-items-center text-white text-lg font-black shadow-lg shadow-brix-600/30">
        B
      </div>
      <div className="font-display font-extrabold text-white text-lg tracking-tight">
        Brix<span className="text-cyan-300">Chat</span>
      </div>
    </div>
  );
}

function isoAgo(iso: string | null): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 'never' : timeAgo(t);
}

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    o.start();
    o.stop(ctx.currentTime + 0.15);
    setTimeout(() => ctx.close(), 300);
  } catch { /* audio unavailable */ }
}

const SHORTCUTS: Array<[string, string]> = [
  ['J / K', 'Move to next / previous conversation'],
  ['R', 'Focus the reply box'],
  ['/', 'Jump to search'],
  ['?', 'Open this shortcuts help'],
  ['Esc', 'Close menus'],
];

function AgentMenu() {
  const { session, logout, currentMember, updateProfile, setStatus, changePasscode } = useStore();
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
    if (res.ok) { setEditing(false); }
  };

  const savePasscode = async () => {
    setPwError(''); setPwOk(false);
    if (!session) return;
    try {
      // Verify the current passcode before changing it.
      await getApi(session.workspace, session.displayName).members.login(member?.display_name ?? session.displayName, currentPw);
    } catch {
      setPwError('Current passcode is wrong.');
      return;
    }
    const res = await changePasscode(newPw);
    if (res.ok) {
      setPwOk(true); setCurrentPw(''); setNewPw('');
      setTimeout(() => setPwOpen(false), 900);
    } else setPwError(res.error ?? 'Could not change passcode.');
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition text-left"
      >
        <span className="relative shrink-0">
          <Avatar name={member?.display_name ?? session?.displayName ?? 'Agent'} color={member?.color} />
          <span className={cx('absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-ink-950', STATUS_DOT[status])} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate">{member?.display_name ?? session?.displayName ?? 'Agent'}</div>
          <div className="text-[11px] text-slate-400 truncate capitalize">{status} · {session?.role ?? ''}</div>
        </div>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setEditing(false); }} />
          <div className="absolute bottom-full mb-2 left-0 w-72 bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 z-50 text-slate-900">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <Avatar name={member?.display_name ?? 'Agent'} color={member?.color} size="lg" />
              <div className="min-w-0">
                <div className="font-bold text-slate-900 truncate">{member?.display_name ?? session?.displayName}</div>
                <div className="text-xs text-slate-500 capitalize">{session?.role} · 🕒 last login {isoAgo(member?.last_login ?? null)}</div>
              </div>
            </div>

            <div className="py-3 border-b border-slate-100">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Status</div>
              <div className="flex gap-1.5">
                {(['online', 'away', 'offline'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={cx(
                      'flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold capitalize border transition flex items-center justify-center gap-1.5',
                      status === s ? 'bg-ink-950 text-white border-ink-950' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                    )}
                  >
                    <span className={cx('w-2 h-2 rounded-full', STATUS_DOT[s])} />{s}
                  </button>
                ))}
              </div>
            </div>

            {editing ? (
              <div className="py-3 space-y-3 border-b border-slate-100">
                <div><Label>Display name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div>
                  <Label>Avatar color</Label>
                  <div className="flex items-center gap-2">
                    {['#4f46e5', '#0891b2', '#059669', '#f59e0b', '#8b5cf6', '#ef4444'].map((c) => (
                      <button key={c} onClick={() => setColor(c)} aria-label={c}
                        className={cx('w-7 h-7 rounded-full border-2 transition', color === c ? 'border-ink-950 scale-110' : 'border-transparent')}
                        style={{ background: c }} />
                    ))}
                    <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-7 h-7 rounded-full cursor-pointer border border-slate-200 p-0.5" />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button size="sm" onClick={saveProfile}>Save</Button>
                </div>
              </div>
            ) : pwOpen ? (
              <div className="py-3 space-y-3 border-b border-slate-100">
                <div><Label>Current passcode</Label><Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} /></div>
                <div><Label>New passcode (min 4)</Label><Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} minLength={4} /></div>
                {pwError && <p className="text-xs font-medium text-rose-600">{pwError}</p>}
                {pwOk && <p className="text-xs font-medium text-emerald-600">✓ Passcode changed</p>}
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setPwOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={savePasscode} disabled={newPw.length < 4}>Change</Button>
                </div>
              </div>
            ) : (
              <div className="py-2 border-b border-slate-100">
                <button onClick={startEdit} className="w-full text-left px-2 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">✏️ Edit profile</button>
                <button onClick={() => setPwOpen(true)} className="w-full text-left px-2 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">🔑 Change passcode</button>
              </div>
            )}

            <button
              onClick={logout}
              className="w-full mt-2 px-2 py-2 rounded-lg text-sm font-semibold text-rose-600 hover:bg-rose-50 text-left"
            >
              ⎋ Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function NotificationBell() {
  const { session, data } = useStore();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const prevUnread = useRef(0);
  const seenIds = useRef<Set<string>>(new Set());

  const prefs = data.settings.notifyPrefs;
  const soundOn = prefs?.sound ?? data.settings.notifySound;
  const bellOn = prefs?.desktopBell ?? false;

  const desktopNotify = (n: ApiNotification) => {
    try {
      if (!bellOn || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      if (prefs?.events && prefs.events[n.type] === false) return;
      const notif = new Notification(n.title, { body: n.body });
      notif.onclick = () => { window.focus(); if (n.link) window.location.hash = `#${n.link}`; notif.close(); };
    } catch { /* ignore */ }
  };

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const api = getApi(session.workspace, session.displayName);
      const { data: page } = await api.notifications.list({ limit: 30 });
      setItems(page.items);
      const u = page.items.filter((n) => !n.read).length;
      if (u > prevUnread.current && prevUnread.current >= 0) {
        // New arrivals since last poll.
        page.items.filter((n) => !n.read && !seenIds.current.has(n.id)).forEach((n) => {
          if (prevUnread.current > 0) desktopNotify(n);
        });
        if (prevUnread.current > 0 && soundOn) beep();
      }
      page.items.forEach((n) => seenIds.current.add(n.id));
      prevUnread.current = u;
      setUnread(u);
    } catch { /* ignore */ }
  }, [session, soundOn, bellOn, prefs]);

  useEffect(() => {
    refresh();
    const iv = window.setInterval(refresh, 30000);
    const onPing = () => refresh();
    window.addEventListener('brix:notify', onPing);
    return () => { window.clearInterval(iv); window.removeEventListener('brix:notify', onPing); };
  }, [refresh]);

  const openBell = async () => {
    setOpen(true);
    if (!session) return;
    try {
      const api = getApi(session.workspace, session.displayName);
      await api.notifications.markAllRead();
      setUnread(0);
      setItems((xs) => xs.map((n) => ({ ...n, read: true })));
    } catch { /* ignore */ }
  };

  const navigate = useNavigate();

  return (
    <div className="relative">
      <button
        onClick={() => (open ? setOpen(false) : openBell())}
        className="relative w-9 h-9 grid place-items-center rounded-xl text-slate-500 hover:bg-slate-100 transition"
        aria-label="Notifications"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[11px] font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="font-bold text-slate-900 text-sm">Notifications</span>
              <button onClick={() => setOpen(false)} className="text-xs font-semibold text-slate-400 hover:text-slate-600">Close</button>
            </div>
            <div className="max-h-96 overflow-y-auto slim-scroll">
              {items.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-400">All caught up — no notifications.</div>
              )}
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { if (n.link) navigate(n.link); setOpen(false); }}
                  className={cx('w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition', !n.read && 'bg-brix-50/50')}
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

export default function AppShell() {
  const { session, logout, data, searchAll } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const results = q.trim() ? searchAll(q.trim()) : null;
  const unread = data.conversations.reduce((n, c) => n + (c.status === 'open' ? c.unread : 0), 0);
  const title = TITLES[location.pathname] ?? 'Brix Chat';
  const canAdmin = session?.role === 'admin' || session?.role === 'developer';
  const nav = canAdmin ? [...NAV, { to: '/admin', label: 'Admin', icon: '🛡️' }] : NAV;

  useEffect(() => {
    setMobileOpen(false);
    setQ('');
    setOpen(false);
  }, [location.pathname]);

  // Global keyboard shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === 'Escape') { setHelpOpen(false); setOpen(false); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') { e.preventDefault(); setHelpOpen(true); }
      else if (e.key === '/') { e.preventDefault(); window.dispatchEvent(new CustomEvent('brix:focus-search')); }
      else if (e.key === 'j') window.dispatchEvent(new CustomEvent('brix:inbox-move', { detail: 1 }));
      else if (e.key === 'k') window.dispatchEvent(new CustomEvent('brix:inbox-move', { detail: -1 }));
      else if (e.key === 'r') window.dispatchEvent(new CustomEvent('brix:focus-reply'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const focus = () => searchWrapRef.current?.querySelector('input')?.focus();
    window.addEventListener('brix:focus-search', focus);
    return () => window.removeEventListener('brix:focus-search', focus);
  }, []);

  const navList = (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto slim-scroll">
      {nav.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          className={({ isActive }) =>
            cx(
              'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition',
              isActive ? 'bg-brix-600 text-white shadow-lg shadow-brix-600/30' : 'text-slate-300 hover:bg-white/5 hover:text-white',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span className="text-base w-6 text-center">{n.icon}</span>
              {n.label}
              {n.to === '/app' && unread > 0 && (
                <span
                  className={cx(
                    'ml-auto min-w-6 h-6 px-1.5 grid place-items-center rounded-full text-[11px] font-bold',
                    isActive ? 'bg-white text-brix-700' : 'bg-rose-500 text-white',
                  )}
                >
                  {unread}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="h-screen flex bg-slate-50 text-slate-900 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 bg-ink-950 flex-col">
        <div className="py-5"><Logo /></div>
        {navList}
        <div className="p-4 border-t border-white/10">
          <AgentMenu />
        </div>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-ink-950 flex flex-col animate-fade-up">
            <div className="py-5"><Logo /></div>
            {navList}
            <div className="p-4 border-t border-white/10">
              <button
                onClick={logout}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-300 bg-white/5 hover:bg-white/10 text-left"
              >
                ⎋ Log out ({session?.displayName ?? 'Agent'})
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 shrink-0 bg-white border-b border-slate-200/80 flex items-center gap-3 px-4 sm:px-6">
          <button
            className="lg:hidden w-9 h-9 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <h1 className="font-display font-bold text-lg text-slate-900">{title}</h1>
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell />
            <div className="relative hidden sm:block w-64" ref={searchWrapRef}>
              <SearchInput value={q} onChange={(v) => { setQ(v); setOpen(true); }} placeholder="Search chats & contacts… ( / )" />
              {open && q.trim() && (
                <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              )}
              {open && results && (
                <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto slim-scroll bg-white rounded-2xl border border-slate-200 shadow-2xl p-2 z-50" onClick={(e) => e.stopPropagation()}>
                  {results.conversations.length === 0 && results.contacts.length === 0 ? (
                    <div className="text-sm text-slate-500 px-3 py-4 text-center">No results for “{q.trim()}”</div>
                  ) : (
                    <>
                      {results.conversations.length > 0 && (
                        <div className="px-2 pt-1 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Conversations</div>
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
                            <span className="block text-xs text-slate-500 truncate">{c.messages[c.messages.length - 1]?.text ?? ''}</span>
                          </span>
                          <Badge tone={c.status === 'open' ? 'green' : 'slate'} className="ml-auto">{c.status}</Badge>
                        </button>
                      ))}
                      {results.contacts.length > 0 && (
                        <div className="px-2 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Contacts</div>
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
              onClick={() => setHelpOpen(true)}
              className="hidden md:grid w-9 h-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 text-sm font-bold"
              title="Keyboard shortcuts (?)"
            >
              ?
            </button>
            <span className="hidden md:inline-flex text-xs font-semibold text-slate-500 bg-slate-100 rounded-lg px-2.5 py-1.5 capitalize">
              🏢 {session?.workspace ?? ''}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 min-h-0 overflow-hidden" onClick={() => setOpen(false)} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
          <Outlet />
        </main>
      </div>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts">
        <div className="space-y-2.5">
          {SHORTCUTS.map(([keys, desc]) => (
            <div key={keys} className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-600">{desc}</span>
              <kbd className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 font-mono text-xs font-bold text-slate-700 whitespace-nowrap">{keys}</kbd>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-5">
          <Button onClick={() => setHelpOpen(false)}>Done</Button>
        </div>
      </Modal>
    </div>
  );
}
