import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useStore } from '../lib/store';
import type { MemberRole } from '../lib/types';

export default function RoleGuard({ children, roles }: { children: ReactNode; roles: MemberRole[] }) {
  const { session } = useStore();
  if (!session) return <Navigate to="/login" replace />;
  if (!roles.includes(session.role)) return <Navigate to="/app" replace />;
  return <>{children}</>;
}
