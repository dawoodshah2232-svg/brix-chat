// Brix Chat — generic vertical activity timeline.

import type { ReactNode } from 'react';
import { cx } from '../../lib/utils';
import { timeAgo } from '../../lib/utils';

export interface TimelineEvent {
  ts: number;
  title: ReactNode;
  body?: ReactNode;
  tone?: 'indigo' | 'amber' | 'green' | 'rose' | 'slate';
  link?: ReactNode;
}

const DOT: Record<NonNullable<TimelineEvent['tone']>, string> = {
  indigo: 'bg-brix-500',
  amber: 'bg-amber-400',
  green: 'bg-emerald-500',
  rose: 'bg-rose-500',
  slate: 'bg-slate-300',
};

export function Timeline({ events, empty }: { events: TimelineEvent[]; empty?: ReactNode }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-400 py-3">{empty ?? 'Nothing here yet.'}</p>;
  }
  return (
    <ol className="relative border-l-2 border-slate-100 ml-1.5 space-y-5 mt-1">
      {events.map((e, i) => (
        <li key={i} className="ml-5 relative">
          <span
            className={cx(
              'absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm',
              DOT[e.tone ?? 'indigo'],
            )}
          />
          <div className="text-sm font-semibold text-slate-800">{e.title}</div>
          {e.body && <div className="text-[13px] text-slate-500 mt-0.5 leading-relaxed">{e.body}</div>}
          {e.link}
          <div className="text-[11px] text-slate-400 mt-1">{timeAgo(e.ts)}</div>
        </li>
      ))}
    </ol>
  );
}
