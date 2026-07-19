# Domain: Engines Integration (multi-language boundary)

> **Status: SHIPPED** (Phase 6, commit `52ab47305`; deepened in-dir + spawned-on-boot
> `0a1084282` / `149942e62`). Boots as 1 of 15 truthful health sources; the engines
> exercise the real `backend/engines/` surfaces. This file is the design of record,
> reconciled to what shipped — where the built surface diverged from the original plan
> (file names, route paths, public accessors, the security subject-binding), the notes
> below call it out inline.

Folder prefix: `backend/src/domains/engines/`
Owner seam: the **one governed path** every engine is reached through. This domain is
the MCP host + engine-fusion layer — it binds all first-party and vendored engines
(Rust napi in-proc, Rust/Go loopback daemons, Python stdio/HTTP sidecars, CLI binaries)
to the TS spine behind typed ports, supervises their lifecycles, reports truthful
per-engine health, and registers their tools into the interop-gated MCP host.

---

## 1. Overview

The Recoder backend is polyglot: the TS host in `backend/src/` is the spine, but the
heavy lifting is done by capability **engines** in three other delivery shapes:

| Delivery | Transport | Engines | Fusion law |
|---|---|---|---|
| **Rust napi** | in-process `.node` | openfang, tensorzero (embedded gateway), governance kernel | Native-first (default) |
| **Rust/Go daemon** | supervised loopback HTTP | colbert, ops-recorder, multica, ziti | Subprocess-second |
| **Python sidecar** | supervised stdio-MCP / loopback HTTP | mem0, browser-use, pal-mcp-server | Subprocess-second (ML only) |
| **CLI binary** | one-shot subprocess | beads/`bd`, dmux, tmux, recodergit | Subprocess |

> **TensorZero's fallback ladder lives in the `inference` domain, not here.** This domain
> ships `adapters/napi/tensorzero-napi.adapter.ts` (the shared embedded-gateway `.node` load);
> the `inference` domain binds over it and owns the degrade rungs (napi → supervised loopback →
> direct BYOK rung-3 multi-provider router) in `engine-client-napi-tier.ts` /
> `tensorzero-transport.adapter.ts` / `direct-provider.transport.ts`. There is no
> `adapters/daemon/tensorzero-loopback.adapter.ts` in this domain.

Every one of these is reached through **one** `EngineClientPort` per engine, supervised by
**one** of three supervisors (napi loader / daemon supervisor / sidecar supervisor), and
surfaced to agents through **one** interop-gated MCP host. No domain shells out ad hoc or
imports a raw engine `dist/` directly — they take a typed engine client from this domain's
public interface, or call an MCP tool through the interop host.

**Degrade-safe is the law.** Every transport degrades to a truthful `down`: a missing `.node`
(fresh checkout / unsupported arch), an unbuilt daemon binary, an absent Python venv, or a
missing CLI on `PATH` all yield `status:'down'` with a reason — never a faked `up` and never
a fabricated result. Secrets fail safe: a missing required key means the engine reports `down`.

**This domain owns the seam, not the state.** Task/run/approval/memory state stays Recoder-owned
(agent-os contracts). This domain owns: engine *clients*, engine *supervision*, engine *health*,
and the MCP *registration* wiring. Every WRITE-capable tool call still flows through the
governance gate and the interop `authorize→risk→policy→audit` chain before any process is touched.

### What this domain absorbs (moved behind the composer, not rewritten)

- `backend/src/agent-os/mcp/inproc-engines.ts` → `mcp/inproc-router.ts` (the `buildInProcEngineRouter`,
  `ENGINE_SERVERS`, `forEachInProcEngineTool`).
- `backend/src/agent-os/mcp/interop-host.ts` → `mcp/mcp-host.ts` (the `InteropHostBundle`,
  `IN_PROC_SERVERS`, PAL external registration).
- The ~25 `agent-os/mcp/*-engine.ts` tool files stay where the *owning* domain lives, but their
  **registration** is orchestrated here; the engine domain owns only its own `engines-engine.ts`.
- The daemon/napi supervisors scattered in `backend/src/conductor/` (`openfang-daemon.ts`,
  `openfang-native.ts`, `governance-daemon.ts`, `colbert-daemon.ts`, `ops-recorder-daemon.ts`) and
  `backend/src/engines/` (`tensorzero-client.ts`, `multica-client.ts`, `ziti-client.ts`) → folded
  behind this domain's adapters + supervisors (one supervisor implementation, N adapters).

---

## 2. File tree (`backend/src/domains/engines/`)

> **Shipped as ~102 files** (incl. co-located `*.test.ts`), larger than the ~44 planned
> below. The extra surface is (a) the legacy conductor/engines/gateway flat files absorbed
> DIRECTLY into the domain root rather than fully rewritten behind adapters —
> `openfang-native.ts`, `openfang-runtime.ts`, `colbert-daemon.ts`, `ops-recorder-daemon.ts`,
> `ops-recorder-adapter.ts`, `mem0-client.ts`, `multica-client.ts`, `ziti-client.ts`,
> `beads-bin.ts`, `beads-engine.ts`, `browser-use-engine.ts`, `dmux-adapter.ts`,
> `recodergit-service.ts`, `tmux-path.ts` all live at `domains/engines/*`; (b) a `github/`
> subdir (unified gh-CLI + recodergit GitHub module, `docs/modules/github.md`); (c) the
> per-daemon MCP-tool bindings under `adapters/daemon/mcp/`; and (d) more co-located tests.
> The skeleton below is the seam's core; the named-file deltas are flagged inline.

