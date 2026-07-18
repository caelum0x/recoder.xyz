# Recoder — Next Phase Plan: The Backend Spine

> **⚠️ SUPERSEDED (2026-07-15).** This 4-item plan (auth/social/engines) was expanded
> by the owner into the full-scope comprehensive backend. The canonical plan is now
> **[RECODER-BACKEND/](./RECODER-BACKEND/)** — `ARCHITECTURE.md` (design), `FILE-TREE.md`
> (498-file plan), `BUILD-ORDER.md` (12 phases), `BUILD-STATUS.md` (live progress).
> This file is kept for the locked Phase-A auth decisions (backend-owned Better Auth,
> unified identity, full-website scope), which carried into the new plan. Read
> BUILD-STATUS first.
>
> **Phase-A progress (2026-07-18, branch `feat/enterprise-s0-p0`):** Phase 0 (server boots) long
> done — the backend is now a **15-domain** control plane under `backend/src/domains/*` with a thin
> 28-line `server.ts` → `bootstrap.start()` and **15 truthful health sources** (tsc 0, ~1462 tests).
> The BACKEND half of Phase A is **shipped**: in-process Better Auth owned by the backend, one config
> in `packages/auth` consumed only by the backend, unified `user`/`session`, **DB-backed `sk_` keys**
> (out of the filesystem JSON store), zero `APP_API_URL` delegation. WEBSITE half in progress: the
> full site is RECONCILED back into main `app/`, `/api/auth/[...all]` now PROXIES the backend, and the
> **backend auth seam** (`RECODER_AUTH_BACKEND_SEAM`, `app/lib/auth-backend-seam.ts`, OFF by default)
> plus an **idempotent `users→user` backfill migration**
> (`app/prisma/migrations/20260718000000_backfill_singular_identity.sql`) are written. **The migration
> is written but NOT yet run on prod** (owner-gated runbook: backup → migrate `recoder_main` → verify
> counts → sso/device e2e → then delete the compat bridge); the raw-SQL compat bridge is KEPT until
> then. Remaining Phase-A slices: flip the server-side session READS onto the backend seam; run the
> backfill; Next 15.4.11→15.5.x security bump (needs install+build); Dockerfile.production restore
> decision; stale root ecosystem.config.js still lists removed pm/agency/agents surfaces.

> **Where we are.** The shell fusion is done: Wave is now `apps/desktop` (Electron+React `app/`,
> Go `server/`, Preact `cockpit/`), engines live under `backend/engines/{py,rust}` +
> `apps/desktop/{server/engines,engines}`, and the desktop embeds and supervises the ONE
> Node/Express control plane (`backend/`, `recoder-backend`) as a child process. See
> [RECODER-ARCHITECTURE.md](./RECODER-ARCHITECTURE.md) for the layer stack.
>
> **This doc** plans the next epoch: making that backend the real **spine** — the single owner of
> auth + data, the single host of the social gateways, and the single governed path every engine
> reaches the desktop through. Grounded in a 2026-07-15 investigation of the live code.

---

## North star (the two inspirations)

**conductor.build** — the closest competitor. A Mac app that runs parallel Claude Code / Codex /
Cursor agents, each in an isolated git worktree, with a unified dashboard, review-diff-ship-PR flow,
GitHub + Linear integrations, multi-model compare, checkpoints, and per-repo setup scripts. Two
lessons that shape this plan:
1. **The app is free because it reuses the user's existing agent auth** (Claude Pro/Max/API). Our
   auth must ride the user's existing login gracefully, not erect a second account wall in front of
   the terminal.
2. **The workspace IS the unit** — one isolated worktree per stream of work, reviewed and merged on
   its own schedule. We already have this (conductor + tmux + worktrees); the spine must serve it.

**Cursor** — fork a base, own the layers above it. We did this at the shell level (Wave→desktop).
The moat conductor and Cursor do NOT have is the **owned backend spine**: memory, governance gate,
retrieval, inference gateway, issue-graph, and social connectors. Phases A–C below turn that spine
from "scattered but present" into "the single thing desktop and website both stand on."

---

## Current reality (grounded, honest)

> **Note (2026-07-18):** this table captured the 2026-07-15 pre-build state. The comprehensive
> backend has since SHIPPED — the "does not boot / delegates auth / route-only engines" gaps below
> are CLOSED. Truth-now is folded into each row's right column; see BUILD-STATUS for the canonical
> summary.

