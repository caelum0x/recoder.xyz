/**
 * Diff-review comments → ONE structured steer prompt.
 *
 * The review loop's roundtrip: a reviewer anchors comments at changed lines in
 * the Review surface, and this pure module folds them into a single precise
 * prompt the conductor STEERS into the live agent session (via the existing
 * governed `steerWorkspace` send-keys path). Giving the agent explicit
 * `file:line — comment` context is what makes the "address my review" iteration
 * land on the right spot instead of a vague "fix the review".
 *
 * PURE + degrade-truthful: `parseReviewComments` never throws on untrusted input
 * (it drops malformed entries), and `composeReviewPrompt` returns `''` when there
 * is nothing valid to say — the caller MUST refuse to steer an empty prompt
 * rather than nudge the agent with a blank message.
 */

/** One line-anchored (or file-level) review comment. */
export interface ReviewComment {
  /** The changed file the comment is about (repo-relative). Required. */
  readonly file: string;
  /** The 1-based line the comment anchors to; omitted ⇒ file-level. */
  readonly line?: number;
  /**
   * Which side of the diff `line` refers to (difit's diff-source distinction):
   * `'new'` (post-change, the default) or `'old'` (a deleted/pre-change line).
   * Absent ⇒ treated as `'new'`.
   */
  readonly side?: 'old' | 'new';
  /** The reviewer's note. Required (empty ⇒ the comment is dropped). */
  readonly body: string;
}

/** Bound the prompt so a runaway client can never steer a multi-megabyte message. */
const MAX_REVIEW_COMMENTS = 50;

/**
 * Coerce an untrusted comments payload into clean {@link ReviewComment}s. Drops
 * any entry missing a non-empty `file` or `body`, trims both, keeps a `line` only
 * when it is a finite positive integer (else file-level), and caps the count at
 * {@link MAX_REVIEW_COMMENTS}. NEVER throws — malformed input yields fewer (or
 * zero) comments, never a crash and never a fabricated entry.
 */
export function parseReviewComments(data: unknown): ReviewComment[] {
  if (!Array.isArray(data)) return [];
  const out: ReviewComment[] = [];
  for (const entry of data) {
    if (out.length >= MAX_REVIEW_COMMENTS) break;
    if (entry == null || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const file = typeof e.file === 'string' ? e.file.trim() : '';
    const body = typeof e.body === 'string' ? e.body.trim() : '';
    if (file === '' || body === '') continue;
    const lineRaw = e.line;
    const line =
      typeof lineRaw === 'number' && Number.isInteger(lineRaw) && lineRaw > 0 ? lineRaw : undefined;
    // `side` is only meaningful with a line; default 'new', only 'old' is carried.
    const side = line != null && e.side === 'old' ? ('old' as const) : undefined;
    out.push({ file, body, ...(line != null ? { line } : {}), ...(side != null ? { side } : {}) });
  }
  return out;
}

/**
 * `src/foo.ts:42` when line-anchored (with a ` (old)` marker for a pre-change
 * line so the agent edits the right side), else the bare `src/foo.ts`.
 */
function anchor(comment: ReviewComment): string {
  if (comment.line == null) return comment.file;
  return `${comment.file}:${comment.line}${comment.side === 'old' ? ' (old)' : ''}`;
}

/**
 * Fold line-anchored review comments into ONE structured steer prompt. Returns
 * `''` when there are no valid comments (the caller refuses to steer). A single
 * comment reads as a one-liner; multiple comments become a numbered list so the
 * agent addresses each in turn. Every comment carries its `file:line` anchor so
 * the agent has precise context, and the prompt closes with an explicit
 * "summarize what you changed" so the reviewer gets a truthful report back.
 */
export function composeReviewPrompt(comments: readonly ReviewComment[]): string {
  const clean = comments.filter((c) => c.file.trim() !== '' && c.body.trim() !== '');
  if (clean.length === 0) return '';

  const closing = 'When done, summarize what you changed for each.';
  if (clean.length === 1) {
    const c = clean[0];
    return `Please address this review comment on your changes:\n\n${anchor(c)} — ${c.body}\n\n${closing}`;
  }
  const lines = clean.map((c, i) => `${i + 1}. ${anchor(c)} — ${c.body}`);
  return `Please address these ${clean.length} review comments on your changes:\n\n${lines.join('\n')}\n\n${closing}`;
}
