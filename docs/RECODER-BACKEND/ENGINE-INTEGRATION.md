# Engine Integration — the canonical engine → backend → desktop → run-flow map

> **Scope.** This is the single source of truth for how Recoder's backend engines
> are wired: where their OSS lives, how the backend reaches them (transport +
> adapter), how they get into the **desktop** app (dev vs packaged), whether the
> **conductor run flow** actually consumes them, their **truthful current state**,
> and the concrete **target** to make every engine work end-to-end.
>
> **Product framing.** Recoder is the "Cursor of AI agents" (conductor.build
> shape). There is **ONE project: `apps/desktop`** = wave shell + cockpit +
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
  `ELECTRON_RUN_AS_NODE`. It can **only** see what `extraResources` copied. Today
  that is: `backend/dist` + `backend/node_modules`, the pinned **tmux** binary,
  **four** Rust `.node` addons (governance, lance, openfang, tensorzero-release),
  and the cockpit SPA. **No python, no venvs, no Go binaries, no beads/recodergit/dmux.**
  Resolvers that walk up the repo root find nothing → those engines go truthfully `down`.

---

## 2. Engine matrix

Legend for **State**: **LIVE** = wired + resolvable + consumed; **DEGRADED** =
resolvable but missing config/creds/consumer; **GAP** = not reachable (not bundled
/ not spawned / orphaned). "dev / packaged" split where they differ.

