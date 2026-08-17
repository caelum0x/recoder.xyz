/**
 * OpenWork — the "unresolved open work" merge-readiness source. It answers one
 * question a reviewer weighs before merging: does this workspace still have work
 * the team hasn't finished? Three independent sources feed it, each degrade-safe:
 *
 *   1. TASK-SPEC checkboxes — unchecked `- [ ]` acceptance criteria in the task
 *      issue body (the spec the run was launched from);
 *   2. DIFF markers — `TODO`/`FIXME`/`XXX`/`HACK` the merge diff ADDS (work the
 *      author flagged as unfinished inside the change itself);
 *   3. LINKED issues — non-closed bd issues linked to the workspace's task.
 *
 * This module is PURE — no I/O. The composer gathers each source's raw material
 * (issue body, diff text, linked-issue list) through the seams it already owns and
 * calls {@link foldOpenWork}; the two parsers ({@link parseUncheckedCriteria},
 * {@link parseDiffTodos}) are pure string folds, unit-tested in isolation.
 *
 * DEGRADE LAW: a source whose raw material is `null` was NOT probed (unavailable)
 * and contributes nothing — never a fabricated item. When NO source could be
 * probed, the view is `available:false` (the readiness fold reports `'unknown'`,
 * never a fabricated "no open work" pass). Open work DISCOURAGES a merge (a soft
 * readiness downgrade), it never hard-blocks — the reviewer can still merge.
 */

/** What kind of open-work item this is (drives the reviewer-facing label prefix). */
export type OpenWorkKind = 'issue' | 'todo' | 'criterion';

/** One unresolved open-work item, projected for the reviewer. */
export interface OpenWorkItem {
  readonly kind: OpenWorkKind;
  /** A short, reviewer-facing description (e.g. `"[ ] handles null token"`). */
  readonly label: string;
}

/** The folded open-work read-model the readiness fold consumes. */
export interface OpenWorkView {
  /** Whether ANY source could be probed (false ⇒ nothing judged ⇒ readiness 'unknown'). */
  readonly available: boolean;
  /** The unresolved open-work items across all probed sources (capped). */
  readonly items: readonly OpenWorkItem[];
  /** Truthful reason when unavailable (never a fabricated empty pass). */
  readonly reason?: string;
}

/** The raw material the composer gathers; `null` for a source means "not probed". */
export interface OpenWorkProbeInput {
  /** The task issue body (acceptance-criteria checkboxes live here); `null` ⇒ unavailable. */
  readonly taskBody: string | null;
  /** The merge diff text (added TODO/FIXME markers); `null` ⇒ unavailable. */
  readonly diffText: string | null;
  /** Non-closed bd issues linked to the task; `null` ⇒ source unavailable/unwired. */
  readonly openIssues: readonly { readonly id: string; readonly title: string }[] | null;
}

/** Upper bound on surfaced items so a huge diff/spec can never flood the advisory list. */
const MAX_OPEN_WORK_ITEMS = 50;

/** The markers a diff line must ADD to count as flagged-unfinished work. */
const DIFF_MARKER = /\b(TODO|FIXME|XXX|HACK)\b/;

/**
 * Parse UNCHECKED acceptance criteria (`- [ ]` / `* [ ]`) out of a task body.
 * Checked (`[x]`/`[X]`) items are done and excluded. Pure; trimmed; empties dropped.
 */
export function parseUncheckedCriteria(taskBody: string): readonly OpenWorkItem[] {
  const out: OpenWorkItem[] = [];
  for (const raw of taskBody.split('\n')) {
    // `- [ ] text` or `* [ ] text`, leading whitespace allowed. `[ ]` = unchecked.
    const m = raw.match(/^\s*[-*]\s+\[ \]\s+(.+?)\s*$/);
    if (m && m[1]) out.push({ kind: 'criterion', label: `[ ] ${m[1]}` });
  }
  return out;
}

/**
 * Parse `TODO`/`FIXME`/`XXX`/`HACK` markers the diff ADDS (lines starting with a
 * single `+`, excluding the `+++` file header). Each item is attributed to the
 * file it lands in (tracked from the `+++ b/<path>` headers). Pure string fold.
 */
export function parseDiffTodos(diffText: string): readonly OpenWorkItem[] {
  const out: OpenWorkItem[] = [];
  let file = '';
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ ')) {
      // `+++ b/path/to/file` (or `+++ /dev/null`); strip the `b/` prefix.
      const path = line.slice(4).trim();
      file = path === '/dev/null' ? '' : path.replace(/^b\//, '');
      continue;
    }
    // An ADDED line is a single leading '+' (the `+++` header is handled above).
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const content = line.slice(1).trim();
      if (DIFF_MARKER.test(content)) {
        out.push({ kind: 'todo', label: file ? `${file}: ${content}` : content });
      }
    }
  }
  return out;
}

/**
 * Fold the three open-work sources into one truthful {@link OpenWorkView}. A `null`
 * source is unavailable (contributes nothing, never fabricated); the view is only
 * `available:false` when NO source could be probed. Items are capped so a pathological
 * diff/spec can never flood the reviewer surface.
 */
export function foldOpenWork(input: OpenWorkProbeInput): OpenWorkView {
  const items: OpenWorkItem[] = [];
  let probedAny = false;

  if (input.taskBody !== null) {
    probedAny = true;
    items.push(...parseUncheckedCriteria(input.taskBody));
  }
  if (input.diffText !== null) {
    probedAny = true;
    items.push(...parseDiffTodos(input.diffText));
  }
  if (input.openIssues !== null) {
    probedAny = true;
    for (const issue of input.openIssues) {
      const id = issue.id?.trim();
      if (id) items.push({ kind: 'issue', label: `${id}${issue.title ? `: ${issue.title}` : ''}` });
    }
  }

  if (!probedAny) {
    return { available: false, items: [], reason: 'open-work sources unavailable' };
  }
  return { available: true, items: items.slice(0, MAX_OPEN_WORK_ITEMS) };
}
