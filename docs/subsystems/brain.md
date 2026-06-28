# Subsystem: Brain (`packages/brain`)

> Recoder's **shared memory**. Repo intelligence + semantic recall + external docs + a
> durable task graph + history, **assembled once per repo/task and reused by every agent**.
> The whole point is to stop every coding agent from re-reading the repo and re-paying for
> the same context in tokens. The Brain does the expensive assembly once, caches it, fuses
> the four sources into one `BrainContext`, and hands the same packed object to every runtime
> (Claude Code, Codex, Recoder Code, browser agents) on every read.

Status (2026-06-28): **BUILT & GREEN.** All 5 real sources sit behind ports (gitnexus ·
continuum · mem0 · context7 · beads), wired into `docker-backend` `BrainService` (flag-gated,
default off). The token-waste-killer is now real: **assemble-once content-addressed cache**
(`packages/brain/src/persistence/memory-context-cache.ts`) + a **tokens-saved metric**
(`engine/token-estimator.ts` + `engine/context-tokens.ts`) + **degrade-safe source-lighting**
for mem0/context7 (config-gated, *configured-not-proven* until keys present). **161 tests pass**
(`node --test --import tsx`, re-run this session); committed `cfd181394`. The reference seam at
`packages/brain/src/{brain.ts,types.ts,index.ts}` has grown into the production subsystem this
doc describes. The `repo/` module is the richest — it merges the real RecoderGit
code-knowledge-graph engine (Tree-sitter → ingestion → scope-resolution → graph →
LadybugDB → embeddings → hybrid search), not the 8-file context-pack stub it was first drafted against.

This is a **first-party, owned** subsystem. We **merge and edit** the fused source code; we do
**not** thin-HTTP-wrap it. The fused sources are:

| Source | What it owns | Where it lives today |
| --- | --- | --- |
| **RecoderGit** (`ts/recodergit`) | Repo intelligence as a **real code-knowledge-graph engine**: Tree-sitter AST parse → scope resolution → typed graph nodes/edges (`Function`/`Class`/`Method`/`Import`/…, calls/imports/heritage edges) → **LadybugDB (`lbug`)** graph storage → code embeddings → hybrid BM25+semantic graph search/RAG → MCP query tools. NOT a stub. | engine: `ts/recodergit/gitnexus/src/core/{tree-sitter,ingestion,graph,embeddings,lbug,search,incremental,augmentation}`, `ts/recodergit/gitnexus/src/{storage,mcp}`; shared graph + scope-resolution: `ts/recodergit/gitnexus-shared/src/{graph,scope-resolution}` |
| **mem0** (`py/mem0`) | Semantic recall: embeddings, vector stores (pgvector/qdrant/memory), LLM fact-extraction, history, hybrid (BM25) scoring | TS SDK (default merge, in-process): `py/mem0/mem0-ts/src/oss/src/{memory,vector_stores,embeddings,utils,storage,llms,config}`; Python core (alt recall service): `py/mem0/mem0/{memory,vector_stores,embeddings,reranker,utils}` |
| `packages/context7-sdk` | External library docs: `searchLibrary`, `getContext`, HTTP client w/ retry | `packages/context7-sdk/src/*` |
| `packages/beads-adapter` | TS bridge to the task graph: CLI runner, parser, TaskSpec mapping, sync | `packages/beads-adapter/src/*` |
| `go/beads` | **Durable task graph** on Dolt (versioned dependency graph, ready/blocked, cycles, history) | `go/beads/internal/storage/dolt/*` |
| `go/multica` | Memory/knowledge service parts (storage, realtime, events, service layer) | `go/multica/server/internal/*` |

---

## 1. Design goals & invariants

1. **Assemble once, read many.** A `BrainContext` for a given `(repoRoot, taskId, revision)`
   is built once, content-addressed, cached, and reused by every agent in the run. Cache key
   includes the git HEAD sha so a new commit invalidates stale repo intelligence.
2. **Fusion, not aggregation.** The four sources are fused into one ranked, token-budgeted
   object. We do not just concatenate; we dedupe, score, and trim to a token budget.
3. **First-party merge.** The real RecoderGit engine (`ts/recodergit`) becomes the `repo/` module; the
   mem0 TS SDK (`py/mem0/mem0-ts/src/oss`) becomes the `memory/` module; `context7-sdk` becomes the
   `docs/` module; `beads-adapter` + `go/beads` become the `tasks/` module. The engines are merged
   and edited behind their ports; the brain-domain types they map into are re-exported from `brain`
   where they cross the seam.
4. **Truthful provenance.** Every fact in a `BrainContext` carries a `sourceRef` (which source,
   which file/library/issue, which revision). The Brain never fabricates recall. This satisfies
   the repo rule "never trust runtime-reported success / memory candidates".
5. **No silent durable memory.** Writes back to mem0 go through a **memory-candidate** lane with
   evidence; they are not committed as durable defaults until reviewed (AGENTS.md +
   `.claude/rules/agent-os.md`). The Brain emits candidates; the governance subsystem approves.
6. **Adapters are replaceable.** `go/beads` (Dolt), pgvector, qdrant, context7.com are behind
   ports. Core engine depends on the **ports**, never the concrete clients (monorepo.md: do not
   couple core packages to runtimes/sandboxes/providers).
7. **Fail safe, fail loud.** Missing keys (CONTEXT7_API_KEY, embedder), unreachable Dolt, or an
   empty vector store **degrade** the context (omit that source, annotate `degraded[]`) instead
   of throwing. Health is truthful.

---

## 2. File tree (147 functional files)

