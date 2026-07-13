# packages/

> Code documentation for `/Users/arhansubasi/recoder.xyz/packages` — the Recoder monorepo's shared package layer.
> Verified by reading manifests and source on 2026-07-01. Document what's verified; vendored/third-party code is flagged.
>
> **Engine update (2026-07-13, `feat/enterprise-s0-p0`).** The Agent-OS **engine program** added new
> **owned engine packages**, each implementing an `agent-os` port and skinned as a governed MCP server
> in `docker-backend`: **`retrieval`** (`@recoder/retrieval` — chunk→embed→Qdrant→ColBERT RAG),
> **`agent-browser`** (`@recoder/agent-browser` — lazy puppeteer / `BROWSER_USE_URL`),
> **`coordination`** (advisory work-locks + conflict detection), **`workflow-engine`**
> (`@recoder/workflow-engine` — verify/hooks over `agent-workflows` + `agent-hooks`), and
> **`agent-notify`** (`@recoder/agent-notify` — webhook to a human channel). `retrieval` supersedes the
> old `rag` (pgvector) via a strangler adapter. All are degrade-safe + unit-tested (built, not
> deployed). See §2 additions + [RECODER-CAPABILITIES](../architecture/RECODER-CAPABILITIES.md).

## 1. Purpose

`packages/` holds the **shared, publishable libraries** of the Recoder platform. It is the home of the **Agent OS control plane** — the domain contracts, policy gates, instruction compiler, event/outbox helpers, memory lifecycle, MCP registry, runtime adapter contracts, and workflow definitions that the rest of the repo (`docker-backend/`, `apps/agent-gateway`, `apps/agent-worker`, the cockpit, CLIs) consumes via `workspace:*` dependencies.

