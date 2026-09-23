// Brix Chat — platform content managers (blog / help center / contact inbox / status page).
// These manage the BRIX MARKETING SITE content, which lives in the operator
// workspace ('demo') — not in any client workspace. They are shared by the
// platform console (/admin → Content).

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { getApi, ApiError } from '../../lib/api';
import type {
  ApiBlogPost,
  ApiHelpArticle,
  ApiContactMessage,
  ApiStatusEntry,
} from '../../lib/api';
import { fmtTs } from '../../lib/contentSeed';

// Local form seeds (mirror the API create inputs).
interface BlogSeed {
  slug: string; title: string; excerpt: string; body: string;
  tags: string[]; author: string; published: boolean; reading_mins: number;
}
interface HelpSeed {
  slug: string; title: string; body: string; category: string; order: number;
}
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Select, Textarea, Toggle, useConfirm } from '../ui';
import { cx } from '../../lib/utils';

// --- local helpers (platform/operator scope) --------------------------------

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Something went wrong.';
}

function itemsOf<T>(data: { items: T[] } | T[] | null | undefined): T[] {
  if (!data) return [];
  return Array.isArray(data) ? data : data.items;
}

/** Operator-workspace API (the 'demo' workspace is the platform's own). */
function useP2() {
  const { session } = useStore();
  return useMemo(
    () => getApi(session?.workspaceId ?? 'demo', session?.displayName ?? 'platform'),
    [session?.workspaceId, session?.displayName],
  );
}

const emptyPost: BlogSeed = { slug: '', title: '', excerpt: '', body: '', tags: [], author: 'Brix Team', published: false, reading_mins: 3 };
const emptyHelp: HelpSeed = { slug: '', title: '', body: '', category: 'General', order: 0 };

