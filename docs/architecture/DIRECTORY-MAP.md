# Recoder — Directory Map (current reality)

> **Status: 2026-07-13.** This is the architecture-local, up-to-date directory map. It is intentionally
> concise: the **authoritative, per-directory ledger** now lives in
> **[RECODER-ENGINES.md §8](./RECODER-ENGINES.md#8-complete-directory-ledger--every-dir-gets-a-role-full-usage)**
> (every `packages/` + `c/ crates/ go/ py/ ts/` root assigned a role: `core` / `wire` / `revive` / `keep` /
> `del` / `vendor`) and the **per-phase execution spec in [§21](./RECODER-ENGINES.md#21-execution-spec--per-phase-workflow-ready)**.
> For engine status use **[RECODER-CAPABILITIES.md](./RECODER-CAPABILITIES.md)** (the 21 in-proc capability
> servers + connection table) and **[RECODER-SHELL.md](./RECODER-SHELL.md)** (the L3 terminal cockpit).
>
> The older, larger, and now partly-stale full survey is at
> [`../DIRECTORY-MAP.md`](../DIRECTORY-MAP.md) (docs root, Jun 2026) — kept for provenance but superseded by
> the RECODER-ENGINES ledger where the two disagree (that survey predates the Phase-0 deletes and the
> engine-fleet build).
>
> **Honesty note.** Backend engine Phases 1–5 are **built + wired + unit-tested + build clean** through the
> governed MCP interop host — that is **not** "deployed / live in production" and **not** "GUI-verified".
> The `apps/wave` shell **builds end-to-end** but has **not** been launched/eyeballed. Deploy + billing
> capabilities are **deferred (filed)**, not live.

---

## Top-level roots (verified against the tree, 2026-07-13)

| Root | What it is | Status |
|---|---|---|
| `c/tmux` | The pinned tmux substrate binary the conductor drives (restart-survivable sessions). | **core / wired** (L0) |
| `crates/` | Native Rust engines: `recoder-governance` (NAPI in-process, 2026-07-13+), `openfang` (NAPI in-process, 2026-07-13+), `tensorzero` (LLM gateway, NAPI deferred — disk constraint), `claw-code-parity` (REMOVED 2026-07-13 — not product runtime). `lance` was **deleted** (Phase 0). | core + deferred — see RECODER-DEEP-FUSION-PLAN.md |
| `go/` | `beads` (bd issue graph, wired), `recoder-xds` (Envoy xDS control plane), `ziti` (zero-trust overlay, partial), `multica` (coordination source — fused into `packages/coordination`; standalone abandoned). | mixed |
| `py/` | ML/services muscle: `colbert` (reranker, wired), `mem0` (memory server), `browser-use` (autonomous browser, partial), `ops-recorder` (work-signals, Phase 5), `pal-mcp-server` (vendored multi-model MCP). | mixed |
| `ts/` | Forked coding-agent CLIs + connectors (subprocess-resolved, live substrate): `opencode`, `recodergit`, `open-agents`, `dmux`, `extracted-from-openclaw` (`@recoder/connectors`). `oh-my-codex` / `oh-my-openagent` / `polar` were **deleted** (Phase 0). | keep / core |
| `packages/` | The TypeScript orchestration spine + owned engines (70 dirs). See the spine grouping below and the full ledger in [RECODER-ENGINES §8](./RECODER-ENGINES.md#8-complete-directory-ledger--every-dir-gets-a-role-full-usage). | core |
| `docker-backend/` | **THE conductor / L2 runtime host** (Express + express-ws). Supervises the polyglot fleet, mounts every engine in-process, exposes `/api/{conductor,agent-os,mcp,a2a,connectors}` and the governed MCP route `POST /api/mcp/tools/:server/:tool/call`. Embedded by the desktop. | **core** |
| `apps/` | Surfaces: `apps/wave` (**the Recoder terminal shell / L3** — a rebranded Wave fork, 11-block governed cockpit, builds end-to-end, GUI not yet launch-verified — see [RECODER-SHELL.md](./RECODER-SHELL.md) + [../../apps/wave/FORK.md](../../apps/wave/FORK.md)); `apps/desktop` (the current shipping Electron cockpit, Preact); `apps/mobile`; `apps/agent-gateway` + `apps/agent-worker` (optional scale-out, folded into the backend for the embedded path). | surfaces |
| `shared/` | Cross-cutting libs: `shared/src/a2a` (TaskEnvelope wire spine), streaming/animation/tool-presentation hooks. | keep-core |
| `mcp/` | The live stdio MCP broker (`recoder-a2a-server.js`) + the byte-identical capability-tools bridge injected into every worktree. | core |
| `recoder-skill/`, `site/`, `app/`, `deploy/`, `nginx/`, `monitoring/`, `docs/`, `scripts/`, `tools/`, `config/` | Skill descriptor · marketing/download · cloud remnant · self-host manifests · reverse proxy · observability · docs · ops. | supporting |

## `packages/` spine (grouping — per-package verdicts in [RECODER-ENGINES §8](./RECODER-ENGINES.md#8-complete-directory-ledger--every-dir-gets-a-role-full-usage))

- **S1 State spine** — `agent-os` · `agent-schemas` · `agent-events` · `oss-registry` · `ecosystem-config` · `tsconfig` · `utils`
- **S2 Interop / MCP / A2A** — `interop` · `agent-mcp` · `a2a-sdk` · `a2a-js` · `recoder-a2a` · `agent-instructions`
- **S3 Governance & security** — `governance` · `agent-policy` · `vault` · `security` (revive)
- **S4 Planning · coordination · workflow** — `pal` · `coordination` · `agent-workflows` · `agent-hooks` · `workflow-engine` · `beads-adapter` · `action-registry` · `data-store-registry`
- **S5 Runtime · substrate · execution** — `runtime` · `agent-runtimes` · `substrate` · `agent-sandbox` · `sandbox-daytona` · `daytona-api-client` · `daytona-toolbox-api-client` · `agent-oss`
- **S6 Agent brains (CLIs)** — `pi-agent-core` · `pi-ai` · `pi-coding-agent` · `pi-tui` · `recoder-code` · `cli` (revive)
- **S7 Code intelligence** — `recodergit`
- **S8 Memory · context · retrieval** — `brain` · `agent-memory` · `mem0` · `continuum` · `context7-sdk` · `document-preprocessor` · `rag` (superseded by →) · **`retrieval`** (owned RAG engine)
- **S9 Browser & web** — `agent-browser` (owned browser-use engine) · `recoder-browser-tools` · `browser-verification` · `web-search` (revive)
- **S10 LLM Gateway (BYOK)** — `pi-ai` · `recoder-cli-router` · `roo-code-types` (+ `crates/tensorzero`)
- **S11 Networking / zero-trust** — `network` (+ `go/recoder-xds`, `go/ziti`)
- **S12 Distribution / auth** — `distribution` · `auth` · `performance` (revive)
- **S13 Streaming / observability / extensions** — `stream` · `agent-observability` · `analytics` (revive) · `plugins` (revive)
- **S14 Connectors** — `ts/extracted-from-openclaw` · `ts/dmux`
- **S15 Surfaces** — `ui-agent-os` · `conductor-ui` · `design-tokens` · `herd` · `ui` (revive) · `shared`
- **S16 Work signals** — `py/ops-recorder`
- **Owned engines added Phases 2–5** — `retrieval` (RAG) · `agent-browser` (browser-use) · `coordination` (work-locks) · `workflow-engine` (verify/hooks) · `agent-notify` (notify) — each skinned as a governed MCP server (see the CAPABILITIES connection table).

> **Deleted in Phase 0** (absent from the tree, do not re-cite as live): `crates/lance`, `ts/oh-my-codex`,
> `ts/oh-my-openagent`, `ts/polar`, `py/recoder-billing`, and the Giselle package cluster (`giselle`,
> `protocol`, `react`, `nextjs`, `http`, `sdk`, `storage`, `supabase-driver`, `language-model*`,
> `text-editor*`, `web*`, …). The older `../DIRECTORY-MAP.md` survey still lists several of these.
