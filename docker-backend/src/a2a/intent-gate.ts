/**
 * @module intent-gate
 *
 * Classifies a user prompt into a TaskCategory using keyword/regex
 * heuristics. Pure function, deterministic, no LLM call.
 *
 * This is the entry point to Recoder's intelligent routing layer:
 *
 *   User prompt → classifyIntent() → routeByCategory() → getRuntime() → runWithCompletionLoop()
 *
 * The classifier is intentionally conservative — it emits a low confidence
 * score (and falls back to `other`) when no category signal dominates,
 * so callers can fall back to manual runtime selection for ambiguous prompts.
 *
 * Inspired by oh-my-openagent's IntentGate pattern, but implemented as a
 * standalone pure function with no external dependencies.
 */

export type TaskCategory =
  | 'bug-fix'
  | 'feature'
  | 'refactor'
  | 'test'
  | 'doc'
  | 'visual'
  | 'debug'
  | 'other';

export interface IntentClassification {
  /** The winning category (or 'other' if no category dominates). */
  category: TaskCategory;
  /** Confidence score 0-1 based on normalized keyword match density. */
  confidence: number;
  /** Tokens from the prompt that contributed to the classification. */
  keywords: string[];
  /** All category scores (for debugging / fallback logic). */
  allScores: Record<TaskCategory, number>;
}

// ── Category keyword dictionaries ──────────────────────────────────
//
// Each entry is a regex with `\b` word boundaries (case-insensitive).
// Multi-word phrases use `\s+` to tolerate whitespace variation.
// Scoring: each match adds 1 to the category score. Ties broken by
// declaration order in CATEGORY_PRIORITY below.

const CATEGORY_PATTERNS: Record<Exclude<TaskCategory, 'other'>, RegExp[]> = {
  'bug-fix': [
    /\bfix(ing)?\b/i,
    /\bbug(s)?\b/i,
    /\bbroken\b/i,
    /\berror(s)?\b/i,
    /\bcrash(ing|es)?\b/i,
    /\bfail(ing|ed|s)?\b/i,
    /\bnot\s+working\b/i,
    /\bthrow(s|ing)?\b/i,
    /\bstack\s*trace\b/i,
    /\bpanic\b/i,
  ],
  debug: [
    /\bdebug(ging)?\b/i,
    /\binvestigate\b/i,
    /\bwhy\s+is\b/i,
    /\bwhy\s+does(n'?t)?\b/i,
    /\btrace\b/i,
    /\bdiagnose\b/i,
    /\btroubleshoot\b/i,
    /\bconsole\.log\b/i,
    /\bprofil(e|ing)\b/i,
  ],
  feature: [
    /\badd(ing)?\b/i,
    /\bbuild(ing)?\b/i,
    /\bcreat(e|ing)\b/i,
    /\bnew\b/i,
    /\bimplement(ing)?\b/i,
    /\bmake\s+(a|an)?\b/i,
    /\bintroduce\b/i,
    /\bfeature\b/i,
    /\bship\b/i,
  ],
  refactor: [
    /\brefactor(ing)?\b/i,
    /\bclean(ing)?\s+up\b/i,
    /\bsimplif(y|ying|ied)\b/i,
    /\bextract\b/i,
    /\brename\b/i,
    /\breorganiz(e|ing)\b/i,
    /\brestructur(e|ing)\b/i,
    /\bconsolidate\b/i,
    /\bdedupe\b/i,
    /\bmove\s+to\b/i,
  ],
  test: [
    /\btest(s|ing)?\b/i,
    /\bcoverage\b/i,
    /\be2e\b/i,
    /\bunit\s+test\b/i,
    /\bintegration\s+test\b/i,
    /\bjest\b/i,
    /\bvitest\b/i,
    /\bpytest\b/i,
    /\bplaywright\b/i,
    /\bcypress\b/i,
    /\bassert(ion)?\b/i,
  ],
  doc: [
    /\bdocument(ation|ing)?\b/i,
    /\bREADME\b/i,
    /\bdocs\b/i,
    /\bcomment(s|ing)?\b/i,
    /\bexplain\b/i,
    /\bJSDoc\b/i,
    /\bTSDoc\b/i,
    /\bdocstring\b/i,
    /\bwrite\s+up\b/i,
    /\bchangelog\b/i,
  ],
  visual: [
    /\bUI\b/i,
    /\bUX\b/i,
    /\bdesign(ing)?\b/i,
    /\bcomponent(s)?\b/i,
    /\blanding\s+page\b/i,
    /\bbutton(s)?\b/i,
    /\bCSS\b/i,
    /\bTailwind\b/i,
    /\bstyl(e|ing|ed)\b/i,
    /\blayout\b/i,
    /\bresponsive\b/i,
    /\bdark\s+mode\b/i,
    /\btheme\b/i,
    /\bhero\s+section\b/i,
    /\bnavbar\b/i,
    /\bfooter\b/i,
  ],
};

// When scores tie, earlier categories win. `bug-fix` and `debug` beat
// `feature` because fixing is usually more specific than adding.
const CATEGORY_PRIORITY: Array<Exclude<TaskCategory, 'other'>> = [
  'bug-fix',
  'debug',
  'test',
  'visual',
  'refactor',
  'doc',
  'feature',
];

// ── Classification ─────────────────────────────────────────────────

/**
 * Classify a user prompt into a TaskCategory.
 *
 * @param prompt - The raw user prompt text.
 * @returns Classification with category, confidence score (0-1), matched
 *          keywords, and all category scores.
 */
export function classifyIntent(prompt: string): IntentClassification {
  const emptyScores: Record<TaskCategory, number> = {
    'bug-fix': 0,
    debug: 0,
    feature: 0,
    refactor: 0,
    test: 0,
    doc: 0,
    visual: 0,
    other: 0,
  };

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return {
      category: 'other',
      confidence: 0,
      keywords: [],
      allScores: emptyScores,
    };
  }

  const scores = { ...emptyScores };
  const matchedKeywords: string[] = [];

  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS) as Array<
    [Exclude<TaskCategory, 'other'>, RegExp[]]
  >) {
    for (const pattern of patterns) {
      const matches = prompt.match(new RegExp(pattern.source, pattern.flags + 'g'));
      if (matches && matches.length > 0) {
        scores[category] += matches.length;
        matchedKeywords.push(...matches.map((m) => m.toLowerCase()));
      }
    }
  }

  // Find the winning category (respecting priority on ties)
  let winner: TaskCategory = 'other';
  let maxScore = 0;
  for (const category of CATEGORY_PRIORITY) {
    if (scores[category] > maxScore) {
      maxScore = scores[category];
      winner = category;
    }
  }

  // Compute confidence: winning score / total matches, capped at 1.
  // Low total matches = low confidence even if winner is clear.
  const totalMatches = Object.values(scores).reduce((a, b) => a + b, 0);
  let confidence = 0;
  if (totalMatches > 0 && maxScore > 0) {
    // Base: share of winning category among all matches
    const share = maxScore / totalMatches;
    // Penalty for very few matches (< 2 matches = cap at 0.5)
    const volumeBoost = Math.min(1, totalMatches / 2);
    confidence = Math.min(1, share * volumeBoost);
  }

  return {
    category: winner,
    confidence: Number(confidence.toFixed(2)),
    keywords: Array.from(new Set(matchedKeywords)),
    allScores: scores,
  };
}
