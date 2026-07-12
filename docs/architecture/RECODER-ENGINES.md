# Recoder — The Massive Polyglot Agent OS Backend (the plan)

> **Status: PLAN (locked 2026-07-12).** The desktop app (`apps/desktop`) embeds a **full Agent
> Operating System backend** — not a CLI-in-tmux wrapper. `docker-backend` is the conductor that
> supervises a **fleet of polyglot engines** (Rust daemons · Go services · Python ML services ·
> TS orchestration + agent runtimes), each exposed to any coding agent through the governed MCP/A2A
> gate. This doc harnesses **all** of `c/ crates/ go/ py/ ts/ packages/` — nothing capable is left
> parked. Execute phase-by-phase; update as phases land.

---

## 0. The thesis

> Recoder is an **Agent Operating System**. Every language does what it is best at, and
> `docker-backend` orchestrates them as one massive, governed control plane behind the desktop app.

- **Rust (`crates/`)** — performance + safety-critical kernels: tamper-evident audit, autonomous
  agent engine, LLM gateway.
- **Go (`go/`)** — networking, service mesh, coordination, issue graph.
- **Python (`py/`)** — the ML muscle: retrieval reranking, long-term memory, autonomous browser,
  work-signal detection.
- **TypeScript (`packages/` + `ts/`)** — the orchestration spine, code intelligence, and the agent
  runtimes themselves.
- **C (`c/`)** — the tmux substrate binary.

Agents (Claude Code, Codex, opencode, pi, recoder-code) run **on** this backend and **call into** it
through MCP tools — every call passing `authorize → risk → execute → audit`.

```
apps/desktop (Electron)
 └─ docker-backend  ── THE CONDUCTOR: supervises the fleet, mounts engines, exposes
     │                 /api/{conductor,agent-os,mcp,a2a,connectors,network}
     ├─ Rust daemons     governance(UDS) · openfang(HTTP :4200) · tensorzero-gateway(HTTP)
     ├─ Go services      recoder-xds(Envoy xDS) · ziti(overlay) · beads(bd) · multica(dispatch)
     ├─ Python services  colbert(rerank) · mem0(memory) · browser-use(web) · ops-recorder(signals)
     ├─ TS in-process    agent-os · runtime · brain · recodergit · coordination · pal · workflows · interop/mcp
     └─ spawned agents   claude-code · codex · opencode · pi · recoder-code   (tmux + git worktrees)
```

---

## 1. Polyglot root map — everything is used

| Root | Dir | Role in the backend | Service type |
|---|---|---|---|
| **C** | `c/tmux` | The `tmux_worktree` substrate binary the conductor drives | pinned binary |
| **Rust** | `crates/recoder-governance` | Merkle-chained tamper-evident **audit + policy kernel** | UDS daemon |
| | `crates/openfang` | **Autonomous agent engine** (Rust Agent OS) — a governed execution surface | HTTP subprocess :4200 / NAPI |
| | `crates/tensorzero` | **LLM Gateway** — provider routing, caching, observability, experiments (**adopt**) | HTTP daemon |
| | `crates/claw-code-parity` | Harness-parity reference | → `vendor/` |
| **Go** | `go/recoder-xds` | **Envoy xDS control plane** — dynamic default-deny service mesh | service |
| | `go/ziti` | **OpenZiti zero-trust overlay** — cross-machine team/enterprise traffic | service |
| | `go/beads` | **Issue graph** / `bd` task tracker | binary |
| | `go/multica` | **Coordination** claim/dispatch for parallel agents | service (or fused) |
| **Python** | `py/colbert` | **Retrieval reranker** (late-interaction) | HTTP service |
| | `py/mem0` | **Long-term memory** engine | HTTP service |
| | `py/browser-use` | **Autonomous browser** agent (LLM-driven web) | subprocess/service |
| | `py/ops-recorder` | **Work-signal** detection (stuck GitHub/Linear work) | FastAPI service |
| | `py/pal-mcp-server` | External multi-model MCP (zen) | → `vendor/` (supervised) |
| **TS engines** | `ts/opencode` | `@recoder/opencode` CLI (agent runtime) | spawned CLI |
| | `ts/open-agents` | Source for the in-process driver | in-process |
| | `ts/recodergit` | recodergit code-graph CLI | spawned CLI |
| | `ts/dmux` | Operator console over the tmux fleet | optional TUI |
| | `ts/extracted-from-openclaw` | `@recoder/connectors` — chat↔control bridge | in-process |
| **TS spine** | `packages/*` | The whole orchestration spine (see §3) | in-process |

