/**
 * `OpsRecorderPushPort` — the REVERSE-PUSH edge to the Python `ops-recorder`
 * work-signals sidecar. The read seam ({@link WorkSignalsPort}) PULLS what the
 * sidecar detected; this seam PUSHES what the Recoder control plane already
 * detected — a run the conductor drove to `failed`/`stuck` — straight into the
 * sidecar's `POST /work-signals/ingest` surface, so a broken run surfaces on the
 * SAME stuck-work board a stale PR does. The complement is `syncGithub()`, which
 * fires the sidecar's `POST /work-signals/sync/github` detector so the board also
 * reflects the latest GitHub PR state (used by the conductor githubStatus wiring).
 *
 * TRUTHFULNESS (mirrors the read seam): when the sidecar is absent — no URL,
 * unreachable, or the auth preflight would fail — a push/sync is a truthful,
 * `degraded` NO-OP. It NEVER blocks or fails the run it describes; a run's
 * completion is authoritative even when its ops-recorder mirror could not be
 * written. Nothing is fabricated: a non-2xx sidecar response is reported as
 * `forwarded:false` with the reason, never as a silent success.
 *
 * The ingest contract (backend/engines/py/ops-recorder/work-signals/api/ingest.py,
 * `WorkSignalIngest`) is source-agnostic on the back half — normalize → handoff →
 * store — but its `source`/`item_type` are the sidecar's `github|linear` /
 * `pull_request|issue` enums, so a pushed run signal represents itself as its
 * GitHub PR by default (the run's PR is the thing a human acts on).
 */

/** A run-level stuck/failed signal the control plane reverse-pushes to ops-recorder. */
export interface RunSignalPush {
  /** The run outcome that produced this signal (`completed` is skipped by the service). */
  readonly outcome: 'completed' | 'failed' | 'stuck';
  /** Human title (e.g. the PR/run title). */
  readonly title: string;
  /** The URL a human acts on (the run's GitHub PR; a `recoder://run/<id>` fallback). */
  readonly sourceUrl: string;
  /** Why the run is stuck/failed — the sidecar stores this as `detected_reason`. */
  readonly reason: string;
  /** Run provenance (folded into `status` so the stored signal is correlatable). */
  readonly runId?: string | null;
  readonly workspaceId?: string | null;
  readonly taskId?: string | null;
  /** Sidecar source enum; defaults to `github` (a run's PR representation). */
  readonly source?: 'github' | 'linear';
  /** Sidecar item-type enum; defaults to `pull_request`. */
  readonly itemType?: 'pull_request' | 'issue';
  /** Priority; defaults to `high` (a broken run is high-signal). */
  readonly priority?: 'high' | 'medium' | 'low';
  readonly assignee?: string | null;
}

/** The result of a reverse-push (degrade-truthful). */
export interface OpsRecorderPushResult {
  /** True ONLY when the sidecar accepted the ingest (2xx). */
  readonly forwarded: boolean;
  /** The stored `WorkSignal.id` the sidecar returned (present on success). */
  readonly signalId?: string;
  /** True when the sidecar was absent/unreachable/unauthorized ⇒ truthful skip. */
  readonly degraded: boolean;
  /** Why not forwarded (skipped, sidecar down, non-2xx). */
  readonly reason?: string;
}

/** The result of triggering the sidecar's GitHub sync detector (degrade-truthful). */
export interface OpsRecorderSyncResult {
  /** True ONLY when the sidecar accepted the sync trigger (2xx). */
  readonly triggered: boolean;
  /** True when the sidecar was absent/unreachable/unauthorized ⇒ truthful skip. */
  readonly degraded: boolean;
  /** Why not triggered (sidecar down, non-2xx) or the sidecar's accept message. */
  readonly reason?: string;
}

export interface OpsRecorderPushPort {
  /**
   * Reverse-push a single already-detected stuck/failed run signal to the
   * sidecar's `POST /work-signals/ingest`. Returns a `degraded` no-op result when
   * the sidecar is absent — NEVER throws into the run flow that called it.
   */
  forwardToOpsRecorder(signal: RunSignalPush): Promise<OpsRecorderPushResult>;
  /**
   * Trigger the sidecar's `POST /work-signals/sync/github` detector so the board
   * reflects current GitHub PR state. Returns a `degraded` no-op when the sidecar
   * is absent — never throws.
   */
  syncGithub(): Promise<OpsRecorderSyncResult>;
}
