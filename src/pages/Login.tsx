// Brix Chat — login: workspace name + passcode.
// demo / 3456 → platform owner → /admin · acme / 7890 → Acme Store client → /app.

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Button, Card, Input, Label } from '../components/ui';
import Logo from '../components/Logo';

export default function Login() {
  const { login, knownWorkspaces } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [workspace, setWorkspace] = useState(knownWorkspaces[0] ?? '');
  const [displayName, setDisplayName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const fillDemo = (w: string, p: string) => {
    setWorkspace(w);
    setPasscode(p);
    setError('');
  };

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
    if (res.isPlatformAdmin) {
      navigate(from && from.startsWith('/admin') ? from : '/admin');
      return;
    }
    if (from && from.startsWith('/app')) {
      navigate(from);
      return;
    }
    navigate('/app');
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
          <p className="mt-2 text-sm text-slate-500 text-center">Log in with your workspace name and passcode.</p>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fillDemo('demo', '3456')}
              className="rounded-2xl border border-aqua-500/30 bg-aqua-500/5 px-4 py-3 text-left text-sm text-slate-700 hover:border-aqua-500/60 transition"
            >
              <span className="block font-semibold text-aqua-700">Platform demo</span>
              <span className="font-mono text-xs">demo · 3456</span>
              <span className="block text-xs text-slate-400 mt-0.5">Owner → admin console</span>
            </button>
            <button
              type="button"
              onClick={() => fillDemo('acme', '7890')}
              className="rounded-2xl border border-brix-500/30 bg-brix-500/5 px-4 py-3 text-left text-sm text-slate-700 hover:border-brix-500/60 transition"
            >
              <span className="block font-semibold text-brix-700">Client demo</span>
              <span className="font-mono text-xs">acme · 7890</span>
              <span className="block text-xs text-slate-400 mt-0.5">Acme Store → dashboard</span>
            </button>
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <Label>Workspace name</Label>
              <Input
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                placeholder="demo"
                autoComplete="off"
                list="brix-workspaces"
                required
              />
              <datalist id="brix-workspaces">
                {knownWorkspaces.map((w) => <option key={w} value={w} />)}
              </datalist>
              {knownWorkspaces.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {knownWorkspaces.slice(0, 4).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWorkspace(w)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                        workspace === w ? 'bg-brix-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Your name <span className="text-slate-400 font-normal">(optional — speeds up login)</span></Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ava Client" autoComplete="name" />
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
