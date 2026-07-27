# Recoder Desktop — Architecture, State, Flaws, Rules & Plan

> **⚠️ STALE (as of 2026-07-26) — most gaps below are FIXED.** Verified against
> current code: the sign-in wall is gone (cockpit torn down; sign-in is an optional
> offline-safe Wave-native affordance), Session/Approvals/Memory are wired and tested,
> and the Board is now wired (`GET /api/agent-os/issues/ready` + observability
> `/signals`, back in the rail). Remaining real gaps: arm64-only unsigned packaging,
> dead-by-design engines (Lance/Python sidecars), and a few retired infra views still
> block-registered (OSS-name scrub). See `docs/STATUS.md` for the current summary. The
> analysis below is kept for provenance.

Status date: 2026-07-24. Owner-facing single source of truth for the desktop
app's UI. It exists because tabs were hidden/patched reactively without a written
decision — that was wrong. Every hide/fix decision is recorded here now.

Grounded by a 3-agent read-only audit of: the cockpit SPA, the desktop auth
flow, and the backend route mounts. File:line references throughout.

---

## 0. Honest one-paragraph status

**The terminal works. Most of the rest does not — and the deepest reason is that
there are TWO overlapping frontends.** Creating a workspace + running an agent in
an isolated git worktree works end-to-end (verified). But auth shows a sign-in
wall the desktop should never show, several side "tabs" are broken/empty/infra,
OSS names (openfang, PAL) leak in *both* frontends, and the app ships a second
full UI (the cockpit) that duplicates the first.

---

## 1. Design north star (from AGENTS.md — do not drift)

- **The product IS a terminal.** Open Recoder → run your coding agent (Claude
  Code, Codex, Cursor, opencode, …) in parallel isolated git worktrees → review
  diffs → merge.
- **The frontend stays as plain as a terminal — no infra dashboards.**
- Desktop is **single-user, offline-capable, solo** (`RECODER_SOLO_MODE=1`,
  loopback `:3100`). It must never require sign-in.
- Anything that is not the terminal + the workspace loop must either work cleanly
  or **not be shown**. A tab that renders "not available"/"503"/empty-infra is
  worse than no tab.

---

## 2. THE ROOT CAUSE — two frontends, one job

The desktop app ships **two independent UIs** that both talk to the same backend
`/api/conductor/*`:

| | **Wave frontend** | **Cockpit SPA** |
|---|---|---|
| Path | `apps/desktop/app/frontend` (the `recoder-*` views) | `apps/desktop/cockpit` (Preact SPA) |
| How it's shown | native Wave blocks/tabs | historically a **web-iframe widget** loading `http://127.0.0.1:3100/cockpit/` — now fully unsurfaced AND unserved (launcher widget suppressed; not packaged by electron-builder; the backend `/cockpit` static mount + `COCKPIT_DIST` were removed per the §9 LOCKED drop, 2026-07-25) |
| Workspace board/list | `recoder.tsx`, `recoder-board` | `App.tsx` + `Board.tsx` |
| **Create workspace** | `recoder-launch/*` → `POST /api/conductor/workspaces` | `NewWorkspaceForm.tsx` → **same** `POST /api/conductor/workspaces` |
| Agent list | `GET /api/conductor/runtimes` | **same** `GET /api/conductor/runtimes` |
| Sign-in | Wave onboarding | `SignIn.tsx` (device-flow) |
| Diff/review | `recoder-diff` | `DiffView.tsx`/`ComparePanel.tsx` |
| Terminal | **owns** the real tmux term block | hands off to Wave via `recoder-open-terminal.ts` bridge |

**Consequence:** create-workspace, the board, the agent list, sign-in, and diff
exist **twice**. The screenshots that look "broken/duplicated" (search shows the
Recoder window *and* the recoder.xyz site; two web tiles) are this split leaking
through. **This is the decision that gates everything else** (see §9).

The cockpit also registers **only** the `board` view (`cockpit/src/panels/registry.ts:70`);
its other panels (openfang, gateway/tensorzero, squads/multica, networking/ziti,
memory, mcp) are **unregistered dead code still shipped in the bundle** — a
standing OSS-name-leak risk.

---

## 3. Flaws & mistakes — everything, including mine

### 3a. My process mistakes (own them)
1. **Hid broken tabs silently** — you couldn't tell hide-vs-fix. This doc fixes that.
2. **Fixed green the wrong var first** — `bg-accent` reads the *singular*
   `--color-accent`, not the `--color-accent-*` scale I first edited. Two wasted rounds.
