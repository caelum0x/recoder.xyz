/**
 * The Brain — one shared memory, assembled once per repo and reused by every
 * agent. git-nexus's context-pack is the assembly core; mem0 recall, context7
 * docs, and the beads task graph are fused into the same read.
 *
 * Repo intelligence now flows through {@link RepoIntelPort}, the seam where the
 * real ts/recodergit knowledge-graph engine is merged in (see brain.md). Recall,
 * docs, the task graph, and desktop activity flow through their ports. The core
 * depends only on the ports, never the concrete engines.
 *
 * Assemble-once cache: every assemble is content-addressed on
 * (repoRoot, revision, task/taskId, source-set). The first read computes the
 * fused BrainContext ONCE; every later read for the same key is a cache HIT that
 * makes ZERO source calls and reuses the same packed object — the wedge's whole
 * point. A new git HEAD changes the revision, which changes the key, which
 * invalidates stale repo intelligence. On each HIT the cache attributes the
 * tokens that did not have to be re-spent into a running `tokensSaved` total —
 * the headline "X tokens saved by the shared brain" metric, surfaced via
 * {@link Brain.cacheStats} and the cache doctor.
 */

import {
  createContextPack,
  type ContextPack,
  type CreateContextPackInput,
} from "@recoder/recodergit";
import type { TaskSpec } from "@recoder/agent-os";
import type {
  BrainActivity,
  BrainActivityProfile,
  BrainContext,
  BrainEvent,
  BrainMemory,
  BrainQuery,
  SourceProvenance,
} from "./domain";
import type {
  ActivityPort,
  BrainContextCacheStore,
  ClockPort,
  DocsPort,
  MemoryPort,
  RepoIntelPort,
  TaskGraphPort,
} from "./ports";
import { systemClock } from "./ports";
import { createRepoIntelAuto } from "./repo/recodergit-repo-intel";
import { createInMemoryContextCache } from "./persistence/memory-context-cache";
import {
  ContextCache,
  buildCacheKey,
  estimateContextTokens,
  resolveRevision,
  runSource,
  buildProvenance,
  type CacheStats,
  type GitRunner,
} from "./engine";

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
  /**
   * The assemble-once cache store. Defaults to an in-process store
   * ({@link createInMemoryContextCache}); inject a Postgres/Redis-backed store to
   * share assembled contexts across processes/agents.
   */
  cacheStore?: BrainContextCacheStore;
  /** Clock for deterministic timestamps (defaults to the system clock). */
  clock?: ClockPort;
  /**
   * Resolve the repo's git revision (HEAD + dirty) for the cache key. Injected in
   * tests for determinism; the real default shells `git`.
   */
  runGit?: GitRunner;
}

const DEFAULT_LIMIT = 8;

const EMPTY_ACTIVITY: BrainContext["activity"] = { recent: [], profile: null };

/** Which sources are wired — folded into the cache key (toggling => new key). */
function sourceSetOf(deps: BrainDeps): string[] {
  const set: string[] = ["repo"]; // repo is always present (auto-resolved)
  if (deps.memory) set.push("memory");
  if (deps.docs) set.push("docs");
  if (deps.tasks) set.push("tasks");
  if (deps.activity) set.push("activity");
  return set;
}

export class Brain {
  private readonly repo: RepoIntelPort;
  private readonly clock: ClockPort;
  private readonly cache: ContextCache;

  constructor(private readonly deps: BrainDeps = {}) {
    this.repo = deps.repo ?? createRepoIntelAuto();
    this.clock = deps.clock ?? systemClock;
    this.cache = new ContextCache(
      deps.cacheStore ?? createInMemoryContextCache(),
    );
  }

  /**
   * One read. Repo intelligence + recall + docs + task graph + desktop
   * activity, fused into a single BrainContext that the whole agent team shares.
   *
   * Assemble-once: the result is content-addressed and cached. The first call for
   * a given (repoRoot, revision, task, source-set) assembles ONCE; every later
   * call is a cache HIT that makes zero source calls and returns the same object,
   * accumulating `tokensSaved`. A new git HEAD invalidates the cache by changing
   * the revision (and thus the key).
   */
  async assemble(
    query: BrainQuery,
    repoInput?: CreateContextPackInput,
  ): Promise<BrainContext> {
    const limit = query.limit ?? DEFAULT_LIMIT;

    // Resolve the revision FIRST — it is the cache-key spine (a new commit ⇒ a
    // new head ⇒ a new key ⇒ stale repo intel naturally ages out).
    const revision = await resolveRevision(query.repoRoot, {
      runGit: this.deps.runGit,
      clock: this.clock,
    });

    const key = buildCacheKey({
      repoRoot: query.repoRoot,
      taskId: repoInput?.task.taskId,
      task: query.task,
      focusFiles: query.focusFiles ?? [],
      limit,
      revision,
      sourceSet: sourceSetOf(this.deps),
    });

    // HIT ⇒ reuse the same fused object, zero source calls, account the savings.
    const lookup = await this.cache.lookup(key);
    if (lookup.hit && lookup.context) {
      return lookup.context;
    }

    // MISS ⇒ assemble once, then cache for everyone after.
    const context = await this.assembleFresh(query, repoInput, limit, revision);
    return this.cache.store_(key, context);
  }