```
engines/
  index.ts                              # factory createEnginesModule() + public EnginesModule interface
  engines-module.ts                     # composer: builds supervisors, adapters, MCP host; fuses all engines
  config.ts                             # EnginesConfig slice (zod) derived from AppConfig — NO process.env
  types.ts                              # EngineId, EngineTransport, EngineDescriptor, EngineHealth, InvokeResult
  constants.ts                          # canonical engine ids + default loopback addrs + backoff caps
  health.ts                             # per-engine + aggregate HealthReport builder

  ports/
    engine-client.port.ts               # EngineClientPort<TReq,TRes> — every engine's common contract
    daemon-supervisor.port.ts           # DaemonSupervisorPort — spawn/backoff/probe loopback binaries
    sidecar-supervisor.port.ts          # SidecarSupervisorPort — Python uv-venv sidecars (stdio/HTTP)
    napi-loader.port.ts                 # NapiLoaderPort — load a .node in-proc, degrade if absent
    mcp-host.port.ts                    # McpHostPort — register/list/call over the interop gate
    engine-registry.port.ts             # EngineRegistryPort + EngineHealthRepository (persistence port)
    index.ts                            # barrel

  supervisor/
    daemon-supervisor.ts                # spawn once, wait /health 200, restart w/ backoff; loopback-only bind
    sidecar-supervisor.ts               # auth-preflight → spawn uv venv → stdio/HTTP; no-op when venv absent
    napi-loader.ts                      # require() the .node, cache, version-probe; returns null when missing
    backoff.ts                          # exponential backoff w/ jitter + cap (shared by both supervisors)
    health-prober.ts                    # HTTP /health probe + timeout + one-shot classifier (up|down|degraded)
    process-registry.ts                 # tracks all children; SIGTERM graceful shutdown on lifecycle stop
    napi-loader.test.ts
    daemon-supervisor.test.ts

  adapters/
    napi/
      openfang-napi.adapter.ts          # in-proc openfang kernel (.node): agent-engine dispatch surface
      tensorzero-napi.adapter.ts        # in-proc TensorZero EmbeddedGateway (.node): inference/feedback
      governance-napi.adapter.ts        # in-proc governance kernel (.node): decide/enforce/merkle-verify
    daemon/
      colbert-loopback.adapter.ts       # loopback ColBERT rerank daemon client
      ops-recorder-loopback.adapter.ts  # loopback ops-recorder signal-detection daemon client
      multica-loopback.adapter.ts       # loopback multica squads/assignment daemon client (Go)
      ziti-rest.adapter.ts              # loopback OpenZiti controller REST client (Go/edge-mgmt)
      daemon-adapter-base.ts            # shared loopback-daemon adapter base
      mcp/                              # per-daemon MCP-tool bindings (colbert/ops-recorder/multica/ziti)
      colbert-loopback.adapter.test.ts
      # NOTE: no tensorzero-loopback here — the TZ fallback ladder lives in domains/inference
    sidecar/
      mem0.adapter.ts                   # Python mem0 memory sidecar (loopback HTTP)
      browser-use.adapter.ts            # Python browser-use LLM-agent sidecar (loopback HTTP)
      pal-mcp.adapter.ts                # Python pal-mcp-server (stdio-MCP) — external MCP registration
    cli/
      beads.adapter.ts                  # `bd` issue-graph CLI (one-shot, cwd-scoped, degrade if absent)
      dmux.adapter.ts                   # dmux terminal-mux CLI adapter
      tmux.adapter.ts                   # tmux session CLI adapter
      recodergit.adapter.ts             # recodergit code-intel CLI/indexer adapter
    engine-health.repository.ts         # EngineHealthRepository impl (persistence QueryExecutor)

  mcp/
    mcp-host.ts                         # InteropHostBundle — interop McpHost facade + external PAL wiring
    inproc-router.ts                    # buildInProcEngineRouter + ENGINE_SERVERS + forEachInProcEngineTool
    engine-registry.ts                  # IN_PROC_SERVERS catalog + register-order + wiring-checklist guard
    engines-engine.ts                   # THIS domain's MCP tools: engine.list / engine.health / engine.restart
    engine-registry.test.ts

  routes/
    mcp-edge.routes.ts                  # the governed MCP HTTP edge + read/restart + /internal (buildMcpEdgeRouter + buildInternalEnginesRouter)
```

