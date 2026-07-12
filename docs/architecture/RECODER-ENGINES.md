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

## 9. The run loop — how the engines compose (task lifecycle)

A single task threads through the engines; **every step emits `RunEvent`s** (the audit + UI stream).
This is the spine that makes the 16 engines one coherent backend, not a bag of tools.

```
 human intent
   │  (goal · scope · constraints · verification · approvals)
   ▼
1 COMPILE   agent-os        → TaskSpec (canonical)              [S1]
2 PLAN      pal             → runtime · substrate · tool-grants · risk · approval   [S4·E11]
3 PROVISION substrate       → git worktree + tmux session (or Daytona sandbox)      [S5]
4 INSTRUCT  agent-instructions → per-runtime instruction bundle (+ .mcp.json inject)[S2]
5 RUN       runtime         → spawn agent CLI (claude/codex/opencode/pi/recoder-code)[S5·S6]
             │  run-tailer streams RunEvents (deduped delta)
             ▼
6 ACT       agent calls MCP engines ── every call ⇒ interop gate:
             authorize(actor,task) → risk(tool) → policy → execute(engine port) → AUDIT(Merkle)
             │  code-intel · retrieval · memory · browser · gateway · beads · repo …    [E1–E16]
7 COORDINATE coordination   → work-locks / conflict / A2A handoff across N parallel agents [S4·E13]
8 VERIFY    agent-workflows → verify → browser-check → memory   ; agent-hooks capture artifacts/secret-scan [S4·E12]
9 GATE      governance      → risky writes / delivery = deny-biased, needs_approval, Merkle-sealed [S3·E10]
10 DELIVER  review-publish  → PR / merge (approval-gated)        [S5]
11 LEARN    agent-memory    → reviewed memory candidate → durable memory (the compounding moat) [S8·E3]
```

The desktop shows steps 5–11 as the conversation + review; the audit trail is the same `RunEvent`
stream sealed into the Rust Merkle chain.

## 10. The mount contract — why a massive surface stays decoupled

The only way 16 engines + a polyglot fleet don't collapse into spaghetti: **engines never import each
other's concretes.** They depend on **`agent-os` ports** (hexagonal architecture).

- **Port** — a typed interface in `agent-os` (e.g. `RuntimePort`, `MemoryStore`, `GitNexusPort`,
  `VectorStorePort`, `LlmGatewayPort`, `AuditPort`).
- **Engine** — a package that *implements* a port with real depth.
- **`docker-backend/src/agent-os/service-container.ts`** — the **composition root**: injects the
  concrete engine into the port at boot. Swap an engine = swap one injection.
- **MCP server** — a thin adapter that calls a port **behind the interop gate**. It owns no logic.

> Rule: `docker-backend` depends on ports; engines depend on `agent-os`; nothing depends sideways.
> This is what lets us wire/replace/degrade any engine (openfang↔TS, Qdrant↔pgvector,
> tensorzero↔pi-ai) without touching the rest.

## 11. The fleet supervisor — running the polyglot services

`docker-backend/src/fleet/` generalizes today's `openfang-daemon.ts` + `backend-supervisor` into one
declarative supervisor for every non-TS service. A **service manifest** entry:

```ts
{ id, lang, resolveBinary(), spawn(env, port), health(url), degradeTo, loopbackOnly: true }
```

Lifecycle per service: **resolve prebuilt binary → spawn loopback → health-poll → mark
available|degraded → restart w/ backoff → truthful status in `/health/full`.** Invariants:

- **Never build** Rust/Go/Py in-process (disk/ENOSPC). Consume prebuilt binaries; absent binary ⇒
  the engine's TS fallback runs. The desktop must boot with **zero external services present.**
- **Loopback-only** by default (`127.0.0.1`); cross-machine reach is opt-in via `go/ziti` + `recoder-xds`.
- **Auth**: pass only the configured key (e.g. `OPENFANG_API_KEY`) + listen addr; every tool call still
  routes the governance gate, never raw subprocess IO.

## 12. Governance spine — why "massive" is still safe

A huge capability surface is only safe because **every call is gated + sealed**. This is the moat.

```
interop host  (packages/interop)
  authorize(actor, task)      → identity + task ownership + signed-envelope validity
  risk(toolName)              → low | medium | high  (packages/agent-policy, agent-mcp policy)
  policy(risk, actor, target) → allow | needs_approval | deny   (deny-biased; unknown ⇒ deny)
  execute(enginePort, args)   → the real engine
  audit(call, result)         → SHA-256 Merkle seal (crates/recoder-governance, UDS daemon)
```

