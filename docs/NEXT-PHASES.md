# Recoder — Next Phases: Product Strategy + Technical Plan

Status: 2026-08-04 v2 (deep). Owner-facing. Built from three surface audits +
three technical-seam recons (file:line evidence throughout), graded against the
locked thesis ([PRODUCT-THESIS.md](./PRODUCT-THESIS.md) §12–13),
[RECODER-ARCHITECTURE.md](./RECODER-ARCHITECTURE.md),
[RECODER-PRODUCT-DESIGN.md](./RECODER-PRODUCT-DESIGN.md),
[DESIGN-REFERENCE.md](./DESIGN-REFERENCE.md).
Context: v0.16.1 signed+notarized+stapled macOS-arm64 DMG is publicly downloadable as of 2026-08-07 (dl.recoder.xyz/releases + /download now a real public download, not early access; existing installs auto-update via the feed). Human end-to-end boot verification still pending.

---

# PART I — PRODUCT

## 1. Identity: the Cursor playbook, the Conductor board, the Converge verb

**The playbook we are running (owner direction 2026-08-04):** Cursor forked a
beloved base (VS Code), kept 100% of its muscle memory, and added ONE addictive
AI verb (Tab). Conductor.build proved the board-of-parallel-workspaces shape
devs love, free, Mac-first. Recoder's position in that frame:

| Cursor had | Recoder has |
|---|---|
| VS Code (forked base, zero learning curve) | **Wave terminal** (already forked, fully rebranded) |
| Tab (the addictive verb) | **Converge** (N divergent diffs → one trusted merge) |
| Editor as the surface | Terminal + board as the surface |
| Closed product on OSS base | ← decision open, see §4 |

**The groundbreaking product, in one line:** *the merge button for the
multi-agent era.* Fan-out is commoditized (Conductor free, `--worktree` native);
nobody owns what happens AFTER the fan-out. Every demo, screenshot, and landing
claim should end on the Converge action, the way every Cursor demo ended on Tab.

**Product bar for "groundbreaking":** a first-time user fans one task to 3
agents and reaches one merged, evidence-backed branch in under 10 minutes,
without reading docs. Everything in Part II serves that bar.

## 2. Personas → funnel → metrics

1. **The fan-out dev (beachhead):** already runs Claude Code + Codex side by
   side, hand-referees diffs. Buys convergence. Self-serve.
2. **The burned BYOK dev:** metered-cloud bill-shock refugee (Cursor/Devin);
   wants predictable API-key spend, local-first. Buys BYOK + self-host.
3. **The platform lead (upsell, later):** wants evidence of what agents did.
   Buys the evidence pack, SSO, retention. NOT v1 — locked decision #1.

