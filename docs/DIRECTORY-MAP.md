# Recoder — Directory Map

> The canonical map of **every** monorepo directory to the product. Each directory
> is placed in its [ARCHITECTURE.md](./ARCHITECTURE.md) layer (L0 substrate · L1
> engines · L2 host · L3 surfaces · L4 distribution · cross-cutting · §3 cloud /
> enterprise) and given a keep / wire-up / park / drop verdict.
>
> Verdicts and states are taken from the directory inventory — they cite the real
> wiring (importers, refs, build artifacts) found in the repo, not aspiration.

## Legend

**Kind**
- `owned-first-party` — written here, ours, no upstream lineage.
- `owned-fork` — vendored from upstream, rebranded + owned in place (`@recoder/*`).
- `vendored-clone` — upstream clone kept as-is (often gitignored), reference or built-as-sidecar.
- `generated` — codegen output (OpenAPI), regenerated not hand-edited.
- `dead` — broken / orphaned remnant that no longer builds or is imported.

**State** (as found in the inventory)
- `live` — actively imported / spawned by a shipping surface.
- `built` — compiles + has `dist`/binary, but **no runtime consumer** yet.
- `partial` — some wiring, thin or non-default-path adoption.
- `scaffold` — contract/types/manifest only, no implementation.
- `unused` — present, zero importers.
- `dead` — cannot build / pure remnant.

**Verdict**
- `keep-core` — load-bearing on the critical path of the desktop/Agent-OS product. Do not touch except to extend.
- `keep-supporting` — real, useful, off the critical path (CI, optional surfaces, infra libs). Keep.
- `wire-up` — **built-but-unused first-party** code that should be connected into the product (see WIRE-UP backlog).
- `park-vendor` — vendored clone / fork tree that should move to a labeled `vendor/` area, not deleted (provenance / reference / built-sidecar value).
- `drop` — genuinely dead. Remove.

---

## L0 · Substrate — where agents physically run

| Dir | Kind | State | Role | UsedBy | Verdict |
|-----|------|-------|------|--------|---------|
| `c/tmux` | vendored-clone | live | The `tmux_worktree` backbone; pinned tmux binary the Conductor drives via CLI (node-pty reverted). | `docker-backend/.../conductor/tmux-path.ts` (`TMUX_BIN`), build-tmux scripts, Makefile, Dockerfile. | **keep-core** |
| `packages/substrate` | owned-first-party | partial | The owned `ConductorSubstrate` contract over tmux+worktree (local) and Daytona (remote); the first-class promotion of `docker-backend/src/conductor/*`. | docker-backend conductor (`runtime-commands.ts`, `run-tailer.ts`, `substrate-daytona.ts`, `review.ts`). 60+ tests. | **keep-core** |
| `ts/dmux` | owned-fork | built | `@recoder/dmux` — optional Ink/React TUI operator console over the tmux substrate. Explicitly never on the critical path. | `docker-backend/.../conductor/dmux-adapter.ts` (new), `conductor.routes.ts`, `conductor-health.ts`. Spawned binary. | **keep-supporting** |
| `packages/agent-sandbox` | owned-first-party | partial | Remote-substrate provider abstraction (daytona / e2b / local-container). | `packages/runtime` only (1 ref). | **keep-supporting** |
| `packages/daytona-api-client` | generated | built | OpenAPI client for the Daytona remote-sandbox platform API. | `packages/sandbox-daytona` (8 refs). | **keep-supporting** |
| `packages/daytona-toolbox-api-client` | generated | built | OpenAPI client for in-sandbox toolbox ops (exec/fs/lsp). | `packages/sandbox-daytona` (13 refs). | **keep-supporting** |
| `packages/sandbox-daytona` | owned-fork | built | Owned vendor of the Daytona TS SDK rewired onto the owned `daytona-*-api-client`; underpins the Daytona substrate. | `docker-backend` (package.json dep). | **keep-supporting** |

---

## L1 · Engines — the owned brains

### Core spine + governance + interop + brain (live)

