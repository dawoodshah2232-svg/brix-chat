// Brix Chat — campaign A/B testing helpers (P4-9).
// Splits are deterministic: hash(visitorId + campaignId) decides the variant,
// so a visitor always lands in the same bucket. Result stats are SIMULATED
// (local demo — delivery needs the backend phase) and always labeled as such.

export interface AbResults {
  sentA: number;
  sentB: number;
  opensA: number;
  opensB: number;
  clicksA: number;
  clicksB: number;
  at: number;
  simulated: true;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic variant assignment for one recipient. splitPct = % going to B. */
export function variantFor(visitorId: string, campaignId: string, splitPct: number): 'A' | 'B' {
  return hashStr(`${visitorId}:${campaignId}`) % 100 < splitPct ? 'B' : 'A';
}

/** Deterministic recipient counts per variant. */
export function splitCounts(recipientIds: string[], campaignId: string, splitPct: number): { a: number; b: number } {
  let a = 0, b = 0;
  for (const id of recipientIds) (variantFor(id, campaignId, splitPct) === 'A' ? a++ : b++);
  return { a, b };
}

function rate(seed: number, base: number, spread: number): number {
  return base + ((seed % 1000) / 1000) * spread;
}

/** Deterministic simulated results, seeded by campaign id. Always marked simulated. */
export function simulateResults(campaignId: string, sentA: number, sentB: number): AbResults {
  const h = hashStr(`results:${campaignId}`);
  const openA = rate(h, 0.35, 0.25);
  const openB = rate(h >> 3, 0.35, 0.25);
  // B gets a deterministic lift between -3% and +8% — the thing the test measures
  const lift = ((h % 120) - 30) / 1000;
  const clickA = Math.max(0.005, rate(h >> 5, 0.04, 0.06));
  const clickB = Math.max(0.005, clickA * (1 + lift));
  return {
    sentA, sentB,
    opensA: Math.round(sentA * openA), opensB: Math.round(sentB * openB),
    clicksA: Math.round(sentA * clickA), clicksB: Math.round(sentB * clickB),
    at: Date.now(), simulated: true,
  };
}

export type AbWinner = 'A' | 'B' | 'tie';

/** Winner by click-through rate. "tie" when the gap is under 0.5pp or samples are tiny. */
export function pickWinner(r: AbResults): { winner: AbWinner; ctrA: number; ctrB: number; confident: boolean } {
  const ctrA = r.sentA ? r.clicksA / r.sentA : 0;
  const ctrB = r.sentB ? r.clicksB / r.sentB : 0;
  const gap = Math.abs(ctrA - ctrB);
  const confident = r.sentA >= 50 && r.sentB >= 50 && gap >= 0.005;
  const winner: AbWinner = gap < 0.005 ? 'tie' : ctrB > ctrA ? 'B' : 'A';
  return { winner, ctrA, ctrB, confident };
}
