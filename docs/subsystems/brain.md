# Subsystem: Brain (`packages/brain`)

> Recoder's **shared memory**. Repo intelligence + semantic recall + external docs + a
> durable task graph + desktop activity, **assembled once per repo/task and reused by every
> agent**. The point is to stop every coding agent from re-reading the repo and re-paying for
> the same context in tokens: the Brain assembles the fused context once, content-addresses it,
> caches it, and hands the same packed `BrainContext` back on every later read for the same
> `(repoRoot, revision, task, source-set)`.

Status (2026-06-29): **BUILT & GREEN, FLAG-GATED, DEFAULT OFF.**
- Package `@recoder/brain` (`packages/brain`, version `0.1.0`) builds and tests green:
  **161 tests pass** across **21 test files** (`node --test --import tsx 'src/**/*.test.ts'`,
  re-run this session). Latest brain commit `cfd181394`
  (*assemble-once cache + tokens-saved metric + real source lighting*).
- Five sources sit behind ports and are wired into `docker-backend`'s `BrainService`
  (`docker-backend/src/agent-os/brain-service.ts`), gated by **`RECODER_BRAIN_ENABLED`**
  (truthy = on, **default OFF** — flag-off is a pure no-op, no adapters constructed).
- The assemble-once content-addressed cache and the **tokens-saved** metric are real
  (`engine/context-cache.ts`, `engine/cache-key.ts`, `persistence/memory-context-cache.ts`,
  surfaced via `runCacheDoctor` + `Brain.cacheStats()`).

> **Important truth-correction vs. earlier drafts of this doc.** An earlier version described a
> 147-file package that **merged** the RecoderGit, mem0, and context7-SDK source trees *into*
> `packages/brain/src/{repo,memory,docs}/…` (tree-sitter/, ingestion/, graph/, storage/,
> embeddings/, search/ subdirectories, etc.). **That file tree does not exist.** The real package
> is ~67 files and does **not** vendor those engines in-process. Each source is consumed through a
> **thin, degrade-safe adapter** behind a port:
> - **RecoderGit** is a **workspace dependency** (`@recoder/recodergit`), driven via its **CLI**
>   (`recodergit impact`) or its **MCP graph server**, behind `RepoIntelPort`. The code-graph
>   indexer is real (an integration test proves live nodes/edges over a fixture repo), but it is
>   *not* copied into `packages/brain`.
> - **mem0** and **context7** are **REST/fetch adapters that do not import their SDKs** — they
>   replicate the wire shape over an injectable transport and are **secret-gated** (see Gaps §11).
> The fusion that *does* exist is at the `BrainContext` level: each adapter maps its results into
> one shared context shape with truthful provenance.

This is a **first-party, owned** subsystem: Recoder owns the fused engines (`ts/recodergit`,
`py/mem0`, `packages/context7-sdk`, `go/beads`, `@recoder/continuum`) elsewhere in the monorepo,
and the Brain consumes them as replaceable adapters — never as thin third-party HTTP wraps it does
not control.

