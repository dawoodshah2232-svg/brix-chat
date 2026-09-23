// Brix Chat — skeleton loaders for data-heavy pages.

import { cx } from '../../lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />;
}

export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-3">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3 items-center">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cx('h-4', c === 0 ? 'w-10' : c === 1 ? 'flex-1' : 'w-16')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3 items-center">
          <Skeleton className="w-11 h-11 !rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/4" />
          </div>
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}
