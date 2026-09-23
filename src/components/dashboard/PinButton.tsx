// Brix Chat — pin button + pinned-section helpers (Conversation Operations pack).

import { useStore } from '../../lib/store';
import { usePins } from '../../lib/conversations';
import { cx } from '../../lib/utils';

export function PinButton({ conversationId }: { conversationId: string }) {
  const { effectiveWorkspaceId } = useStore();
  const { isPinned, toggle } = usePins(effectiveWorkspaceId());
  const pinned = isPinned(conversationId);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggle(conversationId); }}
      title={pinned ? 'Unpin conversation' : 'Pin conversation'}
      aria-label={pinned ? 'Unpin conversation' : 'Pin conversation'}
      className={cx(
        'w-7 h-7 grid place-items-center rounded-lg text-sm transition',
        pinned ? 'text-brix-600' : 'text-slate-300 hover:bg-slate-100 hover:text-brix-500',
      )}
    >
      {pinned ? '📌' : '📍'}
    </button>
  );
}

/** Split a sorted list into [pinned, rest] for the inbox. */
export function splitPinned<T extends { id: string }>(list: T[], pinnedIds: string[]): [T[], T[]] {
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const c of list) (pinnedIds.includes(c.id) ? pinned : rest).push(c);
  return [pinned, rest];
}