3. **Reactive per-symptom patching** instead of one plan.
4. **Disruptive rebuilds** that killed your live session mid-use.

### 3b. Product flaws (verified, with evidence)
| # | Flaw | Evidence | Kind |
|---|------|----------|------|
| F1 | **Sign-in wall on a solo desktop.** Backend NEVER 401s in solo — the wall is a *client-side* first-run gate: `needsFirstRunSignIn = hasDesktopDeviceLogin() && !config.identity && …` fires because desktop has the device-login bridge but no captured identity. | `cockpit/src/App.tsx:285`; backend fail-open `authenticate.middleware.ts:127` | client gate, not backend |
| F2 | **Launch Agent (Wave) falsely says "Start the Recoder backend"** while backend is up. Reads `body.data` (object) as the array; should read `body.data.runtimes`. | *fixed* `3606e9fbc`, then tab retired into hub redirect `bc2b7d85e` | done |
| F3 | **Board dead.** `GET /api/conductor/work-signals` + `/issues/ready` → **404**. But these differ: work-signals **exists** at `/api/agent-os/observability/signals` (wrong path — cheap); `issues/ready` has **no HTTP edge** and needs the `bd`/beads substrate (real work). | agent audit #5/#6 | 1 cheap, 1 costly |
| F4 | **Two web tiles / recoder.xyz inside the app.** Default web url was the marketing site. | *fixed* `3606e9fbc` — `settings.json:21 web:defaulturl` now `""` | done |
| F5 | **OSS names leak in BOTH frontends.** Wave: openfang (ready-list/Engine/Hands), PAL (palette) — *fixed*. Cockpit LIVE: `WorkspaceDetail.tsx:181` "PAL plan"; raw `runtimeId` (no friendly labels); openfang as a parallel-run checkbox (runtimes list includes it). Dead panels ship openfang/tensorzero/multica/ziti strings. | agent audit §4 | rule violation |
| F6 | **Green buttons** (bright `bg-accent`). | *fixed* `dcd6d6a86` | done |
| F7 | **Double settings gear.** | *fixed* `dcd6d6a86` | done |
| F8 | **Approvals 503** ("database is unavailable") on DB-less desktop. | *fixed* `3c1028963` → 200 empty | done |
| F9 | **Cockpit shows raw runtime ids** (`claude_code` not "Claude Code") — no label map like Wave's `AGENT_LABELS`. | `NewWorkspaceForm.tsx` | polish |

Note on "why no claude code": the cockpit modal DOES offer `claude_code` (default
agent) — it's blocked only by the empty required **Folder** field (native
"please fill this field"). The place claude_code was actually missing is the
*Wave* Launch Agent tab (F2).

---

## 4. Rules (enforce on every change)

### 4a. Color / green rule
- **No green/bright fills on buttons or chrome.** Primary buttons = graphite
  `--color-accent: rgb(70,75,86)` (+ `-hover`/`-bg`) and SCSS `--accent-color`/
  `--tab-green`/`--link-color`/`--button-green-*`.
- **Only terminal ANSI greens are allowed** (`--term-green`, `--ansi-green`,
  `--term-bright-green`) — never for UI chrome.
- **Trap to remember:** `bg-accent` → singular `--color-accent` in
  `tailwindsetup.css`; the `--color-accent-*` scale is a *different* variable.

### 4b. OSS-naming rule (absolute)
- **Never show an upstream OSS name in the UI. Ever.** Non-exhaustive: `openfang`,
  `pal`, `wave`, `tsunami`, `ziti`, `herdr`, `mem0`, `multica`, `browser-use`,
  `beads`, `tensorzero`, `daytona`.
- Rebrand to `Recoder …` / a plain capability name, or hide the surface. Applies
  to tab titles, ready-lists, dropdowns, palettes, status text, tooltips, **and
  dead-but-shipped code** (delete or scrub unregistered cockpit panels).
- Backend runtime ids that are OSS names (e.g. `openfang`) must be filtered or
  relabeled in **every** view model (Wave *and* cockpit).

### 4c. Hide vs Fix vs Keep (tab governance)
Each tab is exactly one of KEEP / FIX / HIDE, and every HIDE needs a one-line
reason + revisit note recorded in §5. No silent decisions.

---

## 4d. What is Recoder vs Wave terminal? (the differentiator — answers "if we hide all these, what's left?")

Hiding the broken/infra tabs does **not** turn Recoder into vanilla Wave. The
moat was never the tab count — it's the **parallel-agent workspace loop + the
governed Agent OS**, which Wave has none of:

