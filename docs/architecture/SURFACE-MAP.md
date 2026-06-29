# Recoder — Surface Map

> The authoritative table mapping **every** monorepo component to the **surfaces** it
> powers and **how** it is integrated into each. Pairs with
> [`../ARCHITECTURE.md`](../ARCHITECTURE.md) (the design + execution model),
> [`../DIRECTORY-MAP.md`](../DIRECTORY-MAP.md) (every tree → layer + keep/wire/park/drop
> verdict), [`../PRODUCTS.md`](../PRODUCTS.md) (the shippable products), and
> [`../ROADMAP.md`](../ROADMAP.md) (what to build next).
>
> Where `DIRECTORY-MAP.md` answers *"what is this directory and is it load-bearing?"*,
> this file answers *"which surfaces does it power, and through which wire?"* A
> directory appears under **every** surface it touches, so most engines show up more
> than once.

---

## Integration-mode legend

Five ways a component plugs into a surface. The mode is the contract, not a detail.

| Mode | Wire | Meaning |
|------|------|---------|
| **`in-process-import`** | direct `import` in the same Node/process | First-party packages are **fused** into the host that uses them — the engine runs *inside* `docker-backend` / the app / the gateway, sharing memory and the agent-os state spine. No network hop, no serialization tax. This is the default for everything owned. |
| **`subprocess-cli`** | spawn a binary, talk over stdio/tmux/pipes | **Coding agents and external tools run as child processes** the host supervises. The agent CLI (Claude Code / Codex / pi / opencode) runs **backgrounded in a `tmux` session inside a git worktree** so it survives a host restart; MCP servers run over stdio. The host owns the lifecycle; the subprocess owns the work. |
| **`http-edge`** | request/response over HTTP/WS | HTTP only at **true edges**: browser↔server, mobile↔server, and **cross-machine mesh** (teams/enterprise via Envoy). Not used between first-party packages on the same box. |
| **`vendored-park`** | present, not wired | A vendored clone kept for provenance / reference / future build, with no live runtime consumer on this surface. |
| **`doc-or-config`** | manifest / skill / config | A declarative artifact (skill descriptor, MCP manifest, env) — not executable engine code. |

**The integration rule (from `ARCHITECTURE.md`):**
1. **First-party packages are fused in-process** — engines are imported, not called over HTTP. `docker-backend` *is* the engines.
2. **Coding agents run as `subprocess-cli` under tmux** — backgrounded in a worktree, restart-survivable; node-pty was tried and reverted.
3. **HTTP only at true edges** — browser↔server, mobile↔server, cross-machine mesh. Everything else is an in-process import or a supervised subprocess.

> Verdicts (`keep-core` / `keep-supporting` / `wire-up` / `park` / `drop`) are carried
> over from `DIRECTORY-MAP.md`; see it for the full keep/wire/park/drop rationale and refs.

---

## 1. Server — `docker-backend` (the runtime host, L2)

The one Express/express-ws host that **mounts the L1 engines in-process** and exposes
`/api/conductor`, `/api/agent-os`, `/api/a2a`, `/api/connectors`. Runs **embedded in the
desktop** and **in the cloud** — same code, different host. Every engine below is fused
into this process unless noted.

