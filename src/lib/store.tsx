// Brix Chat — demo store. React context + localStorage persistence.
// Demo mode: everything is client-side. A backend would replace the
// persistence layer without changing the component API.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  Article,
  Campaign,
  Canned,
  ChatData,
  ChatMessage,
  Contact,
  Conversation,
  MemberRole,
  Settings,
  TriggerRule,
  Visitor,
  Workspace,
} from './types';
import { getApi, ApiError } from './api';
import type { ApiMember } from './api';
import { seedData, seedWorkspaces } from './seed';
import { uid } from './utils';

const LS_KEY = 'brixchat_v1';
const SESSION_LS = 'brixchat_session_v1';
const ALIVE_SS = 'brixchat_session_alive';

export interface Session {
  workspace: string;
  memberId: string;
  displayName: string;
  role: MemberRole;
  rememberMe: boolean;
  loggedInAt: number;
}

interface Persisted {
  workspaces: Record<string, Workspace>;
  session: Session | null;
  data: ChatData;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_LS);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s || !s.workspace) return null;
    const alive = sessionStorage.getItem(ALIVE_SS);
    if (!alive && s.rememberMe === false) {
      // New browser session and the user did not ask to be remembered.
      localStorage.removeItem(SESSION_LS);
      return null;
    }
    sessionStorage.setItem(ALIVE_SS, '1');
    return s;
  } catch {
    return null;
  }
}

function load(): Persisted {
  let workspaces: Record<string, Workspace> | null = null;
  let data: ChatData | null = null;
  let legacySession: { workspace: string; displayName: string; role: MemberRole } | null = null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { workspaces?: Record<string, Workspace>; data?: ChatData; session?: unknown };
      if (p.workspaces && p.data) {
        workspaces = p.workspaces;
        data = p.data;
      }
      // Migrate pre-phase-2 sessions (old shape: { workspace, displayName, role }).
      if (p.session && typeof p.session === 'object' && 'workspace' in p.session && !('memberId' in p.session)) {
        const s = p.session as { workspace: string; displayName: string; role: MemberRole };
        legacySession = { workspace: s.workspace, displayName: s.displayName, role: s.role };
      }
    }
  } catch {
    /* corrupted — reseed */
  }
  const session = loadSession() ?? (legacySession
    ? { workspace: legacySession.workspace, memberId: '', displayName: legacySession.displayName, role: legacySession.role, rememberMe: true, loggedInAt: Date.now() }
    : null);
  return { workspaces: workspaces ?? seedWorkspaces(), session, data: data ?? seedData() };
}

export type AuthResult = { ok: boolean; error?: string; role?: MemberRole };

interface Store {
  session: Session | null;
  data: ChatData;
  knownWorkspaces: string[];
  currentMember: ApiMember | null;

  // auth (passcode-based, members live in the local API db)
  signup: (workspace: string, displayName: string, passcode: string, opts?: { rememberMe?: boolean }) => Promise<AuthResult>;
  login: (workspace: string, passcode: string, opts?: { displayName?: string; rememberMe?: boolean }) => Promise<AuthResult>;
  logout: () => void;
  resetDemo: () => void;
  updateProfile: (patch: { displayName?: string; color?: string }) => Promise<AuthResult>;
  setStatus: (status: ApiMember['status']) => void;
  changePasscode: (newPasscode: string) => Promise<AuthResult>;

  // conversations
  getConversation: (id: string) => Conversation | undefined;
  addMessage: (convId: string, msg: Omit<ChatMessage, 'id' | 'ts'> & { ts?: number }) => void;
  updateConversation: (convId: string, patch: Partial<Conversation>) => void;
  markRead: (convId: string) => void;
  addNote: (convId: string, text: string) => void;
  toggleTag: (convId: string, tag: string) => void;
  resolveConversation: (convId: string) => void;
  newProactiveChat: (visitorId: string, opener: string) => string;

  // visitors
  getVisitor: (id: string) => Visitor | undefined;

  // contacts / articles / canned / triggers / campaigns
  saveContact: (c: Contact) => void;
  deleteContact: (id: string) => void;
  saveArticle: (a: Article) => void;
  deleteArticle: (id: string) => void;
  saveCanned: (c: Canned) => void;
  deleteCanned: (id: string) => void;
  trackCannedUsage: (id: string) => void;
  saveTrigger: (t: TriggerRule) => void;
  deleteTrigger: (id: string) => void;
  toggleTrigger: (id: string) => void;
  saveCampaign: (c: Campaign) => void;
  deleteCampaign: (id: string) => void;

