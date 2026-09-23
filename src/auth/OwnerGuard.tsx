// Platform-admin-only guard. The platform console (/admin) is a separate
// product from the client dashboard (/app): only owner-role sessions
// (isPlatformAdmin) may enter.
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useStore } from '../lib/store';

export default function OwnerGuard({ children }: { children: ReactNode }) {
  const { session } = useStore();
  if (!session) return <Navigate to="/login" replace />;
  if (!session.isPlatformAdmin) return <Navigate to="/app" replace />;
  return <>{children}</>;
}
