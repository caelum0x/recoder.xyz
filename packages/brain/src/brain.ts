/**
 * The Brain — one shared memory, assembled once per repo and reused by every
 * agent. git-nexus's context-pack is the assembly core; mem0 recall, context7
 * docs, the beads task graph, and (when wired) passage-level @recoder/rag
 * vector-store retrieval are fused into the same read.
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
  BrainPassage,
  BrainPreprocessedDocument,
  BrainQuery,
  BrainRawDocument,
  SourceProvenance,
} from "./domain";
import type {
  ActivityPort,
  BrainContextCacheStore,
  ChunkerPort,
  ClockPort,
  DocsPort,
  DocumentPreprocessorPort,
  MemoryPort,
  RepoIntelPort,
  TaskGraphPort,
  VectorStorePort,
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
  /**
   * Document preprocessing for RAG/context ingest, bound to the owned
   * @recoder/document-preprocessor. Turns raw docs (text/markdown/PDF) into
   * clean text the brain can ingest into memory via {@link Brain.ingestDocument}.
   */
  preprocessor?: DocumentPreprocessorPort;
  /**
   * RAG chunker for document ingest, bound to the owned @recoder/rag chunker.
   * When wired, {@link Brain.ingestDocument} splits a preprocessed document into
   * overlapping, size-bounded chunks and remembers EACH chunk so a later recall
   * surfaces the precise passage. Its signature matches @recoder/rag's
   * `ChunkerFunction`, so the real engine wires with zero adaptation:
   * `createBrain({ chunker: { chunk: createDefaultChunker() } })`.
   * Degrade-safe: with no chunker, ingest stores the whole document as one
   * memory exactly as before.
   */
  chunker?: ChunkerPort;
  /**
   * Passage-level semantic retrieval over the brain's ingested document corpus,
   * bound to the owned @recoder/rag vector store. When wired, each assemble runs
   * a by-text similarity search and fuses the most relevant passages into
   * {@link BrainContext.passages}, with truthful provenance under the `passages`
   * source. Degrade-safe and ADDITIVE: with no store wired, assemble omits
   * passages entirely (no context field, no provenance entry) — exactly the
   * prior behavior. A host wires @recoder/rag's `QueryService` here via a thin
   * adapter mapping each `QueryResult` to a {@link BrainPassage}.
   */
  vectorStore?: VectorStorePort;
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
  if (deps.vectorStore) set.push("passages");
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
   * activity + (when wired) RAG passages, fused into a single BrainContext that
   * the whole agent team shares.
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
    const [repoOut, memoryOut, docsOut, tasksOut, activityOut, passagesOut] =
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
        this.runPassages(query.task, limit),
      ]);

    const repo = repoOut.value;
    const activity = activityOut.value;

    // `passages` is additive: it only joins provenance + the context when the
    // vector-store port is wired. When absent, `passagesOut` is null and the
    // assembled context is byte-for-byte the prior shape (no field, no entry).
    const provenance = buildProvenance([
      repoOut.provenance,
      memoryOut.provenance,
      docsOut.provenance,
      tasksOut.provenance,
      activityOut.provenance,
      ...(passagesOut ? [passagesOut.provenance] : []),
    ]);

    const context: BrainContext = {
      repo,
      memories: memoryOut.value,
      docs: docsOut.value,
      tasks: tasksOut.value,
      activity,
      ...(passagesOut ? { passages: passagesOut.value } : {}),
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
   * Run the passage-level RAG retrieval source (vector-store port), degrade-safe.
   *
   * Returns `null` when no vector-store port is wired — the additive contract: an
   * unwired passages source contributes NOTHING to the assembled context, not
   * even a "degraded" provenance entry, so a brain with no RAG store produces the
   * exact prior shape. When wired, it runs a by-text similarity search and
   * records a truthful `passages` provenance entry (a wired store that fails or
   * is unprovisioned degrades to empty, never failing the read).
   */
  private async runPassages(
    task: string,
    limit: number,
  ): Promise<{
    value: BrainPassage[];
    provenance: SourceProvenance;
  } | null> {
    if (!this.deps.vectorStore) {
      return null;
    }
    return runSource<BrainPassage[]>({
      source: "passages",
      run: () => this.deps.vectorStore!.search(task, limit),
      fallback: [],
      countItems: (rows) => rows.length,
      configuredDetail: "rag vector store",
      notConfiguredDetail: "vector store port not wired (@recoder/rag)",
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

  /**
   * RAG/context ingest: preprocess a raw document (text/markdown/PDF) into clean
   * text via the document-preprocessor port, then remember it through the memory
   * port so a later {@link Brain.recall} / {@link Brain.assemble} can surface it.
   *
   * Returns the preprocessed document (title + normalized text + page count) so
   * the caller can inspect what was ingested. Degrade-safe end to end: with no
   * preprocessor wired, nothing is preprocessed and an empty result is returned;
   * with a preprocessor but no memory port, the text is returned but not stored.
   * `remembered` reports whether the text was actually written to memory.
   *
   * RAG chunking: when a {@link ChunkerPort} (the owned @recoder/rag chunker) is
   * wired, the preprocessed text is split into overlapping, size-bounded chunks
   * and EACH chunk is remembered separately — keyed with its `chunkIndex` /
   * `chunkCount` — so a later {@link Brain.recall} surfaces the precise passage
   * rather than one undifferentiated blob. With no chunker wired, the whole
   * document text is remembered as a single memory exactly as before.
   */
  async ingestDocument(
    doc: BrainRawDocument,
  ): Promise<BrainPreprocessedDocument & { remembered: boolean }> {
    if (!this.deps.preprocessor) {
      return { title: doc.title, text: "", pageCount: 0, remembered: false };
    }
    const result = await this.deps.preprocessor.preprocess(doc);
    if (!result.text || !this.deps.memory) {
      return { ...result, remembered: false };
    }

    const baseMetadata = {
      kind: "document" as const,
      title: result.title,
      pageCount: result.pageCount,
    };

    // RAG path: split into chunks and remember each, so recall is passage-level.
    const chunks = this.chunkText(result.text);
    if (chunks.length > 1) {
      await Promise.all(
        chunks.map((chunk, index) =>
          this.deps.memory!.remember(chunk, {
            ...baseMetadata,
            chunkIndex: index,
            chunkCount: chunks.length,
          }),
        ),
      );
      return { ...result, remembered: true };
    }

    // No chunker (or a single chunk): one whole-document memory, as before.
    await this.deps.memory.remember(result.text, baseMetadata);
    return { ...result, remembered: true };
  }

  /**
   * Apply the wired RAG chunker to text, degrade-safe. Returns the chunks when a
   * chunker is wired and produces a non-empty, multi-piece split; otherwise the
   * single-element `[text]` so the caller falls back to whole-document ingest. A
   * chunker that throws never fails ingest — it degrades to the whole document.
   */
  private chunkText(text: string): string[] {
    if (!this.deps.chunker) {
      return [text];
    }
    try {
      const chunks = this.deps.chunker.chunk(text).filter((c) => c.length > 0);
      return chunks.length > 0 ? chunks : [text];
    } catch {
      return [text];
    }
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
