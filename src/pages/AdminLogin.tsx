import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../auth/AdminAuth';
import { Button, Card, Input, Label, PasswordInput } from '../components/ui';
import Logo from '../components/Logo';

export default function AdminLogin() {
  const { admin, ready, login } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (ready && admin) return <Navigate to="/admin" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await login(email, password, rememberMe);
    setBusy(false);
    if (!res.ok) {
      setError(res.error === undefined || /passcode/.test(res.error) ? 'Invalid admin email or password.' : res.error);
      return;
    }
    navigate('/admin', { replace: true });
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
          <h1 className="font-display text-2xl font-extrabold text-slate-900 text-center">Platform admin</h1>
          <p className="mt-2 text-sm text-slate-500 text-center">Log in with your admin email and password.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" autoComplete="email" required />
            </div>
            <div>
              <Label>Password</Label>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" required />
            </div>
            <label className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-4 h-4 rounded accent-brix-600" />
              Remember me on this device
            </label>
            {error && <p role="alert" className="text-sm font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Logging in...' : 'Log in'}</Button>
          </form>
          <p className="mt-6 text-sm text-slate-500 text-center">
            Workspace user? <Link to="/login" className="font-semibold text-brix-600 hover:underline">Go to workspace login</Link>
          </p>
        </Card>
      </div>
    </main>
  );
}

