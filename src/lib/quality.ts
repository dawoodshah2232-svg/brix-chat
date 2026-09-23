// Brix Chat — heuristic conversation sentiment + quality scoring.
//
// IMPORTANT: this is a keyword/signals heuristic, NOT AI or ML. Every UI
// surface that shows these values must label them "auto estimate".

export type QualitySentiment = 'positive' | 'neutral' | 'negative' | 'frustrated' | 'urgent';

export interface SentimentResult {
  label: QualitySentiment;
  /** -100 (very negative) .. +100 (very positive) */
  score: number;
  hits: string[];
}

export interface QualityBreakdown {
  label: string;
  points: number;
  max: number;
  note: string;
}

export interface QualityScore {
  /** 0..100 */
  score: number;
  breakdown: QualityBreakdown[];
}

// ---- editable lexicon -------------------------------------------------------
// Keep words lowercase; matching is substring on lowercased text.

export const LEXICON: Record<Exclude<QualitySentiment, 'neutral'>, string[]> = {
  positive: [
    'thank', 'thanks', 'great', 'awesome', 'love', 'perfect', 'excellent', 'amazing',
    'wonderful', 'helpful', 'brilliant', 'fantastic', 'appreciate', 'glad', 'pleased',
    'impressive', 'superb', 'thumbs up',
  ],
  negative: [
    'angry', 'terrible', 'awful', 'hate', 'worst', 'broken', 'stupid', 'disappointed',
    'useless', 'horrible', 'scam', 'ripoff', 'waste', 'annoying', 'poor', 'bad service',
    'never again', 'pathetic', 'disgusting',
  ],
  frustrated: [
    'frustrat', 'third time', 'again and again', 'still not', 'keep asking', 'nobody',
    'ignored', 'waiting forever', 'ridiculous', 'unacceptable', 'fed up', 'sick of',
    'how many times', 'already told', 'not listening',
  ],
  urgent: [
    'urgent', 'asap', 'immediately', 'emergency', 'right now', 'critical', 'deadline',
    'escalate', 'supervisor', 'manager', 'legal', 'lawyer', 'chargeback', 'cancel now',
  ],
};

function countHits(text: string, words: string[]): string[] {
  const t = text.toLowerCase();
  return words.filter((w) => t.includes(w));
}

function capsRatio(text: string): number {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 8) return 0;
  const caps = letters.replace(/[^A-Z]/g, '').length;
  return caps / letters.length;
}

/** Score a batch of visitor message texts. */
export function analyzeSentiment(texts: string[]): SentimentResult {
  const joined = texts.join('\n');
  const posHits = countHits(joined, LEXICON.positive);
  const negHits = countHits(joined, LEXICON.negative);
  const fruHits = countHits(joined, LEXICON.frustrated);
  const urgHits = countHits(joined, LEXICON.urgent);

  let score = posHits.length * 12 - negHits.length * 14 - fruHits.length * 18;
  if (urgHits.length > 0) score -= 10 + urgHits.length * 8;

  // Signal: SHOUTING / exclamation spam pushes negative.
  const caps = texts.map(capsRatio);
  if (caps.some((r) => r > 0.7)) score -= 18;
  const excl = (joined.match(/!{2,}/g) ?? []).length;
  score -= Math.min(20, excl * 7);
  // Signal: repeated near-identical visitor messages = frustration.
  const seen = new Set<string>();
  let repeats = 0;
  for (const t of texts) {
    const k = t.toLowerCase().trim().slice(0, 40);
    if (k.length > 6) {
      if (seen.has(k)) repeats += 1;
      seen.add(k);
    }
  }
  score -= Math.min(24, repeats * 12);

  const hits = [...urgHits.slice(0, 3), ...fruHits.slice(0, 3), ...negHits.slice(0, 3), ...posHits.slice(0, 2)];

  let label: QualitySentiment = 'neutral';
  if (score >= 18) label = 'positive';
  else if (score <= -12) label = fruHits.length > 0 || repeats > 0 ? 'frustrated' : 'negative';
  if (urgHits.length > 0 && score < 10) label = 'urgent';

  return { label, score: Math.max(-100, Math.min(100, Math.round(score))), hits };
}

export interface ScorableConversation {
  messages: Array<{ from: string; text: string; ts: number }>;
  status: string;
  rating?: number;
  createdAt: number;
  updatedAt: number;
}

/** Weighted 0–100 heuristic quality score with an explainable breakdown.
 * Weights are editable via the admin rubric (Settings → Quality page). */
export interface QualityWeights {
  firstResponse: number;
  sentiment: number;
  resolution: number;
  efficiency: number;
  engagement: number;
  freshness: number;
}

export const DEFAULT_QUALITY_WEIGHTS: QualityWeights = {
  firstResponse: 25,
  sentiment: 20,
  resolution: 20,
  efficiency: 15,
  engagement: 10,
  freshness: 10,
};

