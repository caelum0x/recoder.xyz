# Recoder Backend Platform — Owned OSS Merge Plan

Last updated: 2026-06-23. Canonical plan for the **owned agent-infrastructure backend**.
Decision-locked; supersedes the deferrals in `agent-os/15-oss-integration-plan.md` for
the components named below. Aligned with `PIVOT-INFRA.md` (infra, not frontend).

## 1. Thesis

One owned Node/TS backend (`docker-backend` + `@recoder/*` packages, plus a small
owned Rust sidecar) that **runs and orchestrates many coding agents in parallel**.
Every external capability is owned first-party — deep integration, no thin shims.
"Like Linux took unix ideas": we merge these OSS systems into our product as our
own, in the form that fits a Node backend.

We are infra. We do **not** build a chat/web-builder frontend (that is the legacy
"needless stuff" — deprioritized, see §6).

## 2. The owned backend — what "merge" means per component

| Component | Source nature | How we own it (locked decision) |
| --- | --- | --- |
| **tmux** | C terminal multiplexer | **Own in TS** — new `@recoder/session-mux` on `node-pty` (already a dep). Gives Conductor: spawn detached session, scrollback, capture, sendKeys, list, kill. No system `tmux`. |
| **pi-agents** | TS agent runtime (`@recoder/pi-*`) | Owned. Becomes a **real Conductor runtime driver**; connected to `recoder-code` CLI. |
| **agent CLIs** | claude-code / codex / opencode / recoder-code | Driven for real by Conductor drivers (headless invocations). **No driverless stubs.** |
| **openfang** | Rust Agent OS (router/approval/kernel/memory) | **Vendor Rust as owned sidecar** (`vendor/openfang` → `recoder-openfang`); backend calls it for model-routing + approval risk scoring. |
| **a2a** | A2A wire protocol (`@recoder/a2a-*`) | The interop **gate** — external agents connect here; emit shared `RunEvent`s. |
| **context7** | Docs intelligence (`@recoder/context7-sdk`) | Injected into instruction bundles in the run loop. |
| **mem0** | Memory (`@recoder/mem0`) | Run-loop memory: recall before, candidate after (evidence-backed). |
| **git-nexus** | Code intelligence (`@recoder/git-nexus`) | Repo understanding fed to agents + diff/PR evidence. |
| **daytona** | Sandboxes (`@recoder/sandbox-daytona`) | Owned isolated execution substrate; evidence producer. |
| **agent-os** | Control plane | Binds task → run → approval → artifact → verification + provenance. |

### 2.1 Source clones → owned target (merge provenance)

All clones live at repo root, **gitignored** (source to merge *from*, never committed raw):

| Clone (lang) | Owned target | Status |
| --- | --- | --- |
| `pi/` (TS) | `@recoder/pi-*` | merged; → real Conductor driver |
| `GitNexus/` (TS) | `@recoder/git-nexus` | merged; → run-loop evidence |
| `mem0/` (TS) | `@recoder/mem0` | merged; → run-loop memory |
| `context7/` (TS) | `@recoder/context7-sdk` | merged; → bundle docs |
| `A2A/` `a2a-js/` (TS) | `@recoder/a2a-*` | merged; → interop gate |
| `opencode/` `gemini-cli/` `qwen-code/` (TS) | runtime CLIs | driven headless by Conductor |
| `openfang/` (**Rust**) | `vendor/openfang` → `recoder-openfang` sidecar | **Wave 2** |
| `claw-code-parity/` (Rust) | approval `PermissionEnforcer` rubric | port types (Wave 2) |
| `daytona-projects/` (TS) | `@recoder/sandbox-daytona` | merged; → sandbox substrate |
| `beads/` (Go) | `@recoder/beads-adapter` (bd CLI) | issue tracking |
| `agent-browser/` `stagehand/` (TS) | `@recoder/browser-verification` | verification evidence |
| `ziti/` `ollama/` (Go) | deferred (network mesh / local LLM) | not in Waves 0–4 |
| `multica/` `oh-my-codex/` `oh-my-openagent/` `open-agents/` `ops-recorder/` `pal-mcp-server/` | reference / mine logic | per `15-oss-integration-plan.md` |
| **tmux** | `@recoder/session-mux` (TS, node-pty) | **no clone — owned from scratch** (Wave 0) |

