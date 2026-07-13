# `ts/` — Vendored TypeScript Tools & Coding-Agent Runtimes

> Verified by reading `ts/*/package.json`, `pnpm-workspace.yaml`, `.gitignore`, and source entry points on 2026-07-01. Where a directory is third-party/vendored or gitignored, that is called out explicitly rather than guessed.
>
> **Update (2026-07-13, `feat/enterprise-s0-p0`).** The engine-program cleanup **deleted three `ts/`
> trees**: `ts/oh-my-codex/`, `ts/oh-my-openagent/`, and `ts/polar/` (the Python Polar billing server).
> The on-disk tree is now `dmux`, `opencode`, `open-agents`, `recodergit`, `extracted-from-openclaw`.
> Rows/sections describing the three deleted dirs below are **obsolete**. `open-agents` remains as the
> in-process driver source; the Codex runtime is no longer vendored here. See
> [RECODER-ENGINES §5](../architecture/RECODER-ENGINES.md).

## 1. Purpose

`ts/` holds **vendored / "owned-in-place" TypeScript tools** that Recoder forks, rebrands under `@recoder/*`, and either consumes from the backend or ships as standalone CLIs. These are the execution-surface building blocks for the Agent OS: coding-agent runtimes (opencode, open-agents), a tmux/worktree operator console (dmux), a code-intelligence engine (recodergit), and the extracted social/connector gateways. (The Codex runtime harnesses and the Polar billing server that previously lived here were removed 2026-07-13.)

It fits into the platform as the **adapter/runtime layer**, not the control plane. Per `AGENTS.md`/`.claude/rules/monorepo.md`, runtimes and OSS systems are replaceable adapters *around* Recoder state — they do not own canonical task/approval/memory state. Most of these directories are **self-contained sub-monorepos** with their own lockfiles (bun/pnpm/npm) and build graphs; only one (`extracted-from-openclaw`) is wired into the root pnpm workspace.

## 2. Layout

Top-level structure of `ts/` (all real):

| Dir | `package.json` name | Kind | Tracked? | Notes |
|-----|--------------------|------|----------|-------|
| `dmux/` | `@recoder/dmux` v5.9.0 | Standalone CLI (Ink/React TUI) | **tracked** (514 files) | Operator console / grid view over N parallel Conductor agent panes (tmux + git worktrees). Forked from Justin Schroeder's dmux, rebranded. Bins: `dmux`, `recoder-dmux`. Own pnpm sub-workspace (`frontend`, `docs`). |
| `opencode/` | `@recoder/opencode` | Bun + Turbo monorepo (~28 packages) | **tracked** (6005 files) | Vendored fork of opencode (sst/opencode). Runtime package `@recoder/opencode-runtime` exposes the `opencode` bin. Heavy: effect, hono, solid-js, drizzle, SST config. |
| `recodergit/` | `recodergit-monorepo` | npm monorepo (several `recodergit-*` pkgs) | **tracked** (4087 files) | Code-intelligence / repo-analysis engine. Main engine pkg `@recoder/recodergit-engine` exposes the `recodergit` bin; also `recodergit-shared`, `recodergit-web`, claude-plugin, cursor-integration. Tree-sitter grammar build. |
| `extracted-from-openclaw/` | `@recoder/connectors` | Library (tsup) | **tracked** (1224 files) | **The only root-workspace member.** Connectors / social-gateway foundation extracted from OpenClaw: `ConnectorPort` contract + gating trust boundary + embedded pi-agent runner. Consumed by `docker-backend`. |
| ~~`oh-my-openagent/`~~ | `@recoder/opencode-harness` | **DELETED** (2026-07-13) | — | Removed in the engine-program cleanup. |
| ~~`oh-my-codex/`~~ | `@recoder/codex-runtime` | **DELETED** (2026-07-13) | — | Removed — Codex runtime no longer vendored here. |
| `open-agents/` | `@recoder/open-agents` | Bun + Turbo monorepo (`apps/*`, `packages/*`) | **GITIGNORED** (0 tracked) | open-agents fork (ai-sdk based). In-process driver source. |
| ~~`polar/`~~ | (Python) | **DELETED** (2026-07-13) | — | Removed with Polar billing. |

