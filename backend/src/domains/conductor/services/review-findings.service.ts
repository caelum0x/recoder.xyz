/**
 * `validateFindings` + `ReviewFindingsPort` — line-level AI review with a deterministic
 * FALSE-POSITIVE VALIDATOR in front of it (recoder-7z42). The research's single largest
 * capability gap: Recoder's "AI review" surfaces only a blast-radius reference count —
 * zero line-level defect opinions — while every review-bot competitor (CodeRabbit,
 * Greptile, Devin, Bugbot, Baz, Ellipsis) posts inline findings. And the winners all put
 * an evidence-grounding / self-consistency filter in FRONT of what they surface, trading
 * recall for precision so the signal stays trustworthy.
 *
 * This file owns the PURE, testable half: the validator. It enforces the precision gate
 * every credible review bot runs — a finding is surfaced ONLY when it is line-anchored
 * (real file + line), carries ATTACHED EVIDENCE (a snippet / rule / repro — never a bare
 * assertion), and clears a confidence floor; duplicates collapse, results are severity-
 * ranked and capped. The GENERATION half is the injected {@link ReviewFindingsPort} — an
 * LLM adapter over the bounded diff. Until one is wired the review surface degrades to
 * today's blast-radius evidence — no fabricated findings, ever.
 */

export type ReviewSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** One line-anchored review finding, as a generator emits it (pre-validation). */
export interface ReviewFinding {
  readonly file: string;
  readonly line: number;
  readonly severity: ReviewSeverity;
  readonly message: string;
  /**
   * The grounding a finding MUST carry to survive the validator: a code snippet, a
   * named rule, or a concrete repro. A finding with no evidence is a bare assertion —
   * dropped. This is the anti-hallucination gate.
   */
  readonly evidence?: string;
  /** Optional generator confidence 0..1; when present it must clear the floor. */
  readonly confidence?: number;
}

export interface ValidateOptions {
  /** Minimum confidence a finding needs when it carries one (default 0.5). */
  readonly minConfidence?: number;
  /** Cap surfaced findings (default 50). */
  readonly maxFindings?: number;
}

export interface ValidatedFindings {
  /** The findings that PASSED the precision gate, severity-ranked + deduped + capped. */
  readonly kept: readonly ReviewFinding[];
  /** How many candidate findings were dropped (no evidence / low confidence / malformed / dup). */
  readonly dropped: number;
  readonly summary: string;
}

/**
 * The injected generator: an LLM review over the bounded diff → candidate findings.
 * Returns `[]` when unwired/unavailable — never throws, so the review surface degrades
 * to the existing blast-radius evidence rather than fabricating findings.
 */
export interface ReviewFindingsPort {
  review(input: { readonly diffText: string; readonly workspaceId: string }): Promise<readonly ReviewFinding[]>;
}

const SEVERITY_RANK: Record<ReviewSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const DEFAULT_MIN_CONFIDENCE = 0.5;
const DEFAULT_MAX_FINDINGS = 50;

function isSeverity(v: unknown): v is ReviewSeverity {
  return v === 'critical' || v === 'high' || v === 'medium' || v === 'low' || v === 'info';
}

/**
 * The false-positive validator. PURE + deterministic. A finding is KEPT only when it is
 * line-anchored (non-empty file, line >= 1), has a non-empty message, carries non-empty
 * EVIDENCE, and — when it declares a confidence — clears the floor. Survivors are deduped
 * by file:line:message, severity-ranked, and capped. Never throws.
 */
export function validateFindings(
  findings: readonly ReviewFinding[],
  options: ValidateOptions = {},
): ValidatedFindings {
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const maxFindings = options.maxFindings ?? DEFAULT_MAX_FINDINGS;

  const seen = new Set<string>();
  const kept: ReviewFinding[] = [];
  for (const f of findings) {
    if (!f || typeof f !== 'object') continue;
    const file = typeof f.file === 'string' ? f.file.trim() : '';
    const message = typeof f.message === 'string' ? f.message.trim() : '';
    const evidence = typeof f.evidence === 'string' ? f.evidence.trim() : '';
    const line = typeof f.line === 'number' && Number.isInteger(f.line) ? f.line : 0;
    // Evidence-grounding gate: line-anchored + non-empty message + ATTACHED EVIDENCE.
    if (!file || line < 1 || !message || !evidence) continue;
    // Confidence floor (only when the generator declared one).
    if (typeof f.confidence === 'number' && f.confidence < minConfidence) continue;
    const key = `${file}:${line}:${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ file, line, severity: isSeverity(f.severity) ? f.severity : 'info', message, evidence, ...(typeof f.confidence === 'number' ? { confidence: f.confidence } : {}) });
  }

  kept.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const capped = kept.slice(0, maxFindings);
  const dropped = findings.length - capped.length;
  const summary =
    capped.length === 0
      ? dropped > 0
        ? `${dropped} candidate finding(s) dropped by the validator (no evidence / low confidence)`
        : 'no review findings'
      : `${capped.length} evidence-backed finding(s)${dropped > 0 ? ` (${dropped} dropped)` : ''}`;
  return { kept: capped, dropped, summary };
}
