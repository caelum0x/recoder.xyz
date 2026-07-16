# Recoder — Product & Frontend Design

> **What Recoder is:** the **Cursor of AI coding agents** — a clean desktop app (conductor.build
> model) where you run coding agents (Claude Code, Codex, …) in parallel isolated git worktrees,
> watch them, review the diff, and merge. The OSS engines (memory, governance, retrieval,
> code-intelligence, inference, issue-graph) make the agents dramatically better — but they live
> **entirely in the backend, invisible to the user.** The frontend is as plain as a terminal.
>
> System layers: [RECODER-ARCHITECTURE.md](./RECODER-ARCHITECTURE.md). Backend build:
> [RECODER-BACKEND/BUILD-STATUS.md](./RECODER-BACKEND/BUILD-STATUS.md).

---

## 1. Design principles (clean-first)

1. **Clean as possible. Minimal as possible.** Every pixel earns its place. When in doubt, remove it.
2. **Logo, not wordmark.** The navbar shows the Recoder cube **logo only** — no "Recoder" text, no
   product name repeated in chrome.
3. **No writing on components.** Components speak through layout, iconography, and state — not
   verbose labels stamped on every card/panel. Terse or none.
4. **No engine-named UI, ever.** The user must NEVER see "openfang", "beads", "tensorzero",
   "colbert", "mem0", "multica", "recodergit", "ziti", "MCP", "Gateway", "Retrieval", "Substrates".
   Those are **backend** — the plumbing that powers the agents. The UI shows *workspaces, agents,
   diffs, reviews* — the user's mental model, not ours.
5. **Engines are invisible infrastructure.** Memory recall, governance gating, code-intel, inference
   routing, issue-graph tracking all happen automatically inside the run flow. The user feels the
   benefit (agents remember, agents are governed, agents are smart) without a single knob.
6. **What CAN be a surface (only if clean):** approvals (when an agent is blocked, an inline
   approve/reject — not a dashboard), a light activity/brain sense of what agents are doing,
   rules/settings (tucked away, not a primary tab). Never an infra grid.
7. **Terminal-plain.** The product IS a terminal + a board. No infra dashboards (repo rule, `AGENTS.md`).

---

## 2. Zero-config onboarding (the magic first-run)

The entire ask of the user is **sign in once.** Everything else is auto-detected.

```
Install Recoder  →  Open app  →  Sign in / Sign up (recoder.xyz web auth)
        │
        ▼  the app auto-detects, no questions asked:
   • which coding agent(s) you use  → scans PATH for claude / codex / cursor / opencode / pi
   • your GitHub identity           → reads `gh auth status` / `git config user` → "caelum0x"
   • your repos                     → from the detected GitHub account
        │
        ▼
   Opens straight into the workspace board — ready to run an agent. No setup wizard.
```

- **Auth** is the *only* interaction: the desktop opens the recoder.xyz sign-in (device flow),
  the user signs in on the web, the app captures the session. (Backend-owned Better Auth — see
  identity domain.) Like conductor.build reusing your existing agent login, Recoder reuses the
  user's existing Claude/Codex login too — no second key wall.
- **Agent auto-detect:** on first run the desktop probes for installed agent CLIs (Claude Code,
  Codex, Cursor, opencode, pi) and their existing auth. It preselects the one you have. No dropdown
  to configure unless you want to switch.
- **GitHub auto-detect:** reads the user's `gh`/git identity (e.g. `caelum0x`) so workspaces,
  branches, and PRs are attributed correctly with zero input.
- **Result:** "I installed it, signed in, and it already knew I use Claude Code and I'm caelum0x."

---

## 3. Frontend surfaces (the whole app)

Small on purpose. Roughly three screens.

### A. Board (home) — parallel workspaces
- The conductor.build columned board (`Board.tsx` already implements this): workspace cards grouped
  by lifecycle (queued → running → needs-review → done). Live from `GET /workspaces`.
- Each card: codename, repo/branch, the agent, a glanceable state — no engine chatter.
- **New workspace** = one action: pick repo (auto-listed from your GitHub) + agent (preselected) +
  a task prompt. That's it — the backend does recall/index/gate/track invisibly.

