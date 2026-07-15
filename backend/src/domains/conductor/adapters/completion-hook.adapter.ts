/**
 * `createCompletionHookSink` — the run-flow COMPLETION seam (hooks h + i).
 *
 * The run-tailer emits every `RunEvent` through ONE `RunEventSinkPort`. This
 * decorator wraps the durable+live sink so that on a TERMINAL event
 * (`completed` / `failed`) the conductor run flow fires the two completion
 * capabilities the AGENTS policy describes:
 *  - (h) memory HARVEST — an evidence-backed candidate wisp distilled from the
 *    finished run (`ConductorBrainMemory.harvestOnCompletion`), and
 *  - (i) issue-graph CLOSE/NOTE — the bd issue the workspace served is noted and,
 *    on success, closed (`CodeIntelPort.completeWork`).
 *
 * SEAM LAW (degrade-safe, truthful): the wrapped `inner.append` (durable audit +
 * live `/sync`) runs FIRST and is always awaited — the terminal event is never
 * delayed or dropped by a capability. The two hooks are fire-and-forget and NEVER
 * rethrow into the terminal-event path (a memory/beads fault is logged, swallowed).
 * With neither brain nor code-intel wired the decorator is the identity sink.
 */
import type { RunEvent, Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { RunEventSinkPort } from '../ports/run-event-sink.port.js';
import type { CodeIntelPort } from '../ports/code-intel.port.js';
import type { ConductorBrainMemory } from './brain-memory.adapter.js';

export interface CompletionHookDeps {
  /** The durable+live sink the tailer writes through (fanned agent-os + local). */
  readonly inner: RunEventSinkPort;
  /** OPTIONAL memory brain (harvest). Absent ⇒ no harvest. */
  readonly brain?: ConductorBrainMemory;
  /** OPTIONAL code-intel (beads close/note). Absent ⇒ no issue-graph update. */
  readonly codeIntel?: CodeIntelPort;
  /** Resolve the owning workspace (for userId/taskId provenance) — may return null. */
  readonly getWorkspace: (workspaceId: string) => Promise<Workspace | null>;
  readonly logger: Logger;
}

/** True for the two terminal RunEvent types the completion hooks fire on. */
function isTerminal(type: RunEvent['type']): type is 'completed' | 'failed' {
  return type === 'completed' || type === 'failed';
}

/**
 * Wrap `inner` so terminal events fire memory harvest + beads completion. Returns
 * `inner` unchanged when neither capability is wired (zero overhead).
 */
export function createCompletionHookSink(deps: CompletionHookDeps): RunEventSinkPort {
  const { inner, brain, codeIntel, getWorkspace, logger } = deps;
  if (!brain && !codeIntel) return inner;

  return {
    async append(event: RunEvent): Promise<void> {
      // Durable audit + live stream FIRST — never delayed by a capability hook.
      await inner.append(event);
      if (!isTerminal(event.type)) return;
      const outcome = event.type;

      try {
        const workspaceId =
          typeof event.data?.workspaceId === 'string' ? event.data.workspaceId : undefined;
        const workspace = workspaceId ? await getWorkspace(workspaceId) : null;
        const taskId = workspace?.taskId ?? event.taskId;
        const userId = workspace?.createdBy;

        // (h) memory harvest — needs a tenant + evidence anchor; else truthful skip.
        if (brain && userId && taskId) {
          void brain
            .harvestOnCompletion({
              userId,
              taskId,
              artifactId: event.artifactId ?? `run_${workspaceId ?? taskId}`,
              ...(event.runId ? { runId: event.runId } : {}),
              outcome,
              scope: 'task-type',
              proposedBy: 'conductor',
            })
            .catch((err) => logger.warn({ err, taskId }, 'conductor harvest hook faulted'));
        }

        // (i) issue-graph close/note — best-effort; a failed run keeps the issue open.
        if (codeIntel && taskId) {
          void codeIntel
            .completeWork(taskId, outcome)
            .catch((err) =>
              logger.warn({ err, taskId }, 'conductor beads completeWork hook faulted'),
            );
        }
      } catch (err) {
        logger.warn(
          { err, eventId: event.eventId },
          'conductor completion hook faulted — terminal event unaffected',
        );
      }
    },
  };
}
