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
  Settings,
  TriggerRule,
  Visitor,
  Workspace,
} from './types';
import { seedData, seedWorkspaces } from './seed';
import { uid } from './utils';

const LS_KEY = 'brixchat_v1';

export interface Session {
  workspace: string;
  displayName: string;
}

interface Persisted {
  workspaces: Record<string, Workspace>;
  session: Session | null;
  data: ChatData;
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Persisted;
      if (p.workspaces && p.data) return p;
    }
  } catch {
    /* corrupted — reseed */
  }
  return { workspaces: seedWorkspaces(), session: null, data: seedData() };
}

export type AuthResult = { ok: boolean; error?: string };

interface Store {
  session: Session | null;
  data: ChatData;

  // auth (passcode-based, no email)
  signup: (workspace: string, displayName: string, passcode: string) => AuthResult;
  login: (workspace: string, passcode: string) => AuthResult;
  logout: () => void;
  resetDemo: () => void;

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

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(persisted));
    } catch {
      /* storage full — ignore in demo */
    }
  }, [persisted]);

  const patchData = useCallback((fn: (d: ChatData) => ChatData) => {
    setPersisted((p) => ({ ...p, data: fn(p.data) }));
  }, []);

  const store = useMemo<Store>(() => {
    const norm = (s: string) => s.trim().toLowerCase();

    const signup: Store['signup'] = (workspace, displayName, passcode) => {
      const w = norm(workspace);
      if (!w) return { ok: false, error: 'Workspace name is required.' };
      if (!displayName.trim()) return { ok: false, error: 'Display name is required.' };
      if (passcode.length < 4) return { ok: false, error: 'Passcode must be at least 4 characters.' };
      let err: string | undefined;
      setPersisted((p) => {
        if (p.workspaces[w]) {
          err = 'That workspace already exists — try logging in.';
          return p;
        }
        const ws: Workspace = { name: w, displayName: displayName.trim(), passcode, createdAt: Date.now() };
        return {
          ...p,
          workspaces: { ...p.workspaces, [w]: ws },
          session: { workspace: w, displayName: ws.displayName },
        };
      });
      return err ? { ok: false, error: err } : { ok: true };
    };

    const login: Store['login'] = (workspace, passcode) => {
      const w = norm(workspace);
      let res: AuthResult = { ok: false, error: 'Workspace not found.' };
      setPersisted((p) => {
        const ws = p.workspaces[w];
        if (!ws) return p;
        if (ws.passcode !== passcode) {
          res = { ok: false, error: 'Wrong passcode.' };
          return p;
        }
        res = { ok: true };
        return { ...p, session: { workspace: w, displayName: ws.displayName } };
      });
      return res;
    };

    const logout = () => setPersisted((p) => ({ ...p, session: null }));
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
      signup, login, logout, resetDemo,
      getConversation, getVisitor,
      addMessage, updateConversation, markRead, addNote, toggleTag, resolveConversation, newProactiveChat,
      saveContact, deleteContact, saveArticle, deleteArticle,
      saveCanned, deleteCanned, saveTrigger, deleteTrigger, toggleTrigger,
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
