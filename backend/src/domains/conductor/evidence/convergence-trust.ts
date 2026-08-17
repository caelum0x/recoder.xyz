/**
 * `computeConvergenceTrust` — a PURE, deterministic, EXPLAINABLE trust score over a
 * sealed {@link ConvergenceEvidence} record. Recoder's product promise is "N parallel
 * runs → ONE TRUSTED merge"; this turns the merge's own evidence into the single
 * "should I trust this?" signal the reviewer needs — a 0-100 score, a tier, the
 * weighted factors that produced it, and the specific things a human should review.
 *
 * It NEVER fabricates confidence: a blocked/failing verification caps the score low,
 * an LLM-authored merge region is always surfaced as a review flag (the evidence
 * must never hide a model-written merge), and a degraded governance path is a real
 * deduction. Pure over the sealed record — no I/O, no mutation — so it is fully
 * unit-tested and can be recomputed identically from the exportable evidence.
 */
/**
 * The structural signals the trust fold reads — a subset satisfied BOTH by a sealed
 * {@link import('./convergence-evidence.js').ConvergenceEvidence} (post-merge) AND
 * by the pre-merge inputs the merge gate assembles (candidates + readiness + the
 * merge verdict), so the SAME scoring math powers the post-merge score and the
 * pre-merge gate without duplicating it.
 */
export interface ConvergenceTrustInput {
  readonly verification: {
    readonly available?: boolean;
    readonly verdict?: string;
    readonly blockers?: readonly string[];
    readonly reason?: string;
  };
  readonly convergence?: {
    readonly fileCount: number;
    readonly selections?: readonly { readonly mode: string; readonly contested: boolean }[];
    readonly assisted?: readonly { readonly path: string }[];
  };
  readonly governance: {
    readonly degraded: boolean;
    readonly riskTier: string;
    readonly effect: string;
    readonly approvalId?: string;
    readonly reason?: string;
  };
  readonly candidateCount: number;
}

/** How a factor moved the score — for a truthful, colour-free breakdown. */
export type TrustImpact = 'positive' | 'caution' | 'negative';

/** One weighted contributor to the trust score, with its human explanation. */
export interface TrustFactor {
  readonly label: string;
  readonly impact: TrustImpact;
  /** Signed point delta this factor applied to the base score. */
  readonly delta: number;
  readonly detail: string;
}

/** The overall convergence trust assessment. */
export interface ConvergenceTrust {
  /** 0-100 — higher is more trustworthy. Deterministic from the evidence. */
  readonly score: number;
  readonly tier: 'high' | 'medium' | 'low';
  /** The weighted factors that produced the score (most-impactful first). */
  readonly factors: readonly TrustFactor[];
  /** Specific things a human should review BEFORE trusting the merge (may be empty). */
  readonly reviewFlags: readonly string[];
  /** One-line human summary. */
  readonly summary: string;
}