- **Deny-biased**: unknown tool/actor ⇒ deny; risky writes (branch push, PR, deploy, secret, delete)
  ⇒ needs_approval. Solo desktop: the human's click **is** the approval; teams/cloud: real gate.
- **Fail posture**: STRICT (cloud) fails **closed** if the governance daemon is down; solo desktop
  degrades to loopback with the audit still sealed by the TS facade.
- **Tamper-evident**: the audit chain is append-only + hash-linked; `verifyGovernanceAudit` proves it.

## 13. Canonical data model — one store of record

`agent-os` owns all durable state; **engines are replaceable adapters that never own it** (AGENTS.md):

`Space` · `TaskSpec` · `TaskRun` · `Workspace` · `RunEvent` · `Approval` · `Artifact` ·
`MemoryItem`/`MemoryCandidate` · `InstructionBundle` · `WorkflowDef` · `WorkSignal`.

openfang, Daytona, langgraph, etc. **emit `RunEvent`s back** into this store — they run work, they
don't hold truth. This is what makes runtimes swappable and the audit complete.

## 14. Two deployment topologies — same engines, different fleet

| | **Desktop (solo)** | **Teams / Cloud** |
|---|---|---|
| Fleet | loopback, minimal, degrade-safe | full: xDS mesh + ziti overlay + all services |
| Governance | solo mode (click = approval), fail-open-loopback | real approval gate, fail-closed STRICT |
| Networking | none needed | `go/recoder-xds` (Envoy) + `go/ziti` (zero-trust) |
| Tenancy | `LOCAL_TENANT` | multi-tenant `TenantContext` |
| Store | embedded (PM pgvector / json) | Postgres + NATS outbox |

**Same engine code**; only the fleet manifest + governance posture + store binding differ. The desktop
is the strict subset — proving every engine is degrade-safe.

## 15. Extension & evolution model (how it grows)

- **Add an engine** = new package implementing an `agent-os` port + (optional) fleet manifest entry +
  MCP server adapter + a degrade-safe fallback. Zero changes to existing engines (composition root only).
- **Third-party extensions** = the revived `plugins` marketplace installs MCP servers / skills, vetted
  by `oss-registry` (health/license/ownership), run behind the gate.
- **Strangler migration**: wire a new engine behind a flag with the old path as fallback; cut over when
  proven by tests + live evidence. Never a big-bang swap.
- **Contract stability**: `agent-os` + `agent-schemas` are the frozen spine; engines version independently.

## 16. Non-functional invariants (architecture-wide)

- **Degrade-safety is the first principle** — the desktop boots and works with *no* external service,
  crate, or key present; every engine has a truthful fallback.
- **BYOK everywhere** — all model + embedding calls route the LLM Gateway (tensorzero/pi-ai); keys live
  in `vault`, never in a package.
- **Observability** — `agent-observability` + revived `analytics` telemetry + `RunEvent`s + the Merkle
  audit give end-to-end evidence for every run.
- **Security** — governance gate on every call · revived `security` scan engine (secret-scan/SAST on
  agent output) · signed A2A ingress · default-deny network.
- **Truthful health** — the fleet reports real availability; never a faked "connected".

## 17. Risk register & sequencing rationale

| Risk | Mitigation |
|---|---|
| Disk ~100% full (ENOSPC landmine) | **Clean (Phase 0) first** — deletes free space *before* any install/build |
| Heavy Rust/Go/Py builds | Fleet consumes **prebuilt** binaries; absent ⇒ TS fallback; never build in the run loop |
| Engine coupling → spaghetti | **Ports + composition root**; no sideways deps |
| Reviving 306-error `cli` | Optional — fold into `recoder-code` if not worth the cleanup (flagged in §8) |
| Big-bang breakage | **Strangler** per engine, degrade-safe fallback, verified between phases |
| Polar entanglement in `distribution` | Delete Polar + make the billing IPC degrade-safe in the same step |

---

## 18. The port contracts (the seams — `agent-os/src/ports/`)

The composition root binds engines to these ports. Sketch of the canonical set (every engine
implements one; every consumer depends on the port, never the impl):

