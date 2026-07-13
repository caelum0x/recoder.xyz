# Recoder Capabilities — the backend the agents use

> **Mental model.** Recoder is a **terminal**. You open it, pick your coding
> agent (Claude Code, Codex, Cursor, pi, opencode, …), and work. Everything in
> `c/ crates/ go/ py/ ts/ packages/` is **backend capability** — power the
> *agents* wield while they run, never human navigation. The frontend
> (`apps/desktop/cockpit`) stays as plain as a terminal: run agents in parallel
> worktrees, watch them, review, merge. The capabilities below are what make
> those agents far more capable inside Recoder than on their own.
>
> This is the moat: **a vendor-neutral control plane that runs every coding CLI
> in parallel with governance, a tamper-evident audit trail, and a shared
> capability stack underneath.** Cursor is one IDE+agent; Devin is one hosted
> agent; conductor.build parallelizes Claude Code alone. Recoder runs them all,
> governed, and lets them use the whole stack.

> **Delivered (2026-07-13).** Phases 2–4 of [RECODER-ENGINES](./RECODER-ENGINES.md) landed as owned,
> governed, degrade-safe engines reachable through the bridge: **retrieval** (RAG), **browser-use**,
> **coordination** (work-locks), **workflow** (verify/hooks), and in-proc **PAL planning** — see the
> connection table below. The L3 terminal shell (`apps/wave`) is fully rebranded to Recoder and builds
> end-to-end ([FORK.md](../../apps/wave/FORK.md)).

## How an agent gets a capability

1. The conductor provisions an isolated git worktree + tmux session and launches
   the user's chosen CLI (`packages/substrate` RUNTIME_SPECS).
2. Recoder's **MCP host** (`docker-backend/src/agent-os/mcp`) exposes the
   capabilities below as MCP tools, gated `authorize → risk → execute → audit`.
3. The agent calls a tool (e.g. `memory.search`, `beads.ready`, `browser.open`);
   the host runs the concrete backend engine and seals the call in the Merkle
   audit chain.

The tools an agent may use, and the risk tier of each, are policy decisions
(`packages/agent-policy` + the Rust governance kernel) — not the agent's choice.

---

## The capability map (by directory)

Status legend: **wired** = executor live end-to-end · **partial** = seam wired,
executor/native build pending · **catalog** = registered, executor not yet bound.

### `c/` — native session substrate
| Capability | What it gives the agent | Status |
|---|---|---|
| `c/tmux` | Restart-survivable terminal sessions — an agent's run survives a backend restart (worktree + tmux + Postgres state + reconciler). | **wired** (L0) |

### `crates/` — native Rust engines (NAPI, in-process)
| Capability | What it gives the agent | Status |
|---|---|---|
| `recoder-governance` | Deny-biased policy + tamper-evident Merkle audit on every delivery. The moat. Compiled `.node`, native-first, daemon + UDS fallback, pure-TS fail-closed fallback. | **wired** |
| `lance` | In-process columnar/vector store for retrieval/RAG — no external Qdrant/pgvector. | **wired** |
| `openfang` | Autonomous Agent-OS execution engine (137K-LOC Rust) as a swappable authority. Subprocess + native-first seams. | **partial** (`.node` build deferred) |
| `tensorzero` | Unified multi-provider LLM gateway (<1ms p99) + inference observability + fallbacks — one governed, logged path for every model call. | **partial** (`.node` deferred) |
| `claw-code-parity` | Coding-agent parity/eval harness. | **partial** |

### `go/` — networking, issue-tracking, xDS
| Capability | What it gives the agent | Status |
|---|---|---|
| `beads` (bd) | The issue/task graph. Agents read ready work, claim, close, link discovered work. | **wired** |
| `recoder-xds` | Envoy xDS/ADS control plane for routing. | **wired** |
| `ziti` (OpenZiti) | Zero-trust mesh for cross-machine/org agent networking. | **partial** |
| `multica` | Managed-agents platform. | abandoned |

### `py/` — memory, retrieval, browser, billing
| Capability | What it gives the agent | Status |
|---|---|---|
| `mem0` | Durable agent **memory** across runs — the compounding moat (data gravity). | **wired** (client) · MCP tool **catalog** |
| `colbert` | Late-interaction **reranker** over retrieved context. | **wired** |
| `browser-use` | **Browser automation** — agents open pages, fill forms, verify UI. | **partial** (MCP) |
| `pal-mcp-server` | Multi-model workflow MCP (planning/routing). | **partial** |
| `recoder-billing` | Polar merchant-of-record billing slice. | **partial** |

### `ts/` — the forked CLI engines (subprocess, via repo-engine-locator)
> These are the **live substrate engines**, not dormant clones. `ts/*` are
> subprocess-resolved forked coding-agent CLIs; `packages/*` are npm-imported
> control-plane libraries. (Do not assume `ts/*` is dead — it is the runtime.)

| Capability | What it gives the agent | Status |
|---|---|---|
| `opencode` (`@recoder/opencode`) | The opencode coding-agent runtime. | **wired** |
| `oh-my-codex` (`@recoder/codex-runtime`) | The Codex runtime driver. | **wired** |
| `oh-my-openagent` | opencode harness. | **wired** |
| `dmux` (`@recoder/dmux`) | Terminal-multiplexer operator console. | **partial** |
| `polar` | Payments server (monetization). | **partial** |
| `extracted-from-openclaw` (`@recoder/connectors`) | Chat-channel connectors (Slack/Discord/…). | **wired** |