| dir | what it is | integration mode | role on this surface | verdict |
|-----|------------|------------------|----------------------|---------|
| `docker-backend` | The backend product — host mounting all engines | http-edge (its own ingress) | THE host; serves `/api/conductor`, `/api/agent-os`, `/api/a2a`, `/api/connectors` | keep-core |
| `packages/agent-os` | Canonical state spine (tasks/runs/approvals/artifacts/memory) | in-process-import | State of record every engine is an adapter around | keep-core |
| `packages/agent-events` | CloudEvents + transactional outbox (NATS/Postgres) | in-process-import | Event serialization + outbox the host drains | keep-core |
| `packages/agent-policy` | Deterministic allow/needs_approval/deny engine | in-process-import | Gates launches + risky writes | keep-core |
| `packages/agent-memory` | Memory store + candidate/review + vector search | in-process-import | Long-term memory lifecycle | keep-core |
| `packages/agent-instructions` | Instruction compiler + per-runtime renderers | in-process-import | Compiles task specs → agent instruction bundles | keep-core |
| `packages/agent-runtimes` | Runtime-adapter **contract** (one driver per CLI) | in-process-import | Defines the driver interface the host dispatches through | keep-core |
| `packages/runtime` | THE `RuntimeDriver` impl (claude-code/codex/opencode/pi/in-process) | in-process-import (drives agents as subprocess-cli) | Drives agent CLIs headless, streams RunEvents | keep-core |
| `packages/substrate` | `ConductorSubstrate` over tmux+worktree / Daytona | in-process-import | Provisions isolation; the conductor seam | keep-core |
| `packages/coordination` | Work-locks + A2A bus + handoff + reconciliation | in-process-import | Stops parallel agents colliding | keep-core |
| `packages/governance` | Deny-biased policy chain + Merkle audit + UDS IPC | in-process-import (→ Rust daemon over UDS) | Gates risky launches/writes, fails closed | keep-core |
| `crates/recoder-governance` | Rust governance kernel (Merkle audit, routing, daemon) | subprocess-cli (UDS IPC daemon) | The authority the TS facade delegates to | keep-core |
| `packages/network` | Envoy config gen + ext_authz + XDR pipeline | in-process-import | Backs `network.routes` / `xdr-sink` (cloud path) | keep-core |
| `packages/interop` | Hostile-by-default A2A+MCP signed-ingress gate | in-process-import | Every inbound envelope verified at the edge | keep-core |
| `packages/a2a-sdk` | A2A types, envelope adapters, ingress, validation | in-process-import | Canonicalizes A2A wire contracts | keep-core |
| `shared/src/a2a` | A2A wire-contract spine (task envelopes, control plane) | in-process-import | Single source of truth for TaskEnvelope/audit | keep-core |
| `packages/a2a-js` | Low-level A2A JS SDK (Express-bindable) | in-process-import | Wire transport under the owned a2a-sdk (3 refs) | park |
| `packages/agent-mcp` | MCP host + registry + permissions + servers | in-process-import | Tool RBAC + MCP host | keep-core |
| `packages/agent-schemas` | Runtime-safe Zod guards for Agent OS contracts | in-process-import | Boundary validation (built, **wire-up target**) | wire-up |
| `packages/agent-hooks` | PostToolUse hook helpers (artifact/secret/memory) | subprocess-cli (stdin/stdout CLI) | Deterministic tool-call gating (built, **wire-up**) | wire-up |
| `packages/agent-workflows` | Workflow definitions + runner (DAG nodes) | in-process-import | Verification/approval/deploy pipeline (built, **wire-up**) | wire-up |
| `packages/agent-observability` | Trace/health/evidence contracts | in-process-import | Run observability contracts | keep-supporting |
| `packages/oss-registry` | OSS-component health/license/patch registry | in-process-import | Inventory + governance of OSS deps | keep-core |
| `packages/agent-oss` | OSS adapter boundary (langgraph/crewai/browser-use…) | in-process-import | Pluggable external-agent boundary (built, **wire-up**) | wire-up |
| `packages/pal` | Planning/Allocation Layer (runtime/sandbox/risk selectors) | in-process-import | The decision layer of the run loop (built, **wire-up**) | wire-up |
| `packages/recodergit` | Code-graph contract (symbols/relationships/flows) | in-process-import | Shared schema for the code-knowledge engine | keep-core |
| `ts/recodergit/recodergit` | Code-graph **engine** (tree-sitter, graph, search) | subprocess-cli (MCP/HTTP/CLI) | Indexes repos into a KnowledgeGraph | keep-core |
| `packages/beads-adapter` | bd↔TaskSpec two-way sync | in-process-import | Task tracker sync (built, **wire-up**) | wire-up |
| `packages/vault` | Secret-encryption vault | in-process-import | BYOK secret encryption at rest | keep-supporting |
| `packages/stream` | Public task-stream event protocol | in-process-import | Live task-stream envelope (consumed by backend) | keep-supporting |
| `packages/logger` | pino-backed structured logger | in-process-import | Logging across the host | keep-core |
| `packages/utils` | ID gen + formatting helpers | in-process-import | Shared helpers | keep-core |
| `packages/workspace-utils` | Graph slicing/node grouping for DAGs | in-process-import | Workspace DAG utilities | keep-core |
| `packages/trigger-registry` | Trigger/event registry (GitHub/manual) | in-process-import | Workflow trigger schemas | keep-core |
| `packages/github-tool` | GitHub API client (GraphQL/webhooks/PRs) | in-process-import | GitHub as data source + trigger | keep-core |
| `packages/protocol` | Workflow protocol kernel (actions/triggers/LM/webhooks) | in-process-import | Routes actions/triggers (agency cluster) | keep-core |
| `packages/action-registry` | Provider-agnostic action registry | in-process-import | Action provider lookup | keep-supporting |
| `packages/node-registry` | Graph-node conversion factories | in-process-import | Node definition → runtime form | keep-supporting |
| `packages/data-store-registry` | Data-store provider registry (PostgreSQL) | in-process-import | DB provider plugin lookup | keep-supporting |
| `packages/storage` | Abstract storage driver (fs/memory/S3) | in-process-import | Pluggable blob/JSON storage | keep-core |
| `packages/supabase-driver` | Supabase storage + vault drivers | in-process-import | Production storage/secret backend | keep-supporting |
| `py/ops-recorder` | Python work-signals API (detectors/storage) | http-edge | Agent telemetry/anomaly signals (built, **wire-up**) | wire-up |
| `py/pal-mcp-server` | Supervised multi-model MCP server (~18 tools) | subprocess-cli (stdio MCP) | External PAL/zen tools supervised by interop | park |
| `docker-backend/vendor/opencode` | Un-rebranded opencode clone (sidecar) | subprocess-cli (separate Docker service) | Fallback/reference opencode image | park |

