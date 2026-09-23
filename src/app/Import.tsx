// Brix Chat — "Migrate from another chat tool": CSV importer.
// Two tabs (Contacts, Conversations): upload → column mapping → preview →
// import. Contacts merge by email; conversations are grouped by visitor and
// appended as closed, read-only historical records tagged 'imported'.
// Contacts go through store.saveContact (the same store Contacts.tsx reads);
// conversations are created with store.newProactiveChat + store.updateConversation
// (the store exposes no raw "add conversation", so the public API is used and
// the record is immediately rewritten as closed/imported).

import { useState } from 'react';
import { useStore } from '../lib/store';
import type { ChatMessage, Contact } from '../lib/types';
import { uid } from '../lib/utils';
import { Button, Card, Label, PageHeader, SectionCard, Select, Tabs } from '../components/ui';
import { toast } from '../components/dashboard/Toasts';

type Tab = 'contacts' | 'conversations';

interface FieldDef { key: string; label: string; hint?: string }

const CONTACT_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'country', label: 'Country' },
  { key: 'tags', label: 'Tags', hint: 'comma or semicolon separated' },
  { key: 'notes', label: 'Notes' },
];

const CONV_FIELDS: FieldDef[] = [
  { key: 'visitor', label: 'Visitor name' },
  { key: 'message', label: 'Message' },
  { key: 'timestamp', label: 'Timestamp', hint: 'any format Date.parse understands' },
  { key: 'agent', label: 'Agent name', hint: 'blank = the visitor said it' },
];

/** Tiny built-in CSV parser: quotes, escaped quotes, commas and newlines inside quotes. No deps. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c === '\r') {
      /* skip */
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Best-effort auto-mapping: exact match, then "contains the field key". */
function autoMap(fields: FieldDef[], headers: string[]): Record<string, string> {
  const m: Record<string, string> = {};
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const f of fields) {
    const exact = lower.indexOf(f.key);
    if (exact !== -1) { m[f.key] = headers[exact]; continue; }
    const partial = lower.findIndex((h) => h.includes(f.key));
    if (partial !== -1) m[f.key] = headers[partial];
  }
  return m;
}

const SAMPLE_CONTACTS = 'name,email,phone,country,tags,notes\nAyesha Khan,ayesha@example.com,+971501234567,UAE,vip;newsletter,Met at the Dubai expo\nOmar Farouk,omar@example.com,+201012345678,Egypt,,Asked about bulk pricing\n';
const SAMPLE_CONVS = 'visitor,message,timestamp,agent\nAyesha Khan,Do you offer bulk pricing?,2026-09-20T10:15:00,\nAyesha Khan,Yes — 10+ seats get 15% off.,2026-09-20T10:16:00,Layla\nOmar Farouk,Is there a free plan?,2026-09-21T09:02:00,\n';