const BASE = 100;
/** A blocked/failing verification can never read above this — trust is capped, not zeroed. */
const BLOCKED_CAP = 30;

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function tierOf(score: number): ConvergenceTrust['tier'] {
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

/**
 * Fold the sealed evidence into a trust assessment. Weights are fixed + documented
 * so two reviewers reading the same merge always see the same score + reasons.
 */
export function computeConvergenceTrust(evidence: ConvergenceTrustInput): ConvergenceTrust {
  const factors: TrustFactor[] = [];
  const reviewFlags: string[] = [];
  let score = BASE;
  let hardCap = 100;

  const add = (label: string, impact: TrustImpact, delta: number, detail: string): void => {
    if (delta !== 0) score += delta;
    factors.push({ label, impact, delta, detail });
  };

  // 1) VERIFICATION — the crux gate. A blocked merge or any hard blocker caps trust
  //    low; an unknown/unavailable verdict is a real deduction (we could not prove it).
  const v = evidence.verification;
  const blockers = v.blockers ?? [];
  if (v.available === false) {
    add('verification', 'negative', -18, v.reason ?? 'merge verification was unavailable');
  } else if (v.verdict === 'blocked' || blockers.length > 0) {
    hardCap = Math.min(hardCap, BLOCKED_CAP);
    const shown = blockers.slice(0, 3).join('; ') || 'a hard blocker';
    add('verification', 'negative', -40, `merge is BLOCKED: ${shown}`);
    reviewFlags.push(`Resolve blockers before trusting the merge: ${shown}`);
  } else if (v.verdict === 'ready') {
    add('verification', 'positive', +0, 'merge readiness verified: ready');
  } else if (v.verdict === 'not_ready') {
    add('verification', 'caution', -18, 'workspace is not review-ready');
  } else {
    add('verification', 'caution', -12, `verification verdict '${v.verdict ?? 'unknown'}'`);
  }

  // 2) CONVERGENCE PROVENANCE — how CLEAN the merge was. Clean = a mechanical
  //    3-way synthesize or an uncontested pick; contested picks are a human decision
  //    (fine, but there WAS conflict); an LLM-written region is always a review flag.
  const c = evidence.convergence;
  if (c && c.fileCount > 0) {
    const selections = c.selections ?? [];
    const clean = selections.filter(
      (s) => s.mode === 'synthesize' || (s.mode === 'pick' && !s.contested),
    ).length;
    const contestedPicks = selections.filter((s) => s.mode === 'pick' && s.contested).length;
    const cleanRatio = clean / c.fileCount;
    const cleanPenalty = Math.round((1 - cleanRatio) * 25);
    add(
      'clean-merge-ratio',
      cleanRatio >= 0.8 ? 'positive' : 'caution',
      -cleanPenalty,
      `${clean}/${c.fileCount} files merged cleanly (${Math.round(cleanRatio * 100)}%)`,
    );

    const assisted = c.assisted ?? [];
    if (assisted.length > 0) {
      const penalty = Math.min(24, assisted.length * 8);
      add('llm-assisted-merge', 'negative', -penalty, `${assisted.length} file(s) had conflict regions written by a model`);
      reviewFlags.push(
        `Review the ${assisted.length} LLM-merged file(s): ${assisted.slice(0, 3).map((a) => a.path).join(', ')}`,
      );
    }
    if (contestedPicks > 0) {
      add('contested-picks', 'caution', -Math.min(12, contestedPicks * 3), `${contestedPicks} contested file(s) resolved by a human pick`);
    }
  } else {
    add('convergence', 'caution', -5, 'single-agent merge (no parallel convergence)');
  }

  // 3) GOVERNANCE — a degraded gate path or a high-risk action lowers trust.
  const g = evidence.governance;
  if (g.degraded) {
    add('governance', 'negative', -12, `governance ran on a degraded path${g.reason ? `: ${g.reason}` : ''}`);
    reviewFlags.push('The governance gate ran degraded (fallback engine) — confirm the policy decision.');
  }
  if (g.riskTier === 'high' || g.riskTier === 'critical') {
    add('risk-tier', 'caution', -10, `high-risk action (tier '${g.riskTier}')`);
  }
  if (g.effect === 'needs_approval') {
    add('approval', 'caution', 0, g.approvalId ? `required approval (${g.approvalId})` : 'required approval');
  }

  // 4) BREADTH — converging 2+ real candidates is more thorough than a lone run.
  if (evidence.candidateCount >= 2) {
    add('breadth', 'positive', +5, `converged ${evidence.candidateCount} parallel candidate runs`);
  }

  score = clamp(Math.min(score, hardCap));
  const tier = tierOf(score);
  factors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const summary =
    tier === 'high'
      ? `High trust (${score}/100): verified merge, ${reviewFlags.length === 0 ? 'no review flags' : `${reviewFlags.length} thing(s) to review`}.`
      : tier === 'medium'
        ? `Medium trust (${score}/100): mergeable but review ${reviewFlags.length || 'the flagged'} item(s) first.`
        : `Low trust (${score}/100): do not merge until the flagged issues are resolved.`;

  return { score, tier, factors, reviewFlags, summary };
}
