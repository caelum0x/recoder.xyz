/**
 * SquadIssuePort — the narrow issue-graph READ slice the squad autopilot (and
 * the board read model) consume. Declared in the CONSUMER domain (agent-os);
 * the concrete adapter is built at the composition root over the memory-owned
 * issue-graph module facet (`memory.issueGraph()`), so agent-os never imports
 * the memory domain and never touches `bd`/the engines transport itself.
 *
 * Because agent-os is built BEFORE memory in bootstrap (memory needs
 * `agentOs.repository()` — conflict #3), the port is LATE-BOUND via
 * `AgentOsModule.attachIssueGraph`, exactly like the conductor dispatch seam
 * (`attachSquadAutopilotConductor`). Unattached ⇒ the autopilot ticks a
 * truthful `degraded` and health reports "issue-graph seam not attached".
 *
 * DEGRADE LAW (inherited from the facet): reads resolve `[]`/`null` with the
 * reason logged at the facet; `health()` carries the truthful reason. Nothing
 * throws across the port and nothing is fabricated.
 */

/** A ready-to-work issue (`bd ready --json`): unblocked open work. */
export interface SquadReadyIssue {
  /** bd issue id (the conductor dispatch `taskId`). */
  readonly id: string;
  readonly title: string;
  readonly description?: string;
}

/**
 * One issue in full (`bd show --long --json`): the accumulated NOTE evidence
 * (`comments`) + the `dependencies` lineage prior agents wrote onto the issue,
 * passed through raw (shapes bd owns) for the launch-prompt weave.
 */
export interface SquadIssueDetail extends SquadReadyIssue {
  readonly comments?: readonly unknown[];
  readonly dependencies?: readonly unknown[];
}

/** An in-flight issue with no recent activity (`bd stale --json`). */
export interface SquadStaleIssue {
  /** bd issue id. */
  readonly id: string;
  readonly title: string;
  readonly status: string;
}

/** The issue-graph read slice the squad autopilot consumes (see file header). */
export interface SquadIssuePort {
  /** Truthful liveness of the issue graph (probed through the module facet). */
  health(): Promise<{ available: boolean; reason?: string }>;
  /** `bd ready --json` — unblocked open work. `[]` when the graph is down. */
  ready(): Promise<readonly SquadReadyIssue[]>;
  /** `bd show <id> --long --json` — the lineage read. `null` when down/absent. */
  show(id: string, opts: { long: true }): Promise<SquadIssueDetail | null>;
  /** `bd stale --json` — stalled in-flight work for the board. `[]` when down. */
  stale(): Promise<readonly SquadStaleIssue[]>;
}