export function scoreConversationQuality(conv: ScorableConversation, weights: QualityWeights = DEFAULT_QUALITY_WEIGHTS): QualityScore {
  const breakdown: QualityBreakdown[] = [];
  const visitorMsgs = conv.messages.filter((m) => m.from === 'visitor');
  const agentMsgs = conv.messages.filter((m) => m.from === 'agent' || m.from === 'ai');
  const wPts = (frac: number, weight: number) => Math.round(Math.max(0, Math.min(1, frac)) * weight);

  // 1. First response time: full marks under 1 min, zero after 15 min.
  let firstRespSec: number | null = null;
  const firstVisitor = visitorMsgs[0];
  const firstReply = conv.messages.find(
    (m) => (m.from === 'agent' || m.from === 'ai') && firstVisitor && m.ts >= firstVisitor.ts,
  );
  if (firstVisitor && firstReply) firstRespSec = Math.max(0, (firstReply.ts - firstVisitor.ts) / 1000);
  const respFrac = firstRespSec === null ? 0.4 : Math.max(0, 1 - Math.min(1, firstRespSec / 900));
  breakdown.push({
    label: 'First response',
    points: wPts(respFrac, weights.firstResponse),
    max: weights.firstResponse,
    note: firstRespSec === null ? 'no agent reply yet' : `${Math.round(firstRespSec)}s to first reply`,
  });

  // 2. Visitor sentiment across the thread.
  const sent = analyzeSentiment(visitorMsgs.map((m) => m.text));
  breakdown.push({
    label: 'Visitor sentiment',
    points: wPts((sent.score + 100) / 200, weights.sentiment),
    max: weights.sentiment,
    note: `${sent.label} (${sent.score > 0 ? '+' : ''}${sent.score})`,
  });

  // 3. Resolution outcome.
  let resFrac = 0;
  let resNote = 'still open';
  if (conv.status === 'closed') {
    resFrac = 0.6;
    resNote = 'resolved';
  } else if (conv.status === 'spam' || conv.status === 'missed') {
    resFrac = 0;
    resNote = conv.status;
  } else {
    resFrac = 0.25;
  }
  if (conv.rating !== undefined) {
    resFrac += (conv.rating / 5) * 0.4;
    resNote += `, rated ${conv.rating}/5`;
  }
  breakdown.push({ label: 'Resolution', points: wPts(resFrac, weights.resolution), max: weights.resolution, note: resNote });

  // 4. Conversation efficiency: fewer agent touches for the message count is better.
  const total = conv.messages.length;
  const effFrac = total === 0 ? 0 : 1 - Math.min(1, agentMsgs.length / Math.max(6, total));
  breakdown.push({
    label: 'Efficiency',
    points: wPts(effFrac, weights.efficiency),
    max: weights.efficiency,
    note: `${agentMsgs.length} agent replies in ${total} messages`,
  });

  // 5. Engagement depth: substantive back-and-forth beats one-liners.
  const avgLen = visitorMsgs.length
    ? visitorMsgs.reduce((acc, m) => acc + m.text.length, 0) / visitorMsgs.length
    : 0;
  const engFrac = (Math.min(1, avgLen / 120) * 6 + Math.min(1, visitorMsgs.length / 6) * 4) / 10;
  breakdown.push({
    label: 'Engagement',
    points: wPts(engFrac, weights.engagement),
    max: weights.engagement,
    note: `${visitorMsgs.length} visitor messages, avg ${Math.round(avgLen)} chars`,
  });

  // 6. Recency/follow-through: penalize long-open stale chats.
  const ageHrs = (Date.now() - conv.createdAt) / 3600000;
  const staleFrac = conv.status === 'open' && ageHrs > 48 ? 0.2 : conv.status === 'open' && ageHrs > 12 ? 0.6 : 1;
  breakdown.push({
    label: 'Freshness',
    points: wPts(staleFrac, weights.freshness),
    max: weights.freshness,
    note: conv.status === 'open' ? `open for ${Math.round(ageHrs)}h` : 'closed',
  });

  const score = breakdown.reduce((a, b) => a + b.points, 0);
  return { score: Math.max(0, Math.min(100, score)), breakdown };
}

/** Distress check for a single visitor message — drives P4-6 supervisor alerts. */
export function detectDistress(text: string, extraWords: string[] = []): { distressed: boolean; hits: string[] } {
  const custom = extraWords.map((w) => w.toLowerCase().trim()).filter(Boolean);
  const fruHits = countHits(text, [...LEXICON.frustrated, ...custom]);
  const urgHits = countHits(text, LEXICON.urgent);
  const negHits = countHits(text, LEXICON.negative);
  const caps = capsRatio(text) > 0.7 && text.replace(/[^a-zA-Z]/g, '').length >= 12;
  const shout = (text.match(/!{3,}/g) ?? []).length > 0;
  const hits = [...urgHits, ...fruHits, ...negHits.slice(0, 2)];
  const distressed = fruHits.length > 0 || urgHits.length > 0 || (negHits.length >= 2 && (caps || shout)) || caps;
  return { distressed, hits };
}