```ts
// Execution
interface RuntimePort   { run(bundle: InstructionBundle, on: RunEventSink): Promise<RunHandle> }
interface SubstratePort { provision(spec): Promise<Worktree|Sandbox>; teardown(ref): Promise<void>;
                          diff(ref, base): Promise<SubstrateDiff>; tree(ref): Promise<FileList> }
interface PlannerPort   { plan(task: TaskSpec, ctx): Promise<RunPlan> }          // ← packages/pal

// Knowledge
interface GitNexusPort  { index(repo): Promise<void>; search(q, {semantic,github}): Promise<Hit[]>;
                          impact(paths): Promise<ImpactResult>; contextPack(task): Promise<ContextPack> }
interface RetrievalPort { ingest(doc): Promise<void>; search(q, topK): Promise<Passage[]> }
interface MemoryStore   { recall(q, scope): Promise<MemoryItem[]>; propose(candidate): Promise<Id> }
interface VectorStorePort { ensure(coll, dim); upsert(coll, pts); search(coll, vec, k): Promise<Match[]> }
interface EmbeddingPort { embed(texts: string[]): Promise<number[][] | null> }   // null ⇒ degrade

// Platform
interface LlmGatewayPort{ complete(req): Promise<Completion>; embed(req): Promise<number[][]> } // tensorzero/pi-ai
interface BrowserPort   { open(url); snapshot(sel): Promise<string>; verify(text): Promise<boolean> }
interface IssueGraphPort{ ready(): Promise<Issue[]>; create(i); close(id) }       // beads

// Control plane (governance is not swappable — it wraps everything)
interface PolicyPort    { decide(input): PolicyDecision }                          // allow|needs_approval|deny
interface AuditPort     { seal(entry): Promise<AuditReceipt> }                     // Merkle chain
interface WorkflowPort  { run(def: WorkflowDef, ctx): AsyncIterable<RunEvent> }
interface CoordinationPort { lock(scope, ttl): Promise<Fence>; bus: A2ABus }
interface ConnectorPort { channels(): Channel[]; send(ch, msg); onInbound(cb) }    // extracted-from-openclaw
```

**Degrade contract:** every port impl must return a truthful empty/fallback (not throw, not fake) when
its backing service/key is absent — `EmbeddingPort.embed → null`, `RetrievalPort.search → []`,
`GitNexusPort.search → keyword-only`, `PlannerPort.plan → default heuristic`.

## 19. The agent-facing capability catalog (MCP surface)

What an agent actually wields — one governed tool set (`mcp/recoder-capability-tools.cjs` skins these):

| MCP server | Tools | Engine |
|---|---|---|
| `recoder.git_nexus` | search_code · package_map · owners · related_tests · impact_report · context_pack | E1 |
| `recoder.repo` | repo.read · repo.search (kw+semantic+github) · repo.diff | E1 |
| `recoder.retrieval` | retrieval.ingest · retrieval.search | E2 |
| `recoder.memory` | memory.search · memory.candidate.create | E3 |
| `recoder.browser` | browser.open · browser.snapshot · browser.verify | E9 |
| `recoder.preview` | preview.issue_url · preview.health · preview.browser_check · preview.attach_evidence | E9 |
| `recoder.web_search` | web.search | S9 (revived) |
| `recoder.beads` | beads.ready · beads.create · beads.close · beads.sync | E14 |
| `recoder.approvals` | approvals.request · status · list · decide | E10 |
| `recoder.artifacts` | artifacts.create · get · list · link | E10 |
| `recoder.github` | github.search · pr.create · pr.comment | E1/E16 |
| `recoder.logs` | logs.stream · search · append · attach | control-plane |
| `recoder.tasks`/`recoder.runs` | task/run read+write | control-plane (agent-os) |
| `recoder.gateway` | gateway.complete · gateway.embed (internal) | E15 |

Every call → `authorize → risk → policy → execute(port) → audit`. High-risk (pr.create, deploy,
secret, delete, branch.push) ⇒ `needs_approval`. **Removed:** `deploy`/`billing` (Polar dropped).

## 20. Definition of done — per engine (the acceptance bar)

An engine is "shipped" only when: (1) a real owned package implements its port with depth; (2)
`docker-backend` mounts it via the composition root; (3) an MCP skin exposes it behind the gate; (4) it
is **degrade-safe** (proven by a test with the backing service absent); (5) a focused unit test + one
live-evidence artifact exist; (6) the `DIRECTORY-MAP` row flips to `wired`.

---

## 21. Execution spec — per phase (workflow-ready)

Each phase: **deliverables · owner-files · verification · execution shape.** Phase 0 is by hand
(workspace config); the rest are workflows (parallel agents on disjoint files, integrated by the
orchestrator). Nothing proceeds until the prior phase verifies green.

