# Recoder — Architecture & Product Plan

> The single map of what Recoder *is*, every surface users touch, every MCP/CLI, the control
> plane and subsystems underneath — plus a **status board to track each piece of work**.
> **For what is actually built/green/used right now (with re-verified evidence), see the reality
> snapshot in [`docs/BUILD-STATUS.md`](./BUILD-STATUS.md).** This file is the design map + board.
> Companions: [`docs/subsystems/README.md`](./subsystems/README.md) (8-subsystem master plan),
> the per-subsystem designs in `docs/subsystems/`, [`docs/PACKAGES.md`](./PACKAGES.md) (package
> inventory + duplicate/stub cleanup), and [`docs/subsystems/recodergit.md`](./subsystems/recodergit.md)
> (code-graph integration).

---

## 1. What Recoder is

An **Agent OS control plane** with **thin clients**. Not a web app. The backend/control-plane
spine is the product; users reach it through a **desktop app** (like Cursor) *and* a **terminal
coding agent** (`recoder-code`, like Claude Code), both auth'd to `recoder.xyz`. Agents — running
in either client — get their power from **MCP tools** and a shared **Brain**. The interface for
an agent OS is the *tools*, not pages.

```
        ┌───────────── CLIENTS (how users reach Recoder) ──────────────┐
        │  Desktop app (Electron)      recoder-code (terminal IDE)      │
        │   loads recoder.xyz web   +   Ink/React TUI + agent + MCP     │
        │   + spawns node-pty terminals ─────────► runs recoder-code    │
        │  recoder-cli (`recoder`, scripting)    recoder-cli-router     │
        └───────────────┬───────────────────────────┬──────────────────┘
                        │ device-flow auth           │ MCP (stdio/http)
                        ▼                             ▼
   ┌──────────────── CONTROL PLANE (recoder.xyz + docker-backend) ───────────────┐
   │  /api/agent-os  ·  /api/mcp (governed host)  ·  /api/a2a   (Better Auth)     │
   │  agent-os core (state of record) · BrainService · RecoderGitService          │
   └───────────────┬───────────────────────────────────────────────┬─────────────┘
                   ▼                                                 ▼
   ┌──────── 8 OWNED SUBSYSTEMS ────────┐        ┌──────── MCP SERVERS (agent tools) ───────┐
   │ brain · governance · coordination  │        │ recodergit code-graph · brain · pal-mcp  │
   │ runtime · substrate · network ·    │◄──────►│ (registered in the governed MCP host)    │
   │ interop · distribution             │        └──────────────────────────────────────────┘
   └────────────────┬───────────────────┘
                    ▼  fuses (merge & own, never thin-wrap)
        OSS: recodergit · mem0 · continuum · pi · beads · ziti · openfang · tmux/dmux · …
```

---

## 2. Surfaces (clients) — and status

| Surface | What it is | Where | Status |
|---|---|---|---|
| **recoder-code** | The flagship **terminal coding agent IDE** — Ink/React TUI + pi agent runtime + MCP client. npm `recoder-code` v2.5.4 + Homebrew. | `packages/recoder-code/packages/{cli,core}` (only these two are the real recoder-code — see PACKAGES.md) | 🟢 shipping; **now gets recodergit + brain MCP tools by default** (this session) |
| **Desktop app** | Electron shell: loads `recoder.xyz` web + **spawns `node-pty` terminals** (where recoder-code runs). Code-signed/notarized mac + win + linux builds. | `apps/desktop` | 🟢 built/signable; the CLI runs *inside* its terminal (not compiled in) |
| **recoder-cli** | General **scripting CLI** (`recoder`/`rec`). Has the `code-graph` verb (connect/repos/status/domain-map). | `packages/cli` | 🟢 built; `code-graph` verb added + envelope-fixed (this session) |
| **recoder-cli-router** | CLI router (`rcr`). | `packages/recoder-cli-router` | 🟡 present — audit for overlap with recoder-cli (PACKAGES.md) |
| **Web apps** | `recoder.xyz` (auth/control plane UI), agents/agency/pm surfaces, marketing `site/`. | `app/`, `recoder-agents/`, `recoder-agency/`, `recoder-pm/`, `site/` | 🟡 deployed surfaces (separate track) |
| **Mobile** | Mobile app. | `apps/mobile` | 🟡 separate track |

> **TUI decision (open):** pi-tui is a *non-React* readline/REPL-style TUI; recoder-code uses
> *Ink/React*. Using pi-tui for both the desktop terminal and recoder-code is a **migration**,
> not a flag. Tracked in §6.

---

## 3. MCP surfaces (the agent's tools) — and status