```
packages/brain/
├── package.json                         # @recoder/brain manifest (deps below)
├── tsconfig.json
├── tsup.config.ts
├── README.md
└── src/
    ├── index.ts                         # public barrel: Brain, createBrain, types, ports
    │
    ├── api/                             # ── PUBLIC API SURFACE ──
    │   ├── brain.ts                     # Brain class: assemble(), recall(), record(), refresh(), health()
    │   ├── create-brain.ts             # createBrain(deps/config) factory + dependency wiring
    │   ├── brain-context.ts           # BrainContext assembly result + helpers (toPrompt, byKind)
    │   ├── brain-handle.ts            # per-run handle: pins a revision, exposes scoped reads
    │   ├── recall-api.ts              # focused semantic recall surface (no full assemble)
    │   ├── record-api.ts              # write-back surface: emit memory candidates + task updates
    │   ├── snapshot-api.ts            # export/import a BrainContext snapshot (sharing across agents)
    │   └── errors-api.ts             # public error re-exports + isBrainError guard
    │
    ├── domain/                          # ── DOMAIN TYPES (no IO) ──
    │   ├── index.ts                     # barrel
    │   ├── brain-query.ts               # BrainQuery: task, repoRoot, focusFiles, limit, budget, sources
    │   ├── brain-context.types.ts       # BrainContext, BrainSection, AssemblyMeta, Degradation
    │   ├── brain-fact.ts                # BrainFact<T>: ranked unit w/ score + sourceRef + tokens
    │   ├── source-ref.ts                # SourceRef discriminated union (git_nexus|mem0|context7|beads)
    │   ├── revision.ts                  # Revision: git sha + indexedAt + dirty flag (cache key part)
    │   ├── repo-intel.types.ts          # RepoIntel: RecoderGit graph-query results (symbols, callers/callees, impacted files, cycles) shaped into brain domain
    │   ├── memory.types.ts              # BrainMemory, MemoryScope (user/agent/space/run), MemoryKind
    │   ├── docs.types.ts                # BrainDoc, LibraryRef, DocKind (code|info)
    │   ├── task-graph.types.ts          # BrainTask, TaskEdge, EdgeKind, TaskGraphView
    │   ├── memory-candidate.ts          # MemoryCandidate (proposed, evidence-backed, unreviewed)
    │   ├── brain-event.ts               # BrainEvent union (memory|task|docs-cache|index)
    │   ├── token-budget.ts              # TokenBudget per source + total + overflow policy
    │   ├── relevance.ts                 # RelevanceSignal, ScoredFact, ranking inputs
    │   └── health.types.ts              # BrainHealth, SourceHealth, DegradeReason
    │
    ├── ports/                            # ── PORTS (interfaces the engine depends on) ──
    │   ├── index.ts
    │   ├── repo-intel.port.ts           # RepoIntelPort: index(), contextPack(), impact() (RecoderGit engine sits behind this)
    │   ├── memory.port.ts               # MemoryPort: recall(), remember(), forget(), history()
    │   ├── docs.port.ts                 # DocsPort: resolveLibrary(), lookup()
    │   ├── task-graph.port.ts           # TaskGraphPort: related(), ready(), blocked(), update(), tree()
    │   ├── embedder.port.ts             # EmbedderPort: embed(text[]) -> vectors (mem0 seam)
    │   ├── vector-store.port.ts         # VectorStorePort: upsert/search/delete (mem0 seam)
    │   ├── cache.port.ts                # CachePort: get/set/del for assembled contexts + docs
    │   ├── clock.port.ts                # ClockPort: now() (deterministic tests)
    │   └── event-sink.port.ts           # EventSinkPort: emit RunEvent/CloudEvent back to Recoder
    │
    ├── engine/                          # ── CORE ENGINE (orchestration) ──
    │   ├── index.ts
    │   ├── assembler.ts                 # assemble(): fan-out to 4 sources, fuse, budget, cache
    │   ├── assembly-plan.ts            # decide which sources to query + per-source budgets
    │   ├── source-runner.ts            # run one source with timeout + degrade-on-failure
    │   ├── fuser.ts                     # merge sections into one BrainContext (dedupe across sources)
    │   ├── ranker.ts                    # score facts (recency, score, focus-file proximity, risk)
    │   ├── deduper.ts                   # cross-source + intra-source dedupe (by content hash)
    │   ├── budgeter.ts                  # enforce TokenBudget; trim lowest-ranked facts
    │   ├── token-estimator.ts          # cheap token count (chars/4 + code heuristics)
    │   ├── revision-resolver.ts        # resolve Revision (git HEAD sha, dirty) for cache key
    │   ├── cache-key.ts                 # content-addressed key: hash(repoRoot,task,rev,sources,budget)
    │   ├── context-cache.ts            # read-through cache wrapper over CachePort
    │   ├── refresher.ts                # invalidate + rebuild on git change / explicit refresh
    │   ├── recorder.ts                 # record(): route events to memory-candidate / task update
    │   ├── candidate-builder.ts        # build MemoryCandidate w/ evidence from a run outcome
    │   ├── prompt-packer.ts            # render BrainContext -> token-efficient prompt block
    │   └── health-aggregator.ts        # combine per-source health into BrainHealth
    │
    ├── repo/                             # ── FUSED: RecoderGit engine (real code-knowledge-graph) ──
    │   │   # The real Tree-sitter → graph → lbug → search engine, MERGED in (not HTTP-wrapped),
    │   │   # sitting BEHIND RepoIntelPort. RepoIntelAdapter is the only file the engine touches.
    │   ├── index.ts                     # barrel: exports RepoIntelAdapter (implements RepoIntelPort)
    │   ├── repo-intel-adapter.ts        # drives ingest→graph→lbug→search; maps results to brain domain
    │   │
    │   ├── tree-sitter/                 # ── AST PARSE ──
    │   │   ├── parser-loader.ts         # ⟵ MERGED ts/recodergit/gitnexus/src/core/tree-sitter/parser-loader.ts
    │   │   ├── safe-parse.ts            # ⟵ MERGED .../core/tree-sitter/safe-parse.ts (timeout-guarded parse)
    │   │   └── vendored-grammars.ts     # ⟵ MERGED .../core/tree-sitter/vendored-grammars.ts (grammar registry)
    │   │
    │   ├── ingestion/                   # ── INGESTION PIPELINE (parse → typed nodes/edges) ──
    │   │   ├── pipeline.ts              # ⟵ MERGED .../core/ingestion/pipeline.ts (phase orchestrator)
    │   │   ├── pipeline-runner.ts       # ⟵ MERGED .../core/ingestion/pipeline-phases/runner.ts (topo phase run)
    │   │   ├── pipeline-phases.ts       # ⟵ MERGED .../core/ingestion/pipeline-phases/index.ts (scan/parse/scope/cross-file/…)
    │   │   ├── filesystem-walker.ts     # ⟵ MERGED .../core/ingestion/filesystem-walker.ts (repo file walk + ignore)
    │   │   ├── language-config.ts       # ⟵ MERGED .../core/ingestion/language-config.ts (per-language providers)
    │   │   └── scope-extractor.ts       # ⟵ MERGED .../core/ingestion/scope-extractor.ts (scopes from AST)
    │   │
    │   ├── scope-resolution/            # ── SCOPE RESOLUTION (symbol binding) ──
    │   │   ├── scope-tree.ts            # ⟵ MERGED ts/recodergit/gitnexus-shared/src/scope-resolution/scope-tree.ts
    │   │   ├── def-index.ts             # ⟵ MERGED .../gitnexus-shared/src/scope-resolution/def-index.ts
    │   │   ├── qualified-name-index.ts  # ⟵ MERGED .../gitnexus-shared/src/scope-resolution/qualified-name-index.ts
    │   │   └── finalize-algorithm.ts    # ⟵ MERGED .../gitnexus-shared/src/scope-resolution/finalize-algorithm.ts (ref→def)
    │   │
    │   ├── graph/                       # ── KNOWLEDGE GRAPH (nodes/edges, the model) ──
    │   │   ├── knowledge-graph.ts       # ⟵ MERGED .../core/graph/graph.ts (createKnowledgeGraph, dual-indexed)
    │   │   ├── graph-types.ts           # ⟵ MERGED .../core/graph/types.ts (KnowledgeGraph interface)
    │   │   ├── shared-graph-types.ts    # ⟵ MERGED .../gitnexus-shared/src/graph/types.ts (GraphNode/Relationship/NodeLabel)
    │   │   └── import-cycles.ts         # ⟵ MERGED .../core/graph/import-cycles.ts (dependency-cycle detection)
    │   │
    │   ├── storage/                     # ── LADYBUGDB (lbug) GRAPH STORAGE ──
    │   │   ├── lbug-adapter.ts          # ⟵ MERGED .../core/lbug/lbug-adapter.ts (graph → LadybugDB via CSV COPY)
    │   │   ├── lbug-pool.ts             # ⟵ MERGED .../core/lbug/pool-adapter.ts (query/exec connection pool)
    │   │   ├── lbug-schema.ts           # ⟵ MERGED .../core/lbug/schema.ts (node/rel/embedding tables + vector index)
    │   │   ├── query-params.ts          # ⟵ MERGED .../core/lbug/query-params.ts (safe parameter binding)
    │   │   ├── repo-store.ts            # ⟵ MERGED .../storage/repo-manager.ts (.gitnexus index dir + repo registry)
    │   │   ├── parse-cache.ts           # ⟵ MERGED .../storage/parse-cache.ts (warm parse cache, feeds incremental)
    │   │   └── git.ts                   # ⟵ MERGED .../storage/git.ts (repo root, HEAD sha, diff hunks)
    │   │
    │   ├── embeddings/                  # ── CODE EMBEDDINGS (semantic index over graph nodes) ──
    │   │   ├── embedder.ts              # ⟵ MERGED .../core/embeddings/embedder.ts (transformers.js, arctic-embed)
    │   │   ├── embedding-pipeline.ts    # ⟵ MERGED .../core/embeddings/embedding-pipeline.ts (chunk→batch→index)
    │   │   └── chunker.ts               # ⟵ MERGED .../core/embeddings/chunker.ts (node-aware chunking)
    │   │
    │   ├── search/                      # ── GRAPH SEARCH / RAG QUERY (the read path) ──
    │   │   ├── hybrid-search.ts         # ⟵ MERGED .../core/search/hybrid-search.ts (BM25+semantic RRF fusion)
    │   │   ├── bm25-index.ts            # ⟵ MERGED .../core/search/bm25-index.ts (keyword search over FTS)
    │   │   ├── fts-schema.ts            # ⟵ MERGED .../core/search/fts-schema.ts (full-text index schema)
    │   │   ├── augmentation-engine.ts   # ⟵ MERGED .../core/augmentation/engine.ts (fast callers/callees graph context)
    │   │   └── local-backend.ts         # ⟵ MERGED .../mcp/local/local-backend.ts (multi-repo query API over lbug)
    │   │
    │   ├── incremental/                 # ── INCREMENTAL RE-INDEX (on git change) ──
    │   │   ├── subgraph-extract.ts      # ⟵ MERGED .../core/incremental/subgraph-extract.ts (changed-file subgraph)
    │   │   └── shadow-candidates.ts     # ⟵ MERGED .../core/incremental/shadow-candidates.ts (stale-row candidates)
    │   │
    │   ├── repo-indexer.ts              # drive full/incremental index (ingest→graph→lbug→embed) behind RepoIntelPort
    │   ├── repo-query.ts                # contextPack()/impact(): hybrid search + graph walk (callers/callees, cycles, impacted files)
    │   ├── git-head.ts                  # read git HEAD sha + dirty state (feeds engine/revision-resolver cache key)
    │   └── repo-fact-mapper.ts          # graph query results → BrainFact<RepoIntel>[] w/ git_nexus SourceRef + revision (provenance)
    │
    ├── memory/                           # ── FUSED: mem0 TS SDK (semantic recall) ──
    │   │   # Default merge is the in-process TS SDK under py/mem0/mem0-ts/src/oss/src/* (matches
    │   │   # this TS package). A Python recall service (py/mem0/mem0/*) is an alternate backend
    │   │   # behind MemoryPort if out-of-process recall is preferred.
    │   ├── index.ts                     # MemoryAdapter implements MemoryPort
    │   ├── memory-adapter.ts            # wraps merged mem0 Memory class; scope-aware recall/remember
    │   ├── memory-core.ts               # ⟵ MERGED py/mem0/mem0-ts/src/oss/src/memory/index.ts (Memory class)
    │   ├── memory.types.ts              # ⟵ MERGED py/mem0/mem0-ts/src/oss/src/memory/memory.types.ts
    │   ├── memory-factory.ts            # ⟵ MERGED py/mem0/mem0-ts/src/oss/src/utils/factory.ts (Embedder/LLM/VectorStore/History factories)
    │   ├── fact-extractor.ts            # ⟵ MERGED py/mem0/mem0-ts/src/oss/src/prompts/index.ts (LLM fact-retrieval/update, infer mode)
    │   ├── scoring.ts                   # ⟵ MERGED py/mem0/mem0-ts/src/oss/src/utils/scoring.ts
    │   ├── bm25.ts                      # ⟵ MERGED py/mem0/mem0-ts/src/oss/src/utils/bm25.ts (hybrid recall)
    │   ├── reranker.ts                  # hybrid (vector + bm25) rerank for recall quality
    │   ├── scope.ts                     # MemoryScope resolution (user/agent/space/run filters)
    │   ├── embeddings/
    │   │   ├── index.ts                 # EmbedderFactory -> EmbedderPort
    │   │   ├── openai-embedder.ts       # ⟵ MERGED py/mem0/mem0-ts/src/oss/src/embeddings/openai.ts
    │   │   ├── google-embedder.ts       # ⟵ MERGED py/mem0/mem0-ts/src/oss/src/embeddings/google.ts
    │   │   ├── ollama-embedder.ts       # ⟵ MERGED py/mem0/mem0-ts/src/oss/src/embeddings/ollama.ts
    │   │   └── embedder-base.ts         # ⟵ MERGED py/mem0/mem0-ts/src/oss/src/embeddings/base.ts
    │   ├── vector-stores/
    │   │   ├── index.ts                 # VectorStoreFactory -> VectorStorePort
    │   │   ├── pgvector-store.ts        # ⟵ MERGED py/mem0/mem0-ts/src/oss/src/vector_stores/pgvector.ts (prod default)
    │   │   ├── qdrant-store.ts          # ⟵ MERGED py/mem0/mem0-ts/src/oss/src/vector_stores/qdrant.ts
    │   │   └── memory-store.ts          # ⟵ MERGED py/mem0/mem0-ts/src/oss/src/vector_stores/memory.ts (tests/local)
    │   ├── history/
    │   │   ├── index.ts                 # HistoryManager factory
    │   │   ├── pg-history.ts            # durable recall-event history (who recalled/remembered what)
    │   │   └── history.types.ts         # ⟵ shaped from py/mem0/mem0-ts/src/oss/src/storage/base.ts
    │   ├── memory-fact-mapper.ts        # mem0 Memory[] -> BrainFact<BrainMemory>[] w/ sourceRefs
    │   └── candidate-writer.ts          # write MemoryCandidate to candidate store (NOT durable mem0)
    │
    ├── docs/                             # ── FUSED: context7-sdk (external docs) ──
    │   ├── index.ts                     # DocsAdapter implements DocsPort
    │   ├── docs-adapter.ts              # resolveLibrary + getContext, mapped to brain domain
    │   ├── context7-client.ts           # ⟵ MERGED from context7-sdk/src/client.ts
    │   ├── http-client.ts               # ⟵ MERGED from context7-sdk/src/http/index.ts (retry/backoff)
    │   ├── search-library.ts            # ⟵ MERGED from context7-sdk/.../search-library/index.ts
    │   ├── get-context.ts               # ⟵ MERGED from context7-sdk/.../get-context/index.ts
    │   ├── format.ts                    # ⟵ MERGED from context7-sdk/src/utils/format.ts
    │   ├── library-resolver.ts          # task text -> candidate library IDs (heuristic + cache)
    │   ├── docs-cache.ts                # durable doc-snippet cache keyed by (libraryId, query)
    │   ├── docs-fact-mapper.ts          # Documentation[] -> BrainFact<BrainDoc>[] w/ sourceRefs
    │   └── errors.ts                    # ⟵ MERGED from context7-sdk/src/error/index.ts
    │
    ├── tasks/                            # ── FUSED: beads-adapter + go/beads (task graph) ──
    │   ├── index.ts                     # TaskGraphAdapter implements TaskGraphPort
    │   ├── task-graph-adapter.ts        # related/ready/blocked/update/tree over a TaskBackend
    │   ├── backends/
    │   │   ├── index.ts                 # TaskBackend port + factory (cli | dolt-rpc)
    │   │   ├── beads-cli-backend.ts     # ⟵ MERGED from beads-adapter/src/beads-client.ts (bd CLI)
    │   │   ├── dolt-rpc-backend.ts      # NEW: talk to go/beads Dolt store via its RPC/daemon
    │   │   └── dolt-backend.types.ts    # request/response shapes for the Dolt task graph
    │   ├── beads-parser.ts              # ⟵ MERGED from beads-adapter/src/beads-parser.ts
    │   ├── task-spec-mapper.ts          # ⟵ MERGED from beads-adapter/src/task-spec-mapper.ts
    │   ├── sync-from-recoder.ts         # ⟵ MERGED from beads-adapter/src/sync-from-recoder.ts
    │   ├── sync-to-recoder.ts           # ⟵ MERGED from beads-adapter/src/sync-to-recoder.ts
    │   ├── dependency-walker.ts         # walk blocks/parent-child/related edges to N hops
    │   ├── ready-resolver.ts            # compute ready/blocked from edges (mirrors go/beads logic)
    │   ├── edge-mapper.ts               # go/beads DependencyType -> brain EdgeKind
    │   ├── history-reader.ts            # read issue history/transitions (Dolt versioned reads)
    │   └── task-fact-mapper.ts          # Issue[] + edges -> BrainFact<BrainTask>[] + TaskGraphView
    │
    ├── persistence/                      # ── PERSISTENCE ──
    │   ├── index.ts
    │   ├── cache/
    │   │   ├── index.ts                 # CachePort factory (memory | redis | pg)
    │   │   ├── memory-cache.ts          # in-process LRU (tests/local)
    │   │   ├── redis-cache.ts           # shared cross-agent cache (prod default for hot reuse)
    │   │   └── pg-cache.ts              # durable cache table for assembled contexts
    │   ├── candidate-store/
    │   │   ├── index.ts                 # MemoryCandidateStore port + factory
    │   │   ├── pg-candidate-store.ts    # durable candidate rows awaiting review
    │   │   └── candidate-store.types.ts # row shape, status (proposed|approved|rejected)
    │   ├── snapshot-store.ts            # store/load shareable BrainContext snapshots (object store)
    │   ├── content-hash.ts              # stable hash for cache keys + dedupe
    │   └── serialization.ts             # versioned (de)serialize of BrainContext (schemaVersion)
    │
    ├── seams/                            # ── SEAMS TO OTHER SUBSYSTEMS ──
    │   ├── index.ts
    │   ├── agent-os-seam.ts             # TaskSpec <-> BrainQuery; ContextPack re-export bridge
    │   ├── coordination-seam.ts         # share one BrainHandle across a squad/run (assemble-once)
    │   ├── governance-seam.ts           # emit MemoryCandidate to approval/policy; honor work locks
    │   ├── events-seam.ts               # map BrainEvent -> RunEvent/CloudEvent (agent-events)
    │   ├── runtimes-seam.ts             # adapter so any runtime requests the same BrainContext
    │   └── mcp-seam.ts                  # expose brain.assemble/recall as MCP tools (read-only)
    │
    ├── config/                           # ── CONFIG ──
    │   ├── index.ts                     # loadBrainConfig(env) -> BrainConfig (validated)
    │   ├── brain-config.ts              # BrainConfig type (sources, budgets, cache, timeouts)
    │   ├── config-schema.ts             # zod schema; fail-fast on invalid config
    │   ├── defaults.ts                  # DEFAULT_LIMIT, default budgets, default source toggles
    │   └── env.ts                       # env var names + safe getters (no hardcoded secrets)
    │
    ├── observability/                    # ── OBSERVABILITY ──
    │   ├── index.ts
    │   ├── logger.ts                     # structured logger (no console.log in prod paths)
    │   ├── metrics.ts                    # assemble latency, cache hit rate, tokens-saved counter
    │   ├── tracing.ts                    # span per source + per assemble (OpenTelemetry-shaped)
    │   ├── token-savings.ts             # compute "tokens saved by reuse" (the core value metric)
    │   └── audit.ts                      # audit trail: who assembled/recalled/recorded what
    │
    ├── errors/                           # ── ERROR HANDLING ──
    │   ├── index.ts
    │   ├── brain-error.ts                # BrainError base + codes (ASSEMBLE_FAILED, SOURCE_DEGRADED…)
    │   ├── source-error.ts               # per-source error wrapper preserving cause + sourceRef
    │   └── degradation.ts                # Degradation builder: turn a source failure into a degrade
    │
    └── util/                             # ── UTILITIES ──
        ├── index.ts
        ├── async.ts                      # withTimeout, allSettledTyped, retry helpers
        ├── hash.ts                       # sha256 helpers (content-address, cache keys)
        ├── text.ts                       # snippet trimming, code-fence detection
        ├── glob.ts                       # path-glob matching (focus files, forbidden paths)
        └── result.ts                     # Result<T,E> helper for explicit error flow
```