| Engine (domain) | OSS dir + lang | Backend transport + adapter | Desktop reach (dev / packaged) | Run-flow use | State (truthful) | Target |
|---|---|---|---|---|---|---|
| **tensorzero** (INFERENCE) | `backend/engines/rust/tensorzero` — ~30-crate Rust workspace; `tensorzero-gateway-napi` exposes `EmbeddedGateway.boot/inference/feedback` | **napi in-proc**; `adapters/napi/tensorzero-napi.adapter.ts` via `NapiLoader`; eager `EmbeddedGateway.boot(configFile, clickhouseUrl)`; health up only when `.node`+boot ok | dev: **debug** `.node` resolves, gateway boots / **packaged: GAP** — builder copies from `target/release/*.node` which **does not exist** (only 136 MB debug) → addon absent → falls to loopback (endpoint `null`) | Both paths: (a) CLI runtimes get a base-URL at `/api/gateway/v1` so agent tokens are metered; (b) openfang kernel routes model calls through the same `.node`. MCP: `tensorzero.*` | **DEV = LIVE-needs-creds; PACKAGED = GAP** (no release build) | Build `--release -p tensorzero-gateway-napi`; make it a CI packaging gate; thread BYOK + optional ClickHouse into boot; verify `native/` has the `.node` in the installed app |
| **recoder-governance** (GOVERNANCE) | `backend/engines/rust/recoder-governance` — kernel/audit/approval/ipc/daemon/napi Rust crates; both `-napi.node` **and** `-daemon` release-built | **napi → daemon(UDS) → ts floor → synthetic DENY**; `adapters/napi/governance-napi.adapter.ts` (thin re-expose) + `domains/governance/adapters/kernel-ladder.adapter.ts` | dev: napi rung engages (release `.node` present, `hasNapiKernel()` true) / **packaged: LIVE-primary** — `.node` bundled → napi loads; **daemon fallback GAP** (binary not in `extraResources`, repo-relative resolver) | **Every write mutation** gated: `governance-gate.port.ts` → `decide → risk → audit`, fail-closed synthetic deny, Merkle seal after write. Desktop `RECODER_SOLO_MODE=1` = click-is-approval. MCP: `governance.*` | **LIVE (dev + packaged), fail-closed on all rungs** — only the packaged UDS fallback is missing | Bundle the daemon binary + packaged resolver; keep both release artifacts in CI; ensure `INTERNAL_SERVICE_KEY` reaches it; **fix stale comment** `napi-kernel.adapter.ts:34-36` |
| **openfang** (AGENT-ENGINE) | `backend/engines/rust/openfang` — full Rust agent kernel (wasmtime+sqlite+skills+hands) → `openfang_napi.node` (29 MB release **present**) | **napi in-proc**; `adapters/napi/openfang-napi.adapter.ts`; binds addon eagerly, **defers** `OpenfangEngine.boot(configPath)` to first use; ~51 `#[napi]` ops | dev: resolves from `target/release` / **packaged: COMPLETE** — `.node` bundled → `native/openfang_napi.node`, `NapiLoader` resolves `resourcesPath` first | **CONSUMED** as `in_process` substrate: `openfang-runtime.adapter.ts` registered `substrates:[cliSub, openfangSub]`; provisions worktree, runs one agent turn, feeds the same run-tailer | **LIVE (addon loads + substrate wired); DEGRADED on real turns** — no `openfang.toml`/keys injected so `boot` has no config | Inject `configPath` + BYOK/tensorzero keys into desktop env; expose `runtime='openfang'` choice; e2e a scratch-repo run |
| **beads / bd** (MEMORY/issue-graph) | `apps/desktop/server/engines/beads` — Go + Dolt; owned `bin/bd` built (185 MB) | **CLI**; `adapters/cli/beads.adapter.ts` → `resolveBeadsBin` (`BEADS_BIN` → owned build → PATH `bd`); full `beads.*` MCP tools | dev: **LIVE** (owned bin resolves) / **packaged: GAP** — `apps/desktop/server/engines/beads` not bundled → falls to PATH `bd` (may be the DB-incompatible 0.59) | **CONSUMED**: `createConductorCodeIntel({ beads })` → `issue-graph.adapter.ts` tracks each workspace/run as a bd node; recall-fusion source; cross-agent memory fabric | **LIVE dev / GAP packaged** + version-skew risk | Bundle `bin/bd` + packaged resolver; set `BEADS_BIN`; pin owned bd to DB-compatible build; put Dolt DB under private `DATA_DIR` |
| **mem0** (MEMORY) | `backend/engines/py/mem0` — full mem0 OSS monorepo (Python/Poetry); `.venv` **present**; FastAPI in `server/main.py` | **sidecar loopback-http** (port 8896) for get/history/update **+** in-proc `@recoder/mem0` npm path (add/search/getAll/delete); `adapters/sidecar/mem0.adapter.ts` | dev: repoRoot walk finds `.venv` → sidecar spawns / **packaged: GAP** — no `backend/engines/py` bundled, no python, no Qdrant, no embedder key | **CONSUMED via memory domain** (not the engines adapter): `brain-memory.adapter.ts` recalls mem0 ∪ beads ∪ candidates on launch, harvests a candidate wisp on completion. Engines `Mem0Adapter` = MCP tool | **DEGRADED dev** (needs Qdrant + embedder/LLM key) **/ GAP packaged** | Bundle mem0 sidecar (relocatable venv or PyInstaller); provide embedded store (reuse bundled lance `.node`) + embeddings via tensorzero napi; inject env; keep truthful down until then |
| **colbert** (MEMORY reranker) | `backend/engines/py/colbert` — Stanford ColBERT (Python); `.venv` **present**; `rerank_server.py` + `server.py` | **daemon loopback-http** (port 8893); `adapters/daemon/colbert-loopback.adapter.ts`; identity-rerank degrade | dev: venv + entrypoint resolve, `DaemonSupervisor` spawns / **packaged: GAP** — `backend/engines/py` not bundled | **CONSUMED**: reranks recall-fusion set + retrieval RAG passages; any failure → `identityRerank` (original order, `available:false`, never fabricated) | **DEGRADED / GAP** — needs torch+checkpoint even in dev; packaged never reranks | Replace with lighter embedded cross-encoder / tensorzero napi (avoid torch), or ship prebuilt colbert binary + packaged resolver; keep identity-order degrade |
| **retrieval — embeddings** (RETRIEVAL) | *no OSS dir* — in-proc HTTP client; `domains/memory/adapters/embedding.adapter.ts` | **in-proc HTTP** (tensorzero URL → OpenAI key → endpoint override); no subprocess | present dev+packaged (plain JS), but **no provider injected** by desktop → `provider==='none'` | `vector-foundation.search` embeds query for `brain-memory` repo-context block; no provider → block skipped truthfully | **DEGRADED / GAP** — no embedder wired | Route embeddings through the bundled tensorzero napi (zero external creds) or pass BYOK `embedEndpoint`; surface state in cockpit |
| **retrieval — vector store** (RETRIEVAL) | *no OSS dir* — Qdrant REST client `qdrant.adapter.ts`; **bundled-but-unused** `lance_npm_bindings.node` (`native/`) | **HTTP REST** to `QDRANT_URL`; `store.configured` true only when set | Qdrant client present dev+packaged, but **no Qdrant server bundled/spawned, no URL injected** → `configured=false`; lance `.node` copied but **dead weight** | Underpins retrieval RAG + mem0-OSS store; no Qdrant → both off (brain still returns raw prompt) | **GAP packaged** (no local Qdrant); works only vs external Qdrant | Adopt the **already-bundled lance napi** as embedded `VectorStorePort` when `QDRANT_URL` unset → retrieval + mem0-OSS work packaged with zero services |
| **tmux** (TERMINAL) | `apps/desktop/engines/tmux` — vendored C; **arm64 binary built** (~1 MB) | **CLI**; `adapters/cli/tmux.adapter.ts` **+** the run-flow substrate `conductor/adapters/tmux-substrate.adapter.ts` (`tmux_worktree`) | dev: `CONDUCTOR_TMUX_BIN` injected / **packaged: BUNDLED** — builder copies `../engines/tmux/tmux`; resolver adds `resourcesPath` candidate | **CRITICAL PATH** — default `ConductorSubstrate`: `git worktree add` + `new-session`; `capture`/`exitCode`/`teardown`; sessions `recoder-<id>` | **LIVE (dev + packaged)** — the one engine fully wired both modes | Add x64/universal + Linux/Windows tmux builds per target; optionally converge the redundant engines `TmuxAdapter` with the substrate |
| **dmux** (TERMINAL, optional) | `apps/desktop/engines/dmux` — TS Ink/React TUI; `dist` built | **CLI**; `adapters/cli/dmux.adapter.ts`; pins to conductor tmux via `DMUX_TMUX_BIN` | dev: vendored launcher resolves / **packaged: GAP** — not bundled; needs a real TTY | **Never on critical path** — operator console only (detached TUI, attach hint, session list) | **DEV-ONLY / degrade-by-design** (down when absent = expected) | Optional: bundle `dist`+launcher + `CONDUCTOR_DMUX_BIN`; surface attach hint in cockpit; else leave dev-only |
| **recodergit** (GITHUB) | `apps/desktop/engines/recodergit` — TS+C code-knowledge-graph; nested `dist` built | **CLI** (+ optional `mcp --http`); `adapters/cli/recodergit.adapter.ts`; gated by `RECODER_CODE_GRAPH_ENABLED` (default **OFF**) | dev: dist resolves but **flag off, desktop doesn't set it** / **packaged: GAP** — dist not bundled | **WIRED but gated**: `createConductorCodeIntel({ recodergit })` → `code-intel.adapter.ts indexRepo()` (`op:'index'`); flag off → truthful SKIP; PR review/open/comment **not** consumed yet | **GAP** (disabled by default + unbundled) | Set `RECODER_CODE_GRAPH_ENABLED=1` in desktop env; bundle dist + `RECODERGIT_BIN`; verify graph store; extend adapter to full GitHub interface (gh CLI) |
| **pal-mcp-server** (COMMUNICATION) | `backend/engines/py/pal-mcp-server` — Python multi-model MCP (chat/consensus/planner/clink); **`.pal_venv` MISSING** | **stdio-MCP sidecar** `adapters/sidecar/pal-mcp.adapter.ts` **+** in-proc `pal.plan` (pure TS `@recoder/pal`, deny-biased) | dev: sidecar can't spawn (no venv) / **packaged: HARD GAP** — no py bundled; only in-proc `pal.plan` survives | **PARTIAL**: `pal.plan` is an MCP tool (governed plan facet). Multi-model tools **not** consumed; `externalCall` host transport **not wired** → invoke returns `{ok:false,'host transport not wired'}` | **SPLIT: pal.plan LIVE / multi-model DOWN** | Build `.pal_venv`; wire `externalCall` into `PalMcpAdapterDeps`; inject provider keys; bundle for packaged; consume consensus/planner in the brain |
| **ops-recorder work-signals** (SIGNALS) | `backend/engines/py/ops-recorder/work-signals` — Python FastAPI stuck-work detector; `.venv` **present** | **daemon loopback-http** (port 8894); `adapters/daemon/ops-recorder-loopback.adapter.ts`; **auth-preflight** — keyless shell 503s → returns null (never spawns useless shell) | dev: spawns only if `OPS_RECORDER_API_KEY`/`AUTH_DISABLED` injected (desktop injects neither) / **packaged: HARD GAP** — no py bundled | **NOT consumed by run flow** — observability side channel; `OpsRecorderClient` reads signals for `/health/full` (baseUrl `null` → down) | **GAP / DEGRADED** — gated on key, no consumer | Inject `OPS_RECORDER_AUTH_DISABLED=1`; point observability at loopback; GitHub/Linear creds for detectors; bundle for packaged; optionally feed stuck-work → suggested runs |
| **browser-use** (BROWSING) | `backend/engines/py/browser-use` — Python sidecar; `.venv` present + owned TS `@recoder/agent-browser` | **sidecar** (port 8897) `adapters/sidecar/browser-use.adapter.ts`; HTTP driver when `BROWSER_USE_URL` set else lazy puppeteer | dev: sidecar spawns if venv deps present / **packaged: GAP** — no py, no puppeteer/chromium, no `BROWSER_USE_URL` | **NOT consumed by run flow** — MCP-only: `browser.navigate/extract/screenshot` behind interop gate | **DEGRADED dev / GAP packaged** — truthful down when no URL + no puppeteer | Pick a packaged transport (cloud URL / bundle puppeteer+chromium / bundle venv); register binder into the conductor MCP host; preflight venv deps |
| **multica** (SQUADS) | `apps/desktop/server/engines/multica` — Go leader-routed squads; `server/bin/server` (46 MB) built | **daemon loopback-http**; `adapters/daemon/multica-loopback.adapter.ts`; `squads.list/get/assign` | dev: `ensureMulticaServer` finds+spawns repo binary / **packaged: GAP** — Go binary not bundled, `README.md` repo probe fails | **NOT consumed** — no `engines.client('multica')` caller; squads served by separate `InMemorySquadStore` ("ported from multica") | **GAP** — built + registered but **orphaned**; packaged binary missing | Bundle the Go binary + packaged candidate; route squad `assign` through `engines.client('multica')`; back store with Postgres `0003-squads.sql` |
| **ziti** (NETWORKING) | `apps/desktop/server/engines/ziti` — OpenZiti Go tree (vendored bin **inert**) | **externally-managed REST** (Edge Mgmt v1); `adapters/daemon/ziti-rest.adapter.ts`; start/stop no-ops; own auth health probe | dev = packaged — needs `ZITI_CONTROLLER_URL`+token (desktop has neither) → truthful down; vendored bin wired to nothing | **NOT consumed** — no caller; would provision zero-trust runner identities | **GAP (degrade-by-design)** — no controller, no consumer | Decide if single-user desktop needs a runner mesh (likely NO); if cloud runners added, wire controller + `provisionRunnerIdentity`; else mark cloud-only |
| **recoder-xds** (NETWORKING) | `apps/desktop/server/engines/recoder-xds` — Go xDS/Envoy control-plane; `bin/recoder-xds` (31 MB) built | **read-only status** (lives in CLOUD domain) `domains/cloud/adapters/xds-envoy.adapter.ts`; **never spawns**; reads `XDS_ENDPOINT` (default null) | **GAP** — nothing spawns `bin/recoder-xds`; not in `extraResources`; `XDS_ENDPOINT` unset → down both modes | **NOT consumed** — cloud mesh-diagnostics read-only surface | **GAP — cloud-deferred** (docs mark it so); truthful down | Keep cloud-deferred for desktop; if local mesh wanted, spawn on loopback + set `XDS_ENDPOINT` + bundle; report `xdsHealth` as deferred, not active |
| **openclaw** (SOCIAL) | `apps/desktop/engines/openclaw` — TS connectors `@recoder/connectors` (telegram proven; slack/signal/line/feishu/imessage/whatsapp; discord dormant); `dist` built | **in-proc dynamic import** per channel; `domains/social/adapters/openclaw-gateway.adapter.ts`; try/catch + structural guard → `ConnectorPort` or null | dev: pnpm symlink resolves / **packaged: RISK/GAP** — `@recoder/connectors` is a **symlink pointing outside** `backend/node_modules`; builder copy may not dereference → channels throw | **PARTIAL / not bridged** — `createSocialComposer` built **without** conductor/targetResolver/inference at `bootstrap/index.ts:490` → inbound can't launch a run or reply; ingest works | **DEGRADED** — channels need secrets; run-flow bridge unbound; packaged symlink unverified | Pass conductor+resolver+inference into `createSocialComposer`; add explicit `extraResources` for connectors `dist`; provision per-channel secrets + zrok; prove telegram e2e first |

