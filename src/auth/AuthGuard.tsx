import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useStore } from '../lib/store';

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { session } = useStore();
  const loc = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}