These packages encode the architectural boundary described in `.claude/rules/monorepo.md`: core packages own Recoder state and contracts; runtimes, sandboxes, UIs, and OSS systems are **adapters around that state, never owners of it**. The `@recoder/agent-os` package sits at the root of the dependency graph — almost every other Agent OS package depends on it. There are **66 top-level packages with a `package.json`** here as of 2026-07-13 (down from ~81 — the Giselle cluster, `ts/polar`'s TS twin, and other legacy dirs were deleted in the engine-program cleanup; the new owned engine packages were added). Only a subset are the canonical Agent OS spine, while many others are private internal libs or Recoder-owned vendors of third-party SDKs.

## 2. Layout

This is a pnpm workspace (`packages/*` in `pnpm-workspace.yaml`). Grouped by role (names are the real `package.json` `name`):

### Agent OS core spine (the documented "context hint" packages)

| Dir | Package | Holds |
|-----|---------|-------|
| `agent-os/` | `@recoder/agent-os` | **Root domain core.** `src/domain/` (TaskSpec, TaskRun, RunEvent, Approval, Artifact, WorkLock, MemoryItem, AgentProfile, PolicyDecision, Space, Workspace…), `src/ports/` (artifact-store, event-bus, issue-tracker, memory-store, policy-engine, runtime-adapter, workflow-driver), `src/services/` (task/run/approval/artifact/memory/work-lock/routing services). |
| `a2a-sdk/` | `@recoder/a2a-sdk` | A2A wire SDK: state-mapping, error-mapping, envelope-builders, audit-helpers, validation, ingress normalization, `bridge-contract`, `signing/`, `client/`, `server/`. Re-exports canonical schemas. **Public** (`publishConfig.access: public`). |
| `agent-instructions/` | `@recoder/agent-instructions` | Instruction **compiler**: `compiler.ts`, `agent-os-compiler.ts`, `source-loader.ts`, `provenance.ts`, and per-runtime renderers (claude / codex / recoder-code). |
| `agent-policy/` | `@recoder/agent-policy` | Deterministic policy gates: `engine.ts`, `decision.ts`, `rules/` (approval-required, command-risk, file-access, mcp-tool-risk, network-access, secret-access, tool-use, glob), `evaluators/` (ts-policy-engine, opa-policy-engine). |
| `agent-events/` | `@recoder/agent-events` | CloudEvents + outbox: `cloudevent.ts`, `outbox.ts`, `domain-outbox.ts`, `run-event-mapper.ts`, `domain-event-mapper.ts`, `nats-publisher.ts`, `postgres-publisher.ts`. |
| `agent-memory/` | `@recoder/agent-memory` | Reviewed memory lifecycle: `memory-store.ts`, `memory-candidate.ts`, `memory-review.ts`, `memory-review-workflow.ts`, `vector-search.ts`, `adapters/`. |
| `agent-mcp/` | `@recoder/agent-mcp` | MCP registry + permissions: `registry.ts`, `permissions.ts`, `host/` (mcp-host, tool-router, session-manager, server-registry), `servers/` (~20 MCP servers: tasks, runs, approvals, artifacts, memory, git-nexus, github, repo, workspace, browser, deployment, preview, billing, logs, beads, oss, work-locks…), `policy/` (permission-check, tool-risk, audit). |
| `agent-runtimes/` | `@recoder/agent-runtimes` | Runtime adapter **contract**: `AgentRuntimeAdapter` interface, `runtime-events.ts`, `runtime-errors.ts`, `adapters/`. |
| `agent-workflows/` | `@recoder/agent-workflows` | Workflow definitions + driver: `workflow-definition.ts`, `workflow-runner.ts`, `nodes/`. |

### Other Agent OS / control-plane packages

| Dir | Package | Holds |
|-----|---------|-------|
| `agent-schemas/` | `@recoder/agent-schemas` | Runtime-safe schema guards with no provider deps. |
| `agent-observability/` | `@recoder/agent-observability` | Observability contracts for runs/components/artifacts. |
| `agent-oss/` | `@recoder/agent-oss` | OSS adapter boundary contracts. |
| `agent-hooks/` | `@recoder/agent-hooks` | Deterministic hook policy helpers. |
| `agent-sandbox/` | `@recoder/agent-sandbox` | Sandbox provider contracts (Daytona/E2B/local). |
| `beads-adapter/` | `@recoder/beads-adapter` | `bd` (beads) issue-graph ↔ TaskSpec sync adapter. |
| `recodergit/` | `@recoder/recodergit` | Repo-intelligence / context-pack contracts (dependency of `agent-mcp`). |
| `pal/` | `@recoder/pal` | Planner + agent-team routing layer. |
| `oss-registry/` | `@recoder/oss-registry` | OSS component registry + health descriptors. |
| `browser-verification/` | `@recoder/browser-verification` | Preview/Playwright MCP verification contracts. |
| `ui-agent-os/` | `@recoder/ui-agent-os` | Shared UI contracts for cockpit surfaces. |
| `governance/` | `@recoder/governance` | Deny-biased policy chain over `agent-policy` + Merkle audit chain; fails safe when the Rust governance daemon is down. |
| `coordination/` | `@recoder/coordination` | Work-locks + dependency-aware dispatch + A2A handoff bus + shared-state coherence. **Owned engine** (E13): advisory lock store + conflict detection, skinned as MCP `coordination` (`recoder_coordination_*`), multica-ready. |
| `retrieval/` | `@recoder/retrieval` | **NEW owned engine** (E2): RAG pipeline chunk→embed→Qdrant→ColBERT-rerank, skinned as MCP `retrieval` (`recoder_retrieval_search/_ingest`). Degrade: `not_configured` without embeddings/QDRANT. Supersedes `rag`. |
| `agent-browser/` | `@recoder/agent-browser` | **NEW owned engine** (E9): injectable browser driver (lazy puppeteer / `BROWSER_USE_URL`), skinned as MCP `browser-use` (`recoder_browser_navigate/_extract`). Degrade: `not_configured` without a driver. |
| `workflow-engine/` | `@recoder/workflow-engine` | **NEW owned engine** (E12): skins `agent-workflows` + `agent-hooks` as MCP `workflow` (`recoder_workflow_verify/_capture_hook`). Verify exec opt-in via `RECODER_WORKFLOW_VERIFY`. |
| `agent-notify/` | `@recoder/agent-notify` | **NEW owned engine** (Phase 5): webhook to a human channel, skinned as MCP `notify` (`recoder_notify`) — the human-in-the-loop close. Degrade: `not_configured` without `RECODER_NOTIFY_URL`/`SLACK_WEBHOOK_URL`. |
| `interop/` | `@recoder/interop` | A2A wire + MCP host gate + connector gateways (hostile-by-default). |
| `network/` | `@recoder/network` | Envoy control plane: v3 bootstrap config gen + ext_authz default-deny + access-log pipeline. |
| `runtime/` | `@recoder/runtime` | Drives user coding-agent CLIs headless behind one driver; streams bytes as RunEvents. |
| `substrate/` | `@recoder/substrate` | Swappable, restart-survivable execution layer (worktrees/tmux/Daytona) under Conductor workspaces. |
| `brain/` | `@recoder/brain` | Fuses git-nexus + mem0 + context7 + beads into one `BrainContext`. |
| `distribution/` | `@recoder/distribution` | CLI device-flow auth, Polar billing port, packaging, gated delivery. |

### Recoder-owned vendors of third-party SDKs (private, "merged from upstream")

`a2a-js` (A2A JS SDK), `context7-sdk`, `mem0`, `continuum`, `daytona-api-client`, `daytona-toolbox-api-client`, `sandbox-daytona` (Daytona TS SDK), `pi-agent-core` / `pi-ai` / `pi-coding-agent` / `pi-tui` (the `pi` runtime). These are **fused, not wrapped** — edited in-repo, not pulled as npm deps.

### Standalone apps / CLIs / UIs (not pure libraries)

`recoder-a2a` (A2A MCP server), `recoder-cli-router` (LLM provider router), `recoder-code` (a **nested npm workspace**, name `recoder-code-workspace`, see Gotchas), `conductor-ui`, `web`, `cli/` (no package.json), `ui/` / `plugins/` / `performance/` (no package.json — placeholder/empty).

### Generic shared libs & private internals

`shared` (`recoder-shared`), `analytics`, `auth`, `http`, `logger`, `storage`, `stream`, `vault`, `utils`, `react`, `nextjs`, `web-search`, `rag`, `security`, `document-preprocessor`, `recoder-browser-tools`, `web-ai-assistant`, `language-model`(+`-registry`), `node-registry`, `trigger-registry`, `action-registry`, `data-store-registry`, `text-editor`(+`-utils`), `supabase-driver`, `pseudo-tiktoken`, `roo-code-types`, `giselle`, `protocol`, `sdk`, `langfuse`, `design-tokens`, `tsconfig`, `ecosystem-config`, `workspace-utils`.

## 3. Entry points

Start reading here:

- **Domain root:** `packages/agent-os/src/index.ts` → re-exports `./domain`, `./ports`, `./services`.
- **TaskSpec & state machine:** `packages/agent-os/src/domain/task-spec.ts:23` (`TaskSpec`), `:43` (`TaskRunState` union — `created → compiled → routed → claimed → running → … → completed`), with `TERMINAL_TASK_RUN_STATES`.
- **RunEvent contract:** `packages/agent-os/src/domain/event.ts:14` (`RunEvent` type) and `:3` (`RunEventType`).
- **Runtime adapter contract:** `packages/agent-runtimes/src/index.ts` — `AgentRuntimeAdapter` interface (`sendTask(): AsyncIterable<RunEvent>`, `health`, `capabilities`, `cancel`, optional `start`/`approve`) plus `createRuntimeEvent` / `collectRuntimeEvents` helpers.
- **A2A SDK surface:** `packages/a2a-sdk/src/index.ts` — large re-export barrel; the JSDoc header lists every sub-module and the canonical types it re-exports.
- **Policy engine:** `packages/agent-policy/src/index.ts` → `engine.ts` + `rules/` + `evaluators/`.
- **MCP host/registry:** `packages/agent-mcp/src/index.ts` → `registry`, `permissions`, `host/`, `servers/`, `policy/`.
- **Instruction compiler:** `packages/agent-instructions/src/index.ts` — `compileInstructionBundle`, `compileAgentOsInstructionBundle`, the three runtime renderers.
- **Package main fields:** every Agent OS package exposes `main: ./dist/index.js`, `module: ./dist/index.mjs`, `types: ./dist/index.d.ts` (built by `tsup`). `a2a-sdk` adds many fine-grained subpath exports (`./schemas`, `./state-mapping`, `./bridge-contract`, etc.).

## 4. Build / run / test

Per-package scripts are uniform across the Agent OS spine (verified in their `package.json`):

| Script | Command |
|--------|---------|
| `build` | `tsup` |
| `check-types` | `tsc --noEmit` |
| `clean` | `rm -rf .turbo dist node_modules` |
| `test` (most core pkgs) | `node --test --import tsx src/**/*.test.ts` |
| `test` (a2a-sdk, agent-instructions, + many others) | `vitest run` |
| `format` (a2a-sdk) | `biome check --write .` |

Note the **two test-runner conventions** coexist: `agent-os`, `agent-policy`, `agent-events`, `agent-memory`, `agent-mcp`, `agent-runtimes`, `agent-workflows`, `agent-hooks`, `agent-schemas`, `agent-observability`, `agent-oss` use **`node --test` + `tsx`**; `a2a-sdk`, `agent-instructions`, and many leaf packages use **`vitest`**. Pick the right one per package.

**Build the whole Agent OS spine at once** from the repo root (`package.json`):

```bash
pnpm run build:agent-os
```

This filter-builds, in dependency order: `agent-os → agent-schemas → agent-events → agent-policy → agent-memory → agent-mcp → agent-workflows → agent-runtimes → agent-oss → beads-adapter → recodergit → pal → oss-registry → agent-sandbox → browser-verification → ui-agent-os → agent-observability`, then the gateway/worker apps.

Other root entry points: `pnpm run dev:agent-os` (engine + agent-gateway + agent-worker), `pnpm install --recursive`. There is **no Cargo.toml / pyproject** in `packages/` itself — these are TypeScript packages.

## 5. Key patterns & contracts

- **`@recoder/agent-os` is the contract root.** Almost every Agent OS package lists `"@recoder/agent-os": "workspace:*"` and imports its domain types (`TaskSpec`, `RunEvent`, `Approval`, `RuntimeHealth`, etc.). Do not duplicate these types in adapters — import them.
- **`RunEvent` is the universal runtime telemetry record** (`agent-os/src/domain/event.ts`). Runtimes don't return results; they yield an `AsyncIterable<RunEvent>` from `sendTask`. `RunEventType` = `started | state_transition | log | artifact | needs_input | verified | approval_requested | handoff | failed | completed`. `agent-runtimes` and `agent-events` both build/map these; `agent-events/run-event-mapper.ts` maps RunEvents to CloudEvents/outbox.
- **TaskRun state machine** lives in `agent-os/src/domain/task-spec.ts` with an explicit `TaskRunState` union and `TERMINAL_TASK_RUN_STATES`. `a2a-sdk/state-mapping.ts` maps native connector states (Codex/Claude) ↔ canonical A2A `TaskState` and enforces `ALLOWED_STATE_TRANSITIONS`.
- **Ports & adapters (hexagonal).** `agent-os/src/ports/` defines abstract interfaces (`PolicyEngine`, `EventBus`, `MemoryStore`, `ArtifactStore`, `RuntimeAdapter`, `WorkflowDriver`, `IssueTracker`). Concrete implementations live in sibling packages (`agent-policy` implements policy, `agent-events` implements the bus, `beads-adapter` implements the tracker, etc.).
- **Deny-biased policy + audit.** `agent-policy` returns explicit `PolicyDecision`s; `governance` chains them deny-first and adds a SHA-256 Merkle audit chain that **fails safe (DENY / needs_approval)** when the Rust governance daemon is down. MCP tool calls go through an `authorize → risk → policy → audit` gate (`interop`, `agent-mcp/policy/`).
- **Instruction provenance.** `agent-instructions/provenance.ts` hashes instruction sources (`sha256Hex`) and builds an `InstructionBundleProvenance` so compiled bundles are auditable artifacts (consistent with the repo rule "preserve compiled instruction bundles as auditable artifacts").
- **Memory is candidate-then-reviewed.** `agent-memory` models `MemoryCandidate` + a `memory-review-workflow`; durable memory is never written directly (matches `.claude/rules/agent-os.md`).
- **A2A SDK is the single import surface** for connectors: import from `@recoder/a2a-sdk` rather than reaching into `@recoder/shared/a2a/schemas` (it re-exports all canonical types). Canonical wire types from the owned `a2a-js` SDK are namespaced as `CanonicalA2A` to avoid colliding with Recoder's intentionally-divergent domain types.

## 6. Gotchas

- **dist-vs-src:** every Agent OS package ships a built `dist/` (verified present for all core packages). `package.json` `main`/`module`/`types` point at `dist/`, and `files: ["dist"]`. Edit `src/`, then `tsup` rebuilds — consumers resolving via `dist` won't see uncompiled source changes until a build. The root `build:agent-os` order matters because of `workspace:*` deps.
- **Two test runners** (see §4): half the core packages use `node --test --import tsx`, the other half use `vitest`. Running the wrong command silently does nothing useful. Check the package's own `test` script.
- **`recoder-code/` is a nested npm workspace, not a normal package.** Its `package.json` is `recoder-code-workspace` (private), uses **npm + jest** (not pnpm/tsup/vitest), and contains its own `packages/` subtree (`core`, `cli`, `mcp-eternos`, `vscode-ide-companion`). Don't treat it like the flat Agent OS packages.
- **Many packages are Recoder-owned vendors "merged from upstream"** (`a2a-js`, `context7-sdk`, `mem0`, `continuum`, `daytona-api-client`, `daytona-toolbox-api-client`, `sandbox-daytona`, `pi-*`). They are private, fused into the repo (edited in place), and may diverge from upstream — treat them as owned code, but expect third-party style/structure.
- **Placeholder/empty dirs:** `cli/`, `ui/`, `plugins/`, `performance/` have **no `package.json`** and are not workspace packages.
- **Naming inconsistency:** package directory names don't always match the npm name — e.g. `analytics/` → `recoder-analytics`, `security/` → `recoder-security` (description still references the legacy "CodeCraft CLI"), `shared/` → `recoder-shared`, `recoder-code/` → `recoder-code-workspace`. Resolve packages by npm name, not folder name.
- **`giselle/`** is a private leftover (the agency app moved to `recoder-agency/` per project memory); low signal here.
- **Workspace excludes** (`pnpm-workspace.yaml`): `dist`, `.next`, `build`, `coverage`, `.turbo`, `packages-local-backup`, `infra`, and `apps/desktop` are excluded from the workspace globs — don't expect them to participate in `pnpm -r` runs.
- **`agent-mcp` depends on `@recoder/recodergit`** (repo intelligence) in addition to `agent-os`/`agent-policy`/`agent-memory`, so it sits relatively high in the build order.