---

## 2. Desktop — `apps/desktop` + cockpit (the paid product, L3)

Electron boots a **local** `docker-backend` (loopback port, `TMUX_BIN`→bundled `c/tmux`),
bundles the Preact cockpit, runs your agents 100% on your Mac, BYOK. The desktop **embeds**
the entire server surface above; only the rows specific to the desktop shell are listed here.

| dir | what it is | integration mode | role on this surface | verdict |
|-----|------------|------------------|----------------------|---------|
| `apps/desktop` | Electron shell: boots backend, deep-link auth, `.dmg` | in-process-import (spawns backend as subprocess) | THE paid product host; supervises the embedded backend | keep-core |
| `apps/desktop/cockpit` | Preact conductor board (queued→running→review→done) | in-process-import (Electron `loadFile`) | The 3-pane operator UI; drives `/api/conductor/*` | keep-core |
| `packages/conductor-ui` | Typed conductor control-plane client + React surface | in-process-import | Isomorphic conductor client for the cockpit (built, **wire-up**) | wire-up |
| `packages/ui-agent-os` | Agent OS UI contract + cockpit-summary | in-process-import | Cockpit view-model from agent-os state | keep-core |
| `c/tmux` | Pinned tmux binary | subprocess-cli (`TMUX_BIN`) | The local `tmux_worktree` substrate backbone | keep-supporting |
| `packages/substrate` | tmux+worktree / Daytona substrate | in-process-import (drives tmux as subprocess) | Provisions the local worktree+tmux session | keep-core |
| `ts/dmux` | Operator console over tmux panes | subprocess-cli | Optional "conduct" view of the tmux grid (never critical-path) | keep-supporting |
| `packages/runtime` | RuntimeDriver impl | in-process-import (drives agents as subprocess-cli) | Runs the user's agent CLI in the worktree | keep-core |
| `packages/design-tokens` | Brand tokens (color/type/spacing) | in-process-import | Visual consistency in the cockpit (built, **wire-up**) | wire-up |
| `packages/ui` | Shared React UI components | in-process-import | Intended shared UI — **zero importers** | drop |
| `shared/src/animations` | Streaming-text animation hooks | in-process-import | Streaming UX (exported but dead-ended, **wire-up**) | wire-up |
| `shared/src/streaming` | React streaming hooks (useAgentStreamCore) | in-process-import | Client-side task-stream consumption | keep-supporting |
| `shared/src/tools` | Tool-call presentation utils | in-process-import | Tool name/icon/format in the UI | keep-core |
| `apps/mobile` | Expo RN companion (monitor/approve on the go) | http-edge (`/api/a2a`) | Mobile client; syncs via the host API | keep-core |

> The desktop is mostly the **server surface re-hosted locally**: every `in-process-import`
> engine from §1 ships inside the `.dmg`. That is the whole point of "runs on your Mac".

---

## 3. MCP / Agents — interop surface

Recoder as a tool other agents and channels drive: an **MCP server** + **A2A** endpoints +
a portable **skill**. MCP servers run as `subprocess-cli` over stdio; the bridge logic is
fused in-process in the host.

