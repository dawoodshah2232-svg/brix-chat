// Platform-admin-only guard for /admin. Uses the separate admin session
// (AdminAuth), never the workspace session.
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAdminAuth } from './AdminAuth';

export default function OwnerGuard({ children }: { children: ReactNode }) {
  const { admin, ready } = useAdminAuth();
  if (!ready) {
    return <div className="min-h-screen grid place-items-center bg-slate-50 text-sm text-slate-500">Checking session…</div>;
  }
  if (!admin) return <Navigate to="/admin-login" replace />;
  return <>{children}</>;
}
