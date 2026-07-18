# Domain: Memory & Retrieval

> Folder prefix: `backend/src/domains/memory/` (+ vendored engines in `backend/engines/py/{mem0,colbert}`)
> The ONE memory entry point. Everything agents remember + retrieve.

> **STATUS (2026-07-18): SHIPPED.** Phase 8 landed (`e13342848`, 44 files / 31 tests
> vs a 34-file budget), plus follow-ups: an **embedded Lance vector store** as the
> no-server default when Qdrant is absent (P1), **mem0 defaults to google/Gemini**
> (Phase-A `d8d44aafb`), **ColBERT real MaxSim rerank** + a **real Qdrant liveness
> probe**, **billing metering emitters** on memory writes (P2), the governed **MCP
> HTTP edge** `POST /api/mcp/tools/:server/:tool/call` now LIVE, and the cross-tenant
> authorization class closed (every subject-bearing MCP tool binds `userId` to the
> host-authorized `McpToolCaller`, `67eed3613`). The sections below are reconciled to
> that shipped reality; where the original design diverged from what shipped it is
> flagged inline.

## 1. Overview

Memory & Retrieval is the single seam through which every agent (and every other
domain) **remembers**, **recalls**, and **retrieves**. It fuses four legacy
memory sources that today live scattered across `conductor/` and
`agent-os/mcp/` into one composer with one public interface:

1. **mem0** — semantic per-user memory (LLM-distilled facts). The vendored
   `backend/engines/py/mem0` sidecar **defaults its LLM to google/Gemini** (Phase-A),
   BYOK embeddings, over its own vector backend. Legacy:
   `backend/src/engines/mem0-client.ts` + `backend/engines/py/mem0` FastAPI sidecar.
2. **beads (bd)** — the issue-graph SHARED memory layer (Dolt-versioned,
   candidate→promote lifecycle). Legacy: `backend/src/conductor/beads-memory.ts`.
3. **agent-os candidates** — the canonical, reviewed `MemoryCandidate`/`MemoryItem`
   store-of-record (Postgres). Legacy:
   `backend/src/agent-os/mcp/memory-store-adapter.ts` + repository.
4. **retrieval/RAG** — shared embeddings + vector + colbert rerank for document
   ingest/search (code intel + docs). Legacy:
   `backend/src/agent-os/mcp/{retrieval-engine,vector-store}.ts`,
   `conductor/colbert-rerank.ts`.

The composer's job: **recall fusion** (mem0 ∪ beads-SQL ∪ candidates → colbert
rerank → dedupe → provenance-tagged), the **remember→promote→forget→relate**
lifecycle (promote is governance-gated), **retrieval ingest/search**, and the
two lifecycle hooks the conductor calls: **recall on launch** (prompt
enrichment) and **harvest on completion** (candidate generation). Legacy
`conductor/bundle.ts::enrichPrompt` and `completion-watcher` stop reaching into
mem0/beads/colbert directly and call this domain's port instead.

### Boundary & law compliance

- **State-of-record stays agent-os-owned.** `MemoryCandidate`/`MemoryItem` are
  written through the persistence repository port; this domain never invents a
  parallel store. mem0/beads are *derived/mirror* layers, always degrade-safe.
- **Promote is a WRITE → governance gate.** `promote`, `forget`, and durable
  `remember` (accept) flow through `GovernanceGate.decide()` +
  `record_audit`. Recall/search are reads (still interop-authorized, not
  governance-gated).
- **Every edge + MCP tool passes `authorize→risk→policy→audit`** (`@recoder/interop`).
- **Degrade-safe everywhere.** No mem0 provider / no vector store (neither an
  embedded `LANCE_DATA_DIR` nor a `QDRANT_URL`) / no colbert / no `bd` binary / no
  torch venv → the source reports `down`, recall silently drops that source, and the
  fusion returns whatever remains. Nothing is faked. The vector store is a real
  probe: Qdrant does a liveness GET (URL presence ≠ reachability), the embedded Lance
  store actually attempts its napi/SDK load.

## 2. File tree (`backend/src/domains/memory/`)

