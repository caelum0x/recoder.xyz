# Recoder Backend — Build Status (session handoff)

> Living status of the comprehensive-backend build. Read this first to resume.
> Design: [ARCHITECTURE.md](./ARCHITECTURE.md) · plan: [BUILD-ORDER.md](./BUILD-ORDER.md) ·
> tree: [FILE-TREE.md](./FILE-TREE.md). **Last updated: 2026-07-15.**

## Where we are

Building the 498-file, 14-domain, multi-language backend phase by phase from
`BUILD-ORDER.md`. Each phase = a workflow (build → verify → commit) with a
**per-phase file-count gate** (must hit the design budget or get expanded).

| Phase | Domain | Budget | Status | Commit |
|---|---|---|---|---|
| 0 | Foundation (spine) | 16 | ✅ boots | `b159389b5` |
| 1 | Persistence | 34 | ✅ 33/33 tests | `054c053c5` |
| — | Cut v1 cruft (sandbox/code/collaboration/database) | — | ✅ done | post-054c |
| 2 | Identity & Auth | 36→37 | ✅ 72/72 tests | `e58468c5e` |
| 3 | Governance & Interop | 33→47+12 | ✅ 74 tests | `91a20030` / `f617d383` |
| 4 | Edge & API | 26 | ✅ 15/15 tests | `75a0d888` |
| 5a | Agent-OS control plane | 46→28 | ✅ 19 tests (composed @recoder/agent-os fresh) | `95ff34a1` |
| 5b | Conductor & Terminal | 45→36 | ✅ 30 tests (composed @recoder/substrate fresh) | `8f42873e` |
| — | Serial integration (5a+5b → bootstrap) | — | ✅ 8 health sources, boots | `bfa55b0f6` |
| 6 | Engines + Inference (DEEP OSS) | 70→102 | ✅ 135 tests, real SSE | `4e8a45b26` |
| 7 | Interop-wire + Social | 70→68 | ✅ 38 tests, a2a intact | `8212ab985` |
| 8 | Memory & Retrieval | 34→44 | ✅ 31 tests | `0b7d845fc` |
| 9 | Billing & Metering (MoR, no Stripe) | 28→31 | ✅ 43 tests | `d9c9683ab` |
| 10 | Cloud & Sandboxes | 27→31 | ✅ 33 tests | `112c49ac2` |
| — | Serial integration (7 domains → bootstrap) | — | ✅ 14 sources boot | `7a01c7f4f` |
| 11 | Observability & Ops (capstone) | 23→32 | ✅ 42 tests, 15 sources, /metrics | `11693c360` |

## ✅ COMPLETE — all 12 phases done (2026-07-15)

**~540 committed source files** (486 domain + 25 migrations + 29 shared/bootstrap/http),
**15 domain dirs**, boots with **15 truthful health sources** (nothing faked — every down/
degraded is honest about a missing DB/substrate/provider). Deep-OSS engines exercise the real
`backend/engines/` surfaces; billing is MoR (Polar/Creem/Paddle/Dodo, no Stripe); auth is
backend-owned + unified; a2a intact at 227. Desktop fully rebranded in parallel.

## ✅ Engines deepened IN their dirs + one-project convergence (2026-07-15)

The owner mandate — depth lives in the engine dir, not thin adapters — is honored. Every
engine is now runnable from its own dir with truthful health from REAL capability:
- **Rust** (`c2a3e4a7f`): governance napi surface deepened + rebuilt (fixed a real bug —
  approvals were invisible to `decide()`); openfang/tensorzero already complete.
- **Py** (`bdf314b57`, `28ed48cf4`): mem0 (import-side-effect fixed, serves 21 routes),
  ops-recorder (full ingest roundtrip + GH/Linear detectors), pal-mcp (18 real tools via live
  MCP handshake), colbert (LIVE ColBERT MaxSim rerank), browser-use (LIVE Chrome via CDP).
- **Desktop Go** (`02db91cbc`): beads (bd 1.0.5), multica (server booted, auth-gated),
  ziti (OpenZiti CLI), recoder-xds (xDS gRPC :18000 serving) — all built + verified.
- **Desktop TS/C**: dmux/recodergit/openclaw dists rebuilt + runnable, tmux `next-3.7` verified;
  desktop dev-boot is fully fused (wave shell + cockpit + embedded backend + all engines).

