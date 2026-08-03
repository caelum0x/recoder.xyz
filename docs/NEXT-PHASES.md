# Recoder — Next Phases (backend / apps/desktop / app)

Status: 2026-08-04. Owner-facing roadmap. Produced from three parallel surface
audits (backend, desktop, website) graded against the locked thesis
([PRODUCT-THESIS.md](./PRODUCT-THESIS.md) §12-13), the canonical layer stack
([RECODER-ARCHITECTURE.md](./RECODER-ARCHITECTURE.md)), and the product design
([RECODER-PRODUCT-DESIGN.md](./RECODER-PRODUCT-DESIGN.md),
[DESIGN-REFERENCE.md](./DESIGN-REFERENCE.md)). Evidence: file:line pointers
inline. v0.14.5 (signed+notarized, macOS arm64) went publicly downloadable
2026-08-04 at dl.recoder.xyz/releases + /download.

## Ground truth from the audits (what's REAL today)

- **The convergence loop — the thesis headline — is substantially built and
  tested on both ends.** Backend: fan-out by `taskGroup` → compare read-models →
  converge plan (per-file pick / 3-way `git merge-file` synthesize) → governed
  merge → sealed `convergence-evidence/v3` (conductor-module.ts, converge/*).
  Desktop: board → compare (pairwise) → ConvergePanel (pick/synthesize,
  auto-resolve, compose-to-reviewable) → governed merge with truthful verdicts →
  evidence panel. This is NOT the gap.
- **Health:** backend tsc 0 / 4049 tests green; desktop 724 tests green (but
  root `typecheck:desktop` red — bd recoder-8wcs, dangling pnpm symlinks);
  website 55 real test files, thin on device-flow/keys.
- **The real gaps are funnel-shaped, not feature-shaped:** a dead auto-updater,
  restart-losing desktop state, an unforegrounded first-run, leftover pre-pivot
  web claims, and a shallow cross-sibling memory (the year-3 moat).

Thesis §7 verdict drives the ordering: *the moat is gated on a funnel we are
currently losing — adoption speed is everything.* Funnel first, headline
deepening second, moat third, enterprise last.

---

## Phase 0 — Stop the bleeding (days) → ship v0.15.0

Every v0.14.5 download that happens before v0.15 is a permanently stranded
install (its updater never checks). Ship fast.

| # | Surface | Item | Size | Evidence |
|---|---|---|---|---|
| 0.1 | desktop | **Turn auto-update ON in packaged builds** — remove/flip the `RECODER_UPDATE_FEED` early-return; feed URL is already baked into app-update.yml (`publish: generic → dl.recoder.xyz/releases`) | S | emain/updater.ts:239-242, electron-builder.config.cjs:226-229 |
| 0.2 | desktop | In-app changelog version truth — entries say 1.0.0/1.1.0, app is 0.14.5; add real v0.15 entry | S | recoder-changelog.ts |
| 0.3 | app | **Purge remaining pre-pivot claims the 2026-08-03 sweep missed**: `platform/*` suite ("Browser-Based AI Development Environment"), `mobile`, `playground`; redirect like the docs stub | S-M | app/[locale]/platform/web/page.tsx:25,39; platform/layout.tsx:9 |
| 0.4 | app | **Make OAuth-only true in config, not just UI** — `emailAndPassword.enabled=true` + full credential routes still live behind an OAuth-only signin page | S | lib/auth-config.ts:134-137; api/auth/{login,register,…} |
| 0.5 | desktop | Repo hygiene: confirm the 1.36GB `Recoder-arm64.dmg` (+ public copy) is untracked; remove from working tree | S | apps/desktop/app/ |
| 0.6 | desktop | Fix root `typecheck:desktop` red (dangling `ai`/`@ai-sdk/react` pnpm symlinks) | S | bd recoder-8wcs |
| 0.7 | release | Build + notarize + publish **v0.15.0** via the now-proven local publish chain (script → rsync → manifests + blockmaps) | S | scripts/publish-desktop-release-local.sh; recipe in memory |

Gate: fresh-download test of v0.15.0 from /download; simulated update check
against dl.recoder.xyz sees the feed.

## Phase 1 — First-downloader experience (≈1 week)

The design doc's promise is "install, sign in once, it already knew my setup."
Detection is built; the front door isn't.

| # | Surface | Item | Size | Evidence |
|---|---|---|---|---|
| 1.1 | backend | **SQLite driver for agent-os state-of-record** — DB-less desktop currently degrades to `InMemoryAgentOsRepository`: state lost on restart, violating L0 restart-survivability. `better-sqlite3` already a dep | M | agent-os-module.ts:119 |
| 1.2 | desktop | **First-run onboarding card** — foreground device-flow sign-in + detected agents/gh identity (data already in environmentAtom/githubStatusAtom/agentAuthAtom; sign-in currently a palette command) | S | recoder.tsx:735-743; design §2 |
| 1.3 | desktop | **Recoder-native BYOK key screen** in recoder-settings (writes secrets.enc via safeStorage IPC; today only Wave engine-flavored surfaces do) | M | recoder-settings.tsx (84 lines, URL-only) |
| 1.4 | backend | **Verified cursor + opencode launchers** — thesis says "any agent"; only claude/codex have real ACP spawn paths; cursor/opencode are catalog metadata | M | adapters/acp-substrate.adapter.ts; interop-wire descriptors |
| 1.5 | desktop | Converge discoverability — parallel groups with 2+ siblings should visibly invite Compare/Converge on the board (today buried in expanded compare) | S | recoder-board |
| 1.6 | app | **Unify the CLI device flow to ONE implementation** — two parallel stacks (api/auth/cli/* 8-char vs api/cli/device 6-char, two token stores, two verify pages); keep the one the desktop calls | M | lib/services/cli-auth.service.ts vs app/api/cli/device/route.ts |
| 1.7 | desktop | bd recoder-oe8i: archived-history "newest 200 of N" truthfulness chip | S | recoder-model.ts:675-687 |

Gate: cold-start → sign in → detect → launch 2 agents → restart app → state
survives → converge → merge, on a machine that never saw Recoder.

## Phase 2 — Deepen the headline (2-4 weeks)

Make convergence decisively better than hand-refereeing, still terminal-plain.

| # | Surface | Item | Size | Evidence |
|---|---|---|---|---|
| 2.1 | backend | Split `conductor-module.ts` (3,580 lines) along its section markers — enabler for everything below | M | conductor/conductor-module.ts |
| 2.2 | desktop | **N-up compare** — beyond the 2-slot A/B picker; all siblings as columns with per-file winner selection | M | recoder-compare.tsx |
| 2.3 | backend | **LLM-assisted synthesize** — on `synthesize-conflict`, route conflict hunks through the inference ladder to propose a merged region (governed, reviewable, never silent) | M/L | converge.ops.ts; tensorzero-embedded-client.ts |
| 2.4 | backend | Convergence ranking hints — "recommended winner per file + why" (tests, diff size, memory signal) in converge-plan | M | converge-plan.service.ts |
| 2.5 | desktop | Batched accept/reject in recoder-diff (file + hunk → single-squashed-commit apply / discard) — the one explicitly-specced review affordance missing | M | DESIGN-REFERENCE §6 #4 |
| 2.6 | both | **Exportable evidence PACK** — render `convergence-evidence/v3` to a downloadable file/report (thesis decision #3: artifact, not console); desktop export button | S/M | GET /workspaces/:id/evidence |
| 2.7 | app | Auth config consolidation (Phase A start) — one shared Better Auth factory; kills drifted magicLink/verification/stale ide.+app. origins | L | lib/auth-config.ts ⇄ packages/auth/src/index.ts:44-46 |

Gate: a 4-agent run where converge (with hints + assisted synthesize) beats
manual merge on wall-clock, recorded as an evidence pack file.

## Phase 3 — The moat (month+)

The only compounding moat per thesis §7: earned memory + system-of-record.

| # | Surface | Item | Size |
|---|---|---|---|
| 3.1 | backend | **Cross-sibling shared memory** — in-flight publish/subscribe within a taskGroup so agent B builds on A (today recall is launch-time only, cross-run not cross-sibling). Depends on 1.1 | L |
| 3.2 | backend | Consolidate the 5 memory-recall copies / 2 GitHub engines behind one composer per domain (pairs with 3.1) | M |
| 3.3 | app | Rebuild the account plane truthfully — retire cloud dashboards (dashboard/runs, production, pull-requests assume the retired docker.recoder.xyz plane); replace with entitlement/devices/licenses | L |
| 3.4 | app | Single key mint/validate path + desktop entitlement endpoint (collapse user/api-key vs api-keys vs keys vs auth/keys) | M |
| 3.5 | app | Billing provider unification — code has Paddle+Dodo; thesis names Polar/Creem too; one provider interface + webhook normalizer (owner-gated #4) | L |

## Phase 4 — Expansion & enterprise (on demand)

- Windows/Linux packaging (bd recoder-di8l) — per-OS engine binaries; funnel expansion. **L**
- Framework-mapped evidence fields (SOC2/EU-AI-Act/DORA) on the pack — enterprise upsell. **S**
- Sandbox/container seam for solo mode (local-container.adapter currently "not wired"). **M**
- Split bootstrap/index.ts + engines-module.ts. **S/M**

## Ops track (parallel, owner-windowed — not product phases)

- **Prod Next 15→16 / React 18→19 branch migration** (bd recoder-kj5s) — blocks any
  full-source website deploy incl. the parked 76-file rebrand; same checkout feeds
  recoder-backend (up 47d). Needs its own window.
- Prod analytics barrel drift — FIXED 2026-08-04 (close bd recoder-6juz).
- Coreutils-tamper root cause (bd recoder-5iqy) — binaries restored 2026-08-01,
  root cause still unattributed; owner review.
- Sensitive-route audit sweep in app/: cli-internal/*, admin/*,
  ai-provider-keys/decrypt, proxy/git (retire if docker.recoder.xyz is dead).
- Test-gap fills: second device flow, key mint/validate, Paddle webhook.

## Sequencing logic (why this order)

1. **Phase 0 before anything:** every pre-v0.15 download is a stranded install;
   truthfulness purge and OAuth enforcement are hours-scale.
2. **Phase 1 = the funnel:** thesis §7 says the moat is gated on adoption. The
   loop already works; what loses a first-time downloader is restart-loss,
   no front door, and a buried converge button.
3. **Phase 2 = the wedge sharpened:** N-up + assisted synthesize + evidence pack
   is the demo that beats Conductor/Warp's fan-out-only story.
4. **Phase 3 = the moat**, deliberately after adoption exists to feed it.
5. Enterprise (4) stays an upsell per locked decision #1; no dashboards (locked
   decision #3) — evidence stays an artifact.
