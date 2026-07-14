# Recoder — Next Phase Plan: The Backend Spine

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

| Area | Truth today | Key drift / gap |
|---|---|---|
| **Backend** | ONE Node/Express app `backend/` (`recoder-backend`, entry `backend/src/server.ts`). No Python backend (the `db.py`/SQLAlchemy memory is stale; only `backend/engines/py/mem0` has a `db.py`). | `server.ts` imports ~47 modules the owner deliberately deleted in `a2203e127` — **it does not boot today**. Prune those imports (do NOT restore the files). |
| **Auth** | Source of truth = the Next.js app on `recoder_main` via Better Auth `/api/auth/[...all]`. Backend **delegates** — verifies sessions over HTTP to `APP_API_URL/api/auth/verify-token` (`server.ts:592-656`). | **Two** Better Auth configs (`packages/auth/src/index.ts` `createAuth` on `authDatabase` vs `app/lib/auth-config.ts` `betterAuth` on the main Prisma client) hand-synced. **Two** identity schemas in one DB (`user`/`session` vs legacy `users`/`sessions`; drift bridge in `packages/auth/src/session.ts:43-113`). `sk_` platform keys live in a **filesystem JSON store**, not a DB. |
| **Desktop auth** | Same `backend` binary, embedded. Local access via a minted `sk_` key (`conductor/mint-conductor-key.ts`) + Wave `X-AuthKey`; cloud identity via device-flow to `recoder.xyz`. | Cloud session verification couples the embedded backend to `recoder.xyz` being reachable. |
| **Social** | The embedded backend **already hosts connectors** (`startConnectors()` at `server.ts:14445`, `/api/connectors` + `/api/connectors/webhook/:channel`). 8 channels via `@recoder/connectors` (at `apps/desktop/engines/openclaw`). | `apps/social` is a **redundant standalone deploy** (a strict subset — no conductor dispatch, no webhook, no interop gate). Its `channels.ts` duplicates `backend/src/connectors/channel-adapters.ts`. Discord WS source unwired; LINE/Slack webhooks need a public URL. |
| **Engines** | Reached through ONE governed path: agent `.mcp.json` → stdio bridge → `POST /api/mcp/tools/:server/:tool/call` → interop gate (authorize→risk→execute→audit) → in-proc engine router / external stdio PAL. Desktop reaches engines **through** the embedded backend. | Route-only (not agent tools): mem0, multica, ziti, dmux. Disconnected from the runtime: `recoder-xds` (infra only), `openclaw` (separate service, not fused into the MCP host). multica↔coordination fusion open. |

---

## Phase 0 — Unblock the backend (prerequisite, small)

**Nothing below matters until `backend/src/server.ts` boots.** It imports ~47 deleted modules
(owner-driven deletion `a2203e127`). Fix = **prune** the dead imports + the code paths that used
them, trimming `server.ts` to the kept surface (9 folders + a2a). This is a scoping decision only
the owner can anchor — which capabilities stay vs go. See
[[project_backend_server_unbootable]] memory. Verification: `tsx src/server.ts` reaches health-200
(or a truthful env blocker like "no local Postgres"), not a module-resolution crash.

**Owner input needed:** confirm the target capability surface for `server.ts` so pruning removes the
right things (e.g. keep conductor + agent-os + connectors + gateway + mcp; drop the deleted
billing/enterprise/lsp/public-api/etc. lanes, or re-add specific ones deliberately).

---