| Source (port) | What it provides | How the Brain reaches it today | Adapter file |
| --- | --- | --- | --- |
| **RecoderGit** (`RepoIntelPort`) | Repo intelligence: code knowledge graph (Tree-sitter → scope resolution → graph → search), `impact`/contextPack, dependency edges, changed-file risk. **Real engine** (`ts/recodergit`, dep `@recoder/recodergit`). | `recodergit impact` **CLI** (one call per target path) or the RecoderGit **MCP graph server**, auto-selected & degrade-safe; falls back to a mock context pack if the engine is unbuilt. | `repo/recodergit-repo-intel.ts`, `repo/recodergit-mcp-repo-intel.ts`, `repo/repo-intel-adapter.ts`, `repo/recodergit-symbol-resolve.ts` |
| **continuum** (`ActivityPort`) | Desktop/agent activity: recent activity, profile snapshot, grounded Q&A. **In-process** owned engine (`@recoder/continuum`). | In-process `@recoder/continuum` engine (no shell-out, since `756cb7232`). | `activity/continuum-activity-adapter.ts` |
| **mem0** (`MemoryPort`) | Semantic recall + remember (write-back). | **REST adapter over fetch** to a self-hosted mem0 server (`POST /search`, `POST /memories`). SDK **not** imported. Secret-gated. | `memory/mem0-memory.ts` |
| **context7** (`DocsPort`) | External library docs (resolve library → fetch snippets). | **fetch adapter** replicating context7's wire shape (`GET v2/libs/search`, `GET v2/context`). SDK **not** imported. Secret-gated. | `docs/context7-docs.ts` |
| **beads** (`TaskGraphPort`) | Durable task graph: related/ready/blocked, update. | Shells the **`bd` CLI** behind an injectable exec; degrades to `[]` when `bd` is absent. | `tasks/beads-tasks.ts` |

---

## 1. Design goals & invariants (as implemented)

1. **Assemble once, read many.** `Brain.assemble(query)` content-addresses the result on
   `(repoRoot, taskId/task, focusFiles, limit, revision, source-set)` and caches it. A second read
   for the same key is a cache **HIT** that makes **zero** source calls and returns the same object,
   accumulating `tokensSaved` (`brain.ts` → `engine/context-cache.ts`, `engine/cache-key.ts`).
2. **Revision-scoped invalidation.** The cache key includes the resolved git revision (HEAD sha +
   dirty flag). A new commit changes the revision → changes the key → stale repo intelligence ages
   out naturally (`engine/revision-resolver.ts`).
3. **Fusion at the context level.** Each source maps into one `BrainContext` with truthful
   per-source provenance (`engine/provenance-builder.ts`, `domain/provenance.ts`). The fusion is the
   shared context shape, not an in-process merge of the engines' source code.
4. **Truthful provenance / fail-safe sources.** Every source runs behind `engine/source-runner.ts`
   (`runSource`): a dark or failing source contributes its empty value plus a `degraded` provenance
   entry and is never reported as having contributed. No single source can fail the read.
5. **Governed write-back.** `Brain.record({kind:"memory"})` calls `MemoryPort.remember`; the MCP
   `brain_record` tool is documented as **never** writing durable memory directly (it emits a
   candidate for governance — see §6). `record({kind:"task"})` routes to `TaskGraphPort.update`.
6. **Adapters are replaceable.** Core (`Brain`) depends only on the ports
   (`ports/*.port.ts`), never on concrete clients. The cache store is injectable
   (`BrainContextCacheStore`) so a Postgres/Redis store can replace the in-memory default for
   cross-process / cross-agent reuse.
7. **Default off, fail-safe.** `BrainService` is gated by `RECODER_BRAIN_ENABLED`; flag-off
   returns `null` without constructing any adapter. Any assembly error degrades to `null` and is
   logged — it never throws into a request path.

---

## 2. Real file tree (~67 files, 21 of them tests)

