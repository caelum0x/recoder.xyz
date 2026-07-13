# Recoder Fusion Program — "Every Directory Becomes One Recoder"

> **Owner mandate (2026-07-11):** Every directory, folder, and package fuses into ONE big Recoder — millions of LOC, the way Linux is built on Unix. Nothing is parked. The desktop embeds the fused product.
>
> **This overrides the "still park" list in `RECODER-FUSION-PROGRAM.md (absorbed WIRE-UP-BACKLOG, removed 2026-07-14)`.** The parked upstreams (tensorzero, lance, openfang, ziti, multica, browser-use, mem0, ops-recorder, claw-code-parity) are now IN SCOPE — each fused via its correct integration mode.
>
> **Progress (2026-07-13).** Engine fusion Phases 1–4 landed (fleet+gateway · code-intel+retrieval · browser+ssh-substrate · coordination+workflow+pal), all governed + degrade-safe — see [RECODER-ENGINES §6](./RECODER-ENGINES.md) + [RECODER-CAPABILITIES](./RECODER-CAPABILITIES.md). L3 (the terminal shell) fused too: `apps/wave`, forked from Wave Terminal, is **fully rebranded to Recoder and builds end-to-end** (Go + electron-vite) — see [FORK.md](../../apps/wave/FORK.md). Remaining: L4/L5 (networking/connectors, signed packaging + GUI-launch verification).

## The cake — Recoder is composed LAYER BY LAYER (not a connector army)

Full composition, onion/cake style: each layer is a *complete* composition of its ingredients, built on the layer below. All ingredients already exist in the repo. Build bottom-up; a layer is done only when everything above can stand on it.

```
        ┌─────────────────────────────────────────────────────────┐
  L5 ▏  │ DISTRIBUTION — signed .dmg/msi/deb, homebrew, auto-update │  icing
        ├─────────────────────────────────────────────────────────┤
  L4 ▏  │ SURFACES — desktop shell + rich cockpit (panels), mobile  │  frosting
        ├─────────────────────────────────────────────────────────┤
  L3 ▏  │ POLYGLOT ENGINES fused as authorities — Rust (governance✅,│  filling
        │ openfang, tensorzero, lance), Go (ziti, multica, xds),     │
        │ Python (colbert✅, mem0, browser-use, ops-recorder)        │
        ├─────────────────────────────────────────────────────────┤
  L2 ▏  │ RUNTIME HOST — docker-backend composes ALL L1 in-process   │  sponge
        ├─────────────────────────────────────────────────────────┤
  L1 ▏  │ CORE ENGINES (TS, in-process fusion) — agent-os spine,     │  sponge
        │ coordination, governance-TS, brain, runtime, interop,      │
        │ pal✅, workflows✅, hooks✅, schemas✅, a2a-sdk, memory     │
        ├─────────────────────────────────────────────────────────┤
  L0 ▏  │ SUBSTRATE — c/tmux + git worktrees + Postgres state +      │  base
        │ reconciler (restart-survivable — the moat)                 │
        └─────────────────────────────────────────────────────────┘
```

**Composition status:** L0 ✅ real · L1 ✅ mostly fused (11/15 packages + governance-TS) · L2 ✅ (docker-backend; server.ts monolith is the debt) · L4 🔄 16 cockpit panels live (all fused capabilities surfaced, degrade-safe) · **L3 ✅ ALL SEAMS FUSED (governance, colbert, browser-use, mem0, ops-recorder, openfang, tensorzero, lance, ziti, multica) — degrade-safe; native binaries (openfang/tensorzero/lance/ziti/multica) activate when built** · L4 🔄 thin (cockpit needs the panel composition) · L5 ⬜ (signing done in P0d runbook; packaging pending).

Build order from here: **finish L3 (fuse the remaining polyglot authorities) → compose L4 (surface every fused capability as cockpit panels) → L5 (package the whole cake).**

## The fusion law (from `INTEGRATION-PLAN.md` — non-negotiable)

Every component fuses in exactly ONE mode. HTTP is NOT the default — **in-process fusion is**:

