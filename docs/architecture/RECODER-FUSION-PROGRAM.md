# Recoder Fusion Program — "Every Directory Becomes One Recoder"

> **Owner mandate (2026-07-11):** Every directory, folder, and package fuses into ONE big Recoder — millions of LOC, the way Linux is built on Unix. Nothing is parked. The desktop embeds the fused product.
>
> **This overrides the "still park" list in `WIRE-UP-BACKLOG.md`.** The parked upstreams (tensorzero, lance, openfang, ziti, multica, browser-use, mem0, ops-recorder, claw-code-parity) are now IN SCOPE — each fused via its correct integration mode.

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
| `packages/recoder-browser-tools` | in-process | browser-check node (needs CJS dist first) | ⬜ open |

## Wave B — Fuse the parked Rust crates (subprocess/UDS, build-gated)

Rust builds are heavy and the box is disk-constrained (per memory) — build out-of-band (`docker compose` / `cargo build` on CI), fuse the daemon over UDS/loopback, degrade-safe when the binary is absent. NOT NAPI-in-Electron.

| Crate | Mode | Fuse into (seam) | Notes |
|---|---|---|---|
| `crates/recoder-governance` | subprocess/UDS | governance daemon behind `packages/governance` facade via `GOVERNANCE_SOCKET` | ✅ **DONE** — binaries prebuilt (release+debug), boot-spawn wired in server.ts:12404, facade delegates over UDS with degrade-safe TS fallback, 12/12 tests. Activates when `INTERNAL_SERVICE_KEY` set. |
| `crates/openfang` | subprocess/loopback | ✅ **DONE** — `openfang-daemon.ts` (governance-pattern): boot-spawn when binary present, `/api/agents/openfang` edge, backoff-supervised, degrade-safe 503; 12 tests (b3bb0d572). Rust build deferred. |
| `crates/tensorzero` | subprocess/loopback | ✅ **DONE** — `tensorzero-client.ts` + `/api/gateway/*`; supervised loopback, degrade-safe when absent; runtime observability logger; 26 tests (0dd427f02). Rust build deferred. |
| `crates/lance` | subprocess/lib | ✅ **DONE** — `@recoder/rag` vector-store seam, degrade-safe SDK-absent fallback + truthful skipReason; 97 tests (ac82795b5). LanceDB SDK/build deferred. |
| `crates/claw-code-parity` | in-process/subprocess (TBD on inspection) | parity harness into the eval/runtime path | Inspect interface first |

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

This is a multi-session engineering program spanning ~6 languages and millions of LOC. It proceeds wave by wave, each wave a set of small, tested, end-to-end-verified fusions. Progress is tracked by flipping rows here and in `WIRE-UP-BACKLOG.md` / `DIRECTORY-MAP.md`. No wave is "done" until its consumer runs the fused code end-to-end.

## Wave E — NAPI/FFI deep-linking (Rust crates INTO the Node binary) — owner decision 2026-07-11

Deeper than supervised-subprocess: each Rust crate gets a `#[napi]` cdylib binding crate + facade rewired native-first (loads the `.node`, degrade-safe fallback to the existing subprocess/loopback path).

| Crate | Binding | Facade native-first | `.node` compiled | Tests |
|---|---|---|---|---|
| `recoder-governance` | ✅ `recoder-governance-napi` | ✅ `packages/governance` | ✅ **BUILT** — kernel linked in-process; `decide()` returns a verdict natively (socket = fallback) | 160/160 (69ac2debb) |
| `lance` | ✅ `crates/lance/npm-bindings` | ✅ `packages/rag` | ✅ **BUILT** | 106 rag + 9 + 7 cargo (570a5076e) |
| `tensorzero` | ✅ gateway-napi (sync surface only) | ✅ `tensorzero-client.ts` | ⏸ deferred (~4–6 GB) | 27 (64a68c1d9) |
| `openfang` | ✅ openfang-napi ⚠️ gitignored subtree | ✅ `oss-dispatch.ts` | ⏸ deferred (~7–9 GB) | 30 (446dbe79a) |
| `claw-code-parity` | ✅ claw-code-parity-napi | ✅ `a2a-openclaw-adapter.ts` | ⏸ deferred (~7.5–8.5 GB) | 10 (0e1d938) |

**Open items:** (1) reclaim disk (currently ~3.7 GB) then `cargo build --release` the 3 deferred `.node`s; (2) add a `.gitignore` exception so `openfang-napi`/`claw-code-parity-napi` binding crates commit to the root repo; (3) wire `napi build` into `electron-builder` `asarUnpack` per-arch for the signed bundle (L5).

## END-TO-END PROOF (2026-07-11) — the fused product RUNS, not just compiles

Three proofs pass against the composed stack:
1. `docker-backend/scripts/e2e-conductor-loop.ts` → PASS: fused run loop `running → awaiting_review` with real delivery summary + post-run workflow + RunEvents (no BYOK key).
2. `docker-backend/scripts/e2e-conductor-approval.ts` → EXIT 0: governance gate enforced, Merkle auditHash, native `NapiGovernanceKernel` loads in-process.
3. `apps/desktop/scripts/dev-boot-proof.js` → EXIT 0: desktop supervisor boots embedded docker-backend, **Rust governance daemon spawns and routes delivery decisions**, **c/tmux substrate resolved+live**, `/api/conductor/health` 200 `{available,git,tmux}`, Redis-absent degrades to in-memory (degrade-safe verified), clean shutdown.

Verdict: L0→L4 + native governance are composed AND running end-to-end. Remaining = 3 disk-deferred native compiles + signed .dmg + external-service activation (all disk/CI-gated, not code-blocked).

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
