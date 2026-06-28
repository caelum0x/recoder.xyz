/**
 * WorkspaceRepositoryPort — the control-plane persistence seam (design §4.9 / §7).
 *
 * Canonical state (Workspace / TaskRun / RunEvent / TaskSpec) lives in
 * `@recoder/agent-os` and is reached ONLY through this port. The substrate never
 * owns canonical state and never imports the backend repository; the backend
 * injects an `AgentOsRepository → WorkspaceRepositoryPort` adapter, tests inject
 * an in-memory Map-backed fake. Interface only.
 *
 * The non-negotiable engine ordering (persist the Workspace record FIRST, then
 * provision/launch) is enforced by the engine calling `upsertWorkspace` before
 * the substrate `launch` — this port just provides the durable store.
 *
 * The method shapes mirror the backend `AgentOsRepository` 1:1 (upserts return
 * the stored entity; list reads take no filter and return everything) so the
 * backend adapter is a pure passthrough and the proven workspace-service /
 * reconcile behavior is preserved byte-for-byte after the engine move.
 */
import type { RunEvent, TaskRun, TaskSpec, Workspace } from '@recoder/agent-os';

export interface WorkspaceRepositoryPort {
  /** Insert or replace a Workspace record (state of record); returns the stored record. */
  upsertWorkspace(workspace: Workspace): Promise<Workspace>;
  /** Fetch a Workspace by id, or null if it does not exist. */
  getWorkspace(workspaceId: string): Promise<Workspace | null>;
  /** List every Workspace record. */
  listWorkspaces(): Promise<Workspace[]>;

  /** Insert or replace a TaskRun bound to a Workspace; returns the stored run. */
  upsertRun(run: TaskRun): Promise<TaskRun>;
  /** List every TaskRun (engine finds the one bound to a workspace's run id). */
  listRuns(): Promise<TaskRun[]>;

  /** Append a RunEvent (the audit trail / live-terminal source); returns the stored event. */
  appendEvent(event: RunEvent): Promise<RunEvent>;
  /** List every RunEvent (engine filters by run id). */
  listEvents(): Promise<RunEvent[]>;

  /** List every TaskSpec (engine reads `targetPaths` for lock scoping). */
  listTasks(): Promise<TaskSpec[]>;
}