  // settings
  updateSettings: (patch: Partial<Settings>) => void;

  // search
  searchAll: (q: string) => { conversations: Conversation[]; contacts: Contact[] };
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [persisted, setPersisted] = useState<Persisted>(load);
  const [currentMember, setCurrentMember] = useState<ApiMember | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ workspaces: persisted.workspaces, data: persisted.data }));
    } catch {
      /* storage full — ignore in demo */
    }
    try {
      if (persisted.session) {
        localStorage.setItem(SESSION_LS, JSON.stringify(persisted.session));
        sessionStorage.setItem(ALIVE_SS, '1');
      } else {
        localStorage.removeItem(SESSION_LS);
        sessionStorage.removeItem(ALIVE_SS);
      }
    } catch {
      /* storage unavailable */
    }
  }, [persisted]);

  const patchData = useCallback((fn: (d: ChatData) => ChatData) => {
    setPersisted((p) => ({ ...p, data: fn(p.data) }));
  }, []);

  // Keep the signed-in member record fresh for the agent menu.
  useEffect(() => {
    const s = persisted.session;
    if (!s) { setCurrentMember(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const api = getApi(s.workspace, s.displayName);
        if (s.memberId) {
          const { data: m } = await api.members.get(s.memberId);
          if (!cancelled) setCurrentMember(m);
        } else {
          const { data: all } = await api.members.list();
          const m = all.find((x) => x.display_name.toLowerCase() === s.displayName.toLowerCase()) ?? null;
          if (!cancelled) {
            setCurrentMember(m);
            if (m) setPersisted((p) => (p.session ? { ...p, session: { ...p.session!, memberId: m.id, role: m.role } } : p));
          }
        }
      } catch {
        if (!cancelled) setCurrentMember(null);
      }
    })();
    return () => { cancelled = true; };
  }, [persisted.session?.workspace, persisted.session?.memberId]);

  const store = useMemo<Store>(() => {
    const norm = (s: string) => s.trim().toLowerCase();

    const authError = (e: unknown): string =>
      e instanceof ApiError ? e.message : 'Something went wrong.';

    const signup: Store['signup'] = async (workspace, displayName, passcode, opts) => {
      const w = norm(workspace);
      if (!w) return { ok: false, error: 'Workspace name is required.' };
      if (!displayName.trim()) return { ok: false, error: 'Display name is required.' };
      if (passcode.length < 4) return { ok: false, error: 'Passcode must be at least 4 characters.' };
      const api = getApi(w, displayName.trim());
      try {
        const existing = await api.members.list().catch(() => ({ data: [] as ApiMember[] }));
        if (existing.data.some((m) => m.display_name.toLowerCase() === displayName.trim().toLowerCase())) {
          return { ok: false, error: 'That name is taken in this workspace — try logging in.' };
        }
        const { data: member } = await api.members.create(displayName.trim(), 'admin', passcode);
        // Fresh workspace: drop the demo seed members so the owner starts clean.
        const { data: all } = await api.members.list();
        for (const m of all) {
          if (m.id !== member.id && ['3456', '1111', '2222'].includes(m.passcode)) {
            try { await api.members.remove(m.id); } catch { /* keep going */ }
          }
        }
        await api.members.touchLogin(member.id);
        const session: Session = {
          workspace: w, memberId: member.id, displayName: member.display_name,
          role: member.role, rememberMe: opts?.rememberMe ?? true, loggedInAt: Date.now(),
        };
        setPersisted((p) => ({
          ...p,
          workspaces: { ...p.workspaces, [w]: { name: w, displayName: member.display_name, passcode: '', role: member.role, createdAt: Date.now() } },
          session,
        }));
        setCurrentMember(member);
        return { ok: true, role: member.role };
      } catch (e) {
        return { ok: false, error: authError(e) };
      }
    };

    const login: Store['login'] = async (workspace, passcode, opts) => {
      const w = norm(workspace);
      if (!w) return { ok: false, error: 'Workspace name is required.' };
      if (!passcode) return { ok: false, error: 'Passcode is required.' };
      const api = getApi(w, opts?.displayName?.trim() || 'agent');
      try {
        const { data: member } = await api.members.login(opts?.displayName ?? '', passcode);
        await api.members.touchLogin(member.id);
        const session: Session = {
          workspace: w, memberId: member.id, displayName: member.display_name,
          role: member.role, rememberMe: opts?.rememberMe ?? false, loggedInAt: Date.now(),
        };
        setPersisted((p) => ({
          ...p,
          workspaces: { ...p.workspaces, [w]: { name: w, displayName: member.display_name, passcode: '', role: member.role, createdAt: Date.now() } },
          session,
        }));
        setCurrentMember(member);
        return { ok: true, role: member.role };
      } catch (e) {
        return { ok: false, error: authError(e) };
      }
    };

    const logout = () => {
      setPersisted((p) => ({ ...p, session: null }));
      setCurrentMember(null);
    };

    const updateProfile: Store['updateProfile'] = async (patch) => {
      const s = persisted.session;
      if (!s?.memberId) return { ok: false, error: 'Not signed in.' };
      try {
        const api = getApi(s.workspace, s.displayName);
        const { data: m } = await api.members.update(s.memberId, patch);
        setCurrentMember(m);
        setPersisted((p) => (p.session ? { ...p, session: { ...p.session!, displayName: m.display_name } } : p));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: authError(e) };
      }
    };

    const setStatus: Store['setStatus'] = (status) => {
      const s = persisted.session;
      if (!s?.memberId) return;
      const api = getApi(s.workspace, s.displayName);
      api.members.setStatus(s.memberId, status).then(({ data: m }) => setCurrentMember(m)).catch(() => {});
    };

    const changePasscode: Store['changePasscode'] = async (newPasscode) => {
      const s = persisted.session;
      if (!s?.memberId) return { ok: false, error: 'Not signed in.' };
      try {
        const api = getApi(s.workspace, s.displayName);
        await api.members.setPasscode(s.memberId, newPasscode);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: authError(e) };
      }
    };

    const resetDemo = () => {
      const keep = load();
      setPersisted({ workspaces: keep.workspaces, session: keep.session, data: seedData() });
    };

    const getConversation = (id: string) => persisted.data.conversations.find((c) => c.id === id);
    const getVisitor = (id: string) => persisted.data.visitors.find((v) => v.id === id);

    const addMessage: Store['addMessage'] = (convId, msg) => {
      patchData((d) => ({
        ...d,
        conversations: d.conversations.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: [...c.messages, { ...msg, id: uid('m'), ts: msg.ts ?? Date.now() } as ChatMessage],
                updatedAt: Date.now(),
                unread: msg.from === 'visitor' ? c.unread + 1 : c.unread,
              }
            : c,
        ),
      }));
    };

    const updateConversation: Store['updateConversation'] = (convId, patch) => {
      patchData((d) => ({
        ...d,
        conversations: d.conversations.map((c) => (c.id === convId ? { ...c, ...patch, updatedAt: Date.now() } : c)),
      }));
    };

    const markRead: Store['markRead'] = (convId) => {
      patchData((d) => ({
        ...d,
        conversations: d.conversations.map((c) => (c.id === convId ? { ...c, unread: 0 } : c)),
      }));
    };

    const addNote: Store['addNote'] = (convId, text) => {
      const author = persisted.session?.displayName ?? 'Agent';
      patchData((d) => ({
        ...d,
        conversations: d.conversations.map((c) =>
          c.id === convId
            ? { ...c, notes: [...c.notes, { id: uid('n'), text, ts: Date.now(), author }], updatedAt: Date.now() }
            : c,
        ),
      }));
    };

    const toggleTag: Store['toggleTag'] = (convId, tag) => {
      const t = tag.trim().toLowerCase();
      if (!t) return;
      patchData((d) => ({
        ...d,
        conversations: d.conversations.map((c) =>
          c.id === convId
            ? { ...c, tags: c.tags.includes(t) ? c.tags.filter((x) => x !== t) : [...c.tags, t], updatedAt: Date.now() }
            : c,
        ),
      }));
    };

    const resolveConversation: Store['resolveConversation'] = (convId) => {
      patchData((d) => ({
        ...d,
        conversations: d.conversations.map((c) =>
          c.id === convId ? { ...c, status: 'closed', live: false, updatedAt: Date.now() } : c,
        ),
      }));
    };

    const newProactiveChat: Store['newProactiveChat'] = (visitorId, opener) => {
      const v = persisted.data.visitors.find((x) => x.id === visitorId);
      const id = uid('c');
      const now = Date.now();
      const c: Conversation = {
        id,
        visitor: v?.name ?? 'Guest',
        country: v?.country ?? 'UAE',
        city: v?.city ?? 'Dubai',
        page: v?.page ?? '/',
        device: `${v?.device ?? 'Desktop'} · ${v?.browser ?? 'Chrome'}`,
        status: 'open',
        department: persisted.data.settings.departments[1] ?? 'Support',
        agent: persisted.session?.displayName ?? 'Demo Agent',
        tags: ['proactive'],
        messages: [
          { id: uid('m'), from: 'agent', kind: 'text', text: opener, ts: now, name: persisted.session?.displayName ?? 'Demo Agent' },
        ],
        notes: [],
        unread: 0,
        aiHandled: false,
        live: true,
        createdAt: now,
        updatedAt: now,
      };
      patchData((d) => ({ ...d, conversations: [c, ...d.conversations] }));
      return id;
    };

    const upsert = <T extends { id: string }>(list: T[], item: T): T[] => {
      const i = list.findIndex((x) => x.id === item.id);
      if (i === -1) return [item, ...list];
      const next = [...list];
      next[i] = item;
      return next;
    };

    const saveContact: Store['saveContact'] = (c) => patchData((d) => ({ ...d, contacts: upsert(d.contacts, c) }));
    const deleteContact: Store['deleteContact'] = (id) => patchData((d) => ({ ...d, contacts: d.contacts.filter((c) => c.id !== id) }));
    const saveArticle: Store['saveArticle'] = (a) => patchData((d) => ({ ...d, articles: upsert(d.articles, a) }));
    const deleteArticle: Store['deleteArticle'] = (id) => patchData((d) => ({ ...d, articles: d.articles.filter((a) => a.id !== id) }));
    const saveCanned: Store['saveCanned'] = (c) => patchData((d) => ({ ...d, canned: upsert(d.canned, c) }));
    const deleteCanned: Store['deleteCanned'] = (id) => patchData((d) => ({ ...d, canned: d.canned.filter((c) => c.id !== id) }));
    const trackCannedUsage: Store['trackCannedUsage'] = (id) => patchData((d) => ({
      ...d,
      canned: d.canned.map((c) => (c.id === id ? { ...c, usage: (c.usage ?? 0) + 1 } : c)),
    }));
    const saveTrigger: Store['saveTrigger'] = (t) => patchData((d) => ({ ...d, triggers: upsert(d.triggers, t) }));
    const deleteTrigger: Store['deleteTrigger'] = (id) => patchData((d) => ({ ...d, triggers: d.triggers.filter((t) => t.id !== id) }));
    const toggleTrigger: Store['toggleTrigger'] = (id) =>
      patchData((d) => ({ ...d, triggers: d.triggers.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)) }));
    const saveCampaign: Store['saveCampaign'] = (c) => patchData((d) => ({ ...d, campaigns: upsert(d.campaigns, c) }));
    const deleteCampaign: Store['deleteCampaign'] = (id) => patchData((d) => ({ ...d, campaigns: d.campaigns.filter((c) => c.id !== id) }));

    const updateSettings: Store['updateSettings'] = (patch) => {
      patchData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
    };

    const searchAll: Store['searchAll'] = (q) => {
      const t = q.trim().toLowerCase();
      if (!t) return { conversations: [], contacts: [] };
      const conversations = persisted.data.conversations.filter(
        (c) =>
          c.visitor.toLowerCase().includes(t) ||
          c.messages.some((m) => m.text.toLowerCase().includes(t)) ||
          c.tags.some((tag) => tag.includes(t)),
      );
      const contacts = persisted.data.contacts.filter(
        (c) => c.name.toLowerCase().includes(t) || c.email.toLowerCase().includes(t) || c.tags.some((tag) => tag.includes(t)),
      );
      return { conversations, contacts };
    };

    return {
      session: persisted.session,
      data: persisted.data,
      knownWorkspaces: Object.keys(persisted.workspaces).sort(),
      currentMember,
      signup, login, logout, resetDemo,
      updateProfile, setStatus, changePasscode,
      getConversation, getVisitor,
      addMessage, updateConversation, markRead, addNote, toggleTag, resolveConversation, newProactiveChat,
      saveContact, deleteContact, saveArticle, deleteArticle,
      saveCanned, deleteCanned, trackCannedUsage, saveTrigger, deleteTrigger, toggleTrigger,
      saveCampaign, deleteCampaign, updateSettings, searchAll,
    };
  }, [persisted, patchData]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
