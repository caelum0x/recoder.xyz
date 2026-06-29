# Recoder — Directory List (status at a glance)

> A readable index of every meaningful tree → its role → its status. This is the
> quick-scan companion to [`DIRECTORY-MAP.md`](./DIRECTORY-MAP.md) (the canonical,
> evidence-cited map with `UsedBy` columns) and [`ARCHITECTURE.md`](./ARCHITECTURE.md)
> (the layered design). Where the two differ, DIRECTORY-MAP is authoritative.
>
> Status legend: **keep-core** · **keep-supporting** · **keep-used** (owned + now
> consumed on a product path) · **keep-wired** (degrade-safe optional seam) ·
> **wire-up** (built, not yet consumed) · **park** (vendor/provenance, do not delete)
> · **held** (auth/deploy-sensitive, untouched) · **drop** (dead, remove).

## L0 · Substrate

| Dir | Role | Status |
|-----|------|--------|
| `c/tmux` | Pinned tmux binary the Conductor drives (tmux+worktree backbone) | keep-core |
| `packages/substrate` | Owned `ConductorSubstrate` over tmux+worktree / Daytona | keep-core |
| `ts/dmux` | `@recoder/dmux` — tmux orchestrator CLI + operator console | keep-used |
| `packages/agent-sandbox` | Remote-substrate provider abstraction (daytona/e2b/local) | keep-supporting |
| `packages/sandbox-daytona` | Owned Daytona TS SDK on the owned api-clients | keep-supporting |
| `packages/daytona-api-client` | OpenAPI client for the Daytona platform API | keep-supporting |
| `packages/daytona-toolbox-api-client` | OpenAPI client for in-sandbox toolbox ops | keep-supporting |

## L1 · Engines (owned spine)

| Dir | Role | Status |
|-----|------|--------|
| `packages/agent-os` | Canonical state spine (domain models + ports); most-imported | keep-core |
| `packages/runtime` | The `RuntimeDriver` impl driving agent CLIs headless | keep-core |
| `packages/agent-runtimes` | Runtime-adapter contract (one driver per CLI) | keep-core |
| `packages/agent-instructions` | Instruction compiler + per-runtime renderers + provenance | keep-core |
| `packages/governance` | Policy/approval/audit kernel; ext_authz backing | keep-core |
| `packages/agent-policy` | Deterministic policy engine (allow/needs_approval/deny) | keep-core |
| `packages/interop` | Hostile-by-default A2A + MCP + signed-ingress gate | keep-core |
| `packages/a2a-sdk` | Owned A2A interop SDK (types, envelopes, ingress) | keep-core |
| `packages/agent-mcp` | MCP host + registry + permissions + first-party servers | keep-core |
| `packages/agent-events` | CloudEvents + transactional outbox (NATS + Postgres) | keep-core |
| `packages/coordination` | Work-locks + reaper + conflict detection + A2A bus + handoff | keep-core |
| `packages/brain` | BrainContext assembly, mem0, beads, continuum, doctors | keep-core |
| `packages/recodergit` | Owned code-graph engine (indexer, dep/impact, MCP) | keep-core |
| `packages/agent-memory` | Memory store + candidate/review + vector search | keep-core |
| `packages/oss-registry` | OSS-component registry (health/license/ownership) | keep-core |
| `crates/recoder-governance` | Owned Rust governance workspace (Merkle audit + UDS daemon) | keep-core |
| `packages/pi-agent-core` | pi agent loop/harness (fused `pi` engine) | keep-core |
| `packages/pi-ai` | Unified multi-provider LLM client (BYOK for pi) | keep-core |
| `packages/pi-coding-agent` | The `pi` coding-agent CLI (headless engine) | keep-core |
| `packages/pi-tui` | Terminal-UI toolkit for pi's interactive mode | keep-supporting |
| `packages/recoder-code/packages/core` | Agent core (tool loop, MCP, code-graph) | keep-core |
| `packages/recoder-code/packages/cli` | `recoder-code` terminal agent CLI | keep-core |
| `packages/recoder-code/packages/vscode-ide-companion` | VS Code companion (optional surface) | keep-supporting |
| `packages/recoder-code/packages/mcp-eternos` | Unrelated bundled `eternos` MCP server | park |
| `packages/recoder-cli-router` | Model-routing proxy backing BYOK (claude-code-router fork) | keep-supporting |
| `packages/roo-code-types` | Roo-Code provider/model Zod types for the cli-router | park |
| `packages/mem0` | Owned TS vendor of mem0-ts + self-host build | keep-supporting |
| `packages/network` | Envoy control-plane config + default-deny ext_authz + XDR | keep-core |
| `packages/context7-sdk` | Context7 docs-API client for the Brain | park |
| `packages/continuum` | Fused-in-process activity engine (brain imports it) | park |
| `py/recoder-billing` | First-party billing/entitlement engine (Polar MoR fused) | keep-core |
| `py/pal-mcp-server` | Supervised external PAL/zen multi-model MCP server | park |
| `py/mem0` | Upstream mem0 server consumed over HTTP (`MEM0_BASE_URL`) | park |
| `py/browser-use` | Upstream browser-use reference (Python) | park |

