/**
 * `RunSignalPushService` — the control-plane REVERSE-PUSH service: it maps a
 * conductor run outcome (`completed` / `failed` / `stuck`) into an ops-recorder
 * ingest and forwards it over the {@link OpsRecorderPushPort}. This is the write
 * complement of {@link WorkSignalsService.refresh} (which PULLS): a run the
 * conductor drove to `failed`/`stuck` is pushed onto the SAME stuck-work board a
 * stale PR lands on, so a human sees a broken run without opening the terminal.
 *
 * SEAM LAW (degrade-truthful, fire-and-forget from the conductor):
 *  - `completed` runs carry NO stuck signal — the service SKIPS them truthfully
 *    (a finished run is not stuck work), so the conductor can wire this on every
 *    terminal event without special-casing.
 *  - An absent/unreachable/unauthorized sidecar is a `degraded` no-op — the push
 *    NEVER throws into or blocks the run flow that fired it, and NOTHING is
 *    fabricated (a non-2xx is logged as not-forwarded, never a silent success).
 */
import type { Logger } from '../../../shared/logger.js';
import type {
  OpsRecorderPushPort,
  OpsRecorderPushResult,
  OpsRecorderSyncResult,
  RunSignalPush,
} from '../ports/ops-recorder-push.port.js';

/** The run-outcome shape the conductor completion hook hands this service. */
export interface RunOutcomeSignal {
  readonly outcome: 'completed' | 'failed' | 'stuck';
  readonly title: string;
  /** The URL a human acts on; falls back to a synthetic `recoder://run/<id>`. */
  readonly sourceUrl?: string | null;
  readonly reason?: string | null;
  readonly runId?: string | null;
  readonly workspaceId?: string | null;
  readonly taskId?: string | null;
  readonly source?: 'github' | 'linear';
  readonly itemType?: 'pull_request' | 'issue';
  readonly priority?: 'high' | 'medium' | 'low';
}

export interface RunSignalPushServiceDeps {
  readonly logger: Logger;
  readonly port: OpsRecorderPushPort;
}

export class RunSignalPushService {
  constructor(private readonly deps: RunSignalPushServiceDeps) {}

  /**
   * Forward a run outcome to ops-recorder. Returns the (degrade-truthful) push
   * result. A `completed` outcome is a truthful skip (no stuck signal); an absent
   * sidecar is a `degraded` no-op. Callers use this fire-and-forget — it never
   * rethrows (a transport fault is caught and reported as `degraded`).
   */
  async forwardRunSignal(input: RunOutcomeSignal): Promise<OpsRecorderPushResult> {
    if (input.outcome === 'completed') {
      return { forwarded: false, degraded: false, reason: 'completed run is not stuck work (truthful skip)' };
    }

    const anchor = input.runId ?? input.workspaceId ?? input.taskId ?? 'unknown';
    const push: RunSignalPush = {
      outcome: input.outcome,
      title: input.title,
      sourceUrl: input.sourceUrl && input.sourceUrl.length > 0 ? input.sourceUrl : `recoder://run/${anchor}`,
      reason: input.reason && input.reason.length > 0 ? input.reason : `run ${input.outcome}`,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.itemType ? { itemType: input.itemType } : {}),
      priority: input.priority ?? 'high',
    };

    try {
      const result = await this.deps.port.forwardToOpsRecorder(push);
      if (result.forwarded) {
        this.deps.logger.info(
          { runId: input.runId, workspaceId: input.workspaceId, outcome: input.outcome, signalId: result.signalId },
          'run signal reverse-pushed to ops-recorder board',
        );
      } else if (result.degraded) {
        this.deps.logger.debug(
          { reason: result.reason, outcome: input.outcome },
          'run signal push skipped (ops-recorder sidecar down; nothing fabricated)',
        );
      } else {
        this.deps.logger.warn(
          { reason: result.reason, outcome: input.outcome },
          'run signal push rejected by ops-recorder (not forwarded)',
        );
      }
      return result;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.deps.logger.warn({ err: reason, outcome: input.outcome }, 'run signal push faulted (degraded, run unaffected)');
      return { forwarded: false, degraded: true, reason };
    }
  }

  /**
   * Trigger the sidecar's GitHub sync detector (used by the conductor
   * githubStatus wiring). Degrade-truthful, never throws.
   */
  async syncGithub(): Promise<OpsRecorderSyncResult> {
    try {
      const result = await this.deps.port.syncGithub();
      if (result.triggered) {
        this.deps.logger.info({}, 'ops-recorder github sync triggered (board refreshing PR state)');
      } else {
        this.deps.logger.debug({ reason: result.reason }, 'ops-recorder github sync skipped (sidecar down or rejected)');
      }
      return result;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.deps.logger.warn({ err: reason }, 'ops-recorder github sync faulted (degraded)');
      return { triggered: false, degraded: true, reason };
    }
  }
}