```
memory/
  index.ts                         # factory createMemoryModule(deps) + public MemoryModule interface
  memory-module.ts                 # composer: fuses recall/retrieval/lifecycle engines behind the interface
  config.ts                        # MemoryConfig slice (zod) sliced from AppConfig
  types.ts                         # domain types: RecallQuery, RecalledMemory, Provenance, FusionResult, IngestDoc
  health.ts                        # aggregate per-engine health (mem0|beads|colbert|vector|candidates)

  recall/
    recall-fusion.ts               # fuse mem0 ∪ beads ∪ candidates → rerank → dedupe → provenance-tag (inline)
    dedupe.ts                      # near-dup collapse (normalized text + cosine/jaccard threshold)
    rank.ts                        # merge+rerank orchestration (colbert when up, score-blend fallback)
    index.ts                       # recall barrel
    dedupe.test.ts / recall-fusion.test.ts  # dedupe + fusion (union, provenance, source-down drop)
    # NOTE: provenance is NOT a separate `provenance.ts` — tagging is folded into recall-fusion.ts.

  lifecycle/
    memory-lifecycle.ts            # accept/reject (promote); promotion passes the governance gate
    candidate-service.ts           # MemoryCandidate propose/list/get over repository port + wisp mirror
    forget.ts                      # forget/tombstone a durable item (governance-gated) — its OWN service
    harvest.ts                     # completion harvest: run evidence → MemoryCandidate
    relate.ts                      # relate/unrelate(memoryId, memoryId, kind) edges
    write-allowlist.ts             # scope write-allowlist guard on candidate propose / harvest
    index.ts                       # lifecycle barrel
    lifecycle-services.test.ts / memory-lifecycle.test.ts / forget.test.ts / write-allowlist.test.ts

  retrieval/
    retrieval-service.ts           # ingest/search over shared vector+embed+rerank foundation
    vector-foundation.ts           # EmbeddingPort + VectorStorePort (BYOK embed + Lance/Qdrant, degrade-safe)
    chunker.ts                     # document chunking for ingest (token-window + overlap)
    retrieval-service.test.ts / vector-foundation.lance.test.ts

  ports/
    memory-store.port.ts           # re-exports @recoder/agent-memory MemoryStore (repo seam)
    memory-repository.port.ts      # Repository PORT: candidates + items + relations (persistence impl)
    mem0.port.ts                   # Mem0Port: search/add/health (semantic per-user)
    beads-memory.port.ts           # BeadsMemoryPort: remember/recall/promote/note (issue graph)
    reranker.port.ts               # RerankerPort: rerank(query, passages) → order (colbert)
    embedding.port.ts              # EmbeddingPort: embed(texts) → vectors | null
    vector-store.port.ts           # VectorStorePort: ensureCollection/upsert/search
    retrieval.port.ts              # RetrievalPort: ingest(docs)/search(query) (RAG facade)

  adapters/
    mem0.adapter.ts                # wraps engines/mem0-client.ts (platform|oss|none), degrade-safe
    beads-memory.adapter.ts (+ beads-memory.ts)  # bd CLI adapter + inlined helper, degrade-safe
    colbert.adapter.ts (+ colbert-sidecar.client.ts)  # COLBERT_RERANK_URL rerank, identity fallback
    qdrant.adapter.ts              # Qdrant VectorStorePort (real liveness probe)
    lance.adapter.ts (+ lance-napi.client.ts)  # embedded Lance VectorStorePort via napi (no-server default)
    embedding.adapter.ts (+ embedding-fallback.adapter.ts)  # BYOK/tensorzero/openai embed; hash fallback
    candidate-repository.adapter.ts# concrete MemoryRepository over persistence QueryExecutor + agent-os store
    mem0-sidecar.client.ts         # HTTP client to engines/py/mem0 FastAPI (self-hosted mode)

  routes/
    memory.routes.ts               # HTTP edges: recall / candidates(+accept/reject) / items forget / relations
    retrieval.routes.ts            # HTTP edges: retrieval status/ingest/search
    internal-memory.routes.ts      # /internal/agent-os/memory/harvest (INTERNAL_SERVICE_KEY-gated)
    index.ts                       # routes barrel
    internal-memory.routes.test.ts

  mcp/
    memory-engine.ts               # MCP tools: memory_recall/remember/promote/relate/forget (buildMemoryMcpTools)
    retrieval-engine.ts            # MCP tools: retrieval_search/retrieval_ingest (buildRetrievalMcpTools)
    index.ts                       # mcp barrel
    memory-engine.test.ts / retrieval-engine.test.ts

  vector-store.ts                  # shared vector-store helper (module-level)
```

**File count: 44 shipped** (design budget was 34; the build came in over-budget as the
Lance embedded store, the split `forget`/`write-allowlist` lifecycle services, the
internal harvest route, and per-dir barrels/tests were added). Two composer-level tests
(`__tests__/memory-integration`, `harvest-recall`) from the original design were folded
into the co-located `*.test.ts` suites rather than a separate `__tests__/` dir.