| Area | Truth today | Status now |
|---|---|---|
| **Backend** | ONE Node/Express app `backend/` (`recoder-backend`). No Python backend (the `db.py`/SQLAlchemy memory is stale; only `backend/engines/py/mem0` has a `db.py`). | ✅ **Boots.** The unbootable v1 `server.ts` was replaced by a thin 28-line `server.ts` → `bootstrap.start()`; the app is now **15 domains under `backend/src/domains/*`** (`src/` = `bootstrap/ domains/ http/ shared/ + logger.ts + server.ts`), tsc 0, boots with **15 truthful health sources**, ~1462 tests. |
| **Auth** | Backend-owned. | ✅ **Unified.** The backend OWNS Better Auth (one config in `packages/auth` consumed only by the backend), reads the DB directly (no `APP_API_URL/verify-token` hop), unified `user`/`session` (+ `user_cli_link`, never dropping `users`), and **DB-backed `sk_` keys** (out of the filesystem JSON store). Website website consumes it over the shared `.recoder.xyz` cookie via the `/api/auth/[...all]` proxy. Compat bridge (`packages/auth/src/session.ts`) KEPT until the prod backfill runs. |
| **Desktop auth** | Same `backend` binary, embedded. Local access via a DB-minted `sk_` key + Wave `X-AuthKey`; cloud identity via device-flow to `recoder.xyz`. | ✅ On the unified identity domain (`backend/src/domains/identity`); `sk_` mint rewritten over the DB-backed store. |
| **Social** | The embedded backend hosts the connectors, now the `social` domain. | ✅ **Folded.** `apps/social` collapsed into the one embedded backend; the social domain serves **`/api/social`** (channels + webhooks; NOT `/api/connectors`). `apps/` = desktop only. Remaining: Discord inbound wiring; public-URL ingress for LINE/Slack webhooks behind NAT. |
| **Engines** | Reached through ONE governed path: agent `.mcp.json` → stdio bridge → **`POST /api/mcp/tools/:server/:tool/call`** → interop/governance gate (authorize→risk→execute→audit) → in-proc engine router / external stdio PAL. | ✅ **The governed MCP HTTP edge is LIVE** (was 404). Every subject-bearing MCP tool binds identity to the host-authorized `McpToolCaller` (cross-tenant class closed). Engines are DEEP OSS modules (`backend/src/domains/engines` + `backend/engines/{py,rust}`), spawned on boot and consumed by the conductor run flow. |

---

## Phase 0 — Unblock the backend (prerequisite, small) — ✅ DONE

**Resolved.** Rather than prune the 12,800-line v1 monolith, the owner drove a full comprehensive-
backend rebuild: the unbootable `server.ts` is replaced by a thin 28-line `server.ts` →
`bootstrap.start()`, and the capability surface is now **15 domains** under `backend/src/domains/*`
(agent-os, billing, cloud, conductor, edge, engines, governance, identity, inference, interop,
interop-wire, memory, observability, persistence, social). It boots with **15 truthful health
sources** (each down/degraded is honest about a missing DB/substrate/provider), tsc 0, ~1462 tests.
See [RECODER-BACKEND/BUILD-STATUS.md](./RECODER-BACKEND/BUILD-STATUS.md) for the phase-by-phase log
and [[project_backend_server_unbootable]] memory.

---

## Phase A — Auth + Data Spine (item 1: "backend owns all auth + DB for desktop and website") — ✅ BACKEND DONE / ⏳ WEBSITE IN PROGRESS

> **Status (2026-07-18):** the BACKEND half is **shipped** — backend-owned Better Auth, one config in
> `packages/auth`, unified `user`/`session` (+ `user_cli_link`), DB-backed `sk_` keys, direct-DB
> verify (no `verify-token` hop). The WEBSITE half is **in progress**: `/api/auth/[...all]` proxies
> the backend; the backend auth seam (`RECODER_AUTH_BACKEND_SEAM`, OFF by default) and the idempotent
> `users→user` backfill migration are **written but the migration is NOT yet run on prod** — the
> raw-SQL compat bridge stays until the owner-gated runbook runs it. The target architecture below is
> now largely realized; each item is annotated ✅ / ⏳.

> **Owner decisions locked (2026-07-15):**
> 1. **Backend owns the Better Auth surface.** The Node backend hosts `/api/auth/[...all]` and reads
>    the DB directly; the Next.js website proxies to it. One config, one identity authority.
> 2. **Unify into ONE identity model.** Migrate legacy plural `users`/`sessions` into Better Auth
>    `user`/`session`, delete the raw-SQL compat bridge (`packages/auth/src/session.ts:43-113`). No
>    more web-`user` vs CLI-`users` split — CLI/device/`sk_` identities live in the unified model.
> 3. **Full website in scope.** Reconcile the duplicated site copies (gutted main-tree `app/` vs the
>    full worktree copy), fix the broken Dockerfiles, and bring the site apps
>    (`recoder-web`/`recoder-agents`/`recoder-pm`/`recoder-agency`) onto the new spine.

