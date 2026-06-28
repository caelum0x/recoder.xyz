/**
 * WorkspaceRepositoryPort — the control-plane persistence seam (design §4.9 / §7).
 *
 * Canonical state (Workspace / TaskRun / RunEvent) lives in `@recoder/agent-os`
 * and is reached ONLY through this port. The substrate never owns canonical
 * state and never imports the backend repository; the backend injects an
 * `AgentOsRepository → WorkspaceRepositoryPort` adapter, tests inject an
 * in-memory Map-backed fake. Interface only.
 *
 * The non-negotiable engine ordering (persist the Workspace record FIRST, then
 * provision/launch) is enforced by the engine calling `upsertWorkspace` before
 * the substrate `launch` — this port just provides the durable store.
 */
import type { RunEvent, TaskRun, Workspace, WorkspaceSubstrate } from '@recoder/agent-os';

export interface WorkspaceRepositoryPort {
  /** Insert or replace a Workspace record (state of record). */
  upsertWorkspace(workspace: Workspace): Promise<void>;
  /** Fetch a Workspace by id, or null if it does not exist. */
  getWorkspace(workspaceId: string): Promise<Workspace | null>;
  /** List Workspaces, optionally filtered to one substrate. */
  listWorkspaces(filter?: { substrate?: WorkspaceSubstrate }): Promise<Workspace[]>;

  /** Insert or replace a TaskRun bound to a Workspace. */
  upsertRun(run: TaskRun): Promise<void>;
  /** Fetch a TaskRun by id, or null. */
  getRun(runId: string): Promise<TaskRun | null>;

  /** Append a RunEvent (the audit trail / live-terminal source). */
  appendEvent(event: RunEvent): Promise<void>;
  /** List RunEvents for a run in append order. */
  listEvents(runId: string): Promise<RunEvent[]>;
}