**Functional file count: 147** (every file above has one responsibility; the `repo/` module is 40
files merging the real RecoderGit engine. Excludes the 3 config files
`package.json`/`tsconfig.json`/`tsup.config.ts` and `README.md`).

### `tests/` tree (mirrors `src/`)

```
packages/brain/tests/
├── unit/
│   ├── engine/{assembler,fuser,ranker,deduper,budgeter,token-estimator,cache-key,
│   │           revision-resolver,recorder,candidate-builder,prompt-packer}.test.ts
│   ├── repo/{repo-intel-adapter,repo-indexer,repo-query,repo-fact-mapper,git-head}.test.ts
│   ├── repo/{ingestion-pipeline,scope-resolution,knowledge-graph,lbug-adapter,
│   │         hybrid-search,augmentation-engine,subgraph-extract}.test.ts
│   ├── memory/{memory-adapter,scoring,bm25,reranker,scope,memory-fact-mapper,
│   │           candidate-writer,embeddings,vector-stores}.test.ts
│   ├── docs/{docs-adapter,library-resolver,docs-cache,format,docs-fact-mapper,http-client}.test.ts
│   ├── tasks/{task-graph-adapter,beads-parser,task-spec-mapper,dependency-walker,
│   │          ready-resolver,edge-mapper,task-fact-mapper}.test.ts
│   ├── persistence/{memory-cache,redis-cache,content-hash,serialization,pg-candidate-store}.test.ts
│   ├── config/{config-schema,defaults}.test.ts
│   └── errors/{brain-error,degradation}.test.ts
├── integration/
│   ├── assemble-fuses-four-sources.test.ts   # all ports wired w/ fakes; one fused context
│   ├── assemble-once-reuse.test.ts           # second read hits cache, 0 source calls
│   ├── revision-invalidation.test.ts         # new HEAD sha rebuilds repo intel
│   ├── degrade-on-source-failure.test.ts     # context7 down -> degraded[], others intact
│   ├── token-budget-enforced.test.ts         # over-budget context trimmed by rank
│   ├── memory-candidate-not-durable.test.ts  # record() emits candidate, no durable write
│   ├── pgvector-recall.test.ts               # mem0 pgvector path (containerized pg)
│   └── dolt-task-graph.test.ts               # go/beads Dolt backend ready/blocked/tree
├── contract/
│   ├── repo-intel.port.contract.ts           # any RepoIntelPort impl must satisfy
│   ├── memory.port.contract.ts
│   ├── docs.port.contract.ts
│   ├── task-graph.port.contract.ts
│   ├── vector-store.port.contract.ts
│   └── cache.port.contract.ts
├── fakes/
│   ├── fake-repo-intel.ts
│   ├── fake-memory.ts
│   ├── fake-docs.ts
│   ├── fake-task-graph.ts
│   ├── fake-cache.ts
│   └── fixed-clock.ts
└── fixtures/
    ├── sample-repo/            # tiny repo for indexer/impact tests
    ├── mem0-records.json
    ├── context7-responses.json
    └── beads-issues.json
```

