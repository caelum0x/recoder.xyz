# Recoder — Deep-Fusion Plan (Cursor↔VSCode style, per polyglot dir)

> **Goal.** Fuse `c/ crates/ go/ py/ ts/ packages/` INTO the product (backend · terminal `apps/wave` ·
> desktop cockpit) the way Cursor fused VSCode — compiled/imported **in**, woven through the core — NOT
> wired as MCP tools or thin HTTP microservices. This plan is the output of a 6-agent audit (2026-07-13);
> it records the honest current mode, the target fusion mode, and a needed/not-needed verdict per component.

## The fusion law (what "deep fusion" means per tier)

| Tier | Deep-fusion mode | Why |
|---|---|---|
| **TS** (`packages/`, `ts/`) | **direct in-process import** into docker-backend (Node) + `apps/wave` emain (Node) | first-party TS shares the process; no NAPI/HTTP needed. This is already the reality for ~38 packages. |
| **Rust** (`crates/`) | **NAPI `.node` addon loaded in-process** (+ Rust daemon/FFI fallback) | zero-IPC native fusion. Binding crates exist; the `.node` just isn't built yet. |
| **C** (`c/tmux`) | **owned+pinned+bundled binary driven as a subprocess** (NOT NAPI) | a session must survive a backend/Electron restart — in-process node-pty was tried + reverted. Subprocess IS the correct deep mode here. |
| **Python** (`py/`) | **app-owned supervised sidecar** (spawned+bundled, not a remote URL) OR port the hot path | heavy ML can't link into the signed Electron bundle; the fusion is *ownership*, not a URL seam. |
| **Go** (`go/`) | **bundled binary the desktop owns+spawns** (beads) / **not fusable** (cross-machine mesh) | beads → owned binary; xds/ziti are cross-trust infra that legitimately stay subprocess/loopback. |