## 3. Per-file responsibilities

> **Reconciled to shipped.** The table is the original design intent; the shipped
> code diverges as follows: `recall/provenance.ts` was folded into `recall-fusion.ts`
> (no standalone file); the lifecycle split into `memory-lifecycle.ts` (accept/reject),
> a dedicated `forget.ts`, `relate.ts`, `candidate-service.ts`, plus `write-allowlist.ts`;
> the vector foundation gained an embedded `lance.adapter.ts`/`lance-napi.client.ts`
> alongside `qdrant.adapter.ts`; and the public surface is a **composer with service
> accessors** (`MemoryComposer` in `memory-module.ts`) rather than the flat `MemoryModule`
> method interface sketched below (see §6).

| path | lang | kind | responsibility | keyExports |
|---|---|---|---|---|
| `index.ts` | ts | service | Pure factory + the ONE public interface for the domain. No singletons. | `createMemoryModule(deps: MemoryDeps): MemoryModule`, `interface MemoryModule` |
| `memory-module.ts` | ts | service | Composer: wires recall-fusion, lifecycle, retrieval behind `MemoryModule`; routes writes through gate; aggregates health. | `buildMemoryModule(deps)` |
| `config.ts` | ts | config | Zod slice of AppConfig this domain reads (QDRANT_URL, MEM0_*, COLBERT_RERANK_URL, collection names, TTLs, dedupe threshold). Never reads process.env. | `MemoryConfig`, `memoryConfigSchema`, `sliceMemoryConfig(app)` |
| `types.ts` | ts | type | Domain types not in packages/*. | `RecallQuery`, `RecalledMemory`, `Provenance`, `FusionResult`, `IngestDoc`, `RelationKind` |
| `health.ts` | ts | service | Truthful per-engine health rollup. | `memoryHealth(engines): HealthReport` |
| `recall/recall-fusion.ts` | ts | service | Fan-out to mem0 ∪ beads ∪ candidates, rerank, dedupe, provenance-tag; drops down sources. | `recallFused(query, deps): FusionResult` |
| `recall/dedupe.ts` | ts | service | Collapse near-duplicate recalled texts (normalize + similarity threshold from config). | `dedupeMemories(items, threshold)` |
| `recall/provenance.ts` | ts | service | Attach `{source, ref, score, scope}` to each item; stable ordering. | `tagProvenance(items, source)` |
| `recall/rank.ts` | ts | service | Merge candidate lists, call reranker port (colbert), fall back to score-blend when down. | `rankMemories(query, lists, reranker)` |
| `recall/recall-fusion.test.ts` | ts | test | union/dedupe/provenance/source-down-drop. | — |
| `lifecycle/memory-lifecycle.ts` | ts | service | remember/promote/forget/relate; promote+forget+accept go through GovernanceGate.decide + record_audit. | `rememberCandidate`, `promoteCandidate`, `forgetMemory`, `relateMemories` |
| `lifecycle/candidate-service.ts` | ts | service | Candidate CRUD/review over MemoryRepository port; mirrors to beads wisp best-effort. | `createCandidate`, `listCandidates`, `reviewCandidate` |
| `lifecycle/harvest.ts` | ts | service | Completion hook: RunEvent + artifact → MemoryCandidate (evidence: taskId+artifactId). | `harvestOnCompletion(run, deps): MemoryCandidate \| null` |
| `lifecycle/relate.ts` | ts | service | Persist relation edges (supersedes / derived-from / contradicts). | `addRelation`, `listRelations` |
| `lifecycle/memory-lifecycle.test.ts` | ts | test | promote gated (deny→no write), forget gated, remember ephemeral, relate edges. | — |
| `retrieval/retrieval-service.ts` | ts | service | ingest(chunk→embed→upsert) + search(embed→vector→rerank); truthful `not_configured`. | `ingest(docs)`, `search(query, opts)` |
| `retrieval/vector-foundation.ts` | ts | service | Compose EmbeddingPort + VectorStorePort (BYOK + Qdrant) — the shared seam. | `createVectorFoundation(deps)` |
| `retrieval/chunker.ts` | ts | service | Token-window chunk with overlap; stable chunk ids. | `chunkDocument(doc, opts): Chunk[]` |
| `retrieval/retrieval-service.test.ts` | ts | test | ingest→search roundtrip, unconfigured degrade, chunk boundaries. | — |
| `ports/memory-store.port.ts` | ts | port | Re-export `@recoder/agent-memory` MemoryStore (canonical store seam). | `MemoryStore` |
| `ports/memory-repository.port.ts` | ts | port | Repository interface persistence implements (items+candidates+relations). | `MemoryRepository` |
| `ports/mem0.port.ts` | ts | port | Semantic per-user memory port. | `Mem0Port`, `Mem0Result` |
| `ports/beads-memory.port.ts` | ts | port | Issue-graph memory port. | `BeadsMemoryPort` |
| `ports/reranker.port.ts` | ts | port | Rerank port (colbert). | `RerankerPort`, `RerankResult` |
| `ports/embedding.port.ts` | ts | port | Embedding port (null when unconfigured). | `EmbeddingPort` |
| `ports/vector-store.port.ts` | ts | port | Vector store port. | `VectorStorePort` |
| `ports/retrieval.port.ts` | ts | port | RAG ingest/search facade port (consumed by other domains). | `RetrievalPort` |
| `adapters/mem0.adapter.ts` | ts | client | Adapt `engines/mem0-client.ts` to Mem0Port; degrade to `available:false`. | `createMem0Adapter(config)` |
| `adapters/beads-memory.adapter.ts` | ts | client | Adapt `conductor/beads-memory.ts` to BeadsMemoryPort; `[]`/undefined when bd absent. | `createBeadsMemoryAdapter()` |
| `adapters/colbert.adapter.ts` | ts | client | Adapt `conductor/colbert-rerank.ts` to RerankerPort; identity order when unset/down. | `createColbertAdapter(config)` |
| `adapters/qdrant.adapter.ts` | ts | client | Adapt `agent-os/mcp/vector-store.ts` createVectorStore to VectorStorePort. | `createQdrantAdapter(config)` |
| `adapters/embedding.adapter.ts` | ts | client | Adapt createEmbeddingPort (BYOK/tensorzero/openai); null on unconfigured. | `createEmbeddingAdapter(config)` |
| `adapters/candidate-repository.adapter.ts` | ts | repository | Concrete MemoryRepository over persistence QueryExecutor (`:param` SQL, `WHERE user_id=:user_id`). | `createMemoryRepository(query)` |
| `adapters/mem0-sidecar.client.ts` | ts | client | HTTP client to `engines/py/mem0` FastAPI (self-hosted mode; `/memories` `/search`). | `mem0SidecarClient(baseUrl, fetch)` |
| `adapters/colbert-sidecar.client.ts` | ts | client | HTTP client to `engines/py/colbert` rerank_server (`POST /rerank`). | `colbertSidecarClient(url, fetch)` |
| `routes/memory.routes.ts` | ts | route | HTTP edges; zod-validate; interop chain; gate on promote/forget; sendSuccess/sendError. | `memoryRoutes(module, deps): Router` |
| `routes/retrieval.routes.ts` | ts | route | HTTP edges for ingest/search. | `retrievalRoutes(module, deps): Router` |
| `routes/memory.routes.test.ts` | ts | test | auth, validation, gate-on-promote, error envelope. | — |
| `mcp/memory-engine.ts` | ts | client | Register memory MCP tools per wiring checklist; conform to ToolRouter. | `registerMemoryMcpTools(router, deps)` |
| `mcp/retrieval-engine.ts` | ts | client | Register retrieval MCP tools (reuse `@recoder/agent-mcp` handlers). | `registerRetrievalMcpTools(router, deps)` |
| `mcp/memory-engine.test.ts` | ts | test | router conformance + interop passes. | — |
| `__tests__/memory-integration.test.ts` | ts | test | remember→recall→promote→search e2e with fake engines. | — |
| `__tests__/harvest-recall.test.ts` | ts | test | harvest on completion + recall on launch hooks. | — |

## 4. Database schema (migrations)

Migrations live in `backend/migrations/` (canonical, raw parameterized SQL; runner
in `domains/persistence`).

**SHIPPED: the memory domain owns exactly ONE migration — `memory_0001_relations.sql`.**
The `memory_items` + `memory_candidates` tables were **NOT** created by this domain
(conflict #3 in the composer: **agent-os owns the candidate/item store-of-record**).
Those two tables ship inside the agent-os schema migration
(`agentos_0001_schema.sql`); the memory domain's
`candidate-repository.adapter.ts` delegates item/candidate reads+writes to the injected
agent-os `candidateStore`, and only the *relations* edges live in a memory-owned table.
The intended `memory_items` / `memory_candidates` shapes are kept below for reference
(they mirror the `@recoder/agent-os` `MemoryItem`/`MemoryCandidate` types the agent-os
migration realizes), followed by the one migration this domain actually declares.

`memory_items` (owned by `agentos_0001_schema.sql`, shape for reference):
```sql
CREATE TABLE IF NOT EXISTS memory_items (
  memory_id           TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,          -- app-layer access control (WHERE user_id = :user_id)
  scope               TEXT NOT NULL,          -- user|org|space|repo|path|agent|task-type
  scope_ref           TEXT,                   -- e.g. spaceId/repo path when scope is narrowed
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',   -- active|superseded|expired
  evidence_task_id    TEXT NOT NULL,
  evidence_artifact_id TEXT NOT NULL,
  accepted_by         TEXT NOT NULL,
  supersedes_memory_id TEXT REFERENCES memory_items(memory_id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ
);
CREATE INDEX idx_memory_items_user_scope ON memory_items(user_id, scope, status);
```

`memory_candidates` (owned by `agentos_0001_schema.sql`, shape for reference):
```sql
CREATE TABLE IF NOT EXISTS memory_candidates (
  candidate_id        TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  scope               TEXT NOT NULL,
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'candidate_created', -- candidate_created|reviewed|accepted|rejected
  evidence_task_id    TEXT NOT NULL,
  evidence_artifact_id TEXT NOT NULL,
  proposed_by         TEXT NOT NULL,
  proposed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by         TEXT,
  reviewed_at         TIMESTAMPTZ,
  review_reason       TEXT,
  expires_at          TIMESTAMPTZ              -- TTL for ephemeral wisps
);
CREATE INDEX idx_memory_candidates_user_status ON memory_candidates(user_id, status);
CREATE INDEX idx_memory_candidates_task ON memory_candidates(evidence_task_id);
```

`backend/migrations/memory_0001_relations.sql` (the ONE memory-owned migration):
```sql
CREATE TABLE IF NOT EXISTS memory_relations (
  relation_id   TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  from_memory_id TEXT NOT NULL,
  to_memory_id   TEXT NOT NULL,
  kind          TEXT NOT NULL,   -- supersedes|derived-from|contradicts|relates-to
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(from_memory_id, to_memory_id, kind)
);
CREATE INDEX idx_memory_relations_from ON memory_relations(from_memory_id);
```

Notes:
- **No Supabase RLS / `auth.uid()`** — access control is `WHERE user_id = :user_id`
  in the repository adapter, on every read and write.
- Vector data (mem0 memories, retrieval chunks) lives in a **vector backend**, NOT
  Postgres. Postgres is the store-of-record for the reviewed candidate/item lifecycle;
  the vector store is the derived semantic index (rebuildable). **Shipped default is the
  embedded Lance store** (`LANCE_DATA_DIR`, no server) with **Qdrant** as the served
  alternative when `QDRANT_URL` is set; `vector-foundation.ts` selects between them and
  `probeStore()` reports the active backend truthfully.

## 5. HTTP / MCP edges

### HTTP (mounted by the `edge` domain route table)

The **actor** (`userId`, `proposedBy`, reviewer) always comes from the resolved
`Principal` — NEVER from the request body — so a caller cannot forge identity. Reads
use `authenticate`; mutations use `authenticateMutating`. **Shipped paths:**

| method | path | body/query | gate | handler |
|---|---|---|---|---|
| POST | `/api/agent-os/memory/recall` | `{query, scope?, scopeRef?, limit?}` | authenticate (read) | recall fusion → provenance-tagged list |
| GET | `/api/agent-os/memory/candidates` | `?scope` | authenticate (read) | list the caller's wisps |
| POST | `/api/agent-os/memory/candidates` | `{title, body, scope, evidence{taskId,artifactId}}` | authenticateMutating (write, ephemeral) | propose candidate (wisp) — this IS "remember" |
| GET | `/api/agent-os/memory/candidates/:id` | — | authenticate (read) | fetch one wisp |
| POST | `/api/agent-os/memory/candidates/:id/accept` | `{supersedesMemoryId?, taskId?, runId?}` | **governance gate** + audit | promote candidate → durable item (truthful `{promoted:false, verdict}` on deny) |
| POST | `/api/agent-os/memory/candidates/:id/reject` | `{reason}` | authenticateMutating + audit | reject candidate |
| POST | `/api/agent-os/memory/items/:id/forget` | `{reason, taskId?, runId?}` | **governance gate** + audit | tombstone item (truthful `{forgotten:false, verdict}` on deny) |
| GET | `/api/agent-os/memory/relations` | `?from` | authenticate (read) | list a memory's edges |
| POST | `/api/agent-os/memory/relations` | `{fromMemoryId, toMemoryId, kind}` | authenticateMutating | add relation edge |
| DELETE | `/api/agent-os/memory/relations/:id` | — | authenticateMutating | remove an edge |
| GET | `/api/agent-os/retrieval/status` | — | authenticate (read) | is retrieval configured (embedder+store)? |
| POST | `/api/agent-os/retrieval/ingest` | `{docs[], collection?}` | authenticateMutating (write) | chunk→embed→upsert |
| POST | `/api/agent-os/retrieval/search` | `{query, topK?, collection?}` | authenticate (read) | embed→vector→rerank |

> **Reconciled:** the design's `POST /memory/remember`, `.../:id/promote`,
> `POST /memory/:id/forget`, `POST /memory/relate`, and `GET /memory/health` shipped
> respectively as `POST /memory/candidates`, `.../:id/accept`, `/memory/items/:id/forget`,
> `POST /memory/relations`, and (no dedicated health edge — `/retrieval/status` reports
> retrieval readiness; per-engine memory health rolls up via the observability
> `/health` aggregation, see §6). GET/DELETE `/memory/relations` and `GET /candidates/:id`
> also shipped beyond the original list.

`/internal/agent-os/memory/harvest` (INTERNAL_SERVICE_KEY-gated, `requireInternal`) —
worker→backend completion harvest entrypoint; body zod-validated, actor `userId` supplied
by the trusted worker; unevidenced harvest returns `{harvested:false, reason}`.

Every edge: validate inbound at the boundary, carry the resolved `Principal`, respond via
`sendSuccess`/`sendError` with `ErrorCode` (`SERVICE_UNAVAILABLE`,
`AUTHZ_PROJECT_ACCESS_DENIED`, `MISSING_REQUIRED_FIELD` — no `FORBIDDEN`).

### MCP tools (shipped)

The module exposes MCP tools as `McpToolRegistration[]` via `module.mcp()`
(`buildMemoryMcpTools` + `buildRetrievalMcpTools`), registered by the bootstrap
domain-tools bridge — NOT the older `IN_PROC_SERVERS`/`ENGINE_SERVERS` +
`buildInProcEngineRouter` sketch. Tool names use **underscores**, not dots:

- memory → `memory_recall`, `memory_remember`, `memory_promote`, `memory_relate`,
  **`memory_forget`** (5 tools).
- retrieval → `retrieval_search`, `retrieval_ingest`.

These are reachable over the now-**LIVE governed MCP HTTP edge**
`POST /api/mcp/tools/:server/:tool/call` (was 404). Every MCP call passes the interop
`authorize→risk→policy→audit` chain; writes (`memory_promote`/`memory_forget`) also
flow through the governance gate.

**Cross-tenant identity binding (SECURITY, `67eed3613`):** every handler resolves the
tenant `userId` via `resolveUserId()`, BOUND to the host-authorized `McpToolCaller` —
never the spoofable `args.userId`. A non-privileged caller may only act on its own
subject (a differing args `userId` → `403 AUTHZ_PROJECT_ACCESS_DENIED`); only an
`admin`/`internal` caller may target an arbitrary subject; an absent caller is refused
(`AUTH_REQUIRED`). `memory_promote`/`memory_forget` reconstruct a `Principal` from the
bound `userId` with NO elevated scopes, so the gate decides independently.

## 6. Interfaces (ports)

### Exposed to other domains (consumed via `shared/` DI tokens)

**Shipped shape (`MemoryComposer` in `memory-module.ts`).** Rather than the flat
method interface originally sketched, the module is a **composer exposing service
accessors** (plus lifecycle + wiring). Each accessor returns a focused, testable
service; the routes/MCP layers bind to them:

```ts
class MemoryComposer implements MemoryModule {
  readonly name = 'memory';
  recall(): RecallService;            // fused, provenance-tagged recall({query,userId,scope?,scopeRef?,limit?})
  retrieval(): RetrievalPort;         // RAG facade: ingest(docs)/search(query)/configured()
  candidates(): CandidateService;     // propose/list/get (ephemeral wisps)
  lifecycle(): MemoryLifecycle;       // accept (promote, gated) / reject
  forget(): ForgetService;            // forget/tombstone (gated)
  harvest(): HarvestService;          // completion harvest → candidate
  relations(): RelateService;         // relate/unrelate/list edges
  repository(): MemoryRepository;
  routes(): Router;                   // /api/agent-os memory + retrieval
  internalRoutes(): Router;           // /internal/agent-os/memory (harvest)
  mcp(): readonly McpToolRegistration[];
  health(): Promise<ComponentHealth>; // truthful per-engine rollup (candidates = hard dep)
  start(): Promise<void>; stop(): Promise<void>;
}
```

> **Reconciled:** the original `recallForLaunch`/`harvestOnCompletion` conductor hooks
> are served through `recall()`/`harvest()` (the conductor product flow already consumes
> mem0∪beads∪colbert recall on launch + harvest on completion — see BUILD-STATUS
> "product flow USES the engines"); the internal `POST /harvest` edge is the worker-side
> entrypoint to `harvest()`.

Consumers: `conductor` (recall on launch / harvest on completion), `agent-os`
(candidate store-of-record already owns the item/candidate shape), `interop`/`engines`
(MCP tools), `edge` (routes), and any domain doing RAG search (`RetrievalPort`).

### Consumed from other domains

- `Session` (identity) — on every call.
- `QueryExecutor`/`Repository` (persistence) — `MemoryRepository` impl.
- `GovernanceGate.decide()` + `record_audit` (governance) — every write.
- `InteropChain` (interop) — every edge + MCP call.
- `RunEvent` (`@recoder/agent-events`) — harvest input; recall emits a
  `memory.recalled` RunEvent for the audit trail.
- `AppConfig` (bootstrap) — via `MemoryConfig` slice only.
- `ToolRouter` (`@recoder/agent-mcp`) — MCP registration.

## 7. Engine / daemon dependencies

| engine | lang | transport | when | degrade |
|---|---|---|---|---|
| `backend/engines/py/mem0` | python | loopback HTTP sidecar (FastAPI) OR mem0 OSS in-lib | `MEM0_BASE_URL`/provider set (**LLM defaults to google/Gemini**) | `down` → recall drops mem0 source |
| `backend/engines/py/colbert` | python | loopback HTTP (`POST /rerank`) — **real ColBERT MaxSim** | `COLBERT_RERANK_URL` set | identity order (original ranking) |
| **Lance (embedded)** | rust napi | in-proc `lance-napi.client` (no server) | `LANCE_DATA_DIR` set — **the no-server default** | no-op store: search `[]`, upsert `false` |
| Qdrant | — | HTTP (**real liveness GET probe**) | `QDRANT_URL` set (served alternative to Lance) | no-op store: search `[]`, upsert `false` |
| beads (`bd`) | go bin | CLI (`apps/desktop/server/engines/beads`) | bd on PATH + Dolt DB reachable | `[]`/undefined, warn |
| embeddings (tensorzero/openai/BYOK) | — | HTTP via gateway | provider key present | hash/keyword fallback (`embedding-fallback.adapter`) |

All Python paths: auth-preflight before spawn, supervised by
`bootstrap/engine-supervisor`; absent torch/venv → `down`, never faked.

## 8. Reuse notes (REUSE vs NEW)

**REUSE (move behind composer, do not rewrite):**
- `backend/src/engines/mem0-client.ts` → `adapters/mem0.adapter.ts`.
- `backend/src/conductor/beads-memory.ts` (+ `beads-sql.ts`, `beads-sync.ts`) →
  `adapters/beads-memory.adapter.ts`.
- `backend/src/conductor/colbert-rerank.ts` → `adapters/colbert.adapter.ts`.
- `backend/src/agent-os/mcp/vector-store.ts` (`createEmbeddingPort`,
  `createVectorStore`) → `adapters/{embedding,qdrant}.adapter.ts` +
  `retrieval/vector-foundation.ts`.
- `backend/src/agent-os/mcp/retrieval-engine.ts` → `mcp/retrieval-engine.ts`
  (thin, keeps calling `@recoder/agent-mcp` `registerRetrievalMcpTools`).
- `backend/src/agent-os/mcp/memory-store-adapter.ts` +
  `store-engines.ts`/`vector-store.ts` MCP wiring → `mcp/memory-engine.ts` +
  `adapters/candidate-repository.adapter.ts`.
- `backend/src/conductor/bundle.ts::enrichPrompt` recall block → refactored to
  call `MemoryModule.recallForLaunch` (bundle stops importing mem0/beads/colbert).
- `completion-watcher` memory-candidate generation → calls
  `MemoryModule.harvestOnCompletion`.

**REUSE packages/* contracts (do NOT redefine):**
- `@recoder/agent-memory` — `MemoryStore`, candidate lifecycle (`remember`→`promote`),
  `vector-search`, pgvector adapter.
- `@recoder/agent-os` / `@recoder/agent-schemas` — `MemoryItem`, `MemoryCandidate`,
  scopes/statuses, `memory-candidate.schema.ts` (zod-canonical validation).
- `@recoder/retrieval` — `createRetrievalEngine`, `createColbertReranker`,
  chunk/embed/store/rerank ports (the RAG engine core).
- `@recoder/agent-mcp` — `McpToolRouter`, `registerRetrievalMcpTools`.
- `@recoder/governance` — `decide`/`record_audit` on promote/forget/relate.
- `@recoder/interop` — edge chain.
- `@recoder/agent-events` — `RunEvent` (harvest in, recall-audit out).
- `@recoder/brain` / `@recoder/rag` / `@recoder/pal` — brain/prompt enrichment
  consume `RetrievalPort`/`recallForLaunch` (composed, not owned here).
- `@recoder/logger`, `@recoder/utils`.

**NEW (net-new code):**
- The composer + one public `MemoryModule` interface (`index.ts`,
  `memory-module.ts`).
- **Recall fusion** (`recall/*`) — this is genuinely new: today mem0/beads/colbert
  are fused ad hoc inside `bundle.ts`; this domain makes fusion+dedupe+provenance
  a first-class, testable, degrade-aware service.
- `lifecycle/{memory-lifecycle,harvest,relate}.ts` — promote/forget/relate as
  gated writes; harvest as a reusable service (not inline in completion-watcher).
- `memory_relations` table + migration (new; enables `relate`).
- `retrieval/chunker.ts` if not already covered by `@recoder/retrieval`'s chunk port.
- The 8 `ports/*` interfaces (thin, mostly re-export/narrow existing shapes).

## 9. Implementation order

1. **Ports first** (`ports/*`) — define the seams; `MemoryRepository`,
   `Mem0Port`, `BeadsMemoryPort`, `RerankerPort`, `EmbeddingPort`,
   `VectorStorePort`, `RetrievalPort`, re-export `MemoryStore`.
2. **Config + types + health** (`config.ts`, `types.ts`, `health.ts`) — the
   zod slice, degrade-aware health rollup.
3. **Migrations** (`memory_items`, `memory_candidates`, `memory_relations`) +
   `adapters/candidate-repository.adapter.ts` (repository impl over persistence).
4. **Adapters** (`mem0`, `beads-memory`, `colbert`, `qdrant`, `embedding`,
   sidecar clients) — wrap the existing engines behind the ports; each fully
   degrade-safe. Unit-test each degrade path.
5. **Retrieval** (`retrieval/vector-foundation.ts`, `chunker.ts`,
   `retrieval-service.ts`) — reuse `@recoder/retrieval`; `not_configured` path.
6. **Recall fusion** (`recall/*`) — union → rank(colbert) → dedupe → provenance.
   Test source-down drop + dedupe + provenance. (Highest new-value; TDD.)
7. **Lifecycle** (`lifecycle/*`) — candidate-service, memory-lifecycle
   (promote/forget/relate gated), harvest. Test gate-deny → no write.
8. **Composer** (`memory-module.ts`, `index.ts`) — fuse everything behind
   `MemoryModule`; wire DI factory following `agent-os/service-container.ts`.
9. **Edges** (`routes/*`) — HTTP with zod + interop + gate; error envelope.
10. **MCP** (`mcp/*`) — register per wiring checklist; add to `IN_PROC_SERVERS`
    + `ENGINE_SERVERS`, call registrars in `buildInProcEngineRouter`.
11. **Conductor rewiring** — refactor `bundle.ts::enrichPrompt` and
    `completion-watcher` to call `recallForLaunch`/`harvestOnCompletion`.
12. **Integration tests** (`__tests__/*`) — remember→recall→promote→search e2e;
    harvest+recall hooks. Run `pnpm test:contracts:agent-os`,
    `pnpm test:evals:agent-os`, `pnpm check-types`.

### Verification
- `pnpm check-types`, `pnpm test` (vitest, co-located + `__tests__/`).
- `pnpm test:contracts:agent-os` (MemoryCandidate/MemoryItem contract),
  `pnpm test:evals:agent-os`.
- Python engines: `pytest` in `engines/py/{mem0,colbert}` (unchanged, vendored).
- Degrade matrix as unit tests: no Qdrant, no mem0 provider, no colbert, no bd,
  no embeddings → every path returns truthful empty/`down`, nothing faked.