---

## 3. Public API surface

Exported from `packages/brain/src/index.ts` (carries forward the existing barrel and grows it):

```ts
// Construction
export { Brain, createBrain } from "./api/brain";
export type { BrainDeps, BrainConfig } from "./config/brain-config";

// Core reads/writes
//   assemble(query)            -> BrainContext     (one fused read; cached + reused)
//   handle(query)              -> BrainHandle      (pins a revision for a whole run/squad)
//   recall(query, opts)        -> BrainFact<BrainMemory>[]   (focused, no full assemble)
//   record(event)              -> void             (memory candidate OR task update)
//   refresh(repoRoot)          -> void             (invalidate cache on git change)
//   health()                   -> BrainHealth      (truthful per-source readiness)

// Domain types
export type {
  BrainQuery, BrainContext, BrainSection, BrainFact, SourceRef, Revision,
  BrainMemory, BrainDoc, BrainTask, TaskEdge, TaskGraphView,
  MemoryCandidate, MemoryScope, BrainEvent, TokenBudget,
  BrainHealth, SourceHealth, Degradation,
} from "./domain";

// Ports (for advanced wiring / alternative backends)
export type {
  RepoIntelPort, MemoryPort, DocsPort, TaskGraphPort,
  EmbedderPort, VectorStorePort, CachePort, ClockPort, EventSinkPort,
} from "./ports";

// Errors
export { BrainError, SourceError, isBrainError } from "./errors";
```

