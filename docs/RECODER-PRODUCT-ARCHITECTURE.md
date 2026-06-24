# Recoder — Product & Directory Architecture

Last updated: 2026-06-24. The institutional architecture for the Recoder product:
how every owned OSS component becomes one buildable product, grouped by **language**
(for toolchains) and by **function** (for clarity), all in this one repo. No
relocation into a separate folder, no rewrites — build on what exists.

Read with `RECODER-OS-MASTER-PLAN.md` (the wedge & strategy) and
`CONDUCTOR-ARCHITECTURE.md` (the execution spine).

## 1. The product (one paragraph)

Recoder is a **local-first control plane that runs your own coding agents**
(Claude Code, Codex, opencode, pi) in parallel and makes them work as a team:
one **shared brain** (read the repo once, reuse everywhere), **work-locks + an A2A
bus** so they never collide or duplicate, and **governance + audit** so teams can
trust it. Users bring their own agents and keys; Recoder never proxies models or
resells tokens. Surfaces: a native cockpit (Electron), a CLI, an MCP server, and a
thin web console. Self-hostable.

## 2. The eight layers (function) and which component fills each

| Layer | Job | Owned components |
| --- | --- | --- |
| **Substrate** | run the real agent CLIs, isolated | `docker-backend/src/conductor` (tmux + worktrees), `daytona-projects` → `@recoder/sandbox-daytona` |
| **Brain** | shared memory the agents reuse | `@recoder/mem0`, `@recoder/git-nexus`, `@recoder/context7-sdk`, `beads` (work history) |
| **Coordination** | locks, bus, handoff, dedup | `@recoder/agent-os` (work-locks/state), `@recoder/a2a-js`/`a2a-sdk` (bus), `multica`, `pal-mcp-server` |
| **Governance** | approval, audit, permissions, replay | `openfang` (routing/approval), `claw-code-parity` (permission rubric), `ops-recorder` (record/replay), `@recoder/agent-policy` |
| **Interop** | external agents in/out | `@recoder/a2a-*`, `@recoder/agent-mcp`, `pal-mcp-server`, `docker-backend/src/a2a` (terminal registry) |
| **Runtime** | drive each agent CLI headless | `oh-my-codex` (Codex), `oh-my-openagent` (opencode), `open-agents`, `@recoder/pi-*`, `@recoder/agent-runtimes` |
| **Network** | secure cross-machine/org mesh | `ziti` |
| **Distribution** | how users get + pay | `apps/desktop` (cockpit), `@recoder/cli`, `homebrew-recoder`, `mcp/recoder-mcp-server`, `polar` (billing), `openclaw` (notify) |

## 3. Directory architecture (language × function, one repo)

Group by language at the top (each toolchain gets a clean workspace), function within.
Non-TS OSS moves into `crates/`, `go/`, `py/`; TS stays in `packages/`/`apps/`; raw
clones still being merged sit in `sources/` until folded in.

```
recoder.xyz/
├── crates/                      # Rust — cargo workspace
│   ├── recoder-openfang/        # ← openfang        (governance: routing + approval kernel)
│   └── recoder-permissions/     # ← claw-code-parity (governance: permission rubric)
│
├── go/                          # Go — go.work
│   ├── recoder-beads/           # ← beads           (brain: durable work history; bd CLI)
│   └── recoder-mesh/            # ← ziti            (network: zero-trust cross-machine mesh)
│
├── py/                          # Python — uv workspace
│   └── recoder-pal-mcp/         # ← pal-mcp-server  (interop: MCP context server)
│
├── packages/                    # TypeScript libs — pnpm (@recoder/*), kept flat
│   #  brain        → mem0, git-nexus, context7-sdk, beads-adapter
│   #  coordination → agent-os, a2a-js, a2a-sdk, agent-events, agent-policy, agent-mcp
│   #  runtime      → agent-runtimes, pi-*, pal, runtime-codex (new), runtime-opencode (new)
│   #  substrate    → sandbox-daytona, daytona-*-api-client
│   #  distribution → cli, billing (new, ← polar), gateway-messaging (new, ← openclaw)
│   #  core         → logger, utils, http, storage, vault, design-tokens, ui, ...
│
├── apps/                        # TS apps
│   ├── desktop/                 # the cockpit (Electron) — primary surface
│   ├── agent-gateway/  agent-worker/  mobile/
│
├── docker-backend/              # the control-plane service (conductor + a2a + agent-os spine)
│
├── site/                        # marketing site (recoder.xyz) — done
│
└── sources/                     # raw OSS being merged into the above (delete once folded)
    daytona-projects/  oh-my-codex/  oh-my-openagent/  open-agents/
    multica/  ops-recorder/  ClawWork/
```

