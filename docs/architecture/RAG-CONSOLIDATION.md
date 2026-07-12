# rag → retrieval consolidation

> **Status: strangler seam landed (2026-07-13). No deletion.** Both RAG stacks run
> side by side; the new engine is reachable behind adapters/flags, the old one stays
> the default. This is the retirement runway for `@recoder/rag`, not its removal.

## The overlap

Two packages solve the same "RAG" problem:

| | `@recoder/rag` (OLD) | `@recoder/retrieval` (NEW · RECODER-ENGINES E2) |
|---|---|---|
| Store | Postgres / pgvector | Qdrant (REST, injected) |
| Embeddings | `ai-sdk` embedders (in-package) | injected `EmbeddingPort` (BYOK, shared foundation) |
| Rerank | — | ColBERT (`py/colbert`, injected `RerankerPort`, identity fallback) |
| Ports | concrete `VectorStore` + `QueryService` | every port injected; degrade-safe by construction |
| MCP skin | — | `recoder.retrieval` (`retrieval.ingest` / `retrieval.search`) |

Two consumers depend on the OLD stack's shape:

1. **`@recoder/brain`** — assembles a `BrainContext` and reads passage-level hits
   through its `VectorStorePort` (`packages/brain/src/ports/vector-store.port.ts`),
   originally wired to `@recoder/rag`'s `QueryService`.
2. **`docker-backend/src/routes/retrieval.routes.ts`** — `POST /api/retrieval/search`,
   historically a direct ColBERT-over-HTTP + `LANCE_DB_PATH` placeholder path.

## The adapters (what landed)

### 1. Brain vector-store adapter → new engine

`packages/brain/src/adapters/retrieval-vector-store.adapter.ts`
(`createRetrievalVectorStore`) implements brain's `VectorStorePort` but is backed
by `@recoder/retrieval`'s engine. It maps each `RetrievalPassage` → `BrainPassage`
(`score`→`similarity` clamped to `[0,1]`, `docId`→`documentKey`, `source`→`title`,
`payload`→`metadata`; optional fields only set when the engine provides them).

**Direction / no sideways coupling.** The adapter lives in **brain** and does
**not** import `@recoder/retrieval`. It re-declares the minimal structural slice it
consumes (`RetrievalSearchPort` — the `search(query, topK?)` method plus the
`SearchResult` / `RetrievalPassage` shapes), which the real engine satisfies
structurally. So **brain gains no new workspace dependency** and there is no
engine→engine import in either direction — identical to how `mem0-memory` and
`context7-docs` take an injected transport instead of importing an SDK. The
**composition root** (docker-backend, which already depends on both engines) injects
the concrete engine:

```ts
import { createRetrievalEngine } from "@recoder/retrieval";
import { createRetrievalVectorStore, createBrain } from "@recoder/brain";

const vectorStore = createRetrievalVectorStore({
  engine: createRetrievalEngine({ embedder, store, reranker }),
});
const brain = createBrain({ /* ...sources... */, vectorStore });
```

**Degrade-safe.** When the engine is `not_configured` (no embedder / no `QDRANT_URL`)
the adapter returns `[]`; if the injected engine ever throws it still returns `[]`.
It never throws and never fabricates a passage — absence costs richness, not
correctness (matching the `VectorStorePort` contract).

### 2. `retrieval.routes.ts` engine seam (opt-in, default OFF)

`RetrievalRouterDeps` gained an optional `retrievalEngine?: RetrievalSearchEngine`
(the same locally-declared structural `search` slice — no import/coupling). When the
composition root injects it **and** `RECODER_RETRIEVAL_ENGINE=qdrant` is set,
`POST /api/retrieval/search` serves results from the new engine; a `not_configured`
status surfaces as a truthful `503`, a thrown engine as a `503`, never a fake hit.
**Absent the flag or the injected engine, the existing ColBERT/Lance path runs
unchanged** — nothing breaks. `server.ts` currently mounts the router without the
engine, so production behavior is unchanged until the flag is deliberately turned on.

## Retirement path — what must be proven before `@recoder/rag` is removed

`@recoder/rag` is **not** removed here. Before it can be, prove all of:

1. **Brain parity.** A host wires `createRetrievalVectorStore(...)` into
   `createBrain(...)` in the real composition root and brain's passage source returns
   equivalent (or better) results than the `@recoder/rag` `QueryService` path.
2. **Route cutover.** `retrieval.routes.ts` is wired with the injected engine and
   run with `RECODER_RETRIEVAL_ENGINE=qdrant` in a real environment; the legacy
   ColBERT/Lance placeholder branch is confirmed dead.
3. **Ingest coverage.** Every document currently ingested through `@recoder/rag`
   has an equivalent `retrieval.ingest` path into Qdrant (or a backfill/migration).
4. **No remaining importers.** `grep -rn "@recoder/rag"` across the monorepo returns
   only historical docs/tests — no runtime consumer.
5. **Degrade + governance intact.** `retrieval.search` still returns truthful
   `not_configured` with no embedder / no `QDRANT_URL`, and all agent-facing calls
   still pass `authorize → risk → execute → audit`.

Only when 1–5 hold should `@recoder/rag` be deleted (and its catalog deps pruned).

## Verification (this change)

- Brain adapter (fake engine, maps + degrades):
  `pnpm -C packages/brain exec node --test --import tsx 'src/adapters/retrieval-vector-store.adapter.test.ts'` → 7 pass.
- Route seam (gated on/off, not_configured, throws, validation):
  `pnpm -C docker-backend exec vitest run src/routes/retrieval.routes.test.ts` → 14 pass.