**Deleted** (redundant / dropped): `ts/oh-my-codex`, `ts/oh-my-openagent`, `crates/lance` (→ Qdrant),
Polar (`py/recoder-billing` + `ts/polar`), the Giselle cluster, legacy v1 (`packages/{ui,performance,plugins,cli,analytics,security,shared}`).

---

## 2. The engine catalog (16 engines — the massive surface)

Each engine = an owned home + its polyglot pieces + a governed MCP/API skin. Depth lives in the
engine; MCP is only the skin.

### Intelligence & knowledge
1. **Code Intelligence** — `packages/recodergit` + `ts/recodergit` + GitHub API + Qdrant semantic.
   Repo index, dep/impact/ownership graph, and hybrid search (keyword + semantic + GitHub). *A real
   code-search platform.* Skin: MCP `git_nexus`,`repo`.
2. **Retrieval / RAG** — NEW `packages/retrieval` + `packages/document-preprocessor` + Qdrant +
   `py/colbert`. Ingest → chunk → embed → store → **colbert rerank** → retrieve. Skin: MCP `retrieval`.
3. **Memory** — `packages/agent-memory` + `packages/brain` + `py/mem0`. Reviewed durable memory +
   long-term recall + working context assembly. Skin: MCP `memory`.
4. **Code Graph Context** — `packages/brain` context-pack + recodergit. Assembles the BrainContext
   an agent gets per task. In-process.

### Execution & runtimes
5. **Runtime Fleet** — `packages/runtime` + `agent-runtimes` + `ts/opencode` + `ts/open-agents` +
   `packages/{pi-*,recoder-code}`. Drives every coding CLI headless. API: `/api/conductor`.
6. **Substrate** — `packages/substrate` + `c/tmux` + Daytona/E2B (`agent-sandbox`). Worktree+tmux
   local; remote sandboxes for cloud/teams.
7. **Autonomous Engine** — `crates/openfang`. A Rust autonomous agent OS as a governed, replaceable
   execution surface (HTTP :4200 / NAPI). Degrade-safe: absent → pure-TS OSS dispatch.
8. **OSS Adapters** — `packages/agent-oss` (langgraph/crewai/autogen/e2b/daytona/…) as governed,
   replaceable surfaces behind the substrate.
9. **Sandbox / Browser Automation** — `py/browser-use` + `packages/recoder-browser-tools` +
   `browser-verification` + puppeteer. Autonomous web + preview verification. Skin: MCP `browser`,`preview`.

### Governance, planning, coordination
10. **Governance / Audit** — `crates/recoder-governance` (Rust Merkle + UDS) + `packages/governance` +
    `agent-policy`. The gate every capability passes. Skin: MCP `approvals`,`artifacts`.
11. **Planning (PAL)** — `packages/pal`. Decides runtime/substrate/tool-grants/risk/approval per task —
    the brain of the run loop. In-process (`conductor-planner`).
12. **Workflow** — `packages/agent-workflows` + `agent-hooks` + `apps/agent-worker`. verify→browser-check
    →memory→deploy→PR graph + PostToolUse hooks + outbox drain.
13. **Coordination** — `packages/coordination` + `go/multica`. Work-locks, conflict detection, handoff,
    A2A bus for N parallel agents. API: `/api/a2a`.
14. **Issue Graph** — `go/beads` + `packages/beads-adapter`. Ready-work, TaskSpec↔bd sync. Skin: MCP `beads`.

### Platform services
15. **LLM Gateway (BYOK)** — **`crates/tensorzero`** + `packages/pi-ai` + `recoder-cli-router`.
    Multi-provider routing, caching, observability, experiments. Every model call (embeddings included)
    routes here. API: `/api/gateway`.
16. **Networking / Zero-Trust** — `packages/network` + `go/recoder-xds` (Envoy xDS) + `go/ziti`.
    Default-deny mesh + cross-machine overlay (cloud/teams). Plus **Connectors** (`ts/extracted-from-openclaw`)
    for chat channels, and **Work-signals** (`py/ops-recorder`) feeding coordination.

---

## 3. Service topology & supervision

`docker-backend` becomes a **process supervisor** for the polyglot fleet — each service is spawned
loopback-only, health-checked, and **degrade-safe** (absent → truthful fallback, never a crash):