**Goal:** the backend becomes the single identity + data authority both the desktop app and the
website consume — one Better Auth config, one identity model, one place `sk_` keys live.

**Target architecture:**
- ✅ **One Better Auth instance**, owned by the backend, reading the DB **directly** (the HTTP
  `verify-token` hop is gone). The website and every surface consume it over the shared
  `.recoder.xyz` session cookie. The two `betterAuth()` configs are collapsed into `packages/auth`'s
  `createAuth()`, consumed only by the backend.
- ⏳ **Resolve the schema drift**: Better Auth singular (`user`/`session`/`account`) is canonical and
  unified in the backend (`+ user_cli_link`). The idempotent `users→user` backfill migration is
  **written** (`app/prisma/migrations/20260718000000_backfill_singular_identity.sql`) but **NOT yet
  run on prod**; the raw-SQL compatibility bridge (`packages/auth/src/session.ts`) is **kept** until
  the owner runs the backfill runbook, after which the bridge is deleted.
- ✅ **`sk_` platform keys moved into the DB** (out of the filesystem JSON store) so they're durable,
  auditable, and visible to the website — the hash-at-rest + `API_KEY_HASH_SALT` model is preserved.
  Lives in `backend/src/domains/identity` (`api-key.service.ts`); the desktop `sk_` mint was rewritten
  over the DB-backed store.
- ✅ **Desktop rides the user's existing login** (conductor-style): the embedded backend reads the
  local session/device token when present and only mints the local `sk_` for loopback bootstrap.

**Work items (ordered):** ✅ unify the two auth configs → ⏳ migrate/retire the plural schema (backfill
migration written-not-run) → ✅ move `sk_` keys to Postgres → ✅ switch backend session-verify from
HTTP-to-app to direct-DB → ⏳ repoint the website fully onto the backend auth surface (proxy live;
server-side session READS still to flip onto the `RECODER_AUTH_BACKEND_SEAM`) → ⏳ resolve the
site-copy/Dockerfile reconciliation.

**Verification:** `scripts/sso-logout-matrix.sh`, `scripts/verify-auth-email-reset-e2e.sh`,
`scripts/verify-cli-device-flow-e2e.sh` (existing suites); cross-subdomain session on
`.recoder.xyz` from desktop + website against one backend.

**Decision points for the owner:** (1) keep or unify the web-`user` / CLI-`users` split; (2) does
the website's Next.js app keep hosting `/api/auth/[...all]` or does the backend take it over
entirely (recommended: backend owns it, app proxies).

---

## Phase B — Social gateways into desktop (item 2) — ✅ FOLDED / ⏳ INBOUND WIRING

**Goal:** the desktop app is the social hub — one connector host (the embedded backend), no separate
`apps/social` deploy, all 8 channels live.

**Status (2026-07-18):** ✅ `apps/social` is **folded** into the one embedded backend — the connectors
became the **`social` domain** (`backend/src/domains/social`), serving **`/api/social`** (channels +
webhooks). `apps/` = desktop only; the duplicated standalone deploy is gone. The single driver layer
now lives in the social domain (no more `apps/social/src/channels.ts` fork). Remaining slices are the
inbound/NAT-ingress wiring below.

**Work items:**
1. ✅ **Fold `apps/social`** — done; the social domain covers the standalone status + reply path.
2. ⏳ **Wire Discord inbound** — Discord is still send/probe-only; register the Discord event source at
   connector boot.
3. ⏳ **Public-URL ingress for LINE/Slack webhooks** from inside a desktop app on `127.0.0.1` — reuse
   a zrok-style tunnel (or a relay) so HTTP-webhook channels work behind NAT.
   Telegram/Slack-Socket/Feishu already work outbound with no tunnel.
4. ⏳ **Connector secrets** — the supervisor must pass `RECODER_CONNECTORS_*` / channel tokens into the
   spawned backend env; add a cockpit settings surface to enter them.

**Verification:** **`/api/social`** reports each channel up|down truthfully from the embedded
backend; a Telegram/Slack inbound message opens a real conductor workspace end-to-end.

---

## Phase C — Engine connectivity (item 3: "how engines connect to the desktop app") — ✅ SPINE LIVE

**Goal:** every engine reaches the desktop through the one governed MCP-host spine; close the
route-only and disconnected gaps.

