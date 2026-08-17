/**
 * The MERGE TRUST GATE — turns the {@link ConvergenceTrust} score into an
 * enforceable pre-merge decision, so a low-trust converged merge is warned or
 * blocked BEFORE it becomes the customer-visible delivery. Pure + deterministic; a
 * deployment picks the posture via `RECODER_MERGE_TRUST_GATE`:
 *
 *   - `off`   (default) — never blocks/warns on trust (behaviour unchanged).
 *   - `warn`  — never blocks, but attaches a warning + the review flags whenever the
 *               merge is not HIGH trust (the reviewer proceeds informed).
 *   - `block` — REFUSES a LOW-trust merge (a real blocker: verification blocked,
 *               unverifiable, or a mostly-conflicted/LLM-written convergence); a
 *               MEDIUM-trust merge is allowed WITH a warning.
 *
 * The gate never fabricates safety: it only ever downgrades a merge from allowed to
 * warned/blocked, and every block carries the trust score's own truthful reasons.
 */
import type { ConvergenceTrust } from './convergence-trust.js';

export type MergeTrustGateMode = 'off' | 'warn' | 'block';

/** The gate outcome. `allow:false` ⇒ the merge is refused with a truthful reason. */
export interface MergeTrustGateDecision {
  readonly allow: boolean;
  /** True only when the gate itself refused (distinct from a governance deny). */
  readonly blocked: boolean;
  /** A non-blocking advisory (mode `warn`, or a `block`-mode MEDIUM merge). */
  readonly warning?: string;
  /** The refusal reason when `allow:false`. */
  readonly reason?: string;
  /** The trust tier the decision was made on (echoed for the caller/audit). */
  readonly tier: ConvergenceTrust['tier'];
  readonly score: number;
}

/** Parse `RECODER_MERGE_TRUST_GATE`; anything unrecognized ⇒ `off` (fail-open, non-breaking). */
export function parseMergeTrustGateMode(raw: string | undefined): MergeTrustGateMode {
  const v = (raw ?? '').toLowerCase().trim();
  return v === 'warn' || v === 'block' ? v : 'off';
}

/** Compose the trust summary + its review flags into one advisory line. */
function advisory(trust: ConvergenceTrust): string {
  const flags = trust.reviewFlags.length > 0 ? ` Review: ${trust.reviewFlags.join('; ')}` : '';
  return `${trust.summary}${flags}`;
}

/**
 * Evaluate the merge trust gate. PURE — the caller applies the decision (refuse the
 * merge on `allow:false`, or attach `warning` to the result). `off` always allows
 * with no advisory; `warn` allows but advises on any non-high tier; `block` refuses
 * a low tier and advises a medium one.
 */
export function evaluateMergeTrustGate(
  trust: ConvergenceTrust,
  mode: MergeTrustGateMode,
): MergeTrustGateDecision {
  const base = { tier: trust.tier, score: trust.score } as const;
  if (mode === 'off') {
    return { allow: true, blocked: false, ...base };
  }
  if (mode === 'block' && trust.tier === 'low') {
    return {
      allow: false,
      blocked: true,
      reason: `merge blocked by trust gate — ${advisory(trust)}`,
      ...base,
    };
  }
  // warn mode (any non-high), or block mode on a medium tier ⇒ allow WITH advice.
  if (trust.tier !== 'high') {
    return { allow: true, blocked: false, warning: advisory(trust), ...base };
  }
  return { allow: true, blocked: false, ...base };
}