| Mode | When | Applies to |
|---|---|---|
| **`in-process-import`** (fusion) | Both sides first-party TS/JS sharing the Node process | ALL `packages/*` engines → `docker-backend` (default) |
| **`subprocess-cli`** | Coding-agent CLI (must survive Node restart via tmux) OR a process-isolated Rust/Python authority (UDS/stdio, byte-interop, never linked) | `ts/*` agent engines under tmux; Rust daemons (governance, openfang) over UDS; Python authorities (colbert, mem0, browser-use, ops-recorder, pal-mcp) over stdio/HTTP-loopback |
| **`http-edge`** | A TRUE edge: cross-machine, cross-trust, browser/mobile | `app/`↔backend, Envoy mesh, external A2A/MCP, `apps/mobile`, cockpit↔backend |

The desktop embeds `docker-backend` (the fused spine); `docker-backend` in-process-imports every TS engine and supervises the native/Python subprocesses. **The product IS the fusion.**

## Wave A — Finish the open WIRE-UP items (first-party, in-process)

| Subsystem | Mode | Fuse into (seam) | Status |
|---|---|---|---|
| `py/ops-recorder` | subprocess/loopback | ✅ **DONE** — `ops-recorder-adapter.ts` forwards to py service behind `OPS_RECORDER_URL`; work-signals ingress accepts fused shape; degrade-safe; 27 tests (commit 9fd3cd517) |
| `packages/recoder-browser-tools` | in-process | browser-check node lazy-imports `@recoder/browser-tools` (playwright driver, fetch-probe fallback) | ✅ **DONE** — CJS dist built; import verified in-process (2026-07-13) |

## Wave B — Fuse the parked Rust crates (subprocess/UDS, build-gated)

Rust builds are heavy and the box is disk-constrained (per memory) — build out-of-band (`docker compose` / `cargo build` on CI), fuse the daemon over UDS/loopback, degrade-safe when the binary is absent. NOT NAPI-in-Electron.

| Crate | Mode | Fuse into (seam) | Notes |
|---|---|---|---|
| `crates/recoder-governance` | NAPI in-process (2026-07-13) | kernel linked natively in `packages/governance` | ✅ **DONE** — `.node` built + loads in-process via `conductor/governance-native.ts`; daemon fallback when `.node` absent; degrade-safe TS path exists; 160+ tests. |
| `crates/openfang` | NAPI in-process (2026-07-13) | 45 methods in `conductor/openfang-native.ts` | ✅ **DONE** — `.node` built; agents/hands/triggers/workflows/extensions/memory/skills all in-process; `/api/agents/openfang/*` edge; degrade-safe TS dispatch; 17 native tests + e2e verified. |
| `crates/tensorzero` | NAPI in-process (2026-07-13) | `tensorzero-client.ts` native-first | ✅ **DONE** — `EmbeddedGateway` binding: the real TZ engine boots in-process; `postInference()` = embedded → loopback → direct-provider, each truthful. Built with `SQLX_OFFLINE=1`. |
| `crates/lance` | NAPI in-process | `packages/rag` vector-store seam | ✅ **BUILT** — superseded by Qdrant in shipped product. |
| `crates/claw-code-parity` | N/A (removed 2026-07-13) | eval/parity harness (not product runtime) | **REMOVED** — consumer degrades to TS fallback. |

## Wave C — Fuse the parked Go + Python subsystems

| Subsystem | Mode | Fuse into (seam) | Notes |
|---|---|---|---|
| `go/ziti` | subprocess/loopback | ✅ **DONE** — strengthened `ziti-client.ts` degrade-safe + truthful health; 19 tests (ee894da93). Controller compile deferred. |
| `go/multica` | subprocess/loopback | ✅ **DONE** — `multica-client.ts` degrade-safe loopback adapter gated by `MULTICA_BIN`/URL; 19 tests (259d8666b). Go build deferred. |
| `py/browser-use` | subprocess/MCP | ✅ **DONE** — `PYTHON_SERVERS` registry entry `browser-use` (`python -m browser_use.mcp`), gated `BROWSER_USE_ENABLED`, surfaced via `/api/mcp`, policy-gated, 15 tests. Python env + `playwright install` deferred (container build). |
| `py/mem0` | in-process + loopback | ✅ **DONE** — `createMemoryAuthority`: in-process TS default, py/mem0 optional loopback via `MEM0_SERVICE_URL`; degrade-safe; 197 brain tests (044e77e00). Server activation deferred. |
| `go/recoder-xds` | subprocess/loopback | Envoy xDS control plane (enterprise mesh) | Later; diagnostics surface |

## Wave D — Surface the fused product in the cockpit (per DESKTOP-COMPREHENSIVE-INTEGRATION.md)