### Engines — built but not yet consumed (WIRE-UP)

| Dir | Role | Status |
|-----|------|--------|
| `packages/agent-workflows` | Workflow definitions + runner | keep-supporting (wired) |
| `packages/pal` | Planning & Allocation Layer (routing/runtime/risk selectors) | keep-supporting (wired) |
| `packages/agent-oss` | OSS adapter boundary (langgraph/crewai/e2b/daytona/…) | keep-supporting (wired) |
| `packages/agent-hooks` | Deterministic PostToolUse hook helpers | keep-supporting (wired) |
| `packages/agent-schemas` | Runtime-safe Zod guards for Agent OS contracts | keep-supporting (wired) |
| `packages/beads-adapter` | Two-way sync between bd graph and Agent OS TaskSpecs | keep-supporting (wired) |
| `packages/document-preprocessor` | RAG doc ingestion (PDF/text/markdown) | keep-supporting (wired) |
| `py/ops-recorder` | FastAPI work-signals service (stuck-work detection) | wire-up |

### Customized `ts/*` engines (repo-preferred BYOK subprocesses)

> The runtime drivers prefer these repo-built engines over global PATH via the
> `repo_engine` tier (`packages/runtime/src/drivers/shared/repo-engine-locator.ts`),
> degrade-safe (falls back to PATH when the build is absent).

| Dir | Role | Status |
|-----|------|--------|
| `ts/opencode` | `@recoder/opencode` — forked opencode CLI + ACP types | keep-used |
| `ts/oh-my-codex` | `@recoder/codex-runtime` — `omx` CLI (codex surface) | keep-used |
| `ts/oh-my-openagent` | `@recoder/opencode-harness` — `oh-my-opencode` harness | keep-used |
| `ts/open-agents` | Source for `runtime/drivers/in-process/*` | keep-used |
| `ts/recodergit` | `@recoder/recodergit-engine` — recodergit code-graph CLI | keep-used |
| `ts/polar` | Customized Polar (MoR) TS tree under `ts/*` | keep-used |
| `ts/extracted-from-openclaw` | `@recoder/connectors` — trust-gated chat↔control bridge | keep-core |

### Provenance / never-wired upstreams (PARK)

| Dir | Role | Status |
|-----|------|--------|
| `crates/openfang` | Source-of-record for the owned governance/runtime port | park |
| `crates/lance` | Intended vector store, never wired | park |
| `crates/tensorzero` | LLM-gateway candidate, not adopted | park |
| `crates/claw-code-parity` | Harness-parity reference | park |
| `go/multica` | Coordination claim/dispatch source ref (ported into owned) | park |
| `ts/polar` (Python clone) → see `ts/polar` above; owned engine is `py/recoder-billing` | | |

## L2 · Runtime Host

| Dir | Role | Status |
|-----|------|--------|
| `docker-backend/src` | THE backend product — Express/express-ws host mounting L1 | keep-core |
| `docker-backend/vendor/opencode` | Un-rebranded opencode built as `opencode-service` sidecar | park |

## L3 · Surfaces

| Dir | Role | Status |
|-----|------|--------|
| `apps/desktop` | THE paid product — Electron boots embedded backend + cockpit | keep-core |
| `packages/ui-agent-os` | Backend-free cockpit summary view-model | keep-core |
| `apps/agent-gateway` | Standalone Express+WS+A2A/MCP gateway (scale-out) | keep-supporting |
| `apps/agent-worker` | Outbox/queue + workflow worker (scale-out) | keep-supporting |
| `apps/mobile` | RN+Expo companion (monitor/approve via `/api/a2a`) | keep-supporting |
| `packages/conductor-ui` | Typed conductor control-plane client for the cockpit | keep-supporting (wired) |
| `site` | Next.js marketing/download site | keep-supporting |
| `recoder-skill` | Installable agent Skill wrapping the Recoder public API | keep-supporting |
| `packages/recoder-a2a` | Publishable npx MCP server (8 A2A tools) | keep-supporting |
| `homebrew-recoder` | Homebrew cask tap (distribution) | keep-supporting |
| `packages/design-tokens` | Shared design tokens (cockpit) | keep-supporting (wired) |
| `mcp/recoder-mcp-server` | Manifest of canonical MCP servers (impl in agent-mcp) | keep-supporting |
| `mcp/recoder-a2a-bridge` | A2A bridge contract manifest | keep-supporting |
| `mcp/recoder-claude-bridge` | Claude Code adapter boundary manifest | keep-supporting |
| `mcp/recoder-codex-adapter` | Codex adapter docs/.env (live entrypoint is the sibling `.js`) | keep-supporting |
| `app` | Auth/deploy-sensitive slice of the legacy recoder.xyz Next app | held |
| `packages/ui` | Intended shared cross-app React UI; zero importers | drop |

