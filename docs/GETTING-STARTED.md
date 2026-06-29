# Getting Started

Recoder is a desktop app that runs **your own** coding-agent CLIs in parallel — each in an
isolated git worktree, driven through a pinned tmux session — and gives you a review/merge
loop on top. The app is self-contained: opening it boots its own embedded backend on
loopback. You bring your own agent login (BYOK); Recoder never asks for a model key.

> Related reading: [ARCHITECTURE.md](./ARCHITECTURE.md) · [CONDUCTOR-ARCHITECTURE.md](./CONDUCTOR-ARCHITECTURE.md) · [PRODUCTS.md](./PRODUCTS.md)

---

## 1. Install

| Method | Command / Step |
|---|---|
| Homebrew cask | `brew install --cask recoder` |
| Direct download | Grab the `.dmg` from the GitHub release, open it, drag **Recoder.app** to Applications |

The Homebrew cask is defined in
[`homebrew-recoder/Casks/recoder.rb`](../homebrew-recoder/Casks/recoder.rb). It installs
`Recoder.app`, supports both Apple Silicon (`arm64`) and Intel (`x64`) builds, declares
`auto_updates true`, and requires macOS Big Sur or newer (`depends_on macos: ">= :big_sur"`).

The cask pulls the `.dmg` from the GitHub release assets:

```
https://github.com/recoder-xyz/recoder-desktop/releases/download/v<version>/Recoder-<version>-arm64.dmg
```

> The `sha256` values committed in `recoder.rb` are intentional placeholders — the release
> pipeline rewrites them from the published `.dmg` checksums. (planned: the published cask in
> the Homebrew tap carries the real checksums.)

---

## 2. First run — the app boots its own backend

When you open **Recoder.app**, it does **not** expect an external backend. The Electron
process boots a local `docker-backend` on a free loopback port and hands the cockpit UI the
resulting `{ backendUrl, apiKey }`. This is implemented by the **BackendSupervisor** in
[`apps/desktop/backend-supervisor.js`](../apps/desktop/backend-supervisor.js).

What the supervisor does on launch (all real, never faked — see the module header and
`_startOnce()`):

1. Picks a free `127.0.0.1` port (`pickFreePortWithRetry`).
2. Assembles a hermetic env: a per-install random `API_KEY_HASH_SALT` + `INTERNAL_SERVICE_KEY`
   (persisted to `userData`, never committed), `STRICT_AUTH=false`, a private `DATA_DIR`, and
   the resolved vendored tmux binary (`resolveTmuxBin`).
3. Mints a local platform `sk_` key via the real `dev-mint-conductor-key` script.
4. Spawns the backend child — dev: `tsx src/server.ts`; packaged: `node <resources>/backend/dist/server.js`
   (`_resolveSpawnTarget`).
5. Polls `GET /api/conductor/health` with the key until it returns **200** — `pollHealth()`.
   A timeout is surfaced truthfully as a failed status; readiness is never faked.

`getAuth()` returns `null` until the backend is actually `READY`, so the cockpit never points
at a backend that isn't listening yet. On crash, the child is restarted with exponential
backoff; on app quit, it's killed (SIGTERM → SIGKILL grace).

### Proof it really boots

A headless end-to-end proof drives the supervisor with no Electron runtime and asserts a real
**200** from `/api/conductor/health` with the substrate shape `{ available, git, tmux, tmuxBin }`:

```bash
# from apps/desktop
node scripts/dev-boot-proof.js
# (npm script: "dev:boot-proof")
```

Source: [`apps/desktop/scripts/dev-boot-proof.js`](../apps/desktop/scripts/dev-boot-proof.js).
It boots the `BackendSupervisor` (dev path, `isPackaged:false`), fetches the health URL, and
exits `0` only on a genuine 200 with the correct shape — printing `HTTP_CODE`, `URL`,
`HAS_API_KEY`, `BODY`, and `HEALTH_SHAPE_OK`.

