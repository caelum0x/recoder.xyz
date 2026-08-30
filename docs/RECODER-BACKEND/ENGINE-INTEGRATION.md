# Engine Integration — the canonical engine → backend → desktop → run-flow map

> **Scope.** This is the single source of truth for how Recoder's backend engines
> are wired: where their OSS lives, how the backend reaches them (transport +
> adapter), how they get into the **desktop** app (dev vs packaged), whether the
> **conductor run flow** actually consumes them, their **truthful current state**,
> and the concrete **target** to make every engine work end-to-end.
>
> **Product framing.** Recoder is the "Cursor of AI agents" (conductor.build
> shape). There is **ONE project: `apps/desktop`** = the Wave shell (the `recoder-*`
> frontend; the old Preact cockpit SPA was deleted 2026-07-31, recoder-flgn) +
> **embedded Node backend** (15 domains). **Engines are BACKEND capabilities —
> invisible to the frontend.** The user never sees "mem0" or "colbert"; they see a
> terminal running their coding agent in parallel git worktrees. Engines are the
> power the *agents* use (memory, retrieval, inference, governance, terminal,
> issue graph, browsing, GitHub, squads, networking, social).

---

## 1. The model: 4 hops, a transport ladder, one embedded supervisor

### 1.1 The four hops

```
ENGINE (OSS)  ──▶  BACKEND (adapter + transport + health)  ──▶  DESKTOP (embed)  ──▶  RUN FLOW (consumes it)
 rust/py/go/C      backend/src/domains/engines/adapters/*      apps/desktop supervisor   conductor launch/merge
 backend/engines   + per-domain consumer adapters              spawns backend → engines  substrates + brain
```

1. **Engine** — vendored OSS (or owned Rust/Go/TS) under `backend/engines/{rust,py}`
   or `apps/desktop/{server/engines,engines}`.
2. **Backend** — a typed **adapter** in `backend/src/domains/engines/adapters/{napi,daemon,sidecar,cli}`
   exposes engine ops behind a port, plus a **health()** that is *truthful* (down /
   degraded / up with a reason). Many engines also have a **consumer-side adapter**
   in the domain that actually uses them (e.g. `domains/memory/adapters/*`).
3. **Desktop** — `apps/desktop/app/emain/emain-backend-core.ts` `BackendSupervisor`
   spawns the embedded backend, which in turn spawns/loads the engines. Packaging
   is controlled by `apps/desktop/app/electron-builder.config.cjs` `extraResources`.
4. **Run flow** — `backend/src/domains/conductor/*` launches an agent in an isolated
   git worktree and consumes the engines that are wired into it (substrates + the
   brain/code-intel/memory adapters). Everything degrades **safe** — a missing
   engine never fabricates a result.

### 1.2 The transport ladder (fastest, most-embedded first)