> **Migration location:** the SQL lives at `backend/migrations/engine_0001_registry.sql`
> (the centralized migrations dir the runner sorts lexically), NOT a domain-local
> `migrations/` subdir. It creates `engine_registry` + `engine_health_log` + `engine_restart_log`
> (schema in §4). The composer-wiring + degrade-safe-fan-out + gate-contract assertions the
> planned `__tests__/` folder held ship as co-located `*.test.ts` beside their subjects
> (`engines-module.test.ts` isn't present as a separate file; coverage is in the adapter/mcp/
> supervisor tests + `mcp/mcp-host-wiring.test.ts`, `routes/mcp-edge.routes.test.ts`).

---

## 3. Per-file responsibilities

| # | path | lang | kind | responsibility | keyExports |
|---|---|---|---|---|---|
| 1 | `index.ts` | ts | service | Pure factory + the ONE public interface for the domain. | `createEnginesModule(deps): EnginesModule`, `interface EnginesModule` |
| 2 | `engines-module.ts` | ts | service | Composer: instantiates the 3 supervisors + all adapters, builds the MCP host, wires per-engine health, exposes typed engine clients. Fail-safe: an adapter that can't load registers `down`, never throws into boot. | `class EnginesModuleImpl`, `buildEnginesModule()` |
| 3 | `config.ts` | ts | config | Zod slice of `AppConfig` for this domain (engine binary paths, loopback addrs, feature flags, PAL root dir, INTERNAL_SERVICE_KEY). No `process.env` access — receives a typed slice. | `EnginesConfig`, `enginesConfigSchema`, `sliceEnginesConfig(app)` |
| 4 | `types.ts` | ts | type | Core shared types for the seam. | `EngineId`, `EngineTransport` (`'napi'\|'daemon'\|'sidecar'\|'cli'`), `EngineDescriptor`, `EngineHealth`, `EngineStatus` (`'up'\|'down'\|'degraded'`), `InvokeResult<T>` |
| 5 | `constants.ts` | ts | config | Canonical engine ids, default loopback bind addresses (127.0.0.1 only), backoff caps, probe timeouts. | `ENGINE_IDS`, `DEFAULT_LOOPBACK`, `BACKOFF_CAP_MS`, `PROBE_TIMEOUT_MS` |
| 6 | `health.ts` | ts | service | Builds the domain `HealthReport` from every adapter's `health()`; labels `degraded:true` when any engine is `down` but the domain still serves. | `buildEnginesHealth(engines): HealthReport`, `aggregateEngineStatus()` |
| 7 | `ports/engine-client.port.ts` | ts | port | The common contract every engine adapter satisfies: identity, transport, `start/stop`, `invoke`, `health`. | `interface EngineClientPort<TReq,TRes>`, `EngineClientBase` |
| 8 | `ports/daemon-supervisor.port.ts` | ts | port | Contract for supervising a loopback binary: `ensureStarted(id)`, `stop(id)`, `health(id)`; degrade-safe when binary missing. | `interface DaemonSupervisorPort`, `DaemonSpec` |
| 9 | `ports/sidecar-supervisor.port.ts` | ts | port | Contract for Python uv-venv sidecars with pre-spawn auth-preflight; stdio-MCP or loopback HTTP; no-op when venv/torch absent. | `interface SidecarSupervisorPort`, `SidecarSpec`, `PreflightResult` |
| 10 | `ports/napi-loader.port.ts` | ts | port | Contract for loading an in-proc `.node`: returns the native module or `null` (degrade), plus a version probe. | `interface NapiLoaderPort`, `NapiModule<T>` |
| 11 | `ports/mcp-host.port.ts` | ts | port | The MCP host facade other domains consume: `listServers()`, `authorize()`, `call()` (interop-gated), `registerInProcTool()`. | `interface McpHostPort`, `HostCallOutcome` (re-export) |
| 12 | `ports/engine-registry.port.ts` | ts | port | `EngineRegistryPort` (declared-engine catalog) + `EngineHealthRepository` (persistence port for health/restart audit rows). | `interface EngineRegistryPort`, `interface EngineHealthRepository` |
| 13 | `ports/index.ts` | ts | port | Barrel re-export of all ports. | `*` |
| 14 | `supervisor/daemon-supervisor.ts` | ts | daemon | Spawn a loopback binary once, wait for `/health` 200 within `DAEMON_WAIT_MS`, restart with backoff on exit; never spread full `process.env` (only configured key + listen addr); skip-spawn when `<ENGINE>_URL` points at an external instance. Folds `openfang-daemon/governance-daemon/colbert-daemon/ops-recorder-daemon/tensorzero-client/multica-client` supervision into one impl. | `class DaemonSupervisor implements DaemonSupervisorPort` |
| 15 | `supervisor/sidecar-supervisor.ts` | ts | daemon | Wraps interop's `ExternalMcpProcessManager` for stdio-MCP sidecars + a loopback-HTTP variant; runs `auth-preflight` (venv exists, required keys present) BEFORE spawn; degrades to `down` (never fakes) when the uv venv or torch is absent. | `class SidecarSupervisor implements SidecarSupervisorPort` |
| 16 | `supervisor/napi-loader.ts` | ts | client | `require()`/`createRequire` the `.node` from resolved paths (`<ENGINE>_NAPI` env → engines/rust target), cache the module, probe its version; return `null` when absent so adapters degrade to daemon/no-op. Folds `openfang-native.ts` + the tensorzero embedded-gateway loader. | `class NapiLoader implements NapiLoaderPort`, `loadNativeAddon()` |
| 17 | `supervisor/backoff.ts` | ts | service | Pure exponential backoff with jitter + cap, shared by both process supervisors. | `nextBackoff(attempt, capMs)`, `class BackoffTracker` |
| 18 | `supervisor/health-prober.ts` | ts | service | One-shot HTTP `/health` probe with a hard timeout; classifies `up|down|degraded`; never throws (returns `down` on error). | `probeHttpHealth(url, timeoutMs)`, `classifyProbe()` |
| 19 | `supervisor/process-registry.ts` | ts | service | Tracks all spawned children; on lifecycle `stop()` sends SIGTERM then SIGKILL after grace; prevents orphan daemons. | `class ProcessRegistry`, `registerChild()`, `shutdownAll()` |
| 20 | `supervisor/napi-loader.test.ts` | ts | test | Asserts a present `.node` loads + versions; an absent one returns `null` (no throw). | — |
| 21 | `supervisor/daemon-supervisor.test.ts` | ts | test | Asserts skip-spawn on `<ENGINE>_URL`, backoff on crash, `down` when binary missing, env not leaked. | — |
| 22 | `adapters/napi/openfang-napi.adapter.ts` | ts | client | In-proc openfang kernel `.node` adapter: exposes the agent-engine dispatch surface; degrades to daemon adapter or `down`. | `class OpenfangNapiAdapter implements EngineClientPort`, `createOpenfangAdapter()` |
| 23 | `adapters/napi/tensorzero-napi.adapter.ts` | ts | client | In-proc TensorZero `EmbeddedGateway` `.node`: `inference()`/`feedback()`; falls back to `tensorzero-loopback` then `down`. | `class TensorzeroNapiAdapter implements EngineClientPort` |
| 24 | `adapters/napi/governance-napi.adapter.ts` | ts | client | In-proc governance kernel `.node`: `decide/enforce_tool/record_audit/verify_audit` + Merkle verifier; byte-interop pinned to golden vectors. Backs `@recoder/governance` facade. | `class GovernanceNapiAdapter implements EngineClientPort`, `verifyMerkle()` |
| 25 | `adapters/daemon/colbert-loopback.adapter.ts` | ts | client | Loopback ColBERT rerank daemon client (rerank passages); `down` when binary absent. | `class ColbertAdapter implements EngineClientPort` |
| 26 | `adapters/daemon/ops-recorder-loopback.adapter.ts` | ts | client | Loopback ops-recorder signal-detection daemon client. | `class OpsRecorderAdapter implements EngineClientPort` |
| 27 | `adapters/daemon/multica-loopback.adapter.ts` | ts | client | Loopback multica squads/assignment daemon (Go) — optional enrichment, not source of truth. | `class MulticaAdapter implements EngineClientPort` |
| 28 | `adapters/daemon/ziti-rest.adapter.ts` | ts | client | OpenZiti controller Edge-Management REST client (identity/enrollment); fail-safe when unconfigured. | `class ZitiAdapter implements EngineClientPort` |
| 29 | _(moved to `domains/inference`)_ | ts | client | The TZ loopback fallback is NOT here — the inference domain owns the napi→loopback→BYOK ladder (`engine-client-napi-tier.ts`). A shared `daemon-adapter-base.ts` + `adapters/daemon/mcp/*` (per-daemon MCP-tool bindings) ship in its place. | — |
| 30 | `adapters/daemon/colbert-loopback.adapter.test.ts` | ts | test | Asserts rerank round-trip + `down` when daemon missing. | — |
| 31 | `adapters/sidecar/mem0.adapter.ts` | ts | client | Python mem0 memory sidecar over loopback HTTP; degrade to `down` when venv absent. | `class Mem0Adapter implements EngineClientPort` |
| 32 | `adapters/sidecar/browser-use.adapter.ts` | ts | client | Python browser-use LLM-agent sidecar (navigate/extract/screenshot) over loopback HTTP. | `class BrowserUseAdapter implements EngineClientPort` |
| 33 | `adapters/sidecar/pal-mcp.adapter.ts` | ts | client | Python `pal-mcp-server` over stdio-MCP; registers as an EXTERNAL MCP server in the host with truthful availability. | `class PalMcpAdapter`, `buildPalRegistration()` |
| 34 | `adapters/cli/beads.adapter.ts` | ts | client | `bd` issue-graph CLI adapter (one-shot, cwd-scoped, JSON out); degrade when `bd` not on PATH. | `class BeadsAdapter implements EngineClientPort` |
| 35 | `adapters/cli/dmux.adapter.ts` | ts | client | dmux terminal-mux CLI adapter. | `class DmuxAdapter implements EngineClientPort` |
| 36 | `adapters/cli/tmux.adapter.ts` | ts | client | tmux session CLI adapter (list/new/send-keys). | `class TmuxAdapter implements EngineClientPort` |
| 37 | `adapters/cli/recodergit.adapter.ts` | ts | client | recodergit code-intel CLI/indexer adapter (code-graph index lifecycle). | `class RecodergitAdapter implements EngineClientPort` |
| 38 | `adapters/engine-health.repository.ts` | ts | repository | Concrete `EngineHealthRepository` over the persistence `QueryExecutor` — writes health snapshots + restart audit rows with `:param` SQL. | `class PgEngineHealthRepository implements EngineHealthRepository` |
| 39 | `mcp/mcp-host.ts` | ts | service | The `InteropHostBundle`: builds the interop `McpHost` facade, seeds `IN_PROC_SERVERS`, registers the external PAL sidecar, delegates in-proc handlers to the engine router. Every `.call()` runs authorize→risk→execute→audit. | `class InteropHostBundle implements McpHostPort`, `getInteropHostBundle()` |
| 40 | `mcp/inproc-router.ts` | ts | service | `buildInProcEngineRouter(repo, opts)` — the real `McpToolRouter` populated with all ~30 engine tool registrations; `ENGINE_SERVERS`, `forEachInProcEngineTool`. | `buildInProcEngineRouter()`, `ENGINE_SERVERS`, `forEachInProcEngineTool()` |
| 41 | `mcp/engine-registry.ts` | ts | service | The `IN_PROC_SERVERS` catalog + register order + a wiring-checklist guard (asserts every `ENGINE_SERVERS` server is in `IN_PROC_SERVERS` and has a handler — fails boot loudly if a new engine skips a step). | `IN_PROC_SERVERS`, `assertWiringComplete()` |
| 42 | `mcp/engines-engine.ts` | ts | route | THIS domain's own MCP tools: `engine.list` (descriptors+health), `engine.health` (one engine), `engine.restart` (governance-gated write). Follows the ToolRouter shape. | `registerEnginesMcpTools(router, deps)`, `enginesMcpServer` |
| 43 | `mcp/engine-registry.test.ts` | ts | test | Asserts `assertWiringComplete()` catches a server registered in one list but not the other / missing handler. | — |
| 44 | `routes/mcp-edge.routes.ts` | ts | route | HTTP edges (see §5); all pass the interop chain; writes governance-gated; `/internal/*` key-gated. Also binds tenant identity to the authenticated principal (see §5 security note). | `buildMcpEdgeRouter(deps): Router`, `buildInternalEnginesRouter(deps): Router` |
| 45 | `backend/migrations/engine_0001_registry.sql` | sql | migration | Creates `engine_registry`, `engine_health_log`, `engine_restart_log` (centralized migrations dir, not domain-local). | — |
| 46 | `mcp/mcp-host-wiring.test.ts` + `routes/mcp-edge.routes.test.ts` | ts | test | Composer/host wiring + degrade-safe fan-out; contract: no in-proc tool executes without authorize→risk→audit; unregistered handler throws truthfully; tenant-binding on the edge. | — |

