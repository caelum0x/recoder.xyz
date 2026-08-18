/**
 * `createLlmReviewGenerator` — the concrete {@link ReviewFindingsPort} (recoder-7z42):
 * an LLM review over the bounded merge diff that emits candidate line-level findings.
 * The model call is INJECTED (`complete`), so the adapter's real logic — the prompt it
 * builds and the DEFENSIVE parse of the model's reply — is fully unit-tested with a fake
 * model; only the live inference call is environment-bound.
 *
 * Degrade-truthful: an empty diff, an unavailable model (`complete` returns null/throws),
 * or an unparseable reply all yield `[]` — never a fabricated finding. The findings this
 * returns are CANDIDATES; the deterministic {@link validateFindings} gate (evidence-
 * grounding + confidence floor) runs downstream before anything is surfaced.
 */
import type { Logger } from '../../../shared/logger.js';
import type {
  ReviewFinding,
  ReviewFindingsPort,
  ReviewSeverity,
} from '../services/review-findings.service.js';

export interface ReviewGeneratorDeps {
  /** Call the model with a prompt → raw reply (a JSON array of findings); `null` when unavailable. */
  readonly complete: (prompt: string) => Promise<string | null>;
  readonly logger: Logger;
  /** Cap the diff sent to the model (default 60k chars). */
  readonly maxDiffChars?: number;
}

const DEFAULT_MAX_DIFF = 60_000;

/** Build the review prompt. PURE. Demands EVIDENCE per finding + precision over recall. */
export function buildReviewPrompt(diffText: string): string {
  return [
    'You are a precise code reviewer. Review ONLY the unified diff below.',
    'Return a JSON array of findings — nothing else. Each finding MUST be an object:',
    '{ "file": string, "line": number, "severity": "critical"|"high"|"medium"|"low"|"info",',
    '  "message": string, "evidence": string, "confidence": number (0..1) }.',
    'RULES: only real, high-confidence defects (bugs, security, correctness, resource leaks).',
    'Every finding MUST cite concrete EVIDENCE (the offending code / why it is wrong). No',
    'evidence ⇒ do not report it. Prefer precision over recall. Empty array if nothing solid.',
    '',
    'DIFF:',
    diffText,
  ].join('\n');
}

const SEVERITIES: ReadonlySet<string> = new Set(['critical', 'high', 'medium', 'low', 'info']);

function asSeverity(v: unknown): ReviewSeverity {
  return typeof v === 'string' && SEVERITIES.has(v) ? (v as ReviewSeverity) : 'info';
}

/** Extract the first top-level JSON array from a model reply (tolerates ``` fences / prose). */
function extractJsonArray(raw: string): string | null {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

/**
 * Parse a model reply into candidate {@link ReviewFinding}s. PURE + defensive: tolerates
 * code fences / surrounding prose, drops any element that is not a well-formed object,
 * and NEVER throws (a bad reply ⇒ `[]`). The downstream validator does the final gating.
 */
export function parseReviewResponse(raw: string): readonly ReviewFinding[] {
  const json = extractJsonArray(raw);
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ReviewFinding[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const file = typeof o.file === 'string' ? o.file.trim() : '';
    const line = typeof o.line === 'number' && Number.isFinite(o.line) ? Math.trunc(o.line) : 0;
    const message = typeof o.message === 'string' ? o.message.trim() : '';
    if (!file || line < 1 || !message) continue;
    out.push({
      file,
      line,
      severity: asSeverity(o.severity),
      message,
      ...(typeof o.evidence === 'string' && o.evidence.trim() ? { evidence: o.evidence.trim() } : {}),
      ...(typeof o.confidence === 'number' && Number.isFinite(o.confidence) ? { confidence: o.confidence } : {}),
    });
  }
  return out;
}

/** Build the LLM review generator. Never throws; `[]` on empty diff / no model / bad reply. */
export function createLlmReviewGenerator(deps: ReviewGeneratorDeps): ReviewFindingsPort {
  const maxDiff = deps.maxDiffChars ?? DEFAULT_MAX_DIFF;
  return {
    async review(input: { readonly diffText: string; readonly workspaceId: string }): Promise<readonly ReviewFinding[]> {
      const diff = (input.diffText ?? '').slice(0, maxDiff);
      if (!diff.trim()) return [];
      let raw: string | null = null;
      try {
        raw = await deps.complete(buildReviewPrompt(diff));
      } catch (err) {
        deps.logger.debug({ workspaceId: input.workspaceId, err }, 'review-generator: model call failed — skipped');
        return [];
      }
      if (!raw) return [];
      return parseReviewResponse(raw);
    },
  };
}
