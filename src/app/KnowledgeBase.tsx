// Brix Chat — Knowledge base article manager.
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import type { Article } from '../lib/types';
import { timeAgo, uid } from '../lib/utils';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Textarea, Toggle, useConfirm } from '../components/ui';

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
  const { confirm, dialog } = useConfirm();
  const [editor, setEditor] = useState<{ article: Article; slugTouched: boolean } | null>(null);
  const [reader, setReader] = useState<Article | null>(null);

  const categories = useMemo(() => {
    const s = new Set(store.data.articles.map((a) => a.category));
    return [...s].sort();
  }, [store.data.articles]);

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

      {store.data.articles.length === 0 ? (
        <Card><EmptyState icon="📚" title="No articles yet" hint="Write your first help article — it appears in the widget instantly." /></Card>
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
                  <th className="px-5 py-3 font-semibold">Updated</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {store.data.articles.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{a.title}</div>
                      <div className="text-xs text-slate-400 font-mono">/{a.slug}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={a.status === 'published' ? 'green' : 'amber'}>{a.status}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{a.category}</td>
                    <td className="px-5 py-3.5 text-slate-700 font-semibold tabular-nums">{a.views.toLocaleString()}</td>
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