> The table above is the planned core seam (~47 entries). **The shipped domain is ~102 files**
> — the extra surface is the absorbed legacy flat files, the `github/` module, the
> `adapters/daemon/mcp/` per-daemon tool bindings, and more co-located tests (see the §2 note).
> This is the production surface, not a skeleton.

### 3.1 Shipped engine MCP tools — this program (~54 new, all real-bound)

> **Status: SHIPPED** (branch `feat/enterprise-s0-p0`). Each tool below is **real-bound**
> (backed by its engine adapter / daemon / CLI, never a stub), **degrade-truthful** (an absent
> `.node`/binary/venv yields a truthful `down`, not a faked result), and — for the
> subject-bearing tools — **caller-bound**: the acting principal/tenant is derived from the
> authenticated `Principal` on the edge, never from `args`/`body.actor` (see §5
> subject-binding). WRITE-capable tools are flagged **(gated)** and pass the full interop
> `authorize→risk→execute→audit` chain. These extend the ~30 registrations enumerated by
> `mcp/inproc-router.ts` (`ENGINE_SERVERS` / `forEachInProcEngineTool`) — the total in-proc
> tool surface is now ~54 larger.

| engine | transport | new shipped MCP tools | notes |
|---|---|---|---|
| **mem0** | sidecar | `mem0.recall`, `mem0.relations`, `mem0.stats` | Read-side memory recall + relation graph + store stats; subject-bound to the caller's tenant. |
| **colbert** | daemon | `colbert.rerank_batch`, `colbert.collections.list`, `colbert.collections.stats`, `colbert.collections.create` (gated), `colbert.collections.drop` (gated) | Batched rerank + late-interaction collection lifecycle; create/drop are governed writes. |
| **browser-use** | sidecar | `browser.extract_structured`, `browser.run_task`, `browser.screenshot_annotate`, `browser.fill_form` (gated) | Structured extraction, autonomous task run, annotated screenshots, form fill; `run_task`/`fill_form` are gated writes. |
| **ops-recorder** | daemon | `ops-recorder.query`, `ops-recorder.stats` | Query recorded signal events + aggregate detection stats. |
| **pal** | sidecar (stdio-MCP) | `pal.route`, `pal.consensus`, `pal.debate`, `pal.models` | Model routing decision, multi-model consensus, debate orchestration, catalog of routable models. |
| **openfang** | napi | `openfang.introspect_hands`, `openfang.agent_run_status` | Introspect the kernel's registered hands + read agent-run status. |
| **tensorzero** | napi | `tensorzero.model_catalog`, `tensorzero.batch_inference` (gated) | Embedded-gateway model catalog + batched inference; `batch_inference` is a gated write. |
| **governance** | napi | `governance.explain_decision` | Read-side explanation of a governance-kernel decision (byte-interop with the audit chain). |
| **beads** | cli | `beads.blocked`, `beads.graph`, `beads.deps`, `beads.search`, `beads.stats` | Blocked-issue view, issue graph, dependency edges, search, and graph stats over the `bd` layer. |
| **recodergit** | cli | `recodergit.symbol_search`, `recodergit.find_references`, `recodergit.call_graph`, `recodergit.definition` | Code-intel: symbol search, references, call graph, go-to-definition over the code-graph index. |
| **dmux** | cli | `dmux.layout_presets`, `dmux.panes_list`, `dmux.panes_create` (gated), `dmux.layout_apply` (gated) | Terminal-mux layout presets + pane introspection; create/apply are gated writes. |
| **tmux** | cli | `tmux.list_sessions`, `tmux.list_windows`, `tmux.list_panes`, `tmux.capture_pane`, `tmux.server_info` | Read-side session/window/pane inventory + pane capture + server info. |
| **ziti** (cloud) | daemon | `cloud_mesh_services_list`, `cloud_mesh_enrollment_status`, `cloud_mesh_topology`, `cloud_mesh_enroll` (gated) | OpenZiti mesh service list, enrollment status, topology; `enroll` is a governed write. |
| **recoder-xds** (cloud) | daemon | `cloud_xds_snapshot`, `cloud_xds_clusters`, `cloud_xds_routes`, `cloud_xds_listeners`, `cloud_xds_endpoints` | xDS control-plane read surface: full snapshot + per-resource clusters/routes/listeners/endpoints. |
| **multica** (agent-os) | daemon | `coordination_squad_routing`, `coordination_status`, `coordination_conflicts`, `coordination_request_reroute` (gated) | Squad routing view, coordination status, conflict detection; `request_reroute` is a gated write. |

