# MEMORY module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): backend/engines/py/mem0 + apps/desktop/server/engines/beads (dolt) + backend/engines/py/colbert

**Interface:** `recall (fuse+rerank) · retrieve (RAG) · remember · promote · forget · harvest · relate · health`

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../RECODER-MODULES.md §MEMORY.

**Shipped (2026-07 · `feat/enterprise-s0-p0`).** New real-bound engine MCP tools over
the in-place mem0 + colbert engines, all degrade-truthful and subject-scoped:

- **mem0 insight tools** (`backend/src/domains/engines/mcp/mem0-memory.mcp.ts`):
  - `mem0.recall` — READ: filtered recall by scope (`userId` / `agentId` / `runId`),
    an optional `created_at` window (`createdAfter` / `createdBefore` ISO 8601),
    metadata filters, and an optional semantic query. The subject is caller-bound.
  - `mem0.relations` — READ: an entity co-occurrence relations graph over stored
    memories (nodes = user/agent/run). Aggregate reads are FORCED to the caller's
    own scope so an off-edge caller cannot read another tenant's graph.
  - `mem0.stats` — READ: aggregate memory stats over an optional `created_at` span.
    Tenant-scoped by default; only an admin/internal caller may request the global
    view.

- **colbert batch + collection tools**
  (`backend/src/domains/engines/adapters/daemon/mcp/colbert-index-mcp.ts`):
  - `colbert.rerank_batch` — rerank many `{query, passages}` items at once
    (subject-free read).
  - `colbert.collections.list` — list built ColBERT indexes.
  - `colbert.collections.stats` — index stats (documents, embeddings, partitions,
    chunks, on-disk bytes) for one collection.
  - `colbert.collections.create` — BUILD a named index from passages via the real
    indexer (gated: requires an authorized caller identity before mutating).
  - `colbert.collections.drop` — drop a built index / remove its directory (gated,
    same identity posture).

  The read tools (`rerank_batch` / `list` / `stats`) carry no subject; the mutating
  `create` / `drop` are attributable to an authorized principal, keeping the
  cross-tenant class closed. With the engine absent, tools return a truthful
  `not_configured` rather than fake a result.