Naming: everything normalizes to the `@recoder/*` scope (TS) or `recoder-*` (crates/go/py).
`docker-backend` keeps its name for now (many deploy/CI refs); it is the control-plane service.

## 4. Build orchestration (what makes it one product)

Reality check from the analysis: `openfang` (14 crates) and `claw-code-parity` (9 crates)
each have **their own Cargo workspace**, so they cannot be members of a single root Cargo
workspace. The unified build is therefore **orchestration, not one mega-workspace**: a
top-level `Makefile` (or scripts) that invokes each project's native build, plus `go.work`
to unify the Go modules and a `uv` workspace for Python.

- **`go.work`** → `use ./beads ./ziti` — `go build ./...` across both Go modules.
- **`uv`** workspace → `pal-mcp-server`, `ops-recorder`, `ClawWork` (Python) — `uv sync`.
- **Rust** → built per-project (`cargo build` in `openfang/` and `claw-code-parity/rust/`);
  each stays its own workspace. (Heavy + disk-hungry → CI, not the laptop.)
- **`pnpm-workspace.yaml`** (exists) → all TS unchanged.
- **`Makefile`** at root → `make build` / `make verify` runs every toolchain (see §6).

The TS control plane (`docker-backend`) shells out to / links the compiled Rust + Go
binaries (openfang daemon, ziti, bd) and the Python MCP servers — the same pattern the
conductor already uses for `tmux`/`gh`. Adapters in `packages/*-adapter` are the seams.

## 5. Build-on-existing rule (no rewrites)

Every integration extends real, existing entry points. The conductor spine, agent-os
domain, a2a routes, and the `@recoder/*` packages already exist and build. Integration =
wiring + adapters, not greenfield. The per-component integration map (verified entry
points + smallest glue) comes from workflow `wzsyiucj6` and is appended in §7.

## 6. "Make it all work" — verification gates

The product is "working" when each toolchain is green:

```
cargo build --workspace               # Rust: openfang, permissions
go build ./...                        # Go: beads, mesh
uv sync && uv run pytest              # Python: pal-mcp
pnpm -r build && pnpm typecheck       # TS: all @recoder/* + apps
cd docker-backend && npx tsc --noEmit # control-plane service (currently green)
cd site && pnpm build                 # marketing site (currently green)
```

CI runs all six as a matrix. Nothing ships red.

## 7. Per-component integration map (verified, workflow `wzsyiucj6`)

State legend: ✅ fully wired · ◐ partially integrated (glue exists) · ○ raw clone (needs adapter).