```
packages/brain/
├── package.json            # @recoder/brain 0.1.0; deps: @recoder/{recodergit,agent-os,continuum},
│                           #   @modelcontextprotocol/sdk. bin: recoder-brain -> dist/seams/mcp-stdio.js
├── tsconfig.json
├── tsup.config.ts
└── src/
    ├── index.ts            # public barrel (Brain, adapters, ports, domain types, doctors, engine)
    ├── brain.ts            # Brain class: assemble / assembleForTask / refresh / recall /
    │                       #   recentActivity / activitySnapshot / answerActivity / record / cacheStats
    ├── types.ts            # legacy type seam (kept for back-compat)
    │
    ├── domain/             # data shapes (no IO)
    │   ├── brain-context.types.ts  # BrainContext (repo, memories, docs, tasks, activity, revision,
    │   │                           #   provenance, assembledAt, estimatedTokens)
    │   ├── brain-query.ts          # BrainQuery (task, repoRoot, focusFiles, limit)
    │   ├── brain-event.ts          # BrainEvent (memory | task)
    │   ├── memory.types.ts         # BrainMemory
    │   ├── docs.types.ts           # BrainDoc
    │   ├── task-graph.types.ts     # BrainTask
    │   ├── activity.types.ts       # BrainActivity, BrainActivityProfile
    │   ├── provenance.ts           # Provenance, SourceProvenance, BrainSourceKind, DegradeReason
    │   ├── revision.ts             # Revision (HEAD sha + dirty)
    │   └── index.ts
    │
    ├── ports/              # source contracts (the interfaces Brain depends on)
    │   ├── repo-intel.port.ts      # RepoIntelPort.contextPack()
    │   ├── memory.port.ts          # MemoryPort.recall()/remember()
    │   ├── docs.port.ts            # DocsPort.lookup()
    │   ├── task-graph.port.ts      # TaskGraphPort.related()/update()
    │   ├── activity.port.ts        # ActivityPort.recall()/recent()/profile()/snapshot()/answer()
    │   ├── cache.port.ts           # BrainContextCacheStore
    │   ├── clock.port.ts           # ClockPort + systemClock
    │   └── index.ts                # (also exports deprecated aliases MemoryRecall/DocsSource/TaskGraph)
    │
    ├── engine/             # assemble-once cache + fusion plumbing
    │   ├── cache-key.ts            # buildCacheKey (content-addressed), repoKeyPrefix
    │   ├── context-cache.ts        # ContextCache: read-through, hit/miss + tokensSaved accounting
    │   ├── revision-resolver.ts    # resolveRevision (git HEAD + dirty)  [NO_HEAD_SENTINEL]
    │   ├── source-runner.ts        # runSource: per-source degrade-safe run + provenance
    │   ├── provenance-builder.ts   # buildProvenance over per-source outcomes
    │   ├── token-estimator.ts      # estimateTokens / estimateTokensOfParts
    │   ├── context-tokens.ts       # estimateContextTokens (whole BrainContext)
    │   └── index.ts
    │
    ├── repo/               # RecoderGit adapter (CLI + MCP), behind RepoIntelPort
    │   ├── repo-intel-adapter.ts       # ContextPackRepoIntel (mock/default contextPack)
    │   ├── recodergit-repo-intel.ts    # CLI-backed (`recodergit impact`) + createRepoIntelAuto
    │   ├── recodergit-mcp-repo-intel.ts# MCP-graph-server-backed path
    │   ├── recodergit-symbol-resolve.ts# cypher symbol resolution -> impact merge
    │   └── *.test.ts incl. recodergit-integration.test.ts (REAL engine, skipped if unbuilt)
    │
    ├── memory/   mem0-memory.ts        # REST adapter (no SDK import), MemoryPort
    ├── docs/     context7-docs.ts      # fetch adapter (no SDK import), DocsPort
    ├── tasks/    beads-tasks.ts        # `bd` CLI exec adapter, TaskGraphPort
    ├── activity/ continuum-activity-adapter.ts  # in-process @recoder/continuum, ActivityPort
    │
    ├── persistence/
    │   └── memory-context-cache.ts     # InMemoryContextCache (default BrainContextCacheStore)
    │
    ├── runtime/            # truthful health "doctors" + engine discovery
    │   ├── engine-resolver.ts          # resolves recodergit bin/MCP, mem0 base, context7 key
    │   ├── doctor.ts                   # per-engine health probe
    │   ├── code-graph-doctor.ts        # proves the graph is LIVE (real node/edge counts)
    │   └── cache-doctor.ts             # projects cacheStats -> CacheReport (tokens-saved)
    │
    └── seams/              # MCP exposure
        ├── mcp-seam.ts                 # brain_assemble / brain_recall / brain_record / brain_activity
        ├── mcp-server.ts               # createBrainMcpServer / createDefaultBrain
        └── mcp-stdio.ts                # `recoder-brain` stdio entrypoint (package bin)
```