## 3. The spine — the parallel-agent run loop (Conductor)

This is the product. Everything above plugs into one loop:

```
task (control plane)
  -> route        (openfang sidecar: complexity/cost model selection)
  -> bundle       (agent-instructions + context7 docs + mem0 recall)
  -> isolate      (git worktree + @recoder/session-mux session)   <- owned tmux
  -> run          (Conductor driver launches the agent CLI headless: pi / claude-code / codex / opencode / recoder-code)
  -> stream       (session scrollback -> RunEvents -> control plane + A2A)
  -> gate         (openfang risk tiers -> approval-service)
  -> verify       (verification commands; git-nexus diff evidence)
  -> deliver      (artifacts, PR, preview; mem0 candidate)
```

## 4. Build sequence (waves) — each wave is real, verified, committed

- **Wave 0 — Own the session layer (the tmux merge).**
  `@recoder/session-mux` (node-pty): `spawn / capture / sendKeys / list / kill` +
  per-session scrollback. Refactor `docker-backend/src/conductor/tmux-orchestrator.ts`
  to use it instead of system `tmux`; keep git-worktree isolation. `availability()`
  reports git only (mux is in-process). Verify: package builds, backend `tsc` 0.

- **Wave 1 — Real runtime drivers (no stubs).**
  `conductor/runtime-commands.ts`: headless invocations —
  `claude -p`, `codex exec`, `opencode run`, `recoder-code --prompt`, pi entry.
  `conductor/runtime-driver.ts`: start session → stream scrollback as `RunEvent`s →
  detect exit → completed/failed. Attach as the `RuntimeExecutionDriver` for the
  `@recoder/agent-runtimes` adapters (claude-code/codex/opencode/recoder-code) so
  `sendTask` actually executes. Routes: `GET /api/conductor/runtimes`,
  `POST /api/conductor/runtimes/:id/run`. Verify: live run in a worktree on this repo.

- **Wave 2 — openfang sidecar (routing + approval).**
  `vendor/openfang` (Rust, pinned) → `recoder-openfang` sidecar exposing
  `/route` (complexity/cost model selection) and `/approve` (risk tiers).
  Backend client `docker-backend/src/openfang/` with fail-safe degradation when the
  sidecar is down. Wire into task-routing + approval-service. Verify: contract test
  against the sidecar; degradation path covered.

- **Wave 3 — Knowledge in the loop.**
  context7 docs + mem0 recall into instruction bundles; git-nexus diff evidence into
  verification/artifacts. Verify: bundle snapshot shows injected sources + provenance.

- **Wave 4 — Interop + sandbox.**
  A2A as the external entry (agents launch Conductor runs via `/api/a2a/*`); daytona
  as an alternate isolation substrate behind the same driver contract.

## 5. Non-negotiables

- Production-grade only. **No stubs / no boundaries that fake success.** A driver that
  can't run a runtime reports it unavailable; it never marks a task complete.
- Own OSS as first-party (`@recoder/*` or pinned `vendor/*`); never "vendor"-as-shim.
- Keep the monorepo green; verify each wave before claiming done.
- Control plane owns task/run/approval/artifact/verification state; runtimes/sidecars
  are replaceable execution surfaces emitting `RunEvent`s.
- Fail safe: every external dep (sidecar, CLI, sandbox) degrades with an explicit,
  truthful health signal.

## 6. Drop / deprioritize (the "needless stuff")

- The recoder-agents chat/thread/canvas frontend cascade (300+ coupled files) — **not**
  a surgical removal worth doing now. recoder-agents stays a thin operator console; no
  new frontend work. Revisit only after the backend spine (Waves 0–4) is real.
- BYOK-chat / web-builder backend already removed (visual-edit, themes, vercel,
  supabase — see `CLEANUP-LEGACY.md`).
