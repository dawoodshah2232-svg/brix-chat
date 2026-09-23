// Brix Chat — customer ticket portal (no login): submit a request, track it by
// ticket ID + email. Portal records live in localStorage
// ('brixchat_portal_tickets_v1'); each submission is ALSO mirrored into the
// dashboard's ticket store via bridgeTicketToDashboard() — the same
// getApi(ws).tickets.create() path /app Tickets reads — so the team sees it.
// See src/lib/portal.ts for the bridge contract.

import { useState } from 'react';
import type { FormEvent } from 'react';
import { PageHero, CtaBand } from '../components/marketing';
import { Seo, jsonLdBreadcrumb } from '../lib/seo';
import { Button, Input, Label, Select, Tabs, Textarea } from '../components/ui';
import { cx, timeAgo } from '../lib/utils';
import {
  PORTAL_CATEGORIES,
  PORTAL_PRIORITIES,
  PORTAL_WORKSPACE,
  bridgeTicketToDashboard,
  findPortalTicket,
  loadPortalTickets,
  newPortalTicketId,
  savePortalTickets,
  syncTicketFromDashboard,
  timelineSteps,
} from '../lib/portal';
import type { PortalTicket } from '../lib/portal';
import { uid } from '../lib/utils';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export default function TicketPortal() {
  const [tab, setTab] = useState<'new' | 'track'>('new');

  // submit form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<string>(PORTAL_CATEGORIES[0]);
  const [priority, setPriority] = useState<PortalTicket['priority']>('medium');
  const [message, setMessage] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<PortalTicket | null>(null);

  // track form
  const [tId, setTId] = useState('');
  const [tEmail, setTEmail] = useState('');
  const [tErr, setTErr] = useState('');
  const [tBusy, setTBusy] = useState(false);
  const [found, setFound] = useState<PortalTicket | null>(null);
  const [notFound, setNotFound] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!name.trim()) { setErr('Please tell us your name.'); return; }
    if (!EMAIL_RE.test(email.trim())) { setErr('Please enter a valid email address.'); return; }
    if (!subject.trim()) { setErr('Please give your request a subject.'); return; }
    if (message.trim().length < 10) { setErr('Please describe the issue in a little more detail (10+ characters).'); return; }
    setBusy(true);
    try {
      const existing = loadPortalTickets();
      const ticket: PortalTicket = {
        id: newPortalTicketId(existing),
        workspace: PORTAL_WORKSPACE,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        subject: subject.trim(),
        category,
        priority,
        message: message.trim(),
        status: 'open',
        replies: [{
          id: uid('r'), from: 'system', at: Date.now(),
          text: 'We have received your request. A teammate will review it and update this page as it moves along.',
        }],
        source: 'portal',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      // Mirror into the dashboard's ticket store (same path /app Tickets reads).
      const dashboardId = await bridgeTicketToDashboard(ticket);
      const saved: PortalTicket = {
        ...ticket,
        dashboardTicketId: dashboardId ?? undefined,
        updatedAt: Date.now(),
      };
      savePortalTickets([saved, ...existing]);
      setCreated(saved);
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setName(''); setEmail(''); setSubject(''); setMessage('');
    setCategory(PORTAL_CATEGORIES[0]); setPriority('medium');
    setErr(''); setCreated(null);
  };

  const track = async (e: FormEvent) => {
    e.preventDefault();
    setTErr(''); setNotFound(false); setFound(null);
    if (!tId.trim() || !EMAIL_RE.test(tEmail.trim())) {
      setTErr('Enter the ticket ID we gave you and the email you used to submit it.');
      return;
    }
    setTBusy(true);
    try {
      const existing = loadPortalTickets();
      const hit = findPortalTicket(existing, tId, tEmail);
      if (!hit) { setNotFound(true); return; }
      // Pull the latest status from the dashboard ticket, if the team touched it.
      const synced = await syncTicketFromDashboard(hit);
      if (synced !== hit) {
        savePortalTickets(existing.map((x) => (x.id === synced.id ? synced : x)));
      }
      setFound(synced);
    } finally {
      setTBusy(false);
    }
  };

  const steps = found ? timelineSteps(found.status) : [];

  return (
    <main>
      <Seo
        title="Support — track your ticket"
        description="Submit a support request to the Brix Chat team and track it by ticket ID — no account needed. See your status timeline and team updates."
        path="/support"
        jsonLd={jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Support', path: '/support' }])}
      />
      <PageHero
        kicker="Support"
        title="Get help. Track your request."
        sub="Send us a request and follow its progress — no account, no login. Just keep your ticket ID."
      />

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
        <Tabs<'new' | 'track'>
          tabs={[
            { id: 'new', label: 'Submit a request' },
            { id: 'track', label: 'Track your ticket' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'new' && (
          <div className="mt-8">
            {created ? (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-10 text-center" role="status">
                <div className="text-5xl mb-4" aria-hidden>🎫</div>
                <h2 className="font-display text-2xl font-extrabold text-slate-900">Request received.</h2>
                <p className="mt-3 text-slate-600">Your ticket ID is</p>
                <div className="mt-2 inline-block rounded-2xl bg-ink-950 px-8 py-4 font-mono text-3xl font-extrabold tracking-widest text-white">
                  {created.id}
                </div>
                <p className="mt-4 text-sm text-slate-600 max-w-md mx-auto">
                  <strong>Save this ID.</strong> You will need it — plus the email you just used — to
                  track your request on the “Track your ticket” tab.
                </p>
                <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
                  <Button onClick={() => { setTId(created.id); setTEmail(created.email); setFound(null); setNotFound(false); setTab('track'); }}>
                    Track this ticket
                  </Button>
                  <Button variant="secondary" onClick={resetForm}>Submit another request</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-5">
                <div className="grid sm:grid-cols-2 gap-5">
                  <Field label="Your name">
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Cooper" autoComplete="name" />
                  </Field>
                  <Field label="Email">
                    <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" autoComplete="email" />
                  </Field>
                </div>
                <Field label="Subject">
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What can we help with?" />
                </Field>
                <div className="grid sm:grid-cols-2 gap-5">
                  <Field label="Category">
                    <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full">
                      {PORTAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  </Field>
                  <Field label="Priority">
                    <Select value={priority} onChange={(e) => setPriority(e.target.value as PortalTicket['priority'])} className="w-full capitalize">
                      {PORTAL_PRIORITIES.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
                    </Select>
                  </Field>
                </div>
                <Field label="Describe the issue">
                  <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5}
                    placeholder="What happened, what you expected, and anything you already tried…" />
                </Field>
                {err && <p className="text-sm font-medium text-rose-600" role="alert">{err}</p>}
                <Button type="submit" disabled={busy} className="w-full sm:w-auto">
                  {busy ? 'Sending…' : 'Submit request'}
                </Button>
                <p className="text-xs text-slate-400">
                  No account needed. Your request lands directly in our support queue and you can track it here any time.
                </p>
              </form>
            )}
          </div>
        )}

        {tab === 'track' && (
          <div className="mt-8">
            <form onSubmit={track} className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
              <div className="grid sm:grid-cols-2 gap-5">
                <Field label="Ticket ID">
                  <Input value={tId} onChange={(e) => setTId(e.target.value)} placeholder="BX-4821" className="font-mono uppercase" />
                </Field>
                <Field label="Email used for the request">
                  <Input value={tEmail} onChange={(e) => setTEmail(e.target.value)} placeholder="jane@company.com" autoComplete="email" />
                </Field>
              </div>
              {tErr && <p className="text-sm font-medium text-rose-600 mt-4" role="alert">{tErr}</p>}
              <Button type="submit" disabled={tBusy} className="mt-5">
                {tBusy ? 'Looking up…' : 'Track ticket'}
              </Button>
            </form>

            {notFound && (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800" role="alert">
                We couldn’t find a ticket with that ID and email. Double-check the ID from your
                confirmation screen (it looks like <span className="font-mono font-bold">BX-4821</span>) and make
                sure you’re using the same email you submitted the request with.
              </div>
            )}

            {found && (
              <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-mono text-sm font-bold text-brix-600">{found.id}</div>
                    <h2 className="font-display text-xl font-extrabold text-slate-900 mt-1">{found.subject}</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      {found.category} · Priority: <span className="capitalize font-semibold">{found.priority}</span> ·
                      opened {timeAgo(found.createdAt)}
                    </p>
                  </div>
                </div>

                {/* status timeline */}
                <div className="mt-6" aria-label="Ticket status">
                  <div className="flex items-center">
                    {steps.map((s, i) => (
                      <div key={s.id} className={cx('flex items-center', i < steps.length - 1 && 'flex-1')}>
                        <div className="flex flex-col items-center">
                          <div className={cx(
                            'w-9 h-9 rounded-full grid place-items-center text-sm font-bold border-2',
                            s.done && 'bg-emerald-500 border-emerald-500 text-white',
                            s.current && 'bg-brix-600 border-brix-600 text-white',
                            !s.done && !s.current && 'bg-white border-slate-200 text-slate-400',
                          )} aria-hidden>
                            {s.done ? '✓' : i + 1}
                          </div>
                          <div className={cx('mt-1.5 text-xs font-semibold', s.current ? 'text-brix-700' : 'text-slate-500')}>
                            {s.label}
                          </div>
                        </div>
                        {i < steps.length - 1 && (
                          <div className={cx('flex-1 h-0.5 mx-2 mb-6 rounded', s.done ? 'bg-emerald-400' : 'bg-slate-200')} aria-hidden />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* request details */}
                <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-700 whitespace-pre-wrap">
                  {found.message}
                </div>

                {/* replies (read-only) */}
                <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">Updates</h3>
                <div className="mt-3 space-y-3">
                  {found.replies.length === 0 && (
                    <p className="text-sm text-slate-400">No updates yet.</p>
                  )}
                  {found.replies.map((r) => (
                    <div key={r.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs font-bold uppercase tracking-wide text-brix-600">
                          {r.from === 'agent' ? 'Support team' : 'System'}
                        </span>
                        <span className="text-xs text-slate-400 shrink-0">{timeAgo(r.at)}</span>
                      </div>
                      <p className="mt-1.5 text-sm text-slate-700">{r.text}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-slate-400">
                  Updates appear here as our team works on your request. This thread is read-only —
                  to add information, submit a new request and mention ticket {found.id}.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <CtaBand
        title="Prefer to talk it through?"
        sub="Start a free workspace and chat with your own customers the same way."
      />
    </main>
  );
}