| Dir | Kind | State | Role | UsedBy | Verdict |
|-----|------|-------|------|--------|---------|
| `packages/agent-os` | owned-first-party | live | Canonical state spine: domain models + ports (event-bus/policy/runtime/memory/artifact/workflow). Every engine is an adapter around this. | The whole monorepo — docker-backend, both apps, ~24 packages (**254 refs**, most-imported). | **keep-core** |
| `packages/runtime` | owned-first-party | live | THE `RuntimeDriver` impl (claude-code/codex/opencode/pi/recoder-code/in-process); drives the agent CLIs headless, streams RunEvents. | docker-backend conductor, agent-worker, agent-os (11 refs at the seam). | **keep-core** |
| `packages/agent-runtimes` | owned-first-party | live | Owns the runtime-adapter **contract** (one driver per CLI). | agent-gateway, agent-worker, runtime, agent-oss (45 refs). | **keep-core** |
| `packages/agent-instructions` | owned-first-party | live | Instruction compiler + per-runtime renderers (claude/codex/opencode/gemini/qwen/recoder-code) + provenance. | docker-backend, agent-gateway (6 refs). | **keep-core** |
| `packages/governance` | owned-first-party | live | Policy/approval/audit kernel: deny-biased chain, risk routing, SHA-256 Merkle audit, fail-closed UDS IPC to the Rust daemon. Also `ext_authz` backing for Envoy. | docker-backend (network/governance-ports, agent-os routes), `packages/network`. | **keep-core** |
| `packages/agent-policy` | owned-first-party | live | Deterministic policy engine (allow/needs_approval/deny) gating launches + risky writes. | docker-backend, agent-worker, desktop, agent-mcp, governance (28 refs). | **keep-core** |
| `packages/interop` | owned-first-party | live | Hostile-by-default A2A + MCP + signed-ingress gate (authorize→risk→policy→audit); every inbound envelope untrusted. | docker-backend (interop-host, mcp-control, a2a signed-ingress). 54 tests. | **keep-core** |
| `packages/a2a-sdk` | owned-first-party | live | Owned A2A interop SDK: canonical types, envelope adapters, ingress, validation. | docker-backend, agent-gateway, agent-instructions, coordination, interop (51 refs). | **keep-core** |
| `packages/agent-mcp` | owned-first-party | live | MCP host + registry + permissions + first-party MCP servers. | docker-backend, agent-gateway, interop (20 refs). | **keep-core** |
| `packages/agent-events` | owned-first-party | live | CloudEvents + transactional outbox (NATS + Postgres publishers). | docker-backend, agent-gateway, agent-worker, distribution, governance, runtime (23 refs). | **keep-core** |
| `packages/coordination` | owned-first-party | live | Work-locks (path/glob, TTL, fence-tokened) + reaper + conflict detection + A2A bus + handoff. 223 files / 53 tests. | docker-backend, `packages/substrate` (5 refs). | **keep-core** |
| `packages/brain` | owned-first-party | live | Brain engine: BrainContext assembly, mem0, beads tasks, continuum activity, runtime doctors. 69 files / 21 tests. | docker-backend, `packages/recoder-code` (9 refs). | **keep-core** |
| `packages/recodergit` | owned-first-party | live | Owned code-graph engine: repo-indexer, dep-graph, ownership/impact, context-pack + MCP server. | `packages/brain` repo-intel, docker-backend git-context, agent-mcp git-nexus (**474 refs**). | **keep-core** |
| `packages/agent-memory` | owned-first-party | live | Memory engine: store + candidate/review workflow + vector search (mem0 / pgvector). | docker-backend, agent-mcp memory-server (7 refs). | **keep-core** |
| `crates/recoder-governance` | owned-first-party | built | Owned Rust governance workspace (8 crates): Merkle audit chain + permission/approval/routing + UDS daemon. Byte-interop with `packages/governance`. | `packages/governance` TS facade speaks to the daemon over IPC. All crates have src+tests. | **keep-core** |
| `packages/oss-registry` | owned-first-party | live | OSS-component registry: health/license/patch-policy + who-owns-canonical-state per component. | docker-backend agent-os, agent-gateway, ui-agent-os, agent-schemas, root scripts. | **keep-core** |

### The `pi` engine cluster (fused owned fork — live)

| Dir | Kind | State | Role | UsedBy | Verdict |
|-----|------|-------|------|--------|---------|
| `packages/pi-agent-core` | owned-fork | live | The pi agent loop/harness (agent-loop, session, compaction, proxy) under the fused `pi` engine. | pi-coding-agent, transitively `@recoder/runtime` + docker-backend pi-runtime-adapter (33 refs). | **keep-core** |
| `packages/pi-ai` | owned-fork | live | Unified multi-provider LLM client (BYOK provider layer for pi). | pi-agent-core, pi-coding-agent, runtime, docker-backend (57 refs). | **keep-core** |
| `packages/pi-coding-agent` | owned-fork | live | The `pi` coding-agent CLI (interactive/rpc/non-interactive); the headless agent the `pi` driver drives. | docker-backend pi-runtime-adapter, recoder-code cli, runtime drivers (20 refs). | **keep-core** |
| `packages/pi-tui` | owned-fork | live | Terminal-UI toolkit for pi's interactive experience. | pi-coding-agent interactive mode (59 refs, pi cluster only). | **keep-supporting** |

### The `recoder-code` engine cluster (owned fork — live)

