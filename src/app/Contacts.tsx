// Brix Chat — Contacts mini-CRM: timelines, duplicate merge.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import type { Contact } from '../lib/types';
import { cx, timeAgo, uid } from '../lib/utils';
import { Avatar, Badge, Button, Card, EmptyState, Input, Label, Modal, SearchInput, Select, Textarea, useConfirm } from '../components/ui';
import { toast } from '../components/dashboard/Toasts';
import { getApi } from '../lib/api';

const FLAGS: Record<string, string> = {
  'UAE': '🇦🇪', 'Saudi Arabia': '🇸🇦', 'Germany': '🇩🇪', 'Italy': '🇮🇹',
  'India': '🇮🇳', 'UK': '🇬🇧', 'US': '🇺🇸', 'United Kingdom': '🇬🇧', 'United States': '🇺🇸',
};

/** Display-only PII masking — data underneath is never touched. */
function maskEmail(e: string): string {
  const [u, d] = e.split('@');
  if (!d) return '•••';
  return `${u.charAt(0) || '•'}•••@${d}`;
}
function maskPhone(p: string): string {
  const digits = p.replace(/\D/g, '');
  if (digits.length <= 2) return '••••';
  let seen = 0;
  return p.replace(/\d/g, (d) => {
    seen += 1;
    return seen > digits.length - 2 ? d : '•';
  });
}
function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function blankContact(): Contact {
  return {
    id: uid('ct'), name: '', email: '', phone: '', country: '', tags: [],
    notes: '', chats: 0, lastSeen: Date.now(), source: 'manual',
  };
}

/** Chronological timeline events for a contact, built from their conversations. */
export type TimelineKind = 'chat' | 'note' | 'rating' | 'resolved';
export interface TimelineEvent { ts: number; kind: TimelineKind; text: string; convId: string }
function contactTimeline(contact: Contact, conversations: ReturnType<typeof useStore>['data']['conversations']): TimelineEvent[] {
  const mine = conversations.filter((c) => c.visitor.toLowerCase() === contact.name.toLowerCase());
  const events: TimelineEvent[] = [];
  mine.forEach((c) => {
    const first = c.messages.find((m) => m.text.trim());
    const msgCount = c.messages.filter((m) => m.text.trim()).length;
    events.push({
      ts: c.createdAt,
      kind: 'chat',
      text: `💬 Chat ${c.status} · ${msgCount} message${msgCount === 1 ? '' : 's'}${first ? ` — “${first.text.slice(0, 80)}${first.text.length > 80 ? '…' : ''}”` : ''}`,
      convId: c.id,
    });
    if (c.status === 'closed') {
      events.push({ ts: c.updatedAt, kind: 'resolved', text: '✅ Chat resolved', convId: c.id });
    }
    const ratingMsg = c.messages.find((m) => m.kind === 'rating' && m.rating);
    const rating = ratingMsg?.rating ?? c.rating;
    if (rating) {
      events.push({ ts: ratingMsg?.ts ?? c.updatedAt, kind: 'rating', text: `⭐ Rated ${rating}/5`, convId: c.id });
    }
    c.notes.forEach((n) => events.push({ ts: n.ts, kind: 'note', text: `📝 ${n.author}: ${n.text.slice(0, 100)}`, convId: c.id }));
  });
  events.sort((a, b) => b.ts - a.ts);
  return events;
}
const TIMELINE_DOT: Record<TimelineKind, string> = {
  chat: 'bg-brix-500', note: 'bg-amber-400', rating: 'bg-emerald-500', resolved: 'bg-slate-400',
};