> The **cloud** (ziti / recoder-xds) and **agent-os** (multica) tools are registered from their
> owning domains but reach their engine through this domain's daemon adapters
> (`adapters/daemon/{ziti-rest,multica-loopback}.adapter.ts` + the recoder-xds daemon), and are
> governed through the same MCP host — they are listed here because the engine binding lives here.

---

## 4. Database schema

This domain owns a **small operational registry** (not control-plane state). All access goes
through `domains/persistence` via the `EngineHealthRepository` port with parameterized `:param`
SQL and app-layer scoping. No Supabase RLS.

```sql
-- migrations/NNNN_engine_registry.sql

-- Declared engines + their transport + last-known binding (the seam catalog).
CREATE TABLE IF NOT EXISTS engine_registry (
  engine_id       TEXT PRIMARY KEY,                    -- 'openfang','tensorzero','governance','colbert',...
  transport       TEXT NOT NULL CHECK (transport IN ('napi','daemon','sidecar','cli')),
  binding_path    TEXT,                                -- resolved .node / binary / venv / CLI path (nullable)
  version         TEXT,                                -- probed version string when available
  last_status     TEXT NOT NULL DEFAULT 'down' CHECK (last_status IN ('up','down','degraded')),
  last_reason     TEXT,                                -- truthful reason when down/degraded
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Health snapshots (bounded audit trail; prune by retention job).
CREATE TABLE IF NOT EXISTS engine_health_log (
  id              BIGSERIAL PRIMARY KEY,
  engine_id       TEXT NOT NULL REFERENCES engine_registry(engine_id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('up','down','degraded')),
  reason          TEXT,
  probe_ms        INTEGER,                             -- probe latency
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_engine_health_log_engine_time
  ON engine_health_log (engine_id, observed_at DESC);

-- Restart audit (a restart is a governed write; record who/why/outcome).
CREATE TABLE IF NOT EXISTS engine_restart_log (
  id              BIGSERIAL PRIMARY KEY,
  engine_id       TEXT NOT NULL REFERENCES engine_registry(engine_id) ON DELETE CASCADE,
  requested_by    TEXT NOT NULL,                       -- user_id / agent id from Session
  reason          TEXT,
  outcome         TEXT NOT NULL CHECK (outcome IN ('restarted','skipped','failed')),
  audit_ref       TEXT,                                -- governance audit chain ref (Merkle)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_engine_restart_log_engine_time
  ON engine_restart_log (engine_id, created_at DESC);
```

