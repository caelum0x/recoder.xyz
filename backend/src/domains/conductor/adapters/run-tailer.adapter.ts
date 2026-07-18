/**
 * `createRunTailer` — the engine→tailer attach seam ({@link RunTailerPort}).
 *
 * After a workspace reaches `running` the engine attaches the tailer so the
 * agent's terminal output streams into the RunEvent log; reconcile re-attaches it
 * (idempotent per workspace) for a surviving live workspace after a restart.
 *
 * TWO MODES, selected by whether a live substrate driver is injected:
 *
 *  - LIVE (composition root injects {@link LiveTailDriver}): drives the
 *    `@recoder/substrate` `startRunTail` poll tailer against the resolved
 *    substrate's `capture()`/`alive()`/`exitCode()`. When
 *    `config.tmuxControlMode` is on AND the workspace runs on `tmux_worktree`
 *    AND the injected tmux binary provably speaks control mode,
 *    `selectControlModeTail` wraps the tailer's substrate so real-time `%output`
 *    streams into `log` RunEvents (the poller stays the liveness/exit-code
 *    authority; only its capture is suppressed while the control client is
 *    healthy). ANY of those gates failing ⇒ the plain poll tailer runs — the
 *    truthful degrade, never a fabricated attach.
 *
 *  - DEGRADE (no driver): records the attach, de-dupes repeat attaches per
 *    workspace, and emits a single truthful "tail attached" lifecycle marker.
 *    It NEVER fabricates agent output it did not read.
 *
 * The composition root (`conductor-module`) injects the driver from the already-
 * registered substrates + config; no `process.env` reads here.
 */
import { startRunTail, stopRunTail, TailRegistry } from '@recoder/substrate';
import type { ClockPort, IdPort, LoggerPort, TailSubstrate } from '@recoder/substrate';
import type { Logger } from '../../../shared/logger.js';
import type { RunEventSinkPort } from '../ports/index.js';
import type { ConductorConfig } from '../config.js';
import {
  selectControlModeTail,
  type ControlModeTail,
  type SpawnFn,
} from './tmux-control-mode.adapter.js';
import type { ExecFn } from './tmux-substrate.adapter.js';

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
  /**
   * Detach a workspace's tail (idempotent). Stops the control-mode client (if
   * any) and the poll tailer, and clears the attach marker so a later reconcile
   * can re-attach. No-op for a workspace that was never attached.
   */
  stop(workspaceId: string): void;
}

/**
 * The live-streaming seam the composition root injects to drive the real
 * `startRunTail` poll tailer (+ opt-in control mode). Absent ⇒ the tailer stays
 * on the truthful degrade path (attach marker only).
 */
export interface LiveTailDriver {
  /**
   * Resolve the REAL substrate (`capture`/`alive`/`exitCode`) hosting a run's
   * session by substrate id. `undefined` ⇒ the id is not registered ⇒ truthful
   * degrade (the attach marker records the lifecycle; no tail is driven).
   */
  resolveSubstrate(substrateId: string): TailSubstrate | undefined;
  /** The config slice the control-mode gate reads (`tmuxBin` + the opt-in flag). */
  readonly config: Pick<ConductorConfig, 'tmuxBin' | 'tmuxControlMode'>;
  readonly clock: ClockPort;
  readonly id: IdPort;
  readonly logger: LoggerPort;
  /** Child-process seam for the control-mode client (tests); default node spawn. */
  readonly spawn?: SpawnFn;
  /** `tmux -V` probe seam (tests); default the package's `execFileSafe`. */
  readonly exec?: ExecFn;
}

export interface RunTailerDeps {
  readonly sink: RunEventSinkPort;
  readonly logger: Logger;
  /**
   * OPTIONAL live-streaming driver. Present ⇒ the tailer drives the real
   * substrate poll tailer (and the opt-in control-mode listener). Absent ⇒ the
   * truthful degrade path (attach marker only).
   */
  readonly live?: LiveTailDriver;
}

