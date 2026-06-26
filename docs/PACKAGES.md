# Recoder Monorepo — Package Inventory & Cleanup Map

> Source-of-truth inventory for every package in the Recoder monorepo, with origin
> classification, duplicate/overlap detection, stub identification, and a concrete
> consolidation plan. Generated 2026-06-26 by direct filesystem verification.
>
> File counts = `.ts/.tsx/.rs/.go/.py/.mjs/.js` excluding `node_modules/`, `dist/`,
> `build/`. Counts are an honest size signal, not LOC.
>
> **Count caveat:** a few packages commit compiled output (`.d.ts`/`.js`), which
> inflates their counts above true authored-source size — flagged inline where it
> matters (`security`, `intelligence`, etc.).

---

## 1. How the monorepo is organized

The repo separates **owned TypeScript control-plane code** from **vendored OSS**
along directory lines:

| Area | What lives here | Nature |
|------|------------------|--------|
| `packages/*` | 79 workspace packages: Agent OS contracts, owned services, **plus** a large vendored cluster (Giselle, pi, mem0, Daytona, a2a-js, Context7). | Mixed owned + vendored TS |
| `packages/recoder-code/` | The terminal coding IDE — its own nested monorepo. Only `packages/{cli,core}` are the real product; the rest are auxiliary. | Owned (nested) |
| `apps/*` | Deployed/runnable surfaces: `agent-gateway`, `agent-worker`, `desktop`, `mobile`. | Owned apps |
| `crates/*` | Rust OSS subsystems: `openfang`, `tensorzero`, `lance`, `claw-code-parity`. | Vendored OSS (Rust) |
| `go/*` | Go OSS: `beads`, `multica`, `ziti`. | Vendored OSS (Go) |
| `py/*` | Python OSS: `mem0`, `colbert`, `browser-use`, `pal-mcp-server`, `ops-recorder`. | Vendored OSS (Py) |
| `ts/*` | Standalone TS OSS engines: `pi`, `recodergit`, `dmux`, `opencode`, `qwen-code`, `continuum`, `open-agents`, `polar`, `extracted-from-openclaw`, `oh-my-codex`, `oh-my-openagent`. | Vendored OSS (TS, full impls) |
| `c/*` | `tmux` (real upstream tmux, cloned not reimplemented). | Vendored OSS (C) |

**Key architectural intent** (per `.claude/rules/monorepo.md`): `packages/agent-*`
own domain contracts and must NOT couple to runtimes/UI/sandboxes/model providers.
OSS lives outside as adapters. Several `packages/*` entries are *contract-vs-impl
splits* — the thin contract lives in `packages/`, the full implementation lives in
`ts/`, `py/`, `crates/`, or `go/`. These look like duplicates but are intentional
(see §3).

---

## 2. Full inventory

### 2a. Agent OS contracts (owned — `@recoder/agent-*` + control-plane spine)

These are the real net-new Recoder authorship. Mostly small/medium contract layers.