| Service | Lang | Transport | Supervisor seam | Fallback when absent |
|---|---|---|---|---|
| governance daemon | Rust | UDS | `packages/governance` facade | in-proc TS policy (fail-closed) |
| openfang engine | Rust | HTTP :4200 / NAPI | `conductor/openfang-daemon.ts` | pure-TS OSS dispatch |
| tensorzero gateway | Rust | HTTP | NEW `gateway/tensorzero-daemon.ts` | pi-ai direct BYOK |
| recoder-xds | Go | gRPC/ADS | `network/*` | static Envoy bootstrap |
| ziti | Go | overlay | `agent-oss` openziti-adapter | loopback only |
| beads | Go | CLI | `brain/beads-tasks.ts` | no issue graph |
| multica | Go | HTTP | `coordination` | in-proc locks only |
| colbert | Py | HTTP `COLBERT_RERANK_URL` | `retrieval/rerank.ts` | identity order |
| mem0 | Py | HTTP `MEM0_BASE_URL` | `agent-memory` | pgvector store |
| browser-use | Py | subprocess | `browser` engine | puppeteer path |
| ops-recorder | Py | HTTP | `coordination/work-signals` | no signals |

A single **`docker-backend/src/fleet/`** supervisor module owns spawn/health/restart/degrade for all
of the above (generalizing the existing `openfang-daemon.ts` + `backend-supervisor` patterns).

---

## 4. Target folder/file structure

```
docker-backend/src/
  fleet/                         # NEW — polyglot service supervisor (spawn/health/degrade)
    supervisor.ts  ports.ts  rust-daemons.ts  go-services.ts  py-services.ts
  gateway/                       # NEW — LLM gateway skin over crates/tensorzero
    tensorzero-daemon.ts  gateway.routes.ts
  agent-os/mcp/
    vector-store.ts              # NEW — Qdrant REST + BYOK embed adapter (E1+E2 share)
    retrieval-engine.ts          # NEW — thin binding → packages/retrieval
    repo-engine.ts               # REWRITE — delegate to recodergit + semantic + GitHub
    ...(memory/browser/preview/approvals/artifacts/beads/logs/github/git_nexus)
  conductor/
    conductor-planner.ts         # REWRITE — decisions via packages/pal
    openfang-daemon.ts  fleet integration
    substrate*.ts tmux-orchestrator.ts  (E5/E6)

packages/
  retrieval/                     # NEW engine (see below)
  recodergit/src/semantic-index.ts   # NEW — semantic layer for E1
  # engines: agent-memory brain governance agent-policy runtime agent-runtimes substrate
  #          pal agent-workflows agent-hooks coordination beads-adapter recoder-browser-tools
  #          browser-verification network document-preprocessor agent-oss
  # spine:   agent-os agent-mcp interop a2a-sdk agent-events agent-instructions oss-registry agent-schemas
  # gateway: pi-ai recoder-cli-router
  # CLIs:    pi-agent-core pi-coding-agent pi-tui recoder-code/*
  # dist:    distribution auth vault   (Polar removed)

packages/retrieval/src/          # index.ts chunk.ts embed.ts store.ts rerank.ts retrieval-engine.ts *.test.ts
packages/agent-mcp/src/servers/retrieval-server.ts   # NEW MCP server

vendor/                          # NEW — relocated provenance/reference
  crates/{tensorzero-upstream?,claw-code-parity}  go/multica  py/{mem0,pal-mcp-server}  docker-backend-opencode
```

> NOTE on tensorzero: adopt it as the gateway (crate stays, wired), *not* vendored — it becomes E15.

---

## 5. Deletions (small, confirmed) — Phase 0
`ts/oh-my-codex` · `ts/oh-my-openagent` (+ fix `repo-engine-locator`) · `crates/lance` (→ Qdrant) ·
Polar (`py/recoder-billing` + `ts/polar`, degrade `distribution`, drop `billing` MCP) · Giselle
cluster · legacy v1 (`packages/{ui,performance,plugins,cli,analytics,security,shared}`).
Relocate → `vendor/`: `crates/claw-code-parity` · `go/multica`(provenance copy) · `py/{mem0,pal-mcp-server}` ·
`docker-backend/vendor/opencode`.

---

## 6. Phased roadmap (massive, but ordered so nothing breaks)

**Phase 0 — Clean** (frees the ~100%-full disk, shrinks the surface). Deletes/relocations above,
by hand, sequentially, verified between each; regenerate lockfiles after deletes.

