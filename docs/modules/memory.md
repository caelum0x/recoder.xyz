# MEMORY module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): backend/engines/py/mem0 + apps/desktop/server/engines/beads (dolt) + backend/engines/py/colbert

**Interface:** `recall (fuse+rerank) · retrieve (RAG) · remember · promote · forget · harvest · relate · issueGraph (the beads facet) · health`

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../RECODER-MODULES.md §MEMORY.

**Shipped (2026-07 · `feat/enterprise-s0-p0` · beads refactor).** The MEMORY domain now
owns the cohesive beads module facet — **`memory.issueGraph()`**
(`backend/src/domains/memory/issue-graph/issue-graph.service.ts`, port
`memory/ports/issue-graph.port.ts`) — composed over the ONE raw `bd` transport the
engines domain owns (`engines/adapters/cli/beads.adapter.ts`, the single spawner/argv
owner in `backend/src`; the old `memory/adapters/beads-memory.ts` execFileSync stack is
deleted):

- **Work reads:** `ready · show(--long lineage) · search · blocked · depTree · depList ·
  stats · stale` — reads degrade to `[]`/`null` with a logged truthful reason.
- **Work writes:** `create · update · claim · close · note` — every write threads an
  `actor` onto bd's global `--actor` audit flag (conductor stamps
  `conductor:<workspaceId>`, the maintenance loop `memory-maintenance`); writes degrade
  to `false`/`null` with a warn. Nothing throws across the facet.
- **Memory verbs:** `remember` (ephemeral wisp, `-l memory[,memory-scope:<s>]`) ·
  `recallMemories` · `promote` — promote is MODULE-INTERNAL: only the governed
  memory-lifecycle accept path calls it.
- **Durability:** `vcStatus · flush` (`bd vc commit`, fired by the maintenance sweep) ·
  `gc` (`bd gc`, config-gated via `memory.gcEverySweeps`, 0=off default — decays
  closed/expired wisps so the candidate loop does not leak forever).
- **Consumers:** conductor issue tracking (`conductor/adapters/issue-graph.adapter.ts`
  via the `IssueGraphWriter` slice), agent-os squad autopilot + board
  (`agent-os/ports/squad-issue.port.ts`, late-bound `attachIssueGraph`; board surfaces
  the `bd stale` stalled-work read), and the in-domain recall/candidate/lifecycle/
  maintenance flows.
- **Removed MCP tool:** `beads.memory_promote` is GONE from the agent-callable
  `recoder.beads` server (and its toolId from `packages/agent-mcp`); promotion happens
  only on the governance-gated memory-lifecycle path — never as an agent bridge tool.

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

**Agent-facing MCP tools (governed).** The public `recoder_*` ids agents actually call
into this domain — bridged by `mcp/recoder-capability-tools.cjs` through the gated MCP
host (`authorize → risk → execute → audit`) — span all three engines:

- **mem0 recall/candidate:** `recoder_memory_search` → `recoder.memory`/`memory.search`;
  `recoder_remember` → `recoder.memory`/`memory.candidate.create` (an evidence-bound
  candidate, reviewed before it becomes durable — never a blind write).
- **colbert RAG:** `recoder_retrieval_search` → `recoder.retrieval`/`retrieval.search`
  (embed + ColBERT-rerank) and `recoder_retrieval_ingest` →
  `recoder.retrieval`/`retrieval.ingest`.
- **beads issue graph:** `recoder_issues_ready` → `beads.ready`, `recoder_issue_create`
  → `beads.create`, `recoder_issue_claim` → `beads.claim`, `recoder_issue_note` →
  `beads.note`, `recoder_issue_close` → `beads.close` (all on `recoder.beads`).

Each degrades to a truthful "not available" / "not configured" string when the engine or
interop key is absent. There is deliberately **no** public `recoder_*` promote tool —
promotion stays on the governed memory-lifecycle path (mirrors the removed
`beads.memory_promote`).