  /**
   * The MISS path: actually fan out to the sources, each behind its port and
   * degrade-safe, and fuse them into one BrainContext with truthful provenance +
   * a real token estimate.
   */
  private async assembleFresh(
    query: BrainQuery,
    repoInput: CreateContextPackInput | undefined,
    limit: number,
    revision: BrainContext["revision"],
  ): Promise<BrainContext> {
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

    // Every source runs behind its port, degrade-safe, recording truthful
    // provenance. A dark source contributes its empty value + a "degraded" entry
    // — it never fails the read, and is never reported as having contributed.
    const [repoOut, memoryOut, docsOut, tasksOut, activityOut] =
      await Promise.all([
        runSource<ContextPack>({
          source: "repo",
          run: () => this.repo.contextPack(input),
          // On a repo-engine failure, degrade to a real (empty) context pack
          // keyed to this task/repo so the rest of the read stays well-shaped.
          fallback: createContextPack(input),
          countItems: (pack) => pack.sourceRefs?.length ?? 0,
          configuredDetail: "recodergit context pack",
          notConfiguredDetail: "repo intel not wired",
        }),
        runSource<BrainMemory[]>({
          source: "memory",
          run: this.deps.memory
            ? () => this.deps.memory!.recall(query.task, limit)
            : null,
          fallback: [],
          countItems: (rows) => rows.length,
          configuredDetail: "mem0 recall",
          notConfiguredDetail: "memory port not wired (mem0 — set MEM0_BASE_URL)",
        }),
        runSource<BrainContext["docs"]>({
          source: "docs",
          run: this.deps.docs
            ? () => this.deps.docs!.lookup(query.task, limit)
            : null,
          fallback: [],
          countItems: (rows) => rows.length,
          configuredDetail: "context7 docs",
          notConfiguredDetail:
            "docs port not wired (context7 — set CONTEXT7_API_KEY)",
        }),
        runSource<BrainContext["tasks"]>({
          source: "tasks",
          run: this.deps.tasks
            ? () => this.deps.tasks!.related(query.task, limit)
            : null,
          fallback: [],
          countItems: (rows) => rows.length,
          configuredDetail: "beads task graph",
          notConfiguredDetail: "task graph port not wired (beads/bd)",
        }),
        this.runActivity(query.task, limit),
      ]);

    const repo = repoOut.value;
    const activity = activityOut.value;

    const provenance = buildProvenance([
      repoOut.provenance,
      memoryOut.provenance,
      docsOut.provenance,
      tasksOut.provenance,
      activityOut.provenance,
    ]);

    const context: BrainContext = {
      repo,
      memories: memoryOut.value,
      docs: docsOut.value,
      tasks: tasksOut.value,
      activity,
      revision,
      provenance,
      assembledAt: this.clock.nowIso(),
    };
    // Stamp the real token cost so a later HIT attributes the right savings.
    return { ...context, estimatedTokens: estimateContextTokens(context) };
  }

  /**
   * Run the desktop-activity source (two calls: recent recall + profile) as one
   * degrade-safe unit, recording a single provenance entry for the activity
   * source. Absence/failure ⇒ the empty activity shape + a degraded entry.
   */
  private async runActivity(
    task: string,
    limit: number,
  ): Promise<{
    value: BrainContext["activity"];
    provenance: SourceProvenance;
  }> {
    if (!this.deps.activity) {
      return {
        value: EMPTY_ACTIVITY,
        provenance: {
          source: "activity",
          contributed: false,
          itemCount: 0,
          degradeReason: "not_configured",
          detail: "activity port not wired (continuum)",
        },
      };
    }
    return runSource<BrainContext["activity"]>({
      source: "activity",
      run: async () => {
        const [recent, profile] = await Promise.all([
          this.deps.activity!.recall(task, limit) ??
            Promise.resolve([] as BrainActivity[]),
          this.deps.activity!.profile() ??
            Promise.resolve(null as BrainActivityProfile | null),
        ]);
        return { recent, profile };
      },
      fallback: EMPTY_ACTIVITY,
      countItems: (value) => value.recent.length + (value.profile ? 1 : 0),
      configuredDetail: "continuum activity",
      notConfiguredDetail: "activity port not wired (continuum)",
    });
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
   * to title), and `limit` is honored when provided. Because the taskId is folded
   * into the cache key, two agents assembling the SAME task over the same revision
   * share one cached context.
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
   * Invalidate the assemble-once cache for a repo — call on a known git change or
   * an explicit bust. Returns the number of cached contexts dropped. Cheap and
   * safe to call even when nothing is cached (returns 0). A new commit also
   * invalidates implicitly via the revision-keyed cache, so this is mostly for
   * forcing a rebuild within the same revision (e.g. after a working-tree edit).
   */
  async refresh(repoRoot: string): Promise<number> {
    return this.cache.invalidateRepo(repoRoot);
  }

  /**
   * The headline value accounting: cache hit rate + total tokens saved by reuse.
   * The product reports `tokensSaved` as "X tokens saved by the shared brain".
   */
  cacheStats(): CacheStats {
    return this.cache.stats();
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