**Phase 1 — Fleet + Gateway** (the backbone that makes it "massive/polyglot"):
`docker-backend/src/fleet/` supervisor + `crates/tensorzero` gateway daemon + the vector foundation.

**Phase 2 — Intelligence engines (parallel):** E1 Code Intelligence (recodergit+GitHub+semantic) ·
E2 Retrieval (new `packages/retrieval` + colbert) · E3 Memory (mem0 folded in).

**Phase 3 — Execution breadth:** E7 openfang + E8 OSS adapters as governed surfaces · E9 browser-use ·
E6 Daytona/E2B remote substrate.

**Phase 4 — Orchestration brain:** E11 PAL → run loop · E12 Workflow+hooks · E13 multica coordination ·
E14 beads-adapter.

**Phase 5 — Platform:** E16 networking (recoder-xds + ziti) · Connectors · ops-recorder work-signals.

**Phase 6 — Docs:** rewrite `DIRECTORY-MAP.md` + `RECODER-CAPABILITIES.md` to this reality.

Each phase = one focused workflow (parallel agents on disjoint files) integrated + verified by the
orchestrator. Deletions are hand-done. Every engine is **degrade-safe** — the fleet can be missing any
service and the desktop still runs.

---

## 8. Complete directory ledger — every dir gets a role (full usage)

> All 86 `packages/` + `c/ crates/ go/ py/ ts/` roots, each assigned. **Nothing parked.** Legacy
> dirs are **revived into real roles**, not dropped (except the confirmed delete/Giselle set).
> `wire` = build/connect it; `core` = already load-bearing; `revive` = repurpose legacy into a new
> role; `keep` = used as-is; `del` = delete; `vendor` = relocate as reference.

### S1 · State spine
`agent-os` (canonical state · core) · `agent-schemas` (Zod boundary guards · wire) · `agent-events`
(CloudEvents+outbox · core) · `oss-registry` (component registry · core) · `ecosystem-config`
(app/URL registry · keep) · `tsconfig` (shared configs · keep) · `utils` (shared leaf · keep).

### S2 · Interop / MCP / A2A
`interop` (hostile gate · core) · `agent-mcp` (MCP host + all servers · core) · `a2a-sdk` (A2A SDK ·
core) · `a2a-js` (low-level A2A JS, backend-used · keep) · `recoder-a2a` (publishable npx MCP · keep) ·
`agent-instructions` (instruction compiler · core).

### S3 · Governance & security
`governance` (kernel · core) · `agent-policy` (policy · core) · `vault` (secret vault · keep) ·
`crates/recoder-governance` (Rust Merkle audit daemon · core) · **`security`** (→ **revive** as the
**Security Scanning engine**: secret-scan + SAST over agent output/diffs, folded behind governance).

### S4 · Planning · coordination · workflow
`pal` (planning selectors → run loop · wire) · `coordination` (work-locks+A2A · core) ·
`agent-workflows` (pipeline graph · wire) · `agent-hooks` (PostToolUse hooks · wire) ·
`beads-adapter` (bd↔TaskSpec · wire) · `action-registry` (owned leaf · keep) · `data-store-registry`
(owned leaf · keep) · `go/beads` (bd tracker · keep) · `go/multica` (dispatch — fuse into coordination · keep).

### S5 · Runtime · substrate · execution
`runtime` (RuntimeDriver · core) · `agent-runtimes` (contract · core) · `substrate` (worktree/tmux/
daytona · core) · `agent-sandbox` (sandbox abstraction · keep) · `sandbox-daytona` +
`daytona-api-client` + `daytona-toolbox-api-client` (remote substrate · keep) · `agent-oss` (OSS
adapters langgraph/crewai/e2b · wire) · `c/tmux` (substrate binary · core) · `crates/openfang`
(autonomous engine surface · wire) · `ts/opencode` (opencode CLI · keep) · `ts/open-agents`
(in-process driver source · keep).