---

## 3. Desktop packaging plan (`extraResources`)

### 3.1 What is bundled **today** (`electron-builder.config.cjs`)

| Bundled | Path in app |
|---|---|
| Embedded backend | `backend/dist` + `backend/node_modules` + `backend/package.json` + `backend/data-template` |
| tmux binary (arm64) | `backend/engines/tmux/tmux` |
| governance napi | `native/recoder-governance-napi.node` |
| lance vector napi | `native/lance_npm_bindings.node` (copied but **currently unused**) |
| openfang napi | `native/openfang_napi.node` |
| tensorzero napi | `native/tensorzero_gateway_napi.node` — **from `target/release/` which does not exist** ⇒ broken copy |
| cockpit SPA | `cockpit/dist` |

### 3.2 What MUST be added for a packaged app where **every** engine works

| Add | Source → dest | Unblocks | Honest hard part |
|---|---|---|---|
| **tensorzero release `.node`** | build `target/release/…napi.node` (only 136 MB **debug** exists) | INFERENCE packaged | must be a CI build gate; large native artifact |
| **governance daemon** | `…/target/release/recoder-governance-daemon` → `native/` | UDS fallback rung packaged | small; also needs packaged resolver branch |
| **beads bin** | `apps/desktop/server/engines/beads/bin/bd` → `backend/engines/beads/bin/bd` | issue-graph packaged | **185 MB** Go+Dolt binary; version-pin to DB-compatible build |
| **multica bin** | `…/multica/server/bin/server` → `backend/engines/multica` | SQUADS packaged | 46 MB; per-platform Go build |
| **recodergit dist** | `…/recodergit/recodergit/dist` (+ C dep) → resource | GITHUB code-graph packaged | native C dep must be per-platform |
| **dmux dist** (optional) | `…/dmux/dist` + launcher | operator console packaged | needs a TTY; optional |
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

