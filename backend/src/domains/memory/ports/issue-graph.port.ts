/**
 * `IssueGraphService` — the cohesive beads (`bd`) module facet the MEMORY domain
 * owns (AGENTS.md: "beads IS the memory layer"). It composes typed verbs over
 * the ONE raw transport the engines domain owns (`BeadsAdapter` behind
 * `EngineClientPort` — the single `bd` spawner/argv owner in `backend/src`);
 * this domain never spawns `bd` or imports `engines/beads-bin` itself.
 *
 * DEGRADE LAW (per verb): reads return `[]`/`null` with a logged truthful
 * reason; writes return `false`/`undefined` with a warn; NOTHING throws across
 * the facet; nothing is fabricated. Async throughout (the transport is
 * `EngineClientPort.invoke`).
 */

/** A work item summary as the issue graph reports it (`bd search`/`bd stale`). */
export interface IssueSummary {
  /** bd issue id (provenance ref). */
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly labels: readonly string[];
}

/** A ready-to-work issue (`bd ready --json`): unblocked open work. */
export interface ReadyIssue extends IssueSummary {
  readonly description: string;
  /** bd priority as reported (numeric in current builds). */
  readonly priority?: number;
  readonly issueType?: string;
}

/** An issue with open blockers (`bd blocked --json`). */
export interface BlockedIssue extends IssueSummary {
  /** The ids of the issues blocking this one (empty when bd omits them). */
  readonly blockedBy: readonly string[];
}

/**
 * One issue in full (`bd show [--long] --json`). `--long` surfaces the
 * accumulated NOTE evidence (`comments`) and the `dependencies` lineage a
 * launcher weaves into an agent prompt — shapes bd owns, passed through raw.
 */
export interface IssueDetail extends IssueSummary {
  readonly description: string;
  readonly comments?: readonly unknown[];
  readonly dependencies?: readonly unknown[];
}

/** A memory entry recalled from the issue graph (candidate or promoted). */
export interface BeadsMemoryEntry {
  /** bd issue id (provenance ref). */
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly status: string;
  readonly labels: readonly string[];
}

/** Input to remember a candidate wisp in the issue graph. */
export interface BeadsRememberInput {
  readonly title: string;
  readonly body: string;
  /** Optional scope label suffix (`memory-scope:<scope>`). */
  readonly scope?: string;
  /** Optional bd id this memory was discovered from (adds a dep edge). */
  readonly discoveredFrom?: string;
}

/** The truthful outcome of a beads durability flush (`bd vc commit`). */
export interface BeadsFlushResult {
  /** True only when `bd vc commit` created a new Dolt commit. */
  readonly committed: boolean;
  /** The new commit hash when one was created. */
  readonly hash?: string;
  /** Truthful reason when nothing was committed (clean graph, or `bd` down). */
  readonly reason?: string;
}

/** Truthful facet liveness (probed through the engine seam, never fabricated). */
export interface IssueGraphHealth {
  readonly available: boolean;
  readonly reason?: string;
  readonly version?: string;
}

/** The cohesive beads module facet (see file header for the degrade law). */
export interface IssueGraphService {
  // -- liveness (truthful; probes `bd version` via the engine seam) -----------
  health(): Promise<IssueGraphHealth>;

  // -- work reads -------------------------------------------------------------
  /** `bd ready --json` — unblocked open work. `[]` when down. */
  ready(): Promise<readonly ReadyIssue[]>;
  /** `bd show [--long] --json` — one issue (+ notes/lineage). `null` when down. */
  show(id: string, opts?: { long?: boolean }): Promise<IssueDetail | null>;
  /** `bd search --json` — text search, optionally label/status filtered. */
  search(
    query: string,
    opts?: { label?: string; status?: string; limit?: number },
  ): Promise<readonly IssueSummary[]>;
  /** `bd blocked --json` — issues with open blockers. `[]` when down. */
  blocked(opts?: { parent?: string }): Promise<readonly BlockedIssue[]>;
  /** `bd dep tree --json` — the dependency tree rooted at an issue. */
  depTree(
    id: string,
    opts?: { direction?: 'down' | 'up' | 'both'; maxDepth?: number },
  ): Promise<unknown | null>;
  /** `bd dep list --json` — the flat dependency/dependent records. */
  depList(
    id: string,
    opts?: { direction?: 'down' | 'up'; type?: string },
  ): Promise<unknown | null>;
  /** `bd count --json` — issue counts, optionally grouped by an attribute. */
  stats(opts?: {
    groupBy?: 'status' | 'priority' | 'type' | 'assignee' | 'label';
    status?: string;
  }): Promise<unknown | null>;
  /** `bd stale --json` — in-flight issues with no recent activity. */
  stale(opts?: { limit?: number }): Promise<readonly IssueSummary[]>;

  // -- work writes (every call carries `actor` for the bd audit trail) --------
  /** `bd create --json` — file new work. `null` when down (never fabricated). */
  create(
    input: { title: string; description?: string; labels?: string; discoveredFrom?: string },
    actor: string,
  ): Promise<{ id: string } | null>;
  /** `bd update --json` — patch an issue (status). `false` when down. */
  update(id: string, patch: { status?: string }, actor: string): Promise<boolean>;
  /** `bd update --claim --json` — atomically claim an issue. `false` when down. */
  claim(id: string, actor: string): Promise<boolean>;
  /** `bd close --reason … --json`. `false` when down. */
  close(id: string, reason: string, actor: string): Promise<boolean>;
  /** `bd note --json` — append evidence to an issue/memory. `false` when down. */
  note(id: string, text: string, actor: string): Promise<boolean>;

  // -- memory verbs (the wisp→promote candidate lifecycle) --------------------
  /**
   * `bd create --ephemeral -l memory[,memory-scope:<s>]` — persist a memory
   * CANDIDATE as an ephemeral wisp. Returns the bd id, or `undefined` when down
   * (truthful degrade — the caller may still hold the candidate itself).
   */
  remember(input: BeadsRememberInput, actor: string): Promise<string | undefined>;
  /** `bd search --label memory --status all` — candidates + promoted. `[]` when down. */
  recallMemories(
    query: string,
    opts?: { scope?: string; limit?: number },
  ): Promise<readonly BeadsMemoryEntry[]>;
  /**
   * `bd promote` — the REVIEW step: wisp → permanent Dolt-versioned bead.
   * MODULE-INTERNAL: only the governed memory-lifecycle accept path calls it.
   */
  promote(id: string, actor: string): Promise<boolean>;

  // -- durability (Dolt version control) --------------------------------------
  /** `bd vc status` — the raw sync/version-control status. `null` when down. */
  vcStatus(): Promise<unknown | null>;
  /**
   * `bd vc commit -m … --json` — seal the working-set as a durable, versioned
   * checkpoint. A clean graph yields bd's truthful `committed:false`; `bd` down
   * yields `{ committed:false, reason }`. Never fabricates a commit.
   */
  flush(message?: string): Promise<BeadsFlushResult>;
  /** `bd gc` — decay closed/expired wisps + compact. Truthful `{ran:false}` when down. */
  gc(): Promise<{ ran: boolean; reason?: string }>;
}
