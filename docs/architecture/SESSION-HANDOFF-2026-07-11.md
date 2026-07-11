# Recoder — Session Handoff (2026-07-11)

> **For the next session (Fable 5 or any model):** read this top-to-bottom, then read the three architecture docs it points to. Everything below is committed + pushed unless marked otherwise.

## 0. The one-paragraph framing

Recoder is a **desktop Electron app** (`apps/desktop`) that embeds a Node control-plane (`docker-backend`) and runs *your own* coding-agent CLIs (Claude Code, Codex, pi, opencode) **in parallel**, each isolated in a git worktree + tmux session, with governance + tamper-evident audit. The owner's mandate this session: **fuse the ENTIRE polyglot monorepo (c/ crates/ go/ py/ ts/ packages/) into one product** — "every directory becomes one Recoder, like Linux is built on Unix" — with deep in-process composition (NAPI-linked Rust), **not** loose HTTP connectors. **It is a DESKTOP app, not a web app — never dogfood it in a browser.**

## 1. Current repo state

- **Branch:** `feat/enterprise-s0-p0` (58 commits this session, all pushed to `origin`)
- **Base gotcha:** local `main` is ~600 commits behind; this branch forked from `fix/agent-blockers-create-loop-codemirror-sandbox-autowake`. The origin copy of that parent branch has diverged, so a clean PR needs the base-branch divergence resolved first (an earlier PR #35 was auto-inflated to 31k files and was **closed**). Don't PR against `main`.
- **Disk:** ~5–9 GB free on a near-full APFS container. **Heavy Rust/Go/electron-builder builds ENOSPC the box and block ALL tools** — never run them locally without a `df` guard; they belong on CI.

## 2. What was built this session (the layered "cake", all committed)

- **Enterprise foundation** — S0 security (3 live vulns fixed: A2A bridge-token, Daytona sandbox IDOR, `.mcp.json` secrets) + P0/P0b/P0c/P0d (TenantContext/Principal/RBAC/AuditEnvelope, `resolveTenantContext`, `RuntimeProfile` boot switch, canonical Organization/Membership/Seat + PlanTier, desktop Managed-Policy validator, key-custody runbook). TDD + reviewed.
- **L3 polyglot fusion** — all 10 authorities fused into `docker-backend`, degrade-safe, tested: mem0, ops-recorder, openfang, tensorzero, lance, ziti, multica, browse-use (MCP), colbert, governance.
- **L4 surfaces** — lazy panel registry + **16 cockpit panels** (MCP Tools, Gateway, Agents, Networking, Squads, Retrieval + 10 migrated).
- **NAPI deep-linking (owner's "go deeper" call)** — each Rust crate has a `#[napi]` binding crate + facade rewired native-first (degrade-safe fallback to subprocess). **governance + lance compiled & linked in-process locally**; tensorzero/openfang/claw seamed + committed, build-deferred.
- **L5 packaging** — native `.node`s wired into electron-builder `extraResources`; signing runbook.
- **CI** — `.github/workflows/native-build.yml`: 20-cell matrix cross-compiles every `.node` + signed installer. **governance builds green on all 4 arches**; mac-x64 fixed to native `macos-13`; openfang/claw checkout issues fixed. (tensorzero needs `.sqlx/` metadata committed to build in CI.)

## 3. What is PROVEN working (end-to-end, not just compiling)

Run these to re-verify:
- `cd docker-backend && npx tsx scripts/e2e-conductor-loop.ts` — fused run loop `running → awaiting_review`.
- `cd docker-backend && npx tsx scripts/e2e-conductor-approval.ts` — governance gate + Merkle audit + native `NapiGovernanceKernel` loads.
- `node apps/desktop/scripts/dev-boot-proof.js` — desktop supervisor boots embedded backend, **Rust governance daemon spawns**, **`c/tmux` live**, `/api/conductor/health` 200, Redis-absent degrades to in-memory.
- **The full product loop, driven via HTTP** (verified this session): boot backend (`RECODER_SOLO_MODE=1 REQUIRE_AUTH=false PORT=3199 npx tsx src/server.ts`), `POST /api/conductor/workspaces {repoPath, prompt, runtimeId:"claude_code"}` → agent writes the file in a worktree → `awaiting_review` with real diff → `POST /workspaces/:id/merge {approve:true}` → **file lands on the base branch.**
- **Multi-agent parallel PROVEN** — 3 concurrent workspaces (own worktree+branch+tmux+lock, no collision); per-user cap = 5 (env `CONDUCTOR_MAX_PER_USER`).

## 4. Open items / next actions (prioritized)

1. **Desktop GUI dogfood (the RIGHT way):** the real Electron app **boots on the Mac** (`electron .` → dock icon set). Headless Playwright `_electron.launch` FAILED here (app spawns backend + health-gates). **The real visual dogfood must run on the owner's Mac display** — `cd apps/desktop && npm start`. Do NOT use a browser.
2. **Cockpit dogfood fixes still open** (found via the — wrong — browser dogfood, but valid since it's the same Preact renderer): workspace cards show opaque UUIDs (should show the prompt/goal); duplicate empty-state "Create your first workspace" CTAs; health strip eats vertical space + no collapse affordance. (Already fixed: `[object Object]` errors unwrapped; all 16 panels reachable in nav; inline delivery-gate verdict.)
3. **Runtime configs so all 3 agents write in parallel:** `codex` ran but its read-only sandbox blocked writes (needs `--approval-policy=never`/`CODEX_DISABLE_SANDBOX`); `pi` failed `MODULE_NOT_FOUND` at runtime in the worktree (module-path resolution). Both are runtime config, NOT conductor bugs.
4. **CI green-up:** commit tensorzero's `.sqlx/` metadata (`cargo sqlx prepare --workspace` in `crates/tensorzero/crates/` with a live DATABASE_URL) so its NAPI cell builds; verify the mac-x64 `macos-13` fix + openfang/claw thin-build compile on the next run.
5. **PR base divergence** — decide how to land the branch (the origin parent branch diverged; don't PR against `main`).
6. **Deferred native compiles** (tensorzero/openfang/claw `.node`) — run on CI, not locally (7–9 GB each).

## 5. Rules / gotchas learned (obey these)

- **Recoder is a DESKTOP app. Never dogfood it in a browser.** Real GUI testing = the Electron app on a Mac display.
- **Fusion law** (`docs/architecture/INTEGRATION-PLAN.md`): in-process-import is the DEFAULT (TS engines `import`ed into docker-backend); subprocess/UDS/stdio for Rust/Go/Python authorities; **NAPI links Rust INTO the binary**; HTTP only at true edges (cockpit↔backend, mobile, cross-machine). NOT a connector army.
- **Disk is the hard constraint.** `df -h /` before any build; heavy builds → CI. ENOSPC blocks everything.
- **Vendored subtrees are gitignored** (`.gitignore` ~663: `crates/openfang/`, `crates/claw-code-parity/`, `go/beads`, `go/ziti`). NAPI binding crates under them need precise `.gitignore` negations to commit (done for openfang-napi).
- **Truthful health / no fake-ready** (repo rule): every fusion is degrade-safe and reports "unavailable" honestly when a binary/service is absent; never fabricate success.
- **Explicit-path commits only** — the working tree has pre-existing unrelated changes (dist/, colbert, docker-compose, a stray `tools/branding-drift-scanner/scan.sh` deletion); never `git add -A`.
- **Operator actions still owed:** rotate the 3 tokens exposed in git history (Daytona/RECODER_API/RECODER_SESSION); fill the key-custody runbook §7 owner table before Phase-1 signing; `recoder-5kyy` (bd) tracks the E2B IDOR.

## 6. Artifact map (read these)

- `docs/architecture/RECODER-FUSION-PROGRAM.md` — the master layered tracker (L0–L5 status, every crate/dir + fusion mode + commit).
- `docs/architecture/DESKTOP-COMPREHENSIVE-INTEGRATION.md` — the hub/panel architecture + capability map.
- `docs/architecture/INTEGRATION-PLAN.md` + `WIRE-UP-BACKLOG.md` — the authoritative fusion law + built-but-unfused list (13/15 wired).
- `docs/superpowers/specs/2026-07-11-recoder-desktop-enterprise-architecture-design.md` — the enterprise blueprint.
- `docs/superpowers/plans/2026-07-11-*.md` — the S0/P0/P0b/P0c/P0d + P0c-2/P0d-2 implementation plans.
- `.superpowers/sdd/progress.md` + `.superpowers/sdd/*-report.md` — per-task execution ledger + subagent reports.

## 7. The next concrete move (owner's pending choice)

The owner was asked to pick the desktop-dogfood path and hasn't yet: **(1)** they run `npm start` on their Mac and report UX; **(2)** launch `electron .` foreground on their screen; or **(3)** fix `codex`/`pi` runtime configs + keep polishing cockpit logic with tests (verifiable without a display). Start there.