`Brain` (in `api/brain.ts`) keeps the **existing method shape** (`assemble`, `record`) so the
current seam in `packages/brain/src/brain.ts` upgrades in place, and adds `handle`, `recall`,
`refresh`, `health`.

---

## 4. Domain types (the fusion contract)

The heart is `BrainFact<T>` — every source maps its results into ranked, provenance-carrying
facts so the fuser can dedupe, rank, and budget across sources uniformly.

```ts
// domain/source-ref.ts
export type SourceRef =
  | { kind: "git_nexus"; ref: string; revision: string; detail?: string }
  | { kind: "mem0"; memoryId: string; scope: MemoryScope }
  | { kind: "context7"; libraryId: string; url?: string }
  | { kind: "beads"; issueId: string; status?: string };

// domain/brain-fact.ts
export interface BrainFact<T> {
  payload: T;                 // BrainMemory | BrainDoc | BrainTask | RepoIntel slice
  score: number;             // 0..1 normalized relevance (ranker output)
  tokens: number;            // estimated token cost (budgeter input)
  source: SourceRef;         // provenance — never fabricated
  hash: string;              // content hash (deduper key)
}

// domain/brain-context.types.ts
export interface BrainContext {
  query: BrainQuery;
  revision: Revision;                 // git HEAD sha + dirty + indexedAt (cache key)
  repo: RepoIntel;                    // RecoderGit graph-query results, brain-shaped
  memories: BrainFact<BrainMemory>[]; // mem0
  docs: BrainFact<BrainDoc>[];        // context7
  tasks: BrainFact<BrainTask>[];      // beads/dolt
  graph: TaskGraphView;               // edges among related tasks
  budget: TokenBudget;                // requested vs used per source
  degraded: Degradation[];            // sources that failed/were skipped (truthful)
  assembledAt: string;
  schemaVersion: number;              // for serialization compatibility
}
```