Two edges are **correct, not failures**: the shell **renderer↔backend HTTP** call (a browser context can't in-process-import — only its emain/Node side can), and **cross-machine networking** (ziti/xds).

## Per-dir verdict

### `c/` — tmux (the L0 session substrate)
Already deep-fused correctly (owned/pinned/bundled binary, driven by the conductor; survives restart).
**Do:** (1) multi-arch CI build (only arm64-mac committed today); (2) deeper driver — replace capture-poll with a persistent tmux **control-mode (`-CC`)** client for real-time events; (3) **unify** `apps/wave`'s separate Go durable-shell onto the *same* c/tmux sessions (two restart mechanisms → one). **Needed: yes** (core).

### `crates/` — the native authorities (build the `.node`, load in-process)
Build all three with **`scripts/build-native-addons.sh [governance|tensorzero|openfang|all]`** — it
cargo-builds each `-napi` cdylib and copies it to the `.node` path the TS loader probes (degrade-safe: a
missing `.node` falls back to the Rust daemon / TS path). N-API is ABI-stable, so the `.node` is portable
across Node versions.

| Crate | Now | Target | Status |
|---|---|---|---|
| **recoder-governance** (moat) | Rust daemon (UDS) + `-napi` crate + FFI + TS fallback | native `.node` loaded in-process | **✅ DONE (2026-07-13)** — `.node` built (`cargo build --release -p recoder-governance-napi`, 31s) + **loads + runs a real `decide()` + Merkle audit IN-PROCESS**. The TS facade (`packages/governance`) prefers it, degrades to daemon/TS when absent. |
| **tensorzero** (LLM gateway) | TS HTTP client; `-napi` crate present | native `.node` for routing/cache; TS/pi-ai fallback | ⏳ **deferred (disk)** — build recipe in the script; the tensorzero crate graph is too large to build on the current ~7 GiB-free volume (ENOSPC risk). Run on a machine/CI with headroom. |
| **openfang** (agent engine, 14 crates) | `-napi` stub; no `.node` | native `.node` in-process | **✅ DONE (2026-07-13)** — the REAL kernel is compiled into a `.node` and **boots in-process** (verified: `health` = live agents, 205 models, real skills). No HTTP, no stub. See below. |

**openfang — REAL in-process fusion (2026-07-13).** Not a proxy, not a stub. The actual openfang engine (kernel + runtime/wasmtime + memory/sqlite + channels + skills + hands + wire + extensions) is **compiled into a NAPI `.node` and called directly in the docker-backend Node process** — Cursor↔VSCode style.
- **Build.** Restored the real upstream workspace root (`crates/openfang/Cargo.toml`, v0.6.9), trimmed to the kernel dep graph + `openfang-napi` (cli/desktop/api/migrate excluded — not in the kernel graph). `cargo build -p openfang-napi` → `libopenfang_napi.dylib` → copied to `openfang_napi.node` (workspace `target/`). `scripts/build-native-addons.sh openfang` does this reproducibly. ~110 MB `.node`; the full dep graph (wasmtime 43, openssl-vendored, rusqlite bundled, imap/lettre/rumqttc, axum) compiles.
- **Binding.** `openfang-napi/src/lib.rs`: `OpenfangEngine` wraps a booted `Arc<OpenFangKernel>` + owned tokio runtime — **41 methods** over the live kernel: agents (list/run/spawn/activate/stop/kill/reset/clear/model/skills/mcp-servers/tool-filters/sessions/create-session/switch-session/compact/context/usage), Hands (bundled/active/definitions/activate/pause/resume/deactivate), triggers (list/register/remove/enable), workflows (load-dir/register/run), events (publish), extensions (mcp reload/reconnect), bindings, models, skills, usage, verify-manifest — + free `ping`/`native_version`/`bundled_hands`. Typed inputs (Workflow/Event/TriggerPattern/AgentManifest) are passed as JSON and deserialized; degrade-safe on bad JSON.
- **Backend.** `docker-backend/src/conductor/openfang-native.ts` loads the `.node` (degrade-safe facade, never throws/fakes). `createOpenfangAgentRouter` serves the full surface at `/api/agents/openfang/*` from the in-process engine. The old `createOpenfangProxyRouter` (HTTP→:4200) is **removed** — the engine is fused, not proxied.
- **Desktop.** `recoder-hands` (bundled catalog + live instances with activate/pause/resume/stop) + `recoder-openfang` (engine console: health, agents with activate/stop/kill + inline message, models, skills, usage) — both native, degrade-safe.
- **Terminal.** `wsh recoder openfang <health|hands|agents|models|skills|usage|activate|pause|resume|deactivate|agent-activate|agent-stop|agent-kill|message>` — a shell client of the native engine edge.
- **Verified end-to-end (2026-07-13, headless).** Debug + **release** `.node` both boot the kernel in-process (45 methods, incl. per-agent KV memory; HTTP-route smoke test green: health/hands/agents/memory-roundtrip/context/models). Desktop: electron-vite prod bundle builds and contains `recoder-hands` + `recoder-openfang`; Go server + `wsh` + `wconfig` (widgets.json embed) build clean; docker-backend esbuild clean + 17/17 native tests. A GUI click-through needs a display (not runnable headless), but every buildable piece is green.
- **Remaining (optional):** bind niche subsystems (channels send/receive, direct memory ops, cron, background-agent controls) as more `#[napi]` methods over the already-compiled-in kernel; credential resolve/store intentionally NOT exposed over the edge (returns secrets — security rule).
| **claw-code-parity** | eval/parity harness | **removed** (2026-07-13) — not product runtime; consumer degrades to TS fallback | ~~drop~~ **done** |

### `go/`
| Component | Now | Target | Needed |
|---|---|---|---|
| **beads** (bd) | subprocess-cli via `execFileSync` | bundled owned binary (+ optional native lib) | yes (issue graph) |
| **recoder-xds** | Envoy xDS control plane | cross-machine infra — **not fusable** | **no** (cloud/teams only) |
| **ziti** | zero-trust mesh (1779 files) | cross-machine infra — **not fusable** | **no** (cloud/teams only) |
| **multica** | de-scoped managed-agents | superseded by `packages/coordination` | **no** (dead) |

### `py/` — ML muscle (own+supervise as sidecars, don't leave as URL seams)
| Component | Now | Target | Needed |
|---|---|---|---|
| **mem0** | already TS-fused (+ optional py loopback) | keep | yes |
| **colbert** (rerank) | HTTP-URL seam | app-owned bundled sidecar | yes (RAG quality) |
| **ops-recorder** (work-signals) | already wired conductor-side + optional py forward | keep/supervise | yes |
| **pal-mcp-server** | external stdio MCP (registered) | keep, or fold into in-proc `packages/pal` | optional |
| **browser-use** | HTTP seam | **superseded** by `@recoder/agent-browser` (TS, in-proc) | **no** (redundant) |

### `ts/` — easiest tier (direct import)
| Component | Now | Target | Needed |
|---|---|---|---|
| **opencode** | subprocess agent runtime (correct) | keep | yes |
| **extracted-from-openclaw** → `@recoder/connectors` | **already fused** (workspace dep + dist + `docker-backend/src/connectors`) | done — surface in shell | yes |
| **recodergit** | duplicate of `packages/recodergit` (the wired one) | **drop the `ts/` copy** | **no** (dup) |
| **dmux** | terminal-mux console | superseded by the Wave cockpit | **no** |
| **open-agents** (374 files, own `apps/`) | unaudited; likely redundant w/ opencode | **⚠ owner's call** | **?** |

### `packages/` — the spine (~38/70 already deep-fused into the backend = correct)
Backend fusion is essentially **done**. The real remaining work:
1. **THE BLOCKER:** `apps/wave` is **not a pnpm-workspace member** (own `package-lock.json`), so the shell literally cannot `workspace:*` import any `@recoder/*`. **Enabling PR:** add `apps/wave` to `pnpm-workspace.yaml` + reconcile the lockfile. Everything "share types/view-model into the shell" depends on this.
2. **Share into the shell** (after #1): `conductor-ui` (typed client) + `ui-agent-os` (view-model) + `design-tokens` (theme) so the `recoder-*-model.ts` blocks stop re-implementing backend shapes; `ecosystem-config` to replace the hardcoded `127.0.0.1:3100`; `distribution` device-flow into emain for auth.
3. **Dormant ledger — revive or delete** (refs=0, stop faking coverage): `action-registry`, `data-store-registry`, `web-search`, `analytics`, `performance`, `plugins`, `cli`, `herd`(as-lib), `security`.

## Not needed (prune / don't force-fuse)
`go/multica` (dead) · `go/ziti` + `go/recoder-xds` (cross-machine, cloud/teams-only) · `ts/recodergit` (dup of the package) · `ts/dmux` (superseded by the shell) · `py/browser-use` (superseded by `@recoder/agent-browser`) · `crates/claw-code-parity` (eval harness, not runtime). **`ts/open-agents` — needs the owner's call.**

## Execution order (one by one)
1. **`crates/recoder-governance` → native NAPI** (the moat; deepest scaffolding; cargo available). ← **START HERE**
2. `crates/tensorzero` → native NAPI (reuse the pattern).
3. `crates/openfang` → native NAPI.
4. `apps/wave` → pnpm-workspace member (enables all shell package fusion).
5. Shell fusion: `conductor-ui`/`ui-agent-os`/`design-tokens`/`ecosystem-config` into `apps/wave`.
6. `py/colbert` + `c/tmux` control-mode + beads-owned-binary — the sidecar/substrate hardening.
7. Dormant reconciliation: revive-or-delete the refs=0 packages.