| Dir | Kind | State | Role | UsedBy | Verdict |
|-----|------|-------|------|--------|---------|
| `packages/recoder-code/packages/core` | owned-fork | live | The agent core (tool loop, MCP, code-graph) powering the recoder-code CLI (gemini-cli core fork). | recoder-code cli + vscode companion (172 refs). | **keep-core** |
| `packages/recoder-code/packages/cli` | owned-fork | live | `recoder-code` terminal agent CLI; a swappable engine + standalone product. | consumes core + pi-coding-agent. | **keep-core** |
| `packages/recoder-code/packages/vscode-ide-companion` | owned-fork | built | VS Code companion for recoder-code (optional surface). | depends on recoder-code-core. | **keep-supporting** |
| `packages/recoder-code/packages/mcp-eternos` | vendored-clone | unused | Unrelated bundled `eternos` MCP server riding inside the gemini-cli fork; not in Recoder's MCP registry. | nothing in-repo. | **park-vendor** |

### Engines: BYOK / memory / billing / network supporting (live)

| Dir | Kind | State | Role | UsedBy | Verdict |
|-----|------|-------|------|--------|---------|
| `packages/recoder-cli-router` | owned-fork | built | Model-routing proxy (claude-code-router fork) backing BYOK multi-provider for agent CLIs. | `packages/cli` (spawned binary; direct import commented out, 8 refs). | **keep-supporting** |
| `packages/roo-code-types` | vendored-clone | live | Roo-Code provider/model Zod types consumed by the cli-router. | recoder-cli-router (68 refs). | **park-vendor** |
| `packages/mem0` | owned-fork | live | Owned TS vendor of mem0-ts (agent memory over a vector store) + `./oss` self-host build. | docker-backend mem0-client (dynamic import, fail-safe). | **keep-supporting** |
| `packages/network` | owned-first-party | live | Dependency-free Envoy control-plane config gen + default-deny ext_authz + XDR pipeline + TS↔Go xDS contract. (§3, not local desktop path.) | docker-backend (network.routes, xdr-sink, governance-ports). 41 tests. | **keep-core** |
| `py/recoder-billing` | owned-fork | built | First-party billing/entitlement engine (license keys, benefits, checkout, webhooks, IPC) fused from Polar MoR. | `packages/distribution` (IPC consumer), agent-mcp billing-server. ~63 src files. | **keep-core** |
| `py/pal-mcp-server` | vendored-clone | live | Supervised external PAL/zen multi-model MCP server (~18 tools over stdio). | `packages/interop` pal-server, docker-backend interop-host (supervises `server.py`). Gitignored. | **park-vendor** |
| `packages/context7-sdk` | vendored-clone | built | Context7 docs-API client the Brain can use for shared context. | docker-backend (3 refs). | **park-vendor** |
| `py/mem0` | vendored-clone | partial | Upstream mem0ai server behind `packages/brain` (consumed over HTTP via `MEM0_BASE_URL`, not as source). | brain (engine-resolver/doctor) talks to a running server. | **park-vendor** |

### Engines: built-but-unused (WIRE-UP)

| Dir | Kind | State | Role | UsedBy | Verdict |
|-----|------|-------|------|--------|---------|
| `packages/agent-workflows` | owned-first-party | built | Owns workflow definitions + runner (agent/tool/approval/verification/deploy/PR/browser-check nodes). | agent-gateway, agent-worker (3 refs); **not in docker-backend**. | **wire-up** |
| `packages/pal` | owned-first-party | built | Planning & Allocation Layer: deterministic routing/runtime/sandbox/skill/risk/approval selectors. | declared as dep by agent-schemas only; **ZERO source imports**. | **wire-up** |
| `packages/agent-oss` | owned-first-party | built | OSS adapter boundary (langgraph/crewai/autogen/playwright/stagehand/browser-use/e2b/daytona/mem0/litellm/sourcegraph/openziti). | **0 external refs**; built dist. | **wire-up** |
| `packages/agent-hooks` | owned-first-party | built | Deterministic PostToolUse hook helpers (artifact-capture, memory-candidate, secret-scan). | **0 external refs**; built dist. | **wire-up** |
| `packages/agent-schemas` | owned-first-party | built | Runtime-safe Zod guards for Agent OS contracts at boundaries. | **0 external refs**; built dist. | **wire-up** |
| `packages/beads-adapter` | owned-first-party | built | Two-way sync between bd issue graph and Agent OS TaskSpecs. | **0 external refs**; built dist. | **wire-up** |
| `py/ops-recorder` | owned-first-party | built | FastAPI work-signals service: detects stuck GitHub/Linear work, emits handoff prompts. | nothing; gitignored. (Backend `/work-signals` is a separate same-named concept.) | **wire-up** |

### Engines / runtime forks: provenance-only (PARK)