| Package | Path (`packages/…`) | Files | Class | Purpose |
|---------|---------------------|------:|-------|---------|
| `@recoder/agent-os` | `agent-os` | 40 | real | Domain core contracts + legal state transitions |
| `@recoder/agent-events` | `agent-events` | 10 | real | CloudEvents + outbox envelope helpers |
| `@recoder/agent-hooks` | `agent-hooks` | 5 | real | Deterministic hook policy helpers |
| `@recoder/agent-instructions` | `agent-instructions` | 37 | real | Instruction compiler/loader + provenance |
| `@recoder/agent-mcp` | `agent-mcp` | 32 | real | MCP registry + tool permission contracts |
| `@recoder/agent-memory` | `agent-memory` | 10 | real | Reviewed memory-candidate lifecycle helpers |
| `@recoder/agent-observability` | `agent-observability` | 5 | real | Observability contracts for runs/components/artifacts |
| `@recoder/agent-oss` | `agent-oss` | 23 | real | OSS adapter boundary contracts |
| `@recoder/agent-policy` | `agent-policy` | 16 | real | Deterministic policy gates |
| `@recoder/agent-runtimes` | `agent-runtimes` | 18 | real | Runtime adapter contracts |
| `@recoder/agent-sandbox` | `agent-sandbox` | 6 | real | Sandbox provider contracts (Daytona/E2B/local) |
| `@recoder/agent-schemas` | `agent-schemas` | 18 | real | Runtime-safe schema guards (no provider deps) |
| `@recoder/agent-workflows` | `agent-workflows` | 16 | real | Workflow definition + driver contracts |
| `@recoder/agent-kernel` | `agent-kernel` | 2 | **stub** | Compat facade re-exporting canonical contracts |
| `@recoder/a2a-sdk` | `a2a-sdk` | 40 | real | Owned A2A helpers: task-state map, error taxonomy, envelopes |
| `@recoder/oss-registry` | `oss-registry` | 8 | real | OSS component registry + health descriptors |
| `@recoder/pal` | `pal` | 12 | real | Planner + agent-team routing (risk/approval/sandbox) |
| `@recoder/brain` | `brain` | 41 | real | Shared-memory fusion (recodergit+mem0+context7+beads → BrainContext) |
| `@recoder/recodergit` | `recodergit` | 9 | real | Repo-intelligence + context-pack contracts (renamed git-nexus) |
| `@recoder/beads-adapter` | `beads-adapter` | 7 | real | Beads issue-graph → Agent OS TaskSpec adapter |
| `@recoder/browser-verification` | `browser-verification` | 2 | **stub** | Browser-verification contracts (previews/Playwright evidence) |
| `@recoder/auth` | `auth` | 33 | real | Cross-subdomain auth (Better Auth: session/edge/keys/verify) |
| `@recoder/ui-agent-os` | `ui-agent-os` | 4 | **stub** | Shared UI contracts for Agent OS cockpit |

### 2b. Owned services / libraries (real, not Agent OS contracts)

| Package | Path | Files | Class | Purpose |
|---------|------|------:|-------|---------|
| `recoder-cli` | `cli` | 311 | real | Recoder CLI — AI dev platform / code generation |
| `recoder-cli-router` | `recoder-cli-router` | 147 | real | Routes CLI requests to LLM providers (Kimi K2, Qwen3, DeepSeek R1) |
| `recoder-a2a` | `recoder-a2a` | 2 | real | Standalone A2A/MCP server (Claude Code/Codex/Cursor → Recoder); plain JS |
| `@recoder/rag` | `rag` | 51 | real | Type-safe RAG system |
| `@recoder/brain` | (see 2a) | | | |
| `recoder-shared` | `shared` | 107 | real | Shared types/utils/config for the ecosystem |
| `recoder-analytics` | `analytics` | 30 | real | Analytics + monitoring layer |
| `recoder-performance` | `performance` | 9 | real | Monitoring/caching/optimization utilities |
| `recoder-plugins` | `plugins` | 31 | real | Plugin/extensibility system |
| `recoder-security` | `security` | 24 | real | Security/compliance (prompt sanitizer, vuln scanner); count incl. committed compiled output |
| `recoder-intelligence` | `intelligence` | 13 | real | Adaptive AI intelligence/learning layer; count incl. compiled `.d.ts` |
| `@recoder/web` | `web` | 31 | real | Recoder web dashboard (project mgmt + monitoring UI) |
| `@recoder/web-ai-assistant` | `web-ai-assistant` | 10 | real | AI assistant for web dev (completion/refactor/analysis) |
| `@recoder/document-preprocessor` | `document-preprocessor` | 13 | real | Document preprocessing (text/image extraction) |

### 2c. Vendored OSS — standalone (not Giselle, not pi)

| Package | Path | Files | Class | Purpose |
|---------|------|------:|-------|---------|
| `@recoder/a2a-js` | `a2a-js` | 79 | vendored-oss | Official A2A JS SDK (server/client), gRPC pruned |
| `@recoder/context7-sdk` | `context7-sdk` | 13 | vendored-oss | Context7 live-docs SDK |
| `@recoder/mem0` | `mem0` | 64 | vendored-oss | mem0 TS SDK (LLM-layer memory over vector store) |
| `roo-code-types` | `roo-code-types` | 54 | vendored-oss | Roo Code shared type definitions |
| `@recoder/browser-tools` | `recoder-browser-tools` | 5 | vendored-oss | Playwright browser tools, extracted from sitegeist |
| `@recoder/sandbox-daytona` | `sandbox-daytona` | 28 | vendored-oss | Daytona TS SDK (uses owned daytona-*-api-client) |
| `@recoder/daytona-api-client` | `daytona-api-client` | 207 | **generated** | Daytona OpenAPI client |
| `@recoder/daytona-toolbox-api-client` | `daytona-toolbox-api-client` | 101 | **generated** | Daytona toolbox OpenAPI client |
| `@recoder/sandbox-providers` | `sandbox-providers` | 2 | **stub** | Compat shim re-exporting sandbox contracts |

