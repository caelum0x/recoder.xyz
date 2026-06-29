# Recoder — Development Guide

> Contributor/dev guide for the `recoder.xyz` monorepo. Canonical cross-agent
> policy lives in [`AGENTS.md`](../AGENTS.md); this doc is the **how-to-build-and-prove-it**
> companion. For the wiring model read
> [`architecture/INTEGRATION-PLAN.md`](./architecture/INTEGRATION-PLAN.md); for the
> tree-by-tree map read [`DIRECTORY-MAP.md`](./DIRECTORY-MAP.md).

All claims here are grounded in real `package.json` scripts and on-disk files.
Anything not yet wired into a default runtime path is marked **planned**/**gated**.

---

## 1. Prerequisites

| Tool | Version | Source |
|------|---------|--------|
| Node.js | `>=18` (`engines.node`) | root [`package.json`](../package.json) |
| pnpm | `10.30.3` (`packageManager`) | root `package.json` |
| git | any recent | required by the conductor worktree path |
| `bd` (beads) | repo issue tracker | see [§6](#6-bd-issue-workflow) |

Install everything (recursive across the workspace):

```bash
pnpm install
# or, explicitly recursive:
pnpm run install:all
```

---

## 2. Monorepo layout

The workspace is defined in [`pnpm-workspace.yaml`](../pnpm-workspace.yaml):

```yaml
packages:
  - docker-backend
  - apps/agent-gateway
  - apps/agent-worker
  - apps/mobile
  - shared
  - packages/*
  - scripts
  - ts/extracted-from-openclaw
```

High-level surfaces (from [`AGENTS.md`](../AGENTS.md) "Project Snapshot"):

| Tree | Role |
|------|------|
| `docker-backend/` | Service runtime + agent orchestration (the engines host) |
| `app/` | `recoder.xyz` — auth/control-plane (held; auth/deploy-sensitive) |
| `recoder-agents/` | `agents.recoder.xyz` frontend |
| `recoder-agency/` | `agency.recoder.xyz` |
| `recoder-pm/` | `pm.recoder.xyz` |
| `recoder-web/` | `web.recoder.xyz` |
| `packages/agent-*` | Agent OS contracts (see [`monorepo.md`](../.claude/rules/monorepo.md)) |
| `apps/agent-gateway`, `apps/agent-worker` | Agent OS gateway/worker (being folded into `docker-backend`) |

For the full directory-by-directory verdict (keep / wire-up / park / drop), see
[`DIRECTORY-MAP.md`](./DIRECTORY-MAP.md). For each tree's *integration mode*, see
[`architecture/INTEGRATION-PLAN.md`](./architecture/INTEGRATION-PLAN.md).

---

## 3. The in-process-fusion wiring model

The single most important architectural rule — fully specified in
[`architecture/INTEGRATION-PLAN.md`](./architecture/INTEGRATION-PLAN.md) §0 — is that
every connection between two trees uses **exactly one** of three modes:

| Mode | When | Examples |
|------|------|----------|
| **`in-process-import`** (fusion) | Both sides are first-party `@recoder/*` TS/JS sharing the Node process | `agent-os`, `pal`, `governance`, `brain`, `substrate` → `docker-backend` |
| **`subprocess-cli`** | A coding-agent CLI or process-isolated tool | `claude -p`, `codex`, `pi` under tmux; `bd`; governance Rust daemon over UDS |
| **`http-edge`** | A true edge: cross-machine, cross-trust-domain, or a browser/external client | `app/` ↔ `docker-backend` over `/api/*`; external agents over `/api/a2a` + `/api/mcp` |

**Bluntly:** first-party packages fuse in-process (you `import` them, you do **not**
stand up an HTTP service between two owned packages); the coding agents are
subprocesses under tmux inside a git worktree (restart-survivable — node-pty was
tried and reverted); HTTP only at real edges. The build reflects this — `build:agent-os`
(root `package.json`) compiles each `@recoder/agent-*` package so the host can import
them directly.

> Read [`architecture/INTEGRATION-PLAN.md`](./architecture/INTEGRATION-PLAN.md) before
> adding any cross-tree call; it also cross-links
> [`CONDUCTOR-ARCHITECTURE.md`](./CONDUCTOR-ARCHITECTURE.md) and
> [`WIRE-UP-BACKLOG.md`](./WIRE-UP-BACKLOG.md).

---

## 4. Build, format, type-check, test

All commands run from the repo root unless noted. Definitions live in the root
[`package.json`](../package.json) `scripts` block.

### 4.1 Format

```bash
pnpm format          # prettier --write .
pnpm format:check    # prettier --check .
```

### 4.2 Type-check

```bash
pnpm check-types     # alias -> typecheck -> typecheck:all
```

`check-types` fans out to `typecheck:core` (`docker-backend` → `pnpm run ci:check`)
and `typecheck:platforms` (mobile + desktop), per the root `package.json`.

### 4.3 Build

```bash
pnpm build           # build:all (core + platforms, parallel)
pnpm build:core      # docker-backend: tsc
pnpm build:agent-os  # builds every @recoder/agent-* package + gateway + worker
```

### 4.4 Test

```bash
pnpm test            # test:all (core + platforms, parallel)
pnpm test:engine     # docker-backend only: vitest --run
```

`docker-backend` uses vitest (`docker-backend/package.json`: `"test": "vitest --run"`).

### 4.5 Focused Agent OS checks

Per [`.claude/rules/testing.md`](../.claude/rules/testing.md), prefer the **narrowest**
checks during active Agent OS work over the broad monorepo gates:

```bash
pnpm agent:instructions:check    # node scripts/check-agent-instructions.ts
pnpm test:contracts:agent-os     # node --import tsx --test tests/contracts/agent-os/*.test.ts
pnpm test:evals:agent-os         # node --import tsx --test tests/evals/agent-os/*.test.ts
```

Other useful Agent OS smokes (all root `package.json` scripts, all real `tsx` entry points):

```bash
pnpm agent-os:smoke        # scripts/agent-os-smoke.ts
pnpm a2a:smoke             # scripts/a2a-smoke.ts
pnpm mcp:smoke             # scripts/mcp-smoke.ts
pnpm runtime-adapter:verify
pnpm oss:health
```

---

## 5. Running the proofs

Three headless end-to-end proofs drive the **real, fused** engines with no live
server and no BYOK model key. Each exits non-zero on failure and never fakes
readiness.

### 5.1 Conductor loop proof

Proves the fused control-plane loop runs end-to-end (WorkspaceEngine →
run-tailer → completion-watcher → delivery summary) using a real git worktree and
an honest stub `in_process` substrate (no model key needed). Asserts the real
`started → log → completed` RunEvent stream and the `running → awaiting_review`
transition.

```bash
npx tsx docker-backend/scripts/e2e-conductor-loop.ts
# or:
pnpm --filter recoder-docker-backend exec tsx scripts/e2e-conductor-loop.ts
```

Source + the exact contract it proves: [`docker-backend/scripts/e2e-conductor-loop.ts`](../docker-backend/scripts/e2e-conductor-loop.ts).

### 5.2 Conductor approval / governance proof

Proves the delivery governance gate (FR-5): a gated `merge`/`pr` with **no**
approved control-plane Approval record is held/denied, then the **same** action
proceeds past the gate once a real `@recoder/agent-os` Approval is created and
approved. Verifies the SHA-256 Merkle audit chain at the end.

```bash
npx tsx docker-backend/scripts/e2e-conductor-approval.ts
# or:
pnpm --filter recoder-docker-backend exec tsx scripts/e2e-conductor-approval.ts
```

Source: [`docker-backend/scripts/e2e-conductor-approval.ts`](../docker-backend/scripts/e2e-conductor-approval.ts).

### 5.3 Desktop dev-boot proof

Proves the desktop `BackendSupervisor` genuinely boots the embedded
`docker-backend` (tmux + engines host), mints a real platform key, and that
`GET /api/conductor/health` returns `200` with the substrate shape
`{ available, git, tmux, tmuxBin }`. This is the dev path (`isPackaged:false`).

```bash
# from apps/desktop:
npm run dev:boot-proof
# which runs:
node apps/desktop/scripts/dev-boot-proof.js
```

Source: [`apps/desktop/scripts/dev-boot-proof.js`](../apps/desktop/scripts/dev-boot-proof.js)
(script defined as `dev:boot-proof` in `apps/desktop/package.json`).

> These proofs use an in-memory agent-os repository (`AGENT_OS_REPOSITORY=memory`,
> set by the harness) — no Postgres required. The loop/approval harnesses provision
> real isolated git worktrees under a temp `CONDUCTOR_WORKTREE_ROOT`.

---

## 6. bd issue workflow

This repo tracks issues with **bd** (beads) — not markdown TODO trackers, not
external trackers ([`AGENTS.md`](../AGENTS.md) "Issue Tracking with bd"). Run
`bd onboard` first.

```bash
bd ready --json                       # find ready work
bd show <id> --json                   # inspect an issue
bd update <id> --claim --json         # atomically claim work
bd update <id> --deps discovered-from:<parent-id>   # link newly discovered work
bd close <id> --reason "Completed" --json
bd vc status                          # version-control status of the issue DB
```

There are also `tsx` helpers wired in the root `package.json` for syncing beads to
the control plane:

```bash
pnpm beads:sync            # scripts/beads-sync.ts
pnpm beads:task:create     # scripts/beads-task-create.ts
pnpm beads:task:status     # scripts/beads-task-status.ts
```

---

## 7. Landing the plane

When ending a session with code changes (from [`AGENTS.md`](../AGENTS.md) "Landing The Plane"):

1. File follow-up `bd` issues for remaining work.
2. Run the relevant quality gates (§4 + §5).
3. Update and close the claimed `bd` issue.
4. `git pull --rebase`
5. `bd vc status`
6. `git push`
7. Verify `git status` shows the branch up to date with origin.

Do not stop before the work is committed and pushed. Keep health, approval, and
verification status **truthful** — never imply success without evidence
([`CLAUDE.md`](../CLAUDE.md)).

---

## See also

- [`AGENTS.md`](../AGENTS.md) — canonical cross-agent policy
- [`architecture/INTEGRATION-PLAN.md`](./architecture/INTEGRATION-PLAN.md) — wiring modes
- [`DIRECTORY-MAP.md`](./DIRECTORY-MAP.md) — every tree → verdict
- [`CONDUCTOR-ARCHITECTURE.md`](./CONDUCTOR-ARCHITECTURE.md) — the conductor loop
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — design + run loop
- [`.claude/rules/testing.md`](../.claude/rules/testing.md) — verification strategy
- [`.claude/rules/monorepo.md`](../.claude/rules/monorepo.md) — package boundaries