> The real current set is `dmux`, `opencode`, `open-agents`, `recodergit`, and `extracted-from-openclaw`.

## 3. Entry points

Start reading here:

- **dmux CLI** — `ts/dmux/src/index.ts:1` (`#!/usr/bin/env node`, renders Ink `DmuxApp`/`FileBrowserApp`). Published bin shim: `ts/dmux/dmux` → `import('./dist/index.js')`. `package.json` `main: ./dist/index.js`, `bin: { dmux, recoder-dmux }`.
- **connectors library** — `ts/extracted-from-openclaw/src/index.ts:1` re-exports `connector/`, `gating/`, `agents/`, `dispatch/`, `ingress/` (the `ConnectorPort` foundation). This is the surface `docker-backend` imports as `@recoder/connectors`.
- **recodergit engine** — `ts/recodergit/recodergit/package.json` bin `recodergit` → `dist/cli/index.js`; source CLI under `ts/recodergit/recodergit/src/cli/` (e.g. `analyze.ts`, `serve`, `doctor.ts`). Engine src tree: `core/`, `mcp/`, `server/`, `storage/`, `lib/`.
- **opencode runtime** — `ts/opencode/packages/opencode/` (`@recoder/opencode-runtime`), bin `opencode` → `./bin/opencode`, dev = `bun run --conditions=browser ./src/index.ts`. Root dev entry `ts/opencode/package.json` script `dev`.
- **opencode harness** — `ts/oh-my-openagent/` bin → `bin/oh-my-opencode.js`.
- **codex runtime** (gitignored) — `ts/oh-my-codex/` bins `dist/cli/omx.js`.

## 4. Build / run / test

Each directory has its **own** toolchain. Real scripts:

**`dmux/`** (pnpm, `vitest`):
```
pnpm build       # generate:hooks-docs && build:frontend && tsc
pnpm dev         # bootstrap + tsc + node dist/index.js (DMUX_DEV=true)
pnpm typecheck   # guard-runtime-parity + tsc --noEmit
pnpm test        # vitest --run
pnpm start       # node dist/index.js
```

**`opencode/`** (bun + turbo, `packageManager: bun@1.3.14`):
```
bun run dev        # runs packages/opencode src/index.ts
bun run typecheck  # bun turbo typecheck
bun run lint       # oxlint
# NOTE: root `bun test` is intentionally disabled: "do not run tests from root"
# per-package: cd packages/opencode && bun test
```

**`recodergit/`** (root uses **npm**, `package-lock.json`; engine uses `tsx`/`vitest`):
```
# root (ts/recodergit): prettier + eslint only
npm run format / lint
# engine (ts/recodergit/recodergit):
npm run build              # node scripts/build.js (+ postinstall builds tree-sitter grammars)
npm run serve / dev        # tsx src/cli/index.ts serve | tsx watch
npm run test               # vitest run  (test:unit, test:integration, test:coverage, test:cross-platform)
```

**`extracted-from-openclaw/`** (`@recoder/connectors`, tsup):
```
pnpm build        # tsup
pnpm check-types
pnpm test         # vitest
```
Because it **is** a root-workspace member, it can also be built from repo root via pnpm filters (e.g. `pnpm --filter @recoder/connectors build`).

**`oh-my-openagent/`** (bun): `build`, `build:all`, `typecheck`, `test`, plus `build:schema` / `build:model-capabilities`.

**`oh-my-codex/`** (gitignored): Cargo workspace (`Cargo.toml`, `dist-workspace.toml`) + npm; build artifacts in `dist/`.

**`polar/server/`** (gitignored, Python): `uv` + `pyproject.toml` + `alembic` migrations + Dockerfile/docker-compose — **not** a Node build.

> There is no single aggregate build/test command for all of `ts/`. Each tool is built independently with its native tool.