### 2d. Vendored OSS — `pi` cluster (one upstream `pi` monorepo split into 4)

| Package | Path | Files | Class | Purpose |
|---------|------|------:|-------|---------|
| `@recoder/pi-agent-core` | `pi-agent-core` | 26 | vendored-oss | pi agent-core (earendil-works/pi) |
| `@recoder/pi-ai` | `pi-ai` | 202 | vendored-oss | pi AI layer (v0.80.2 — drifted from siblings) |
| `@recoder/pi-coding-agent` | `pi-coding-agent` | 151 | vendored-oss | pi coding-agent |
| `@recoder/pi-tui` | `pi-tui` | 28 | vendored-oss | pi terminal UI |

### 2e. Vendored OSS — Giselle cluster (recoder-agency engine; ~28 pkgs)

The entire `@giselle-internal`/`@giselles-ai` internal monorepo renamed to
`@recoder/*` and vendored. Upstream Giselle code, **not net-new Recoder authorship.**

| Package | Path | Files | Class | Purpose |
|---------|------|------:|-------|---------|
| `@recoder/giselle` | `giselle` | 143 | vendored-oss | Core Giselle SDK (generations/workspace/integrations/operations) |
| `@recoder/protocol` | `protocol` | 50 | vendored-oss | Giselle protocol schemas (app/node/generation/workspace/data-store) |
| `@recoder/react` | `react` | 41 | vendored-oss | Giselle React client/hooks |
| `@recoder/github-tool` | `github-tool` | 36 | vendored-oss | Giselle GitHub tool (Octokit/GraphQL) |
| `@recoder/language-model` | `language-model` | 24 | vendored-oss | Giselle LLM provider adapters |
| `@recoder/language-model-registry` | `language-model-registry` | 16 | vendored-oss | Giselle language-model registry |
| `@recoder/pseudo-tiktoken` | `pseudo-tiktoken` | 11 | vendored-oss | TS tiktoken-approximation token counter |
| `@recoder/text-editor-utils` | `text-editor-utils` | 11 | vendored-oss | Giselle text-editor utils |
| `@recoder/workspace-utils` | `workspace-utils` | 9 | vendored-oss | Giselle workspace utils |
| `@recoder/node-registry` | `node-registry` | 8 | vendored-oss | Giselle node factories/conversion registry |
| `@recoder/text-editor` | `text-editor` | 6 | vendored-oss | Giselle text editor |
| `@recoder/web-search` | `web-search` | 6 | vendored-oss | Giselle web-search tool |
| `@recoder/ui` | `ui` | 6 | vendored-oss | Giselle UI components |
| `@recoder/http` | `http` | 5 | vendored-oss | Giselle http router/handler helpers |
| `@recoder/nextjs` | `nextjs` | 5 | vendored-oss | Giselle Next.js engine integration |
| `@recoder/sdk` | `sdk` | 5 | vendored-oss | Giselle Studio public Runs-API SDK |
| `@recoder/storage` | `storage` | 5 | vendored-oss | Giselle storage abstraction |
| `@recoder/stream` | `stream` | 5 | vendored-oss | Giselle streaming helpers |
| `@recoder/logger` | `logger` | 4 | vendored-oss | Giselle logger interface + noop |
| `@recoder/langfuse` | `langfuse` | 4 | vendored-oss | Giselle Langfuse tracing helpers |
| `@recoder/utils` | `utils` | 4 | vendored-oss | Giselle misc utils |
| `@recoder/supabase-driver` | `supabase-driver` | 4 | vendored-oss | Giselle Supabase driver |
| `@recoder/action-registry` | `action-registry` | 3 | vendored-oss | Giselle action/tool registry (thin) |
| `@recoder/data-store-registry` | `data-store-registry` | 3 | vendored-oss | Giselle data-store registry (thin) |
| `@recoder/trigger-registry` | `trigger-registry` | 3 | vendored-oss | Giselle trigger registry (thin) |
| `@recoder/vault` | `vault` | 7 | vendored-oss | Giselle secret vault |
| `@recoder/design-tokens` | `design-tokens` | 1 | **stub** | Design tokens (index.ts + tokens.css); Giselle origin |
| `@recoder/database` | `database` | 3 | **stub** | Thin DB client/types wrapper; Giselle-adjacent |