Verify the count yourself:

```bash
find packages/brain/src -type f | wc -l          # ~67
find packages/brain/src -name '*.test.ts' | wc -l # 21
```

---

## 3. Public API surface (real)

Exported from `packages/brain/src/index.ts`:

```ts
// Construction
export { Brain, createBrain, type BrainDeps } from "./brain";

// Adapters (each individually degrade-safe; choose backends when wiring)
export { createRepoIntelAuto, createRecoderGitRepoIntel, ContextPackRepoIntel } from "./repo/...";
export { createContinuumActivity } from "./activity/continuum-activity-adapter";
export { createMem0Memory } from "./memory/mem0-memory";
export { createContext7Docs } from "./docs/context7-docs";
export { createBeadsTasks } from "./tasks/beads-tasks";

// MCP seam (read-mostly tools)
export { createBrainTools, BRAIN_TOOL_NAMES, createBrainMcpServer, runBrainMcpStdio } from "./seams/...";

// Engine + doctors
export { ContextCache, buildCacheKey, resolveRevision, runSource, estimateContextTokens } from "./engine";
export { runDoctor, runCodeGraphDoctor, runCacheDoctor } from "./runtime/...";

// Domain types + ports
export type { BrainContext, BrainQuery, BrainEvent, BrainMemory, BrainDoc, BrainTask,
  BrainActivity, BrainActivityProfile, Revision, Provenance, SourceProvenance } from "./domain";
export type { RepoIntelPort, MemoryPort, DocsPort, TaskGraphPort, ActivityPort,
  BrainContextCacheStore, ClockPort } from "./ports";
```

`Brain` methods (see `brain.ts`):

| Method | What it does |
| --- | --- |
| `assemble(query, repoInput?)` | One fused read; content-addressed + cached; returns `BrainContext`. |
| `assembleForTask(task, repoRoot, opts?)` | Assemble around a real `TaskSpec` (`@recoder/agent-os`): feeds the engine the spec's `taskId` + `targetPaths`, so repo provenance is keyed to the real task. |
| `refresh(repoRoot)` | Invalidate cached contexts for a repo; returns count dropped. |
| `recall(query, limit?)` | Focused semantic recall via `MemoryPort` only (no full assemble). |
| `recentActivity` / `activitySnapshot` / `answerActivity` | Continuum activity reads (back the `brain_activity` MCP tool). |
| `record(event)` | Write-back: `memory` → `MemoryPort.remember`; `task` → `TaskGraphPort.update`. |
| `cacheStats()` | The headline value accounting: hits/misses/hitRate/`tokensSaved`. |

---

## 4. `BrainContext` (the fusion contract)

`domain/brain-context.types.ts`. The assembled object every agent shares:

```ts
interface BrainContext {
  repo: ContextPack;             // RecoderGit context pack (dependencyGraph, impactReport, sourceRefs, taskId)
  memories: BrainMemory[];       // mem0 recall
  docs: BrainDoc[];              // context7 snippets
  tasks: BrainTask[];            // beads related issues
  activity: { recent: BrainActivity[]; profile: BrainActivityProfile | null }; // continuum
  revision: Revision;            // git HEAD sha + dirty (cache-key spine)
  provenance: Provenance;        // per-source: contributed?, itemCount, degradeReason, detail
  assembledAt: string;
  estimatedTokens: number;       // stamped so a later HIT attributes the right tokensSaved
}
```

`repo` is a real `ContextPack` from `@recoder/recodergit` when the engine is built (the integration
test asserts non-empty `dependencyGraph.edges`, a real `main.ts -> sum.ts` CALLS edge, and
`git_nexus` provenance with a *"Real RecoderGit impact"* detail). When the engine is unbuilt it
degrades to an empty-but-well-shaped pack — annotated in `provenance`, never faked as contributed.

