/**
 * `createRunTailer` — the engine→tailer attach seam ({@link RunTailerPort}).
 *
 * After a workspace reaches `running` the engine attaches the tailer so the
 * agent's terminal output streams into the RunEvent log; reconcile re-attaches it
 * (idempotent per workspace) for a surviving live workspace after a restart.
 *
 * COMPOSITION NOTE: the concrete polling/control-mode tailer (substrate
 * `capture()`/`alive()` → RunEvents) is promoted into `@recoder/substrate`
 * (`startRunTail`) and driven with a LIVE substrate handle + the durable sink;
 * that wiring belongs to the composition root once real substrates are injected.
 * Until then this adapter is DEGRADE-SAFE and TRUTHFUL: it records the attach,
 * de-dupes repeat attaches per workspace, and emits a single truthful "tail
 * attached" event — it NEVER fabricates agent output it did not read. Bootstrap
 * may inject the real package tailer to replace it.
 */
import type { Logger } from '../../../shared/logger.js';
import type { RunEventSinkPort } from '../ports/index.js';

/** Mirrors `@recoder/substrate` `RunTailAttachInput` (kept local to avoid a hard dep). */
export interface RunTailerAttachInput {
  readonly workspaceId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly substrate: string;
  readonly sessionName: string;
  readonly worktreePath?: string;
}

/** The narrow attach port the engine calls (structurally = substrate `RunTailerPort`). */
export interface ConductorRunTailer {
  start(input: RunTailerAttachInput): void;
  /** Whether a workspace currently has an attached tail (truthful liveness hint). */
  isTailing(workspaceId: string): boolean;
}

export interface RunTailerDeps {
  readonly sink: RunEventSinkPort;
  readonly logger: Logger;
}

/** Build the degrade-safe run-tailer adapter. */
export function createRunTailer(deps: RunTailerDeps): ConductorRunTailer {
  const { sink, logger } = deps;
  const attached = new Set<string>();

  return {
    start(input: RunTailerAttachInput): void {
      if (attached.has(input.workspaceId)) return; // idempotent per workspace
      attached.add(input.workspaceId);
      logger.info(
        { workspaceId: input.workspaceId, runId: input.runId, substrate: input.substrate },
        'conductor run-tailer attached (streaming wired by composition root when a live substrate is present)',
      );
      // Truthful lifecycle marker; NOT fabricated agent output.
      void sink
        .append({
          eventId: `${input.runId}:tail-attached`,
          type: 'log',
          taskId: input.taskId,
          runId: input.runId,
          createdAt: new Date().toISOString(),
          data: { workspaceId: input.workspaceId, sessionName: input.sessionName },
        })
        .catch((err) => logger.error({ err, workspaceId: input.workspaceId }, 'tail-attach event failed'));
    },
    isTailing(workspaceId: string): boolean {
      return attached.has(workspaceId);
    },
  };
}
