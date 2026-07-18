# Recoder Master Gap Audit

Date: 2026-07-17 · Branch: `feat/enterprise-s0-p0` · Sources: 23 parallel doc-vs-code audits + build/boot check
Build health: `tsc --noEmit` = 0 errors · server boots clean on :3719 · `/health` = 200 `degraded` (truthful, no DB) · clean shutdown.

---

## 2026-07-18 CLOSURE

> **Status: closed.** The gaps this audit measured on 2026-07-17 (the product sat at
> ~60–65% of the documented surface) have been driven to near-doc-completeness on
> branch `feat/enterprise-s0-p0`. Everything below §1–§4 is preserved verbatim as the
> historical record of the 2026-07-17 gap state; this header records how it was closed.

**What closed it:** the P0/P1/P2 build waves (plus the interop + Phase-A slices) closed
the audited feature gaps, and nine hardening rounds — six of them an adversarial
cross-tenant authorization review — closed a systemic security class. Net:

- **Backend near-doc-complete.** The waves shipped the documented seams the audit found
  composed-but-unwired or unstarted: real in-proc tensorzero SSE + BYOK/rung-3 inference +
  `/v1/embeddings`; the governed **MCP HTTP tool-call edge** `POST /api/mcp/tools/:server/:tool/call`
  (was 404, now LIVE); agent-os Postgres state-of-record + full CRUD + squad autopilots;
  steer send-keys + conductor stop/advance/attention/tmux control-mode; github/browser
  handlers; ed25519 A2A ingress; cloud governance; lance embedded memory; social run-flow
  bridge; and P2 **billing metering emitters** so quotas actually decrement.
- **Cross-tenant security class closed.** The new MCP write tools initially resolved
  tenant/subject from caller-supplied args (cross-tenant quota drain, spend misattribution,
  sandbox provision/destroy, memory read/forget, audit/billing disclosure, `identity_link`
  hijack across ~26 tools). Every subject-bearing tool is now bound to the host-authorized
  `McpToolCaller` at the MCP edge trust boundary; convergence verified by exhaustive
  enumeration (only pure-infra MCP files remain caller-free).
- **Integration bugs fixed** en route (fresh-DB migration `splitStatements` landmine;
  dev-mint-conductor-key rewired onto the DB-backed `sk_` store; the approval-clearance /
  A2A-admission fail-closed hardening from the in-flight branch, now landed).
- **Verified green:** `tsc` 0 · ~1462 backend tests · boots with 15 truthful health sources.

**Wave backlog — done vs owner-gated:**

