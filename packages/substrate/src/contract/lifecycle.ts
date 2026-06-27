/**
 * SubstrateLifecycleEvent — a typed event union for observing a substrate run.
 *
 * New in the package (design §4.1): the observability layer and run-tailer emit
 * these so the audit trail does not string-match. Carries the substrate id and
 * the workspaceId for correlation; never carries secrets.
 */
import type { WorkspaceSubstrate } from '@recoder/agent-os';

interface SubstrateLifecycleBase {
  substrateId: WorkspaceSubstrate;
  workspaceId: string;
  /** ISO-8601 timestamp the event occurred. */
  at: string;
}

export interface SubstrateProvisionedEvent extends SubstrateLifecycleBase {
  kind: 'provisioned';
  /** Isolation reference created (worktree path or sandbox id). */
  isolationRef: string;
}

export interface SubstrateLaunchedEvent extends SubstrateLifecycleBase {
  kind: 'launched';
  /** Handle ref of the launched work (tmux session name or sandbox id). */
  ref: string;
}

export interface SubstrateCapturedEvent extends SubstrateLifecycleBase {
  kind: 'captured';
  /** Number of characters captured in this tick (delta-capped upstream). */
  chars: number;
}

export interface SubstrateFinishedEvent extends SubstrateLifecycleBase {
  kind: 'finished';
  /** Whether the agent exited successfully (when an exit code is known). */
  ok: boolean;
  exitCode?: number;
}

export interface SubstrateTornDownEvent extends SubstrateLifecycleBase {
  kind: 'torn-down';
  /** Whether the isolation (worktree/sandbox) was removed. */
  isolationRemoved: boolean;
}

export type SubstrateLifecycleEvent =
  | SubstrateProvisionedEvent
  | SubstrateLaunchedEvent
  | SubstrateCapturedEvent
  | SubstrateFinishedEvent
  | SubstrateTornDownEvent;
