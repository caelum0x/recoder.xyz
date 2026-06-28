/**
 * The Brain — one shared memory, assembled once per repo and reused by every
 * agent. git-nexus's context-pack is the assembly core; mem0 recall, context7
 * docs, and the beads task graph are fused into the same read.
 *
 * Repo intelligence now flows through {@link RepoIntelPort}, the seam where the
 * real ts/recodergit knowledge-graph engine is merged in (see brain.md). Recall,
 * docs, the task graph, and desktop activity flow through their ports. The core
 * depends only on the ports, never the concrete engines.
 */

import { type CreateContextPackInput } from "@recoder/recodergit";
import type { TaskSpec } from "@recoder/agent-os";
import type {
  BrainActivity,
  BrainActivityProfile,
  BrainContext,
  BrainEvent,
  BrainMemory,
  BrainQuery,
} from "./domain";
import type {
  ActivityPort,
  DocsPort,
  MemoryPort,
  RepoIntelPort,
  TaskGraphPort,
} from "./ports";
import { createRepoIntelAuto } from "./repo/recodergit-repo-intel";

export interface BrainDeps {
  /**
   * Repo intelligence engine. Defaults to the degrade-safe RecoderGit chain
   * ({@link createRepoIntelAuto}): the persistent MCP graph when
   * `RECODERGIT_MCP_URL` is set, else the built `recodergit` CLI engine
   * (discovered via the engine-resolver / `RECODERGIT_BIN`), else the mock-backed
   * context pack. Absence only ever costs richness, never correctness.
   */
  repo?: RepoIntelPort;
  /** Semantic recall, bound to the owned mem0. */
  memory?: MemoryPort;
  /** External docs, bound to the owned context7. */
  docs?: DocsPort;
  /** Durable task graph, bound to the owned beads. */
  tasks?: TaskGraphPort;
  /** Desktop-activity memory, bound to the owned continuum. */
  activity?: ActivityPort;
  /** How git-nexus builds the repo map (defaults to indexing repoRoot). */
  repoMap?: (q: BrainQuery) => CreateContextPackInput;
}

const DEFAULT_LIMIT = 8;

const EMPTY_ACTIVITY: BrainContext["activity"] = { recent: [], profile: null };

export class Brain {
  private readonly repo: RepoIntelPort;

  constructor(private readonly deps: BrainDeps = {}) {
    this.repo = deps.repo ?? createRepoIntelAuto();
  }

  /**
   * One read. Repo intelligence + recall + docs + task graph + desktop
   * activity, fused into a single BrainContext that the whole agent team shares.
   */
  async assemble(
    query: BrainQuery,
    repoInput?: CreateContextPackInput,
  ): Promise<BrainContext> {
    const limit = query.limit ?? DEFAULT_LIMIT;

    // git-nexus assembles around a TaskSpec. Precedence:
    //   1. an explicit pre-built input (assembleForTask passes the full spec),
    //   2. a caller-supplied repoMap mapping, else
    //   3. a minimal task synthesized from the query (createContextPack only reads
    //      task.targetPaths, so the minimal shape is sufficient for the engine).
    const input: CreateContextPackInput =
      repoInput ??
      this.deps.repoMap?.(query) ?? {
        task: { targetPaths: query.focusFiles ?? [] } as CreateContextPackInput["task"],
        repoRoot: query.repoRoot,
      };

    // Repo intel + recall + docs + tasks + activity run together; the same read
    // is reused. Each source defaults to empty/null when its port is absent.
    const [repo, memories, docs, tasks, activityRecent, activityProfile] =
      await Promise.all([
        this.repo.contextPack(input),
        this.deps.memory?.recall(query.task, limit) ?? Promise.resolve([]),
        this.deps.docs?.lookup(query.task, limit) ?? Promise.resolve([]),
        this.deps.tasks?.related(query.task, limit) ?? Promise.resolve([]),
        this.deps.activity?.recall(query.task, limit) ??
          Promise.resolve([] as BrainActivity[]),
        this.deps.activity?.profile() ??
          Promise.resolve(null as BrainActivityProfile | null),
      ]);

    const activity: BrainContext["activity"] = this.deps.activity
      ? { recent: activityRecent, profile: activityProfile }
      : EMPTY_ACTIVITY;

    return {
      repo,
      memories,
      docs,
      tasks,
      activity,
      assembledAt: new Date().toISOString(),
    };
  }

