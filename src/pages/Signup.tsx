// Brix Chat — signup page (passcode-based, no email).

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Button, Card, Input, Label } from '../components/ui';
import Logo from '../components/Logo';

export default function Signup() {
  const { signup } = useStore();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (passcode !== confirm) {
      setError('Passcodes do not match.');
      return;
    }
    const res = signup(workspace, displayName, passcode);
    if (res.ok) navigate('/app');
    else setError(res.error ?? 'Something went wrong.');
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
          <h1 className="font-display text-2xl font-extrabold text-slate-900 text-center">Create your workspace</h1>
          <p className="mt-2 text-sm text-slate-500 text-center">Free forever. No email, no card — just pick a passcode.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label>Workspace name</Label>
              <Input value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="acme" autoComplete="off" required />
            </div>
            <div>
              <Label>Your display name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Alex Rivera" autoComplete="name" required />
            </div>
            <div>
              <Label>Passcode (min 4 characters)</Label>
              <Input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="••••" minLength={4} autoComplete="new-password" required />
            </div>
            <div>
              <Label>Confirm passcode</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••" minLength={4} autoComplete="new-password" required />
            </div>
            {error && (
              <p role="alert" className="text-sm font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full">
              Create workspace
            </Button>
          </form>
          <p className="mt-6 text-sm text-slate-500 text-center">
            Already have a workspace?{' '}
            <Link to="/login" className="font-semibold text-brix-600 hover:underline">
              Log in
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
