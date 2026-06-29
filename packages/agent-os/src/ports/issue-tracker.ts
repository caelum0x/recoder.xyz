import type { Artifact, TaskSpec } from '../domain';

/**
 * IssueTrackerPort is the seam between the Agent OS canonical task store and an
 * external issue tracker (for example `bd`/beads). Agent OS owns the contract;
 * concrete trackers are replaceable adapters that implement this port.
 *
 * The port is intentionally narrow and synchronous-friendly so that simple CLI
 * backed adapters (which shell out) and async service backed adapters can both
 * satisfy it: methods may return either a value or a promise of that value.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * A reference to a task as it lives in the external tracker. Agent OS keeps the
 * canonical `TaskSpec`; this is only the back-reference needed to round-trip.
 */
export type IssueTrackerRef = {
  /** Tracker-native issue identifier (e.g. a beads issue id). */
  externalId: string;
  /** Name of the tracker implementation that owns this ref. */
  tracker: string;
};

/**
 * Pulls open/ready external issues into canonical Agent OS `TaskSpec`s, and
 * pushes canonical task state (plus optional artifacts) back to the tracker.
 *
 * Implementations live in adapter packages (e.g. `@recoder/beads-adapter`) and
 * must not own canonical task state — they translate to and from it.
 */
export interface IssueTrackerPort {
  /** Stable identifier of this tracker adapter (e.g. "beads"). */
  readonly id: string;

  /**
   * Import the tracker's ready/actionable issues as canonical task specs for a
   * given Agent OS space.
   */
  importReadyTasks(input: { spaceId: string; repo?: string }): MaybePromise<TaskSpec[]>;

  /**
   * Push a single canonical task (and any delivery artifacts) back to the
   * tracker, returning the external reference that was synced.
   */
  exportTask(input: { task: TaskSpec; artifacts?: Artifact[] }): MaybePromise<IssueTrackerRef>;
}