**One project (`75732ebf8`):** `apps/` = **desktop only**. `apps/social` folded into the one
embedded backend (its social domain covers it). The desktop IS the product: wave shell +
cockpit + the ONE backend (15 domains + all engines) + the desktop's own engines, one boot.

## ✅ CLEAN (2026-07-15): engines used + legacy absorbed + one project

- **Engines spawned on boot + consumed** (`e0427af50`): the engine-supervisor spawns the
  deepened engines at boot — colbert/mem0/ops-recorder/browser-use as live processes,
  openfang/tensorzero/governance in-proc napi — and a consumer reaches a live one (proven:
  `engines.client('colbert').invoke(rerank)` → real ranking against the live :8893 process).
  Degrade-safe truthful for multica (needs PG15)/pal(.pal_venv path)/ziti(creds).
- **Legacy flat dirs ABSORBED + removed** (`914453ba0`): all 8 (a2a/agent-os/conductor/
  connectors/gateway/engines/network/routes) gone; 20 imports resolved; **tsc 268 → 0**.
  `src/` = `bootstrap/ domains/ http/ shared/ + logger.ts + server.ts` — the target shape.
- **One project** (`75732ebf8`): `apps/` = desktop only.

**Final: 15 domains, ~540 domain files, 0 tsc errors, boots with 15 truthful health sources,
engines spawn + consumed, one unified desktop app.**

### The product flow USES the engines (`ee2868f0f`) — proven on a real workspace
The conductor run flow (the workspace-for-agents product core) now consumes the engines in
service code (NOT via agent MCP tools): on create → recodergit index + beads track; on launch →
memory recall (mem0∪beads∪colbert) enrich + governance decide; run via external CLI (Claude
Code/Codex → tmux worktree) OR native openfang runtime, inference through tensorzero; every write →
governance decide+recordAudit; on complete → memory harvest + beads close. Proven by driving a REAL
`conductor.createWorkspace` against a temp git repo: recall invoked, governance decided (fail-closed
on no-DB audit — truthful), recodergit attempted, `bd` ran. 57/57 conductor tests.

## Remaining minor follow-ups (documented, NOT hidden)

> **2026-07-16 sweep (`f3d219e5a` + F1/F2 commits):** items 0–5 of the original list are DONE —
> packaged recodergit/dmux bundling; the domain-tools MCP bridge (`registerDomainTools`,
> collision-safe) wired in bootstrap; EntitlementGate injected into conductor + inference with
> truthful 429s; `/api/social` (connectors + channels truth) + `/api/a2a` (health/agent-card/rpc/
> ingress) surfaces live; legacy flat dirs absorbed (`914453ba0`); the tmux substrate is
> package-compatible and launching (F2 run-screen plane on top of it). Also fixed en route:
> fresh-DB migration splitStatements landmine; dev-mint-conductor-key rewritten over the identity
> domain's DB-backed sk_ store.

1. **multica full readiness needs PG15+** (prod PG17 fine; local PG14 caveat).
2. **WS telemetry tap** (upgrade-router) + **OTLP tracing endpoint** — minor.
3. **Root `/.well-known/agent.json` alias** for the a2a agent-card (RFC 8615 wants origin root;
   needs a bootstrap-owned root mount).