| dir | what it is | integration mode | role on this surface | verdict |
|-----|------------|------------------|----------------------|---------|
| `mcp` | A2A bridge / task queue / sandbox-exec MCP server | subprocess-cli (stdio MCP) | THE live in-repo broker for Claude Code | keep-core |
| `packages/recoder-a2a` | Publishable npx MCP server (8 A2A tools) | subprocess-cli (stdio MCP) | Published-npm copy of the bridge for external agents | keep-supporting |
| `packages/agent-mcp` | MCP host + registry + permission contracts | in-process-import | Governs which agents call which tools | keep-core |
| `packages/interop` | Signed A2A+MCP ingress gate | in-process-import | `admitSignedMcpCall` — proves every inbound call | keep-core |
| `packages/a2a-sdk` | A2A envelope/state/error/audit primitives | in-process-import | Canonicalizes A2A across agents | keep-core |
| `shared/src/a2a` | A2A wire-contract spine | in-process-import | TaskEnvelope source of truth | keep-core |
| `packages/a2a-js` | A2A JS wire transport | in-process-import | WS/HTTP envelope framing | park |
| `py/pal-mcp-server` | Multi-model AI tools over MCP (~18 tools) | subprocess-cli (stdio MCP) | Python-native code-review/debug/analyze tools | park |
| `ts/recodergit/recodergit` | Code-graph engine MCP server | subprocess-cli (MCP/HTTP/CLI) | Exposes query/context/impact/trace over MCP | keep-core |
| `packages/recodergit` | Code-graph contract | in-process-import | Shared schema for the recodergit MCP/HTTP/CLI | keep-core |
| `recoder-skill` | Recoder skill descriptor + API reference | doc-or-config | Lets AI agents invoke Recoder (create/prompt/publish) | keep-supporting |
| `mcp/recoder-mcp-server` | Manifest of the 15 canonical MCP servers | doc-or-config | Docs marker; impl in `packages/agent-mcp` | keep-supporting |
| `mcp/recoder-a2a-bridge` | A2A bridge contract manifest | doc-or-config | Docs marker; impl in a2a-sdk/gateway/backend | keep-supporting |
| `mcp/recoder-claude-bridge` | Claude Code adapter boundary manifest | doc-or-config | Docs marker (adapter never owns state) | keep-supporting |
| `mcp/recoder-codex-adapter` | Codex adapter docs + env | doc-or-config | Docs; live entrypoint is the sibling `.js` | keep-supporting |
| `apps/agent-gateway` | Express+WS+A2A/MCP gateway on `:4317` | http-edge | Standalone scale-out of the host (built, **wire-up**) | wire-up |
| `go/beads` | bd issue-graph DB (Dolt) + beads-mcp | subprocess-cli (`bd` + MCP) | Task graph / structured agent memory | keep-core |

---

## 4. Cloud — `recoder.xyz` / `app` + auth + distribution + billing (L3/L4)

The control plane that monetizes + connects the desktop: identity (Better Auth source of
truth), device-flow, entitlements, billing (Polar MoR), downloads.

| dir | what it is | integration mode | role on this surface | verdict |
|-----|------------|------------------|----------------------|---------|
| `app` | Former recoder.xyz Next.js app | http-edge | Orphaned remnant — `package.json` removed, cannot build | drop |
| `packages/web` | Next.js web dashboard (Stripe/Radix/Tailwind) | http-edge | Serves the dashboard at recoder.xyz | keep-core |
| `packages/auth` | Better Auth + Prisma cross-domain session/JWT | in-process-import | Session verification against recoder.xyz authority | keep-core |
| `packages/distribution` | Device-flow auth + entitlement gates + Polar port | in-process-import | Device auth, entitlement resolution, gated delivery | keep-core |
| `py/recoder-billing` | Billing/entitlement engine (license/benefits/IPC) | subprocess-cli (internal IPC + signed envelopes) | Durable money/entitlement/license authority | keep-core |
| `ts/polar` | Polar MoR FastAPI backend (orders/payouts/webhooks) | subprocess-cli (FastAPI ASGI) | Payment/checkout/subscription orchestration | keep-supporting |
| `packages/vault` | Secret-encryption vault | in-process-import | Encrypts model keys / DB creds at rest | keep-supporting |
| `packages/storage` | Abstract storage driver | in-process-import | Pluggable file/state storage | keep-core |
| `packages/supabase-driver` | Supabase storage + vault drivers | in-process-import | Production storage/secret backend | keep-supporting |
| `packages/sdk` | Server-side Studio Runs API client | in-process-import | Headless app execution / file staging | keep-core |
| `packages/http` | JSON-RPC over HTTP router (Giselle context) | http-edge | REST/JSON layer over Giselle | keep-supporting |
| `packages/analytics` | Usage tracking + production monitoring | in-process-import | Telemetry/quality dashboards | keep-supporting |
| `packages/performance` | Redis cache + CDN middleware | in-process-import | Legacy v1 web perf middleware — no importer | drop |
| `crates/tensorzero` | LLMOps gateway/observability platform | http-edge | Candidate LLM gateway — not adopted | park |
| `deploy` | Self-host manifests (compose/Envoy/Packer) | http-edge | Single-command self-hosted control plane | keep-supporting |
| `nginx` | Production reverse proxy / LB | http-edge | L7 routing, TLS termination | keep-supporting |
| `monitoring` | Prometheus/Grafana/AlertManager | http-edge | Observability + alerting | keep-supporting |