1. One action launches **any** coding agent (Claude Code/Codex/Cursor/opencode/
   gemini/…) into an **isolated git worktree**.
2. Run **many in parallel** — same task across agents, or many tasks — each its
   own worktree + tmux session.
3. A **board** of all running agents, live.
4. **Review** each agent's diff → **merge** the winner.
5. Behind it: **governed** (approvals), **memory-backed**, **audited** (Agent OS).

The infra tabs (Engine, Hands, Tools, Connectors) are backend capabilities the
agents use — they must run **invisibly behind** the loop, not as dashboards
(AGENTS.md: "no infra dashboards"). So the governance is 4 buckets, not "hide":

- **Loop-core (elevate — this IS the product face):** Workspaces hub, Launch,
  Session, Review, Merge, Runs.
- **Governance (keep — real differentiators vs Wave):** Approvals, Memory.
- **Aspirational-loop (keep in the vision, wire later):** Board = pick a task from
  the issue graph → launch an agent on it (task-driven). Needs the `bd`/beads
  substrate; defer the wiring, don't drop the idea.
- **Pure infra (hide — runs invisibly):** Tools/Capabilities, Connectors, Engine,
  Hands.

**Terminal must stay Wave-native.** Agents run as interactive TUIs in tmux blocks
that only the Wave frontend can host; the cockpit iframe **cannot own real
terminals** (it hands off to Wave via `recoder-open-terminal.ts`). Therefore the
loop board should be a **native Wave view**, and the cockpit (a web-iframe that
can't own terminals and is walled by sign-in) is redundant. **Option A stands —
but reframed:** it is NOT "strip to a bare terminal." It is *"elevate the Wave
workspace hub to BE the product's face (as polished as the cockpit board), keep
the governance surfaces, and drop only the duplicate cockpit + the pure-infra
dashboards + the sign-in wall + the OSS names."* That is the difference from Wave
terminal, kept and made prominent.

## 5. Tab-by-tab plan (the record)

**REVISED 2026-07-25 (Conductor-grade rail trim; owner directive "more like
Conductor/Cursor" + 3-agent wiring audit).** Default rail is now ONLY:
**workspaces (`recoder`), runs, terminal, files, web.** Every removal below is
rail-entry-only — the views stay registered and reachable from the hub. A
startup self-heal (`removeRetiredWidgetConfig`, `emain-backend-core.ts`) nulls
all retired keys in the user config so stale binaries/configs can't resurrect
them.

| Tab | View | Backend edge | True status | Decision | Action |
|---|---|---|---|---|---|
| **Workspaces** | `recoder` | `GET /api/conductor/workspaces` 200 | works (audit: all 10+ edges shape-verified) | **KEEP** (relabeled "workspaces") | — |
| **Session** | `recoder-terminal` | WS `/:id/stream` | **BROKEN twice**: model expects wrapped `{type:"event"}` frames but backend sends BARE RunEvents → every frame silently dropped ("Waiting for session output…" forever); rail-opened block has no `recoder:workspaceid` → permanent "no workspace" | **REMOVE from rail** | hub per-row Session is the only working entry; fix frame parse (bd) then keep as hub-opened view |
| **Launch Agent** | `recoder-launch` | none (redirect stub) | self-declared "Launch moved into Workspaces." placeholder | **REMOVE from rail** | hub inline launch owns it; board "Pick up" retargeted `recoder-launch`→`recoder` |
| **Review** | `recoder-diff` | diff/merge/pr edges verified | works — but rail entry just auto-selects `workspaces[0]`; hub per-row Review opens it seeded | **REMOVE from rail** (view stays — unique line-level patch + Create-PR) | — |
| **Runs** | `recoder-runs` | `/api/agent-os/runs` + `/events` 200 | works (empty until agent-os runs exist); sole agent-os history surface, NOT hub-redundant | **KEEP** | — |
| **Approvals** | `recoder-approvals` | `/api/agent-os/approvals` | **BROKEN twice**: governance router returns `{approvals:[…]}` but model requires bare array → always empty-while-"connected"; Approve/Reject POST `/approve\|/reject` → 404 (real route is `/decide` with `{decision}`) | **REMOVE from rail** | fix wiring (bd) before resurfacing |
| **Memory** | `recoder-memory` | `candidates` / `recall` | **BROKEN list**: model wants `{items,candidates}` object, no route returns that shape → permanently empty; recall/search half is correct | **REMOVE from rail** | fix list wiring (bd) before resurfacing |
| **sysinfo** | `sysinfo` | local | works | **REMOVE from rail** | infra dashboard — against north star; view reachable via launcher/palette |
| **processes** | `processviewer` | local | works | **REMOVE from rail** | same |
| **Board** | `recoder-board` | work-signals + issues/ready → 404 | work-signals = wrong path (cheap); issues/ready = no edge (costly) | **HIDE now** | repoint work-signals to `/observability/signals` later; issues/ready needs bd |
| **Engine** | `recoder-openfang` | none | N/A on desktop | **HIDE** | done |
| **Agent Hands** | `recoder-hands` | none | N/A on desktop | **HIDE** | done |
| **Capabilities/Tools** | `recoder-tools` | `/api/mcp/*` (registered, interop-gated) | infra dashboard | **HIDE** | done; revisit |
| **Connectors** | `recoder-connectors` | A2A | infra dashboard | **HIDE** | done |
| **Settings** | `recoder-settings` | — | dup of built-in gear | **HIDE** | done |
| **Cockpit** | web `:3100/cockpit` | 200 but SignIn wall | see §2/§9 | **DECIDE** | consolidate (see §9) |
| **Website** | web `recoder.xyz` | marketing site | doesn't belong in-app | **REMOVE default** | change `web:defaulturl` |

---

## 6. Auth plan (F1) — REAL sign-in (Google/GitHub), OPTIONAL, offline-safe

**Owner decision (2026-07-24):** don't bypass sign-in — make it **real and
optional**. Recoder already has everything for real Google/GitHub sign-in; the
only bug is that it's presented as a *forced wall* in the wrong frontend.

**What already exists (verified):**
- **recoder.xyz Better Auth** with Google + GitHub social providers —
  `app/lib/auth-config.ts:110-125` (`socialProviders.github`/`.google`, gated on
  real creds) + `packages/auth/src/index.ts:105`.
- **RFC 8628 device flow** on recoder.xyz — `POST /api/auth/cli/device`,
  verification page `/cli/auth`, `POST /api/auth/cli/token`
  (`app/app/api/auth/cli/{device,token,validate,verify,sessions}/route.ts`,
  `app/app/[locale]/cli/auth/page.tsx`).
- **Desktop client** already drives it in the MAIN process (frontend-agnostic) —
  `emain-device-auth-core.ts:144` `/api/auth/cli/device` → open `/cli/auth` →
  `:176` poll `/api/auth/cli/token`. Base `recoder.xyz` (`:69`).

**The model (target):**
- **Sign-in is OPTIONAL.** Local agents run offline with no account (backend is
  already solo fail-open — `authenticate.middleware.ts:103/:127`). "Continue
  without signing in" stays.
- **Sign-in is REAL.** "Sign in with Recoder" runs the existing device flow; the
  user authenticates on recoder.xyz **with Google or GitHub**; the desktop
  captures the identity (name/avatar) + a session. Signed-in unlocks the cloud
  differentiators (memory sync, GitHub PR integration, cross-device).
- **Not a wall.** The bug is the *proactive* first-run gate that blocks the app
  before you've done anything (`cockpit/src/App.tsx:285`). It becomes a
  dismissible prompt / a "Sign in" affordance in the hub — never a blocker.

**Seams (given we drop the cockpit — §9):**
1. **Port the sign-in UI into the Wave frontend** onboarding/hub — drive the same
   `emain-device-auth-core` via an IPC bridge (the core is already in emain, so
   this is UI + a bridge, not new auth logic). Retire `cockpit/SignIn.tsx`.
2. **Make it optional** — no proactive blocking gate; a "Sign in with Recoder"
   button + "continue offline". Show identity when present.
3. **Prod OAuth VERIFIED LIVE (2026-07-24)** — no SSH needed:
   - `https://recoder.xyz/auth/signin` + `/cli/auth` both 200 and render
     **github + google** buttons.
   - Device flow works: `POST https://recoder.xyz/api/auth/cli/device` → 200 with
     `device_code` + `verification_uri=https://recoder.xyz/cli/auth`, `expires_in:600`.
   So the backend half of "Sign in with Recoder → Google/GitHub" is fully
   functional; only the Wave client UI needs wiring to the existing device flow.
4. **Remove the marketing homepage tile** — DONE (`3606e9fbc`):
   `settings.json:21` `web:defaulturl` is now `""`.
5. Verify: fresh launch → no forced wall; "Sign in with Recoder" → browser →
   Google/GitHub on recoder.xyz → back in the app with identity shown; offline
   path still works.

---

## 7. Target layout

- **Default tab** = terminal + Workspaces hub. Nothing else auto-seeded.
- **Launcher rail (REVISED 2026-07-27)** = **workspaces, board, approvals,
  memory, runs, terminal, files, web** — 8 widgets (`defaultconfig/widgets.json`,
  `display:order` -6…-3). The hub still owns session/launch/review entry (those
  are NOT rail widgets). Approvals and Memory are back on the rail now that their
  wiring is fixed (the earlier "return only after wiring is fixed" condition is
  satisfied); Board was added when the task-driven pick-an-issue → launch loop was
  wired (`55d1a9fc0`). sysinfo/processes stay OFF the rail (infra dashboards —
  north star: none). Nothing that renders "not available"/"503"/empty-infra, and
  nothing that duplicates the hub.

---

## 8. Work log — shipped vs staged vs pending

**Shipped + pushed** (`feat/enterprise-s0-p0`): `dcd6d6a86` (green→graphite;
openfang/PAL removed in Wave; labels; launcher trim), `3c1028963` (Approvals
solo→empty), plus the earlier solo-mode gate cascade (memory
`project_desktop_solo_mode_gates`).

**Shipped (was staged):** Launch Agent shape fix landed (`3606e9fbc` — reads
`data.runtimes`, drops the recoder.xyz default homepage), then the tab was
retired outright: `recoder-launch-model.ts` is now a redirect into the
Workspaces hub (`bc2b7d85e`) — it no longer posts anything.

**2026-07-25 rail trim (this doc's §5 revision):** default widgets first cut to 5
(`defaultconfig/widgets.json`), `removeCockpitWidgetConfig` generalized to
`removeRetiredWidgetConfig` (nulls all 14 retired keys in user config on every
start), board "Pick up" retargeted to the hub, webview devtools unmount crash
fixed (`webview.tsx` cleanup guarded — the "WebView must be attached to the
DOM" error on leaving the web tab). Audit found 3 NEW broken wirings (session
stream frame shape; approvals list shape + decide endpoints; memory list
shape) — FIXED in `8597b41ee` (unit tests added for terminal-model +
memory-model; tsc clean, 97/97).

**Rail restored to 8 (as of 2026-07-27):** once the Approvals/Memory wirings were
fixed they returned to `defaultconfig/widgets.json`, and the wired Board
(`55d1a9fc0`) was added — the shipped rail is now **workspaces, board, approvals,
memory, runs, terminal, files, web** (see §7). NOTE (still current): the Go server
must be rebuilt for any `defaultconfig` change to ship —
`task build:backend:quickdev --force`; the task cache does **NOT** invalidate on
`defaultconfig` JSON edits, so a plain build silently keeps the old rail.

**Pending (needs your decision, §9):** frontend consolidation; cockpit auth
solo-bypass + PAL/openfang scrub + label map; Board (repoint work-signals /
defer issues-ready). (recoder.xyz default url: DONE — `settings.json:21`
`web:defaulturl` is now `""`, `3606e9fbc`.)

---

## 9. Architecture decision — LOCKED (2026-07-24)

The app cannot keep shipping two full UIs. **DECIDED: Wave-canonical (Option A),
reframed per §4d.**

- **Face of the loop = the native Wave Workspaces hub**, elevated to match the
  cockpit board (board of running agents + launch + review + merge). Terminals
  stay Wave-native (agents are interactive TUIs in tmux; the iframe can't host
  them).
- **Drop the cockpit iframe.** This collapses F1 (sign-in wall), F4 (web tiles),
  F5 (cockpit OSS leaks), and the §2 duplication in one direction.
- **Infra = 4-bucket (§4d):** hide Tools/Connectors/Engine/Hands; keep
  Approvals/Memory (governance differentiators); keep Board in the vision but
  defer wiring (needs `bd`/beads).
- **Accent = graphite `rgb(70,75,86)`** (kept).

This is NOT "strip to a bare terminal" — the parallel-agent loop + governed Agent
OS is the moat (§4d) and stays the hero; only the duplicate cockpit + pure-infra
dashboards + sign-in wall + OSS names are removed.

---

## 10. Implementation roadmap (phased; no code changes made in the planning turn)

**Phase 1 — Quick wins (low-risk): SHIPPED.**
- Launch Agent shape fix (F2) shipped (`3606e9fbc`); the tab was later retired
  into a Workspaces-hub redirect (`bc2b7d85e`, see Phase 3 gap note).
- Marketing homepage removed (F4): `defaultconfig/settings.json:21`
  `web:defaulturl` is now `""` (`3606e9fbc`).

**Phase 2 — Drop the cockpit + REAL optional sign-in in Wave (F1, §6):**
- ~~Remove `defwidget@recoder-cockpit` from the launcher (source + live override);
  stop packaging/serving the cockpit once unsurfaced.~~ **DONE (2026-07-25,
  recoder-k9c4):** launcher widget suppressed (`emain-backend-core.ts`
  `RetiredWidgetKeys`); electron-builder no longer packages the cockpit; the
  backend `/cockpit` static mount + `COCKPIT_DIST` env and the desktop
  `cockpitDist` plumbing were removed; the cockpit-only IPC bridge
  (`recoder:cockpit-config`/`backend-status`/`device-login`/`auth-refresh`/
  `auth-signout`, `cockpit-origin.ts` gate, `preload-webview` bridge) was
  ripped out. The `apps/desktop/cockpit/` source tree still exists on disk but
  nothing serves or loads it.
- Port "Sign in with Recoder" into the Wave hub/onboarding — drive the existing
  `emain-device-auth-core` (Google/GitHub device flow) via an IPC bridge; retire
  `cockpit/SignIn.tsx`. Make it **optional** (button + "continue offline"), never
  a blocking wall; show identity when signed in.
- Verify recoder.xyz prod has `GITHUB_CLIENT_ID/SECRET` + `GOOGLE_CLIENT_ID/
  SECRET` set (else only email login works).

**Phase 3 — Elevate the Wave Workspaces hub (the real work): SHIPPED.**
- `recoder` is now the product face: a live polling board of workspaces (friendly
  agent label, state, branch, `+adds −dels` diff summary), an inline Launch panel
  with the "also run in parallel" multi-agent option (one `POST /workspaces` per
  agent sharing a `taskGroup`), and per-row Session / Terminal / Review / Merge /
  Archive wired to existing conductor endpoints.
- No raw runtime ids (all via `AGENT_LABELS`), openfang filtered, graphite buttons,
  quiet borders. Files: `app/frontend/app/view/recoder/recoder.tsx` +
  `recoder-model.ts`.
- Endpoints used: `GET /api/conductor/workspaces` (real shape is
  `{data:{workspaces:[…]}}` — the model now reads `data.workspaces` with a bare-array
  fallback; the prior `body.data`-as-array read was a latent empty-board bug),
  `GET …/:id/diff/files` (per-file numstat → summed adds/dels; `available:false`
  ⇒ no summary, never fabricated), `POST /workspaces` (full required body:
  `spaceId/projectId/taskId/repoPath/runtimeId` + optional `taskGroup`),
  `POST …/:id/merge` (gated; solo click IS the approval), `POST …/:id/archive`.

**Gap discovered — RESOLVED (retired):** the separate **Launch Agent** tab used
to post a MINIMAL body missing the `spaceId/projectId/taskId` that the
`POST /workspaces` handler hard-requires (`conductor.routes.ts`
`requireString`), so its launch likely 400'd. Resolved by retiring the tab:
`recoder-launch/recoder-launch-model.ts` is now a redirect into the Workspaces
hub (`bc2b7d85e`) — no POST body exists anymore; the hub's inline Launch is the
only launch path.

**Phase 4 — Loop-core launcher + default layout:**
- Launcher rail (ORIGINAL Phase-4 plan; SUPERSEDED by §7 — the shipped rail is
  workspaces, board, approvals, memory, runs, terminal, files, web): Workspaces,
  Session, Launch, Review, Runs, Approvals, Memory + built-in
  terminal/files/web/sysinfo/processes. (Infra stays hidden.)
- Default tab/layout = the Workspaces hub + a terminal. No wall of tiles.

**Phase 5 — Verify (fresh launch):** no sign-in, no OSS names, no green, no
broken tabs; loop works end-to-end (launch parallel agents → board → review →
merge).

**Deferred (tracked, not now):** Board wiring (repoint work-signals to
`/api/agent-os/observability/signals`; `issues/ready` needs `bd`); a real
offline-safe identity story if sign-in is ever wanted on desktop.

---

## 11. Status of decisions
- Frontend: **Wave-canonical, drop cockpit** — LOCKED.
- Infra tabs: **hide infra, defer Board** — LOCKED.
- Accent: **graphite `rgb(70,75,86)`** — LOCKED.