| Component | Lang | Layer | State | → name | Smallest build-on-existing integration |
| --- | --- | --- | --- | --- | --- |
| conductor (`docker-backend/src/conductor`) | TS | substrate | ✅ | `@recoder/conductor` | already THE substrate; only needs a types export package |
| a2a spine (`docker-backend/src/a2a`) | TS | coordination/interop | ✅ | `@recoder/a2a-comms` | already wired (40+ services); optional barrel export |
| agent-os (`packages/agent-os`) | TS | governance/brain | ✅ | keep | the unified contract; extend via existing ports/ pattern |
| pi (`packages/pi-*`) | TS | runtime | ✅ | `@recoder/runtime-adapter-pi` | wrap `pi-runtime-adapter.ts` in AgentRuntimeAdapter |
| daytona (`daytona-projects`) | TS | substrate | ✅ | `@recoder/substrate-daytona` | owned + wired; prefer SDK over REST client |
| brain (`mem0`,`git-nexus`,`context7-sdk`,`beads-adapter`) | TS | brain | ◐ | `@recoder/brain-core` | wire `Mem0MemoryAdapter` into `docker-backend` agent-os routes |
| agent-runtimes (`packages/agent-runtimes`) | TS | runtime | ◐ | `@recoder/runtime-adapters` | register adapters in `mcp-control.routes.ts` |
| beads | Go+Py | brain/governance | ◐ | `@recoder/memory-beads` | wire `beads-mcp` (FastMCP) into docker-backend as stdio MCP |
| ziti | Go | network | ◐ | `@recoder/ziti-network` | wrap `ziti-client.ts`; call `zitiHealth()` on startup |
| oh-my-codex | TS+Rust | runtime | ◐ | `@recoder/codex-runtime` | extract `codex-connector-runtime.service.ts` → package |
| oh-my-openagent | TS | runtime | ◐ | `@recoder/openagent-runtime` | `createOmoAdapter()` in `a2a/coding-runtime.ts` |
| polar | TS | governance/billing | ◐ | `@recoder/billing-polar` | extract `polar-client.ts` + entitlement hook → package |
| openfang | Rust | governance/routing | ○ | `@recoder/openfang` | `packages/openfang-adapter` bridges RuntimeAdapterPort; spawn daemon (own Cargo workspace) |
| claw-code-parity | Rust | governance | ○ | `@recoder/permission-enforcer` | adapter re-exports Rust governance via FFI/WASM (own Cargo workspace) |
| pal-mcp-server | Py | interop | ○ | `@recoder/pal-mcp` | TS adapter wraps Python MCP lifecycle via existing mcp-manager |
| open-agents | TS | runtime | ○ | `@recoder/open-agents-runtime` | adapter maps `ToolLoopAgent` → RuntimeExecutionDriver |
| multica | Go+TS | coordination | ○ | `@recoder/multica` | adapter = REST/WS client to multica server |
| ops-recorder | Py | governance | ○ | `@recoder/ops-recorder` | TS client to work-signals HTTP endpoints |
| ClawWork | Py | brain/governance | ○ | `@recoder/clawwork-agent` | wrap LiveAgent+EconomicTracker as RuntimeAdapter |
| openclaw | TS | distribution | ○ | `@recoder/openclaw-adapter` | NATS heartbeat consumer → A2AEventBus |

**Build order falls out of state:** the ✅ spine already runs; ◐ need small wiring; ○ need a new adapter package each (all independent → parallelizable).

## 8. Execution sequence (staged, build-green, nothing breaks)

1. **Architecture locked** (this doc).
2. **Workspace manifests** — add Cargo/go.work/uv workspaces referencing in-place dirs; confirm each toolchain builds. (No moves yet — proves the wiring.)
3. **Language grouping** — `git mv` openfang/claw-code-parity → `crates/`, beads/ziti → `go/`, pal-mcp-server → `py/`; update manifests; re-verify green. One commit per language.
4. **TS merges** — fold `oh-my-codex`/`oh-my-openagent`/`open-agents`/`multica`/`polar`/`openclaw` into `@recoder/*` packages; codemod imports; green per merge.
5. **Rebrand pass** — normalize remaining names to `@recoder/*`.
6. **Wire the spine** — control plane calls openfang (routing/approval), bd (work), ziti (mesh), pal-mcp (interop); the cockpit + CLI + MCP expose it.
7. **Polish + verify** — all six gates green; cockpit runs real Claude Code/Codex in parallel with shared brain + locks.