---

## 5. Site — marketing / download (L3)

| dir | what it is | integration mode | role on this surface | verdict |
|-----|------------|------------------|----------------------|---------|
| `site` | Next.js marketing/download site | http-edge | Landing, pricing, `.dmg`/brew + self-host funnel | keep-supporting |
| `packages/ui` | Shared React UI (nav/notifications/badge) | in-process-import | Intended shared UI — **zero importers** | drop |
| `packages/design-tokens` | Brand tokens (color/type/spacing) | in-process-import | Visual consistency across surfaces | wire-up |
| `packages/ecosystem-config` | App-id + URL registry | in-process-import | Surfaces agree on ecosystem topology | keep-core |

---

## 6. CLI / Skill — agents drive Recoder (L3)

| dir | what it is | integration mode | role on this surface | verdict |
|-----|------------|------------------|----------------------|---------|
| `packages/cli` | Recoder CLI (`recoder`/`rec`) — AI routing, project lifecycle | in-process-import | User-facing CLI: prompts, projects, auth device flow | keep-core |
| `packages/recoder-cli-router` | Model-routing proxy (Kimi/Qwen/DeepSeek/standard) | subprocess-cli (spawned binary) | Per-task provider selection for BYOK | keep-supporting |
| `packages/recoder-code` | AI terminal IDE (40+ models, tools, MCP) | subprocess-cli (`node cli/run.js`) | Standalone terminal agent product | keep-core |
| `packages/roo-code-types` | Roo-Code provider/model Zod types | in-process-import | Types consumed by the cli-router | park |
| `recoder-skill` | Recoder skill harness for AI agents | doc-or-config | Programmatic Recoder invocation | keep-supporting |
| `tools/strip-workspace` | CLI to strip workspace prompts to node IDs | subprocess-cli | Dev/test utility | keep-supporting |
| `packages/distribution` | Device-flow auth + entitlement gate | in-process-import | CLI auth + gated delivery | keep-core |
| `packages/stream` | Streaming event protocol (SSE parsing) | in-process-import | Live task progression in the CLI | keep-supporting |
| `packages/pseudo-tiktoken` | Lightweight token counter | in-process-import | Cost/usage estimation | keep-supporting |
| `packages/language-model` | Multi-provider LLM abstraction | in-process-import | Model selection + cost tracking | keep-core |

---

## 7. Teams / Enterprise Mesh — cross-machine spine (§3, not local desktop)

The moat: a zero-trust **Envoy** mesh fronting the cloud/team host, **XDR** security
telemetry sealed into the Merkle audit chain, and an **AMI** self-host image. HTTP/gRPC here
is **legitimate cross-machine edge traffic**, not in-process avoidance.

| dir | what it is | integration mode | role on this surface | verdict |
|-----|------------|------------------|----------------------|---------|
| `packages/network` | Envoy v3 config gen + ext_authz + XDR pipeline | in-process-import | Generates Envoy config; default-deny authz; access-log XDR | keep-core |
| `go/recoder-xds` | Live Envoy xDS control plane (ADS gRPC) | subprocess-cli (daemon) | Serves dynamic LDS/CDS/RDS; no-restart config | keep-core |
| `packages/governance` | Deny-biased policy + Merkle audit + UDS IPC | in-process-import | Backs Envoy `ext_authz`; fails closed | keep-core |
| `crates/recoder-governance` | Rust governance kernel (audit/routing/daemon) | subprocess-cli (UDS daemon) | Tamper-evident audit + risk routing | keep-core |
| `packages/security` | Prompt sanitization + SAST + secret detect + compliance | in-process-import | Enterprise security/compliance layer | keep-supporting |
| `packages/coordination` | Work-locks + A2A bus + handoff (cross-machine) | in-process-import | Fleet coordination across machines | keep-core |
| `go/ziti` | OpenZiti zero-trust overlay | vendored-park | Cross-machine encrypted tunneling (thin adapter) | park |
| `go/multica` | Multi-agent task-tracking platform | vendored-park | Source ref for claim/dispatch semantics (ported) | park |
| `py/ops-recorder` | Work-signals API (detectors/storage) | http-edge | Fleet telemetry / anomaly tracking (**wire-up**) | wire-up |
| `crates/openfang` | Rust autonomous-agent runtime | subprocess-cli | Provenance for governance/runtime port (no consumer) | park |
| `deploy` | AMI / compose / Envoy self-host manifests | http-edge | Recoder Cloud as a machine image in the customer VPC | keep-supporting |