`BrainContext.repo` (`RepoIntel`) is assembled by `repo/repo-query.ts` from the merged RecoderGit
graph: a focus-scoped slice of the knowledge graph (symbols, callers/callees, imports, heritage),
the impacted-files set, import cycles, and matching code snippets from hybrid BM25+semantic search —
each carrying a `git_nexus` `SourceRef` (file/node id + revision). This is the "assembly core" the
current `brain.ts` seam exposes, now backed by a real graph engine instead of a `repoMap` stub.

---

## 5. Core engine & data flow

### 5.1 `assemble(query)` — the one read

```
                         BrainQuery {task, repoRoot, focusFiles, limit, budget, sources}
                                              │
                                   engine/revision-resolver
                                  (git HEAD sha + dirty)  ──┐
                                              │             │
                                   engine/cache-key  ◄──────┘  hash(repoRoot, task, rev,
                                              │                      sources, budget)
                                   engine/context-cache.get
                          ┌───────────────────┴───────────────────┐
                     HIT  │ return cached BrainContext              │ MISS
                          ▼ (0 source calls — THE reuse win)        ▼
                   metrics: cache_hit++,                  engine/assembly-plan
                   token_savings += ctx.tokens            (which sources + budgets)
                                                                    │
                                                      engine/source-runner (parallel, per-source
                                                      timeout, degrade-on-failure)
                          ┌──────────────┬──────────────┬──────────────┐
                          ▼              ▼              ▼              ▼
                  repo/RepoIntel   memory/Memory   docs/Docs     tasks/TaskGraph
                  Adapter          Adapter         Adapter       Adapter
                  (RecoderGit)       (mem0)          (context7)    (beads/dolt)
                          │              │              │              │
                  *-fact-mapper.ts: each source -> BrainFact<T>[] with SourceRef + tokens
                          └──────────────┴──────┬───────┴──────────────┘
                                                ▼
                                          engine/deduper   (cross-source by hash)
                                                ▼
                                          engine/ranker    (recency, score, focus proximity,
                                                            graph-impact risk boost)
                                                ▼
                                          engine/budgeter  (trim lowest-ranked to TokenBudget)
                                                ▼
                                          engine/fuser     -> BrainContext (+ degraded[])
                                                ▼
                                   context-cache.set (revision-scoped)
                                                ▼
                                          return BrainContext  ──► prompt-packer (on demand)
```

Key behaviors:
- **`source-runner`** wraps each adapter in `withTimeout` + try/catch. A failure becomes a
  `Degradation` (reason, source) appended to `degraded[]`; the rest of the assembly proceeds.
  No single source can fail the whole read. (security.md: never trust runtime success.)
- **`ranker`** boosts facts that touch `query.focusFiles` and high-risk paths from the RecoderGit
  impact set (`repo/repo-query.ts` impact() — files reachable from changed nodes; auth/billing/security)
  so safety-relevant context floats up.
- **`budgeter`** is the token-waste killer's enforcement arm: it caps total + per-source tokens,
  trimming the lowest-ranked facts; `token-savings.ts` records `tokens` of every reused context.
- **`refresher`** + **`revision-resolver`**: a new commit changes the HEAD sha, which changes the
  cache key, which forces repo intelligence rebuild — old contexts naturally age out.

### 5.2 `recall(query)` — focused read (no full assemble)

For agents that only need semantic memory (e.g., "have we hit this error before?"), `recall`
skips repo/docs/tasks and hits `memory/MemoryAdapter` directly (hybrid vector+bm25 via
`reranker`), still returning `BrainFact<BrainMemory>[]` with provenance.

### 5.3 `record(event)` — write-back, governed

```
BrainEvent
  ├─ kind: "memory" ─► engine/candidate-builder ─► MemoryCandidate (evidence-backed)
  │                     ─► persistence/candidate-store (status: proposed)
  │                     ─► seams/governance-seam (queue for review)   [NOT durable mem0]
  └─ kind: "task"   ─► tasks/TaskGraphAdapter.update (bd update / Dolt write)
                        ─► seams/events-seam ─► RunEvent back to Recoder
```

This enforces the repo invariant: **durable memory is reviewable, evidence-backed, never silent
runtime state.** `record({kind:"memory"})` does **not** write durable mem0; it emits a candidate
the governance subsystem approves. Only an approved candidate is later promoted into the durable
mem0 store via `memory/candidate-writer.ts` (called by governance, not by an agent).

---

## 6. Fusion map — what merges where