| Rung | Transport | Mechanism | Adapters dir | Engines |
|---|---|---|---|---|
| 1 | **napi (in-proc)** | single `dlopen` of a Rust `.node` via the shared `NapiLoader` (one load, CONFLICT #8-safe) | `adapters/napi` | tensorzero, governance, openfang |
| 2 | **loopback daemon** | supervised child on `127.0.0.1:<port>`, HTTP `/health` probe (`DaemonSupervisor`) | `adapters/daemon` | colbert, ops-recorder, multica, recoder-xds*, ziti* |
| 2 | **sidecar** | supervised child (uvicorn HTTP or stdio-MCP) over `SidecarSupervisor` | `adapters/sidecar` | mem0, browser-use, pal-mcp |
| 3 | **CLI** | one-shot subprocess per op, health via `--version`/`--help` | `adapters/cli` | beads, tmux, dmux, recodergit |
| — | **in-proc HTTP / dynamic import** | plain JS client, no spawn | (in domain) | retrieval embed+store, openclaw social |

\* `recoder-xds` and `ziti` are wired as **read-only / externally-managed** REST,
not spawned locally today (cloud-deferred).

Rule: **prefer the highest rung that works.** napi is zero-hop and bundles as a
single `.node`; python needs an interpreter + venv (multi-GB, hard to package);
Go needs a per-platform binary. This is the core packaging tension in §3.

### 1.3 Dev vs packaged

- **DEV** — supervisor runs `tsx backend/src/server.ts`; the backend walks up the
  repo (`repoRoot` / `findRepoRoot`) and finds engine venvs, Go binaries, `.node`
  files, and CLI dists **in place**. Most engines resolve.
- **PACKAGED** — the backend runs as `<resources>/backend/dist/server.js` under
  `ELECTRON_RUN_AS_NODE`. It can **only** see what `extraResources` copied (a
  fail-loud `assertExtraResourcesExist` gate blocks packaging if any source is
  missing). Today that is: `backend/dist` + `backend/node_modules`, the pinned
  **tmux** binary, the **beads `bd`** binary, the **dmux** dist,
  **four** Rust `.node` addons (governance, lance, openfang, tensorzero-release),
  and the Wave `recoder-*` frontend built into the shell (the old separate cockpit
  `dist` is gone). **Still no python, no venvs, and no multica/ziti/xds Go
  binaries.** Resolvers that walk up the repo root for those find nothing → they go
  truthfully `down`.

---

## 2. Engine matrix

Legend for **State**: **LIVE** = wired + resolvable + consumed; **DEGRADED** =
resolvable but missing config/creds/consumer; **GAP** = not reachable (not bundled
/ not spawned / orphaned). "dev / packaged" split where they differ.

> **RecoderGit packaged mode (updated 2026-08-30).** The PolyForm donor remains
> excluded from the DMG and flag-gated. The installed backend now falls back to
> the MIT `@recoder/recodergit` file graph for TypeScript/JavaScript aliases,
> Python modules, Go packages, and Rust modules/local crates. It returns bounded
> upstream and downstream file impact, including test paths. GitHub
> review, agent-os metadata, and Wave label this as `file` scope; donor results
> remain `symbol` scope. The scanner reads Python roots from `pyproject.toml`,
> `setup.cfg`, and `pyrightconfig.json`; Go local replacements from `go.mod` and
> `go.work`; and Rust `#[path]` modules. Symbol calls, definitions, and process
> membership remain outside the permissive path. The
> packaged graph stores a compact canonical-KV snapshot keyed to repo and source
> revision, so a matching backend restart does not rescan source. This clarification
> supersedes the donor-only packaged-state wording in the RecoderGit row below.

| Engine (domain) | OSS dir + lang | Backend transport + adapter | Desktop reach (dev / packaged) | Run-flow use | State (truthful) | Target |
|---|---|---|---|---|---|---|
| **tensorzero** (INFERENCE) | `backend/engines/rust/tensorzero` — ~30-crate Rust workspace; `tensorzero-gateway-napi` exposes `EmbeddedGateway.boot/inference/feedback` | **napi in-proc**; `adapters/napi/tensorzero-napi.adapter.ts` via `NapiLoader`; eager `EmbeddedGateway.boot(configFile, clickhouseUrl)`; health up only when `.node`+boot ok | dev: `.node` resolves, gateway boots / **packaged: LIVE** — the **release** `.node` is now built at `crates/target/release/tensorzero_gateway_napi.node`, copied to `native/tensorzero_gateway_napi.node`; a fail-loud `assertExtraResourcesExist` gate blocks packaging if it's absent (2026-07-31) | Both paths: (a) CLI runtimes get a base-URL at `/api/gateway/v1` so agent tokens are metered; (b) openfang kernel routes model calls through the same `.node`. In-proc **SSE streaming is real** (`inferenceStream`); a rung-3 **direct-BYOK multi-provider router** + supervised loopback back it up; BYOK keys resolve from the governance secrets vault into the delivery path; OpenAI-compatible `/api/gateway/inference/v1/embeddings` edge is live. MCP: `inference.complete/embed/feedback` **+ shipped** `tensorzero.model_catalog` · `tensorzero.batch_inference` | **DEV + PACKAGED = LIVE** (release `.node` built + bundled + fail-loud gate, verified 2026-07-31); real turns still need BYOK/ClickHouse creds | **DONE:** release `.node` build + fail-loud packaging gate + BYOK threaded into boot/router + embeddings edge. Remaining: optional ClickHouse metrics; verify `native/` in the installed app |
| **recoder-governance** (GOVERNANCE) | `backend/engines/rust/recoder-governance` — kernel/audit/approval/ipc/daemon/napi Rust crates; both `-napi.node` **and** `-daemon` release-built | **napi → daemon(UDS) → ts floor → synthetic DENY**; `adapters/napi/governance-napi.adapter.ts` (thin re-expose) + `domains/governance/adapters/kernel-ladder.adapter.ts` | dev: napi rung engages (release `.node` present, `hasNapiKernel()` true) / **packaged: LIVE-primary** — `.node` bundled → napi loads; the release **daemon** binary is built but **UDS fallback rung still missing packaged** (daemon not yet in `extraResources`) | **Every write mutation** gated: `governance-gate.port.ts` → `decide → risk → audit`, fail-closed synthetic deny, Merkle seal after write. Desktop `RECODER_SOLO_MODE=1` = click-is-approval. MCP: `governance.*` **+ shipped** `governance.explain_decision` (per-decision rationale + rule trace). **New (2026-07-31):** approval-clearance now Postgres-backed; policy reload is first-class via `policy.updated` hook | **LIVE (dev + packaged on napi rung), fail-closed** — packaged UDS fallback not yet wired | Bundle the built daemon binary + packaged resolver (restore the UDS middle rung); ensure `INTERNAL_SERVICE_KEY` reaches daemon |
| **openfang** (AGENT-ENGINE) | `backend/engines/rust/openfang` — full Rust agent kernel (wasmtime+sqlite+skills+hands) → `openfang_napi.node` (29 MB release **present**) | **napi in-proc**; `adapters/napi/openfang-napi.adapter.ts`; binds addon eagerly, **defers** `OpenfangEngine.boot(configPath)` to first use; ~51 `#[napi]` ops | dev: resolves from `target/release` / **packaged: COMPLETE** — `.node` bundled → `native/openfang_napi.node`, `NapiLoader` resolves `resourcesPath` first | **CONSUMED + DISPATCHABLE** as `in_process` substrate: `runtime='openfang'` is a selectable runtime (`runtime-listing.adapter.ts` → `GET /api/conductor/runtimes` with truthful availability; `runtime-substrate-selector.ts` maps it to the `in_process` substrate), `openfang-runtime.adapter.ts` provisions the worktree, runs one agent turn, feeds the same run-tailer; desktop injects openfang env. **New (Wave 3–4):** real token accounting (per-turn `bufferSink` forwards kernel `input/outputTokens` to meter), multi-turn `continueRun` driver, shared provenance gate on both direct+napi paths, event-bus publish hook so kernel triggers can fire Hands. MCP: **shipped** `openfang.introspect_hands` · `openfang.agent_run_status` | **LIVE + dispatchable** (selectable runtime, in-proc substrate wired, real token accounting, multi-turn reuse); degrades truthfully on real turns without model keys or kernel export-blocked autonomous facets | Confirm `configPath` + BYOK/tensorzero keys reach `OpenfangEngine.boot`; e2e a scratch-repo openfang run; kernel exports for autonomous Hands remain owner-gated |
| **beads / bd** (MEMORY/issue-graph) | `apps/desktop/server/engines/beads` — Go + Dolt; owned `bin/bd` built (185 MB) | **CLI**; `adapters/cli/beads.adapter.ts` → `resolveBeadsBin` (`BEADS_BIN` → owned build → PATH `bd`); full `beads.*` MCP tools **+ shipped** `beads.blocked` · `beads.graph` · `beads.deps` · `beads.search` · `beads.stats` (issue-graph query/traversal facets). **New (2026-07-31):** single unified `BeadsAdapter` replaces three scattered spawners; memory domain owns the issue-graph facet; agent-exposed `beads.memory_promote` MCP tool removed | dev: **LIVE** (owned bin resolves) / **packaged: BUNDLED** — `bin/bd` now copied to `<resources>/backend/engines/beads/bin/bd` and resolved by `beads-bin.ts` (`resourcesPath` + dist-relative, before any PATH `bd`); the host-arch bin is a local build (deliberately not in git, >100 MB) so the packaging gate requires it | **CONSUMED**: `createConductorCodeIntel({ beads })` → `issue-graph.adapter.ts` tracks each workspace/run as a bd node; recall-fusion source; cross-agent memory fabric | **LIVE dev + packaged** (given the local `bin/bd` build) | Keep the CI build of the DB-compatible `bd`; put Dolt DB under private `DATA_DIR` |
| **mem0** (MEMORY) | `backend/engines/py/mem0` — full mem0 OSS monorepo (Python/Poetry); `.venv` **present**; FastAPI in `server/main.py` | **sidecar loopback-http** (port 8896) for get/history/update **+** in-proc `@recoder/mem0` npm path (add/search/getAll/delete); `adapters/sidecar/mem0.adapter.ts`. **Default (2026-07-31): Google/Gemini** for BOTH LLM + embedder (`DEFAULT_MEM0_PROVIDER='google'`; `GEMINI_API_KEY`/`GOOGLE_API_KEY` powers both; explicit `MEM0_LLM_PROVIDER`/`MEM0_EMBEDDER_PROVIDER` still win) | dev: repoRoot walk finds `.venv` → sidecar spawns / **packaged: GAP** — no `backend/engines/py` bundled, no python | **CONSUMED via memory domain** (not the engines adapter): the memory brain-recall path recalls mem0 ∪ beads ∪ candidates on launch, harvests a candidate wisp on completion. Engines `Mem0Adapter` = MCP tool **+ shipped** `mem0.recall` · `mem0.relations` · `mem0.stats` (graph-relations + store stats, degrade-truthful). **New (Wave 3–4):** full READ+WRITE loop regression-locked; consolidation on INLINE (`add`) instead of batch; paired with embedded **lance** vector store | **DEGRADED dev** (Gemini default wired; needs a `GEMINI_API_KEY`; vector store = embedded lance) **/ GAP packaged** | Pair with embedded **lance** `VectorStorePort` + napi embeddings; small PyInstaller for optional REST ops or defer; keep truthful down until key + store wired |
| **colbert** (MEMORY reranker) | `backend/engines/py/colbert` — Stanford ColBERT (Python); `.venv` **present**; `rerank_server.py` + `server.py` | **daemon loopback-http** (port 8893); `adapters/daemon/colbert-loopback.adapter.ts`; identity-rerank degrade | dev: venv + entrypoint resolve, `DaemonSupervisor` spawns / **packaged: GAP** — `backend/engines/py` not bundled | **CONSUMED**: **real ColBERT MaxSim rerank** over the recall-fusion set + retrieval RAG passages when the daemon is live; any failure → `identityRerank` (original order, `available:false`, never fabricated). **New (Wave 3–4):** per-repo index built on workspace create + searched on launch; identity degrade reads loop regression-locked; maintenance sweep includes per-repo GC (config-gated retention). MCP: **shipped** `colbert.rerank_batch` + collection management `colbert.collections.list` · `colbert.collections.stats` · `colbert.collections.create` · `colbert.collections.drop` | **LIVE dev** (real MaxSim rerank when the `.venv` daemon is up) **/ GAP packaged** — still needs torch+checkpoint, so packaged never reranks | For packaging, replace with a lighter embedded cross-encoder / inference napi (avoid torch), or ship a prebuilt colbert binary + packaged resolver; keep identity-order degrade |
| **retrieval — embeddings** (RETRIEVAL) | *no OSS dir* — in-proc HTTP client; `domains/memory/adapters/embedding.adapter.ts` | **in-proc HTTP** (tensorzero URL → BYOK key → endpoint override); no subprocess. The inference domain now exposes an OpenAI-compatible **`/inference/v1/embeddings`** + **`/gateway/v1/embeddings`** edge and an **`inference.embed`** MCP tool routing embeddings down the same napi ladder | present dev+packaged (plain JS); resolves against the embeddings edge when a provider/BYOK key is set, else truthfully `provider==='none'` | vector search embeds the query for the memory repo-context block; no provider → block skipped truthfully | **DEGRADED** — embeddings edge wired; still needs a provider/BYOK key injected | Confirm the desktop injects a BYOK embed key (or routes through the inference napi with zero external creds); surface state in the desktop |
| **retrieval — vector store** (RETRIEVAL) | *no OSS dir* — Qdrant REST client `qdrant.adapter.ts` **+** the now-**adopted** `lance_npm_bindings.node` (`native/`) as the embedded `VectorStorePort` | **embedded lance** when `QDRANT_URL` unset, else **HTTP REST** to Qdrant; real Qdrant liveness probe drives `store.configured` | lance `.node` present dev+packaged and **now consumed** (no longer dead weight); Qdrant used only when a URL is injected | Underpins retrieval RAG + mem0-OSS store; with lance embedded, retrieval works packaged with zero external services (Qdrant is the scale-up option) | **LIVE (embedded lance)** — packaged works with no services; external Qdrant remains the opt-in | Done: lance adopted as the embedded store. Remaining: expose store-choice + health in the desktop |
| **tmux** (TERMINAL) | `apps/desktop/engines/tmux` — vendored C; **arm64 binary built** (~1 MB) | **CLI**; `adapters/cli/tmux.adapter.ts` **+** the run-flow substrate `conductor/adapters/tmux-substrate.adapter.ts` (`tmux_worktree`) | dev: `CONDUCTOR_TMUX_BIN` injected / **packaged: BUNDLED** — builder copies `../engines/tmux/tmux`; resolver adds `resourcesPath` candidate | **CRITICAL PATH** — default `ConductorSubstrate`: `git worktree add` + `new-session`; `capture`/`exitCode`/`teardown`; sessions `recoder-<id>`. **New (Wave 3–4):** RECONCILE SCAN wired (`createSubstrateScan` from `engines.tmuxIntrospect()`) — `reconcile()` sees live `recoder-*` sessions and GCs orphaned/leaked + corrects drift after restart (regression-locked). MCP: **shipped** `tmux.list_sessions` · `tmux.list_windows` · `tmux.list_panes` · `tmux.capture_pane` · `tmux.server_info` (read-only introspection) | **LIVE (dev + packaged)** — the one engine fully wired both modes, reconciliation shipped | Add x64/universal + Linux/Windows tmux builds per target; optionally converge the redundant engines `TmuxAdapter` with the substrate |
| **dmux** (TERMINAL, optional) | `apps/desktop/engines/dmux` — TS Ink/React TUI; `dist` built | **CLI**; `adapters/cli/dmux.adapter.ts`; pins to conductor tmux via `DMUX_TMUX_BIN` | dev: vendored launcher resolves / **packaged: BUNDLED** — `dist` + launcher now copied to `<resources>/backend/apps/desktop/engines/dmux`; still needs a real TTY | **DEEPLY FUSED (Wave 3–4, C2–C3, desktop-only):** (1) **PANE ATTENTION:** heuristics ported to `attention-classifier.ts`, consumed by conductor. (2) **LAYOUT BRAIN → F3 GRID (C2–C3):** `engines.dmuxLayout().buildWorktreeGrid` arranges one pane per sibling, EACH cwd'd to its OWN worktree; conductor consumes via `WorkspaceGridPort` (`dmux-grid.adapter.ts`) — `CompareView.grid` carries read-only attach hint + governed `arrangeCompareGrid`/`POST /workspaces/compare/:taskGroup/grid` builds worktree-bound `agent-grid` in dedicated `recoder-group-<taskGroup>` session (never splits/moves live agent session). **TENANT GATE (desktop-only):** `dmux <repoPath>` (attach command) emitted ONLY in single-tenant desktop (`CONDUCTOR_DESKTOP_SINGLE_TENANT=1` → `createDmuxGridAdapter({singleTenant})`); shared/prod withholds it. MCP: **shipped** `dmux.layout_presets` · `dmux.panes_list` · `dmux.panes_create` · `dmux.layout_apply` | **LIVE dev+packaged (desktop, tenant-gated)** — operator console + grid builder | Confirm grid builder shapes worktree-bound panes; attach hint surfaces in desktop UI; shared prod withholds attach command |
| **recodergit** (GITHUB) | PolyForm donor: `apps/desktop/engines/recodergit`; permissive package: `packages/recodergit` | Donor CLI when enabled and present; otherwise in-process MIT semantic search and static graph fallback | dev: donor is opt-in / packaged: donor excluded, MIT fallback bundled | Launch context uses semantic search; installed PR review queries bounded upstream and downstream impact. The packaged graph confirms imported calls against target declarations across TypeScript/JavaScript, Python, Go, and Rust, including configured aliases and local module replacements. It falls back to file imports for unresolved syntax. Exact executable, server, worker, and route entrypoints provide process membership. A bounded 500-commit history scan adds repeated file-pair evidence with commit count and Jaccard confidence. RecoderGit registers package identities and unresolved external imports for npm, Python, Go, and Cargo during workspace indexing, then returns exact consumer files across canonical repository IDs. Agent-os, Wave, and Conductor Review carry symbol, mixed, or file scope with affected tests, processes, changed-together files, and cross-repository consumers. Canonical KV preserves index state, the repository registry, and a compact source-revision graph snapshot across backend restarts. Unsupported definition queries remain unavailable without the donor. | **LIVE packaged with symbol calls, process membership, co-change history, cross-repository consumers, and file fallback; richer donor definitions remain dev/flag gated** | Exercise the multi-repository installed loop against representative repositories and widen package metadata coverage from observed gaps. |
| **pal-mcp-server** (COMMUNICATION) | `backend/engines/py/pal-mcp-server` — Python multi-model MCP (chat/consensus/planner/clink); **`.pal_venv` MISSING** | **stdio-MCP sidecar** `adapters/sidecar/pal-mcp.adapter.ts` **+** in-proc `pal.plan` (pure TS `@recoder/pal`, deny-biased) | dev: sidecar can't spawn (no venv) / **packaged: HARD GAP** — no py bundled; only in-proc `pal.plan` survives | **PARTIAL**: `pal.plan` is an MCP tool (governed plan facet). Multi-model tools **not** consumed; `externalCall` host transport **not wired** → invoke returns `{ok:false,'host transport not wired'}`. MCP: **shipped** `pal.route` · `pal.consensus` · `pal.debate` · `pal.models` (multi-model facets; degrade-truthful until provider keys + `externalCall` land) | **SPLIT: pal.plan LIVE / multi-model DOWN** | Build `.pal_venv`; wire `externalCall` into `PalMcpAdapterDeps`; inject provider keys; bundle for packaged; consume consensus/planner in the brain |
| **ops-recorder work-signals** (SIGNALS) | `backend/engines/py/ops-recorder/work-signals` — Python FastAPI stuck-work detector; `.venv` **present** | **daemon loopback-http** (port 8894); `adapters/daemon/ops-recorder-loopback.adapter.ts`; **auth-preflight** — keyless shell 503s → returns null (never spawns useless shell) | dev: spawns only if `OPS_RECORDER_API_KEY`/`AUTH_DISABLED` injected (desktop injects neither) / **packaged: HARD GAP** — no py bundled | **DEEPLY FUSED (Wave 3–4, C1–C4):** (1) **PULL:** signal→RunEvent bridge via `/signals` MCP, fired by poller. (2) **POLLER (C3):** `signalsTimer` ARMS outside prod (test-gated interval) with reentrancy guard; no overlap/spam under hung sidecar. (3) **PUSH (C2):** conductor completion hook reverse-pushes terminal run onto board via injected `RunSignalPushPort`, fire-and-forget. (4) **DETECTOR-DRIVE (C1/C3):** `runDetectorTick()` fires `syncGithub`+`syncLinear` on the cadence, opt-in via `signalsSyncEnabled` (off when poller disarmed). MCP: **shipped** `ops-recorder.query` · `ops-recorder.stats` + write tools `ops-recorder.sync/ingest/resolve` (endpoint drift reconciled to `127.0.0.1:8073`) | **LIVE dev** (full poller+detector loop when venv present, degrade-truthful on sidecar down) **/ GAP packaged** | Inject `OPS_RECORDER_AUTH_DISABLED=1`; arm poller (`signalsSyncEnabled=true`); inject GitHub/Linear creds; bundle for packaged; wired to observability + run board |
| **browser-use** (BROWSING) | `backend/engines/py/browser-use` — Python sidecar; `.venv` present + owned TS `@recoder/agent-browser` | **SUPERVISED sidecar** (port 8897) `adapters/sidecar/browser-use.adapter.ts` via `SidecarSupervisor.ensureStarted`; live base = `supervisor.handle('browser-use')` (real Chrome via CDP) → HTTP driver when `BROWSER_USE_URL` set, else lazy puppeteer. Degrade-safe law: no puppeteer + no URL ⇒ truthful `down` | dev: supervisor spawns the sidecar when venv deps present / **packaged: GAP** — no py, no puppeteer/chromium, no `BROWSER_USE_URL` | **DEEPLY FUSED (Wave 3–4, C1–C6):** (1) **PREVIEW VERIFY:** conductor verifies stored preview URL on run lifecycle via injected `PreviewVerifyPort`, fire-and-forget + governed awaited twin, seals summary+screenshot artifact ids into audit chain. (2) **BROWSER-CHECK NODE:** `browser-check` workflow node fires per `browserChecks[]` entry through browser-use `EngineClientPort`. (3) **RESEARCH:** optional `researchTask` drives autonomous `.run_task` loop. **BOUNDED deadline:** `call.timeoutMs` honored, hung page never stalls merge. MCP: **shipped** `browser.navigate/extract/screenshot` **+ shipped** `browser.extract_structured` · `browser.run_task` · `browser.screenshot_annotate` · `browser.fill_form`; a `browser-session.binder` binds sessions | **LIVE dev** (supervised sidecar + real Chrome/CDP when venv present, truthful degrade on down/hung/break) **/ GAP packaged** | Pick a packaged transport (cloud URL / bundle puppeteer+chromium / bundle venv); consume in the run flow + workflow node; preflight venv deps |
| **multica** (SQUADS) | `apps/desktop/server/engines/multica` — Go leader-routed squads; `server/bin/server` (46 MB) built | **daemon loopback-http**; `adapters/daemon/multica-loopback.adapter.ts`; `squads.list/get/assign` **+ shipped** (agent-os coordination surface) `coordination_squad_routing` · `coordination_status` · `coordination_conflicts` + gated `coordination_request_reroute` | dev: `ensureMulticaServer` finds+spawns repo binary / **packaged: GAP** — Go binary not bundled, `README.md` repo probe fails | **DEEPLY FUSED (Wave 3–4, C1–C4, opt-in + degrade-open):** (1) **ROUTE (C1):** never-seeded `InMemorySquadStore` now gets opt-in `seedSquad()` driven by `squadSeed` config; if seeded, `SquadService.route` genuinely selects a member (leader-first/weighted), `routedAgentId` threads to conductor.createWorkspace; bare `RECODER_SQUAD_ID` with no seed degrades to pass-through (truthful warn). (2) **ADMISSION (C3):** conductor consults `admitIssue({taskId})` before launch; engine-confirmed `admit:false` defers truthfully (`ConductorWriteResult ok:false`, governance-gated reroute WRITE). MCP: **shipped** `coordination_squad_routing` · `coordination_status` · `coordination_conflicts` + gated `coordination_request_reroute` | **LIVE dev+packaged (opt-in, degrade-open)** — default OFF; absent engine/URL ⇒ pass-through (never blocks) | Bundle Go binary; confirm `RECODER_SQUAD_ID`+`squadSeed` wired; verify double-assignment defers; ensure admission fail-open on engine down |
| **ziti** (NETWORKING) | `apps/desktop/server/engines/ziti` — OpenZiti Go tree (vendored bin **inert**) | **externally-managed REST** (Edge Mgmt v1); `adapters/daemon/ziti-rest.adapter.ts`; start/stop no-ops; own auth health probe | dev = packaged — needs `ZITI_CONTROLLER_URL`+token (desktop has neither) → truthful down; vendored bin wired to nothing | **NOT consumed** by the run flow — but the CLOUD domain now exposes **shipped** read-only MCP mesh tools `cloud_mesh_services_list` · `cloud_mesh_enrollment_status` · `cloud_mesh_topology` + gated `cloud_mesh_enroll`; would provision zero-trust runner identities | **GAP (degrade-by-design)** — no controller, MCP tools truthfully down without `ZITI_CONTROLLER_URL` | Decide if single-user desktop needs a runner mesh (likely NO); if cloud runners added, wire controller + `provisionRunnerIdentity`; else mark cloud-only |
| **recoder-xds** (NETWORKING) | `apps/desktop/server/engines/recoder-xds` — Go xDS/Envoy control-plane; `bin/recoder-xds` (31 MB) built | **read-only status** (lives in CLOUD domain) `domains/cloud/adapters/xds-envoy.adapter.ts`; **never spawns**; reads `XDS_ENDPOINT` (default null) | **GAP** — nothing spawns `bin/recoder-xds`; not in `extraResources`; `XDS_ENDPOINT` unset → down both modes | **NOT consumed** by the run flow — cloud mesh-diagnostics read-only surface; **shipped** read-only MCP xDS tools `cloud_xds_snapshot` · `cloud_xds_clusters` · `cloud_xds_routes` · `cloud_xds_listeners` · `cloud_xds_endpoints` (truthfully down when `XDS_ENDPOINT` unset) | **GAP — cloud-deferred** (docs mark it so); truthful down | Keep cloud-deferred for desktop; if local mesh wanted, spawn on loopback + set `XDS_ENDPOINT` + bundle; report `xdsHealth` as deferred, not active |
| **openclaw** (SOCIAL) | `apps/desktop/engines/openclaw` — TS connectors `@recoder/connectors` (telegram proven; slack/signal/line/feishu/imessage/whatsapp; discord dormant); `dist` built | **in-proc dynamic import** per channel; `domains/social/adapters/openclaw-gateway.adapter.ts`; try/catch + structural guard → `ConnectorPort` or null | dev: pnpm symlink resolves / **packaged: RISK/GAP** — `@recoder/connectors` is a **symlink pointing outside** `backend/node_modules`; builder copy may not dereference → channels throw | **BRIDGED** — `createSocialComposer` is now built **with** `conductor` + `targetResolver` + `inference` (`bootstrap/index.ts` ~883–891) → inbound can launch a run (`/api/social/.../run`) and reply; ingress is RAW-body HMAC (`POST /api/social/webhooks/:channel`). Mounts at **`/api/social`** (not `/api/connectors`) | **DEGRADED** — run-flow bridge now bound; channels still need per-channel secrets; packaged connectors symlink still unverified | Provision per-channel secrets + zrok; add explicit `extraResources` for connectors `dist` (dereference the symlink); prove telegram e2e |

---

## 3. Desktop packaging plan (`extraResources`)

### 3.1 What is bundled **today** (`electron-builder.config.cjs`)

| Bundled | Path in app |
|---|---|
| Embedded backend | `backend/dist` + `backend/node_modules` + `backend/package.json` + `backend/data-template` |
| tmux binary (arm64) | `backend/engines/tmux/tmux` |
| beads `bd` binary (host-arch local build) | `backend/engines/beads/bin/bd` |
| dmux dist + launcher (+ `package.json`) | `backend/apps/desktop/engines/dmux` |
| governance napi | `native/recoder-governance-napi.node` |
| lance vector napi | `native/lance_npm_bindings.node` (now **adopted** as the embedded `VectorStorePort`) |
| openfang napi | `native/openfang_napi.node` |
| tensorzero napi | `native/tensorzero_gateway_napi.node` — **now built** at `crates/target/release/tensorzero_gateway_napi.node`; a fail-loud `assertExtraResourcesExist` gate blocks packaging if it's absent |
| Wave `recoder-*` frontend | built into the shell (`pnpm run build:prod`) — the old separate `cockpit/dist` is gone (SPA deleted 2026-07-31, recoder-flgn) |

### 3.2 What MUST be added for a packaged app where **every** engine works

| Add | Source → dest | Unblocks | Honest hard part |
|---|---|---|---|
| **tensorzero release `.node`** ✅ **DONE** | built at `crates/target/release/tensorzero_gateway_napi.node`; bundled + fail-loud gate | INFERENCE packaged | large native artifact; keep the CI build gate green |
| **governance daemon** | `…/target/release/recoder-governance-daemon` → `native/` | UDS fallback rung packaged | small; also needs packaged resolver branch |
| **beads bin** ✅ **DONE** | `apps/desktop/server/engines/beads/bin/bd` → `backend/engines/beads/bin/bd` | issue-graph packaged | **185 MB** host-arch Go+Dolt local build (not in git); version-pin to DB-compatible build |
| **multica bin** | `…/multica/server/bin/server` → `backend/engines/multica` | SQUADS packaged | 46 MB; per-platform Go build |
| **recodergit donor dist** ❌ **NOT BUNDLED (license)** | PolyForm-Noncommercial (bd recoder-rxn0), deliberately excluded from the DMG | Rich symbol graph remains dev-only; packaged review uses the MIT file-import fallback | Keep the donor opt-in. Broaden the bundled permissive graph instead of putting PolyForm code in the DMG. |
| **dmux dist** ✅ **DONE** | `…/dmux/dist` + launcher (+ `package.json`) → `backend/apps/desktop/engines/dmux` | operator console packaged | needs a TTY |
| **py sidecars** (mem0, colbert, ops-recorder, browser-use, pal) | source + **relocatable venv** or PyInstaller/uv binary | MEMORY/SIGNALS/BROWSING/COMMUNICATION packaged | **the hard one** — multi-GB venvs (torch alone is GB-scale), interpreter relocation, chromium download; see §3.3 |
| **openclaw connectors** | dereference symlink or explicit `{from: openclaw/dist → node_modules/@recoder/connectors/dist}` | SOCIAL packaged | symlink-outside-root bundling bug |
| **cross-arch tmux** | x64/universal + Linux/Windows tmux | TERMINAL on non-arm64 | per-target native build |

### 3.3 The honest hard part: python + disk

Bundling five python sidecars with their venvs is the dominant cost — colbert
pulls **torch** (GB-scale), mem0 pulls an embedder stack, browser-use pulls
chromium. Naively shipping venvs bloats the installer by multiple GB and is not
relocatable across machines. **Recommended escape hatch: collapse python engines
onto the already-bundled Rust napi rung.**

- **Embeddings + vector store** → route through the bundled **tensorzero napi**
  (embeddings) + **lance napi** (store) ⇒ retrieval + mem0-OSS work packaged with
  **zero** python and zero external services.
- **Reranker (colbert)** → replace torch with a light embedded cross-encoder or
  the tensorzero napi ⇒ drop the multi-GB torch venv.
- **mem0 REST facet** (get/history/update) → the only truly-python-needed surface;
  ship as a small PyInstaller binary or defer.

This turns the "5 python venvs" problem into "1 optional small binary," and keeps
the packaged app napi-first.

---

## 4. Gap → target, grouped

### Group A — napi engines (release-build + config)

- **tensorzero** *(mostly done)*: the **release** `.node` is built + bundled behind
  a fail-loud gate, BYOK is threaded into boot/router, real in-proc SSE + the
  embeddings edge ship; a supervised loopback backs the napi rung. Remaining:
  optional ClickHouse metrics; verify `native/` in the installed app.
- **governance**: the **daemon** release binary is now built — bundle it +
  packaged resolver (restore the UDS middle rung); keep both release artifacts in
  CI; ensure `INTERNAL_SERVICE_KEY` reaches it.
- **openfang** *(mostly done)*: `runtime='openfang'` is now dispatchable (selector +
  runtime listing → `in_process` substrate) with desktop env injection. Remaining:
  confirm `configPath` + tensorzero/BYOK keys reach `OpenfangEngine.boot`.

### Group B — CLI engines (bundle binary + resolver + env)

- **beads** *(bundling done)*: `bin/bd` is now copied + resolved via `resourcesPath`
  before PATH `bd`. Remaining: pin to a DB-compatible build in CI; put Dolt DB under
  private `DATA_DIR`.
- **tmux**: cross-arch/OS builds gated per electron-builder target.
- **recodergit** *(dist bundled)*: still needs `RECODER_CODE_GRAPH_ENABLED=1` in the
  desktop env; extend adapter to the full GitHub interface and wire PR review into
  the run flow.
- **dmux** *(dist bundled)*: surface the attach hint in the desktop.

### Group C — python sidecars (collapse to napi, or bundle small binaries)

- **retrieval store/embed** *(done)*: the bundled **lance napi** is adopted as the
  embedded `VectorStorePort` and the **inference embeddings edge** (`inference.embed`
  / `/v1/embeddings`) is live — retrieval + mem0-OSS now work packaged with no
  external services (Qdrant/BYOK remain opt-in scale-ups).
- **mem0**: now defaults to **Google/Gemini** for LLM + embedder (`GEMINI_API_KEY`);
  pair with the embedded lance store + napi embeddings; small PyInstaller for the 3
  REST ops or defer; keep truthful down until the key + store are wired.
- **colbert**: swap torch reranker for embedded cross-encoder / napi; keep identity
  degrade.
- **ops-recorder**: inject `OPS_RECORDER_AUTH_DISABLED=1`, point observability at
  the loopback, add GitHub/Linear creds; optionally feed signals → suggested runs.
- **pal**: build `.pal_venv`, wire `externalCall` host transport, inject keys,
  consume consensus/planner in the brain.
- **browser-use**: pick a packaged transport (cloud URL / puppeteer+chromium / venv)
  and register the binder into the conductor MCP host.

### Group D — Go engines (bundle binary + consumer)

- **multica**: bundle Go binary + packaged candidate; wire squad `assign` through
  `engines.client('multica')`; back store with Postgres tables.
- **recoder-xds / ziti**: keep **cloud-deferred** for single-user desktop; report
  deferred/down; only wire when cloud runners/mesh are actually added.

### Group E — social bridge

- **openclaw**: the run-flow bridge is now wired (conductor+resolver+inference into
  `createSocialComposer`); mount is `/api/social`. Remaining: fix the symlink
  bundling; provision secrets + zrok; prove telegram e2e.

---

## 5. Phased plan — make every engine work end-to-end (dev + packaged)

**Phase 0 — CI build gates (unblocks packaged).** *Mostly done:* all four napi
crates now have release builds (tensorzero included) and `extraResources` copies
**fail loudly** via `assertExtraResourcesExist` instead of silently shipping a
broken app. Remaining: the governance **daemon** release binary is built but not
yet added to `extraResources`.

**Phase 1 — the run-flow core (must be LIVE packaged).** *Mostly shipped:* tmux
(done) + beads (bin now bundled + resolved) + openfang (dispatchable runtime + env
injected). Remaining: governance (bundle the built daemon for the UDS rung) +
confirm openfang model keys. This is the minimum for the invisible run flow: gated
worktree launch, issue tracking, in-process substrate. **Verify:** e2e a scratch-repo
run in an installed `.app` — honest RunEvents, non-empty diff, audit chain verifies,
bd node created.

**Phase 2 — inference + memory on the napi rung (no python).** *Largely shipped:*
the tensorzero release `.node` boots with real in-proc SSE + a metered ledger; the
**lance napi is adopted as the embedded vector store** and the **inference
embeddings edge** is the embeddings provider; mem0-OSS + retrieval RAG route through
them (mem0 now Gemini-default). **Verify:** memory recall prepends real repo-context
+ recalled memory in a packaged run with **zero** external services.

**Phase 3 — assistive engines (collapse or bundle python).** colbert → embedded
cross-encoder; recodergit code-graph enabled + bundled; ops-recorder signals wired
to observability + optionally to suggested runs. **Verify:** rerank `available:true`,
code-graph index present, signals surface truthfully.

**Phase 4 — reach engines (browsing, social, multi-model).** browser-use packaged
transport + MCP host registration; openclaw run-flow bridge + connector bundling +
telegram e2e; pal `.pal_venv` + `externalCall` + consensus/planner in the brain.

**Phase 5 — cloud-deferred + cross-platform.** Keep ziti/recoder-xds deferred with
truthful status; add cross-arch/OS tmux + per-platform Go/native builds so packaged
non-arm64 desktops are first-class.

Throughout: **every engine keeps its truthful health** — a not-yet-wired engine
reports `down`/`degraded` with a reason and the run flow degrades safe. Never claim
an engine is live in the desktop without evidence.

---

## 6. Truthful scorecard

**Shipped this program — ~54 new engine MCP tools (all real-bound, degrade-truthful,
subject-tools caller-bound):** every engine's MCP surface grew — `mem0.recall/relations/stats`;
`colbert.rerank_batch` + `colbert.collections.list/stats/create/drop`;
`browser.extract_structured/run_task/screenshot_annotate/fill_form`;
`ops-recorder.query/stats`; `pal.route/consensus/debate/models`;
`openfang.introspect_hands/agent_run_status`; `tensorzero.model_catalog/batch_inference`;
`governance.explain_decision`; `beads.blocked/graph/deps/search/stats`;
`recodergit.symbol_search/find_references/call_graph/definition`;
`dmux.layout_presets/panes_list/panes_create/layout_apply`;
`tmux.list_sessions/list_windows/list_panes/capture_pane/server_info`; cloud/ziti
`cloud_mesh_services_list/enrollment_status/topology` + gated `cloud_mesh_enroll`;
cloud/xds `cloud_xds_snapshot/clusters/routes/listeners/endpoints`; agent-os/multica
`coordination_squad_routing/status/conflicts` + gated `coordination_request_reroute`.
Each stays truthful — a tool whose engine is down/unconfigured reports `available:false`
rather than fabricating a result, and gated tools (`cloud_mesh_enroll`,
`coordination_request_reroute`) route through the governance gate.

**LIVE + consumed by the run flow (dev + packaged where noted):** `tmux`
(dev+packaged), `governance` (dev+packaged, minus the UDS fallback rung),
`tensorzero` (**dev+packaged now** — release `.node` built + bundled behind a
fail-loud gate, real in-proc SSE + rung-3 BYOK router + embeddings edge; real turns
need BYOK/ClickHouse creds), `openfang` (**dispatchable** runtime → `in_process`
substrate; degraded on real turns without model keys), `retrieval-store`
(**embedded lance** adopted → works packaged with zero services), `colbert` (real
ColBERT MaxSim rerank on the recall-fusion + RAG path, dev), `beads` (dev+packaged —
`bin/bd` now bundled + resolved).

**LIVE but not on the launch/merge critical path:** `browser-use` (**supervised**
sidecar + real Chrome/CDP, MCP-only), `pal.plan` (in-proc MCP facet).

**DEGRADED (resolvable, missing config/creds):** `mem0` (**Gemini-default** now;
needs a `GEMINI_API_KEY` + a store), `retrieval-embed` (embeddings edge wired; needs
a provider/BYOK key), `openclaw` (run-flow bridge now **bound**; channels still need
secrets; packaged connectors symlink unverified).

**GAP — not reachable / orphaned / flag-gated:** `recodergit` (NOT bundled —
PolyForm-Noncommercial, license-excluded; dev-only, also `RECODER_CODE_GRAPH_ENABLED`-gated), `ops-recorder` (gated, no run-flow consumer),
`multica` (built + boots auth-gated but **orphaned** / unbundled), `recoder-xds`
(cloud-deferred; xDS serving), `ziti` (cloud-deferred), `dmux` (bundled;
operator-console, needs a TTY), all **python sidecars packaged** (none bundled yet).

**Fully wired backend → desktop → run-flow in BOTH dev and packaged:** now `tmux`,
`tensorzero`, `governance` (minus UDS fallback), `openfang`, `beads`, and the
embedded **lance** retrieval store. The remaining breakages are mostly the
**packaged python** hop (mem0/colbert/ops-recorder/browser-use/pal venvs are not
bundled) and, for part of the fleet, the **run-flow consumption** hop (multica
orphaned, ziti/recoder-xds cloud-deferred, ops-recorder/browser-use MCP-only, pal
multi-model `externalCall` unwired).

**Top structural gaps (fix first):**
1. **No python / venvs are bundled** — mem0, colbert, ops-recorder, browser-use, pal
   are LIVE in dev but unreachable in a packaged `.app`; collapse onto the napi rung
   or ship small binaries (§3.3).
2. **governance daemon built but not bundled** — the packaged UDS fallback rung is
   still absent (napi primary works); add the release binary to `extraResources`.
3. **multica orphaned** — built + boots but no `engines.client('multica')` caller;
   squads served by the in-memory store.
4. **openclaw / recodergit last-mile** — bridge is bound + code-graph consumer wired,
   but per-channel secrets, connector-symlink bundling, and the `RECODER_CODE_GRAPH_ENABLED`
   default still gate them.
