// Brix Chat — Knowledge base article manager + unanswered-questions loop.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { getApi } from '../lib/api';
import type { ApiUnanswered } from '../lib/api';
import type { Article } from '../lib/types';
import { cx, timeAgo, uid } from '../lib/utils';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, SearchInput, Tabs, Textarea, Toggle, useConfirm } from '../components/ui';

function slugify(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function blankArticle(): Article {
  return {
    id: uid('kb'), title: '', slug: '', body: '', category: 'General',
    status: 'draft', updatedAt: Date.now(), views: 0,
  };
}

export default function KnowledgeBase() {
  const store = useStore();
  const { session, effectiveWorkspaceId } = store;
  const { confirm, dialog } = useConfirm();
  const [editor, setEditor] = useState<{ article: Article; slugTouched: boolean } | null>(null);
  const [reader, setReader] = useState<Article | null>(null);
  const [section, setSection] = useState<'articles' | 'unanswered'>('articles');
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [unanswered, setUnanswered] = useState<ApiUnanswered[]>([]);
  const [busy, setBusy] = useState(false);

  const api = useMemo(() => (session ? getApi(effectiveWorkspaceId(), session.displayName) : null), [session]);

  const refreshUnanswered = async () => {
    if (!api) return;
    try {
      const { data: page } = await api.unanswered.list();
      setUnanswered(page.items);
    } catch { /* ignore */ }
  };

  useEffect(() => { refreshUnanswered(); }, [session?.workspaceId, session?.viewingWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const promote = async (id: string) => {
    if (!api || busy) return;
    setBusy(true);
    try {
      const { data: draft } = await api.unanswered.promote(id);
      // Mirror the new draft into the dashboard's article list.
      store.saveArticle({
        id: uid('kb'), title: draft.title, slug: slugify(draft.title) || draft.slug, body: draft.body,
        category: draft.category, status: 'draft', updatedAt: Date.now(), views: 0,
      });
      refreshUnanswered();
    } catch { /* ignore */ }
    setBusy(false);
  };

  const dismiss = async (id: string) => {
    if (!api) return;
    try {
      await api.unanswered.dismiss(id);
      refreshUnanswered();
    } catch { /* ignore */ }
  };

  const categories = useMemo(() => {
    const s = new Set(store.data.articles.map((a) => a.category));
    return [...s].sort();
  }, [store.data.articles]);

  const filteredArticles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return store.data.articles
      .filter((a) => catFilter === 'all' || a.category === catFilter)
      .filter((a) =>
        !t ||
        a.title.toLowerCase().includes(t) ||
        a.body.toLowerCase().includes(t) ||
        a.category.toLowerCase().includes(t),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [store.data.articles, q, catFilter]);

  const set = (patch: Partial<Article>) => {
    if (!editor) return;
    const next = { ...editor.article, ...patch };
    setEditor({
      article: patch.title !== undefined && !editor.slugTouched ? { ...next, slug: slugify(next.title) } : next,
      slugTouched: editor.slugTouched || patch.slug !== undefined,
    });
  };

  const save = () => {
    if (!editor || !editor.article.title.trim()) return;
    const a = editor.article;
    store.saveArticle({
      ...a,
      title: a.title.trim(),
      slug: a.slug.trim() || slugify(a.title),
      category: a.category.trim() || 'General',
      updatedAt: Date.now(),
    });
    setEditor(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-extrabold text-slate-900">Knowledge base</h1>
          <p className="text-sm text-slate-500 mt-0.5">Articles power the widget's help center and AI answers</p>
        </div>
        <Button onClick={() => setEditor({ article: blankArticle(), slugTouched: false })}>+ New article</Button>
      </div>

      <Tabs<'articles' | 'unanswered'>
        tabs={[
          { id: 'articles', label: 'Articles', count: store.data.articles.length },
          { id: 'unanswered', label: 'Unanswered questions', count: unanswered.length },
        ]}
        active={section}
        onChange={setSection}
      />

      {section === 'unanswered' ? (
        <Card className="p-5">
          <p className="text-sm text-slate-500 mb-4">
            ❓ Questions agents couldn't answer, logged from chats. Promote a repeat question into a draft article — that's the knowledge-gap loop.
          </p>
          {unanswered.length === 0 ? (
            <EmptyState icon="❓" title="No unanswered questions" hint="When an agent can't answer, they'll log the question here." />
          ) : (
            <div className="space-y-2.5">
              {unanswered.map((u) => (
                <div key={u.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
                  <span className="shrink-0 min-w-10 h-10 px-2 grid place-items-center rounded-xl bg-amber-100 text-amber-800 font-extrabold text-sm">
                    {u.count}×
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900">{u.question}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">first asked {timeAgo(Date.parse(u.created_at))}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => promote(u.id)} disabled={busy}>📝 Promote to draft</Button>
                    <Button size="sm" variant="ghost" className="text-slate-400 hover:text-slate-600" onClick={() => dismiss(u.id)}>Dismiss</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-72"><SearchInput value={q} onChange={setQ} placeholder="Search articles…" /></div>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setCatFilter('all')}
                className={cx('px-3 py-1 rounded-full text-xs font-semibold border transition',
                  catFilter === 'all' ? 'bg-ink-950 text-white border-ink-950' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}>
                All
              </button>
              {categories.map((c) => (
                <button key={c} onClick={() => setCatFilter(catFilter === c ? 'all' : c)}
                  className={cx('px-3 py-1 rounded-full text-xs font-semibold border transition',
                    catFilter === c ? 'bg-brix-600 text-white border-brix-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}>
                  {c}
                </button>
              ))}
            </div>
          </div>

      {filteredArticles.length === 0 ? (
        <Card><EmptyState icon="📚" title="No articles found" hint="Write your first help article — it appears in the widget instantly." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3 font-semibold">Title</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Category</th>
                  <th className="px-5 py-3 font-semibold">Views</th>
                  <th className="px-5 py-3 font-semibold">Helpful</th>
                  <th className="px-5 py-3 font-semibold">Updated</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredArticles.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{a.title}</div>
                      <div className="text-xs text-slate-400 font-mono">/{a.slug}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => store.saveArticle({ ...a, status: a.status === 'published' ? 'draft' : 'published', updatedAt: Date.now() })}
                        title={a.status === 'published' ? 'Unpublish' : 'Publish'}>
                        <Badge tone={a.status === 'published' ? 'green' : 'amber'}>{a.status}</Badge>
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{a.category}</td>
                    <td className="px-5 py-3.5 text-slate-700 font-semibold tabular-nums">{a.views.toLocaleString()}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="text-xs font-bold text-emerald-600">👍 {a.helpful ?? 0}</span>{' '}
                      <span className="text-xs font-bold text-rose-500">👎 {a.notHelpful ?? 0}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap">{timeAgo(a.updatedAt)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setReader(a)}>Preview</Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditor({ article: { ...a }, slugTouched: true })}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50"
                          onClick={() => confirm({
                            title: 'Delete article',
                            body: `Delete "${a.title}"? This can't be undone.`,
                            action: () => store.deleteArticle(a.id),
                          })}>✕</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
        </>
      )}

      {/* Editor modal */}
      <Modal open={editor !== null} onClose={() => setEditor(null)} wide
        title={editor && store.data.articles.some((a) => a.id === editor.article.id) ? 'Edit article' : 'New article'}>
        {editor && (
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={editor.article.title} onChange={(e) => set({ title: e.target.value })} placeholder="How to reset your password" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Slug</Label><Input value={editor.article.slug} onChange={(e) => set({ slug: e.target.value })} placeholder="auto-generated" className="font-mono" /></div>
              <div>
                <Label>Category</Label>
                <div className="flex gap-2">
                  <Input value={editor.article.category} onChange={(e) => set({ category: e.target.value })} placeholder="General" list="kb-cats" />
                </div>
                <datalist id="kb-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <Toggle checked={editor.article.status === 'published'} onChange={(v) => set({ status: v ? 'published' : 'draft' })} label="Published" />
              <span className="text-sm font-medium text-slate-700">
                {editor.article.status === 'published' ? 'Published — visible in the widget' : 'Draft — hidden from visitors'}
              </span>
            </div>
            <div><Label>Body</Label><Textarea rows={10} value={editor.article.body} onChange={(e) => set({ body: e.target.value })} placeholder="Write the article… Use blank lines between paragraphs." /></div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditor(null)}>Cancel</Button>
              <Button onClick={save} disabled={!editor.article.title.trim()}>Save article</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reader modal */}
      <Modal open={reader !== null} onClose={() => setReader(null)} wide title={reader?.title ?? 'Preview'}>
        {reader && (
          <article>
            <div className="flex items-center gap-2 mb-4">
              <Badge tone={reader.status === 'published' ? 'green' : 'amber'}>{reader.status}</Badge>
              <span className="text-xs text-slate-500">{reader.category} · {reader.views.toLocaleString()} views · updated {timeAgo(reader.updatedAt)}</span>
            </div>
            <div className="prose-sm max-w-none space-y-3">
              {reader.body.split(/\n\n+/).map((p, i) => (
                <p key={i} className="text-[15px] leading-relaxed text-slate-700 whitespace-pre-line">{p}</p>
              ))}
              {!reader.body && <p className="text-sm text-slate-400 italic">Empty article.</p>}
            </div>
          </article>
        )}
      </Modal>

      {dialog}
    </div>
  );
}