| Existing real file (read & cited) | Lands at | Treatment |
| --- | --- | --- |
| `packages/brain/src/brain.ts` | `src/api/brain.ts` | upgraded in place: same `assemble/record`, gains `handle/recall/refresh/health`; `Promise.all` fan-out becomes `engine/source-runner` |
| `packages/brain/src/types.ts` | `src/domain/*` | split into `brain-query.ts`, `brain-context.types.ts`, `memory.types.ts`, `docs.types.ts`, `task-graph.types.ts`; `MemoryRecall/DocsSource/TaskGraph` become `ports/*` |
| `packages/brain/src/index.ts` | `src/index.ts` | grows to export ports + new API |
| `ts/recodergit/gitnexus/src/core/tree-sitter/{parser-loader,safe-parse,vendored-grammars}.ts` | `src/repo/tree-sitter/*` | merged; AST parse front-end |
| `ts/recodergit/gitnexus/src/core/ingestion/{pipeline,filesystem-walker,language-config,scope-extractor}.ts` + `pipeline-phases/{runner,index}.ts` | `src/repo/ingestion/*` | merged; phase-ordered parse→nodes/edges pipeline (the real "indexer", not a stub) |
| `ts/recodergit/gitnexus-shared/src/scope-resolution/{scope-tree,def-index,qualified-name-index,finalize-algorithm}.ts` | `src/repo/scope-resolution/*` | merged; ref→def symbol binding |
| `ts/recodergit/gitnexus/src/core/graph/{graph,types,import-cycles}.ts` + `gitnexus-shared/src/graph/types.ts` | `src/repo/graph/*` | merged; `createKnowledgeGraph` + `GraphNode/Relationship/NodeLabel` model + cycle detection |
| `ts/recodergit/gitnexus/src/core/lbug/{lbug-adapter,pool-adapter,schema,query-params}.ts` + `storage/{repo-manager,parse-cache,git}.ts` | `src/repo/storage/*` | merged; LadybugDB graph storage + `.gitnexus` index + git HEAD/diff |
| `ts/recodergit/gitnexus/src/core/embeddings/{embedder,embedding-pipeline,chunker}.ts` | `src/repo/embeddings/*` | merged; code embeddings over graph nodes |
| `ts/recodergit/gitnexus/src/core/search/{hybrid-search,bm25-index,fts-schema}.ts` + `core/augmentation/engine.ts` + `mcp/local/local-backend.ts` | `src/repo/search/*` | merged; hybrid BM25+semantic RRF search/RAG + graph-context augmentation (the read path) |
| `ts/recodergit/gitnexus/src/core/incremental/{subgraph-extract,shadow-candidates}.ts` | `src/repo/incremental/*` | merged; changed-file subgraph for incremental re-index |
| `ts/recodergit/gitnexus/src/mcp/{tools,server}.ts` | `src/seams/mcp-seam.ts` | folded into the brain MCP seam (read-only graph-query tools) |
| `py/mem0/mem0-ts/src/oss/src/memory/index.ts` | `src/memory/memory-core.ts` | merged Memory class (add/search/get/history) |
| `py/mem0/mem0-ts/src/oss/src/memory/memory.types.ts` | `src/memory/memory.types.ts` | merged (AddMemoryOptions, SearchMemoryOptions…) |
| `py/mem0/mem0-ts/src/oss/src/utils/{factory,scoring,bm25}.ts` + `prompts/index.ts` | `src/memory/{memory-factory,scoring,bm25,fact-extractor}.ts` | merged; factories + hybrid scoring + LLM fact-extraction |
| `py/mem0/mem0-ts/src/oss/src/embeddings/{openai,google,ollama,base}.ts` | `src/memory/embeddings/*` | merged behind `EmbedderPort` |
| `py/mem0/mem0-ts/src/oss/src/vector_stores/{pgvector,qdrant,memory}.ts` | `src/memory/vector-stores/*` | merged behind `VectorStorePort` (pgvector = prod default) |
| `py/mem0/mem0-ts/src/oss/src/storage/*` (history) | `src/memory/history/*` | merged into recall-event history (`py/mem0/mem0/*` Python core is the alt out-of-process backend) |
| `packages/context7-sdk/src/client.ts` | `src/docs/context7-client.ts` | merged; `Context7` class |
| `packages/context7-sdk/src/http/index.ts` | `src/docs/http-client.ts` | merged (retry/backoff/txt headers) |
| `packages/context7-sdk/.../search-library/index.ts` | `src/docs/search-library.ts` | merged |
| `packages/context7-sdk/.../get-context/index.ts` | `src/docs/get-context.ts` | merged |
| `packages/context7-sdk/src/utils/format.ts` | `src/docs/format.ts` | merged |
| `packages/context7-sdk/src/error/index.ts` | `src/docs/errors.ts` | merged |
| `packages/beads-adapter/src/beads-client.ts` | `src/tasks/backends/beads-cli-backend.ts` | merged (`bd` CLI runner) |
| `packages/beads-adapter/src/beads-parser.ts` | `src/tasks/beads-parser.ts` | merged (`parseBeadsTaskMetadata`) |
| `packages/beads-adapter/src/task-spec-mapper.ts` | `src/tasks/task-spec-mapper.ts` | merged (`beadsIssueToTaskSpec`) |
| `packages/beads-adapter/src/sync-{to,from}-recoder.ts` | `src/tasks/sync-{to,from}-recoder.ts` | merged |
| `go/beads/internal/storage/dolt/{dependencies,queries,iter_stubs}.go` | `src/tasks/backends/dolt-rpc-backend.ts` (client) | NEW TS client to the Dolt store's RPC/daemon; logic mirrored in `ready-resolver.ts`, `dependency-walker.ts` |
| `go/beads/internal/types/types.go` (`DependencyType`, `Issue`, `IssueDetails`) | `src/tasks/edge-mapper.ts`, `domain/task-graph.types.ts` | `DependencyType` (`blocks`/`parent-child`/`related`/`discovered-from`/…) maps to brain `EdgeKind`; `IssueDetails` shapes `BrainTask` |
| `go/multica/server/internal/{storage,events,realtime}` | `src/persistence/*`, `src/seams/events-seam.ts` | knowledge/memory storage + event patterns ported into pg-backed candidate store + event sink |

> The real RecoderGit engine (`ts/recodergit`) and the mem0 TS SDK (`py/mem0/mem0-ts/src/oss`), plus the
> remaining TS adapters (`context7-sdk`, `beads-adapter`), collapse **into** `packages/brain` — merged
> and edited, never thin-HTTP-wrapped. The RecoderGit engine sits **behind** `RepoIntelPort`; only
> `repo/repo-intel-adapter.ts` imports its internals, so the rest of the brain depends on the port, not
> on lbug/Tree-sitter. The brain-domain `RepoIntel` type (the assembled repo context pack the
> `RepoIntelPort.contextPack()` returns) is re-exported via `seams/agent-os-seam.ts`; it is built by
> `repo/repo-query.ts` from graph queries, not imported from a `ContextPack` stub (which no longer exists).

---

## 7. Seams to other subsystems