- **tensorzero**: produce the **release** `.node` (CI gate); thread BYOK + optional
  ClickHouse into `boot`; verify `native/` in the installed app; wire a loopback
  fallback endpoint so inference isn't fully down if the addon is absent.
- **governance**: bundle the **daemon** binary + packaged resolver (restore the UDS
  middle rung); keep both release artifacts in CI; ensure `INTERNAL_SERVICE_KEY`
  reaches it; refresh the stale `hasNapiKernel` comment.
- **openfang**: inject `openfang.toml` config path + tensorzero/BYOK keys into the
  desktop env so `OpenfangEngine.boot` succeeds; expose `runtime='openfang'`.

### Group B — CLI engines (bundle binary + resolver + env)

- **beads**: bundle `bin/bd`, set `BEADS_BIN`, pin to DB-compatible build, drop the
  skewed PATH 0.59 from resolution, put Dolt DB under private `DATA_DIR`.
- **tmux**: cross-arch/OS builds gated per electron-builder target.
- **recodergit**: `RECODER_CODE_GRAPH_ENABLED=1` + bundle dist + `RECODERGIT_BIN`;
  extend adapter to the full GitHub interface and wire PR review into the run flow.
- **dmux**: optional bundle + attach hint.

### Group C — python sidecars (collapse to napi, or bundle small binaries)

