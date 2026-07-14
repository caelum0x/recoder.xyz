/**
 * Empty-start create — honor the New Workspace form's promise: "You don't need
 * a goal upfront — you can start empty and message the agent in the
 * conversation."
 *
 * The engine needs a command or a prompt to launch. When the caller supplies
 * neither, we provision the isolated worktree with a clean no-op that exits 0.
 * The completion-watcher then transitions the workspace running → awaiting_review
 * (a CONTINUABLE state), so the operator's FIRST message drives the real agent
 * run in place (continueWorkspace) over the provisioned worktree.
 *
 * The workspace is marked `metadata.emptyStart` and given a friendly goal label
 * so the board shows "New workspace — send your first message" instead of a
 * confusing empty review.
 */

/** A portable shell no-op: provisions the worktree, produces no diff, exits 0. */
export const EMPTY_START_COMMAND = 'true';

/** The goal label shown for an empty-started workspace until its first message. */
export const EMPTY_START_LABEL = 'New workspace — send your first message';

interface CreateBodyLike {
  prompt?: unknown;
  command?: unknown;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * If neither a prompt nor a command carries real intent, default a no-op
 * command + empty-start metadata. Otherwise the body passes through unchanged
 * (a real prompt or explicit command always wins). Immutable — returns a copy.
 */
export function applyEmptyStartDefault<T extends CreateBodyLike>(body: T): T {
  if (hasText(body.command) || hasText(body.prompt)) return body;
  return {
    ...body,
    command: EMPTY_START_COMMAND,
    metadata: {
      ...(body.metadata ?? {}),
      emptyStart: true,
      // Give the board a friendly goal (the label wins only if no prompt was set).
      prompt: hasText(body.metadata?.prompt) ? body.metadata!.prompt : EMPTY_START_LABEL,
    },
  };
}