| Dir | Kind | State | Role | UsedBy | Verdict |
|-----|------|-------|------|--------|---------|
| `crates/openfang` | vendored-clone | unused | Source-of-record for the owned governance/runtime port (audit/routing/tool_policy). | provenance comments only; Makefile heavy build target, no consumer. | **park-vendor** |
| `ts/oh-my-codex` | owned-fork | unused | Provenance origin for `runtime/drivers/codex/*` (code fused/copied). | provenance comments only; not a workspace member. | **park-vendor** |
| `ts/oh-my-openagent` | owned-fork | unused | Provenance origin for `runtime/drivers/opencode/*`. | provenance comments only. | **park-vendor** |
| `ts/open-agents` | owned-fork | unused | Provenance origin for `runtime/drivers/in-process/*`. | provenance comments only. | **park-vendor** |
| `ts/opencode` | owned-fork | unused | Provenance origin for `runtime/drivers/opencode/*` ACP types. | provenance comments only. | **park-vendor** |
| `crates/lance` | vendored-clone | unused | Intended brain/memory vector-store substrate; never wired. | nothing anywhere. | **park-vendor** |
| `crates/tensorzero` | vendored-clone | unused | Candidate LLM gateway/eval reference; not adopted. | nothing. | **park-vendor** |
| `crates/claw-code-parity` | vendored-clone | unused | Harness-parity reference for the owned runtime/governance work. | prose mentions only. | **park-vendor** |
| `go/multica` | vendored-clone | unused | Source ref for coordination claim/dispatch semantics (ported into owned code). | comment cites only. | **park-vendor** |
| `crates/recoder-governance` is the owned port; clones above are reference only. | | | | | |

---

## L2 · Runtime Host

| Dir | Kind | State | Role | UsedBy | Verdict |
|-----|------|-------|------|--------|---------|
| `docker-backend/src` | owned-first-party | live | THE backend product — Express/express-ws host (581 TS files) mounting the L1 engines; `/api/conductor`, `/api/agent-os`, `/api/a2a`, `/api/connectors`. Runs embedded in desktop **and** in cloud. | The whole platform: cockpit, all frontends, mobile, MCP/A2A consumers. Imports the `@recoder/*` engines. | **keep-core** |
| `docker-backend/vendor/opencode` | vendored-clone | partial | Un-rebranded opencode clone built as a separate `opencode-service` Docker sidecar. Distinct from the owned `ts/opencode` fork. | `docker-compose.deploy.yml` build context only; no docker-backend/src import. | **park-vendor** |

---

## L3 · Surfaces