---

## 5. HTTP / MCP edges

The domain router mounts at the `/api/mcp` base (bootstrap `DOMAIN_REGISTRY.engines.mountBase`),
plus an `INTERNAL_SERVICE_KEY`-gated worker router at `/internal/engines`. Every tool call carries
the authenticated `Principal` and passes the interop `authorize→risk→execute→audit` chain via
`host.call()` — the edge NEVER executes a handler itself. Responses use
`sendSuccess`/`sendError(createError(code,msg))`; gate outcomes ride a 200 envelope whose
`data.status` carries the truthful decision (`completed`/`denied`/`needs_approval`/`failed`).

> The per-engine **list + health** surface ships as **MCP tools** (`engine.list` / `engine.health`
> in `mcp/engines-engine.ts`), not standalone REST routes — the shipped router has no
> `GET /api/agent-os/engines`. The `/api/mcp` edge below is the governed wire the agents' stdio
> bridge (`mcp/recoder-capability-tools.cjs`) calls.

| method | path | auth | gate | purpose |
|---|---|---|---|---|
| GET | `/api/mcp/servers` | principal | interop read | List every MCP server (in-proc + external) from the gated registry with health. |
| POST | `/api/mcp/tools/:server/:tool/call` | mutating principal | full interop `authorize→risk→execute→audit` | The bridge's contract — governed tool call, delegates to `host.call()`. |
| POST | `/api/mcp/call` | mutating principal | full interop `authorize→risk→execute→audit` | Same governed call, `{ server, tool, actor?, args? }` in the body. |
| POST | `/api/mcp/engines/:id/restart` | principal + `requireAdmin` | admin/internal write | Restart a supervised daemon/sidecar; records `engine_restart_log`. napi/CLI engines return a truthful `skipped` ("not restartable"). |
| GET | `/internal/engines/health` | `INTERNAL_SERVICE_KEY` (`requireInternal`) | internal | Worker-to-backend aggregate engine health (supervision loop). |

