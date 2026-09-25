// Brix Chat — login: email/username + passcode. Workspace is resolved from the account.

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { getPhpApi, isPhpApiEnabled } from '../lib/php-client';
import { Button, Card, Input, Label, PasswordInput } from '../components/ui';
import { userErrorMessage } from '../lib/userErrors';
import Logo from '../components/Logo';

interface WorkspaceHit {
  slug: string;
  name: string;
  displayName?: string;
}

export default function Login() {
  const { login } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [identity, setIdentity] = useState('');
  const [workspace, setWorkspace] = useState<WorkspaceHit | null>(null);
  const [lookupState, setLookupState] = useState<'idle' | 'checking' | 'found' | 'missing' | 'error'>('idle');
  const [passcode, setPasscode] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = identity.trim();
    setError('');
    setWorkspace(null);
    if (q.length < 2) {
      setLookupState('idle');
      return;
    }
    if (!isPhpApiEnabled()) {
      setLookupState('error');
      return;
    }
    setLookupState('checking');
    const timer = window.setTimeout(async () => {
      try {
        const api = getPhpApi();
        const res = api ? await api.auth.lookup(q) : { found: false };
        if (!res.found || !res.workspace) {
          setLookupState('missing');
          return;
        }
        setWorkspace({
          slug: String(res.workspace.slug ?? ''),
          name: String(res.workspace.name ?? res.workspace.slug ?? ''),
          displayName: res.member?.display_name ? String(res.member.display_name) : undefined,
        });
        setLookupState('found');
      } catch {
        setLookupState('error');
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [identity]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!workspace?.slug) {
      setError(userErrorMessage('accountNotFound'));
      return;
    }
    setBusy(true);
    setError('');
    const res = await login(workspace.slug, passcode, { displayName: identity, rememberMe });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? userErrorMessage('generic'));
      return;
    }
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from.startsWith('/workspace') ? from : '/workspace/dashboard');
  };

  return (
    <main className="min-h-screen bg-ink-950 relative overflow-hidden flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-brix-600/25 blur-[140px]" />
        <div className="absolute -bottom-32 -right-32 w-[480px] h-[480px] rounded-full bg-aqua-500/15 blur-[140px]" />
      </div>
      <div className="relative w-full max-w-md">
        <Link to="/" className="flex justify-center mb-8" aria-label="Back to home">
          <Logo dark />
        </Link>
        <Card className="p-8">
          <h1 className="font-display text-2xl font-extrabold text-slate-900 text-center">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-500 text-center">Log in with your email or username and passcode.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label>Email or username</Label>
              <Input value={identity} onChange={(e) => setIdentity(e.target.value)} placeholder="alex@example.com or Alex Rivera" autoComplete="username" required />
              <div className="mt-2 min-h-7">
                {lookupState === 'checking' && <span className="text-xs font-semibold text-slate-500">Checking workspace…</span>}
                {lookupState === 'found' && workspace && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Workspace: {workspace.name || workspace.slug}
                  </span>
                )}
                {lookupState === 'missing' && <span className="text-xs font-semibold text-rose-600">{userErrorMessage('accountNotFound')}</span>}
                {lookupState === 'error' && <span className="text-xs font-semibold text-amber-600">{userErrorMessage('accountLookupUnavailable')}</span>}
              </div>
            </div>
            <div>
              <Label>Passcode</Label>
              <PasswordInput value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="••••" autoComplete="current-password" required />
            </div>
            <label className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded accent-brix-600"
              />
              Remember me on this device
            </label>
            {error && (
              <p role="alert" className="text-sm font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={busy || lookupState !== 'found'}>
              {busy ? 'Logging in…' : 'Log in'}
            </Button>
          </form>
          <p className="mt-6 text-sm text-slate-500 text-center">
            New here?{' '}
            <Link to="/signup" className="font-semibold text-brix-600 hover:underline">
              Create a workspace
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}