| Dir | Kind | State | Role | UsedBy | Verdict |
|-----|------|-------|------|--------|---------|
| `apps/desktop` | owned-first-party | live | THE paid product (Roadmap #1): Electron boots a local docker-backend via supervisor, bundles the Preact `cockpit`, deep-link auth, device-flow, signed `.dmg`. | End users via `.dmg`/brew; consumes docker-backend (spawned) + cockpit. | **keep-core** |
| `apps/agent-gateway` | owned-first-party | built | Express+WS+A2A/MCP gateway around the agent-os spine on `:4317`; standalone scale-out of the host. | workspace member; **no other package imports it** — runs only as its own process. | **wire-up** |
| `apps/agent-worker` | owned-first-party | built | Outbox/queue + workflow worker (drains agent-events outbox, runs run-task workflows). | workspace member; nothing imports it — its own index says "mount from the backend container". | **wire-up** |
| `packages/conductor-ui` | owned-first-party | built | Typed conductor control-plane client mirroring `conductor.routes.ts` for the cockpit. | **0 refs**; no dist built. | **wire-up** |
| `packages/ui-agent-os` | owned-first-party | live | Backend-free contract that builds the Agent OS cockpit summary from agent-os + oss-registry state. | docker-backend agent-os controller, agent-gateway resources. | **keep-core** |
| `apps/mobile` | owned-fork | built | RN+Expo companion (tasks/plans/billing/usage/api-keys/share) — monitor/approve via `/api/a2a`. | workspace member; consumes `@recoder/shared` + `@recoder/ecosystem-config`. Ships via EAS. | **keep-supporting** |
| `site` | owned-first-party | built | Next.js marketing/download site (Roadmap #4) — `.dmg` + brew + enterprise/self-host funnel. | standalone; download page needs wiring to real GitHub releases. | **keep-supporting** |
| `recoder-skill` | owned-first-party | built | Installable agent Skill wrapping the Recoder public API so external agents drive build/deploy. | distributed standalone; needs `api.recoder.xyz` live. | **keep-supporting** |
| `packages/recoder-a2a` | owned-first-party | built | Publishable npx MCP server exposing 8 Recoder A2A tools for external agents. | the LIVE in-repo server is `mcp/recoder-a2a-server.js`; this is the published-npm copy, not the wired one. | **keep-supporting** |
| `app` | dead | dead | Orphaned 11-file remnant of the former recoder.xyz Next app; `package.json` removed in 1a688bc08 → **cannot build** (Dockerfile still `COPY app/package.json`). | nothing; not a workspace member. | **drop** |
| `packages/ui` | owned-first-party | unused | Intended shared cross-app React UI (nav/notifications/subscription badge). | nothing — no dep, no import anywhere. | **drop** |
| `packages/design-tokens` | owned-first-party | scaffold | Shared design tokens (`tokens.css` + index). | **0 refs**. | **wire-up** |

### MCP boundary markers (docs-only; the real code lives elsewhere)

| Dir | Kind | State | Role | UsedBy | Verdict |
|-----|------|-------|------|--------|---------|
| `mcp/recoder-mcp-server` | owned-first-party | scaffold | Manifest listing the 15 canonical MCP servers; impl in `packages/agent-mcp`. | docs marker. | **keep-supporting** |
| `mcp/recoder-a2a-bridge` | owned-first-party | scaffold | Manifest for the A2A bridge contract; impl in a2a-sdk/a2a-interop/gateway/backend. | tools/a2a-interop references the name. | **keep-supporting** |
| `mcp/recoder-claude-bridge` | owned-first-party | scaffold | Manifest documenting the Claude Code adapter boundary (never owns state). | docs marker. | **keep-supporting** |
| `mcp/recoder-codex-adapter` | owned-first-party | partial | Docs + `.env` for the Codex adapter; the live entrypoint is the sibling `recoder-codex-adapter.js`. | adapter `.js` exercised by `mcp/test/...`. | **keep-supporting** |

---

## L4 · Distribution

| Dir | Kind | State | Role | UsedBy | Verdict |
|-----|------|-------|------|--------|---------|
| `packages/distribution` | owned-first-party | live | Device-flow auth + channel publishers (npm/homebrew/desktop) + entitlement/approval gates + Polar MoR billing port + fail-safe delivery. 104 files / 13 tests. | docker-backend (11 refs); depends on agent-os/agent-events/auth/vault. | **keep-core** |
| `packages/auth` | owned-first-party | live | Better Auth + Prisma cross-domain session/JWT verification, edge guards. | `packages/distribution` + app Dockerfile (security-load-bearing). | **keep-supporting** |
| `packages/vault` | owned-fork | live | Secret-encryption vault (VaultDriver port + node-crypto driver). BYOK secret encryption at rest. | docker-backend vault.ts, distribution, giselle, supabase-driver. | **keep-supporting** |
| `ts/polar` | vendored-clone | unused | Near-verbatim Polar (MoR billing) Python server clone; the owned engine is `py/recoder-billing`. | nothing; referenced in .gitignore/docs only. | **park-vendor** |

> §3 cloud spine `go/recoder-xds` (xDS control plane) and the `packages/network` Envoy/XDR config live with L1 above; the AMI/self-host `deploy/packer` path is referenced in ARCHITECTURE §3 but not present as a directory in this inventory.

---

## §3 · Cloud / Teams / Enterprise spine (not the local desktop path)

| Dir | Kind | State | Role | UsedBy | Verdict |
|-----|------|-------|------|--------|---------|
| `go/recoder-xds` | owned-first-party | built | Go Envoy xDS control plane (LDS/CDS/RDS over ADS); dynamic equivalent of the static Envoy bootstrap; fail-closed ext_authz→governance. | contract pinned to `packages/network` via `contract.json`. Cloud/teams only. | **keep-supporting** |
| `go/ziti` | vendored-clone | partial | OpenZiti zero-trust overlay for cross-machine teams/enterprise traffic, behind an owned adapter. | `packages/agent-oss` openziti-adapter (thin shell), recoder-a2a enroll.js; Makefile heavy build. Not local path. | **park-vendor** |
| `go/beads` | vendored-clone | live | The `bd` issue tracker mandated by AGENTS.md; brain's beads-tasks integration shells out to it. | brain (`beads-tasks.ts`/`brain.ts` resolve `BD_BIN`); 133MB binary; build scripts/Makefile. | **keep-supporting** |

---

## Cross-cutting

| Dir | Kind | State | Role | UsedBy | Verdict |
|-----|------|-------|------|--------|---------|
| `shared/src/a2a` | owned-first-party | live | A2A wire-contract spine: task envelopes, control-plane, audit/error taxonomy, persistence. | a2a-sdk, docker-backend A2A gateway + connectors + middleware + server.ts. | **keep-core** |
| `ts/extracted-from-openclaw` | owned-fork | live | `@recoder/connectors` — trust-gated bridge between chat channels and the control plane. The only `ts/*` fork that is a real workspace member. | `docker-backend/src/connectors/*` (telegram/slack/signal subpaths); workspace dep. | **keep-core** |
| `tools` | owned-first-party | live | CI: a2a-interop (~15 root scripts), security-secrets + branding-drift (GH Actions), evals, `@recoder/tsconfig`, strip-workspace. | root scripts, `.github/workflows`, ~30 packages extend tsconfig. | **keep-supporting** |
| `packages/tsconfig` | owned-first-party | live | Shared base tsconfigs consumed via `extends`. | ~30 packages. | **keep-supporting** |
| `packages/ecosystem-config` | owned-first-party | live | Shared app-id + URL registry so surfaces agree on ecosystem topology. | `packages/ui`, apps/mobile (source-level). | **keep-supporting** |
| `packages/agent-observability` | owned-first-party | partial | Observability/evidence/health contracts for runs. | sandbox-daytona only (2 refs). | **keep-supporting** |
| `shared/src/streaming` | owned-first-party | live | Streaming engine rendering live agent message/tool output. | apps/mobile only (web not yet). | **keep-supporting** |
| `shared/src/tools` | owned-first-party | live | Tool-call presentation utils (names/icons/formatter/parser). | apps/mobile only. | **keep-supporting** |
| `shared/src/animations` | owned-first-party | unused | Streaming-text animation hooks for chat surfaces. | nothing — exported but dead-ended. | **wire-up** |
| `tasks` | owned-first-party | live | Internal lessons.md + todo.md planning ledger — explicitly **not product**. (AGENTS.md prefers `bd` over todo.md.) | read by humans/agents; nothing imports. | **keep-supporting** |
| `turbo` | owned-first-party | scaffold | `turbo gen` SDK-package generators (hbs templates). | on-demand via `turbo gen`; no script wires it. | **keep-supporting** |
| `packages/browser-verification` | owned-first-party | scaffold | Types-only browser-verification contract (open_preview/assert_text/screenshot). | **0 refs**. | **wire-up** |
| `packages/recoder-browser-tools` | owned-first-party | scaffold | Playwright browser tool surface (navigate/repl/skills-store). | nothing outside its own index. | **wire-up** |
| `packages/document-preprocessor` | owned-fork | built | RAG doc ingestion (PDF/text/markdown extraction). | **0 refs**; no dist built. | **wire-up** |
| `packages/stream` | owned-fork | live | Public task-stream event protocol. Giselle-origin but genuinely consumed by the backend. | giselle, react, **AND** `docker-backend/.../task-stream-protocol.ts`. | **keep-supporting** |

---

## Cut from the architecture (legacy v1 web-app lineage)

| Dir | Kind | State | Role | UsedBy | Verdict |
|-----|------|-------|------|--------|---------|
| `packages/performance` | owned-first-party | unused | Generic Express perf middleware (Redis cache) for the old recoder.xyz web stack. | nothing. | **drop** |
| `packages/plugins` | owned-first-party | scaffold | Speculative plugin marketplace for the old web-builder; extensibility now handled by agent-mcp/oss-registry. | nothing (stale cli lockfile mention). | **drop** |
| `py/colbert` | vendored-clone | dead | Would be a retrieval engine under brain; nothing references it. | docs mentions only; zero imports. | **drop** |
| `packages/analytics` | owned-first-party | partial | Legacy v1 analytics/monitoring for the abandoned CLI/web/VSCode surfaces. | `packages/cli` only (CLI is itself v1). | **keep-supporting** |
| `packages/security` | owned-fork | partial | Legacy CLI security/compliance; superseded by governance + crates/recoder-governance. | `packages/cli` only. | **park-vendor** |
| `packages/shared` | owned-fork | built | Legacy `recoder-shared` grab-bag (AI router/cost/oauth) from the old Roo-Code CLI lineage. | legacy CLI cluster (cli/security/plugins/cli-router/web/analytics). | **park-vendor** |

> `packages/cli` itself is the v1 CLI surface anchoring the cluster above; it was not in the inventory but is the consumer keeping analytics/security/shared/plugins alive.

---

## Giselle / recoder-agency cluster (a self-contained agent-builder subgraph)

This is a coherent **second product lineage** (the Giselle visual-workflow engine
under `recoder-agency`), distinct from the conductor/Agent-OS spine. None of it is
imported by `docker-backend` / `apps/desktop` / the conductor. It is real and
internally consistent, so it parks as a vendor/agency subtree rather than dropping.

| Dir | Kind | State | Verdict |
|-----|------|-------|---------|
| `packages/giselle` | vendored-clone | partial | **park-vendor** |
| `packages/protocol` | owned-fork | live (153 refs, cluster-only) | **park-vendor** |
| `packages/react` | owned-fork | live (cluster-only) | **park-vendor** |
| `packages/nextjs` | vendored-clone | scaffold (zero importers, orphan) | **park-vendor** |
| `packages/http` | vendored-clone | scaffold | **park-vendor** |
| `packages/logger` | vendored-clone | scaffold | **park-vendor** |
| `packages/langfuse` | vendored-clone | scaffold (zero importers, orphan) | **park-vendor** |
| `packages/language-model` | vendored-clone | partial | **park-vendor** |
| `packages/language-model-registry` | vendored-clone | partial | **park-vendor** |
| `packages/node-registry` | vendored-clone | partial | **park-vendor** |
| `packages/github-tool` | vendored-clone | partial | **park-vendor** |
| `packages/rag` | owned-fork | built | **park-vendor** |
| `packages/storage` | owned-fork | built | **park-vendor** |
| `packages/supabase-driver` | owned-fork | built (zero importers) | **park-vendor** |
| `packages/text-editor` | owned-fork | built (zero importers) | **park-vendor** |
| `packages/text-editor-utils` | owned-fork | built | **park-vendor** |
| `packages/trigger-registry` | owned-fork | built | **park-vendor** |
| `packages/workspace-utils` | owned-fork | built | **park-vendor** |
| `packages/web-search` | owned-fork | built | **park-vendor** |
| `packages/sdk` | owned-fork | built (zero importers) | **park-vendor** |
| `packages/action-registry` | owned-first-party | partial | **keep-supporting** |
| `packages/data-store-registry` | owned-first-party | partial | **keep-supporting** |
| `packages/utils` | owned-fork | live (cluster leaf) | **keep-supporting** |
| `packages/pseudo-tiktoken` | vendored-clone | unused (still `@giselles-ai/*`) | **park-vendor** |
| `packages/a2a-js` | vendored-clone | built (3 docker-backend refs) | **park-vendor** |
| `packages/continuum` | owned-fork | live (brain imports `@recoder/continuum/engines`) | **park-vendor** |

> `action-registry`, `data-store-registry`, `utils` are kept-supporting because they
> are small owned leaves with live cluster importers; the rest are vendored/forked
> Giselle code with no conductor consumer and belong under a labeled vendor/agency area.

---

## WIRE-UP backlog — built first-party code to connect, by leverage

These are **owned, built, tested** directories with no runtime consumer. Ordered
by how much product they unlock for the desktop/Agent-OS spine.

1. **`packages/pal`** → wire into `docker-backend` conductor run loop. It is the
   missing decision layer (which runtime/substrate/tool-grants/risk/approval) that
   ARCHITECTURE §1c describes between agent-os state and runtime/governance. Built,
   zero source imports. **Highest leverage: it is the brain of the run loop.**
2. **`apps/agent-gateway` + `apps/agent-worker`** → mount their queues/workflows
   into the `docker-backend` service container (the worker's own `index.ts` says
   exactly this). Unlocks outbox-drain + scale-out of the host. Consumer: the
   backend container / cloud deployment.
3. **`packages/agent-workflows`** → import into `docker-backend` (currently only in
   gateway/worker). It is the verification/approval/deploy pipeline graph that the
   conductor run loop should drive. Consumer: `docker-backend` conductor.
4. **`packages/agent-hooks`** → wire into the run loop as deterministic PostToolUse
   policy (artifact-capture, secret-scan, memory-candidate). Consumer:
   `docker-backend` run-tailer / governance gate.
5. **`packages/agent-schemas`** → use the Zod guards at system boundaries in
   `docker-backend` ingress + `packages/interop`. Consumer: boundary validation.
6. **`packages/beads-adapter`** → connect bd↔TaskSpec sync (AGENTS.md mandates bd as
   the tracker). Consumer: `docker-backend` agent-os tasks + brain beads-tasks.
7. **`packages/conductor-ui`** → build dist + consume from the desktop `cockpit` as
   the typed conductor client. Consumer: `apps/desktop/cockpit`.
8. **`packages/agent-oss`** → wire the OSS adapter boundary into `docker-backend`
   (langgraph/crewai/browser-use/e2b) as replaceable execution surfaces. Consumer:
   `docker-backend` runtime/substrate dispatch.
9. **`py/ops-recorder`** → connect its WorkSignal output to the backend
   `/work-signals` route (currently a same-named but separate concept). Consumer:
   `docker-backend` agent-os coordination.
10. **`packages/document-preprocessor`** → wire into the brain/RAG ingestion path
    (needs a dist build first). Consumer: `packages/brain` ingestion.
11. **`packages/browser-verification` + `packages/recoder-browser-tools`** → make
    the browser-check workflow node real. Consumer: `agent-workflows` browser-check
    + `docker-backend` preview verification.
12. **`packages/design-tokens` + `shared/src/animations`** → consume from the
    `cockpit` / web surfaces for UI polish. Consumer: `apps/desktop/cockpit`, web.

---

## PARK / DROP

### PARK — move to a labeled `vendor/` (provenance / reference / built-sidecar; do not delete)

**Runtime-driver provenance forks** (code already fused into `packages/runtime`,
keep the trees for provenance + re-port): `ts/oh-my-codex`, `ts/oh-my-openagent`,
`ts/open-agents`, `ts/opencode`.

**Governance/coordination provenance clones**: `crates/openfang` (ported into
`packages/governance` + `crates/recoder-governance`), `go/multica` (ported into
coordination), `crates/claw-code-parity` (harness-parity reference).

**Unadopted candidate clones**: `crates/lance` (intended vector store, never wired),
`crates/tensorzero` (LLM-gateway candidate), `ts/polar` (raw Polar clone — owned
engine is `py/recoder-billing`).

**Built-as-sidecar / supervised externals** (keep but quarantine): `docker-backend/vendor/opencode`
(opencode-service image), `py/pal-mcp-server` (supervised MCP server), `py/mem0`
(deployable mem0 server consumed over HTTP), `go/ziti` (zero-trust overlay, thin
adapter), `packages/context7-sdk`, `packages/a2a-js` (low-level A2A SDK under the
owned sdk), `packages/roo-code-types` (cli-router types), `packages/continuum`
(fused-in-process, Apache-2.0 vendor).

**Giselle / recoder-agency subtree** (a whole second product lineage — relocate
under a labeled `vendor/agency` area, not `packages/` root): `giselle`, `protocol`,
`react`, `nextjs`, `http`, `logger`, `langfuse`, `language-model(-registry)`,
`node-registry`, `github-tool`, `rag`, `storage`, `supabase-driver`,
`text-editor(-utils)`, `trigger-registry`, `workspace-utils`, `web-search`, `sdk`,
`pseudo-tiktoken`. Plus legacy-CLI forks `packages/security` and `packages/shared`.
Two are flat-out orphaned (`packages/nextjs`, `packages/langfuse` — **zero importers
anywhere**) and could be dropped outright if the agency surface is confirmed dead.

**Bundled stray**: `packages/recoder-code/packages/mcp-eternos` (unrelated eternos
MCP server riding inside the gemini-cli fork).

### DROP — genuinely dead, remove

- **`app`** — orphaned 11-file remnant; `package.json` was removed (1a688bc08) so it
  **cannot build**, and its Dockerfile still `COPY app/package.json`. The real
  recoder.xyz auth surface is not present here. Remove and fix the Dockerfile ref.
- **`packages/ui`** — intended shared UI; **zero deps, zero imports anywhere**.
- **`packages/performance`** — generic Express/Redis perf middleware for the dead v1
  web stack; no importer.
- **`packages/plugins`** — speculative plugin marketplace for the old web-builder;
  extensibility is owned by agent-mcp/oss-registry; no runtime importer.
- **`py/colbert`** — would-be retrieval engine; **zero code imports**, docs mentions
  only.

---

## What the product actually needs (the core list)

To ship the v1 desktop-conductor product (ARCHITECTURE §4/§5), the load-bearing
set is small and entirely first-party/owned:

**Substrate (L0)**: `c/tmux` · `packages/substrate` (+ `ts/dmux` console,
`packages/sandbox-daytona` + `daytona-*-client` for the remote path).

**Engines (L1)**: `packages/agent-os` (state spine) · `packages/runtime` +
`packages/agent-runtimes` (drivers) · the `pi` cluster (`pi-agent-core`/`pi-ai`/
`pi-coding-agent`/`pi-tui`) and `recoder-code/{core,cli}` as the shipping engines ·
`packages/governance` + `crates/recoder-governance` (Rust audit kernel) +
`packages/agent-policy` · `packages/brain` + `packages/recodergit` +
`packages/agent-memory` · `packages/coordination` · `packages/agent-events` ·
`packages/interop` + `packages/a2a-sdk` + `packages/agent-mcp` +
`packages/agent-instructions` + `packages/oss-registry` + `shared/src/a2a` +
`ts/extracted-from-openclaw` (connectors).

**Host (L2)**: `docker-backend/src` — the one backend that mounts all of the above.

**Surfaces (L3)**: `apps/desktop` (the paid product) + `packages/ui-agent-os`
(cockpit view-model). Supporting: `apps/mobile`, `site`, `recoder-skill`,
`packages/recoder-a2a`, the `mcp/*` markers.

**Distribution (L4)**: `packages/distribution` + `py/recoder-billing` +
`packages/auth` + `packages/vault`.

**Cloud/enterprise (§3)**: `packages/network` + `go/recoder-xds` (Envoy/xDS),
`go/beads` (tracker).

**The gap between "built" and "shipping" is the WIRE-UP backlog above** — chiefly
`packages/pal` into the run loop, and folding `apps/agent-gateway`/`apps/agent-worker`
+ `agent-workflows`/`agent-hooks`/`agent-schemas` into `docker-backend`. Everything
else (the Giselle agency cluster, the legacy v1 CLI/web lineage, the provenance
clones) is **not** what the product needs and should be parked or dropped per above.