- **Done (Waves 0–8, 10, and the wired half of 9):** in-flight branch landed; packaging &
  native-desktop runtime; bootstrap seam wiring; inference depth; agent-os durability &
  edges; github module; terminal/conductor depth; governance/billing/cloud/interop edges;
  memory & browsing; cockpit approve/reject. See
  [RECODER-BACKEND/BUILD-STATUS.md](./RECODER-BACKEND/BUILD-STATUS.md#2026-07-18--doc-gap-closure--security-hardening-branch-featenterprise-s0-p0)
  for the per-wave commit trail.
- **Remaining — owner-gated (need prod access or an owner decision, deliberately NOT run):**
  1. **Prod `users → user` migration run** — execute the backfill runbook against
     `recoder_main` (backup → migrate → verify counts → sso/device e2e → then delete the
     compat bridge). Idempotent migration is written; running it on production data is the
     owner call.
  2. **`COMPOSIO_API_KEY` rotation** — was hardcoded in `ecosystem.config.js` and is exposed
     in git history; code now reads `process.env`, but the key itself must be rotated.
  3. **Next `15.4.11 → 15.5.x` security bump** — needs a `pnpm install` and the box's APFS
     disk is near-critical.

The §4 stale-doc corrections have been applied across the reconciled doc set.

---

## 1. Executive summary — how far is the product from the docs' full version?

**The spine is real; the wiring and the package are not.** The greenfield 15-domain backend the docs mandate is BUILT: it typechecks clean, boots, composes 15 domain modules, and the core product loop (create workspace → tmux/openfang run → review → merge, governed + audited) works in dev. Roughly **~60–65% of the documented surface exists as code**; the remaining distance clusters into four shapes:

1. **Packaged desktop is broken for native inference (P0 cluster).** electron-builder copies `tensorzero_gateway_napi.node` from `crates/target/release/` which does not exist (only `debug/` — verified), there are no fail-loud packaging gates, beads/multica/recodergit/py-sidecars aren't in extraResources, and desktop never injects openfang config/keys. A packaged app ships with dead inference and dead memory.
2. **Composed-but-unwired seams (the biggest count of P1s).** Dozens of capabilities are fully implemented behind optional deps that `bootstrap/index.ts` deliberately never injects, so they "fail truthfully" forever: social→conductor dispatch, reply agent, channel monitors, signals→board, alert delivery, cloud RunEvents, billing auth-plan/BYOK resolvers, identity governance gates, A2A localRun dispatch, ingress verifier, pal externalCall, steer send-keys transport, daytona/ssh substrates. This is one serialized wiring pass at the composition root, not N features.
3. **Whole modules never started.** SQUADS autopilots + board, workflow service/routes, custom domains + DNS/TLS, pr-swarm-review, browser open/snapshot/verify handlers (catalog-advertised, 404 on call), direct-provider inference rung 3, dmux's pane/layout brain, planConductorRun.
4. **Durability + contract gaps.** agent-os control plane runs on an in-memory store every boot (tasks/runs/approvals vanish on restart despite migrations existing); BYOK key material never reaches inference; billing metering has zero writers so quotas never decrement; the documented `POST /api/mcp/tools/:server/:tool/call` HTTP contract the stdio bridge calls is unmounted.

Raw findings: ~100 gaps + 16 stale-doc entries → deduplicated to **~70 distinct gaps: 5 P0, ~27 P1, ~27 P2, ~11 P3**, plus a stale-docs correction pass. All 5 P0s were spot-checked against the cited files and confirmed.

---

## 2. In-flight working-tree verdict: **finish and commit it FIRST (Wave 0)**

The uncommitted `feat/enterprise-s0-p0` diff (~971 insertions / 31 files) is a coherent, **complete and green** fail-closed hardening round (A2A rpc admission, approval clearance sealed into the Merkle chain, connector-secret env fallback, inference feedback loop, memory-lifecycle truthfulness, mesh truthful-degrade): 116/116 tests pass across all touched suites, tsc clean, boots. It directly advances several audited gaps (approval clearance, A2A admission). **Do not start new gap work on top of an uncommitted 31-file diff.**

Pre-commit checklist (blockers):
- [ ] `package.json` — remove ~12 dangling scripts referencing deleted `tools/a2a-interop/`, `recoder-skill/`, `tools/evals/` (`phase3:*`, `a2a:smoke:*`, `a2a:bridge:start`, `issues:sfa:*`, `project:sfa:*`, `connectors:tier2:*`, `test:tier1/tier2:*`).
- [ ] `docs/RECODER-BACKEND/ARCHITECTURE.md` — strip the accidentally pasted Claude-session terminal output at the top of the file.
- [ ] `backend/.env.capabilities.recoder-server` — env-shaped and untracked; verify no secrets before any commit.
- [ ] `git add` the untracked REAL source: `rpc-admission.middleware.ts`, 5 new test files, `docs/RECODER-BACKEND/ENGINE-INTEGRATION.md`, `packages/substrate/src/command/is-in-process-runtime.ts`, `shared/src/a2a/adapters/`.
- [ ] Deletions are deliberate v1-cruft cleanup — do NOT restore; do not commit `data/*` runtime-state deletions accidentally split from the source commit.
- [ ] Optional: one backend-wide `vitest` + `pnpm check-types` pass before push.

---

## 3. Deduplicated, prioritized backlog (waves = parallel build workflows)

Concurrency rule (per `docs/RECODER-BACKEND/BUILD-STATUS.md`): parallel waves never touch `backend/src/bootstrap/*`. **Wave 2 is the single serialized owner of `bootstrap/index.ts`**; Waves 1 and 3–10 are mutually independent file surfaces and can run in parallel (start any of them alongside Wave 2 as long as their bootstrap hookup lands via Wave 2's queue).

### Wave 0 — Land the in-flight branch (prereq, serialized)
| Item | Pri | Effort | Files |
|---|---|---|---|
| Commit `feat/enterprise-s0-p0` after pre-commit checklist above | P0 | small | package.json, docs/RECODER-BACKEND/ARCHITECTURE.md, untracked source |

### Wave 1 — Packaging & native desktop runtime (P0 cluster) — `apps/desktop/**`, `backend/engines/rust/**`, CI
| Item | Pri | Effort | Notes / merged from |
|---|---|---|---|
| Build release `-p tensorzero-gateway-napi` + fail-loud extraResources gate (CI fails on missing artifact) | P0 | medium | ENGINE-INTEGRATION (2 findings merged: release build + Phase 0 CI gates). Verified: only `crates/target/debug/` exists; config.cjs:109 points at `release/` |
| Desktop env injection for openfang real turns (configPath + BYOK/tensorzero keys) + runtime='openfang' selection surface | P0 | medium | ENGINE-INTEGRATION |
| Package beads `bd` binary (185MB) or slim build into extraResources (avoid DB-incompatible PATH bd) | P1 | medium | ENGINE-INTEGRATION |
| Packaged memory decision: bundle/point python for mem0 + inject Qdrant/embedder keys (or adopt lance path from Wave 8) | P1 | large | ENGINE-INTEGRATION (brain-memory packaging half) |
| Supervisor passes connector secrets into spawned backend (`assembleBackendEnv`) | P2 | medium | NEXT-PHASE B4 (backend half; cockpit UI in Wave 10) |

### Wave 2 — Bootstrap seam wiring (SERIALIZED — sole owner of `backend/src/bootstrap/index.ts` + composer arg changes)
| Item | Pri | Effort | Notes / merged from |
|---|---|---|---|
| Wire live steer send-keys transport (tmux substrate → ConductorComposer); un-refuse `steerWorkspace` | P0 | medium | terminal.md + conductor-terminal.md. Verified: conductor-module.ts:368-379 always returns ok:false |
| Wire social seams: ConductorDispatchPort + target resolver, ReplyInferencePort, start channel monitors (5 long-poll channels), SignedVouch, SecretVaultResolver | P1 | medium | 6 findings merged (RECODER-MODULES SOCIAL, social.md ×4, ENGINE-INTEGRATION openclaw) — the doc's headline Telegram→run flow |
| Wire signals: publish supervised ops-recorder URL to observability + inject runEvents/board seams + AlertNotifier delivery | P1 | medium | 3 findings merged (signals.md, observability-ops.md) |
| Wire billing seams: resolveAuthPlan + resolveByok + billingPort into module (max(plan) + isBYOK real at runtime) | P1 | medium | billing-metering.md |
| Late-bind GovernanceGate into ApiKeyService/OrgService (identity writes currently ungated) | P1 | medium | identity-auth.md |
| Wire interop: conductor localRun dispatch adapter + remoteSender; inject IngressVerifier into extAuthzGuard | P1 | medium | 2 findings merged (communication.md, governance.md) — A2A dispatch + ext_authz currently 503-only |
| Inject pal externalCall transport (ExternalMcpProcessManager → PalMcpAdapterDeps); consensus/thinkdeep reachable | P2 | medium | 2 findings merged (communication.md, ENGINE-INTEGRATION) |
| Register daytona + ssh substrates; bridge cloud SandboxProvider into conductor substrate registry | P1 | large | 2 findings merged (terminal.md, networking.md) — remote execution unreachable today |
| Wire cloud CloudRunEvent → agent-events outbox bridge (events currently dropped) | P2 | small | networking.md |
| Set `enforceWiring: true` in production for the MCP wiring-checklist guard | P2 | small | agent-engine.md |
| Bind conductor launch path to `pal.plan()` (runtime/risk/approval planning) | P2 | medium | 3 findings merged (COMMUNICATION, routeModel/escalate, planConductorRun) — design first |

### Wave 3 — Inference domain — `backend/src/domains/inference/**` (+ engines napi adapter)
| Item | Pri | Effort | Notes / merged from |
|---|---|---|---|
| napi EmbeddedGateway `stream()` binding (real SSE in-process; today loopback-only, verified :116-122) | P0 | medium | RECODER-ARCHITECTURE |
| Rung 3: direct BYOK multi-provider router (OpenAI/OpenRouter/Groq/Anthropic/Ollama) — provider-key-only users currently get 503 | P1 | large | inference-gateway.md |
| BYOK resolution into delivery path (keyCache.get has zero callers; upsert unreachable; add key-store route) | P1 | large | inference-gateway.md |
| Embed edge: POST /v1/embeddings + MCP `inference.embed` + wire memory/colbert consumers | P1 | medium | 2 findings merged |
| Close DB-catalog → tensorzero.toml generation loop (generateConfig has no caller; napi still boots from env TENSORZERO_MODELS) | P2 | medium | inference-gateway.md |
| GovernanceGate.decide() on completions + interop chain on HTTP edges | P2 | medium | inference-gateway.md |
| Emit inference.completed/failed RunEvents to agent-events outbox | P2 | small | inference-gateway.md |
| Bind `tensorzero-loopback` daemon adapter in engines composer (or retire the ENGINE_ID) | P2 | small | agent-engine.md |

### Wave 4 — Agent OS durability & edges — `backend/src/domains/agent-os/**`
| Item | Pri | Effort | Notes / merged from |
|---|---|---|---|
| Internal ingest edges: POST steps, runtime-evidence, outbox/drain (only /internal/events exists — verified) + align mount prefix | P0 | medium | agent-os-control-plane.md |
| Postgres state-of-record repository (migrations exist; every boot is in-memory → state lost on restart) | P1 | large | agent-os-control-plane.md |
| Full /api/agent-os CRUD edge table (tasks/runs/artifacts/spaces/agents/instructions/policies + GET /events) | P1 | large | agent-os-control-plane.md |
| Squads HTTP surface + pg SquadStore + consume @recoder/coordination squad-dispatch + route multica through engines.client | P2 | medium | 3 findings merged (squads.md, ENGINE-INTEGRATION multica ×2) |
| Squad autopilots (cron/webhook → beads issue → conductor run) + cockpit board feed | P1 | large | 2 findings merged (RECODER-MODULES SQUADS missing, squads.md autopilots) |
| Workflow definitions CRUD + run dispatch (@recoder/workflow-engine driver) | P2 | large | squads.md |

### Wave 5 — GitHub module — `backend/src/domains/engines/**` (github), `conductor/review/*`
| Item | Pri | Effort | Notes / merged from |
|---|---|---|---|
| Bind github.*/repo.* MCP handlers (tools advertised in catalog, 404 on call) | P1 | medium | github.md |
| pr-swarm-review wired into post-run delivery gate (+ PolyForm-Noncommercial license gate) | P1 | large | 3 findings merged (RECODER-MODULES GITHUB, github.md ×2) |
| Unified GitHubModule composer + single GitHubHealth {recodergitLib, gh} | P1 | medium | 2 findings merged |
| comment(pr) via gh + search (repo/github) | P2 | medium | 2 findings merged |
| recodergit: default-on decision for RECODER_CODE_GRAPH_ENABLED + bundle dist + claude-plugin distribution | P2 | medium | 2 findings merged |

### Wave 6 — Terminal/conductor depth — `backend/src/domains/conductor/**`, `packages/substrate/**`
| Item | Pri | Effort | Notes / merged from |
|---|---|---|---|
| tmux control-mode adapter (real-time %output; today poll-delta tailer; tmuxControlMode is a dead flag) | P1 | medium | conductor-terminal.md |
| Attention classifier (needs_you/working/idle) populating WorkspaceView.attention | P1 | medium | 2 findings merged (dmux heuristics) |
| POST /workspaces/:id/stop (no way to stop a RUNNING agent over HTTP) + /advance | P1 | small | conductor-terminal.md |
| Per-worktree .mcp.json injection (Recoder toolbelt into launched agents) | P2 | small | conductor-terminal.md |
| dmux deep fusion: pane model, LayoutCalculator/OperatorGrid, unify Go durable-shell sessions | P2 | large | 2 findings merged (RECODER-MODULES TERMINAL, terminal.md composer) — design decision first |
| Conductor MCP write tools (workspace create/merge/diff/events) | P2 | small | conductor-terminal.md |

### Wave 7 — Governance, billing, cloud, interop edges — `domains/{governance,billing,cloud,interop-wire}/**`, `http/openapi`
| Item | Pri | Effort | Notes / merged from |
|---|---|---|---|
| Restore governed MCP HTTP edge: POST /api/mcp/tools/:server/:tool/call (+ /servers, /call, restart, /internal/engines/health) — stdio bridge targets it, backend never mounts it | P1 | medium | 3 findings merged (NEXT-PHASE spine contract, ARCHITECTURE, agent-engine.md) |
| ed25519 envelope verify on A2A ingress (HMAC-only today; packages/interop/ed25519 unused; public_key column never checked) | P1 | medium | 3 findings merged (communication.md, governance.md ×2) |
| Billing metering emitters (conductor per-run, inference per-token, engines) + POST /internal/billing/meter — quotas never decrement today | P1 | medium | billing-metering.md |
| GovernanceGate on cloud writes (sandbox/deploy mutations auth-only today) + cloud.routes test | P1 | medium | 2 findings merged (networking.md) |
| GovernanceGate on billing + social HTTP writes | P2 | medium | 2 findings merged |
| A2A: first/quorum dispatch strategies + handoff route/ContextBridge.handoff + write MCP tools (send_task/respond/inbox/dispatch) | P2 | medium | 3 findings merged (communication.md) |
| Cloud: fleet heartbeat internal edge; custom domains + DNS/TLS verify routes; MCP write tools; mesh registry persistence | P2 | medium | 4 findings merged (networking.md) |
| Governance write MCP tools (decide/request_approval/acquire_lock) + HTTP edges (policies/decide, audit) + golden byte-interop vectors | P2 | medium | 3 findings merged (governance.md) |
| Mount OpenAPI doc (/api/openapi.json + /api/docs — generator is dead code) + /api/edge/routes + edge test suites + persistence /backup edge | P2 | medium | 4 findings merged (edge-api-server.md, database-persistence.md) |
| Invoice projection wiring (recordFromWebhook dead code) + billing health route + RunEvents | P2 | small | 3 findings merged |
| WS telemetry tap on upgrade-router | P3 | small | BUILD-STATUS-admitted |

### Wave 8 — Memory & browsing — `backend/src/domains/memory/**`, engines browser
| Item | Pri | Effort | Notes / merged from |
|---|---|---|---|
| browser.open/snapshot/verify handlers (catalog-advertised, external bridge calls them, they 404) + verification executor consuming @recoder/browser-verification | P1 | medium | 2 findings merged (browsing.md) |
| Adopt lance napi as embedded VectorStorePort + napi embeddings when QDRANT_URL unset (bundled .node is dead weight today) | P1 | medium | ENGINE-INTEGRATION "biggest quick win" |
| memory `forget` (module + route + MCP) | P2 | medium | memory.md |
| BrowsingModule composition: sessions/profiles, governance domain-allowlist, artifact capture | P2 | large | browsing.md |
| colbert real reranking provisioning (torch+checkpoint) or embedded cross-encoder | P2 | large | ENGINE-INTEGRATION |
| memory_promote/relate MCP tools, /internal harvest edge, GET /memory/health | P3 | small | 3 findings merged |
| browser-use consumed by run flow + packaged transport decision | P2 | large | ENGINE-INTEGRATION |

### Wave 9 — Website Phase A + identity — `app/**`, `packages/auth/**` (owner-gated)
| Item | Pri | Effort | Notes / merged from |
|---|---|---|---|
| Unify ~57 lib/auth-config session reads onto the backend seam; Next 15.5.x security bump; stale ecosystem.config.js cleanup | P1 | large | NEXT-PHASE |
| Migrate plural users/sessions, delete raw-SQL compat bridge (OWNER CALL on production data — do not run without approval) | P1 | large | NEXT-PHASE |
| Discord inbound: confirm dormant-by-design or wire event source | P2 | medium | NEXT-PHASE B2 (doc-vs-decision drift) |
| multica-backed coordination/work-lock store | P2 | medium | NEXT-PHASE C2 |

### Wave 10 — Cockpit UX — `apps/desktop/cockpit/**`
| Item | Pri | Effort | Notes / merged from |
|---|---|---|---|
| Inline approve/reject on the awaiting_approval card (display-only today — verified; approvals resolve API exists, nothing in nav calls it) | P1 | medium | PRODUCT-DESIGN — completes the branch's approval-clearance work end-to-end |
| Connector-secrets settings panel (pairs with Wave 1 supervisor pass-through) | P2 | medium | NEXT-PHASE B4 (UI half) |
| Agent-auth detection beyond PATH probe (doc §2 aspiration) — or narrow the doc | P2 | small | PRODUCT-DESIGN |

---

## 4. Stale-doc corrections (single docs pass, any time)

1. **docs/RECODER-ARCHITECTURE.md** — refresh lines 113/173-179 ("no composer boots" — false; 15 domains boot, tsc 0); depth-gap rows for openfang (:98 — now dispatchable in the ConductorRuntimeId union), mem0 (:95) and browser-use (:100 — both now supervised sidecars); correct "~30 in-proc engines" to the actual 21 (+2-3 bootstrap-added) or name the missing servers.
2. **docs/RECODER-MODULES.md** — per-module "Today (scattered)" sections + `backend/src/modules/<domain>/` composer paths superseded by `backend/src/domains/*`; pal-mcp "NOT run/supervised" now false.
3. **docs/RECODER-BACKEND/ARCHITECTURE.md + FILE-TREE.md** — remove Stripe adapter (owner mandate: MoR-only Polar/Creem/Paddle/Dodo); remove `/sync` WS + `sync.socket.ts` (collaboration cut; superseded by `/api/conductor/workspaces/:id/stream`); also strip the pasted terminal output (Wave 0).
4. **docs/RECODER-BACKEND/BUILD-ORDER.md:148** — drop `sync.socket.ts` Phase-4 deliverable.
5. **docs/RECODER-BACKEND/domains/billing-metering.md** — replace Polar+Stripe design with the shipped 4-adapter MoR registry.
6. **docs/RECODER-BACKEND/domains/a2a-interop-runtimes.md + docs/modules/communication.md** — remove per-runtime connector process routes + in-interop pi/openfang adapters (superseded by interop/interop-wire split + conductor-owned execution); communication composer path stale.
7. **docs/RECODER-BACKEND/domains/inference-gateway.md** — file-tree/route-path/migration sections describe the pre-consolidation layout (single transport adapter, one migration, /api/gateway/inference/* paths, health authed).
8. **docs/modules/squads.md** — mutating MCP tools superseded by read-only introspection posture (owner decision); if mutations are wanted it is new work.
9. **docs/modules/terminal.md + conductor-terminal.md + edge-api-server.md** — `/sync` product surface superseded by per-workspace `/stream`.
10. **docs/RECODER-BACKEND/domains/database-persistence.md** — connection-manager.ts + drivers/ (sqlite fallback) cut with v1 `database/` dir; fallback is now in-memory.
11. **docs/RECODER-BACKEND/domains/edge-api-server.md** — "edge enforces interop chain uniformly on every mount" superseded by self-guarding domain routers (PUBLIC_MOUNT + one-auth-per-surface).
12. **docs/RECODER-PRODUCT-DESIGN.md §2** — narrow "reuses existing Claude/Codex login" to the shipped PATH-probe (or keep and schedule Wave 10 item).