### B. Workspace detail — the agent run
- **Terminal** — the live agent working in its tmux worktree (the real session).
- **Diff / files** — what the agent changed (`DiffView` + `FileTree`).
- **Conversation** — the agent's turns (`ConversationView`), clean.
- **Inline approval** — when the governance gate blocks a risky write, a single inline approve/reject
  appears in-context (not a separate "Approvals" tab). Approve → the run continues.
- **Review + merge** — review the diff, merge/PR. Done.

### C. Minimal chrome
- **Navbar:** the cube logo, a workspace switcher, the user avatar. Nothing else.
- **Health:** a single quiet dot (overall up/degraded) — NOT an engine-by-engine grid. Tucked in.
- **Settings:** behind the avatar — agent choice, rules/policy, account. Not a primary tab.

**Removed from the nav** (they were infra dashboards): Openfang(Agents), Gateway, MCP Tools,
Networking, Squads, Retrieval, Brain, Memory, Rules, Substrates, Chat, Activity. The components can
stay on disk (dev/debug), but they are OUT of the product nav. The engines run invisibly.

---

## 4. Backend vs frontend split (so it never leaks)

| Concern | Where | Visible to user? |
|---|---|---|
| Memory (mem0/beads/colbert), inference (tensorzero), governance, code-intel (recodergit), issue-graph (beads), browsing, squads (multica), networking (ziti/xds) | **BACKEND** engines, consumed by the conductor run flow | **NO** — invisible; the user feels the benefit |
| Workspaces, agent runs, terminal, diff, review, merge, approvals, sign-in | **FRONTEND** (cockpit + wave shell) | **YES** — the whole product |

The frontend consumes ONLY the workspace/run/auth edges. It never renders an engine.

---

## 5. Build plan (frontend, phased)

**Phase F0 — Slim to the workspace UX.** ✅ **DONE** (`5ab2b24ab`). Strip the panel registry/nav
to `board` + the workspace detail drill-in; remove the 13 engine/infra tabs from the nav (keep
component files on disk). Logo-only navbar, single health dot. Approvals shown inline in the
workspace detail. *Subtraction, not addition.* Verify cockpit build + tests.

**Phase F1 — Zero-config onboarding.** ✅ **DONE** (`edbc91a30`). Desktop first-run: open
recoder.xyz sign-in (device flow) → capture session; auto-detect installed agent CLIs (probe PATH +
their auth) and GitHub identity (`gh`/git) → preselect; land on the board. No wizard.
*Shipped as:* backend `GET /api/conductor/{runtimes,github/status,health}` (PATH-probed CLIs +
token-free gh/git identity); cockpit first-run SignIn gate + agent preselect + "GitHub · <login>"
chip + keyed-envelope client; electron main `emain-device-auth` (RFC 8628 vs `/api/auth/cli/*`,
safeStorage session, identity-only bridge over origin-gated IPC). **← next: F2.**

**Phase F2 — Workspace detail polish.** ⚙️ **backend plane DONE** (`6f4d1197c`): the run screen's
full API — `GET workspaces/:id/{events,diff,tree,dev-command}` + governed
`POST {message,pr,merge,archive,preview-url}` (chat = continueRun in the same worktree; merge = gh
or REAL local-git fallback; all writes behind the governance gate). Ported from the proven v1
conductor onto the domain seams. *Remaining:* live WS stream alignment (`/sync` vs client
`/stream` path), UI polish pass, repo list auto-populated from the detected GitHub account.

**Phase F3 — Multi-agent parallelism UX.** Run several agents/workspaces at once (conductor's
sweet spot: 3–5), compare, review each on its own schedule.

**Phase F4 — Invisible-engine feedback (subtle).** Optional, tasteful signals that the agent is
*smarter* — e.g. "recalled context from a past run" as a quiet inline note, never an engine name.
Only if it stays clean.

Verification each phase: `cd apps/desktop/cockpit && pnpm build && pnpm exec vitest run`; the wave
shell hosts it; consumes the backend workspace/auth edges only.

---

## 6. The one-liner

**Recoder: install, sign in, and your AI coding agents just got a memory, a conscience, and a
team — invisibly. You only ever see workspaces, diffs, and a merge button.**
