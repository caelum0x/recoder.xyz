# Recoder Platform — Current Status

Last updated: 2026-04-04

This is the single current status doc for the repository.

## Source Of Truth

- `bd` is the authoritative task/issue tracker.
- This file is the authoritative human-readable status summary.
- `errorsss.md` and `TASKS.md` now intentionally redirect here.
- Historical rollout notes live in git history, not in duplicated root markdown.

## Current Platform Snapshot

- `docker-backend` now registers 5 coding runtimes in source:
  - `native`
  - `opencode`
  - `omo`
  - `codex`
  - `claude-code`
- Deep-coding runtime plumbing exists in source:
  - backend routes: `/api/coding-runtime/session`, `/api/coding-runtime/prompt`, `/api/coding-runtime/runtimes`
  - runtime selection modules: `intent-gate`, `category-router`, `completion-loop`
  - recoder-web deep-coding now routes through the coding-runtime API instead of hard-binding to OpenCode only
- Live/runtime notes:
  - `opencode-service` is live and verified on Hetzner
  - `omo` is available as a subprocess runtime in source
  - `codex` and `claude-code` adapters are now wired in source, but still need live product verification

## Active Remaining Work

These are the current open workstreams that still matter after removing stale duplicates.

### 1. Core Coding Loop

- `recoder-96g` — restore the end-to-end agent coding loop for real app tasks
- `recoder-sti` — verify the deployed watch/terminal WebSocket proxy fix in the browser
- `recoder-i3v` — browser-verify deployed Web IDE multi-turn editing on production
- `recoder-w0b` — clean up stale Daytona dev server processes after preview restarts

### 2. Deep Coding Runtime Rollout

- `recoder-7hh` — backend runtime bridge to live sandbox containers remains in progress
- `recoder-lma` — deploy and browser-verify product-side deep-coding/runtime flow
- `recoder-y4q` — wire automatic runtime routing into deep-coding mode using the runtime registry and routing modules

### 3. Agents / Canvas / File Proxy Verification

- `recoder-xnh` — browser-verify deployed Excalidraw board refresh path
- `recoder-e5a` — deploy and verify the agents HEAD file proxy fix
- `recoder-8i9` — add canvas frame-generation fallback when provider quota is exhausted

### 4. Other Product Verification

- `recoder-kcq` — live-verify PM and Agency copilot write actions after timeout fixes
- `recoder-74p` — route `chat.recoder.xyz` to Chatwoot instead of the main app
- `recoder-4t2` — fix app Payload CMS drift so app-wide TypeScript is clean again
- `recoder-ijs` — fix recoder-app build-stage auth Prisma engine warnings

### 5. Infra / Host Cleanup

- `recoder-025` — reconcile the remaining Hetzner checkout drift
- `recoder-0xz` — sync branch-tracked additions into the Hetzner checkout cleanly
- `recoder-d0k` — deprecate or fully wire the legacy zrok-controller service in deploy compose

### 6. Shared Planning Surface

- `recoder-29m` — promote mirrored TodoWrite state into a first-class shared task board UI

## What Is Done Enough To Stop Tracking Here

The following used to dominate the root docs and no longer need repeated markdown correction blocks:

- Payload CMS admin/bootstrap source landing
- Umami / Alertmanager / VictoriaMetrics compose fixes
- Zrok public HTTPS / zrok2 migration source landing
- OpenCode connector spike and hashline edit protocol source landing
- TodoWrite scratchpad mirroring source landing
- Per-terminal discovery / inbox push / Redis task-store A2A foundations

Those items should be referenced from `bd show <id>` or git history when needed, not recopied into new markdown ledgers.

## Working Rules

- If this file and Beads disagree, trust `bd`.
- If this file and a chat transcript disagree, trust this file.
- If deeper history is needed, use git instead of reviving duplicate status blocks.
