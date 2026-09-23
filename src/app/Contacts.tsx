// Brix Chat — Contacts mini-CRM.
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import type { Contact } from '../lib/types';
import { cx, timeAgo, uid } from '../lib/utils';
import { Avatar, Badge, Button, Card, EmptyState, Input, Label, Modal, SearchInput, Textarea, useConfirm } from '../components/ui';

const FLAGS: Record<string, string> = {
  'UAE': '🇦🇪', 'Saudi Arabia': '🇸🇦', 'Germany': '🇩🇪', 'Italy': '🇮🇹',
  'India': '🇮🇳', 'UK': '🇬🇧', 'US': '🇺🇸', 'United Kingdom': '🇬🇧', 'United States': '🇺🇸',
};

function blankContact(): Contact {
  return {
    id: uid('ct'), name: '', email: '', phone: '', country: '', tags: [],
    notes: '', chats: 0, lastSeen: Date.now(), source: 'manual',
  };
}

export default function Contacts() {
  const store = useStore();
  const { confirm, dialog } = useConfirm();
  const [q, setQ] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ contact: Contact; tagsText: string } | null>(null);
  const [detail, setDetail] = useState<Contact | null>(null);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    store.data.contacts.forEach((c) => c.tags.forEach((t) => s.add(t)));
    return [...s].sort();
  }, [store.data.contacts]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return store.data.contacts.filter((c) => {
      if (tagFilter && !c.tags.includes(tagFilter)) return false;
      if (!t) return true;
      return (
        c.name.toLowerCase().includes(t) ||
        c.email.toLowerCase().includes(t) ||
        c.tags.some((tag) => tag.toLowerCase().includes(t))
      );
    });
  }, [store.data.contacts, q, tagFilter]);

  const save = () => {
    if (!editor) return;
    if (!editor.contact.name.trim()) return;
    store.saveContact({
      ...editor.contact,
      name: editor.contact.name.trim(),
      email: editor.contact.email.trim(),
      tags: editor.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
    });
    setEditor(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-extrabold text-slate-900">Contacts</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your visitor CRM — {store.data.contacts.length} contacts</p>
        </div>
        <Button onClick={() => setEditor({ contact: blankContact(), tagsText: '' })}>+ Add contact</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-72"><SearchInput value={q} onChange={setQ} placeholder="Search name, email, tag…" /></div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setTagFilter(null)}
            className={cx('px-3 py-1 rounded-full text-xs font-semibold border transition',
              tagFilter === null ? 'bg-ink-950 text-white border-ink-950' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}>
            All
          </button>
          {allTags.map((t) => (
            <button key={t}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
              className={cx('px-3 py-1 rounded-full text-xs font-semibold border transition',
                tagFilter === t ? 'bg-brix-600 text-white border-brix-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}>
              #{t}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card><EmptyState icon="📇" title="No contacts found" hint="Add your first contact or clear the search." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Phone</th>
                  <th className="px-5 py-3 font-semibold">Country</th>
                  <th className="px-5 py-3 font-semibold">Tags</th>
                  <th className="px-5 py-3 font-semibold">Chats</th>
                  <th className="px-5 py-3 font-semibold">Last seen</th>
                  <th className="px-5 py-3 font-semibold">Source</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} onClick={() => setDetail(c)}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={c.name} size="sm" />
                        <span className="font-semibold text-slate-900">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{c.email || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{c.phone || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">
                      {c.country ? <span><span className="mr-1.5">{FLAGS[c.country] ?? '🌍'}</span>{c.country}</span> : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((t) => <Badge key={t} tone="indigo">#{t}</Badge>)}
                        {c.tags.length === 0 && <span className="text-slate-400 text-xs">—</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700 font-semibold">{c.chats}</td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap">{timeAgo(c.lastSeen)}</td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{c.source}</td>
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setEditor({ contact: { ...c }, tagsText: c.tags.join(', ') })}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50"
                          onClick={() => confirm({
                            title: 'Delete contact',
                            body: `Delete ${c.name}? This can't be undone.`,
                            action: () => store.deleteContact(c.id),
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

      {/* Add / Edit modal */}
      <Modal open={editor !== null} onClose={() => setEditor(null)}
        title={editor && store.data.contacts.some((c) => c.id === editor.contact.id) ? 'Edit contact' : 'Add contact'}>
        {editor && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Name</Label><Input value={editor.contact.name} onChange={(e) => setEditor({ ...editor, contact: { ...editor.contact, name: e.target.value } })} placeholder="Jane Cooper" /></div>
              <div><Label>Email</Label><Input value={editor.contact.email} onChange={(e) => setEditor({ ...editor, contact: { ...editor.contact, email: e.target.value } })} placeholder="jane@acme.com" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Phone</Label><Input value={editor.contact.phone ?? ''} onChange={(e) => setEditor({ ...editor, contact: { ...editor.contact, phone: e.target.value } })} placeholder="+971 50 000 0000" /></div>
              <div><Label>Country</Label><Input value={editor.contact.country} onChange={(e) => setEditor({ ...editor, contact: { ...editor.contact, country: e.target.value } })} placeholder="UAE" /></div>
            </div>
            <div><Label>Tags (comma-separated)</Label><Input value={editor.tagsText} onChange={(e) => setEditor({ ...editor, tagsText: e.target.value })} placeholder="vip, enterprise" /></div>
            <div><Label>Notes</Label><Textarea rows={3} value={editor.contact.notes} onChange={(e) => setEditor({ ...editor, contact: { ...editor.contact, notes: e.target.value } })} placeholder="Anything worth remembering…" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditor(null)}>Cancel</Button>
              <Button onClick={save} disabled={!editor.contact.name.trim()}>Save contact</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Detail modal */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail?.name ?? 'Contact'}>
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={detail.name} size="lg" />
              <div>
                <div className="font-semibold text-slate-900">{detail.email || 'No email'}</div>
                <div className="text-xs text-slate-500">{detail.phone || 'No phone'} · {detail.country || 'No country'}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50 p-3 text-center"><div className="text-xl font-extrabold text-slate-900">{detail.chats}</div><div className="text-xs text-slate-500">Chats</div></div>
              <div className="rounded-xl bg-slate-50 p-3 text-center"><div className="text-xl font-extrabold text-slate-900">{timeAgo(detail.lastSeen)}</div><div className="text-xs text-slate-500">Last seen</div></div>
              <div className="rounded-xl bg-slate-50 p-3 text-center"><div className="text-xl font-extrabold text-slate-900 capitalize">{detail.source}</div><div className="text-xs text-slate-500">Source</div></div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {detail.tags.map((t) => <Badge key={t} tone="indigo">#{t}</Badge>)}
              {detail.tags.length === 0 && <span className="text-xs text-slate-400">No tags</span>}
            </div>
            <div>
              <Label>Notes</Label>
              <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3 whitespace-pre-wrap">{detail.notes || 'No notes yet.'}</p>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => { setEditor({ contact: { ...detail }, tagsText: detail.tags.join(', ') }); setDetail(null); }}>Edit</Button>
            </div>
          </div>
        )}
      </Modal>

      {dialog}
    </div>
  );
}
