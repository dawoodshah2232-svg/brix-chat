// Brix Chat — contact page (form saved via api.contactMessages.create, admin inbox).

import { useState } from 'react';
import type { FormEvent } from 'react';
import { getApi, ApiError } from '../lib/api';
import { useStore } from '../lib/store';
import { asP2 } from '../lib/contentSeed';
import { Seo, jsonLdBreadcrumb } from '../lib/seo';
import { PageHero } from '../components/marketing';

export default function Contact() {
  const { session } = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('General question');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const p2 = asP2(getApi(session?.workspaceId ?? 'demo', name || 'web'));
      await p2.contactMessages.create({ name: name.trim(), email: email.trim(), subject, message: message.trim() });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong sending your message.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <Seo
        title="Contact — Brix Chat"
        description="Get in touch with the Brix Chat team: questions, feedback, partnerships, or support for your workspace."
        path="/contact"
        jsonLd={jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Contact', path: '/contact' }])}
      />
      <PageHero
        kicker="Contact"
        title="Talk to a human."
        sub="Questions, feedback, partnership ideas — we read everything."
      />

      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-16">
        {sent ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-10 text-center" role="status">
            <div className="text-5xl mb-4" aria-hidden>✉️</div>
            <h2 className="font-display text-2xl font-extrabold text-slate-900">Message received.</h2>
            <p className="mt-3 text-slate-600">
              Thanks, {name.split(' ')[0] || 'there'} — your note is in our inbox. We reply to every message,
              usually within one business day.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm space-y-5">
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="ct-name" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Name</label>
                <input id="ct-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Your name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-brix-500/40 focus:border-brix-500" />
              </div>
              <div>
                <label htmlFor="ct-email" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Email</label>
                <input id="ct-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-brix-500/40 focus:border-brix-500" />
              </div>
            </div>
            <div>
              <label htmlFor="ct-subject" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Subject</label>
              <select id="ct-subject" value={subject} onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-brix-500/40 focus:border-brix-500">
                {['General question', 'Support', 'Sales', 'Partnership', 'Press', 'Security report', 'Legal'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ct-message" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Message</label>
              <textarea id="ct-message" value={message} onChange={(e) => setMessage(e.target.value)} required rows={6}
                placeholder="How can we help?"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-brix-500/40 focus:border-brix-500" />
            </div>
            {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-brix-600 to-aqua-500 text-white font-semibold hover:opacity-90 transition disabled:opacity-50">
              {busy ? 'Sending…' : 'Send message'}
            </button>
            <p className="text-xs text-slate-400 text-center">
              In local mode your message is stored in this browser's demo workspace and visible in Admin → Content → Inbox.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
