// Brix Chat — client-side conversation simulation engine.
// Powers the demo visitor bot, sentiment scoring, and the AI Copilot panel.
// Everything here is rule-based simulation for the static demo build.

import type { ChatMessage } from './types';

type Sentiment = 'positive' | 'neutral' | 'negative';

const POSITIVE = ['thank', 'thanks', 'great', 'awesome', 'love', 'perfect', 'excellent', 'amazing', 'wonderful', 'helpful', 'brilliant', 'fantastic', 'good job', 'well done', 'appreciate'];
const NEGATIVE = ['angry', 'terrible', 'awful', 'hate', 'worst', 'broken', 'stupid', 'disappointed', 'frustrated', 'frustrating', 'useless', 'horrible', 'refund', 'cancel', 'scam', 'ripoff', 'never again', 'waste', 'annoying'];

export function sentimentOf(text: string): Sentiment {
  const t = text.toLowerCase();
  if (NEGATIVE.some((w) => t.includes(w))) return 'negative';
  if (POSITIVE.some((w) => t.includes(w))) return 'positive';
  return 'neutral';
}

export function threadSentiment(messages: ChatMessage[]): Sentiment {
  const visitorMsgs = messages.filter((m) => m.from === 'visitor');
  if (visitorMsgs.length === 0) return 'neutral';
  let score = 0;
  for (const m of visitorMsgs) {
    const s = sentimentOf(m.text);
    if (s === 'positive') score += 1;
    if (s === 'negative') score -= 1;
  }
  if (score > 0) return 'positive';
  if (score < 0) return 'negative';
  return 'neutral';
}

interface Rule {
  keys: string[];
  reply: string;
}

const RULES: Rule[] = [
  {
    keys: ['price', 'pricing', 'cost', 'how much', 'plan', 'subscription', 'fee'],
    reply: 'Great question! Brix Chat’s core is free forever — unlimited agents, unlimited sites and unlimited history. Paid extras are simple flat add-ons: white-label from $19/mo per account, and AI message packs from $29/mo. Want me to walk you through what’s included free?',
  },
  {
    keys: ['refund', 'money back', 'chargeback'],
    reply: 'Of course — refunds are painless here. Anything billed in the last 30 days can be refunded in full, no questions asked. Can you share the workspace name on the invoice and I’ll sort it right away?',
  },
  {
    keys: ['shipping', 'delivery', 'track', 'arrived', 'package', 'order'],
    reply: 'I can check that for you right now. Orders usually ship within 24 hours and tracking appears in your account once the courier scans the parcel. Could you share your order number?',
  },
  {
    keys: ['discount', 'coupon', 'promo', 'offer', 'deal'],
    reply: 'We’ve got you — new workspaces get 20% off any add-on for the first 3 months with code WELCOME20. It applies automatically at checkout. Anything else I can help with?',
  },
  {
    keys: ['demo', 'trial', 'test drive', 'walkthrough'],
    reply: 'Happy to show you around! I can start a guided tour right here in chat, or book you a 15-minute walkthrough with a product specialist. Which do you prefer?',
  },
  {
    keys: ['integrat', 'shopify', 'wordpress', 'api', 'webhook', 'zapier'],
    reply: 'Integrations are a strong point: one-click installers for Shopify, WordPress, Wix and Squarespace, plus a JavaScript API, webhooks for chat start/end and tickets, and a no-code automation connector. Which platform are you on?',
  },
  {
    keys: ['human', 'agent', 'real person', 'someone real', 'support person'],
    reply: 'You’re speaking with a human right now — I’m here and reading everything live. What can I help you with?',
  },
  {
    keys: ['hour', 'open', 'when are you', 'available', 'weekend'],
    reply: 'Our team is online Mon–Fri, 9:00–18:00 Gulf time, and the AI assistant covers nights and weekends instantly. If you leave a message offline we reply within a few hours.',
  },
  {
    keys: ['cancel', 'close account', 'delete account', 'unsubscribe'],
    reply: 'I’m sorry to hear that — I can cancel in one click and you keep access until the end of the billing period. Before I do, is there anything we could fix? Your feedback genuinely shapes the roadmap.',
  },
  {
    keys: ['bug', 'not working', 'error', 'broken', 'crash', 'issue', 'problem'],
    reply: 'Thanks for flagging this — let’s get it fixed. Could you tell me which page you were on and what you expected to happen? A screenshot helps too; you can attach one right here in the chat.',
  },
  {
    keys: ['thank', 'thanks', 'great', 'awesome', 'perfect'],
    reply: 'You’re very welcome! Glad I could help. If anything else comes up, just ping me here — I’m around.',
  },
  {
    keys: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'salam'],
    reply: 'Hello! Welcome — how can I help you today?',
  },
  {
    keys: ['billing', 'invoice', 'payment', 'charged', 'card'],
    reply: 'I can help with billing. Invoices live under Settings → Billing in your dashboard, and you can update the card there too. If there’s a specific charge you’re querying, share the invoice number and I’ll look into it.',
  },
  {
    keys: ['feature', 'roadmap', 'suggest'],
    reply: 'Love feature ideas — we ship weekly. Tell me what you’re trying to do and I’ll either show you the existing way or log it with the product team with your vote attached.',
  },
];