## Phase A — Auth + Data Spine (item 1: "backend owns all auth + DB for desktop and website")

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
- **One Better Auth instance**, owned by the backend, reading the DB **directly** (drop the
  backend's HTTP `verify-token` hop to the Next.js app). The website and every surface consume it
  over the shared `.recoder.xyz` session cookie + `@recoder/auth/edge` (already the shared cookie
  contract). Collapse the two `betterAuth()` configs into `packages/auth`'s `createAuth()`.
- **Resolve the schema drift**: pick Better Auth singular (`user`/`session`/`account`) as canonical,
  migrate the legacy plural `users`/`sessions` data, then delete the raw-SQL compatibility bridge
  (`packages/auth/src/session.ts:43-113`). Keep the **deliberate** web-`user` vs CLI-`users`
  identity split only if the owner still wants it (decision point).
- **`sk_` platform keys move into the DB** (out of the filesystem JSON store,
  `backend/src/public-api/api-keys.ts` + `persistence`) so they're durable, auditable, and visible
  to the website — while keeping the hash-at-rest + `API_KEY_HASH_SALT` model.
- **Desktop rides the user's existing login** (conductor-style): the embedded backend reads the
  local session/device token when present and only mints the local `sk_` for loopback bootstrap.

**Work items (ordered):** unify the two auth configs → migrate/retire the plural schema → move `sk_`
keys to Postgres → switch backend session-verify from HTTP-to-app to direct-DB → repoint the website
onto the backend auth surface → delete the gutted main-tree `app/` remnant vs full worktree copy
duplication (fix the broken `app/Dockerfile` referencing missing `app/package.json` +
`packages/database/`).

**Verification:** `scripts/sso-logout-matrix.sh`, `scripts/verify-auth-email-reset-e2e.sh`,
`scripts/verify-cli-device-flow-e2e.sh` (existing suites); cross-subdomain session on
`.recoder.xyz` from desktop + website against one backend.

**Decision points for the owner:** (1) keep or unify the web-`user` / CLI-`users` split; (2) does
the website's Next.js app keep hosting `/api/auth/[...all]` or does the backend take it over
entirely (recommended: backend owns it, app proxies).

---

## Phase B — Social gateways into desktop (item 2)

**Goal:** the desktop app is the social hub — one connector host (the embedded backend), no separate
`apps/social` deploy, all 8 channels live.

**Target:** collapse `apps/social` into `backend/src/connectors/` (the richer path — it already does
conductor-workspace dispatch + webhook ingress + the `@recoder/interop` signed gate + an embedded
reply agent). Delete the duplicated driver layer (`apps/social/src/channels.ts` →
`backend/src/connectors/channel-adapters.ts` is the single source).

**Work items:**
1. **Fold `apps/social`** — port its only unique bit (standalone status server + embedded pi reply)
   into the backend if not already covered by `gateway.ts runEmbeddedAgent`, then delete the app.
2. **Wire Discord inbound** — call `registerDiscordEventSource(...)`
   (`backend/src/connectors/discord-event-source.ts:48`) at connector boot; today nothing does, so
   Discord is send/probe-only.
3. **Public-URL ingress for LINE/Slack webhooks** from inside a desktop app on `127.0.0.1` — reuse
   `backend/src/a2a/zrok-agent-tunnel.ts` (or a relay) so HTTP-webhook channels work behind NAT.
   Telegram/Slack-Socket/Feishu already work outbound with no tunnel.
4. **Connector secrets** — the supervisor (`emain-backend-core.ts assembleBackendEnv`) must pass
   `RECODER_CONNECTORS_*` / channel tokens into the spawned backend env; add a cockpit settings
   surface to enter them.

**Verification:** `/api/connectors` reports each channel up|down truthfully from the embedded
backend; a Telegram/Slack inbound message opens a real conductor workspace end-to-end.

---

## Phase C — Engine connectivity (item 3: "how engines connect to the desktop app")

**Goal:** every engine reaches the desktop through the one governed MCP-host spine; close the
route-only and disconnected gaps.

**The spine is already correct** — keep it as the single contract:
`.mcp.json` → `mcp/recoder-a2a-server.js` (stdio) → `POST /api/mcp/tools/:server/:tool/call` →
interop gate → `buildInProcEngineRouter` (in-proc engine) or external stdio PAL. Adding an engine =
the wiring checklist: register in `IN_PROC_SERVERS` (`agent-os/mcp/interop-host.ts:63`) +
`ENGINE_SERVERS` (`agent-os/mcp/inproc-engines.ts:300`), write `register<X>McpTools`, call it in
`buildInProcEngineRouter`, and the gate wraps it automatically.

**Work items (close the gaps):**
1. **mem0 → MCP tool.** It's route-only + prompt-injection today; expose the memory search/remember
   verbs as first-class agent MCP tools (the `memory` server exists — back it with the real
   mem0-client path, not just the store adapter).
2. **multica ↔ coordination fusion.** The `coordination` MCP port defaults to an in-memory lock
   store; back it with the Go multica engine (`multica-client.ts`) so squad/leader-routing is real —
   the documented-but-open gap.
3. **ziti + recoder-xds** — leave as cloud/teams-tier (correctly deferred); document them as
   infra-only, not agent tools, so they stop reading as "disconnected."
4. **openclaw** — it's the social foundation (Phase B), not an MCP engine; formally mark it as the
   connectors package host, not a stranded service.
5. **Native-first bindings** where they pay off: tensorzero `stream()` (feeds Phase's AI panel
   SSE), openfang runtime dispatchability (the `ConductorRuntimeId` closed-union blocker).

**Verification:** `pnpm test:contracts:agent-os`, `pnpm test:evals:agent-os`; an agent in a workspace
calls `memory.*` and `coordination.*` tools and they hit the real engines (not stubs).

---

## Sequencing & risks

```
Phase 0 (unblock server.ts)  ──►  Phase A (auth+data spine)
                                        │
                             ┌──────────┴──────────┐
                             ▼                      ▼
                    Phase B (social → desktop)   Phase C (engine connectivity)
```

- **Phase 0 is a hard gate** — no end-to-end verification of A/B/C is possible until the backend
  boots. It's small but needs the owner's capability-surface decision.
- **Phase A is the highest-leverage and highest-risk** (auth is a release gate per AGENTS.md; the
  `user`/`users` split and cross-subdomain sessions are load-bearing). Do it behind the existing
  verification scripts, not by hand.
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

**Still open:**
1. **Phase 0:** confirm the target `server.ts` capability surface — which deleted lanes stay pruned
   vs get deliberately re-added. Proposed default: keep conductor + agent-os + MCP host + connectors
   + gateway + a2a; drop the deleted billing/enterprise/lsp/public-api/deployment/fleet lanes unless
   named. (Some — like `public-api` for `sk_` keys — Phase A may re-introduce in DB-backed form.)
