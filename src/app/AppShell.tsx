import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Avatar, Badge, SearchInput } from '../components/ui';
import { cx } from '../lib/utils';

const NAV = [
  { to: '/app', label: 'Inbox', icon: '💬', end: true },
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

export default function AppShell() {
  const { session, logout, data, searchAll } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5">
            <Avatar name={session?.displayName ?? 'Agent'} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white truncate">{session?.displayName ?? 'Agent'}</div>
              <div className="text-[11px] text-slate-400 truncate capitalize">{session?.workspace ?? ''}</div>
            </div>
            <button
              onClick={logout}
              title="Log out"
              className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition"
            >
              ⎋
            </button>
          </div>
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
            <div className="relative hidden sm:block w-64">
              <SearchInput value={q} onChange={(v) => { setQ(v); setOpen(true); }} placeholder="Search chats & contacts…" />
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
    </div>
  );
}