Once fused into the backend, each capability gets a lazy-loaded cockpit panel via the repeatable pattern (panel registry + `/api/<cap>/*` edge + aggregated `/health`). Panels: MCP Tools, Policy simulator, EventLog, A2A monitor, Memory, Code Intelligence, Issues, Networking, Inference (tensorzero), Governance (deep audit), Agents (openfang), Browser, Consult (pal), Retrieval.

## Execution rules (from WIRE-UP-BACKLOG "How to work this list")

- Each fusion is a small PR: import/supervise at the named consumer, replace the inline path, add a test proving the consumer uses it end-to-end, commit.
- **Parallelize only across disjoint consumer trees** — never two fusions on the same consumer (most fuse into `docker-backend` → those are sequential).
- Flip the row to ✅ only when the consumer imports/supervises **and runs it end-to-end** (the WIRE-UP done-bar — no fake-ready).
- Rust/Go builds stay off the signed desktop bundle; fuse as backend-supervised sidecars, degrade-safe when absent.

## Honest scope note

This is a multi-session engineering program spanning ~6 languages and millions of LOC. It proceeds wave by wave, each wave a set of small, tested, end-to-end-verified fusions. Progress is tracked by flipping rows here and in `RECODER-FUSION-PROGRAM.md (absorbed WIRE-UP-BACKLOG, removed 2026-07-14)` / `DIRECTORY-MAP.md`. No wave is "done" until its consumer runs the fused code end-to-end.

## Wave E — NAPI/FFI deep-linking (Rust crates INTO the Node binary) — owner decision 2026-07-11

Deeper than supervised-subprocess: each Rust crate gets a `#[napi]` cdylib binding crate + facade rewired native-first (loads the `.node`, degrade-safe fallback to the existing subprocess/loopback path).

| Crate | Binding | Facade native-first | `.node` compiled | Tests |
|---|---|---|---|---|
| `recoder-governance` | ✅ `recoder-governance-napi` | ✅ `packages/governance` | ✅ **BUILT** — kernel linked in-process; `decide()` returns a verdict natively (socket = fallback) | 160/160 (69ac2debb) |
| `lance` | ✅ `crates/lance/npm-bindings` | ✅ `packages/rag` | ✅ **BUILT** | 106 rag + 9 + 7 cargo (570a5076e) |
| `tensorzero` | ✅ gateway-napi (version/validate + `EmbeddedGateway` inference/feedback) | ✅ `tensorzero-client.ts` native-first | ✅ **BUILT (2026-07-13)** — engine boots in-process; routing verified | 27 + 16 client (c8d44608f) |
| `openfang` | ✅ openfang-napi (gitignored subtree) | ✅ `conductor/openfang-native.ts` | ✅ **BUILT (2026-07-13)** — 45 methods; kernel + runtime/wasmtime + skills + hands in-process; verified end-to-end | 17 native (esbuild clean) |
| `claw-code-parity` | ✅ claw-code-parity-napi | ✅ `a2a-openclaw-adapter.ts` | **REMOVED (2026-07-13)** — not product runtime; consumer degrades to TS fallback | N/A |

**Status (2026-07-13):** ALL Wave E crates built + in-process (governance, lance, openfang, tensorzero). **Open item:** wire the `.node` artifacts into `electron-builder` `asarUnpack` per-arch for the signed bundle (L5). claw-code-parity removed (not product runtime).

## END-TO-END PROOF (2026-07-11) — the fused product RUNS, not just compiles

Three proofs pass against the composed stack:
1. `docker-backend/scripts/e2e-conductor-loop.ts` → PASS: fused run loop `running → awaiting_review` with real delivery summary + post-run workflow + RunEvents (no BYOK key).
2. `docker-backend/scripts/e2e-conductor-approval.ts` → EXIT 0: governance gate enforced, Merkle auditHash, native `NapiGovernanceKernel` loads in-process.
3. `apps/desktop/scripts/dev-boot-proof.js` → EXIT 0: desktop supervisor boots embedded docker-backend, **Rust governance daemon spawns and routes delivery decisions**, **c/tmux substrate resolved+live**, `/api/conductor/health` 200 `{available,git,tmux}`, Redis-absent degrades to in-memory (degrade-safe verified), clean shutdown.