### `packages/` — the Agent-OS control-plane spine
`agent-os` (canonical state-of-record: tasks/runs/approvals/artifacts/memory),
`substrate` (swappable execution layer + RUNTIME_SPECS + the durable-SSH `ssh` substrate), `agent-mcp`
(MCP registry + tool permissions), `agent-policy` (deterministic policy), `governance`
(TS facade over the Rust kernel), `brain` (RAG context + instruction assembly),
`pal` (decision layer + in-proc `pal.plan`), `pi-coding-agent` (Recoder's own agent), `herd`
(terminal at-a-glance view), `distribution` (licensing/billing) — all **wired**. Owned engines added
in Phases 2–4: `retrieval` (RAG), `agent-browser` (browser-use), `coordination` (work-locks),
`workflow-engine` (verify/hooks) — each an owned package skinned as a governed MCP server. The old
`rag` (postgres/pgvector) is superseded by `retrieval` (Qdrant) via a strangler adapter — see
[RAG-CONSOLIDATION](./RAG-CONSOLIDATION.md).

---

## How agents reach the tools (the last mile)

When the conductor provisions a worktree it writes a `.mcp.json` registering the
Recoder MCP server (`docker-backend/src/conductor/mcp-inject.ts`), so the
launched agent auto-discovers it — **zero setup**. That server
(`mcp/recoder-a2a-server.js`) exposes the A2A/sandbox/workspace tools directly
and BRIDGES the governed interop-host capabilities via the internal service key
the conductor injects. So an agent's `recoder_memory_search`,
`recoder_issues_ready`, `recoder_repo_search`, `recoder_browser_verify` (etc.)
run through `POST /api/mcp/tools/:server/:tool/call` behind the full
`authorize → risk → execute → audit` gate.

## The connection backlog (making agents USE the capabilities)

The interop host registers 20 in-proc servers. Concrete executors bound so far:

| Capability | Executor | Agent tool(s) | Status |
|---|---|---|---|
| tasks / runs / git_nexus | agent-os store + recodergit | (control-plane) | **wired** |
| **memory** | reviewed-memory store (mem0 model) | `recoder_memory_search` · `recoder_remember` | **wired** ✓ proven |
| **beads** | `bd` CLI | `recoder_issues_ready` · `issue_create` · `issue_close` | **wired** ✓ proven |
| **repo** | git grep + `gh search code` + semantic index | `recoder_repo_search` (hybrid: local + GitHub + semantic) · `recoder_repo_diff` | **wired** ✓ proven |
| **browser** | puppeteer automation | `recoder_browser_open` · `recoder_browser_verify` | **wired** (needs `puppeteer` installed) |
| **approvals** | agent-os store | `recoder_request_approval` | **wired** ✓ proven |
| **artifacts** | agent-os store | `recoder_attach_artifact` | **wired** |
| **github** | `gh` CLI | `recoder_github_search_repos` · `recoder_github_pr_create` | **wired** |
| **logs** | RunEvent store | (log stream/search/append) | **wired** |
| **preview** | workspace-service + browser-check | `recoder_preview_url` · `recoder_preview_health` · `recoder_preview_check` | **wired** |
| **retrieval** (E2) | `@recoder/retrieval` (chunk→embed→Qdrant→ColBERT) | `recoder_retrieval_search` · `recoder_retrieval_ingest` | **wired** (degrade: `not_configured` w/o embeddings/QDRANT) |
| **browser-use** (E9) | `@recoder/agent-browser` (lazy puppeteer / `BROWSER_USE_URL`) | `recoder_browser_navigate` · `recoder_browser_extract` | **wired** (degrade: `not_configured` w/o driver) |
| **coordination** (E13) | `@recoder/coordination` advisory lock store | `recoder_coordination_acquire_lock` · `recoder_coordination_detect_conflict` | **wired** |
| **workflow** (E12) | `@recoder/workflow-engine` (agent-workflows + agent-hooks) | `recoder_workflow_verify` · `recoder_workflow_capture_hook` | **wired** (verify exec opt-in via `RECODER_WORKFLOW_VERIFY`) |
| **pal-plan** (E11) | `@recoder/pal` in-proc decision (runtime/substrate/grants/risk/approval) | `recoder_pal_plan` | **wired** (deny-biased on uncertainty) |
| deployment | (no safe programmatic backend — manual + approval-gated) | — | deferred → `recoder-ccy1` |
| billing | (no clean agent→billing-subject mapping) | — | deferred → `recoder-r6ek` |

The agent-facing bridge tools live once in `mcp/recoder-capability-tools.cjs`,
vendored byte-identically into every stdio server copy (main + `packages/recoder-a2a`
+ `packages/recoder-code`), guarded by a drift test — so packaged agents get the
exact same governed capability set as the product.

Each binding runs behind the same governance gate and seals into the Merkle
audit chain, so every capability an agent uses is policy-checked and
non-repudiable. Deferred entries carry a filed cause (above) rather than a stub.
New bindings follow the proven **five-step** pattern (the first two alone are not
enough — the gated route 404s without the registration steps):
1. Executor skin `docker-backend/src/agent-os/mcp/*-engine.ts` (composes the owned package).
2. Register in `inproc-engines.ts` — `ENGINE_SERVERS` + `buildInProcEngineRouter`.
3. Register in `interop-host.ts` `IN_PROC_SERVERS` **and** `mcp-control.routes.ts` `defaultServers`.
4. Rebuild `@recoder/agent-mcp` dist + the engine package's dist.
5. Add the bridge tool to `mcp/recoder-capability-tools.cjs` (synced byte-identically to all 3 copies).

Verify with the `interop-host.engines` / `interop-host.routes` / `mcp-control.routes` tests + the
capability-tools drift test.

See `docs/architecture/RECODER-FUSION-PROGRAM.md` for the layer-by-layer fusion
status and `AGENTS.md` for the cross-agent policy.