---

## 8. Runtime / Engines — the agent drivers + substrates (L0/L1)

How a user's agent actually runs. The drivers are **in-process** in the host; the agent
CLIs they drive run as **`subprocess-cli` under tmux**.

| dir | what it is | integration mode | role on this surface | verdict |
|-----|------------|------------------|----------------------|---------|
| `packages/agent-runtimes` | Runtime-adapter contract (one driver per CLI) | in-process-import | The driver interface | keep-core |
| `packages/runtime` | RuntimeDriver impl (all CLIs) | in-process-import (drives agents as subprocess) | Drives agent CLIs headless, streams RunEvents | keep-core |
| `packages/substrate` | tmux+worktree / Daytona substrate | in-process-import (tmux as subprocess) | Provisions + observes runs; restart-survivable | keep-core |
| `packages/coordination` | Work-locks + dispatch + handoff bus | in-process-import | Deterministic multi-agent orchestration | keep-core |
| `packages/pal` | Planner/runtime/sandbox/skill/risk selectors | in-process-import | The brain of the run loop (**wire-up**) | wire-up |
| `c/tmux` | Pinned tmux binary | subprocess-cli (`TMUX_BIN`) | Terminal session host for agent runs | keep-supporting |
| `ts/dmux` | Operator console over tmux | subprocess-cli | Multi-agent pane grid controller | keep-core |
| `packages/agent-sandbox` | Sandbox provider contracts (Daytona/E2B/local) | in-process-import | Uniform isolation contract for Substrate | keep-supporting |
| `packages/sandbox-daytona` | Vendored Daytona TS SDK | in-process-import | Remote sandbox client (file/git/process) | keep-supporting |
| `packages/daytona-api-client` | Generated Daytona API client | in-process-import | Low-level Daytona HTTP client | keep-supporting |
| `packages/daytona-toolbox-api-client` | Generated Daytona Toolbox client | in-process-import | In-sandbox exec/fs/git client | keep-supporting |
| `packages/agent-oss` | OSS adapter boundary (langgraph/crewai/browser-use…) | in-process-import | Pluggable external-agent frameworks (**wire-up**) | wire-up |
| `packages/agent-workflows` | Workflow definitions + runner | in-process-import | DAG orchestration of tasks/sub-tasks (**wire-up**) | wire-up |
| `apps/agent-worker` | Outbox/queue + workflow worker | subprocess-cli | Drains outbox, runs workflows (**wire-up**) | wire-up |
| `apps/agent-gateway` | Agent lifecycle/dispatch HTTP gateway | http-edge | Task ingestion + event broadcast (**wire-up**) | wire-up |
| **The `pi` engine cluster** | | | | |
| `packages/pi-agent-core` | pi agent loop / harness / compaction | in-process-import | Core agent loop + context management | keep-core |
| `packages/pi-ai` | Multi-provider LLM client (BYOK layer) | in-process-import | Routes to Anthropic/OpenAI/Google/Mistral/Bedrock | keep-core |
| `packages/pi-coding-agent` | The `pi` coding-agent CLI | subprocess-cli | The headless agent the pi driver drives | keep-core |
| `packages/pi-tui` | Terminal-UI toolkit for pi | in-process-import | Markdown/text rendering for pi interactive | keep-supporting |
| **The runtime-driver provenance forks** | | | | |
| `ts/opencode` | opencode runtime monorepo | subprocess-cli | Headless opencode engine (provenance for driver) | keep-core |
| `ts/oh-my-codex` | Codex runtime (config gen / MCP / model select) | subprocess-cli | Codex CLI driver (provenance origin) | keep-core |
| `ts/oh-my-openagent` | opencode harness for Conductor | subprocess-cli | opencode plugin (provenance origin) | keep-core |
| `ts/open-agents` | In-process ToolLoopAgent runtime | in-process-import | Core executor for the in-process driver | keep-core |
| `docker-backend/vendor/opencode` | Un-rebranded opencode clone (sidecar) | subprocess-cli | Fallback/reference opencode image | park |
| `crates/claw-code-parity` | Claude Code parity test harness | subprocess-cli | Parity validation suite | park |
| **LLM provider layer** | | | | |
| `packages/language-model` | Multi-provider LLM abstraction | in-process-import | Provider registry + capability mapping | keep-core |
| `packages/language-model-registry` | LLM registry + resolver | in-process-import | Declarative model registration | keep-core |
| `packages/giselle` | AI SDK abstraction (Claude/OpenAI/Google/FAL) | in-process-import | Multi-LLM routing + streaming | keep-core |
| `packages/pseudo-tiktoken` | Lightweight token counter | in-process-import | Token estimation without external deps | keep-supporting |