### Phase 0 — Clean (by hand, sequential; frees disk first)
- Delete `crates/lance` (+ Cargo workspace member + Makefile target).
- Delete Giselle cluster (21 pkgs) + prune pnpm workspace globs.
- Delete `ts/oh-my-codex`, `ts/oh-my-openagent` (+ fix `runtime/.../repo-engine-locator.ts` maps + workspace).
- Delete Polar: `py/recoder-billing`, `ts/polar`; make `distribution` billing IPC degrade-safe; drop the `billing` MCP engine + its bridge tools (+ re-sync the 3 capability-tool copies).
- Relocate → `vendor/`: `crates/claw-code-parity`, `py/pal-mcp-server`, `docker-backend/vendor/opencode`.
- **Then** regenerate lockfiles; verify `pnpm -w install` + targeted builds green.
- **DoD:** tree shrinks, `pnpm install` clean, docker-backend still builds.

### Phase 1 — Fleet + Gateway + vector foundation
- `docker-backend/src/fleet/{supervisor,manifest,health}.ts` — declarative polyglot service supervisor.
- `docker-backend/src/gateway/{tensorzero-daemon,gateway.routes}.ts` — `LlmGatewayPort` over `crates/tensorzero`; degrade → `pi-ai`.
- `docker-backend/src/agent-os/mcp/vector-store.ts` — `VectorStorePort` (Qdrant REST) + `EmbeddingPort` (via gateway).
- `packages/agent-os/src/ports/` — add `LlmGatewayPort`, `VectorStorePort`, `EmbeddingPort`, `PlannerPort`.
- **DoD:** backend boots with **zero** external services (all degraded); gateway falls back to pi-ai.

### Phase 2 — Intelligence engines (workflow · parallel · disjoint)
- **E1** `packages/recodergit/src/semantic-index.ts` + rewrite `repo-engine.ts` to delegate (keyword+semantic+GitHub, merged).
- **E2** NEW `packages/retrieval/*` + `packages/agent-mcp/src/servers/retrieval-server.ts` + `docker-backend/.../retrieval-engine.ts` + wire (inproc-engines + capability tools).
- **E3** fold `mem0`/`continuum` behind `agent-memory`; keep reviewed-candidate model.
- **DoD:** each MCP tool live + degrade-safe (test with Qdrant/embeddings absent).

### Phase 3 — Execution breadth (workflow)
- **E7** `crates/openfang` as a governed surface via the fleet (already seamed).
- **E8** `packages/agent-oss` adapters behind `substrate` (langgraph/crewai/e2b), gated.
- **E9** `py/browser-use` engine + `recoder-browser-tools` as the real browser depth.
- **E6** Daytona/E2B remote substrate wired for cloud/teams.

### Phase 4 — Orchestration brain (workflow)
- **E11** `packages/pal` → `conductor-planner.ts` (decisions via PAL, heuristic fallback).
- **E12** `agent-workflows` + `agent-hooks` into the run loop (verify→browser-check→memory; PostToolUse).
- **E13** `go/multica` coordination fused; **E14** `beads-adapter` bd↔TaskSpec.

### Phase 5 — Platform (workflow)
- **E15** gateway full (tensorzero routing/cache/observability).
- **E16** `go/recoder-xds` + `go/ziti` (cloud/teams) + `network`.
- Connectors (`extracted-from-openclaw`) + `ops-recorder` work-signals.
- **Revive:** `analytics`(telemetry) · `performance`(cache) · `plugins`(marketplace) · `security`(scan) · `ui`(components) · `web-search`(capability).

### Phase 6 — Docs
- Rewrite `DIRECTORY-MAP.md` + `RECODER-CAPABILITIES.md` to this reality; flip every wired row.

> **Tracking:** each engine gets a `bd` issue linked to its §-ref; the orchestrator integrates +
> verifies each workflow, commits per engine, and only advances phase when the DoD (§20) is met.

---

## 7. Invariants (quick reference)
- Every engine + fleet service is **degrade-safe**: absent daemon/service → truthful fallback, never a
  crash or a fake result. The desktop must run with **zero** external services present.
- All model calls (incl. embeddings) route the **LLM Gateway** (tensorzero/pi-ai, BYOK).
- Vectors = **pgvector/Qdrant** only.
- Every capability call passes the **governance gate**; audit seals into the Rust Merkle chain.
- `recoder.xyz` stays the auth source of truth; `distribution` degrades without Polar.
- MCP is a skin — depth lives in the owned engine.
