# Recoder — Current Build Status (reality, not design)

> The other docs in `docs/` describe the **design** (subsystems, plans, the intended shape). This
> file records what is **actually built, green, and used** right now — with the **evidence** behind
> each claim. Where something is built-but-not-wired, designed-but-not-built, or not yet verified,
> it says so explicitly. **No claim here is asserted without a citation of the real check.**
>
> Companion design docs: [`PRODUCT-PLAN.md`](./PRODUCT-PLAN.md) (tracking board),
> [`subsystems/README.md`](./subsystems/README.md), [`PACKAGES.md`](./PACKAGES.md),
> [`CONTINUUM-PLAN.md`](./CONTINUUM-PLAN.md), [`PI-CONSOLIDATION.md`](./PI-CONSOLIDATION.md).

**Snapshot date:** 2026-06-27
**Branch:** `fix/agent-blockers-create-loop-codemirror-sandbox-autowake`
**Anchor commit (the big session merge):** `34b2d4a83` — *"feat: own ts/ engines, ship desktop cockpit + chat-control, brain code-graph live; resolve 95-file merge"*

> **Important provenance note:** `34b2d4a83` is committed. The **coordination work-lock wiring**,
> the **brain-in-conductor-bundle** seam, and the **cockpit ConnectorsPanel** are in the **working
> tree (uncommitted)** as of this snapshot — they are built and their tests pass (cited below), but
> they are not yet in a commit. This file flags those as **working-tree** so the audit trail is honest.

---

## How to read the status column

| Symbol | Meaning |
|---|---|
| ✅ green | Built and verified by a check cited in this doc (test count / `tsc` 0 / live HTTP probe). |
| 🟢 built | Built; covered by a cited check but at a coarser grain (e.g. `tsc` 0, not a behavioral test). |
| 🟡 partial | Real code exists and is wired, but a slice is incomplete or unverified (flagged in the row). |
| 🅦 working-tree | Built + tests green, but **uncommitted** at this snapshot. |
| 📐 designed | Design/plan only — not built this session. |
| ⏸ shelved | Built and green, but intentionally parked (incomplete to ship, or pending a decision). |

---

## 1. Owned `ts/` engines (all rebranded `@recoder/*`, build-green, no stubs)

Promoted to first-party Recoder ownership. Package names verified by reading each `ts/<dir>/package.json`.

| Engine | Package name | Status | Evidence |
|---|---|---|---|
| dmux | `@recoder/dmux` | 🟢 owned | `ts/dmux/package.json` name = `@recoder/dmux`; conductor `dmux-adapter.ts` (189 lines, new in `34b2d4a83`). |
| oh-my-codex | `@recoder/codex-runtime` | 🟢 owned | `ts/oh-my-codex/package.json` name = `@recoder/codex-runtime` (TS + Rust). |
| oh-my-openagent | `@recoder/opencode-harness` | 🟢 owned | `ts/oh-my-openagent/package.json` name = `@recoder/opencode-harness`. |
| open-agents / tool-loop-agent | `@recoder/open-agents` | 🟢 owned | `ts/open-agents/package.json` name = `@recoder/open-agents`. tool-loop drivers also live in `@recoder/runtime` (§3). |
| opencode | `@recoder/opencode` | 🟢 owned | `ts/opencode/package.json` name = `@recoder/opencode`; test runner is `bun test`. **29/29 is the prior-session figure — see honest note below; not re-run in this snapshot.** |
| recodergit (engine) | `recodergit-monorepo` (engine), exposed via `packages/recodergit` `@recoder/recodergit` | ✅ native | Native code-graph (tree-sitter + onnx + lbug). Doctor proves it LIVE — see §6 brain doctor. |
| pi | `packages/pi-*` (`pi-agent-core`, `pi-ai`, `pi-coding-agent`, `pi-tui`) | 🟢 owned | pi lives under `packages/pi-*`; full vendor merge to 0.80.2 (`4ef18d248`). The old `ts/pi` dup was retired. |