---

## 9. Brain / RAG — shared memory + context

The one shared brain every agent reads once: code intelligence, semantic recall, docs,
desktop activity. Heavy stores run as supervised servers (`subprocess-cli` / `http-edge`);
the assembly logic is fused in-process.

| dir | what it is | integration mode | role on this surface | verdict |
|-----|------------|------------------|----------------------|---------|
| `packages/brain` | BrainContext assembly (repo-intel + memory + activity) | in-process-import | Unified context every agent reads once | keep-core |
| `packages/recodergit` | Code-graph contract | in-process-import | Shared schema for the code-knowledge engine | keep-core |
| `ts/recodergit/recodergit` | Code-graph engine (parse/graph/search) | subprocess-cli (MCP/HTTP) | Indexes repos → KnowledgeGraph | keep-core |
| `packages/agent-memory` | Memory store + candidate/review + vector search | in-process-import | Long-term memory lifecycle | keep-core |
| `packages/mem0` | Vendored mem0 TS SDK (semantic recall) | in-process-import (fail-safe dynamic import) | Agent memory over vector store | keep-supporting |
| `py/mem0` | mem0ai Python server | http-edge (`MEM0_BASE_URL`) | Memory backend behind brain | park |
| `packages/rag` | RAG (vector search + embeddings + generation) | in-process-import | Doc retrieval → context generation (**wire-up**) | keep-core |
| `packages/document-preprocessor` | PDF/text/markdown extraction for RAG | in-process-import | Input pipeline for RAG ingestion (**wire-up**) | keep-supporting |
| `packages/web-search` | HTML→Markdown scraper/extractor | in-process-import | Content retrieval for RAG ingestion | keep-supporting |
| `packages/context7-sdk` | Context7 live-docs client | in-process-import | Live API-docs retrieval for the brain | park |
| `packages/continuum` | Whole-desktop activity capture daemon + MCP | subprocess-cli (daemon + MCP) | Brain's activity source (seen/read/typed/heard) | park |
| `py/browser-use` | AI browser agent (CDP) | subprocess-cli | Web automation source for the brain | keep-core |
| `packages/recoder-browser-tools` | Playwright browser tool surface | in-process-import | Navigate/execute-JS/extract for agents (**wire-up**) | keep-core |
| `packages/browser-verification` | Browser verification contracts | in-process-import | Screenshot/assertion/console QA evidence (**wire-up**) | keep-core |
| `packages/langfuse` | LLM observability → Langfuse | in-process-import (→ Langfuse cloud) | Traces RAG/embedding generations | park |
| `crates/lance` | Lance columnar vector format | in-process-import | Intended vector-store substrate (never wired) | park |

---

## 10. Shared / Infra — cross-cutting libraries + CI/ops