### 2f. Config / infra stubs

| Package | Path | Files | Class | Purpose |
|---------|------|------:|-------|---------|
| `@recoder/ecosystem-config` | `ecosystem-config` | 1 | **stub** | Single-file ecosystem config |
| `@recoder/tsconfig` | `tsconfig` | 0 | **stub** | Shared tsconfig (no TS source) |

### 2g. `packages/recoder-code/` — the terminal IDE (nested monorepo)

**Only `cli` and `core` are the real recoder-code product.** The other two are
auxiliary integrations.

| Sub-package | Path (`packages/recoder-code/packages/…`) | Files | Class | Purpose |
|-------------|-------------------------------------------|------:|-------|---------|
| `recoder-code-core` | `core` | 2035 | real | Core engine of the recoder-code terminal IDE |
| `recoder-code` | `cli` | 551 | real | recoder-code CLI front-end |
| `recoder-code-vscode-companion` | `vscode-ide-companion` | 45 | aux | VS Code IDE companion extension (not core) |
| `mcp-eternos` | `mcp-eternos` | 9 | aux/stub | Small auxiliary MCP server (not core) |

### 2h. OSS engine dirs outside `packages/` (full impls — context for §3 dups)

| Dir | Files | Note |
|-----|------:|------|
| `ts/recodergit` (`recodergit-monorepo`) | 2101 | Full RecoderGit (= "git-nexus") impl. Contract stub is `packages/recodergit` (9). **Memory's "ts/gitnexus" path is stale — the dir is `ts/recodergit`.** |
| `ts/pi` | 784 | Full upstream pi monorepo. Vendored split is `packages/pi-*` (4 pkgs, 407 files). |
| `py/mem0` | 381 | Full mem0 Python impl. TS SDK vendored at `packages/mem0` (64). |
| `py/browser-use` | 386 | Browser automation engine. |
| `py/colbert` | 114 | ColBERT retrieval. |

---

## 3. Duplicates / function-collision groups

Eleven overlap groups. For each: members, the **canonical** keeper, and the verdict.
Some are *intentional contract-vs-impl splits* — called out explicitly.

### G1 — a2a (three different "A2A" things; NOT redundant)
- `packages/a2a-js` (79, vendored upstream SDK) — wire transport.
- `packages/a2a-sdk` (40, owned helpers) — Recoder envelope/task-state/error glue.
- `packages/recoder-a2a` (2, standalone MCP server) — the deployable bridge.
- **Verdict:** Keep all three; they layer (SDK → helpers → server). **Not a real dup.**
  Action: add a one-paragraph README in each clarifying the boundary so they stop
  *looking* like dups.

### G2 — memory (layered, mostly intentional)
- `packages/agent-memory` (10, owned) — candidate-lifecycle **contracts**. Canonical contract.
- `packages/mem0` (64, vendored TS SDK) — vector-store memory **impl**.
- `py/mem0` (381, vendored Python) — upstream impl, separate language runtime.
- `packages/brain` (41, owned) — **fusion** layer consuming mem0+recodergit+context7+beads.
- **Verdict:** `agent-memory` (contract) + `brain` (fusion) + one mem0 impl is the right
  shape. **Risk/redundancy:** carrying BOTH `packages/mem0` (TS) and `py/mem0`
  (Python) is the real duplication — pick the runtime actually wired into `brain`
  and drop or archive the other. Verify which `brain` imports before removing.

### G3 — mcp
- `packages/agent-mcp` (32, owned) — registry/permission **contracts**. Canonical.
- `packages/recoder-a2a` (2) — an MCP **server impl** (also in G1).
- `packages/recoder-code/packages/mcp-eternos` (9) — auxiliary MCP server.
- **Verdict:** Keep `agent-mcp` as contract. `recoder-a2a` is the supported server.
  `mcp-eternos` is orphan-ish — confirm it's still referenced; if not, delete.

