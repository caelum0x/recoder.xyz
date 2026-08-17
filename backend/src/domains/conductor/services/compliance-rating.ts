/**
 * ComplianceRating — a HINT (never a proof) at how well a change appears to
 * address the unchecked acceptance criteria the run was launched from. A reviewer
 * weighs it before merging; it does NOT gate a merge and it never claims a run is
 * "done". The signal is a keyword-overlap heuristic: for each criterion we extract
 * its salient keywords and treat the criterion as "addressed" when a strong share
 * of those keywords surface in the changed paths or the diff text.
 *
 * This module is PURE — no I/O, deterministic, and it never throws. The composer
 * gathers the raw material (unchecked criteria, changed paths, diff text) through
 * seams it already owns and calls {@link rateCompliance}.
 *
 * DEGRADE LAW (truthful, never fabricated):
 *   - no criteria to judge          ⇒ 'unknown' (nothing was asked)
 *   - criteria but NO changed evidence (no paths AND no diff text)
 *                                   ⇒ 'unknown' (nothing to judge against)
 *   - all criteria addressed        ⇒ 'full'
 *   - zero criteria addressed       ⇒ 'none'
 *   - some addressed                ⇒ 'partial'
 *
 * HONESTY: keyword overlap is a proxy. A criterion can be met by code that shares
 * none of its words, and prose in a diff can mention a keyword without implementing
 * it. This rating is advisory review-signal only — treat a low rating as "look
 * closer", not "the run failed".
 */

/** The four truthful ratings; `'unknown'` is emitted rather than a fabricated pass. */
export type ComplianceLevel = 'full' | 'partial' | 'none' | 'unknown';

/** The advisory compliance read-model a reviewer weighs before merging. */
export interface ComplianceRating {
  /** The rating; `'unknown'` when there is nothing to judge (never fabricated). */
  readonly rating: ComplianceLevel;
  /** How many criteria appear addressed by the changed evidence. */
  readonly metCount: number;
  /** How many criteria were judged (0 ⇒ `'unknown'`). */
  readonly total: number;
  /** The criteria that did NOT appear addressed (verbatim input lines, capped). */
  readonly unmet: readonly string[];
  /** A short, truthful, reviewer-facing one-liner. */
  readonly summary: string;
}

/** The raw material the composer gathers; pure inputs, no I/O. */
export interface ComplianceRatingInput {
  /** Unchecked acceptance-criteria lines, e.g. `"[ ] handles null token"`. */
  readonly criteria: readonly string[];
  /** Paths the change touches (matched against criterion keywords). */
  readonly changedPaths: readonly string[];
  /** The merge diff text (matched against criterion keywords); optional/nullable. */
  readonly diffText?: string | null;
}

/** Cap surfaced `unmet` lines so a pathological spec cannot flood the surface. */
const MAX_UNMET = 50;
/** Cap criteria actually judged so a pathological spec cannot burn unbounded work. */
const MAX_CRITERIA = 200;
/** Cap evidence length scanned per rating so a huge diff cannot burn unbounded work. */
const MAX_EVIDENCE_CHARS = 200_000;
/** Share of a criterion's keywords that must appear for it to count as addressed. */
const ADDRESSED_THRESHOLD = 0.6;

/**
 * Very small English stopword set plus checkbox/markdown noise. Kept intentionally
 * short — the goal is to drop words that carry no signal about WHAT a criterion is
 * about, not to build a linguistics engine.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how',
  'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its',
  'let', 'put', 'say', 'she', 'too', 'use', 'that', 'this', 'with', 'have',
  'from', 'they', 'will', 'would', 'there', 'their', 'what', 'about', 'which',
  'when', 'make', 'like', 'time', 'just', 'know', 'take', 'into', 'your', 'some',
  'them', 'then', 'than', 'want', 'must', 'should', 'shall', 'when', 'were',
  'been', 'being', 'does', 'done', 'each', 'only', 'also', 'both', 'such',
]);

/**
 * Extract a criterion's salient keywords: drop the `[ ]` / `[x]` checkbox marker
 * and any leading list bullet, lowercase, split on non-alphanumerics, drop
 * stopwords and words shorter than 3 characters. Pure. De-duplicated so a
 * repeated word cannot skew the addressed-share.
 */
export function extractKeywords(criterion: string): readonly string[] {
  // Strip a leading list bullet and/or checkbox marker: `- [ ]`, `* [x]`, `[ ]`.
  const stripped = criterion.replace(/^\s*[-*]?\s*\[[ xX]?\]\s*/, '');
  const seen = new Set<string>();
  for (const word of stripped.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= 3 && !STOPWORDS.has(word)) seen.add(word);
  }
  return [...seen];
}

/** Build the lowercased evidence haystack (changed paths + diff text), length-capped. */
function buildEvidence(input: ComplianceRatingInput): string {
  const parts: string[] = [];
  for (const path of input.changedPaths) {
    if (typeof path === 'string' && path) parts.push(path);
  }
  if (typeof input.diffText === 'string' && input.diffText) parts.push(input.diffText);
  return parts.join('\n').toLowerCase().slice(0, MAX_EVIDENCE_CHARS);
}

/**
 * A criterion is "addressed" when a strong SHARE of its keywords appear in the
 * evidence. A criterion with no extractable keywords cannot be judged by overlap,
 * so it is conservatively treated as NOT addressed (it stays visible as `unmet`
 * rather than being silently counted as met).
 */
function isAddressed(keywords: readonly string[], evidence: string): boolean {
  if (keywords.length === 0) return false;
  let hits = 0;
  for (const kw of keywords) {
    if (evidence.includes(kw)) hits += 1;
  }
  return hits / keywords.length >= ADDRESSED_THRESHOLD;
}

/**
 * Rate how well the changed evidence appears to address the unchecked criteria.
 * Pure, deterministic, degrade-truthful, never throws. See the module header for
 * the honesty caveat: this is a review HINT, not a proof of completion.
 */
export function rateCompliance(input: ComplianceRatingInput): ComplianceRating {
  const criteria = (input.criteria ?? [])
    .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    .slice(0, MAX_CRITERIA);

  if (criteria.length === 0) {
    return { rating: 'unknown', metCount: 0, total: 0, unmet: [], summary: 'no acceptance criteria to judge' };
  }

  const evidence = buildEvidence(input);
  if (evidence.length === 0) {
    return {
      rating: 'unknown',
      metCount: 0,
      total: criteria.length,
      unmet: criteria.slice(0, MAX_UNMET),
      summary: `no changed evidence to judge ${criteria.length} criteria against`,
    };
  }

  const unmet: string[] = [];
  let metCount = 0;
  for (const criterion of criteria) {
    if (isAddressed(extractKeywords(criterion), evidence)) metCount += 1;
    else unmet.push(criterion);
  }

  const total = criteria.length;
  const rating: ComplianceLevel = metCount === total ? 'full' : metCount === 0 ? 'none' : 'partial';
  return {
    rating,
    metCount,
    total,
    unmet: unmet.slice(0, MAX_UNMET),
    summary: `${metCount}/${total} acceptance criteria appear addressed (keyword-overlap hint, not a proof)`,
  };
}