- **agent-os** (`seams/agent-os-seam.ts`): converts a `TaskSpec` (`packages/agent-os/src/domain/task-spec.ts` — `taskId`, `targetPaths`, `forbiddenPaths`, `verification`, `intent`) into a `BrainQuery` (the spec's `targetPaths` seed `query.focusFiles` for the RecoderGit graph walk). Re-exports the brain-domain `RepoIntel` type that `RepoIntelPort.contextPack()` returns.
- **coordination** (`seams/coordination-seam.ts`): a squad/run gets **one** `BrainHandle` (pinned revision) shared by all member agents — assemble-once-reuse across agents, not just across calls. This is the literal "every agent reads once and reuses" guarantee.
- **governance** (`seams/governance-seam.ts`): `record({kind:"memory"})` routes to the approval/policy subsystem as a `MemoryCandidate`; honors work locks and forbidden paths before any task-graph write. Never writes durable memory directly.
- **events** (`seams/events-seam.ts`): every meaningful read/write emits a `RunEvent`/CloudEvent (assemble, recall, candidate-proposed, task-updated) so runs stay auditable.
- **runtimes** (`seams/runtimes-seam.ts`): Claude Code / Codex / Recoder Code / browser agents all call the same `assemble`/`recall`; the Brain is runtime-agnostic.
- **mcp** (`seams/mcp-seam.ts`): exposes `brain.assemble` and `brain.recall` as **read-only** MCP tools (merging RecoderGit's existing MCP tools in `ts/recodergit/gitnexus/src/mcp/{tools,server}.ts`).

---

## 8. Persistence

- **Context cache** (`persistence/cache/*`): read-through over `CachePort`. Prod default
  **redis** (so a context assembled by agent A is reused by agent B in the same run);
  **pg-cache** for durable/cross-session reuse; **memory-cache** for tests. Key = content hash
  of `(repoRoot, task, revision, sources, budget)`; **revision-scoped** so commits invalidate.
- **Memory candidate store** (`persistence/candidate-store/*`): pg table of proposed candidates
  with `status: proposed|approved|rejected` and evidence refs. Source of the governance lane.
- **Docs cache** (`docs/docs-cache.ts`): durable snippet cache keyed by `(libraryId, query)` to
  avoid re-hitting context7.com and to degrade gracefully when the API is unreachable.
- **Recall history** (`memory/history/pg-history.ts`): durable log of recall/remember events for
  audit and "tokens saved" attribution.
- **Vector store**: pgvector (`recoder_pm` w/ pgvector per project memory) is the prod default;
  qdrant + in-memory are alternates behind `VectorStorePort`.
- **Serialization** (`persistence/serialization.ts`): versioned (`schemaVersion`) (de)serialize
  so cached/snapshotted contexts survive schema evolution.

---

## 9. Config, errors, observability

**Config** (`config/*`): `loadBrainConfig(env)` validates via zod (`config-schema.ts`) and
fails fast. Controls: enabled sources, per-source + total `TokenBudget`, cache backend, per-source
timeouts, embedder/vector-store selection. Secrets (`CONTEXT7_API_KEY`, embedder keys, DB URLs)
come **only** from env (`config/env.ts`); none hardcoded. Missing keys → that source is disabled
and reported in `health()` (fail safe).

**Errors** (`errors/*`): `BrainError` base with codes (`ASSEMBLE_FAILED`, `SOURCE_DEGRADED`,
`BUDGET_OVERFLOW`, `INVALID_CONFIG`, `CACHE_UNAVAILABLE`). `SourceError` preserves the underlying
cause + `SourceRef`. `degradation.ts` converts a recoverable source failure into a `Degradation`
(non-fatal) instead of throwing — assemble stays resilient, health stays truthful.

**Observability** (`observability/*`): structured `logger` (no `console.log` in prod paths — the
one `console.warn` in context7-sdk gets routed through the logger on merge); `metrics` for
assemble latency, **cache hit rate**, **tokens-saved** (the headline value metric), per-source
error rate; `tracing` spans per source + per assemble; `audit` trail of who assembled/recalled/
recorded what (governance + truthful-state rules).

---

## 10. Verification

Per `.claude/rules/testing.md` (narrowest check proving touched behavior) and the 80% coverage rule:

```bash
# package-scoped (fast inner loop)
pnpm -F @recoder/brain test          # node --test over src/**/*.test.ts + tests/**
pnpm -F @recoder/brain check-types   # tsc --noEmit
pnpm -F @recoder/brain build         # tsup (dist must build)

# repo Agent OS gates (the brain sits under the Agent OS boundary)
pnpm agent:instructions:check
pnpm test:contracts:agent-os
pnpm format
pnpm check-types
```

Critical behaviors that MUST have tests (all listed in the `tests/` tree above):
1. `assemble` fuses all four sources into one `BrainContext` with correct `sourceRef`s.
2. **Assemble-once-reuse**: second read for same `(repoRoot, task, revision)` hits cache, makes
   **zero** source calls (`assemble-once-reuse.test.ts`) — proves the token-waste fix.
3. New git HEAD sha invalidates and rebuilds repo intelligence (`revision-invalidation.test.ts`).
4. A failing source degrades (`degraded[]`) without failing the whole read.
5. Over-budget context is trimmed by rank, never silently dropping high-risk facts.
6. `record({kind:"memory"})` produces a `MemoryCandidate` and writes **no** durable mem0
   (`memory-candidate-not-durable.test.ts`).
7. Port **contract tests** (`tests/contract/*`) every backend (cli/dolt, pgvector/qdrant/memory,
   redis/pg/memory cache) must satisfy.

---

## 11. Migration plan (incremental, non-breaking)

1. Keep `packages/brain/src/{brain.ts,types.ts,index.ts}` working; introduce `ports/` + `domain/`
   by re-deriving them from the existing `types.ts` contracts (`MemoryRecall`/`DocsSource`/`TaskGraph`).
2. Merge the RecoderGit engine (`ts/recodergit`) into `src/repo/` (tree-sitter → ingestion → scope-resolution
   → graph → lbug storage → embeddings → search), and bind `RepoIntelAdapter`/`repo-query.ts` so
   `RepoIntelPort.contextPack()`/`impact()` run real graph queries. This is NOT a stub — index once per
   revision into `.gitnexus`, then incrementally re-index changed-file subgraphs on new HEAD shas.
3. Pull the mem0 TS SDK (`py/mem0/mem0-ts/src/oss`) memory core + context7 client + beads-adapter into
   `memory/`, `docs/`, `tasks/` behind the new ports; wire `engine/source-runner` to them.
4. Add cache + revision resolution → enable assemble-once-reuse → land the headline metric.
5. Add `candidate-store` + governance seam → enforce reviewable memory.
6. Add Dolt RPC backend for `go/beads` once the Dolt daemon credentials/endpoint exist (until then,
   `beads-cli-backend` is the default; this matches the repo's "fail safe when deps missing" rule).
