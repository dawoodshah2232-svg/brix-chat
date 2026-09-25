// Platform admin session (operator console). Independent of the workspace
// session in lib/store — an admin can be signed in to /admin while viewing a
// client workspace in /workspace, and signing out of one never touches the other.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { adminApi } from '../lib/admin-api';
import type { AdminUser } from '../lib/admin-api';
import { userErrorFromUnknown } from '../lib/userErrors';

interface AdminAuth {
  admin: AdminUser | null;
  /** False until the stored token has been checked against the server. */
  ready: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AdminAuth | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [ready, setReady] = useState(!adminApi.hasToken());

  useEffect(() => {
    if (!adminApi.hasToken()) return;
    adminApi.me().then(setAdmin).catch(() => setAdmin(null)).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onExpired = () => setAdmin(null);
    window.addEventListener('brix:admin-auth-expired', onExpired);
    return () => window.removeEventListener('brix:admin-auth-expired', onExpired);
  }, []);

  const login = useCallback<AdminAuth['login']>(async (email, password, remember) => {
    try {
      setAdmin(await adminApi.login(email, password, remember));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: userErrorFromUnknown(e).message };
    }
  }, []);

  const logout = useCallback(async () => {
    await adminApi.logout();
    setAdmin(null);
  }, []);

  const value = useMemo(() => ({ admin, ready, login, logout }), [admin, ready, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminAuth(): AdminAuth {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdminAuth must be used inside <AdminAuthProvider>');
  return v;
}
