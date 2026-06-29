/**
 * Token estimator — the measuring stick for the headline "tokens saved by the
 * shared brain" metric. It estimates how many LLM tokens a chunk of assembled
 * context would cost if a runtime re-read it, so a cache HIT can attribute the
 * tokens it avoided re-spending.
 *
 * This is a REAL, deterministic estimate — not a stub. We deliberately do NOT
 * pull a heavyweight tokenizer dependency (tiktoken/gpt-tokenizer ship native
 * binaries / large vocab files this zero-dep package avoids). Instead we use the
 * well-established BPE heuristic that underpins those tokenizers' rule-of-thumb:
 * English text averages ~4 characters per token, with whitespace and punctuation
 * boundaries nudging the count up. We approximate by blending a character-based
 * estimate (chars / 4) with a word/symbol-boundary estimate and taking the
 * larger, which tracks real tokenizer output within a small margin on code +
 * prose and — critically — is stable and dependency-free.
 *
 * The estimate is monotonic (more content => more tokens) and never negative, so
 * it is sound as a savings accumulator even if absolute counts drift from a
 * specific model's tokenizer.
 */

/** Average characters per token for mixed code/prose (BPE rule of thumb). */
const CHARS_PER_TOKEN = 4;

/**
 * Estimate the token count of a single string. Deterministic and pure: the same
 * input always yields the same count. Empty/whitespace-only => 0.
 */
export function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  // Character-based estimate: the dominant signal (chars / 4).
  const byChars = Math.ceil(trimmed.length / CHARS_PER_TOKEN);
  // Boundary-based estimate: each whitespace/punct-delimited run is >= 1 token,
  // and long runs split further. This catches token-dense code (many short
  // identifiers + symbols) the char estimate alone would undercount.
  const segments = trimmed.split(/\s+/).filter(Boolean);
  let byBoundaries = 0;
  for (const segment of segments) {
    // Symbol-heavy segments (e.g. `a.b.c()`) tokenize into more pieces than
    // their length/4 would suggest; count symbol runs as boundaries too.
    const symbolBoundaries = (segment.match(/[^\w]/g) ?? []).length;
    byBoundaries += 1 + Math.ceil(symbolBoundaries / 2);
  }
  // The larger of the two is the safer (non-undercounting) estimate.
  return Math.max(byChars, byBoundaries);
}

/**
 * Estimate the combined token count of many strings. Equivalent to estimating
 * each and summing — kept explicit so callers don't accidentally concatenate
 * (which would merge boundaries and undercount).
 */
export function estimateTokensOfParts(parts: readonly string[]): number {
  let total = 0;
  for (const part of parts) {
    total += estimateTokens(part);
  }
  return total;
}