- **retrieval store/embed**: adopt bundled **lance napi** + **tensorzero napi**
  (highest leverage — makes retrieval + mem0-OSS work packaged with no services).
- **mem0**: embedded store + embeddings via napi; small PyInstaller for the 3 REST
  ops or defer; keep truthful down until wired.
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

- **openclaw**: pass conductor+resolver+inference into `createSocialComposer`; fix
  the symlink bundling; provision secrets + zrok; prove telegram e2e.

---

## 5. Phased plan — make every engine work end-to-end (dev + packaged)

**Phase 0 — CI build gates (unblocks packaged).** Add release builds of all four
napi crates (tensorzero is the one missing) + governance daemon as *hard packaging
prerequisites*. Guard `extraResources` copies to **fail loudly** on a missing
artifact instead of silently shipping a broken app.

**Phase 1 — the run-flow core (must be LIVE packaged).** tmux (done) + governance
(bundle daemon) + beads (bundle bin + `BEADS_BIN`) + openfang (config + keys). This
is the minimum for the invisible run flow: gated worktree launch, issue tracking,
in-process substrate. **Verify:** e2e a scratch-repo run in an installed `.app` —
honest RunEvents, non-empty diff, audit chain verifies, bd node created.

**Phase 2 — inference + memory on the napi rung (no python).** tensorzero release
`.node` boots + metered ledger; **adopt lance napi as the embedded vector store**
and **tensorzero napi as the embeddings provider**; route mem0-OSS + retrieval RAG
through them. **Verify:** brain-memory prepends real repo-context + recalled memory
in a packaged run with **zero** external services.

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
an engine is live in the cockpit without evidence.