  /**
   * Assemble around a REAL {@link TaskSpec} — the on-path entry an orchestrator
   * uses when it already has a compiled task. Unlike {@link assemble} (which
   * synthesizes a minimal task from a free-text query), this feeds the engine the
   * full spec: its `targetPaths` drive the repo-intel symbol resolution + impact,
   * and its `title`/`goal` drive recall/docs/tasks/activity. The resulting
   * BrainContext therefore carries real repo provenance (`repo.sourceRefs`) keyed
   * to the task's own paths.
   *
   * Degrade-safe by construction: it reuses {@link assemble}, so a missing engine
   * only costs richness. The `query` text defaults to the spec's goal (falling back
   * to title), and `limit` is honored when provided.
   */
  async assembleForTask(
    task: TaskSpec,
    repoRoot: string,
    options: { query?: string; limit?: number } = {},
  ): Promise<BrainContext> {
    const queryText = options.query ?? task.goal ?? task.title;
    const query: BrainQuery = {
      task: queryText,
      repoRoot,
      focusFiles: task.targetPaths,
      limit: options.limit,
    };
    // Feed the engine the FULL spec (taskId + targetPaths) so the context pack's
    // taskId, impact report, and provenance are keyed to the real task — not a
    // synthesized one.
    const repoInput: CreateContextPackInput = { task, repoRoot };
    return this.assemble(query, repoInput);
  }

  /**
   * Focused semantic recall — the memory port only, no full assemble. The MCP
   * `brain_recall` tool maps to this so an agent can pull prior knowledge
   * without paying for a whole context assembly. Degrade-safe: yields [] when no
   * memory adapter is wired (missing key/tool is never an error).
   */
  async recall(query: string, limit: number = DEFAULT_LIMIT): Promise<BrainMemory[]> {
    return (await this.deps.memory?.recall(query, limit)) ?? [];
  }

  /**
   * Recent desktop/agent activity (newest-first, deduped) — the activity port's
   * `recent()` (continuum catchUp). Degrade-safe: [] when no activity adapter is
   * wired. The MCP `brain_activity` tool (no-query mode) maps to this so an agent
   * gets "what the user just did" without a full assemble.
   */
  async recentActivity(limit: number = DEFAULT_LIMIT): Promise<BrainActivity[]> {
    return (await this.deps.activity?.recent?.(limit)) ?? [];
  }

  /**
   * One-line "who is this user" activity snapshot (no LLM). Degrade-safe: null
   * when no activity adapter or no activity. Paired with recentActivity in the
   * `brain_activity` tool's no-query mode.
   */
  async activitySnapshot(): Promise<string | null> {
    return (await this.deps.activity?.snapshot?.()) ?? null;
  }

  /**
   * Grounded Q&A over activity (continuum answerQuery): evidence rows (always)
   * plus a synthesized answer when an LLM is wired. Degrade-safe: answer null +
   * sources [] when no activity adapter. The MCP `brain_activity` tool's query
   * mode maps to this.
   */
  async answerActivity(
    query: string,
    limit: number = DEFAULT_LIMIT,
  ): Promise<{ answer: string | null; sources: BrainActivity[] }> {
    return (
      (await this.deps.activity?.answer?.(query, limit)) ?? {
        answer: null,
        sources: [] as BrainActivity[],
      }
    );
  }

  /** Write an agent's outcome back so the next assemble() is richer. */
  async record(event: BrainEvent): Promise<void> {
    if (event.kind === "memory") {
      await this.deps.memory?.remember(event.text, event.metadata);
      return;
    }
    await this.deps.tasks?.update(event.id, event.status, event.note);
  }
}

export function createBrain(deps?: BrainDeps): Brain {
  return new Brain(deps);
}
