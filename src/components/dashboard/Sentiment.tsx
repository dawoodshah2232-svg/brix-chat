// Brix Chat — sentiment + quality display primitives.
// Everything shown here is a keyword heuristic: every surface labels it
// "auto estimate" so nobody mistakes it for AI analysis.

import { useMemo } from 'react';
import { analyzeSentiment, scoreConversationQuality, type QualitySentiment, type ScorableConversation } from '../../lib/quality';
import { cx } from '../../lib/utils';

export const SENTIMENT_META: Record<QualitySentiment, { emoji: string; label: string; dot: string; pill: string }> = {
  positive: { emoji: '😊', label: 'positive', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  neutral: { emoji: '😐', label: 'neutral', dot: 'bg-slate-300', pill: 'bg-slate-100 text-slate-600 ring-slate-200' },
  negative: { emoji: '😟', label: 'negative', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700 ring-amber-200' },
  frustrated: { emoji: '😠', label: 'frustrated', dot: 'bg-red-500', pill: 'bg-red-50 text-red-700 ring-red-200' },
  urgent: { emoji: '🚨', label: 'urgent', dot: 'bg-purple-500', pill: 'bg-purple-50 text-purple-700 ring-purple-200' },
};

export const AUTO_ESTIMATE = 'auto estimate — keyword heuristic, not AI';

/** Small pill showing visitor sentiment for a thread. */
export function SentimentPill({ texts, className }: { texts: string[]; className?: string }) {
  const meta = useMemo(() => SENTIMENT_META[analyzeSentiment(texts).label], [texts]);
  return (
    <span
      title={`Visitor sentiment · ${AUTO_ESTIMATE}`}
      className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', meta.pill, className)}
    >
      {meta.emoji} {meta.label}
    </span>
  );
}

/** Colored dot (compact) for visitor sentiment. */
export function SentimentDot({ texts, className }: { texts: string[]; className?: string }) {
  const sent = useMemo(() => analyzeSentiment(texts), [texts]);
  const meta = SENTIMENT_META[sent.label];
  return (
    <span
      title={`Visitor sentiment: ${sent.label} · ${AUTO_ESTIMATE}`}
      className={cx('w-2 h-2 rounded-full shrink-0', meta.dot, className)}
    />
  );
}

/** 0–100 quality score badge with tooltip breakdown. */
export function QualityBadge({ conv, className }: { conv: ScorableConversation; className?: string }) {
  const q = useMemo(() => scoreConversationQuality(conv), [conv]);
  const tone = q.score >= 75 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : q.score >= 50 ? 'bg-amber-50 text-amber-700 ring-amber-200'
    : 'bg-red-50 text-red-700 ring-red-200';
  const tip = `Quality ${q.score}/100 · ${AUTO_ESTIMATE}\n` + q.breakdown.map((b) => `${b.label}: ${b.points}/${b.max} — ${b.note}`).join('\n');
  return (
    <span
      title={tip}
      className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset', tone, className)}
    >
      ★ {q.score}
    </span>
  );
}