**Status (2026-07-18):** the **governed MCP HTTP edge `POST /api/mcp/tools/:server/:tool/call` is
LIVE** (it was returning 404 before the rebuild). It routes through the interop/governance gate
(authorize→risk→execute→audit) into the in-proc engine router or external stdio PAL, and every
subject-bearing MCP tool binds identity to the host-authorized `McpToolCaller` at the trust boundary
(the cross-tenant class is closed: non-privileged caller → own subject, foreign → 403, admin/internal
→ arbitrary, absent → `AUTH_REQUIRED`). Engines are DEEP OSS modules (`backend/src/domains/engines` +
`backend/engines/{py,rust}`), spawned on boot and consumed by the conductor run flow.

**The spine is the single contract** — `.mcp.json` (stdio bridge) → `POST /api/mcp/tools/:server/:tool/call`
→ governance gate → in-proc engine router or external stdio PAL. Adding an engine = the wiring
checklist (register the server, write `register<X>McpTools`, wire it into the router; the gate wraps
it automatically).

**Work items:**
1. ✅ **mem0 → MCP tool.** Memory is a real domain (`backend/src/domains/memory`): mem0 with the
   `google`/Gemini embed default, a lance embedded `VectorStorePort`, colbert real MaxSim rerank, a
   real qdrant liveness probe, and forget/harvest — plus an `inference.embed` MCP tool and the
   OpenAI-compatible `/api/gateway/inference/v1/embeddings` edge. The conductor run flow recalls
   memory (mem0 ∪ beads ∪ colbert) on launch and harvests on complete.
2. ⏳ **multica ↔ coordination fusion.** Back the `coordination` lock store with the Go multica engine
   so squad/leader-routing is real (needs PG15+ locally; prod PG17 fine) — still open.
3. ✅ **ziti + recoder-xds** — cloud/teams-tier infra (the `cloud` domain: sandboxes/previews/tenancy/
   mesh with a GovernanceGate on every write, fleet heartbeat, custom-domains + DNS/TLS verifier), not
   agent tools.
4. ✅ **openclaw** — the connectors package host behind the `social` domain (Phase B), not a stranded
   service.
5. ✅/⏳ **Native-first bindings**: the tensorzero release `.node` ships with REAL in-proc SSE via
   `inferenceStream` (the napi ladder: in-proc → supervised loopback → direct BYOK rung-3 multi-
   provider router, BYOK keys resolved from the governance secrets vault); openfang runtime
   dispatchability is wired via env injection.

**Verification:** `pnpm test:contracts:agent-os`, `pnpm test:evals:agent-os`; an agent in a workspace
calls `memory.*` / inference tools and they hit the real engines (not stubs).

---

## Sequencing & risks

```
Phase 0 (unblock server.ts)  ──►  Phase A (auth+data spine)
                                        │
                             ┌──────────┴──────────┐
                             ▼                      ▼
                    Phase B (social → desktop)   Phase C (engine connectivity)
```

- **Phase 0 was the hard gate** — ✅ cleared: the backend boots (15 domains, 15 truthful health
  sources), so end-to-end verification of A/B/C is now possible.
- **Phase A is the highest-leverage and highest-risk** (auth is a release gate per AGENTS.md; the
  `user`/`users` split and cross-subdomain sessions are load-bearing). The backend half is shipped;
  the remaining risk is the **prod `users→user` backfill (written but not run)** — run it behind the
  existing verification scripts, not by hand.
- **Phases B and C are independent** of each other and can run in parallel once A lands (both only
  need a booting, auth-correct backend).
- **Disk constraint** (near-full APFS) — prune the store before big rebuilds; prefer moves over
  reinstalls.
- **Honesty invariant** — every phase reports truthful health; no faked `200`s. The backend's own
  boot state is the first thing that must stop lying (Phase 0).

---

## Open decisions

**Resolved (2026-07-15):** backend owns `/api/auth/[...all]`; one unified identity model (no
web/CLI split); full website in scope. See the Phase A decision box.

**Resolved (2026-07-18):** the `server.ts` capability surface question is settled — the owner drove a
full rebuild to **15 domains** (agent-os, billing — MoR Polar/Creem/Paddle/Dodo, no Stripe —, cloud,
conductor, edge, engines, governance, identity, inference, interop, interop-wire, memory,
observability, persistence, social). `sk_` keys are DB-backed in the identity domain.

**Still open (owner-gated):**
1. **Run the `users→user` backfill migration** on prod (backup → migrate `recoder_main` → verify
   counts → sso/device e2e → then delete the compat bridge). The migration is written but not run.
2. Flip the website's server-side session READS onto the backend seam (`RECODER_AUTH_BACKEND_SEAM`),
   currently OFF by default.
3. Next 15.4.11→15.5.x security bump (needs `pnpm install` + build; disk is APFS-critical).