function downloadSample(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

interface ImportResult {
  kind: Tab;
  total: number;
  created: number;
  merged: number;
  skipped: number;
}

export default function Import() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>('contacts');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileErr, setFileErr] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const fields = tab === 'contacts' ? CONTACT_FIELDS : CONV_FIELDS;

  const switchTab = (t: Tab) => {
    setTab(t); setFileName(''); setHeaders([]); setRows([]);
    setMapping({}); setFileErr(''); setResult(null);
  };

  const onFile = (f: File | undefined) => {
    setFileErr(''); setResult(null);
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseCsv(String(reader.result ?? ''));
        if (parsed.length < 2) { setFileErr('That file has no data rows — it needs a header row plus at least one row of data.'); return; }
        if (parsed.length > 5001) { setFileErr('That file is too large for a browser import (max 5,000 rows). Split it and try again.'); return; }
        const [head, ...data] = parsed;
        setHeaders(head.map((h) => h.trim()));
        setRows(data);
        setFileName(f.name);
        setMapping(autoMap(fields, head.map((h) => h.trim())));
      } catch {
        setFileErr('Could not read that file. Make sure it is a valid CSV.');
      }
    };
    reader.onerror = () => setFileErr('Could not read that file.');
    reader.readAsText(f);
  };

  const cell = (r: string[], fieldKey: string): string => {
    const h = mapping[fieldKey];
    if (!h) return '';
    const i = headers.indexOf(h);
    return (r[i] ?? '').trim();
  };

  const mappedFields = fields.filter((f) => mapping[f.key]);
  const previewRows = rows.slice(0, 5);

  const importContacts = () => {
    let created = 0, merged = 0, skipped = 0;
    const byEmail = new Map<string, Contact>();
    store.data.contacts.forEach((c) => {
      const e = c.email.trim().toLowerCase();
      if (e && !byEmail.has(e)) byEmail.set(e, c);
    });
    for (const r of rows) {
      const name = cell(r, 'name');
      const email = cell(r, 'email').toLowerCase();
      if (!name && !email) { skipped++; continue; }
      const phone = cell(r, 'phone');
      const country = cell(r, 'country');
      const tags = [...new Set(cell(r, 'tags').split(/[,;]/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
      const notes = cell(r, 'notes');
      const existing = email ? byEmail.get(email) : undefined;
      if (existing) {
        store.saveContact({
          ...existing,
          name: existing.name || name,
          phone: existing.phone || phone,
          country: existing.country || country,
          tags: [...new Set([...existing.tags, ...tags])],
          notes: notes ? (existing.notes ? `${existing.notes}\n\n— imported —\n${notes}` : notes) : existing.notes,
          lastSeen: Date.now(),
        });
        merged++;
      } else {
        const c: Contact = {
          id: uid('ct'),
          name: name || email,
          email,
          phone,
          country,
          tags,
          notes,
          chats: 0,
          lastSeen: Date.now(),
          source: 'imported',
        };
        store.saveContact(c);
        if (email) byEmail.set(email, c);
        created++;
      }
    }
    return { created, merged, skipped };
  };

  const importConversations = () => {
    let convCount = 0, msgCount = 0, skipped = 0;
    const groups = new Map<string, { name: string; msgs: Array<{ text: string; ts: number; agent: string }> }>();
    rows.forEach((r, ri) => {
      const text = cell(r, 'message');
      if (!text) { skipped++; return; }
      const visitor = cell(r, 'visitor') || 'Imported visitor';
      const rawTs = cell(r, 'timestamp');
      let ts = Date.parse(rawTs);
      if (Number.isNaN(ts)) ts = Date.now() - (rows.length - ri) * 60000; // keep file order when no timestamp
      const agent = cell(r, 'agent');
      const key = visitor.toLowerCase();
      if (!groups.has(key)) groups.set(key, { name: visitor, msgs: [] });
      groups.get(key)!.msgs.push({ text, ts, agent });
    });
    const now = Date.now();
    groups.forEach((g) => {
      const sorted = g.msgs.sort((a, b) => a.ts - b.ts);
      const messages: ChatMessage[] = sorted.map((m) => ({
        id: uid('m'),
        from: m.agent ? 'agent' : 'visitor',
        kind: 'text',
        text: m.text,
        ts: m.ts,
        ...(m.agent ? { name: m.agent } : {}),
      }));
      // The store exposes no raw "add conversation": create via the public
      // proactive-chat API, then immediately rewrite it as a closed record.
      const id = store.newProactiveChat('', '');
      store.updateConversation(id, {
        visitor: g.name,
        country: '',
        city: '',
        page: 'imported',
        device: 'CSV import',
        status: 'closed',
        live: false,
        aiHandled: false,
        tags: ['imported'],
        messages,
        notes: [],
        unread: 0,
        createdAt: sorted[0]?.ts ?? now,
        agent: sorted.find((m) => m.agent)?.agent,
      });
      convCount++;
      msgCount += messages.length;
    });
    return { created: convCount, merged: msgCount, skipped };
  };

  const doImport = () => {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      const { created, merged, skipped } = tab === 'contacts' ? importContacts() : importConversations();
      setResult({ kind: tab, total: rows.length, created, merged, skipped });
      toast.success(tab === 'contacts' ? `Imported ${created} new, merged ${merged}` : `Imported ${created} conversations (${merged} messages)`);
    } catch {
      toast.error('Import failed — nothing was changed.');
    }
    setImporting(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Import"
        subtitle="Migrate from another chat tool: bring contacts and past conversations in from a CSV export."
      />

      <Tabs<Tab>
        tabs={[
          { id: 'contacts', label: 'Contacts CSV' },
          { id: 'conversations', label: 'Conversations CSV' },
        ]}
        active={tab}
        onChange={switchTab}
      />

      <div className="mt-6 space-y-6">
        <SectionCard
          title="1 · Upload your CSV"
          subtitle={tab === 'contacts'
            ? 'One row per contact. We match columns to fields in the next step.'
            : 'One row per message. Messages are grouped by visitor name.'}
          action={
            <button
              onClick={() => downloadSample(tab === 'contacts' ? 'contacts-sample.csv' : 'conversations-sample.csv', tab === 'contacts' ? SAMPLE_CONTACTS : SAMPLE_CONVS)}
              className="text-xs font-semibold text-brix-600 hover:underline"
            >
              ⬇ Download a sample CSV
            </button>
          }
        >
          <label className="block rounded-2xl border-2 border-dashed border-slate-200 hover:border-brix-300 transition p-8 text-center cursor-pointer">
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <div className="text-3xl mb-2" aria-hidden>📄</div>
            <div className="text-sm font-semibold text-slate-700">
              {fileName ? <span className="font-mono">{fileName}</span> : 'Choose a CSV file'}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {rows.length > 0 ? `${rows.length.toLocaleString()} data rows ready` : 'Max 5,000 rows · everything stays in your browser'}
            </div>
          </label>
          {fileErr && <p className="text-sm font-medium text-rose-600 mt-3" role="alert">{fileErr}</p>}
        </SectionCard>

        {rows.length > 0 && (
          <>
            <SectionCard title="2 · Map your columns" subtitle="Tell us which of your columns holds each field. Unmapped fields are skipped.">
              <div className="grid sm:grid-cols-2 gap-4">
                {fields.map((f) => (
                  <div key={f.key}>
                    <Label>{f.label}{f.hint ? <span className="font-normal text-slate-400"> — {f.hint}</span> : null}</Label>
                    <Select
                      value={mapping[f.key] ?? ''}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                      className="w-full mt-1"
                    >
                      <option value="">— ignore —</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </Select>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="3 · Preview" subtitle="First 5 rows, mapped columns only.">
              {mappedFields.length === 0 ? (
                <p className="text-sm text-slate-400">Map at least one column above to see a preview.</p>
              ) : (
                <div className="overflow-x-auto slim-scroll">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                        {mappedFields.map((f) => <th key={f.key} className="px-3 py-2 font-bold whitespace-nowrap">{f.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          {mappedFields.map((f) => (
                            <td key={f.key} className="px-3 py-2 text-slate-700 max-w-56 truncate" title={cell(r, f.key)}>
                              {cell(r, f.key) || <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard title="4 · Import">
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-600 space-y-1.5">
                {tab === 'contacts' ? (
                  <>
                    <p>✓ New rows become contacts (source: “imported”).</p>
                    <p>✓ <strong>Merge by email:</strong> if a contact with the same email already exists, we fill in blanks and combine tags and notes instead of creating a duplicate.</p>
                    <p>✓ Rows with neither a name nor an email are skipped.</p>
                  </>
                ) : (
                  <>
                    <p>✓ Each visitor’s messages become <strong>one closed conversation</strong> tagged <span className="font-mono text-xs bg-slate-200/60 px-1.5 py-0.5 rounded">imported</span>.</p>
                    <p>✓ <strong>Read-only history:</strong> message history maps to historical records — original timestamps are kept where your export had them, and agents can’t reply to imported records. They’re history, not live chats.</p>
                    <p>✓ Rows with no message text are skipped.</p>
                  </>
                )}
              </div>
              <div className="mt-4">
                <Button onClick={doImport} disabled={importing || mappedFields.length === 0}>
                  {importing ? 'Importing…' : `Import ${rows.length.toLocaleString()} rows`}
                </Button>
              </div>
              {result && (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5" role="status">
                  <div className="font-bold text-emerald-800">Import complete</div>
                  <div className="mt-1.5 text-sm text-emerald-700">
                    {result.kind === 'contacts' ? (
                      <>Created <strong>{result.created}</strong> new contacts · merged <strong>{result.merged}</strong> by email · skipped <strong>{result.skipped}</strong> of {result.total} rows.</>
                    ) : (
                      <>Imported <strong>{result.created}</strong> conversations with <strong>{result.merged}</strong> messages · skipped <strong>{result.skipped}</strong> of {result.total} rows.</>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-emerald-600">
                    {result.kind === 'contacts'
                      ? 'See them in Contacts — imported rows carry the source “imported”.'
                      : 'See them in the Inbox — imported conversations are closed and tagged “imported”.'}
                  </div>
                </div>
              )}
            </SectionCard>
          </>
        )}

        {rows.length === 0 && (
          <Card>
            <div className="text-sm text-slate-500 leading-relaxed">
              <strong className="text-slate-700">How it works.</strong> Export contacts or
              conversations from your current chat tool as CSV, upload the file, map its columns
              to Brix Chat fields, check the preview, then import. Nothing leaves your browser —
              this is a local demo import into your workspace data.
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