---

## 6. Truthful scorecard

**LIVE + consumed by the run flow (dev):** `tmux` (also packaged), `governance`
(also packaged, minus UDS fallback), `openfang` (loads + wired; degraded on real
turns without config), `beads` (dev only). **4 engines.**

**LIVE but not consumed by the run flow:** `pal.plan` (in-proc MCP facet only).

**DEGRADED (resolvable, missing config/creds/consumer):** `mem0` (needs
Qdrant+embedder), `colbert` (needs torch+checkpoint), `retrieval-embed` (no
provider), `tensorzero` (dev: needs BYOK), `browser-use` (needs URL/puppeteer),
`openclaw` (secrets + unbound bridge). **6 engines.**

**GAP — not reachable / orphaned / packaged-broken:** `tensorzero packaged` (no
release `.node`), `beads packaged`, `retrieval-store` (no Qdrant / lance unused),
`recodergit` (flag off + unbundled), `ops-recorder` (gated, no consumer),
`multica` (orphaned + unbundled), `recoder-xds` (cloud-deferred), `ziti`
(cloud-deferred), `dmux` (dev-only by design), all **python sidecars packaged**
(none bundled). 

**Fully wired backend → desktop → run-flow in BOTH dev and packaged: `tmux` only.**
`governance` is packaged-primary (napi) but missing its UDS fallback. Everything
else has at least one broken hop — most commonly the **packaged** hop (nothing but
tmux + 4 napi + cockpit is bundled) and, for half the fleet, the **run-flow
consumption** hop (multica, ziti, recoder-xds, ops-recorder, browser-use, and the
multi-model half of pal are registered/adjacent but not consumed by launch/merge).

**Top structural gaps (fix first):**
1. **tensorzero has no release `.node`** — packaged inference is dead; the copy is
   pointed at a nonexistent `target/release` artifact.
2. **No python / venvs / Go binaries are bundled** — mem0, colbert, ops-recorder,
   browser-use, pal, multica are all unreachable in a packaged `.app`.
3. **Retrieval store/embed run on nothing** while the **lance napi is bundled but
   unused** — the biggest quick win is adopting it (+ tensorzero embeddings).
4. **beads bin (185 MB) not bundled** → packaged run flow falls to a
   DB-incompatible PATH `bd`.
5. **Half the engines are registered but never consumed** by the run flow
   (multica orphaned, ziti/recoder-xds cloud-deferred, ops-recorder/browser-use
   MCP-only, openclaw bridge unbound, pal multi-model `externalCall` unwired).
