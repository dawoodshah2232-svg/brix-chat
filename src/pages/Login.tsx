// Brix Chat — login page (passcode-based, per-member login).

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Button, Card, Input, Label, Select } from '../components/ui';
import Logo from '../components/Logo';

export default function Login() {
  const { login, knownWorkspaces } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [workspace, setWorkspace] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await login(workspace, passcode, { displayName, rememberMe });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Something went wrong.');
      return;
    }
    const from = (location.state as { from?: string } | null)?.from;
    if (from && from !== '/login' && from !== '/signup') {
      navigate(from);
      return;
    }
    // Role-based landing is handled by the store session once refreshed;
    // default guess: admins go to /admin, everyone else to the inbox.
    const role = res.role;
    navigate(role === 'admin' || role === 'developer' ? '/admin' : '/app');
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
          <p className="mt-2 text-sm text-slate-500 text-center">Log in to your workspace to open the dashboard.</p>
          <div className="mt-5 rounded-2xl border border-aqua-500/30 bg-aqua-500/5 px-4 py-3.5 text-sm text-slate-700">
            <span className="font-semibold text-aqua-700">Try the demo</span> — workspace <code className="font-mono font-semibold">demo</code>, passcode{' '}
            <code className="font-mono font-semibold">3456</code>
          </div>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <Label>Workspace name</Label>
              {knownWorkspaces.length > 1 ? (
                <Select value={workspace} onChange={(e) => setWorkspace(e.target.value)} className="w-full" required>
                  <option value="">Select a workspace…</option>
                  {knownWorkspaces.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </Select>
              ) : (
                <Input value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="demo" autoComplete="off" list="brix-workspaces" required />
              )}
              <datalist id="brix-workspaces">
                {knownWorkspaces.map((w) => <option key={w} value={w} />)}
              </datalist>
            </div>
            <div>
              <Label>Your name <span className="text-slate-400 font-normal">(optional — speeds up login)</span></Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Demo Agent" autoComplete="name" />
            </div>
            <div>
              <Label>Passcode</Label>
              <Input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="••••" autoComplete="current-password" required />
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
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
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
