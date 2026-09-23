// Brix Chat — distress alert fan-out (P4-6).
// Listens for 'brix:distress' events fired by the store when a live visitor
// message trips heuristic distress detection: shows a warning toast and writes
// an audit entry. Mounted once inside AppShell.

import { useEffect, useRef } from 'react';
import { useStore } from '../../lib/store';
import { getApi } from '../../lib/api';
import { toast } from './Toasts';

interface DistressDetail {
  convId: string;
  visitor: string;
  words: string[];
}

export function DistressWatcher() {
  const store = useStore();
  const ref = useRef(store);
  ref.current = store;

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<DistressDetail>).detail;
      const s = ref.current;
      toast.warning(
        `⚠ Distress detected — ${d.visitor}`,
        d.words.length > 0
          ? `Matched: ${d.words.join(', ')} · auto-tagged “distress”, priority raised`
          : 'Heuristic sentiment signal · auto-tagged “distress”, priority raised',
      );
      const session = s.session;
      if (session) {
        getApi(s.effectiveWorkspaceId(), session.displayName).audit
          .log('distress.detected', 'conversation', d.convId, { visitor: d.visitor, words: d.words })
          .catch(() => {});
      }
    };
    window.addEventListener('brix:distress', handler);
    return () => window.removeEventListener('brix:distress', handler);
  }, []);

  return null;
}
