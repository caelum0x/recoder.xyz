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
`substrate` (swappable execution layer + RUNTIME_SPECS), `agent-mcp` (MCP
registry + tool permissions), `agent-policy` (deterministic policy), `governance`
(TS facade over the Rust kernel), `brain` (RAG context + instruction assembly),
`pal` (decision layer), `pi-coding-agent` (Recoder's own agent), `herd`
(terminal at-a-glance view), `distribution` (licensing/billing) — all **wired**.

---

## The connection backlog (making agents USE the capabilities)

The MCP host registers 15 in-proc servers but wires concrete executors for only
`git_nexus`, `tasks`, `runs` today. The rest authorize then return a truthful
"no in-proc executor wired". Binding these — in value order — is how agents gain
the capabilities:

1. **memory** → `mem0` (agents recall across runs — the moat).
2. **beads** → `bd` (agents drive the issue graph).
3. **repo** → git operations over the worktree.
4. **browser** → `browser-use` (agents verify their own UI work).
5. **approvals / artifacts** → the agent-os store (agents request approval,
   attach artifacts).
6. github, preview, logs, oss, deployment, billing → their backends.

Each binding runs behind the same governance gate and seals into the audit
chain, so every capability an agent uses is policy-checked and non-repudiable.

See `docs/architecture/RECODER-FUSION-PROGRAM.md` for the layer-by-layer fusion
status and `AGENTS.md` for the cross-agent policy.