**Funnel to instrument (in order of today's leak severity):**
download → first-open → sign-in → first launch → first *parallel* launch (2+
agents) → **first converge** (the aha) → first merge → D7 return.
North-star metric: **weekly converged merges per active user.**
Today's leaks, worst first: (a) stranded updater kills every re-engagement
loop; (b) restart loses all state — catastrophic trust break; (c) sign-in and
converge are buried; (d) macOS-arm64-only caps the top of funnel.

## 3. Surface roles (product definition per repo area)

- **`apps/desktop` = the product.** Terminal-plain, three screens (board /
  workspace / settings). Converge is the headline verb, visible on the board.
- **`backend` = the invisible engine.** Its product outputs are reliability
  (state survives restart), breadth (any agent truly launches), depth (assisted
  synthesis, ranking), and the evidence artifact. No UI.
- **`app` (website) = the account plane, nothing more.** Auth, device flow,
  billing, keys, legal, changelog. Every page that isn't one of those either
  moves to `site/` (marketing) or dies. The website never claims product
  behavior the desktop doesn't ship.
- **`site/` = the funnel top.** Home, download, docs, self-host. Already live.

## 4. The open-source decision (owner call, recommendation included)

Owner direction: open to OSS product-merging "like Cursor did with VS Code."
Two distinct levers — don't conflate them:

**Lever A — absorb OSS into Recoder (already the house style).** Wave, dmux,
beads, mem0, tensorzero, recodergit are absorbed and rebranded. Next absorption
candidates should serve *convergence* specifically — evaluate (per the
skeleton-project rule: search, assess, wire-in, never hand-roll):
- a best-in-class diff renderer for the N-up compare surface (e.g.
  delta/difftastic-class syntax-aware diffing) — the compare board IS the demo;
- jujutsu (jj)-style first-class conflict objects as a *concept* import for
  the converge engine (conflicts as data, not failure);
- merge-tooling UX patterns (3-pane resolve) for the assisted-synthesize
  review moment.
All absorptions follow the standing rule: full Recoder rebrand, legal
attribution, wire-in not delete.

**License reality (audited 2026-08-04, bd recoder-rxn0):** the base and almost
all absorbed engines are permissive — Wave fork Apache-2.0; mem0/tensorzero/
pal/continuum Apache; openfang dual Apache/MIT; dmux/browser-use/colbert/
ops-recorder/opencode-* MIT; tmux ISC. Exceptions: **recodergit is PolyForm
Noncommercial** (now UNBUNDLED from the shipped DMG as of v0.15 — backend
degrades truthfully; long-term: commercial license or permissive rebuild on
gitoxide/git2); **multica** is Dify-style restricted Apache (verified NOT
compiled into or shipped with the desktop — vendored source only; do not embed
in a paid artifact without a license); **openclaw** has no license file
(abandoned, not shipped); `.scratch/upstream/daytona` is AGPL — never copy
code from it into the product.

**Lever B — open-source Recoder itself.** Cursor stayed closed on an OSS base;
Conductor is free-closed; Warp is closed. The thesis's declared biggest
weakness is **distribution** (§7). An open(-core) desktop is the one move none
of the funded competitors can copy without cannibalizing themselves.
**Recommendation:** open-core — open the desktop shell + local single-user
product (the free tier per thesis §8 pricing, which we give away anyway), keep
team/enterprise convergence services (shared memory across users, evidence
retention, SSO) commercial. Decide before v0.16 (licensing headers, repo split
cost rises with every release). Risks to weigh: forkability of the converge
loop (mitigated: the moat is the earned memory + system-of-record, not the
code); support burden; secret-hygiene audit of history before any repo
publication (known open item: secrets in git history — must resolve first).

## 5. Release train (product milestones; ships map to Part II phases)

- **v0.15 — "the update loop lives" (SHIPPED):** updater default-ON, truthful
  in-app changelog, web claim purge — all landed; superseded by v0.16.1 which is
  published and auto-updates existing installs via the live feed.
- **v0.16 — "it remembers, it welcomes" (~2 weeks):** restart-survivable
  state (SQLite), foregrounded first-run (sign-in + detection + BYOK),
  converge discoverable on the board, cursor/opencode verified launchers.
- **v0.17 — "converge is magic" (~4–6 weeks):** N-up compare board,
  LLM-assisted synthesize, per-file winner recommendations, evidence pack
  export-as-file. This is the demo release; the Cursor-Tab moment.
- **v0.18+ — "the moat":** cross-sibling shared memory, then team memory.
- **Parallel ops track:** prod Next 15→16 migration window, Windows/Linux
  packaging (funnel-gated), account-plane rebuild.

---

# PART II — TECHNICAL PLAN (per surface, with exact seams)

## A. DESKTOP (`apps/desktop`)

### A1. Auto-updater default-ON  [DONE]  (shipped, bd recoder-fjod CLOSED)
The updater is live and default-ON. Existing installs auto-update against the dl.recoder.xyz/releases feed (latest-mac.yml=0.16.1). Historical implementation notes on the gate inversion below are retained for reference:
- `emain/updater.ts:239-242` early-returns unless `RECODER_UPDATE_FEED` is set;
  nothing sets it in packaged builds. **Invert to opt-out**: early-return only
  when `RECODER_UPDATE_FEED === "off"|"0"` (keep `isDev()` guard :231-234).
- No feed-URL plumbing needed: electron-updater reads the baked
  `app-update.yml` (`electron-builder.config.cjs:226-229` → generic provider
  `dl.recoder.xyz/releases`; `getUpdateChannel` parses it, updater.ts:19-36).
  The env var is a boolean toggle, consumed nowhere as a URL.
- Existing UX is complete: 10-min check tick (`start()` :126-134, gated by
  `autoupdate:intervalms`), auto-download, "ready to install" system
  notification → modal Restart/Later (`promptToInstallUpdate` :181-198),
  `quitAndInstall` (:203-210). Settings toggles already exist
  (`autoupdate:enabled/intervalms/installonquit/channel`).
- **Version-source landmine:** runtime version comes from **wavesrv** parse
  (`emain-wavesrv.ts:33,134` → `getWaveVersion()`), not `package.json`. The
  what's-new gate compares changelog entries against THAT version
  (`recoder-whats-new-panel.tsx:21`). Fix `recoder-changelog.ts` entries
  (currently fictional `1.0.0/1.1.0`) to the real `0.15.0` scheme and confirm
  wavesrv reports the same scheme, or the panel never fires.
- Test: unit-test the gate inversion; manual: run v0.15 build against the live
  feed, watch `app-update-status` IPC (`updater.ts:113-121`).

### A2. First-run foregrounding  [S — 1-2 days]  (v0.16)
The seam already exists — enrich, don't rebuild:
- `recoder.tsx:583-584` computes `showGettingStarted` (empty board) and renders
  the "Welcome to Recoder" card (:1042+) with `EnvironmentImportSummary`.
- Add to that card: (1) **sign-in CTA** when `identity == null` — exact same
  call as the palette command (`recoder.tsx:735-743` →
  `RecoderIdentityModel.getInstance().signIn()` → IPC `recoder:sign-in` →
  `emain-ipc.ts:260-267` device flow); render the device-code prompt from
  `promptAtom` (`recoder-identity-model.ts:23`) inline in the card, not a
  toast. (2) **agent detection chips** from `environmentAtom`
  (`recoder-model.ts:80-85` — gitIdentity/agentConfigs/ghAuthenticated) +
  `agentAuthAtom` (:261) + `githubStatusAtom` (`recoder-github-logic.ts:11-18`)
  — all already loaded. (3) a "run your first parallel task" affordance that
  preselects 2 detected agents.
- No first-run flag needed — `allWorkspaces.length==0` inference is correct
  and self-healing.

### A3. BYOK key screen  [M — 3-5 days]  (v0.16)
Recon exposed a real format bug to fix first:
- **Writer** is the Go secretstore via wshrpc: renderer calls
  `RpcApi.SetSecretsCommand` (`waveconfig-model.ts:491`) → Go
  `SetSecretsCommand` (`wshserver.go:1497`) → `secretstore.go` writes
  `secrets.enc` (per-secret encrypted values, JSON), encrypting through
  electron `handle_electronencrypt` (`emain-wsh.ts:62-81`).
- **Reader** `emain-backend.ts:100-123` (`readByokSecretsFromStore`) decrypts
  the file as a **single safeStorage blob** — a different format than the
  writer produces. **Verify and align first** (make the reader parse the Go
  per-secret format); this is a latent BYOK-keys-silently-ignored bug.
- Then: a terminal-plain provider-key form in `recoder-settings.tsx` (today 84
  lines, backend-URL-only) using the existing `SetSecretsCommand` path — no
  new IPC needed. Key names must match what the backend supervisor injects as
  provider env (`emain-backend-runtime-env.ts`). Backend-side, the same keys
  can flow to the BYOK vault via `ByokKeyResolver.store()`
  (`backend/src/domains/inference/ports/byok-resolver.port.ts:64`).

### A4. N-up compare  [M — phased]  (v0.17)
Recon split this cleanly into free vs costly:
- **Free (pure frontend):** the backend already returns ALL N siblings with
  per-sibling `diffStat` + `changedFiles`
  (`CompareView.siblings[]`, `compare.service.ts:83-100`); the panel renders
  them as a vertical stack (`recoder-compare.tsx:587-609`). Re-lay-out as N
  columns with per-file winner chips — no new data.
- **Costly (new edge):** line-level N-way content. The pairwise edge is
  strictly 2-way (`GET …/pairwise?a=&b=`, `compare.routes.ts:153-176`).
  Phase 2: add an N-way per-file edge (`GET …/file-versions?path=` returning
  each sibling's version + base) reusing `gatherContributorVersions`
  (`converge.ops.ts:429`) — same data the synthesize probe already reads.
  Keep `pairAAtom/pairBAtom` (`recoder-model.ts:317-324`) for the 2-way deep
  dive; N-up selection state is per-file `Record<path, workspaceId>` — which
  is exactly the converge `selection` input shape, so the compare board and
  ConvergePanel share state.

### A5. Converge discoverability  [S]  (v0.16)
Board cards in a `taskGroup` with ≥2 siblings get a persistent
"Compare · Converge" affordance (data already in `compareAtom`); today the
ConvergePanel is only reachable inside an expanded compare panel.

### A6. Diff accept/reject at file/hunk  [M]  (v0.17)
`recoder-diff.tsx` is read-only. Backend verbs already exist:
`discardWorkspaceFiles` (:2677) / `discardWorkspaceHunks`
(`conductor-module.ts:2741`). Add per-file/per-hunk reject (discard) + "apply
rest as single commit" per DESIGN-REFERENCE §6 #4 — frontend wiring to
existing governed writes, not new backend surface.

## B. BACKEND (`backend`)

### B1. SQLite state-of-record  [M — 1 week]  (v0.16, bd recoder-o9e8)
The must-fix for the desktop trust break. Recon nailed the contract:
- **What's lost on restart today:** ALL 16 aggregates in
  `InMemoryAgentOsRepository` (`in-memory-agent-os.repository.ts:52` — Maps
  for agents/tasks/runs/approvals-mirror/artifacts/evidence/memory/
  instructions/policy/events[]/outbox[]/…), PLUS conductor's own
  `WorkspaceRepositoryPort` fallback (`workspace-repository.port.ts:77`,
  `isDurable()===false` without executor). The config's `'json'` driver enum
  is dead — it falls through to memory (`agent-os-module.ts:111-127`; no src
  adapter exists).
- **Build:** `SqliteAgentOsRepository` implementing `AgentOsRepositoryPort`
  (`ports/agent-os-repository.port.ts:123` — 34 methods, all
  `RepositoryResult<T> = T | Promise<T>` so better-sqlite3's sync API is
  legal). **The contract test already exists**
  (`__tests__/agent-os-repository.contract.test.ts`) — run it against the new
  adapter; that's the spec. Schema: one table per aggregate
  (id TEXT PK, json TEXT, updated_at), `events` append-only with
  (taskId, runId) indexes for `EventsPageQuery` newest-first paging, `outbox`
  ordered table. WAL mode; DB file under the desktop configDir.
- **Conductor durability:** second adapter for
  `WorkspaceRepositoryPort` (tables `conductor_workspaces`,
  `conductor_run_tails` mirroring the pg adapter) so `isDurable()` goes true;
  CanonicalRunStore is structurally the agent-os port over the same file.
- **Selection:** extend driver enum `'postgres'|'json'|'memory'` → add
  `'sqlite'`; default in `sliceAgentOsConfig` (`config.ts:153-155`) becomes:
  databaseUrl → postgres; else solo-mode/desktop → **sqlite**; memory stays
  the explicit-opt-out and test default. Supervisor passes the path via env.
- **Gate:** contract test green on sqlite + an e2e: create workspace → kill
  backend → restart → workspace and events present.

### B2. Verified cursor/opencode launchers  [M]  (v0.16)
Only claude/codex have real spawn paths (`adapters/acp-substrate.adapter.ts`);
cursor/opencode are interop-wire catalog metadata, not launchers. opencode
first (CLI, tmux-substrate friendly — same harness as claude CLI path), cursor
second (agent CLI probe; if no headless mode exists, keep it truthfully listed
as "terminal-attach only" rather than fake support). Acceptance: the
first-run "run on all detected agents" launches each detected agent and
reaches a diff.

### B3. LLM-assisted synthesize  [M/L — 1-2 weeks]  (v0.17)
Precise slot-in, no architecture change:
- Today: `synthesizeFile` (`converge.ops.ts:405`) folds contributors pairwise
  via `git merge-file` (`threeWayFold` :456); non-clean →
  `synthesize-conflict` → compose aborts (`UnresolvedConvergenceError` :293).
- Add resolver at exactly that point, contract
  `{clean:true, content} | {clean:false}`: input = base content
  (`readOptional`/`showFileAtRef` :417/:681), contributor versions keyed by
  workspaceId (`gatherContributorVersions` :429), parsed `ConflictRegion[]`
  (`converge-plan.service.ts:111` — ours/theirs spans, bounded
  MAX_CONFLICT_REGIONS=20).
- Inference via the degrade-safe gateway: `postInference({function_name:
  "converge_synthesize", input:{messages}})`
  (`tensorzero-embedded-client.ts:638`) — never throws; `routed:false` →
  return `{clean:false}` (today's behavior, truthful degrade). BYOK-aware
  routing through the inference module `gateway()` with a subject-bearing
  request when a user key exists.
- **Governance & truth:** new mode `'assisted'` (explicit opt-in per file,
  distinct from mechanical `'synthesize'`); result lands in the composed
  workspace which is ALREADY a reviewable workspace, never direct-to-trusted;
  evidence record gains `assisted: [{path, inference_id, regions}]` — the
  inference_id lands in the evidence pack (B5). Prompt-injection posture: the
  model output is file content entering a REVIEW flow, same trust level as
  agent-written code — acceptable; never auto-merge assisted files.

### B4. Cross-sibling shared memory (the moat)  [L — phased]  (v0.18)
Recon found the reusable seams; v1 needs NO new bus:
- **v1 "sibling awareness" (ship first):** on sibling terminal state, the
  completion-hook sink (`completion-hook.adapter.ts:135`, wired
  `conductor-module.ts:614`) already fires. Extend it: compose a terse
  summary (agent, outcome, changedFiles, diffStat — all in the read models)
  and **steer** the still-running siblings of the same `taskGroup` via
  `steerWorkspace` (:1203) → `steerTransport.sendKeys`
  (`steer-transport.port.ts:27`). Non-running siblings: skip (they get recall
  at next launch). Opt-in flag on launch (`sibling_awareness: true`).
- **v2 mid-run milestones:** publish periodic diff-stat deltas through a
  taskGroup-scoped hub (extend `TerminalStreamService`'s SyncHub pattern,
  `terminal-stream.ts:50-81` — today per-workspaceId WebSocket only).
- **v3 team memory:** harvested candidates (`harvestOnCompletion`,
  `brain-memory.adapter.ts:87`) shared across users = the paid tier. Depends
  on B1 (durable store) and the account plane (C3).
- Recall side already exists: `enrichPrompt` at launch
  (`conductor-module.ts:758`, `brain.port.ts:46`) — sibling summaries flow
  into the same prompt block for late-started siblings.

### B5. Evidence pack export  [S/M]  (v0.17)
`getConvergenceEvidenceExport` already exists (`conductor-module.ts:3113`)
alongside the sealed `convergence-evidence/v3` record. Finish it: a single
downloadable artifact (JSON + rendered human-readable report) with the
sha-256 seal on the cover, exposed as a desktop "Export evidence" button on
the merged workspace. Framework mapping fields (SOC2/EU-AI-Act/DORA) = later
enterprise add, marked clearly optional in the schema now.

### B6. Conductor split  [M — do alongside B3/B4]
3,580 lines, only 5 `// ---` markers. Split by the recon's method-group map:
reads (:933-979, :1806-1966), governed writes (:983-1531, :2637-2938),
checkpoints (:1556-1743), compare+converge (:1982-2413, :2939-3322), preview
(:2414-2636), introspection (:1744-1805). Facade class stays; groups become
collaborator classes it delegates to. Pure mechanical refactor, zero behavior
change, contract = existing 4,049 tests stay green.

## C. WEBSITE (`app`)

### C1. Device-flow consolidation — KEEP SET A, DELETE SET B  [S/M]  (v0.16)
The decision is now mechanical, not a judgment call:
- The desktop client (`emain-device-auth-core.ts:70-73,155,187`) speaks
  RFC-8628: `POST /api/auth/cli/device` (client_id `recoder-desktop`) +
  `POST /api/auth/cli/token` (`urn:ietf:params:oauth:grant-type:device_code`),
  expects snake_case `device_code/user_code/verification_uri/…` and opaque
  `reco_` tokens → **that is Set A** (`cli-auth.service.ts`, 8-char code,
  Prisma `DeviceCode`, 90d/365d opaque tokens).
- Set B (`api/cli/device` + `/poll`, camelCase, 6-char) is non-RFC and its
  standalone poll route is **broken** (returns unstored `device_${code}`,
  `cli/device/poll/route.ts:95`). Delete Set B routes + the `/cli/authorize`
  page; redirect `/cli/authorize` → `/cli/auth`. Align Set A's two init
  surfaces (service vs route.ts drift: 10 vs 15 min expiry, verification_uri
  `/cli/auth` vs `/auth/device`) to ONE: `/cli/auth`, 15 min.
- Add the missing tests: device init → authorize → token → refresh → revoke.

### C2. Entitlement endpoint for the desktop  [M]  (v0.16-0.17)
What exists: `GET /api/cli/quota` (bearer `reco_`/`rk_`, live quota + tier via
`withCLIAuth`) and `GET /api/user/subscription` (plan + hardcoded display
strings, `user/subscription/route.ts:56-96`). Neither returns a feature map.
- Build `GET /api/cli/entitlements` (same `withCLIAuth`): `{plan, status,
  features: {parallel_agents: n, shared_memory: bool, evidence_retention_days,
  …}, quota:{…}}` derived from the `subscriptions` model
  (`schema.prisma:2034`) + one server-side plan→features table (kill the
  hardcoded strings). This is the contract the desktop's paid-tier gating and
  the open-core split (Part I §4) both hang off.
- Token cleanup while there: `withCLIAuth`
  (`cli-auth-middleware.ts:36,46`) accepts `reco_` + `rk_` only; `sk-recoder-`
  keys minted by `PlatformApiKeyService` are NOT accepted (silent gap), and
  `rck_` is legacy. Converge on `rk_` (CLI/desktop) + retire or middleware-
  accept `sk-recoder-`; one mint service, one validate path.

### C3. Account plane rebuild  [L]  (v0.17-0.18)
Dashboard reality from recon: `dashboard/runs` proxies the docker backend A2A
timeline (real but infra-facing), `dashboard/production` is real Prisma usage
aggregation, `dashboard/pull-requests` lists project snapshots labeled as PRs
(misleading). Replace the lot with ONE truthful `/account` surface: plan +
quota (C2 data), API keys + CLI sessions (`cli_sessions` = the desktop device
list — revoke button), invoices (existing billing routes), download/version
(release feed already live). Delete the rest of `dashboard/*` after the
desktop stops needing nothing from it (it already needs nothing).

### C4. Auth config consolidation (identity Phase A start)  [L]  (v0.17)
Recon produced the exact parameterization for ONE shared factory
(`createRecoderAuth(opts)`), replacing the two drifted configs
(`app/lib/auth-config.ts` vs `packages/auth/src/index.ts`):
adapter+client (customPrismaAdapter(prisma) vs prismaAdapter(authDatabase)) +
modelName map; email senders incl. magicLink on/off; requireEmailVerification
+ custom bcrypt hash on/off; social-provider env-key names + strict-validation
+ scope/mapProfile; session expiry/cookieCache; trustedOrigins + baseURL;
pages. The `advanced` cookie block is byte-identical today → extract as a
shared constant FIRST (zero-risk step), then migrate app/, then packages/.
Kill the stale `ide.recoder.xyz`/`app.recoder.xyz` trusted origins
(`packages/auth/src/index.ts:44-46`) in the same pass. Gate: existing auth
e2e scripts (`scripts/sso-logout-matrix.sh`, verify-auth-email-reset,
verify-cli-device-flow) green against the factory.

### C5. OAuth-only made true  [S]  (v0.15, with bd recoder-6h3q purge)
`emailAndPassword.enabled=true` + full credential routes
(`api/auth/{login,register,signup-email,forgot/reset-password,…}`) live behind
an OAuth-only UI. Flip `enabled:false` behind an env (keep for self-host
operators who need local accounts), 410 the standalone credential routes on
the hosted product. Ship with the C0/`platform/*` claim purge.

### C6. Billing unification  [L]  (v0.18, owner-gated #4)
Recon: `paddle.ts` is a browser Paddle.js widget wrapper; the real Dodo server
logic is `lib/services/dodopayments.service.ts` (not `dodo.ts`); NEITHER file
verifies webhooks (webhook routes do it separately). Extract the recon's
`PaymentProvider` interface (createCheckout / getSubscription /
cancelSubscription / changePlan / **verifyWebhook**) at the `.service.ts`
layer, normalize webhook events into one internal event type feeding the
`subscriptions` model, then add Polar/Creem behind the same interface (or
explicitly de-scope them and update the thesis — don't leave the claim/code
gap).

---

# PART III — SEQUENCE, GATES, RISKS

## REPRIORITIZED 2026-08-04 (owner directive): unique product over everything

Status: v0.16.1 SHIPPED (signed, notarized [Accepted, submission 2f48d6ec], stapled, published to dl.recoder.xyz/releases; /download serves it publicly; bd recoder-ahxt CLOSED). Still pending: a human end-to-end boot of the installed dmg (sign in, create workspace, run agent, merge). Owner verdict after seeing the live app: "are we just
a bundle on Wave?" — the next epoch must make the answer unambiguous. Three
tracks jump the original queue (bd issues filed):

1. **Mid-run agent communication** (bd recoder-i499, P0) — cross-sibling
   context via the verified completion-hook + steer seams (B4 §II pulled
   forward). THE feature that makes Codex+Claude a team instead of parallel
   strangers. Today's honest answer to "do the agents talk?" is NO.
2. **Use everything we ship** (bd recoder-2xck) — (a) Wave's own AI-terminal
   capability wired into the product flow (waveai panel ⇄ governed gateway ⇄
   current workspace diff); (b) every dark engine gets ONE product verb in the
   converge loop or an explicit parked-with-reason note.
3. **Clean-design pass** (bd recoder-667l) — DESIGN-REFERENCE conformance
   sweep across every recoder-* view; one primary action per screen, calm
   empty states. The product must LOOK like one thing.

Billing: Creem approved (bd recoder-t24j) — provider module + webhook verify,
then rotate the key. Assisted-synthesize (B3) + N-up (A4) remain the v0.17
demo core and pair naturally with track 1.

## Order of execution (dependency-honest)

```
v0.15 (days):    A1 updater ─ C5 oauth-true ─ web claim purge (bd 6h3q) ─ publish
v0.16 (~2 wks):  B1 sqlite ──► A2 first-run ── A3 byok ── A5 discoverability
                 B2 launchers ─ C1 device-flow consolidation
v0.17 (4-6 wks): B6 split ──► B3 assisted-synthesize ── A4 n-up ── A6 hunks
                 B5 evidence export ── C2 entitlements ── C4 auth factory
v0.18+:          B4 shared memory (needs B1) ── C3 account plane ── C6 billing
ops (windowed):  prod Next15→16 migration (bd kj5s) · win/linux (bd di8l)
                 · open-core decision + history secret-scrub (Part I §4)
```

## Phase gates (each release, verified not asserted)
- **v0.15 (met):** updater live and default-ON; v0.16.1 published to the feed and
  existing installs auto-update; /download shows the real public build with no
  pre-pivot claims. (Human end-to-end dmg boot → converge → merge remains the v0.16 gate.)
- **v0.16:** cold machine → sign in → detect → parallel launch → **kill the
  app → relaunch → everything still there** → converge → merge.
- **v0.17:** 3-agent task where assisted converge beats hand-merging on
  wall-clock, ending in an exported evidence file; recorded as the demo.
- **v0.18:** two siblings demonstrably exchange context mid-run (B's diff
  references A's approach), shown in the evidence pack.

## Top risks
1. **Updater self-trap:** v0.15 must be correct — a broken updater in the
   first updater-enabled release re-strands everyone. Test the staged-release
   path before announcing.
2. **secrets.enc format mismatch (A3):** writer/reader disagree today; BYOK
   keys may already be silently ignored in packaged builds — verify first.
3. **SQLite concurrency:** better-sqlite3 is sync — keep it on the main
   process's single connection (WAL), never share the file with the Go server.
4. **Assisted synthesize trust:** never auto-merge assisted output; evidence
   must mark assisted regions; degrade to today's abort when inference is
   unavailable.
5. **Open-core before secret-scrub:** repo history contains secrets (known
   open audit item) — publication is blocked on rewriting/rotating first.
6. **Prod website drift:** any full-source deploy stays blocked on the
   Next 15→16 migration window (bd recoder-kj5s).