---

## 5. `assemble(query)` data flow (real)

```
BrainQuery {task, repoRoot, focusFiles, limit}
        │
  engine/revision-resolver  (git HEAD sha + dirty)
        │
  engine/cache-key  ──►  hash(repoRoot, taskId/task, focusFiles, limit, revision, source-set)
        │
  ContextCache.lookup
   HIT ─► return cached BrainContext   (0 source calls; tokensSaved += ctx.estimatedTokens)
   MISS ▼
  Promise.all over the wired sources, EACH via engine/source-runner.runSource
     repo (RepoIntelPort)   memory (MemoryPort)   docs (DocsPort)   tasks (TaskGraphPort)   activity (ActivityPort)
        └────────────┴── each failure -> empty value + "degraded" provenance entry ──┴────────────┘
        ▼
  buildProvenance  →  BrainContext (+ estimatedTokens = estimateContextTokens(ctx))
        ▼
  ContextCache.store  →  return BrainContext
```

Notes that match the code:
- The repo source has a **fallback**: on engine failure it degrades to `createContextPack(input)`
  (a real, empty-but-keyed pack) so the rest of the read stays well-shaped.
- Only **wired** sources run. `memory`/`docs`/`tasks`/`activity` are absent unless their `create*`
  adapter is passed in `BrainDeps`. An absent source contributes `[]`/empty + a `not_configured`
  provenance entry.
- `recall(query)` skips the full assemble and hits `MemoryPort.recall` directly.

---

## 6. Governed write-back & MCP

- MCP tools (`seams/mcp-seam.ts`): `brain_assemble`, `brain_recall`, `brain_record`,
  `brain_activity`. `brain_assemble`/`brain_recall` are read-only; `brain_record` is documented to
  **never** write durable memory directly (memory records become governance candidates).
- The package ships a stdio MCP entrypoint (`bin: recoder-brain` → `dist/seams/mcp-stdio.js`).
- The governance/candidate-approval lane and a durable candidate store are **not implemented inside
  `packages/brain`** today (see Gaps §11). `Brain.record({kind:"memory"})` currently calls
  `MemoryPort.remember` when a memory adapter is wired.

---

## 7. docker-backend wiring (`BrainService`)

`docker-backend/src/agent-os/brain-service.ts`:
- Gate: **`RECODER_BRAIN_ENABLED`** (truthy = on, default OFF). Flag-off → `assembleForTask` returns
  `null`, **no adapters constructed**.
- Default factory wires all five: `createRepoIntelAuto`, `createContinuumActivity`,
  `createMem0Memory`, `createContext7Docs`, `createBeadsTasks`.
- `cacheReport()` projects `Brain.cacheStats()` through `runCacheDoctor()` and is truthful:
  before the brain is read once, `report.available` is `false` ("nothing reported yet"), not a
  fabricated zeroed-green. Control-plane surface: `routes/brain-stats.routes.ts`.

---

## 8. Persistence (real)

- **Context cache**: `persistence/memory-context-cache.ts` — `InMemoryContextCache`, the default
  `BrainContextCacheStore`. A Postgres/Redis store can be injected for cross-process / cross-agent
  reuse, but **no pg/redis cache backend ships in this package today** (Gaps §11).
- **Vector store / recall history / candidate store**: not in `packages/brain`. Recall persistence
  lives in the external mem0 server; there is no `pgvector`/`qdrant`/`candidate-store` code inside
  this package.

---

## 9. Config & secret gating (real)

`runtime/engine-resolver.ts` resolves engines from env (overridable for tests):
- **RecoderGit**: `RECODERGIT_BIN` (CLI) / `RECODERGIT_MCP_URL` (MCP graph server); else falls back
  to the mock context pack. Discovery is degrade-safe.
- **mem0**: `MEM0_BASE_URL` (+ `MEM0_API_KEY`, `MEM0_USER_ID`). Absent base URL → recall degrades to
  `[]`, remember is a silent no-op.
