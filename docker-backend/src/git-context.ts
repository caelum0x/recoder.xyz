/**
 * Recoder-owned Git Nexus integration.
 *
 * Wires the first-party @recoder/git-nexus code-knowledge engine into the
 * Agent OS layer so a task's repo context (dependency graph, ownership map,
 * test targets, impact report, source refs) is produced as a real ContextPack —
 * consumable by instruction compilation and surfaced via /api/agent-os. Git Nexus
 * is owned code, not an external service; this makes the product actually use it.
 */
import { createContextPack, type ContextPack } from '@recoder/git-nexus';
import type { TaskSpec } from '@recoder/agent-os';

/**
 * Build a Git Nexus ContextPack for a task against a repo root. Defaults fill the
 * dependency/ownership/test maps when a full repo index isn't supplied; callers
 * that have indexed the repo can pass richer inputs.
 */
export function buildTaskContextPack(task: TaskSpec, repoRoot: string): ContextPack {
  return createContextPack({ task, repoRoot });
}

export type { ContextPack };
