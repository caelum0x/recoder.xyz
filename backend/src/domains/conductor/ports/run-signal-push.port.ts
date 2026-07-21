/**
 * RunSignalPushPort — the conductor's degrade-truthful seam to the ops-recorder
 * stuck-work board. On a TERMINAL run the completion hook reverse-pushes a
 * failed/stuck outcome so a broken run lands on the SAME board a stale PR does.
 *
 * The conductor MUST NOT import observability types; it depends on this narrow,
 * conductor-owned port that observability satisfies STRUCTURALLY at the
 * composition root (mirrors {@link UsageMeterPort} / {@link CodeIntelPort}). The
 * port is set post-construction by bootstrap (`ConductorModule.setRunSignalPush`)
 * — until then it stays an identity no-op, so this seam is fully green unwired.
 *
 * SEAM LAW (degrade-truthful, fire-and-forget from the conductor):
 *  - Absent (unwired / sidecar down / auth-preflight-fail) ⇒ a degraded no-op; it
 *    NEVER throws into the run and NEVER blocks a completion.
 *  - A `completed` outcome calls through but is a truthful SKIP on the far side (a
 *    finished run is not stuck work), so the hook needs no special-casing.
 */

/** The run outcome the conductor completion hook reverse-pushes on a terminal event. */
export interface ConductorRunOutcome {
  /** The terminal run outcome (`completed` is a truthful far-side skip). */
  readonly outcome: 'completed' | 'failed' | 'stuck';
  /** Human title of the run (e.g. the workspace project / run label). */
  readonly title: string;
  /** The URL a human acts on (the run's PR); the far side synthesizes `recoder://run/<id>` when absent. */
  readonly sourceUrl?: string | null;
  /** Why the run is stuck/failed (stored as `detected_reason`). */
  readonly reason?: string | null;
  readonly runId?: string | null;
  readonly workspaceId?: string | null;
  readonly taskId?: string | null;
}

/** The (degrade-truthful) result of a reverse-push. */
export interface RunSignalPushResult {
  /** True ONLY when the far-side sidecar accepted the ingest (2xx). */
  readonly forwarded: boolean;
  /** True when the sidecar was absent/unreachable/unauthorized ⇒ truthful skip. */
  readonly degraded: boolean;
  /** Why not forwarded (skipped, sidecar down, non-2xx). */
  readonly reason?: string;
}

/** The narrow reverse-push seam the conductor completion hook fires through. */
export interface RunSignalPushPort {
  /** Forward a terminal run outcome to the ops-recorder board (degrade-truthful, never throws). */
  forwardRunSignal(input: ConductorRunOutcome): Promise<RunSignalPushResult>;
}