- **context7**: `CONTEXT7_API_KEY`. Absent → docs degrade to `[]`.

No secrets are hardcoded; missing keys disable that source and surface as a degraded/`not_configured`
provenance entry rather than an error.

---

## 10. Verification (commands actually defined)

```bash
# package-scoped (fast inner loop) — scripts from packages/brain/package.json
pnpm -F @recoder/brain test         # node --test --import tsx 'src/**/*.test.ts'  -> 161 tests pass
pnpm -F @recoder/brain check-types  # tsc --noEmit
pnpm -F @recoder/brain build        # tsup
```

Test inventory (verified): **21 `*.test.ts` files, 161 tests, 0 fail** (run this session). Coverage
spans the engine (cache-key, context-cache, revision-resolver, source-runner, provenance-builder,
token-estimator, context-tokens), the adapters (repo/recodergit CLI + MCP, mem0, context7, beads,
continuum), the persistence cache, the runtime doctors, the MCP seam, and `brain.ts`.

`repo/recodergit-integration.test.ts` is the **real** code-graph proof: it builds + indexes a fixture
repo with the actual `recodergit` engine and asserts live node/edge counts and a real dependency
edge. It is **skipped when the engine is not built** (`ts/recodergit`), so a clean checkout without a
built engine runs the rest green and skips this one — honest, not a silent pass.

> No package-level coverage report is produced by these scripts; the 80% coverage rule is not
> independently measured here. Treat "161 tests pass" as the verified fact, not a coverage claim.

---

## 11. Gaps / not-yet-live (honest)

These are **NOT** shipped/proven today. Do not treat them as done:

1. **mem0 live recall is SECRET-GATED / not proven end-to-end in this repo.** The adapter
   (`memory/mem0-memory.ts`) is a REST client requiring a running self-hosted mem0 server
   (`MEM0_BASE_URL` + `MEM0_API_KEY`). With no server/keys it degrades to `[]`. The tests use a fake
   transport; there is **no live mem0 integration test** here. *Configured, not proven.*
2. **context7 live docs are SECRET-GATED.** `docs/context7-docs.ts` needs `CONTEXT7_API_KEY` and a
   reachable `context7.com`. Tests use a fake fetch; no live call is exercised. *Configured, not
   proven.*
3. **No in-process fusion of the RecoderGit / mem0 / context7 source trees.** The Brain consumes
   RecoderGit as a CLI/MCP dependency and mem0/context7 as REST/fetch adapters. The previously
   documented `repo/{tree-sitter,ingestion,graph,storage,embeddings,search,…}` and
   `memory/{embeddings,vector-stores,history}` / `docs/*` merged trees **do not exist**.
4. **Governance / memory-candidate lane is external.** No candidate store, approval queue, or
   `candidate-writer` exists inside `packages/brain`. `record({kind:"memory"})` calls
   `MemoryPort.remember` directly when a memory adapter is wired; the "never durable, reviewed-only"
   guarantee is documented for the MCP `brain_record` tool but is enforced by the governance
   subsystem, not by this package.
5. **No shared cross-process cache backend ships here.** Only `InMemoryContextCache` is implemented;
   a Postgres/Redis store is an injectable seam, not provided. "Agent B reuses agent A's context
   across processes" requires wiring such a store.
6. **Dolt task-graph backend not present.** Beads access is the **`bd` CLI** only
   (`tasks/beads-tasks.ts`). There is no Dolt RPC backend, `dependency-walker`, `ready-resolver`, or
   `go/beads` daemon client in this package.
7. **Default OFF in docker-backend.** `RECODER_BRAIN_ENABLED` is off by default; live agent runs do
   not use the Brain unless explicitly enabled. The "wire into live agent runs" step is tracked as
   pending in the subsystems README roadmap.
8. **Coverage not measured.** See §10.
