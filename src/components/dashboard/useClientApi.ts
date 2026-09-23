// Client-dashboard helper: an API instance scoped to the effective workspace
// (viewingWorkspaceId ?? workspaceId), so a client only ever sees their data.
import { useMemo } from 'react';
import { useStore } from '../../lib/store';
import { getApi } from '../../lib/api';
import type { BrixApi } from '../../lib/api';

export function useClientApi(): { api: BrixApi | null; workspaceId: string } {
  const { session, effectiveWorkspaceId } = useStore();
  const workspaceId = effectiveWorkspaceId();
  const api = useMemo(
    () => (session ? getApi(workspaceId, session.displayName) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, workspaceId],
  );
  return { api, workspaceId };
}