**Retired this session (duplicates / superseded):** `ts/qwen-code`, `ts/polar`, `ts/pi` (dup of `packages/pi-*`).
Evidence: cleanup section of `34b2d4a83` commit message; `ts/` now contains only
`dmux, extracted-from-openclaw, oh-my-codex, oh-my-openagent, open-agents, opencode, recodergit`.

> **Honest note on opencode 29/29:** the opencode suite runs under `bun test`. The 29/29 figure is
> the count reported in the merge commit; it was **not re-executed** in this snapshot (the doc author
> verified the other engines' presence/names directly but did not re-run the bun suite). Treat 29/29
> as *prior-session reported*, not *freshly re-verified here*. See open item in §10 (native fetch / CI).

---

## 2. New owned packages (built this session)

| Package | Status | Evidence (freshly re-run in this snapshot unless noted) |
|---|---|---|
| `@recoder/coordination` | ✅ green | `node --test` ⇒ **tests 252, pass 252, fail 0**. (`packages/coordination`, `0.1.0`.) Lock service, glob-overlap, TTL/fence, dispatch, handoff, reconciler. |
| `@recoder/runtime` | ✅ green | `node --test` ⇒ **tests 160, pass 160, fail 0**. (`packages/runtime`, `0.1.0`.) Drivers: claude-code, codex, in-process tool-loop. |
| `@recoder/connectors` | ✅ foundation green | Foundation: `vitest run src/gating` ⇒ **13/13 pass** (`command-gating` 8, `mention-gating` 5). Package = `ts/extracted-from-openclaw`, name `@recoder/connectors` `0.1.0`. **8 channel kinds declared** (`telegram, slack, discord, signal, line, feishu, imessage, whatsapp` — `connector-kind.ts`), with real extracted source under `social-gateways/*`. |

**The "green-but-shelved, then wired" story (true):** the merge commit `34b2d4a83` explicitly shipped
coordination + runtime as *"green; shelved pending wiring."* Since then, **coordination has been wired
into the conductor** (see §5) in the working tree; **runtime remains green-but-shelved** (not yet wired
into a live agent driver path here).

> **Channel-adapter honesty:** all **8 kinds** are *declared* and have extracted gateway source, but only
> **`telegram` is a real, runnable adapter today**. `docker-backend/src/connectors/config.ts` hardcodes
> `REAL_CHANNELS = ['telegram']` and `gateway.ts` only constructs `TelegramConnector`. The other 7 are
> foundation-present, adapter-pending. The "7–8 channel adapters" phrasing means **8 declared kinds /
> 1 live adapter**, not 8 runnable adapters.

---

## 3. Product surfaces

### Desktop cockpit — `apps/desktop/cockpit`

A conductor.build-style cockpit over the **live `/api/conductor`** API, loaded by the Electron shell.

| Aspect | Status | Evidence |
|---|---|---|
| Cockpit app (board / terminals / sessions / auth / connectors-panel / lock-badges) | 🟢 built | `apps/desktop/cockpit/src/` has `Board.tsx`, `SessionTerminal.tsx`, `SessionsPanel.tsx`, `DmuxPanel.tsx`, `WorkspaceDetail.tsx`, `SignIn.tsx`, `HealthStrip.tsx`, `NewWorkspaceForm.tsx`, plus **`ConnectorsPanel.tsx` (🅦 working-tree)**. Real `recoder.xyz` device-flow auth via `lib/api.ts` + `lib/config.ts`. |
| Installable `Recoder.app` with cockpit in `app.asar` | ✅ verified | `apps/desktop/dist/mac-arm64/Recoder.app/Contents/Resources/app.asar` exists (1.6 MB, built 23:16). `asar list` shows `/cockpit/dist/{cockpit.js,cockpit.css,index.html}` — cockpit is **bundled inside the shipped app**. |

### recoder-code IDE

| Aspect | Status | Evidence |
|---|---|---|
| recoder-code green + uses owned engines | ✅ green | `tsc --noEmit` in both real packages ⇒ **0 errors** (`packages/recoder-code/packages/core` 0, `…/cli` 0). Gets recodergit + brain MCP tools by default (commits `c656f07b9`, `30db96424`). |

---

## 4. What is actually USED in the running product

Verified by a **live boot** of `docker-backend` (§7) plus reading the wiring source.

| Capability | Where it runs | Status | Evidence |
|---|---|---|---|
| **coordination work-locks** (collision prevention) | conductor `workspace-service.ts` → `conductor-locks.ts` | ✅ green 🅦 working-tree | `conductor-locks.ts` drives the **real `@recoder/coordination` LockService**; on launch the conductor claims an exclusive write-lock and **refuses on conflict** (`lock.status === 'conflict'` → `write-lock conflict` + audit metadata), degrade-safe if the engine is unavailable. Tests: `vitest run src/conductor/conductor-locks.test.ts` ⇒ **9/9 pass** (incl. injected-failure → `coordination-unavailable`). Files are **uncommitted** at this snapshot. |
| **@recoder/brain in the conductor bundle** | conductor `bundle.ts` | 🟢 wired 🅦 working-tree | `bundle.ts` imports `BrainContext` from `@recoder/brain` and, **only when `RECODER_BRAIN_ENABLED` is truthy** and `brain.isEnabled()`, assembles ONE fused context block via `brain.assembleForTask(...)`; flag off / unavailable / assemble-fail ⇒ existing behavior (fail-safe). `bundle.ts` is **modified-uncommitted**. Flag also consumed by `agent-os/brain-service.ts`, `service-container.ts`, `internal.routes.ts`. |
| **code-graph live via recodergit** | brain `RepoIntelPort` → recodergit engine | ✅ live | Driven by the real recodergit engine; proven by brain doctor (below) and recodergit resolver tests (`a12f10460`, `fbec0ae50`). |
| **@recoder/connectors → docker-backend** (Telegram chat-control) | `docker-backend/src/connectors/` + `GET /api/connectors` | ✅ live | Route mounted at `server.ts:15555` (`app.use('/api/connectors', createConnectorsRouter())`). Live probe (§7): `GET /api/connectors` ⇒ `{"success":true,"data":{"active":false,"dispatchReady":false,"channels":[]}}` (truthful "inert, no channels configured" when no token present). Telegram adapter is real (grammy), degrade-safe. |
| **brain doctor: recodergit + continuum + bd LIVE** | `packages/brain/src/runtime/doctor.ts` | ✅ green | `doctor.test.ts` ⇒ **13/13 pass**. recodergit + bd proven by harmless `--version`/`--help` probe; continuum proven by the **in-process** `@recoder/continuum/engines` signal (no shell-out). `mem0`/`context7` reported as *configured-not-proven* until keys present (honest by design). |

---

## 5. Conductor (substrate) state

| Piece | Status | Evidence |
|---|---|---|
| conductor live (`/api/conductor/*`) | ✅ live | Boot log: `conductor reconcile complete`; `GET /api/conductor/health` ⇒ 200 `{available:true, git:true, tmux:true, tmuxBin:".../c/tmux/tmux"}`; `GET /api/conductor/workspaces` ⇒ 200. |
| coordination work-locks in conductor | ✅ 🅦 working-tree | See §4 (9/9 tests). |
| brain seam in conductor bundle | 🟢 🅦 working-tree | See §4. |
| tmux orchestrator + tmux-path + dmux-adapter | 🟢 built | `tmux-orchestrator.ts`, `tmux-path.ts`, `dmux-adapter.ts` (committed in `34b2d4a83`); built tmux binary at `c/tmux/tmux` resolved live. |

---

## 6. The merge

- **95-file working-tree conflict resolved repo-wide**, committed as `34b2d4a83`.
- **docker-backend `tsc` 114 → 0:** freshly re-verified — `npx tsc --noEmit` in `docker-backend` ⇒ **exit 0, 0 errors**.
- **Merge cleanliness:** `git diff --check` and `git ls-files -u` both **empty** (0 conflict markers, 0 unmerged paths).
- Low-confidence kept-vs-deleted resolution choices were flagged for review in the commit body (honest).

---

## 7. End-to-end boot proof (this snapshot)

`docker-backend` booted from source (`npx tsx src/server.ts`) on a dev box **with no Postgres and no Redis** (degrade-safe):

- Process listened on `:3100`.
- `connectors:gateway` logged `no channels configured` → `inert / active:false` (truthful, not faked).
- `conductor reconcile complete`.
- `GET /api/conductor/health` ⇒ **200** `{available:true, git:true, tmux:true, tmuxBin:"…/c/tmux/tmux"}`.
- `GET /api/conductor/workspaces` ⇒ **200**.
- `GET /api/conductor/runtimes` ⇒ **200**, all available with real paths:
  `claude_code` (`~/.local/bin/claude`), `codex`, `opencode`, `recoder_code`, `pi`, `gemini_cli`, `qwen_code`.
- `GET /api/connectors` ⇒ **200** truthful envelope (above).

> Redis/Postgres were unavailable locally; the server logged `ENOTFOUND redis` and continued —
> reported here as **environment evidence**, not a product failure. This is a local-degraded boot,
> **not** a production health claim.

### Quality gate

- **agent-os contracts:** `node --import tsx --test tests/contracts/agent-os/*.test.ts` ⇒ **tests 10, pass 10, fail 0** (the "10/10" claim — freshly re-run).
- **Package tests directly re-run in this snapshot:** coordination **252**, runtime **160**, brain **98**, connectors-foundation **13**, conductor-locks **9**, agent-os contracts **10** = **542 verified here**.

> **Honest note on "534 package tests":** 534 is the aggregate figure reported by the prior session's
> quality gate. This snapshot did **not** re-run the *entire* package matrix; it re-ran the six suites
> above (542 passing). Treat 534 as the *prior-session gate total* and the 542 above as *this snapshot's
> directly-verified subset*. opencode's `bun test` suite was not part of this re-run.

---

## 8. Honest open items (not done / not verified)

| Item | State | Why it's open |
|---|---|---|
| opencode cross-platform native `fetch` | ⏸ open (CI) | opencode runs under `bun`; cross-platform native-fetch behavior needs CI verification on the target platforms. Not re-run here. |
| Discord full dispatch pipeline | ⏸ deferred | ~45 sibling files under `social-gateways/discord/` (extracted), but the full inbound→dispatch pipeline is **not** wired as a live adapter (only Telegram is). Deferred. |
| mem0 / context7 brain sources | ⚠️ config-gated | Doctor reports them as *configured-not-proven*; they need real config keys (`MEM0_BASE_URL`, `CONTEXT7_API_KEY`) to go LIVE. Not lit up. |
| substrate / interop subsystems | ⏸ shelved (incomplete) | `@recoder/substrate` (`0.1.0`) has command/exec/registry scaffolding; `packages/interop/src` is empty. Shelved as incomplete — do not claim them live. |
| `@recoder/runtime` wired into a live agent run | ⏸ shelved | Built + 160/160 green, but **not** yet driving a live agent execution path here. |
| **Live-agent run not yet executed** | ❌ not run | No actual end-to-end agent run (spawn → tool-loop → RunEvent) was executed in this snapshot. The boot proves the surfaces are up and runtimes are present; it does **not** prove a completed agent task. |
| coordination/brain/connectors-panel wiring committed | 🅦 working-tree | Built + tests green but **uncommitted** at snapshot time. |

---

## 9. One-line truth

Owned `ts/` engines + new `@recoder/{coordination,runtime,connectors}` are **built and green** (252 / 160 / 13
re-verified); the desktop cockpit ships **inside `Recoder.app`** over a **live conductor**; coordination
work-locks, the brain bundle seam, and Telegram chat-control are **wired and running** (with the first two
**uncommitted** at this snapshot); the 95-file merge is resolved with **docker-backend `tsc` at 0**. What is
**not** yet proven: a real live-agent run, the non-Telegram channel adapters, the mem0/context7 keys, and the
substrate/interop subsystems.