The MCP layer is where agents actually get capabilities. Two MCP planes: the **backend governed
host** (`/api/mcp`) and each client's **own mcpServers** (e.g. recoder-code's default servers).

| MCP server | Tools | Built where | Wired into | Status |
|---|---|---|---|---|
| **recodergit code-graph** | `impact` · `query` · `context` · `scope` · `explain` · `cypher` · `route_map` … (read-only over code) | `ts/recodergit` engine (built); adapter `packages/agent-mcp/src/servers/recodergit-server.ts` | backend MCP host (governed) **+** recoder-code default (stdio) **+** brain `RepoIntelPort` | ✅ built, green, live-proven |
| **brain** | `brain_assemble` (fused context) · `brain_recall` · `brain_record` (candidate-only) | `packages/brain/src/seams/mcp-server.ts` (stdio) | recoder-code default (stdio) | ✅ built, green |
| **MCP host (governed)** | registry + permission/risk-score/audit `/check` for every tool call | `docker-backend/src/agent-os/routes/mcp-control.routes.ts` | `/api/mcp` (auth'd) | ✅ recodergit registered (flag-gated) |
| **pal-mcp-server** | multi-model MCP server | `py/pal-mcp-server` | interop subsystem (planned) | 📐 vendored, integration designed |
| **connector gateways** | Telegram/Slack/Discord/Signal/LINE/Feishu/iMessage/WhatsApp (8 kinds declared) | `@recoder/connectors` (`ts/extracted-from-openclaw`) → `docker-backend/src/connectors` | `GET /api/connectors` (live, mounted `server.ts:15555`) | ✅ foundation green (13/13) + Telegram real adapter live; other 7 adapter-pending (`REAL_CHANNELS=['telegram']`) |

---

## 4. Control plane — and status

| Component | Role | Where | Status |
|---|---|---|---|
| **agent-os core** | State of record: TaskSpec/AgentProfile/WorkLock/Approval/Artifact/Run + legal transitions | `packages/agent-os` (+ contracts: a2a-sdk, agent-events, agent-policy, agent-instructions, agent-memory, agent-runtimes, agent-workflows, agent-mcp) | 🟢 contracts present |
| **docker-backend** | Express service + the `agent-os/` integration layer (services, routes, repos) | `docker-backend/src` (`server.ts` + `agent-os/`) | 🟢 live |
| **BrainService** | flag-gated brain access (5 real sources), `assembleForTask` | `docker-backend/src/agent-os/brain-service.ts` | ✅ wired (flag off by default) |
| **RecoderGitService** | code-graph **index lifecycle**: `connectRepo` (clone+index), `status`/staleness, `reindexOnPush`, `domainMap`, MCP-server supervision | `docker-backend/src/agent-os/recodergit-service.ts` | ✅ built, green (flag off) |
| **GitHub flow** | webhook push → re-index; authed `/api/agent-os/code-graph/connect` (token-safe clone) | `docker-backend/src/agent-os/routes/{github-webhook,code-graph,code-graph-user}.routes.ts` | ✅ built, green |

---

## 5. Subsystems (the engines) — and status

Per [`docs/subsystems/README.md`](./subsystems/README.md). Each fuses OSS (merge & own).

| # | Subsystem | Status | Notes |
|---|---|---|---|
| 1 | **brain** | ✅ **built & green** | 5 real sources behind ports (recodergit · continuum · mem0 · context7 · beads); BrainService + brain MCP server; the token-waste-killer |
| 2 | **governance** | 📐 designed | Rust crates (openfang + claw-code-parity) + TS policy spine |
| 3 | **coordination** | ✅ **built & green; wired & committed** | `@recoder/coordination` 252/252 tests; **work-locks live in the conductor** (collision-prevention, 9/9 conductor-lock tests) **+ durable Postgres lock store** (`packages/coordination/src/persistence/postgres/`, restart-survivable). Committed in `dded81260`/`5fd5105b1`. dispatch/handoff/reconciler present. See BUILD-STATUS §4. |
| 4 | **runtime** | 🟢 **built & green; parallel/demoted** | `@recoder/runtime` 160/160 tests (claude-code/codex/in-process tool-loop drivers); **not** the driver that ran the live agent — the proven run went through the canonical **tmux+worktree conductor driver**. `@recoder/runtime` is a parallel/demoted second driver until wired into the conductor. See BUILD-STATUS §10. |
| 5 | **substrate** | 🟡 partial — **but live-agent run PROVEN** | tmux+worktree / Daytona isolation (conductor live: `/api/conductor/health` 200, runtimes present). **A real `claude -p` headless run completed end-to-end** (isolated worktree, `GREETING.md`, exit 0, diff captured, teardown — BUILD-STATUS §7a). `@recoder/substrate` pkg scaffolding shelved-incomplete; interop empty. Capability routes (`/health/full`, `/resources`, `/workflows`) now **mounted** + resource governor enforced on `createWorkspace`. |
| 6 | **network** | 📐 designed | OpenZiti zero-trust overlay |
| 7 | **interop** | 📐 designed | A2A + MCP host + connectors |
| 8 | **distribution** | 📐 designed | CLI dist + polar billing + signed delivery |

**recodergit code-graph** (the deepest-integrated capability this session) has its own 6-phase
plan + tracking in [`docs/subsystems/recodergit.md`](./subsystems/recodergit.md): Phases 0–5
✅ done (engine built+verified, full rebrand, brain adapters, index lifecycle, GitHub flow,
governed MCP host) + the on-demand connect flow + CLI verb + recoder-code default tools.

---

## 6. Tracking board — open work (track each here)

Legend: ✅ done · 🔄 in progress · 📐 designed · 📋 planned · ⚠️ needs your decision

| Item | Area | Status | Next step / note |
|---|---|---|---|
| **Own `ts/` engines as `@recoder/*`** (dmux, codex-runtime, opencode-harness, open-agents, opencode, recodergit) | engines | ✅ | `34b2d4a83` — rebranded, build-green; `ts/qwen-code`, `ts/polar`, `ts/pi` (dup) retired. opencode 29/29 *prior-session reported* (not re-run). See BUILD-STATUS §1. |
| **`@recoder/coordination`** built + green | coordination | ✅ | **252/252** (re-run). Locks/dispatch/handoff/reconciler. |
| **`@recoder/coordination` wired into conductor** (work-locks) | coordination | ✅ | collision-prevention live; **9/9** conductor-lock tests; **+ durable Postgres lock store** (`packages/coordination/src/persistence/postgres/`). Committed `dded81260`/`5fd5105b1`. BUILD-STATUS §4. |
| **Conductor capability routes mounted** (`/health/full`, `/resources`, `/workflows`) | conductor | ✅ | mounted in `conductor.routes.ts`; governor enforced on `createWorkspace` (429 on over-budget); committed `dded81260`/`5fd5105b1`. BUILD-STATUS §5. |
| **`@recoder/runtime`** built + green | runtime | ✅ (parallel/demoted) | **160/160** (re-run); **not** the driver of the proven live run — tmux+worktree conductor driver is canonical. Parallel/demoted until wired. BUILD-STATUS §10. |
| **`@recoder/connectors`** foundation + Telegram adapter | interop | ✅ | foundation **13/13**; 8 kinds declared; only **Telegram** is a real live adapter; `GET /api/connectors` live (`server.ts:15555`). |
| **Desktop cockpit** over live `/api/conductor` | desktop | ✅ | board/terminals/sessions/auth/connectors-panel/lock-badges; **installable `Recoder.app`** with cockpit in `app.asar` (verified via `asar list`). |
| **95-file merge resolved** (docker-backend tsc 114→0) | repo | ✅ | `34b2d4a83`; `tsc --noEmit` ⇒ **0** (re-run); 0 markers / 0 unmerged. |
| **e2e: docker-backend boots (no Postgres), conductor live** | e2e | ✅ | `/api/conductor/health` 200 (tmux+git true), `/runtimes` shows claude/codex/opencode/pi present, `/api/connectors` truthful-inert. BUILD-STATUS §7. |
| **LIVE-AGENT RUN — core thesis PROVEN** | e2e | ✅ | conductor drove `claude -p` **headless end-to-end**: isolated worktree, `GREETING.md` created, **exit 0**, diff captured, teardown. Canonical tmux+worktree driver. Caveat: required clearing a stale `ANTHROPIC_API_KEY` in a lingering tmux server; durable terminal-state write-back **in progress**. BUILD-STATUS §7a. |
| Durable post-run terminal-state on workspace record | conductor | 🔄 | run completed + diff captured; persisting the agent's terminal/exit state durably into the workspace record (reconciler + UI truth) still being finished. BUILD-STATUS §7a/§8. |
| Wire `@recoder/runtime` behind the conductor driver seam (dual-runtime reconciliation) | runtime | 📋 | tmux+worktree driver is canonical; `@recoder/runtime` parallel/demoted until wired into `runtime-commands.ts` and a live run is re-proven through it. Additive-only, gated (don't destabilize the proven path). BUILD-STATUS §10. |
| recodergit engine built + verified | code-graph | ✅ | live: analyze→graph, impact by UID |
| recodergit full rebrand (zero gitnexus) | code-graph | ✅ | committed |
| Brain: 5 real sources + MCP server | brain | ✅ | continuum/bd/recodergit live; mem0/context7 need config |
| **Continuum fusion** — @recoder/continuum in-process (kill shell-out) | brain+continuum | ✅ | `756cb7232` — promoted ts/→packages/ @recoder/continuum (owned); brain adapter fused in-process (execFile/subprocess fully removed); R1 recent+snapshot surfaced; 90/90 brain tests real-engine (no mocks); plan+roadmap in docs/CONTINUUM-PLAN.md |
| recoder-code gets recodergit + brain tools | recoder-code | ✅ | default stdio MCP, opt-out-able |
| `recoder code-graph` CLI verb | recoder-cli | ✅ | envelope bug fixed |
| **pi merge → 0.80.2** (full, rebranded) | pi | ✅ | `4ef18d248` — full pi @ 0.80.2, all 4 green |
| **package audit → docs/PACKAGES.md** | repo | ✅ | `7992ea18b` — 83 pkgs, dups/stubs/cleanup |
| **Decision: pi IS the IDE foundation** | recoder-code | ✅ | chosen; plan in `docs/PI-CONSOLIDATION.md` |
| **Stage A — recoder-code → pi launcher** | recoder-code | ✅ | `89ec4f826` — flag-gated `RECODER_PI_SHELL`; pi `main()` via extensionFactories; recodergit+brain bridged in; 19/19 tests; flag-off byte-identical |
| **OSS merge wave** (context7-sdk, mem0) | vendored | ✅ | `89ec4f826` — context7 0.3.1, mem0 3.0.11; a2a-js already current |
| **⚠️ cli → workspace core wiring** | recoder-code | ⚠️ | PREREQ for Stage C/D: cli resolves published `recoder-code-core@2.4.5` (stale, missing new exports) not workspace source → 4 pre-existing tsc errors. Repoint to workspace before C/D |
| **Stage B — port Recoder layer onto pi** | recoder-code | ✅ | `2daca3a73` — pi `piConfig` {name:Recoder, configDir:.recoder} (APP_NAME/ENV_AGENT_DIR derived, setup-wizard off); pre-launch auth gate reuses `RecoderAuthService` (not reimplemented); MCP bridge degrade-safe + loaded/degraded summary; cli+core tsc 0 errors, pi build green, vitest 25/25; flag-off byte-identical |
| **Stage C — pi-tui as default UI** (desktop + cli) | TUI | 📋 | audit done `b668fd2ec` (83-feature matrix, critic gaps-found) — C NOT a safe flip; gated on porting the 9 high-risk features; see docs/PI-CONSOLIDATION-STAGE-C-AUDIT.md |
| **Stage D — delete the Ink duplicate** | recoder-code | 📋 | recoder-code = launcher + Recoder extensions only |
| **Package consolidation** (a2a/memory/mcp/cli/sandbox dups) | repo | ⚠️ | execute per docs/PACKAGES.md after it lands |
| Activate code-graph (flip `RECODER_CODE_GRAPH_ENABLED`) | ops | ⚠️ | your call; flag off by default, then gated deploy |
| Configure mem0 (`MEM0_BASE_URL`) + context7 (`CONTEXT7_API_KEY`) | brain | ⚠️ | secrets/config to light up the last 2 brain sources |
| Wire BrainService/RecoderGitService into live agent runs | control plane | 📋 | flag-gated; deploy is approval-gated |
| `/index-repo` slash command in recoder-code | recoder-code | 📋 | user says covered |
| Governance / coordination / runtime / network / interop / distribution | subsystems | 📐 | build per their design docs, in order |
| pi-tui unification + the other vendored-OSS merges (a2a-js, context7-sdk, mem0, daytona, browser-tools, sandbox-daytona) | vendored | 📋 | "merge all stuff" — wave after pi |

---

## 7. Operating doctrine (how every item above is built)

- **Merge & own, never thin-wrap.** Vendored OSS is rebranded `@recoder/*` and merged; real
  packages, not stubs (the bar you set).
- **Additive + flag-gated + fail-safe.** New capabilities default off; missing tools/keys degrade
  truthfully (never fake success); nothing breaks existing behavior.
- **Governed.** Durable memory → reviewable candidate, never silent. MCP tool calls →
  permission/risk/audit. Production deploy/auth/billing → approval-gated.
- **Verified, not asserted.** Every change lands green with its own test; workflows are
  adversarially verified and re-checked before commit.
- **No web UI for agent capabilities.** The tool surface (MCP) + CLI verbs *are* the interface,
  matching how Recoder ships (desktop terminal + CLI).