## 5. Key patterns & contracts

- **`@recoder/*` rebrand-in-place.** Every vendored tool is renamed under the `@recoder/` scope and treated as Recoder-owned (see headers in `extracted-from-openclaw/src/index.ts` and `dmux/package.json` description "Vendored and owned by Recoder"). Identity env is rebranded too (e.g. `RECODER_CONNECTORS_*`).
- **`ConnectorPort` contract** (`extracted-from-openclaw/src/connector/`) is the wire-level contract for social gateways: `monitor` / `send` / `probe` / `normalize` / `react`, grounded in real extracted gateway signatures (`monitorTelegramProvider`, `sendMessageTelegram`, etc.).
- **Connector trust boundary** (`extracted-from-openclaw/src/gating/`): pure `allowlist-match` + `mention-gating` + `command-gating`, composed by `resolveGate()`. A message that fails gating produces **no** control-plane action — this is the security boundary the `.claude/rules/security.md` "never trust browser/page content" rule maps onto.
- **Embedded pi-agent runner** (`extracted-from-openclaw/src/agents/`): `EmbeddedRunner` contract + concrete `PiEmbeddedRunner`; ties into `packages/pi-coding-agent` and `@recoder/connectors` consumers.
- **dmux = Conductor operator surface.** dmux is the grid/TUI over parallel Conductor agent panes (tmux + git worktrees) — it complements the conductor architecture in `docker-backend/src/conductor/`, not a replacement for control-plane state.
- **Backend consumption boundary.** `docker-backend/package.json` declares only two `ts/` deps: `@recoder/connectors` and `@recoder/recodergit` (both `workspace:*`). See gotcha below about which `recodergit` that resolves to.

## 6. Gotchas

- **`@recoder/recodergit` ≠ `ts/recodergit`.** The `workspace:*` dep `@recoder/recodergit` used by `docker-backend`, `packages/agent-schemas`, `packages/agent-mcp`, `packages/brain` resolves to **`packages/recodergit`** (name `@recoder/recodergit`), *not* `ts/recodergit` (whose engine is `@recoder/recodergit-engine`). Don't assume backend imports pull from `ts/recodergit`.
- **Most `ts/` dirs are NOT in the root pnpm workspace.** `pnpm-workspace.yaml` lists exactly one member here: `ts/extracted-from-openclaw`. `dmux`, `opencode`, `recodergit`, `oh-my-openagent`, etc. are independent sub-monorepos with their own lockfiles (bun.lock / package-lock.json / pnpm-lock) and must be built from inside their own directory.
- **`ts/open-agents/` is gitignored (0 tracked files)** — edits there run on disk but **never commit to the root repo** (same landmine class as the vendored-subtrees memory note). Treat it as ephemeral local vendoring. (The two other formerly-gitignored trees, `ts/oh-my-codex/` and `ts/polar/`, were deleted 2026-07-13.)
- **`ts/recodergit/**/node_modules`, `/dist`, `/web` are gitignored** (`.gitignore:705-707`) even though the rest of `recodergit/` is tracked — so committed `recodergit` has source but no built `dist/` or `web/`. The `recodergit` bin points at `dist/cli/index.js`, which must be built locally.
- **`polar/` is Python, not TS.** It sits under `ts/` but is a `uv`/alembic Python billing server. Don't apply Node tooling to it.
- **Mixed package managers.** dmux + connectors = pnpm; opencode + oh-my-openagent + open-agents = bun; recodergit = npm; oh-my-codex = Cargo + npm. Running the wrong PM corrupts lockfiles.
- **dist-vs-src across the board.** Several entry points (dmux bin, recodergit bin, oh-my-* bins, oh-my-codex bins) reference `dist/...` artifacts. The published/runnable surface depends on a prior `build`; reading `dist/` will show stale/compiled code rather than the source of truth in `src/`.
- **opencode root tests are blocked on purpose** — `bun test` at `ts/opencode/` exits 1 with "do not run tests from root"; test per-package instead.