const FALLBACKS = [
  'Got it — let me look into that for you. Could you share a little more detail so I point you in exactly the right direction?',
  'Thanks for explaining. I want to make sure I give you the right answer — is this about your account, billing, or using the product?',
  'Understood. I’ve noted that down. While I check, is there anything else on your mind?',
  'Good question — the short answer is yes, that’s supported. Want me to walk you through the setup step by step?',
];

export function botReply(input: string): string {
  const t = input.toLowerCase();
  for (const rule of RULES) {
    if (rule.keys.some((k) => t.includes(k))) return rule.reply;
  }
  return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
}

/**
 * P4-18: heuristic confidence (0–100) that the bot understood the input.
 * Matched rule → 70 + 5 per extra matched keyword (cap 97).
 * No match → deterministic 20–45 derived from the input hash (honest low score).
 * This is a keyword heuristic, not AI.
 */
export function botConfidence(input: string): number {
  const t = input.toLowerCase();
  for (const rule of RULES) {
    const hits = rule.keys.filter((k) => t.includes(k)).length;
    if (hits > 0) return Math.min(97, 70 + 5 * (hits - 1));
  }
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 997;
  return 20 + (h % 26);
}

export const DEFAULT_BOT_THRESHOLD = 60;
export const DEFAULT_HANDOFF_TIMEOUT_MINS = 10;

// ---- Visitor openers (used to simulate inbound chats) ----

export const OPENERS: string[] = [
  'Hi! How much does the paid plan cost?',
  'Hey, my order hasn’t arrived yet — can you track it?',
  'Hello, do you integrate with Shopify?',
  'Hi there! Is there a free trial for the AI add-on?',
  'Hey, I was charged twice this month. Can you help?',
  'Good morning! Can I book a demo of the dashboard?',
  'Hi, I’m getting an error when I try to install the widget.',
  'Hey! Do you offer discounts for startups?',
];

export const FOLLOWUPS: string[] = [
  'That makes sense. How long does setup usually take?',
  'Perfect — and is there anything I need to prepare beforehand?',
  'Got it. Can you also tell me about the refund policy?',
  'Thanks! One more thing — does it work on mobile too?',
];

// ---- AI Copilot (simulated, rule-based) ----

export function suggestReplies(lastVisitorText: string, visitorName: string): string[] {
  const first = visitorName.split(' ')[0] || 'there';
  const base = botReply(lastVisitorText);
  const professional = `Hi ${first}, ${base.charAt(0).toLowerCase()}${base.slice(1)}`;
  const friendly = `Hey ${first}! ${base}`;
  const concise = base.split('. ')[0] + '.';
  return [professional, friendly, concise.length > 12 ? concise : base];
}

export function summarizeThread(messages: ChatMessage[], visitorName: string): string {
  const visitorMsgs = messages.filter((m) => m.from === 'visitor');
  const agentMsgs = messages.filter((m) => m.from === 'agent' || m.from === 'ai');
  const topics = new Set<string>();
  const topicKeys: Array<[string, string[]]> = [
    ['pricing & plans', ['price', 'pricing', 'cost', 'plan', 'fee', 'subscription']],
    ['billing & refunds', ['refund', 'billing', 'invoice', 'charged', 'payment']],
    ['shipping & orders', ['shipping', 'delivery', 'track', 'order', 'package']],
    ['integrations', ['integrat', 'shopify', 'wordpress', 'api', 'webhook']],
    ['technical issue', ['bug', 'error', 'broken', 'not working', 'issue']],
    ['demo request', ['demo', 'trial', 'walkthrough']],
  ];
  const all = visitorMsgs.map((m) => m.text.toLowerCase()).join(' ');
  for (const [label, keys] of topicKeys) {
    if (keys.some((k) => all.includes(k))) topics.add(label);
  }
  const sentiment = threadSentiment(messages);
  const firstAsk = visitorMsgs[0]?.text ?? '—';
  return [
    `Summary for ${visitorName}:`,
    `• ${visitorMsgs.length} visitor message${visitorMsgs.length === 1 ? '' : 's'}, ${agentMsgs.length} agent/AI repl${agentMsgs.length === 1 ? 'y' : 'ies'}.`,
    `• Topics: ${topics.size ? [...topics].join(', ') : 'general enquiry'}.`,
    `• Visitor sentiment: ${sentiment}.`,
    `• Opening ask: “${firstAsk.length > 90 ? firstAsk.slice(0, 90) + '…' : firstAsk}”`,
  ].join('\n');
}

export type Tone = 'professional' | 'friendly' | 'concise';

export function rewriteTone(text: string, tone: Tone, visitorName = 'there'): string {
  const first = visitorName.split(' ')[0] || 'there';
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (tone === 'concise') {
    const firstSentence = trimmed.split('. ')[0];
    return firstSentence.endsWith('.') ? firstSentence : firstSentence + '.';
  }
  if (tone === 'friendly') {
    return `Hey ${first}! ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)} Let me know if you need anything else 😊`;
  }
  return `Hi ${first}, ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)} Please let me know if I can help further.`;
}

// Simulated translation (demo): prefix marker. Real product would call a translation API.
export function fakeTranslate(text: string, lang: string): string {
  return `[${lang}] ${text}`;
}