## L4 · Distribution

| Dir | Role | Status |
|-----|------|--------|
| `packages/distribution` | Device-flow auth + channel publishers + entitlement gates | keep-core |
| `packages/auth` | Better Auth + Prisma cross-domain session/JWT | keep-supporting |
| `packages/vault` | Secret-encryption vault (BYOK at rest) | keep-supporting |

## §3 · Cloud / Teams / Enterprise

| Dir | Role | Status |
|-----|------|--------|
| `go/recoder-xds` | Go Envoy xDS control plane (LDS/CDS/RDS over ADS) | keep-supporting |
| `go/beads` | The `bd` issue tracker (brain shells out to it) | keep-supporting |
| `go/ziti` | OpenZiti zero-trust overlay behind a thin owned adapter | park |
| `deploy` | Packaging/deploy assets (electron-builder, compose, packer refs) | keep-supporting |

## Cross-cutting

| Dir | Role | Status |
|-----|------|--------|
| `shared/src/a2a` | A2A wire-contract spine (envelopes, control-plane, audit) | keep-core |
| `shared/src/streaming` | Streaming engine for live agent output | keep-supporting |
| `shared/src/tools` | Tool-call presentation utils | keep-supporting |
| `shared/src/animations` | Streaming-text animation hooks (cockpit Preact entry) | keep-supporting (wired) |
| `shared/src/{constants,errors,types,utils}` | Shared primitives | keep-supporting |
| `tools` | CI (a2a-interop, security-secrets, branding-drift, evals, tsconfig) | keep-supporting |
| `packages/tsconfig` | Shared base tsconfigs (`extends`) | keep-supporting |
| `packages/ecosystem-config` | Shared app-id + URL registry | keep-supporting |
| `packages/agent-observability` | Observability/evidence/health contracts | keep-supporting |
| `packages/stream` | Public task-stream event protocol (backend consumes) | keep-supporting |
| `packages/browser-verification` | Browser-verification contract (run-loop node) | keep-supporting (wired) |
| `packages/recoder-browser-tools` | Playwright browser tool surface | wire-up |
| `tasks` | Internal lessons.md + todo.md planning ledger (not product) | keep-supporting |
| `turbo` | `turbo gen` SDK-package generators | keep-supporting |
| `config`, `monitoring`, `nginx`, `scripts`, `tests`, `data`, `logs`, `issues` | Repo infra (config, ops, CI scripts, fixtures, runtime data) | keep-supporting |

## Giselle / recoder-agency cluster (second product lineage — PARK)

Self-contained Giselle visual-workflow subgraph; none imported by
`docker-backend`/`apps/desktop`/the conductor. Park under a labeled vendor/agency area.

| Dirs | Status |
|------|--------|
| `packages/giselle`, `protocol`, `react`, `nextjs`, `http`, `logger`, `langfuse`, `language-model(-registry)`, `node-registry`, `github-tool`, `rag`*, `storage`, `supabase-driver`, `text-editor(-utils)`, `trigger-registry`, `workspace-utils`, `web-search`, `web`, `web-ai-assistant`, `sdk`, `pseudo-tiktoken`, `a2a-js` | park |
| `packages/action-registry`, `data-store-registry`, `utils` (owned cluster leaves with live importers) | keep-supporting |

> *`packages/rag` is the agency cluster's RAG package; its ColBERT reranker is the
> seam that wires `py/colbert` (keep-wired) when `COLBERT_RERANK_URL` is set.

## Cut from the architecture (legacy v1 lineage — DROP)

| Dir | Why | Status |
|-----|-----|--------|
| `packages/performance` | Express/Redis perf middleware for dead v1 web stack; no importer | drop |
| `packages/plugins` | Speculative v1 plugin marketplace; owned by agent-mcp/oss-registry now | drop |
| `packages/cli` | Legacy `recoder-cli`; conductor commands ported into `recoder-code` first | drop |
| `packages/analytics` | Legacy v1 analytics; sole consumer (cli) dropped | drop |
| `packages/security` | Legacy CLI security; superseded by governance; sole consumer dropped | drop |
| `packages/shared` | Legacy `recoder-shared` grab-bag; consuming CLI cluster dropped | drop |

> **`py/colbert` is NOT dropped** — reclassified 2026-06-29 to **keep-wired** (the
> optional RAG reranker). See L1 / the Giselle-cluster note above.