/** Build the run-tailer adapter (live streaming when a driver is injected, else degrade-safe). */
export function createRunTailer(deps: RunTailerDeps): ConductorRunTailer {
  const { sink, logger, live } = deps;
  const attached = new Set<string>();
  // Per-adapter tail registry (idempotency + stop handles) for the live path.
  const tailRegistry = new TailRegistry();
  // Control-mode clients keyed by workspace, so a stop cascades to the client.
  const controlTails = new Map<string, ControlModeTail>();

  /** Emit the single truthful lifecycle marker (NOT fabricated agent output). */
  const emitAttachMarker = (input: RunTailerAttachInput): void => {
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
  };

  /** Drive the real poll tailer (+ opt-in control mode) for a workspace. */
  const startLive = (input: RunTailerAttachInput, driver: LiveTailDriver): void => {
    const inner = driver.resolveSubstrate(input.substrate);
    if (!inner) {
      // The engine attached a run on a substrate the registry does not know —
      // record the lifecycle truthfully but drive no tail (never a fake stream).
      logger.warn(
        { workspaceId: input.workspaceId, substrate: input.substrate },
        'conductor run-tailer: substrate not registered — attach marker only (no live tail)',
      );
      emitAttachMarker(input);
      return;
    }

    // Control-mode selection probes the tmux binary (`-V`) asynchronously; the
    // poll tailer is the default/degrade the whole time. Kick it off and start
    // the tailer with whichever substrate the gate returns.
    void (async () => {
      let control: ControlModeTail | undefined;
      try {
        control = await selectControlModeTail(
          {
            workspaceId: input.workspaceId,
            taskId: input.taskId,
            runId: input.runId,
            substrateId: input.substrate,
            sessionName: input.sessionName,
            inner,
            sink,
          },
          {
            config: driver.config,
            logger: driver.logger,
            ...(driver.spawn ? { spawn: driver.spawn } : {}),
            ...(driver.exec ? { exec: driver.exec } : {}),
          },
        );
      } catch (err) {
        // The gate is degrade-safe by contract; guard anyway — never leave the
        // run untailed because a probe threw. Fall through to the poll tailer.
        logger.warn(
          { err, workspaceId: input.workspaceId },
          'conductor run-tailer: control-mode selection failed — poll tailer used',
        );
        control = undefined;
      }

      // The workspace may have been detached (stop) while the probe ran.
      if (!attached.has(input.workspaceId)) {
        control?.stop();
        return;
      }

      if (control) controlTails.set(input.workspaceId, control);
      const substrate = control?.substrate ?? inner;
      startRunTail(
        {
          workspaceId: input.workspaceId,
          taskId: input.taskId,
          runId: input.runId,
          sessionName: input.sessionName,
          ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
        },
        {
          substrate,
          sink,
          registry: tailRegistry,
          clock: driver.clock,
          id: driver.id,
          logger: driver.logger,
        },
      );
    })();
  };

  return {
    start(input: RunTailerAttachInput): void {
      if (attached.has(input.workspaceId)) return; // idempotent per workspace
      attached.add(input.workspaceId);
      if (live) {
        logger.info(
          {
            workspaceId: input.workspaceId,
            runId: input.runId,
            substrate: input.substrate,
            controlMode: live.config.tmuxControlMode === true,
          },
          'conductor run-tailer attached (live substrate streaming)',
        );
        startLive(input, live);
        return;
      }
      logger.info(
        { workspaceId: input.workspaceId, runId: input.runId, substrate: input.substrate },
        'conductor run-tailer attached (streaming wired by composition root when a live substrate is present)',
      );
      emitAttachMarker(input);
    },
    isTailing(workspaceId: string): boolean {
      return attached.has(workspaceId);
    },
    stop(workspaceId: string): void {
      if (!attached.delete(workspaceId)) return;
      const control = controlTails.get(workspaceId);
      if (control) {
        control.stop();
        controlTails.delete(workspaceId);
      }
      stopRunTail(tailRegistry, workspaceId);
    },
  };
}