### S6 · Agent brains (shipping CLIs)
`pi-agent-core` `pi-ai` `pi-coding-agent` `pi-tui` (the pi engine · core) · `recoder-code/*`
(recoder-code CLI · core). Plus **`cli`** (→ **revive** as the `recoder` umbrella CLI entrypoint that
re-exports recoder-code's conductor commands — or fold if not worth the 306-error cleanup).

### S7 · Code intelligence
`recodergit` (code-graph engine · core, + new `semantic-index.ts`) · `ts/recodergit` (CLI · keep).

### S8 · Memory · context · retrieval
`brain` (BrainContext · core) · `agent-memory` (memory store · core) · `mem0` (TS mem0 · keep) ·
`continuum` (activity engine, brain-imported · keep) · `context7-sdk` (docs API for brain · keep) ·
`document-preprocessor` (RAG ingestion · wire) · `rag` (RAG + colbert seam · wire) ·
**NEW `retrieval`** (the RAG engine · wire) · `py/colbert` (reranker · keep-wired) · `py/mem0`
(deployable memory server · keep-wired).

### S9 · Browser & web
`recoder-browser-tools` (Playwright surface · wire) · `browser-verification` (check contract · wire) ·
`py/browser-use` (autonomous web agent · keep-wired) · **`web-search`** (→ **revive** as a **Web Search
capability**: MCP `web_search` for agents).

### S10 · LLM Gateway (BYOK)
**`crates/tensorzero`** (adopt as the gateway: routing/cache/observability · wire) · `pi-ai`
(multi-provider client · core) · `recoder-cli-router` (model router · keep) · `roo-code-types`
(router types · keep).

### S11 · Networking / zero-trust (cloud/teams)
`network` (Envoy config + ext_authz · core) · `go/recoder-xds` (Envoy xDS control plane · keep) ·
`go/ziti` (zero-trust overlay · keep).

### S12 · Distribution / auth
`distribution` (device-flow + publishers + entitlements · core, **Polar removed**) · `auth` (Better
Auth · keep). **`performance`** (→ **revive** as the backend **cache/perf layer** for `docker-backend`).

### S13 · Streaming / observability / extensions
`stream` (task-stream protocol, backend-consumed · keep) · `agent-observability` (run evidence/health
· wire into fleet monitoring) · **`analytics`** (→ **revive** as the **backend telemetry engine**: run
metrics, agent perf, usage) · **`plugins`** (→ **revive** as the **Extension Marketplace** over
`agent-mcp` + `oss-registry`: install MCP servers/tools/skills).

### S14 · Connectors
`ts/extracted-from-openclaw` (`@recoder/connectors` chat↔control · core) · `ts/dmux` (operator console · keep).

### S15 · Surfaces (desktop + terminals)
`apps/desktop` cockpit (core) · `ui-agent-os` (cockpit view-model · core) · `conductor-ui` (typed
conductor client · wire → cockpit) · `design-tokens` (tokens · wire → cockpit) · `herd` (`@recoder/herd`
terminal herd view · keep) · **`ui`** (→ **revive** as the shared cockpit **UI component library**) ·
`shared` (→ **fold** useful bits into `shared/`).

### S16 · Work signals
`py/ops-recorder` (stuck-work detection → coordination · keep-wired).

### DELETE (confirmed)
`ts/oh-my-codex` · `ts/oh-my-openagent` · `ts/polar` · `crates/lance` · `py/recoder-billing` (Polar) ·
Giselle cluster: `giselle protocol react nextjs http logger langfuse language-model
language-model-registry node-registry github-tool storage supabase-driver text-editor
text-editor-utils trigger-registry workspace-utils web web-ai-assistant sdk pseudo-tiktoken`.

### VENDOR (provenance/reference → `vendor/`)
`crates/claw-code-parity` · `crates/tensorzero`(upstream copy if kept separate) · `py/pal-mcp-server` ·
`docker-backend/vendor/opencode`.

> **Coverage check:** every one of the 86 `packages/` + all `c/ crates/ go/ py/ ts/` roots appears
> above exactly once. The delete set is only the Giselle second-lineage + the 5 you named; everything
> else is **used** — including reviving `analytics/performance/plugins/security/ui/web-search/cli`
> into real backend roles.

---

## 7. Invariants
- Every engine + fleet service is **degrade-safe**: absent daemon/service → truthful fallback, never a
  crash or a fake result. The desktop must run with **zero** external services present.
- All model calls (incl. embeddings) route the **LLM Gateway** (tensorzero/pi-ai, BYOK).
- Vectors = **pgvector/Qdrant** only.
- Every capability call passes the **governance gate**; audit seals into the Rust Merkle chain.
- `recoder.xyz` stays the auth source of truth; `distribution` degrades without Polar.
- MCP is a skin — depth lives in the owned engine.