The `/api/conductor/health` route itself
([`docker-backend/src/conductor/conductor.routes.ts`](../docker-backend/src/conductor/conductor.routes.ts),
`router.get('/health', …)`) returns `conductorAvailability()` from
[`tmux-orchestrator.ts`](../docker-backend/src/conductor/tmux-orchestrator.ts) — which checks
that both `git` and `tmux` exist and reports `available`, `git`, `tmux`, `tmuxBin`.

---

## 3. BYOK — bring your own agent login

Recoder runs the user's **own** coding-agent CLIs. Per
[`docker-backend/src/conductor/README.md`](../docker-backend/src/conductor/README.md), the
supported runtimes are **Claude Code, Codex, opencode, pi, Gemini, Qwen**. `runtime-commands.ts`
resolves a chosen runtime + your prompt into a real headless CLI line (e.g. the proven
`claude -p` path).

There is **no model key field** in Recoder. Instead:

- **Be honest about the requirement:** a real BYOK run needs you to be **logged into the agent
  CLI you select** on your machine. Recoder shells out to that CLI in a tmux worktree; if you
  aren't authenticated to e.g. Claude Code or Codex, the agent process won't run.
- Log in once with your CLI's own flow (for Claude Code / Codex / pi), then Recoder uses that
  session. Recoder mints only a local **platform** `sk_` key for the cockpit↔backend transport —
  that is unrelated to your model/agent credentials.

---

## 4. Create a workspace → run → review → merge

The unit of parallel work is a **Workspace**: a persisted, restart-survivable record whose live
execution is a tmux session over an isolated git worktree.

| Step | Surface |
|---|---|
| Create | `POST /api/conductor/workspaces` (`{ spaceId, projectId, taskId, repoPath, createdBy, prompt \| command }`; `runtimeId` optional) |
| Run | Agent runs in its own git worktree + tmux session; RunEvents stream `started → log → completed` |
| Review the diff | `GET /api/conductor/workspaces/:id/diff` |
| Open a PR | `POST /api/conductor/workspaces/:id/pr` (approval-gated) |
| Merge | `POST /api/conductor/workspaces/:id/merge` (approval-gated) |

When the agent finishes, the completion-watcher transitions the workspace
`running → awaiting_review` with a delivery summary in metadata, so you review the real diff
before publishing. **Merge is approval-gated:** it's a customer-visible delivery — absent an
approval record, the workspace moves to `awaiting_approval` and the route returns **409**
instead of silently merging
([`conductor.routes.ts`](../docker-backend/src/conductor/conductor.routes.ts),
`/workspaces/:workspaceId/merge`).

### Proof the loop runs end-to-end

A headless proof drives the **real** fused conductor loop end-to-end **without** a BYOK key, by
swapping only the execution substrate for an honest stub (real git worktree, real file change,
truthful exit 0) while every other engine — WorkspaceEngine, run-tailer, completion-watcher,
delivery-summary, RunEvent sink, state machine — is the real product code:

```bash
pnpm --filter @recoder/docker-backend exec tsx scripts/e2e-conductor-loop.ts
# or:
npx tsx docker-backend/scripts/e2e-conductor-loop.ts
```

Source: [`docker-backend/scripts/e2e-conductor-loop.ts`](../docker-backend/scripts/e2e-conductor-loop.ts).
It asserts the workspace reaches `running`, the run-tailer emits `started → log → completed`
with a truthful `exitCode 0`, and the completion-watcher transitions
`running → awaiting_review` with a delivery summary that saw the real file change.

> This proof deliberately runs **without** a model key to exercise the control-plane loop in
> CI. A real agent run (Claude Code / Codex / pi etc.) still requires you to be logged into that
> CLI — see [§3 BYOK](#3-byok--bring-your-own-agent-login).

---

## Next steps

- Architecture overview: [ARCHITECTURE.md](./ARCHITECTURE.md)
- The parallel-agent substrate in depth: [CONDUCTOR-ARCHITECTURE.md](./CONDUCTOR-ARCHITECTURE.md)
- What ships in the platform: [PRODUCTS.md](./PRODUCTS.md)