**SECURITY — tenant subject-binding (cross-tenant class closed).** The gated call edges do NOT
trust caller-supplied identity in `args`/`actor`. Before `host.call()`, `bindTenantIdentity()`
OVERRIDES `args.userId` with the authenticated `principal.userId` (a caller claiming a DIFFERENT
`userId` is rejected `403` unless it carries an admin/internal scope), and the acting `actor.agentId`
+ the edge-bound `McpToolCaller` (`userId`/`orgId`/`scopes`) are derived ONLY from the authenticated
principal — never from `body.actor.agentId`. This closed the systemic cross-tenant hole in the
subject-bearing MCP tools (memory/cloud/billing/identity).

Error codes reused (no new codes): `SERVICE_UNAVAILABLE` (engine down / not restartable),
`AUTHZ_PROJECT_ACCESS_DENIED` (cross-tenant claim / caller lacks scope), `NOT_FOUND`
(unknown server / engine), `VALIDATION_ERROR` (bad body). All inbound bodies validated with zod
at the boundary.

---

## 6. Interfaces

### Exposed to other domains (this domain's public surface)

- **`EnginesModule`** (`index.ts`) — the shipped surface is a single generic engine accessor plus
  a few named ones: `client(id): EngineClientPort | null`, `endpoint(id): string | null`
  (live loopback base URL), `tensorzero(): EngineClientPort | null` (the shared `.node` the
  inference napi tier binds over — CONFLICT #8-safe), `github(): GithubModule`,
  `registry(): EngineRegistryPort`, `host(): McpHostPort`,
  `registerModuleTools(serverId, tools)` / `registerDomainTools(serverId, tools)` (collision-safe
  host bridge for domains that expose `mcp()`), `mcp(): McpToolRegistration[]`,
  `routes()` / `internalRoutes(): Router`, `listHealth(): Promise<EngineHealth[]>`,
  `health(): Promise<ComponentHealth>`, `start()`/`stop()`. (There are no per-engine
  `openfang()`/`colbert()`/`mem0()`/… accessors — use `client(id)`.)
- **`McpHostPort`** (`ports/mcp-host.port.ts`) — consumed by `interop`/`agent-os` edges + every
  domain that exposes MCP tools (the ToolRouter registration surface).
- **`EngineClientPort<TReq,TRes>`** — the shape `inference`, `memory`, `conductor`, `governance`,
  `retrieval` domains take when they need a raw engine (never importing an engine dist directly).
- **`EngineRegistryPort`** — the declared-engine catalog other domains read for capability discovery.

### Consumed from other domains (the seams this domain wires to)

- `AppConfig` (bootstrap) → `sliceEnginesConfig()`.
- `Session` (identity) → carried on every edge + restart authorization.
- `GovernanceGate.decide()` (governance) → gates the restart write; `@recoder/governance` facade is
  itself backed by this domain's `governance-napi.adapter.ts` (byte-interop).
- `InteropChain` / `@recoder/interop` `McpHost` (interop) → the gate every MCP call passes.
- `QueryExecutor` (persistence) → backs `EngineHealthRepository`.
- `@recoder/agent-mcp` (ToolRouter + server registrations), `@recoder/agent-events` (RunEvent for
  restart/health events), `@recoder/logger`.

### Load-bearing napi/daemon/sidecar deps

- napi `.node`: `backend/engines/rust/{openfang,tensorzero,recoder-governance}` (compiled addons).
- daemons: `backend/engines/py/{colbert,ops-recorder}` (loopback), `apps/desktop/server/engines/{multica,ziti}`.
- sidecars: `backend/engines/py/{mem0,browser-use,pal-mcp-server}` (uv venvs).
- CLI: `bd`/beads, `apps/desktop/engines/{dmux,recodergit}`, system `tmux`.

---

## 7. Reuse vs new

**REUSE (fold behind composer, do NOT rewrite):**
- `backend/src/agent-os/mcp/inproc-engines.ts` → `mcp/inproc-router.ts` verbatim logic
  (`buildInProcEngineRouter`, `ENGINE_SERVERS`, `forEachInProcEngineTool`).
- `backend/src/agent-os/mcp/interop-host.ts` → `mcp/mcp-host.ts` (`InteropHostBundle`, `IN_PROC_SERVERS`).
- The ~25 `agent-os/mcp/*-engine.ts` tool files — registration orchestrated here.
- `backend/src/conductor/{openfang-daemon,openfang-native,governance-daemon,colbert-daemon,ops-recorder-daemon}.ts`
  → collapsed into the ONE `daemon-supervisor.ts` / `napi-loader.ts` + thin adapters.
- `backend/src/engines/{tensorzero-client,multica-client,ziti-client}.ts` → daemon adapters.
- `backend/src/gateway/tensorzero-client.ts` → `adapters/napi/tensorzero-napi.adapter.ts` (the shared
  `.node`); the loopback + BYOK fallback rungs landed in `domains/inference`, not here.

**REUSE `packages/*` contracts:** `@recoder/interop` (`McpHost`, `ExternalMcpProcessManager`,
`buildPalServerConfig`, `palServerAvailability`), `@recoder/agent-mcp` (`McpToolRouter`,
`McpRegistry`, all `*McpServer` registrations, `register*McpTools`), `@recoder/governance`
(gate facade + Merkle verifier — byte-interop with the napi kernel), `@recoder/agent-events`
(`RunEvent`), `@recoder/logger`, `@recoder/utils`.

**REUSE engines in place (never copy):** `backend/engines/rust/{openfang,tensorzero,recoder-governance}`,
`backend/engines/py/{mem0,colbert,browser-use,ops-recorder,pal-mcp-server}`,
`apps/desktop/engines/{tmux,dmux,recodergit}`, `apps/desktop/server/engines/{beads,multica,ziti,recoder-xds}`.

**NEW (this domain writes):** the three supervisors (`daemon-supervisor`, `sidecar-supervisor`,
`napi-loader`) as ONE implementation each (replacing N scattered copies), the common
`EngineClientPort` + thin per-engine adapters over it, `engines-engine.ts` MCP tools,
`engine-registry.ts` wiring-checklist guard, `engine-health.repository.ts`, the SQL migration,
and `engines.routes.ts`.

**REUSE verification scripts:** `pnpm {format,check-types,test}`, `pnpm test:contracts:agent-os`,
`pnpm test:evals:agent-os`, `verify-byok-e2e.sh` (touches the tensorzero/LLM engine path).

---

## 8. Implementation order

1. **Ports + types + config** (`ports/*`, `types.ts`, `config.ts`, `constants.ts`) — the seam contracts first, so adapters and consumers compile against interfaces.
2. **Supervisors** (`supervisor/{backoff,health-prober,process-registry,napi-loader,daemon-supervisor,sidecar-supervisor}.ts`) + their two tests — the reusable process machinery, folding the scattered conductor daemons into one impl each.
3. **Persistence** (`migrations/NNNN_engine_registry.sql`, `adapters/engine-health.repository.ts`) — health/restart audit backing.
4. **Adapters** in degrade priority: `napi/*` (default path) → `daemon/*` (fallback + loopback-only engines) → `sidecar/*` (ML) → `cli/*`. Each is thin over a supervisor + `EngineClientPort`; each ships a `down`-when-absent path. Add `colbert.adapter.test.ts`.
5. **MCP host** (`mcp/inproc-router.ts` ← move `inproc-engines.ts`; `mcp/mcp-host.ts` ← move `interop-host.ts`; `mcp/engine-registry.ts` wiring guard; `mcp/engines-engine.ts` own tools) + `engine-registry.test.ts` + `mcp-host.contract.test.ts`.
6. **Composer + health** (`engines-module.ts`, `health.ts`, `index.ts`) — fuse everything behind `EnginesModule`; register in `bootstrap/container.ts` following the `agent-os/service-container.ts` pattern; wire the wiring-checklist guard to fail boot loudly on a mis-registered engine.
7. **Edges** (`routes/engines.routes.ts`) — mount via the `edge` domain; restart behind governance gate; `/internal/*` key-gated.
8. **Verify:** `pnpm check-types` → `pnpm test` (domain) → `pnpm test:contracts:agent-os` → `verify-byok-e2e.sh` for the LLM engine path. Confirm every engine reports truthful `up|down` with `RECODER_*` binaries absent (the fresh-checkout degrade case).
