/**
 * `context-bridge` — assembles a compact, bounded CONTEXT BUNDLE for a task by
 * fusing its A2A message log with the shared scratchpad. It is what a runtime
 * reads when it joins (or resumes) a task so it inherits prior turns + peer notes
 * without re-deriving them.
 *
 * The canonical Run state-of-record stays in agent-os; this bundle is a READ-ONLY
 * projection composed from the task-store repo + scratchpad service. It is bounded
 * (most-recent-N messages, all live notes) so a long task never produces an
 * unbounded prompt, and it degrades exactly as its sources do.
 */
import type { TaskStoreRepo } from '../ports/task-store.repo.js';
import type { ScratchpadEntry, TaskMessageRow, TaskRow } from '../types.js';
import type { ScratchpadService } from './scratchpad.js';

/** Default cap on messages folded into a bundle (most-recent-first slice). */
export const DEFAULT_BUNDLE_MESSAGE_LIMIT = 40;

/** A compact context bundle a runtime inherits when it joins a task. */
export interface ContextBundle {
  readonly taskId: string;
  readonly task: TaskRow | null;
  /** The most-recent messages (oldest-first within the slice). */
  readonly messages: readonly TaskMessageRow[];
  /** Whether the message log was truncated to fit the limit. */
  readonly truncated: boolean;
  /** The live scratchpad notes (oldest-first). */
  readonly notes: readonly ScratchpadEntry[];
}

export interface BuildBundleInput {
  readonly taskId: string;
  /** Owner scope — a bundle is only built for a task the caller owns. */
  readonly userId: string;
  /** Cap on the number of messages included (default {@link DEFAULT_BUNDLE_MESSAGE_LIMIT}). */
  readonly messageLimit?: number;
}

export interface ContextBridgeService {
  /** Build the read-only context bundle for a task (owner-scoped). */
  build(input: BuildBundleInput): Promise<ContextBundle>;
  /** Leave a note on the task's shared scratchpad (convenience over scratchpad). */
  note(input: { taskId: string; author: string; note: string; ttlMs?: number }): Promise<ScratchpadEntry>;
}

export interface ContextBridgeDeps {
  readonly tasks: TaskStoreRepo;
  readonly scratchpad: ScratchpadService;
}

/** Build the context-bridge service. Pure factory; read-only projection. */
export function createContextBridgeService(deps: ContextBridgeDeps): ContextBridgeService {
  const { tasks, scratchpad } = deps;
  return {
    async build(input: BuildBundleInput): Promise<ContextBundle> {
      const limit = input.messageLimit ?? DEFAULT_BUNDLE_MESSAGE_LIMIT;
      const task = await tasks.getTask(input.taskId, input.userId);
      // Owner-scoped: if the task is not owned/absent, the bundle is empty.
      if (!task) {
        return { taskId: input.taskId, task: null, messages: [], truncated: false, notes: [] };
      }
      const all = await tasks.listMessages(input.taskId);
      const truncated = all.length > limit;
      const messages = truncated ? all.slice(all.length - limit) : all;
      const notes = await scratchpad.read(input.taskId);
      return { taskId: input.taskId, task, messages, truncated, notes };
    },

    async note(input: { taskId: string; author: string; note: string; ttlMs?: number }): Promise<ScratchpadEntry> {
      return scratchpad.append(input);
    },
  };
}
