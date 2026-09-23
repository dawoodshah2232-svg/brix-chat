// Brix Chat — contextual reply-suggestion engine (P4-8).
//
// Rule-based and fully local: matches the visitor's latest message against
// published KB articles, canned replies and intent patterns, then falls back
// to tone rewrites of the simulated draft answer. The Copilot UI labels these
// as simulated — this module never claims AI.

import type { Article, Canned, ChatMessage } from './types';
import { botReply, rewriteTone, type Tone } from './bot';
import { uid } from './utils';

export type SuggestionSource = 'kb' | 'canned' | 'followup' | 'tone';

export interface ReplySuggestion {
  id: string;
  text: string;
  source: SuggestionSource;
  /** Human label shown on the card, e.g. "Help center · Shipping & delivery". */
  label: string;
}

export interface SuggestContext {
  visitorName: string;
  department?: string;
  messages: ChatMessage[];
  canned: Canned[];
  articles: Article[];
}

const STOP = new Set(
  'the a an and or of to in on for with is are was were it this that what how do does did can could would should i you we they he she my your our their me him her them as at by from be been have has had will shall may might must not no yes if then than so but all any more most other some such only own same too very'.split(' '),
);

function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

function overlapScore(a: string[], b: string[]): number {
  const bs = new Set(b);
  let s = 0;
  for (const w of a) if (bs.has(w)) s += 1;
  return s;
}

interface Followup {
  keys: string[];
  label: string;
  make: (firstName: string) => string;
}

const FOLLOWUPS: Followup[] = [
  {
    keys: ['price', 'pricing', 'cost', 'plan', 'much', 'fee'],
    label: 'Pricing follow-up',
    make: (n) => `Would you like me to walk you through which option fits best, ${n}?`,
  },
  {
    keys: ['refund', 'return', 'exchange'],
    label: 'Refund follow-up',
    make: () => 'I can start that right away — shall I go ahead?',
  },
  {
    keys: ['ship', 'deliver', 'track', 'order', 'package', 'courier'],
    label: 'Order follow-up',
    make: () => 'If you share the order number I’ll check the live status for you right now.',
  },
  {
    keys: ['demo', 'trial', 'walkthrough'],
    label: 'Demo follow-up',
    make: (n) => `Happy to set that up, ${n} — what day works for a quick walkthrough?`,
  },
  {
    keys: ['cancel', 'close account', 'unsubscribe'],
    label: 'Retention',
    make: () => 'I’m sorry to hear that — is there anything I can do to change your mind before we proceed?',
  },
  {
    keys: ['thank', 'thanks', 'great', 'perfect', 'awesome', 'helpful'],
    label: 'Warm closing',
    make: (n) => `Glad I could help, ${n}! Anything else I can do for you today?`,
  },
];

const TONE_LABEL: Record<Tone, string> = {
  professional: 'Professional draft',
  friendly: 'Friendly draft',
  concise: 'Concise draft',
};

/** Ranked, contextual reply suggestions for the agent. Max 6. */
export function suggestReplies(ctx: SuggestContext): ReplySuggestion[] {
  const out: ReplySuggestion[] = [];
  const first = ctx.visitorName.split(' ')[0] || 'there';
  const visitorTexts = ctx.messages.filter((m) => m.from === 'visitor').map((m) => m.text);
  const last = visitorTexts[visitorTexts.length - 1] ?? '';
  if (!last.trim()) return out;
  const keys = keywords(last);
  const low = last.toLowerCase();

  // 1. Published KB articles by keyword overlap.
  const articles = ctx.articles
    .filter((a) => a.status === 'published')
    .map((a) => ({ a, s: overlapScore(keys, keywords(`${a.title} ${a.body}`)) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, 2);
  for (const { a } of articles) {
    const excerpt = a.body.split('\n')[0].slice(0, 160).trim();
    out.push({
      id: uid('sg'),
      source: 'kb',
      label: `Help center · ${a.title}`,
      text: `Hi ${first}! ${excerpt}${excerpt.length >= 160 ? '…' : ''}`,
    });
  }

  // 2. Canned replies by keyword overlap ({{name}} filled in).
  const canned = ctx.canned
    .map((c) => ({ c, s: overlapScore(keys, keywords(`${c.title} ${c.body} ${c.shortcut}`)) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, 2);
  for (const { c } of canned) {
    out.push({
      id: uid('sg'),
      source: 'canned',
      label: `Canned · ${c.shortcut}`,
      text: c.body.replace(/\{\{\s*name\s*\}\}/gi, first),
    });
  }

  // 3. One intent-based follow-up question.
  for (const f of FOLLOWUPS) {
    if (f.keys.some((k) => low.includes(k))) {
      out.push({ id: uid('sg'), source: 'followup', label: f.label, text: f.make(first) });
      break;
    }
  }

  // 4. Tone rewrites of the simulated draft answer (always available).
  const base = botReply(last);
  (Object.keys(TONE_LABEL) as Tone[]).forEach((t) => {
    if (out.length >= 6) return;
    out.push({ id: uid('sg'), source: 'tone', label: TONE_LABEL[t], text: rewriteTone(base, t, ctx.visitorName) });
  });

  return out.slice(0, 6);
}
