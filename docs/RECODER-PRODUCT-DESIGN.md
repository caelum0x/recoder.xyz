# Recoder — Product & Frontend Design

> **What Recoder is:** the **Cursor of AI coding agents** — a clean desktop app (conductor.build
> model) where you run coding agents (Claude Code, Codex, …) in parallel isolated git worktrees,
> watch them, review the diff, and merge. The OSS engines (memory, governance, retrieval,
> code-intelligence, inference, issue-graph) make the agents dramatically better — but they live
> **entirely in the backend, invisible to the user.** The frontend is as plain as a terminal.
>
> System layers: [RECODER-ARCHITECTURE.md](./RECODER-ARCHITECTURE.md). Backend build:
> [RECODER-BACKEND/ARCHITECTURE.md](./RECODER-BACKEND/ARCHITECTURE.md).

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
  identity domain.) **Shipped agent-login behavior is a PATH-probe, not a login-reuse:** Recoder
  detects the installed agent CLI on `PATH` and launches it so it uses *its own* existing login;
  Recoder does not read, import, or proxy the Claude/Codex credential. No second key wall for the
  agent, because the CLI already holds its own auth.
- **Agent auto-detect:** on first run the desktop PATH-probes for installed agent CLIs (Claude Code,
  Codex, Cursor, opencode, pi) — presence only; the CLI carries its own auth. It preselects the one
  you have. No dropdown to configure unless you want to switch.
- **GitHub auto-detect:** reads the user's `gh`/git identity (e.g. `caelum0x`) so workspaces,
  branches, and PRs are attributed correctly with zero input.
- **Result:** "I installed it, signed in, and it already knew I use Claude Code and I'm caelum0x."

---

## 3. Frontend surfaces (the whole app)

Small on purpose. Roughly three screens.

### A. Board (home) — parallel workspaces
- The conductor.build columned board (the Wave-native `recoder`/`recoder-board` view): workspace cards
  grouped by lifecycle (queued → running → needs-review → done). Live from `GET /workspaces`.
- Each card: codename, repo/branch, the agent, a glanceable state — no engine chatter.
- **New workspace** = one action: pick repo (auto-listed from your GitHub) + agent (preselected) +
  a task prompt. That's it — the backend does recall/index/gate/track invisibly.
- **Board search / history** ✅ — a terse filter bar over the board: free-text `q` plus repo / agent /
  state filters and an archived toggle, so a busy board stays findable and old runs stay reachable.
  Live from `GET /workspaces?q=&repo=&agent=&state=&archived=` + `GET /workspaces/archived`.
- **Multi-agent compare** ✅ — when you fan a task out across agents, the board shows them
  side-by-side: pick a run's parallel siblings and diff their results at a glance before you review
  each one. Live from `GET /workspaces/compare?taskGroup=` + `GET /workspaces/:id/siblings`.
- **Converge** ✅ — turn the N parallel diffs into one governed branch: non-contested files auto-merge,
  contested files resolve by pick or 3-way `git merge-file` synthesis, and the result flows through
  the governed merge + evidence pack. Live from `GET/POST /workspaces/compare/:taskGroup/converge[-plan]`.

### B. Workspace detail — the agent run
- **Terminal** — the live agent working in its tmux worktree (the real session, `recoder-terminal`).
- **Diff / files** — what the agent changed (`recoder-diff`).
- **Conversation** — the agent's turns, clean.
- **Inline approval** — when the governance gate blocks a risky write, a single inline approve/reject
  appears in-context (not a separate "Approvals" tab). Approve → the run continues.
- **Checkpoints** ✅ — snapshot the workspace (git state + agent context) at any point, then restore
  it or branch a fresh workspace off it — safe experimentation without losing a good run.
  Live from `POST/GET /workspaces/:id/checkpoints` + `POST /workspaces/:id/checkpoints/:cid/{restore,branch}`.
- **Repo setup + PR status** ✅ — a per-repo setup script runs automatically on worktree create so
  each agent starts from a ready environment, and a live PR chip surfaces the workspace's
  pull-request state (`gh`). Live from the worktree-create setup hook + `GET /workspaces/:id/pr-status`.
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
| Workspaces, agent runs, terminal, diff, review, merge, approvals, sign-in | **FRONTEND** (the Wave-native `recoder-*` views) | **YES** — the whole product |

The frontend consumes ONLY the workspace/run/auth edges. It never renders an engine.

---

## 5. Current surface (what actually ships)

The frontend is the **Wave-native `recoder-*` views** embedded in the desktop shell (the second
Preact "cockpit" SPA that once mirrored these surfaces was **deleted** — 2026-07-31, recoder-flgn).
It consumes ONLY the backend workspace/run/auth edges; it never renders an engine. The surfaces the
principles above describe are all live: the board (`recoder`/`recoder-board`), workspace detail
(`recoder-terminal`, `recoder-diff`), runs (`recoder-runs`), inline approvals (`recoder-approvals`),
and memory (`recoder-memory`), plus checkpoints, multi-agent compare, converge, board search, and
repo/PR status on the proven conductor seams — all governed and truthful-degrading, all inside the
workspace/board mental model. The marketing home carries a dependency-free CSS-3D `HeroCube` +
`TiltCard` depth (Core-Web-Vitals-safe, reduced-motion aware, `aria-hidden`).

Remaining product polish rides on real usage feedback; the desktop remainder is tracked in
[DESKTOP-UX-STATE-AND-PLAN.md](./DESKTOP-UX-STATE-AND-PLAN.md) and backend follow-ups in
[RECODER-BACKEND/ARCHITECTURE.md](./RECODER-BACKEND/ARCHITECTURE.md). The Wave shell hosts these
views and consumes the backend workspace/auth edges only.

---

## 6. The one-liner

**Recoder: install, sign in, and your AI coding agents just got a memory, a conscience, and a
team — invisibly. You only ever see workspaces, diffs, and a merge button.**