### G4 — cli (adjacent, not redundant)
- `packages/cli` / `recoder-cli` (311) — full CLI product.
- `packages/recoder-cli-router` (147) — LLM provider router consumed by the CLI.
- `packages/recoder-code/packages/cli` (551) — the terminal-IDE CLI (different product).
- **Verdict:** Three distinct CLIs. Keep all, but the naming is a trap — document that
  `recoder-cli` (platform) ≠ `recoder-code` (terminal IDE) ≠ `recoder-cli-router` (lib).

### G5 — sandbox / daytona (heavy layering — prime cleanup target)
- `packages/agent-sandbox` (6, owned contracts). Canonical contract.
- `packages/sandbox-providers` (2, **stub** compat shim).
- `packages/sandbox-daytona` (28, vendored Daytona TS SDK).
- `packages/daytona-api-client` (207, **generated**).
- `packages/daytona-toolbox-api-client` (101, **generated**).
- **Verdict:** `sandbox-providers` is a pure compat shim → **fold into `agent-sandbox`
  and delete.** Keep the generated clients (regenerable, don't hand-edit). Confirm
  `sandbox-daytona` still imports both generated clients before touching them.

### G6 — browser (different layers; not a dup)
- `packages/browser-verification` (2, **stub** contracts).
- `packages/recoder-browser-tools` (5, vendored Playwright tools).
- `py/browser-use` (386, full automation engine).
- **Verdict:** Different layers (contract / TS tools / Python engine). Keep, but
  `browser-verification` is a near-empty stub — either flesh out or merge its 2 files
  into `agent-observability`/`agent-sandbox` evidence contracts.

### G7 — pi (vendored split vs full upstream — DUP)
- `packages/pi-{agent-core,ai,coding-agent,tui}` (4 pkgs, 407 files; pinned 0.78.0,
  except `pi-ai` drifted to 0.80.2).
- `ts/pi` (784, full upstream monorepo).
- **Verdict:** Real duplication. Either depend on `ts/pi` workspaces OR keep the
  `packages/pi-*` split — not both. **Version drift (`pi-ai` 0.80.2 vs siblings
  0.78.0) is a latent bug.** Pick one source, re-pin to a single version.

### G8 — git / recodergit (contract-vs-impl — intentional, but path-confusing)
- `packages/recodergit` (9, owned **contracts**). Canonical contract.
- `ts/recodergit` (2101, full RecoderGit impl, a.k.a. git-nexus).
- **Verdict:** Intentional contract/impl split. **Keep both.** Fix the stale
  reference: docs/memory call the impl `ts/gitnexus`; the actual path is
  `ts/recodergit`. Update references.

### G9 — beads (contract-vs-impl)
- `packages/beads-adapter` (7, owned adapter → TaskSpec).
- `go/beads` (Go issue-tracker impl; the `bd` CLI).
- **Verdict:** Intentional. Keep both.

### G10 — agent-core (compat facade)
- `packages/agent-os` (40, canonical core).
- `packages/agent-kernel` (2, **stub** facade re-exporting agent-os).
- **Verdict:** `agent-kernel` exists only for back-compat imports. Once consumers
  migrate to `@recoder/agent-os`, **delete `agent-kernel`.**

### G11 — Giselle cluster (28 vendored pkgs as one unit)
- Listed in §2e. These are one upstream monorepo, not 28 independent decisions.
- **Verdict:** Treat as a single vendored unit owned by `recoder-agency`. **Do not
  hand-edit individually.** Long-term: relocate the whole cluster under a
  `vendor/giselle/` boundary (or git submodule) so it stops polluting the owned
  `packages/*` namespace and inflating the package count.

---

## 4. Stubs / cruft

Thin or placeholder packages (≤4 authored files, or pure re-export facades):

| Package | Files | Kind | Recommendation |
|---------|------:|------|----------------|
| `packages/agent-kernel` | 2 | compat facade | Delete after consumers move to `agent-os` (G10) |
| `packages/sandbox-providers` | 2 | compat shim | Fold into `agent-sandbox`, delete (G5) |
| `packages/browser-verification` | 2 | thin contracts | Flesh out or merge into observability (G6) |
| `packages/ui-agent-os` | 4 | thin UI contracts | Keep if cockpit consumes it; else merge into `ui` consumers |
| `packages/database` | 3 | thin DB wrapper | Verify usage; merge into `shared` if orphan |
| `packages/design-tokens` | 1 | single index + css | Keep (cheap), Giselle-origin |
| `packages/ecosystem-config` | 1 | single-file config | Keep (cheap) |
| `packages/tsconfig` | 0 | shared tsconfig | Keep (infra, no source by design) |
| `packages/recoder-code/packages/mcp-eternos` | 9 | aux MCP server | Confirm referenced; delete if orphan |
| `packages/recoder-code/packages/vscode-ide-companion` | 45 | aux VS Code ext | Keep (real companion, just not core) |

**recoder-code scope note:** only `recoder-code/packages/{cli,core}` are the real
recoder-code product (terminal IDE). `mcp-eternos` and `vscode-ide-companion` are
auxiliary integrations — keep them clearly labeled so they aren't mistaken for core.

---

## 5. Recommendations (ordered by impact)

**Honest framing:** most apparent "duplicates" are *intentional contract-vs-impl
splits* the architecture mandates (contracts in `packages/`, impl in
`ts/`/`py/`/`go/`/`crates/`). Do NOT collapse those — collapsing a contract into its
impl re-couples the control plane to a runtime, violating `monorepo.md`. The real
wins are: isolating vendored clusters, killing facades, and fixing version drift.

1. **Isolate the Giselle cluster (highest impact, low risk).** 28 vendored pkgs
   (§2e) sit in the owned `packages/*` namespace, dominating the package count and
   obscuring what Recoder actually authored. Move under `vendor/giselle/` (or a
   submodule) owned by `recoder-agency`. No behavior change; massive clarity gain.

2. **Resolve the pi duplication + version drift (G7, medium risk).** Choose `ts/pi`
   workspaces OR the `packages/pi-*` split — not both. Re-pin `pi-ai` (0.80.2) to
   match siblings (0.78.0) or bump all four together. The split version is a latent
   incompatibility bug.

3. **Pick one mem0 runtime (G2, medium risk).** Carrying `packages/mem0` (TS, 64) and
   `py/mem0` (Python, 381) is true duplication. Check which `brain` actually imports;
   archive the other. Verify before deleting — `brain` fusion depends on it.

4. **Delete the compat facades (G5, G10, low risk).** `agent-kernel` (2) and
   `sandbox-providers` (2) exist only to re-export. Migrate importers to
   `agent-os` / `agent-sandbox`, then remove. Two fewer packages, zero lost behavior.

5. **Fix stale path references (zero risk, do now).** Docs/memory call the RecoderGit
   impl `ts/gitnexus`; it lives at **`ts/recodergit`** (2101 files). Update all
   references so the G8 contract/impl split is navigable.

6. **Audit the orphan-prone stubs (low risk).** `mcp-eternos`, `database`,
   `browser-verification`, `ui-agent-os`: confirm each has a live importer. Delete or
   merge the ones that don't (§4).

7. **Keep — do not touch:** all `@recoder/agent-*` contracts, `a2a-sdk`, `oss-registry`,
   `pal`, `brain`, `recodergit` (contract), `beads-adapter`, `auth`; the generated
   Daytona clients (regenerable); and every `ts/`/`py/`/`go/`/`crates/`/`c/` OSS dir
   (vendored-as-intended, including real upstream `tmux`).

---

## Appendix — counts

- **Top-level `packages/*` (excl. `recoder-code` container):** 79
- **`recoder-code` nested packages:** 4 (2 core: `cli`, `core`; 2 aux)
- **Total inventoried packages:** 83
- **Class breakdown (top-level 79):** real 33 · vendored-oss 36 · generated 2 · stub 8
- **Duplicate/overlap groups:** 11 (G1–G11)
- **Stub/cruft packages:** 8 top-level + 1 aux (`mcp-eternos`)
- **OSS dirs (`crates`/`go`/`py`/`ts`/`c`):** 4 + 3 + 5 + 11 + 1 = 24 vendored subsystems