function BlogManager({ readOnly }: { readOnly: boolean }) {
  const p2 = useP2();
  const { confirm, dialog } = useConfirm();
  const [posts, setPosts] = useState<ApiBlogPost[]>([]);
  const [editing, setEditing] = useState<(BlogSeed & { id?: string }) | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await p2.blog.list(false);
      setPosts(itemsOf(data));
    } catch (e) { setError(errMsg(e)); }
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!editing || !editing.title.trim() || !editing.slug.trim()) return;
    try {
      if (editing.id) await p2.blog.update(editing.id, editing);
      else await p2.blog.create(editing);
      setEditing(null);
      await load();
    } catch (e) { setError(errMsg(e)); }
  };

  const remove = (p: ApiBlogPost) => {
    confirm({
      title: 'Delete post?', body: `"${p.title}" will be removed from /blog.`,
      action: async () => { await p2.blog.delete(p.id); await load(); },
    });
  };

  return (
    <div className="mb-10">
      {dialog}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900">Blog posts <span className="text-xs font-semibold text-slate-400">/blog</span></h3>
        {!readOnly && <Button size="sm" onClick={() => setEditing({ ...emptyPost })}>+ New post</Button>}
      </div>
      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
      {posts.length === 0 ? (
        <EmptyState icon="✍️" title="No posts yet" hint="Write the first post for /blog." />
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{p.title}</span>
                    <Badge tone={p.published ? 'green' : 'amber'}>{p.published ? 'Published' : 'Draft'}</Badge>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">/blog/{p.slug} · {p.reading_mins} min read</div>
                </div>
                {!readOnly && (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditing({ ...p, tags: [...p.tags] })}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(p)} className="text-rose-600">Delete</Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Edit post' : 'New post'} wide>
        {editing && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Title</Label><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
              <div><Label>Slug</Label><Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-') })} className="font-mono" /></div>
            </div>
            <div><Label>Excerpt</Label><Textarea value={editing.excerpt} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} rows={2} /></div>
            <div><Label>Body (plain text / markdown)</Label><Textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={8} className="font-mono text-[13px]" /></div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div><Label>Author</Label><Input value={editing.author} onChange={(e) => setEditing({ ...editing, author: e.target.value })} /></div>
              <div><Label>Tags (comma separated)</Label><Input value={editing.tags.join(', ')} onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} /></div>
              <div><Label>Reading time (min)</Label><Input type="number" min={1} value={editing.reading_mins} onChange={(e) => setEditing({ ...editing, reading_mins: Number(e.target.value) || 3 })} /></div>
            </div>
            <div className="flex items-center justify-between">
              <Toggle checked={editing.published} onChange={(v) => setEditing({ ...editing, published: v })} label="Published" />
              <Button onClick={save} disabled={!editing.title.trim() || !editing.slug.trim()}>Save post</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function HelpManager({ readOnly }: { readOnly: boolean }) {
  const p2 = useP2();
  const { confirm, dialog } = useConfirm();
  const [articles, setArticles] = useState<ApiHelpArticle[]>([]);
  const [editing, setEditing] = useState<(HelpSeed & { id?: string }) | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await p2.helpDocs.list();
      setArticles(itemsOf(data).sort((a, b) => a.order - b.order));
    } catch (e) { setError(errMsg(e)); }
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!editing || !editing.title.trim() || !editing.slug.trim()) return;
    try {
      if (editing.id) await p2.helpDocs.update(editing.id, editing);
      else await p2.helpDocs.create(editing);
      setEditing(null);
      await load();
    } catch (e) { setError(errMsg(e)); }
  };

  const remove = (a: ApiHelpArticle) => {
    confirm({
      title: 'Delete article?', body: `"${a.title}" will be removed from /help.`,
      action: async () => { await p2.helpDocs.delete(a.id); await load(); },
    });
  };

  const catNames = [...new Set(articles.map((a) => a.category))];

  return (
    <div className="mb-10">
      {dialog}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900">Help articles <span className="text-xs font-semibold text-slate-400">/help</span></h3>
        {!readOnly && <Button size="sm" onClick={() => setEditing({ ...emptyHelp })}>+ New article</Button>}
      </div>
      <p className="text-sm text-slate-500 mb-4">{articles.length} articles · {catNames.length} categories</p>
      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
      {articles.length === 0 ? (
        <EmptyState icon="📖" title="No articles yet" hint="Seed articles appear automatically on the help page, or create one here." />
      ) : (
        <div className="space-y-3">
          {articles.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{a.title}</span>
                    <Badge tone="indigo">{a.category}</Badge>
                    <span className="text-xs text-slate-400">order {a.order}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">/help/{a.slug}</div>
                </div>
                {!readOnly && (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditing({ ...a })}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(a)} className="text-rose-600">Delete</Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Edit article' : 'New article'} wide>
        {editing && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Title</Label><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
              <div><Label>Slug</Label><Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-') })} className="font-mono" /></div>
            </div>
            <div>
              <div><Label>Category label</Label>
              <Input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} list="help-cat-names" />
              <datalist id="help-cat-names">{catNames.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
            </div>
            <div><Label>Body</Label><Textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={8} className="font-mono text-[13px]" /></div>
            <div className="flex items-center justify-between">
              <div className="w-32"><Label>Sort order</Label><Input type="number" value={editing.order} onChange={(e) => setEditing({ ...editing, order: Number(e.target.value) || 0 })} /></div>
              <Button onClick={save} disabled={!editing.title.trim() || !editing.slug.trim()}>Save article</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ContactInbox({ readOnly }: { readOnly: boolean }) {
  const p2 = useP2();
  const [msgs, setMsgs] = useState<ApiContactMessage[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await p2.contactMessages.list();
      setMsgs(itemsOf(data));
    } catch (e) { setError(errMsg(e)); }
  };
  useEffect(() => { void load(); }, []);

  const markRead = async (m: ApiContactMessage) => {
    try {
      await p2.contactMessages.markRead(m.id);
      await load();
    } catch (e) { setError(errMsg(e)); }
  };

  const unread = msgs.filter((m) => !m.read).length;

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900">Contact inbox {unread > 0 && <Badge tone="rose">{unread} unread</Badge>}</h3>
      </div>
      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
      {msgs.length === 0 ? (
        <EmptyState icon="✉️" title="No messages" hint="Submissions from /contact land here." />
      ) : (
        <div className="space-y-3">
          {msgs.map((m) => (
            <Card key={m.id} className={cx('p-4', !m.read && 'border-brix-200 bg-brix-50/40')}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{m.name}</span>
                    <span className="text-xs text-slate-400">{m.email}</span>
                    {!m.read && <Badge tone="rose">new</Badge>}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 font-semibold">{m.subject} · {fmtTs(m.created_at)}</div>
                  <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{m.message}</p>
                </div>
                {!readOnly && !m.read && (
                  <Button variant="ghost" size="sm" onClick={() => void markRead(m)}>Mark read</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusManager({ readOnly }: { readOnly: boolean }) {
  const p2 = useP2();
  const { confirm, dialog } = useConfirm();
  const [entries, setEntries] = useState<ApiStatusEntry[]>([]);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [state, setState] = useState<ApiStatusEntry['state']>('operational');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await p2.statusEntries.list();
      setEntries(itemsOf(data));
    } catch (e) { setError(errMsg(e)); }
  };
  useEffect(() => { void load(); }, []);

  const add = async () => {
    if (!title.trim()) return;
    try {
      await p2.statusEntries.create({ title: title.trim(), detail: detail.trim(), state });
      setTitle(''); setDetail('');
      await load();
    } catch (e) { setError(errMsg(e)); }
  };

  const remove = (e: ApiStatusEntry) => {
    confirm({
      title: 'Delete status entry?', body: `"${e.title}" will be removed from /status.`,
      action: async () => { await p2.statusEntries.delete(e.id); await load(); },
    });
  };

  const tone = (s: ApiStatusEntry['state']) => (s === 'operational' ? 'green' : s === 'degraded' ? 'amber' : 'rose') as 'green' | 'amber' | 'rose';

  return (
    <div>
      {dialog}
      <h3 className="font-bold text-slate-900 mb-4">Status page <span className="text-xs font-semibold text-slate-400">/status</span></h3>
      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
      {!readOnly && (
        <Card className="p-5 mb-5">
          <div className="grid sm:grid-cols-[1fr_180px] gap-3 mb-3">
            <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scheduled maintenance" /></div>
            <div>
              <Label>State</Label>
              <Select value={state} onChange={(e) => setState(e.target.value as ApiStatusEntry['state'])}>
                <option value="operational">Operational</option>
                <option value="degraded">Degraded</option>
                <option value="incident">Incident</option>
              </Select>
            </div>
          </div>
          <div className="mb-3"><Label>Detail</Label><Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} /></div>
          <Button size="sm" onClick={() => void add()} disabled={!title.trim()}>Publish entry</Button>
        </Card>
      )}
      <div className="space-y-3">
        {entries.length === 0 && <EmptyState icon="🟢" title="No entries" hint="The status page shows all-operational by default." />}
        {entries.map((e) => (
          <Card key={e.id} className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone={tone(e.state)}>{e.state}</Badge>
                  <span className="font-bold text-slate-900">{e.title}</span>
                </div>
                {e.detail && <p className="text-sm text-slate-500 mt-1">{e.detail}</p>}
                <div className="text-xs text-slate-400 mt-1">{fmtTs(e.created_at)}</div>
              </div>
              {!readOnly && <Button variant="ghost" size="sm" onClick={() => remove(e)} className="text-rose-600">Delete</Button>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export { BlogManager, HelpManager, ContactInbox, StatusManager };