| dir | what it is | integration mode | role on this surface | verdict |
|-----|------------|------------------|----------------------|---------|
| `shared/src/a2a` | A2A wire-contract spine | in-process-import | TaskEnvelope/audit source of truth | keep-core |
| `shared/src/streaming` | React streaming hooks | in-process-import | Client task-stream consumption (web/RN) | keep-supporting |
| `shared/src/tools` | Tool-call presentation utils | in-process-import | Tool name/icon/format across surfaces | keep-core |
| `shared/src/animations` | Streaming-text animation hooks | in-process-import | Streaming UX primitives (**wire-up**) | wire-up |
| `ts/extracted-from-openclaw` | `@recoder/connectors` (social-gateway interop) | in-process-import | Trust-gated chat-channel ↔ control-plane bridge | keep-core |
| `packages/utils` | ID gen + formatting | in-process-import | Common helpers everywhere | keep-core |
| `packages/workspace-utils` | Graph slicing/node grouping | in-process-import | Workspace DAG utilities | keep-core |
| `packages/logger` | pino structured logger | in-process-import | Logging across runtimes | keep-core |
| `packages/ecosystem-config` | App-id + URL registry | in-process-import | Ecosystem topology agreement | keep-core |
| `packages/design-tokens` | Brand tokens | in-process-import | Visual consistency (**wire-up**) | wire-up |
| `packages/text-editor` | Tiptap rich-text editor + React | in-process-import | Rich text editing (agency cluster) | keep-core |
| `packages/text-editor-utils` | Tiptap utils (HTML↔MD, highlighting) | in-process-import | Markdown serialization for the editor | keep-supporting |
| `packages/react` | React client lib for Giselle | in-process-import | React hooks over the Giselle engine | keep-core |
| `packages/nextjs` | Next.js Giselle integration | in-process-import | Next app-router Giselle context | keep-core |
| `packages/web-ai-assistant` | AI code completion/refactor module | in-process-import | Pure code-analysis computation | keep-supporting |
| `packages/ui` | Shared React UI components | in-process-import | **Zero importers** | drop |
| `packages/roo-code-types` | Roo-Code types | in-process-import | External Roo IDE contract | park |
| `tools/strip-workspace` | Workspace-prompt stripper | subprocess-cli | CI/dev utility | keep-supporting |
| `nginx` | Production reverse proxy | http-edge | L7 routing / TLS | keep-supporting |
| `monitoring` | Prometheus/Grafana/AlertManager | http-edge | Observability / alerting | keep-supporting |
| `deploy` | Self-host manifests | http-edge | Self-hosted control plane orchestration | keep-supporting |
| `c/tmux` | Pinned tmux binary | subprocess-cli | Session host for agent runs | keep-supporting |

---

## Park (vendored) — kept for provenance / reference / built-sidecar, not on any live surface

| dir | one-line reason |
|-----|-----------------|
| `docker-backend/vendor/opencode` | Un-rebranded opencode clone built as a separate Docker sidecar; the owned fork is `ts/opencode`. |
| `ts/polar` | Near-verbatim Polar MoR Python clone; the owned engine is `py/recoder-billing`. |
| `py/mem0` | Upstream mem0ai server consumed over HTTP (`MEM0_BASE_URL`), not as in-tree source. |
| `py/pal-mcp-server` | Supervised external PAL/zen MCP server (gitignored); not owned code. |
| `packages/a2a-js` | Low-level A2A JS SDK sitting under the owned `a2a-sdk` (3 backend refs). |
| `packages/roo-code-types` | Roo-Code provider types consumed only by the cli-router. |
| `packages/context7-sdk` | Context7 docs client the brain *may* use; thin vendored SDK. |
| `packages/continuum` | Activity-capture vendor fused in-process by the brain (Apache-2.0). |
| `packages/langfuse` | Langfuse observability vendor; zero importers (agency-cluster orphan). |
| `packages/lance` / `crates/lance` | Intended vector-store substrate; never wired. |
| `crates/tensorzero` | LLM-gateway/eval candidate; not adopted. |
| `crates/openfang` | Provenance for the owned governance/runtime port; no live consumer. |
| `crates/claw-code-parity` | Claude Code parity reference harness. |
| `go/ziti` | OpenZiti zero-trust overlay behind a thin adapter; cross-machine only, not local path. |
| `go/multica` | Source ref for coordination claim/dispatch semantics (ported into owned code). |

---

## Drop — genuinely dead, remove

| dir | one-line reason |
|-----|-----------------|
| `app` | Orphaned 11-file remnant; `package.json` removed (1a688bc08) → cannot build. Fix the Dockerfile `COPY` ref. |
| `packages/ui` | Intended shared UI — zero deps, zero imports anywhere. |
| `packages/performance` | Generic Express/Redis perf middleware for the dead v1 web stack; no importer. |

> Not listed here but dropped in `DIRECTORY-MAP.md` (absent from this survey): `packages/plugins`
> (speculative web-builder marketplace) and `py/colbert` (zero-import retrieval engine).