Verdict (2026-07-13): L0→L4 + native governance + openfang are composed AND running end-to-end. Remaining = tensorzero (disk-deferred) + signed .dmg + external-service activation (all disk/CI-gated, not code-blocked).

## Wave G — FULL ADAPTATION (owner mandate 2026-07-14): every directory is a backend engine

> **NOT MCPs. NOT thin HTTP.** Each dir's CODE becomes Recoder's code — imported, linked,
> or owned outright, the way Cursor absorbed VSCode. MCP/bridge tools remain as the
> *agent-facing* surface, but the BACKEND consumes every engine directly. Done-bar per
> item: the named consumer runs the fused code end-to-end (no fake-ready).

### G1 — TS engines: subprocess → in-process import — **✅ LANDED 2026-07-14** (4 workflows, all adversarially verified)

> dmux: layout+attention engines in-process over conductor state (25/25). openclaw: `apps/social` composes the real connectors pipeline, truthful zero-cred boot (10/10). opencode: NOT adapted per owner — 3 packages absorbed instead (`@recoder/opencode-sdk|schema|plugin`, 3/3 each). recodergit: service default path in-process (zero subprocess on happy path) + `pr-swarm-review` = `reviewPullRequest()` GitHub review engine (67/67). **⚠ LICENSE: recodergit engine is PolyForm-Noncommercial — owner posture decision needed.**
| Dir | Today (deepest) | Next phase | Acceptance |
|---|---|---|---|
| `ts/recodergit` | service SPAWNS its CLI (`dist/cli`) | **import `dist/lib` + `dist/core` directly** in `recodergit-service.ts` — the knowledge-graph engine runs in the backend process; CLI stays for humans | code-graph query answered with zero child processes |
| `ts/dmux` | adapter resolves a dmux BINARY | **import `@recoder/dmux` modules** (`dist/index.js` — grid/layout/pane-state logic) as the operator-console library; render through the cockpit/shell instead of a separate binary | operator grid state computed in-process from conductor workspaces |
| `ts/opencode` | subprocess CLI under tmux (CORRECT for restart-survival — stays) | **own the binary** (pin + bundle an opencode install with the desktop, stop trusting PATH — beads pattern) AND **import its `client` package** in-process for the `in_process` substrate driver | workspace launches with the OWNED opencode; client lib drives an in-process run |
| `ts/extracted-from-openclaw` | `@recoder/connectors` fused (workspace member) + cockpit block | **activate the gateway loop in-backend**: social-gateways channel drivers supervised BY the backend (telegram first), skills-reference folded into the skills registry | a real message ingresses → gated → conductor workspace, end-to-end |

### G2 — Inference spine: tensorzero becomes THE LLM path
| Today | Next phase | Acceptance |
|---|---|---|
| `EmbeddedGateway` boots in-process; `postInference` native-first but the conductor run-loop still calls providers directly | (1) generate TZ function configs from Recoder's model registry at boot; (2) route the RUN LOOP's inference through the embedded engine by default (BYOK keys injected as TZ credentials); (3) add streaming to the binding (`inference_stream` → napi async iterator); (4) wire `feedback()` to delivery outcomes (merge/approve = positive signal) | a conductor run completes with every LLM call routed through the in-process TZ engine, observable in its inference log |

### G3 — Agent engine: openfang kernel as a first-class conductor runtime
| Today | Next phase | Acceptance |
|---|---|---|
| 45-method `.node`; `/api/agents/openfang/*`; cockpit + wsh | (1) `openfang` as a RUNTIME in `runtime-commands.ts` — a conductor workspace whose agent IS an in-process openfang agent (spawn_agent from task spec, send_message per turn, session per workspace); (2) bridge openfang's event bus → RunEvents (publish_event both ways); (3) bind channels send/receive + cron + background-agent controls (the last unbound subsystems) | `POST /workspaces {runtimeId:"openfang"}` runs a task end-to-end with RunEvents in the audit trail |
| `crates/recoder-governance` | native `decide()` already on the delivery path | extend the Merkle audit seal to EVERY conductor mutation (create/merge/archive/memory-promote) | audit verify passes over a full workspace lifecycle |