## Deviation to reconcile
Phase 5a/5b **composed the `@recoder/agent-os` + `@recoder/substrate` packages fresh** rather
than moving the legacy `src/agent-os` (68) + `src/conductor` (126) dirs. Those legacy dirs are
STILL PRESENT and still imported by `src/a2a` + `src/connectors` (move in P7). So: (a) domain
file counts came in UNDER budget (the depth is in the packages), (b) `src/agent-os`/`src/conductor`
absorption is deferred to the P7 a2a/connectors move. Conductor substrates are empty (the legacy
tmux substrate isn't package-`ConductorSubstrate`-compatible + reads process.env) — a bridge is
needed before conductor can launch; until then it degrades truthfully (`conductor=down`).

## Concurrency plan (use MULTIPLE workflows)

Dependency chain `0→1→2→3→4→5` is mostly serial; **`6,7,8,9,10` run concurrently**
after 5; `11` last. Current batch: **P2 ∥ P3**. Then P4 → (P5 = agent-os ∥
conductor) → **(P6 ∥ P7 ∥ P8 ∥ P9 ∥ P10)** → P11.

**The rule that makes parallel phases safe:** a parallel domain-workflow builds
ONLY its `domains/<x>/` + its `migrations/<domain>_*.sql`, and **NEVER edits
`bootstrap/container.ts`**. Module wiring into the container is done by a short
**serial integration step** after each concurrent batch (each domain's
`*-module.ts` composer reports the `container.register(...)` call it needs).

## Hard guardrails (every build workflow carries these)

1. **NEVER delete/move/`rm` a kept dir.** `a2a/` (227), `agent-os/` (68),
   `conductor/` (126), `connectors/` (17), `gateway/` (6), `engines/` (19),
   `network/` (5), `domains/*` are KEPT — they get *moved into domains* in their
   phase, never bulk-deleted. (`a2a/` was accidentally deleted once and restored
   from HEAD — do not let it recur.)
2. **Engines are DEEP modules over the real OSS**, not thin `*-client.ts` wrappers
   — see [[project_engines_are_deep_modules]] and BUILD-ORDER Phase 6.
3. **Truthful health / degrade-safe.** No local Postgres → in-memory fallback +
   truthful `down`, boot never blocked. Never fake a `200`/`up`.
4. **Per-phase file-count gate.** If a build comes in under its budget, expand it
   before committing (avoids the LLM tendency to consolidate into fat files).
5. Build ON `packages/*` (70 first-party contracts: agent-os 54, substrate 91,
   governance 48, a2a-sdk 40, agent-mcp 45, …) — compose, don't reinvent.

## Target `src/` structure (end state)

`backend/src/` → **`shared/`, `bootstrap/`, `http/` (P4), `domains/` only.**
The flat dirs are transitional:

| Flat dir | Fate | Phase |
|---|---|---|
| `sandbox/ code/ collaboration/ database/` | **CUT** ✅ done | — |
| `agent-os/` + `conductor/` | MOVE → `domains/{agent-os,conductor}` | 5 |
| `engines/` (thin clients) | REPLACE → deep OSS modules | 6 |
| `gateway/` | MOVE → `domains/inference` | 6 |
| `a2a/` (227) | MOVE → `domains/interop` | 7 |
| `connectors/` | MOVE → `domains/social` | 7 |
| `network/` | MOVE → `domains/cloud` | 10 |
| `routes/` | FOLD each → its domain as a `RouteProvider` | across |

## How to resume

1. Read this file + `BUILD-ORDER.md`. Check `git log` for the last phase commit.
2. For the next phase(s), launch a build workflow per the pattern:
   **core-seam agent → parallel feature agents → verify+commit agent**, with the
   guardrails above baked into every prompt.
3. **Boot check** each phase: `cd backend && PORT=<free> DATA_DIR=/tmp/x
   RECODER_SOLO_MODE=1 STRICT_AUTH=false CONDUCTOR_TMUX_BIN=$PWD/../apps/desktop/engines/tmux/tmux
   node_modules/.bin/tsx src/server.ts` → poll `/health` (degraded-truthful w/o DB is OK).
4. After a concurrent batch: run the **serial integration step** (wire each
   `*-module.ts` into `bootstrap/container.ts`, mount routes, register HealthSource).
5. Verify gate per phase: `pnpm exec tsc --noEmit` (new surface clean),
   `pnpm exec vitest run src/domains/<x>`, boot, file-count vs budget.

## Known state / gotchas

- The OLD `server.ts` was a 12,800-line v1 website-builder monolith that didn't
  boot (dangling imports from owner-deleted modules). Replaced by the thin
  28-line `server.ts` → `bootstrap.start()`.
- `pnpm exec tsc --noEmit` shows ~191 PRE-EXISTING errors from the not-yet-absorbed
  v1 flat dirs (`routes/*` importing cut modules, etc.). Filter to the touched
  `domains/<x>/**` surface — that must be 0. The v1 errors clear as `routes/` and
  the flat dirs are folded into domains.
- Disk is near-full APFS — prune store before heavy builds; prefer moves.
- Auth (P2): backend OWNS Better Auth, unified identity (`user`/`session` +
  `user_cli_link`, never drop `users`), DB-backed `sk_` keys — serves website
  (cookie) + desktop (`sk_`/device flow). See [[project_backend_server_unbootable]].
