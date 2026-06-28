/**
 * Brain-stats presentation helpers — pure functions that derive a TRUTHFUL
 * headline + token/percent formatting from the real GET /api/agent-os/brain/stats
 * shape. Nothing here invents a number: every derivation reads a value the
 * backend actually returned.
 *
 * Three honest display states, in precedence order:
 *  - 'disabled'  : brain.enabled is false (RECODER_BRAIN_ENABLED off) — no brain
 *                  was even constructed. We say so, not "0 tokens saved".
 *  - 'idle'      : brain enabled but report is null OR report.available is false
 *                  (the brain has never been read) — "nothing reported yet",
 *                  distinct from a fabricated zeroed-green.
 *  - 'reporting' : brain enabled AND report.available — real reuse to show.
 *
 * Source of truth for the contract:
 *  - docker-backend/src/agent-os/routes/brain-stats.routes.ts (BrainStatsResponseData)
 *  - docker-backend/src/agent-os/brain-service.ts (BrainCacheStatus)
 *  - packages/brain/src/runtime/cache-doctor.ts (CacheReport)
 */
import type { BrainStats, GovernanceAudit } from '../types';

export type BrainDisplayState = 'disabled' | 'idle' | 'reporting';

/**
 * Derive the honest display state. `enabled: false` always wins ('disabled');
 * otherwise a missing/not-yet-read report is 'idle'; only an available report
 * with real reads is 'reporting'.
 */
export function brainDisplayState(stats: Pick<BrainStats, 'brain'>): BrainDisplayState {
  const { brain } = stats;
  if (!brain.enabled) return 'disabled';
  if (!brain.report || !brain.report.available) return 'idle';
  return 'reporting';
}

/**
 * Format a token count with thousands separators (e.g. 12345 -> "12,345").
 * Negative or non-finite inputs collapse to "0" — we never render a misleading
 * NaN/Infinity for the headline metric.
 */
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return '0';
  return Math.round(tokens).toLocaleString('en-US');
}

/**
 * Format a 0..1 hit rate as a whole-number percent string (e.g. 0.5 -> "50%").
 * Out-of-range / non-finite inputs clamp to a truthful 0%–100% bound.
 */
export function formatHitRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return '0%';
  const clamped = rate >= 1 ? 1 : rate;
  return `${Math.round(clamped * 100)}%`;
}

/**
 * The single headline line the card shows. It is derived ENTIRELY from the real
 * response: disabled / not-yet-read states say exactly that; only a reporting
 * brain shows the "shared brain saved ~X tokens, N% reuse" sentence.
 */
export function brainHeadline(stats: Pick<BrainStats, 'brain'>): string {
  const state = brainDisplayState(stats);
  if (state === 'disabled') {
    return 'Shared brain disabled (RECODER_BRAIN_ENABLED off).';
  }
  if (state === 'idle') {
    return 'Shared brain enabled — nothing reported yet (not read since boot).';
  }
  const report = stats.brain.report!;
  return `Shared brain saved ~${formatTokens(report.tokensSaved)} tokens, ${formatHitRate(report.hitRate)} reuse.`;
}

/** Human label for the governance audit chip. */
export function governanceLabel(gov: GovernanceAudit): string {
  return gov.ok ? 'audit verified' : 'audit unverified';
}

/** Map the governance audit ok/unavailable state to a styles.css tone-* class. */
export function governanceTone(gov: GovernanceAudit): string {
  return gov.ok ? 'good' : 'bad';
}
