# Recoder Fusion Program — "Every Directory Becomes One Recoder"

> **Owner mandate (2026-07-11):** Every directory, folder, and package fuses into ONE big Recoder — millions of LOC, the way Linux is built on Unix. Nothing is parked. The desktop embeds the fused product.
>
> **This overrides the "still park" list in `WIRE-UP-BACKLOG.md`.** The parked upstreams (tensorzero, lance, openfang, ziti, multica, browser-use, mem0, ops-recorder, claw-code-parity) are now IN SCOPE — each fused via its correct integration mode.

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
| `py/ops-recorder` | subprocess/stdio | `/work-signals` ingress in docker-backend (Python↔TS bridge) | ⬜ open |
| `packages/recoder-browser-tools` | in-process | browser-check node (needs CJS dist first) | ⬜ open |

## Wave B — Fuse the parked Rust crates (subprocess/UDS, build-gated)

Rust builds are heavy and the box is disk-constrained (per memory) — build out-of-band (`docker compose` / `cargo build` on CI), fuse the daemon over UDS/loopback, degrade-safe when the binary is absent. NOT NAPI-in-Electron.

| Crate | Mode | Fuse into (seam) | Notes |
|---|---|---|---|
| `crates/recoder-governance` | subprocess/UDS | governance daemon behind `packages/governance` facade via `GOVERNANCE_SOCKET` | Kernel built + e2e-proven; just needs the socket wired + supervised. **Highest leverage.** |
| `crates/openfang` | subprocess/loopback | 24/7 autonomous-agent engine; A2A boundary (Recoder owns task/approval/memory) | Config exists (`openfang.toml`); build binary, supervise, emit RunEvents |
| `crates/tensorzero` | subprocess/loopback | LLM gateway → inference logging/eval/A-B, consumed by `packages/runtime` | Unifies provider calls; observability |
| `crates/lance` | subprocess (via py bindings) | vector store backing retrieval/memory | Feeds colbert/mem0 retrieval |
| `crates/claw-code-parity` | in-process/subprocess (TBD on inspection) | parity harness into the eval/runtime path | Inspect interface first |

## Wave C — Fuse the parked Go + Python subsystems

| Subsystem | Mode | Fuse into (seam) | Notes |
|---|---|---|---|
| `go/ziti` | subprocess/loopback | zero-trust mesh; `ziti-client.ts` + `routes/ziti.routes.ts` already exist — compile the controller, wire enrollment | Backend routes exist; needs the compiled binary |
| `go/multica` | subprocess/loopback | managed-agents/squads assignment behind docker-backend | Inspect interface; squad assignment |
| `py/browser-use` | subprocess/MCP (`--mcp`) | MCP server via `mcp-manager.ts` → browser automation | LLM-driven web automation |
| `py/mem0` | subprocess/loopback | durable memory backing `packages/brain` (dedupe vs `packages/mem0` TS — pick one runtime, per docs) | Resolve the dual-runtime duplication as part of fusion |
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
