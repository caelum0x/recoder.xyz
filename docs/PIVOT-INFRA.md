# Recoder Pivot — Infra to run agents (not a frontend/chat company)

Last updated: 2026-06-22. This is the **/goal** doc. It supersedes any
frontend-first framing (including PRODUCT-PLAN.md §6's "control-plane UI"). When
in doubt: we are infra, not a frontend.

## 1. The goal (one sentence)

Recoder is **infrastructure that lets people run and orchestrate coding agents** —
Claude Code, Codex, Recoder Code, pi, opencode, openclaw — in parallel, isolated,
observable, with control-plane state (tasks, runs, approvals, delivery) and a full
audit trail. Conductor.build-style, but **multi-runtime, self-hostable infra**.

We are **not**: a BYOK chat app, a web builder, or a frontend company.

## 2. What we are NOT — remove this (legacy)

Recoder *used to be* a BYOK chat + web builder. That is the past. Cut it:

- **The BYOK chat web app** (recoder-agents "Ahoy! What can Recoder do for you?"
  with Slides / Data / Docs / Canvas / Video / Image / Research modes + a
  describe-what-you-need chat box). No one wants another ChatGPT wrapper.
- **The web builder** (recoder-web) — already retired; finish ref cleanup.
- **recoder-studio** — already removed.
- **Frontend-heavy product surfaces** in general. We do not build a frontend
  product. At most a *thin* operator/status console over the APIs — or none
  (CLI + API only).

## 3. What we ARE — build this (infra)

The product is infra used *from* the agents people already run:

1. **Conductor** — parallel agent sessions. Each run = an **isolated git
   worktree** + a **tmux session** running an owned agent. Many agents at once,
   no collisions. (Started: `docker-backend/src/conductor/` — held pending this
   plan.) tmux is owned as a sidecar binary; git worktrees give isolation.
2. **Owned agent runtimes** (no thin shims): pi (done — `@recoder/pi-*`), plus
   adapters that drive **Claude Code, Codex, opencode, openclaw** as execution
   surfaces inside Conductor.
3. **Control plane** (`/api/agent-os/*`): task → instruction bundle → run →
   verification → artifact → PR → preview → approval → handoff, with provenance.
4. **A2A** (owned `@recoder/a2a-js` + `@recoder/a2a-sdk`): how external agents
   connect and interop.
5. **Owned capability infra** already merged: mem0 (memory), daytona (sandboxes),
   git-nexus (code intelligence), context7 (docs). ollama/vllm deferred.

## 4. How people actually use it (no chat UI)

- Point their agent (Claude Code / Codex / Recoder Code / pi) at Recoder via
  A2A/MCP, or launch via the Recoder CLI / `/api/conductor`.
- Recoder spins up N isolated worktrees + tmux sessions and runs the agents in
  parallel under policy, streaming output, tracking runs/approvals/delivery.
- Self-hosted infra. **CLI + API first**, not a web app.

## 5. Cleanup plan (remove not-needed — staged, reversible)

Do not delete blindly; stage it and keep the build green:

1. **Inventory** the legacy chat/web-builder surfaces: recoder-agents chat
   (NewThreadEmptyState, hero modes, RecoderModesPanel, canvas/slides/video/image
   mode code, chat-input), and any docker-backend routes that exist only for
   BYOK-chat/web-builder (project-build chat, visual editing, theme/web-IDE).
2. **Decide per surface**: delete vs demote to a thin status view. Default:
   delete chat/web-builder; keep only Conductor + control-plane + A2A surfaces.
3. **Cut deploy/CI/nav** references to removed surfaces (like the recoder-web cut).
4. **Keep** the owned packages (pi, mem0, daytona, a2a, git-nexus, context7),
   agent-os, conductor, A2A, CLI.
5. Verify after each stage (tsc + targeted tests); commit per coherent removal.

## 6. Build sequence

1. **Agree this plan.**
2. **Conductor core** (tmux + worktree orchestrator) — commit the held files.
3. **Runtime adapters**: drive Claude Code / Codex / opencode / openclaw via
   Conductor (pi already wired).
4. **Cleanup** legacy chat/web-builder per §5.
5. **CLI/API surface** for launching + observing parallel runs (the real UX).

## 7. Non-negotiables

- Infra, not frontend. No new chat/web-builder UI.
- Own OSS as first-party `@recoder/*` (never "vendor"); deep integration, no shims.
- Keep the monorepo green; verify before claiming done.
- Control plane owns task/run/approval/delivery state; runtimes are replaceable.