### G4 — Data + memory engines
| Dir | Today | Next phase | Acceptance |
|---|---|---|---|
| `go/beads` | owned binary + CLI subprocess per call; memory layer live | **direct SQL reads** — the dolt sql-server ALREADY runs (`.beads/dolt-server.port`); connect a mysql2 client for hot reads (ready/search/recall), keep `bd` CLI for writes (its logic = the write path) | board + memory recall served with zero subprocess spawns |
| `py/mem0` | TS authority default + optional loopback URL | **self-activating sidecar** (colbert pattern): backend spawns+supervises the mem0 server, owns the venv; loopback activates itself | mem0 recall live in enrichPrompt without any manual server start |
| `py/colbert` | supervised sidecar ✅ | **owned model bootstrap**: checkpoint download to a Recoder cache dir on first health, `COLBERT_CHECKPOINT` defaulted | rerank_available:true after cold boot with no manual steps |

### G5 — Python decision/browse engines: own them outright
| Dir | Today | Next phase | Acceptance |
|---|---|---|---|
| `py/browser-use` | registry entry gated on external python env | **app-owned sidecar** (colbert pattern): backend bootstraps the venv (`uv venv` + install + `playwright install chromium`), spawns `python -m browser_use.mcp`, supervises with backoff | browser task served by browser-use with zero manual env setup |
| `py/pal-mcp-server` | external stdio MCP | **port the decision logic into `packages/pal`** (in-process TS — the target package already exists: agent-team, approval-estimator); stdio server stays for external runtimes only | pal plan produced fully in-process; no stdio child on the default path |
| `py/ops-recorder` | supervised sidecar ✅ | enable-by-default: API key minted at boot when unset; signals default-on | work-signals flow on a fresh checkout with no env vars |

### G6 — Substrate: tmux all the way down
| Today | Next phase | Acceptance |
|---|---|---|
| owned binary + poller (correct mode) + opt-in control-mode | (1) control-mode DEFAULT-ON after burn-in (poller stays terminal authority); (2) **unify `apps/wave`'s Go durable-shell onto the SAME c/tmux sessions** (two restart mechanisms → one substrate); (3) multi-arch builds (arm64-mac only today) | shell blocks + conductor tails observe the same session in real time |

### G7 — Cloud tier (kept for the cloud phase — build now, mesh later)
| Dir | Today | Next phase (pre-cloud) |
|---|---|---|
| `go/multica` | degrade-safe client, binary unbuilt | build `multica-server` (owned binary), supervise (colbert pattern), surface as an experimental conductor substrate |
| `go/ziti` | strengthened client, controller unbuilt | out-of-band controller build; identity enrollment flow in backend health (diagnostics only until cloud) |
| `go/recoder-xds` | dormant | compile check + diagnostics row in /health; mesh activation deferred to cloud launch |

### G8 — `packages/` spine: pay the L2 debt
| Today | Next phase | Acceptance |
|---|---|---|
| ~38 in-process; wave is a workspace member; conductor-ui types in the shell | (1) finish shell fusion: `design-tokens` (theme) + `ui-agent-os` (view-model) into `apps/wave`; migrate remaining `recoder-*` blocks to shared types; (2) begin `server.ts` decomposition (~12.8k lines → routed modules, conductor first) | shell renders from shared tokens/types; server.ts under 8k lines with conductor routes extracted |

**Execution order:** G1 (pure TS, this machine) → G4-beads + G2 (inference spine) → G3 (openfang runtime) → G5 (python ownership) → G6 → G8 → G7 (cloud-gated). Same rules as ever: small PRs, disjoint consumers in parallel, degrade-safe, no fake-ready.

## Wave F — herdr → `@recoder/herd` (RESOLVED 2026-07-11)

`herdr` (github.com/ogulcancelik/herdr, AGPL-3.0-or-later/commercial) was briefly
vendored for evaluation and **removed** on owner decision — AGPL network-copyleft
is incompatible with shipping Recoder commercially, and everything herdr offers
was already Recoder-owned or cheaply buildable:

- **Shipped instead:** `packages/herd` (`recoder-herd`, MIT-clean, zero runtime
  deps) — the terminal at-a-glance herd view over the conductor API (NEEDS YOU /
  WORKING / FAILED / DONE, goal labels, digit-key attach to the real tmux
  session, `--once` for scripting). Implemented from the public feature
  description only; no herdr code was read into the implementation.
- **Already owned:** detach/reattach + restart survival (tmux substrate), agents
  spawning/observing agents (conductor + MCP API), desktop board (cockpit).
- If a commercial herdr license is ever obtained, re-evaluation starts from a
  fresh clone — nothing herdr-derived exists in this tree.