export default function Contacts() {
  const store = useStore();
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('search') ?? '');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ contact: Contact; tagsText: string } | null>(null);
  const [detail, setDetail] = useState<Contact | null>(null);
  const [mergeIds, setMergeIds] = useState<Set<string>>(new Set());
  const [mergePrimary, setMergePrimary] = useState('');
  const [maskPII, setMaskPII] = useState(() => {
    try { return localStorage.getItem('brix.maskPII') === '1'; } catch { return false; }
  });
  const toggleMask = () => setMaskPII((v) => {
    try { localStorage.setItem('brix.maskPII', v ? '0' : '1'); } catch { /* ignore */ }
    return !v;
  });

  // Deep link from a chat thread (timeline view).
  useEffect(() => {
    const s = params.get('search');
    if (s) setQ(s);
  }, [params]);

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

  const toggleMerge = (id: string) => {
    setMergeIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const mergeContacts = () => {
    const ids = [...mergeIds];
    if (ids.length < 2 || !mergePrimary) return;
    const primary = store.data.contacts.find((c) => c.id === mergePrimary);
    if (!primary) return;
    const others = store.data.contacts.filter((c) => ids.includes(c.id) && c.id !== mergePrimary);
    const merged: Contact = {
      ...primary,
      email: primary.email || others.find((c) => c.email)?.email || '',
      phone: primary.phone || others.find((c) => c.phone)?.phone || '',
      country: primary.country || others.find((c) => c.country)?.country || '',
      tags: [...new Set([...primary.tags, ...others.flatMap((c) => c.tags)])],
      notes: [primary.notes, ...others.map((c) => c.notes)].filter(Boolean).join('\n\n— merged —\n\n'),
      chats: primary.chats + others.reduce((n, c) => n + c.chats, 0),
      lastSeen: Math.max(primary.lastSeen, ...others.map((c) => c.lastSeen)),
    };
    store.saveContact(merged);
    others.forEach((c) => store.deleteContact(c.id));
    setMergeIds(new Set());
    setMergePrimary('');
  };

  const erase = (c: Contact) => {
    confirm({
      title: 'Erase contact data',
      body: `Permanently erase ${c.name}? This deletes the contact record and anonymizes their conversations (name, email and notes removed). This can't be undone.`,
      action: () => {
        store.eraseContact(c.id);
        setDetail(null);
        toast.success('Contact erased', `${c.name}'s record and linked PII were anonymized`);
        const sess = store.session;
        if (sess) {
          getApi(store.effectiveWorkspaceId(), sess.displayName).audit
            .log('contact.erased', 'contact', c.id, { name: c.name })
            .catch(() => {});
        }
      },
    });
  };

  const detailContact = detail ? store.data.contacts.find((c) => c.id === detail.id) ?? detail : null;
  const timeline = useMemo(
    () => (detailContact ? contactTimeline(detailContact, store.data.conversations) : []),
    [detailContact, store.data.conversations],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-extrabold text-slate-900">Contacts</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your visitor CRM — {store.data.contacts.length} contacts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => {
            downloadJson(`brix-contacts-${new Date().toISOString().slice(0, 10)}.json`, filtered);
            toast.success('Contacts exported', `${filtered.length} contact${filtered.length === 1 ? '' : 's'} downloaded as JSON`);
          }}>⤓ Export JSON</Button>
          <Button onClick={() => setEditor({ contact: blankContact(), tagsText: '' })}>+ Add contact</Button>
        </div>
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
        <button
          onClick={toggleMask}
          className={cx('ml-auto px-3 py-1.5 rounded-lg border text-xs font-semibold transition',
            maskPII ? 'bg-ink-950 text-white border-ink-950' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}
          title="Display-only: mask emails and phone numbers. Data is untouched."
        >
          {maskPII ? '🙈 PII masked' : '👁 Show PII'}
        </button>
      </div>

      {mergeIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-ink-950 text-white px-4 py-2.5 flex-wrap">
          <span className="text-sm font-bold">🔀 {mergeIds.size} selected for merge</span>
          {mergeIds.size >= 2 && (
            <>
              <Select value={mergePrimary} onChange={(e) => setMergePrimary(e.target.value)} className="text-xs text-slate-900 max-w-48 py-1">
                <option value="">Keep which record?…</option>
                {[...mergeIds].map((id) => {
                  const c = store.data.contacts.find((x) => x.id === id);
                  return c ? <option key={id} value={id}>{c.name} ({c.email || 'no email'})</option> : null;
                })}
              </Select>
              <button onClick={mergeContacts} disabled={!mergePrimary}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brix-600 hover:bg-brix-500 disabled:opacity-40">
                Merge duplicates
              </button>
            </>
          )}
          <button onClick={() => { setMergeIds(new Set()); setMergePrimary(''); }} className="ml-auto text-xs text-slate-300 hover:text-white">✕ Clear</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <Card><EmptyState icon="📇" title="No contacts found" hint="Add your first contact or clear the search." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3 font-semibold w-10"></th>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Phone</th>
                  <th className="px-5 py-3 font-semibold">Country</th>
                  <th className="px-5 py-3 font-semibold">Tags</th>
                  <th className="px-5 py-3 font-semibold">Chats</th>
                  <th className="px-5 py-3 font-semibold">Last seen</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} onClick={() => setDetail(c)}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer">
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={mergeIds.has(c.id)} onChange={() => toggleMerge(c.id)}
                        className="w-4 h-4 rounded accent-brix-600" title="Select for merge" />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={c.name} size="sm" />
                        <span className="font-semibold text-slate-900">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{c.email ? (maskPII ? maskEmail(c.email) : c.email) : '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{c.phone ? (maskPII ? maskPhone(c.phone) : c.phone) : '—'}</td>
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

      {/* Detail + timeline modal */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detailContact?.name ?? 'Contact'} wide>
        {detailContact && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar name={detailContact.name} size="lg" />
              <div>
                <div className="font-semibold text-slate-900">{detailContact.email ? (maskPII ? maskEmail(detailContact.email) : detailContact.email) : 'No email'}</div>
                <div className="text-xs text-slate-500">{detailContact.phone ? (maskPII ? maskPhone(detailContact.phone) : detailContact.phone) : 'No phone'} · {detailContact.country || 'No country'}</div>
              </div>
              <div className="ml-auto flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => {
                  downloadJson(`brix-contact-${detailContact.id}.json`, { ...detailContact, timeline });
                  toast.success('Contact exported', 'Downloaded as JSON');
                }}>⤓ JSON</Button>
                <Button variant="secondary" size="sm" onClick={() => { setEditor({ contact: { ...detailContact }, tagsText: detailContact.tags.join(', ') }); setDetail(null); }}>Edit</Button>
                <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={() => erase(detailContact)}>Erase…</Button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50 p-3 text-center"><div className="text-xl font-extrabold text-slate-900">{detailContact.chats}</div><div className="text-xs text-slate-500">Chats</div></div>
              <div className="rounded-xl bg-slate-50 p-3 text-center"><div className="text-xl font-extrabold text-slate-900">{timeAgo(detailContact.lastSeen)}</div><div className="text-xs text-slate-500">Last seen</div></div>
              <div className="rounded-xl bg-slate-50 p-3 text-center"><div className="text-xl font-extrabold text-slate-900 capitalize">{detailContact.source}</div><div className="text-xs text-slate-500">Source</div></div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {detailContact.tags.map((t) => <Badge key={t} tone="indigo">#{t}</Badge>)}
              {detailContact.tags.length === 0 && <span className="text-xs text-slate-400">No tags</span>}
            </div>
            <div>
              <Label>Notes</Label>
              <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3 whitespace-pre-wrap">{detailContact.notes || 'No notes yet.'}</p>
            </div>
            <div>
              <Label>Timeline</Label>
              {timeline.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">No chats or notes recorded for this contact yet.</p>
              ) : (
                <ol className="relative border-l-2 border-slate-100 ml-1.5 space-y-4 mt-2">
                  {timeline.map((e, i) => (
                    <li key={i} className="ml-4">
                      <span className={cx('absolute -left-[7px] mt-1 w-3 h-3 rounded-full border-2 border-white', TIMELINE_DOT[e.kind])} />
                      <div className="text-sm text-slate-700">{e.text}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                        {timeAgo(e.ts)}
                        {e.kind !== 'note' && (
                          <button onClick={() => { setDetail(null); navigate(`/app?c=${e.convId}`); }}
                            className="font-semibold text-brix-600 hover:underline">Open chat →</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </Modal>

      {dialog}
    </div>
  );
}
