# scripts

> Area: operational + verification scripts for the Recoder monorepo.
> Source of truth: `/Users/arhansubasi/recoder.xyz/scripts`.
> Last verified by reading the directory on 2026-07-01.

## 1. Purpose

`scripts/` is the **operational tooling layer** for the Recoder platform. It is not a
deployed surface or a published package — it is a flat grab-bag of ~160 standalone
executables (mostly `bash`, plus Node `.mjs`/`.js`, `tsx` `.ts`, and a few Python) that
humans and CI invoke to **build, deploy, verify, gate releases, rotate secrets, run
E2E checks, and probe production health**. Most scripts target the production Hetzner box
(`root@77.42.23.19`, the `recoder.xyz` surfaces) or a local self-host stack.

These scripts are the concrete implementation behind the verification entry points named
in `AGENTS.md` ("Verification Defaults") and the project rules: things like
`scripts/sso-logout-matrix.sh`, `scripts/verify-byok-e2e.sh`,
`scripts/verify-phase14-runtime.sh`, and `scripts/production-external-closeout.sh`.
Many are wired into the **root** `package.json` `scripts` block as named pnpm/npm
targets (e.g. `pnpm phase3:gates`, `pnpm verify:byok`, `pnpm agent-os:smoke`); a few are
invoked directly by path or by deploy runbooks. The directory embodies the repo's
"deterministic scripts over manual claims" and "never fake success" philosophy — most
verifiers exit non-zero and print `FAIL:`/`PASS:` lines rather than asserting success.

## 2. Layout

This is a **flat directory** (no domain subfolders except `lib/`). Files are grouped here
by naming-prefix convention, not by directory. Approximate counts: 115 `.sh`, 17 `.mjs`,
13 `.ts`, 11 `.js`, 3 `.py`, 2 `.regex`, 2 `.log`.

| Group (by name prefix) | Examples | What it holds |
|---|---|---|
| `lib/` (only real subdir) | `lib/recoder-auth.mjs` | Shared helper modules for other scripts. `recoder-auth.mjs` re-extracts the Better-Auth session/cookies from `e2e-agents-auth.mjs` and builds the cross-subdomain cookie header. |
| `verify-*.sh` (13) | `verify-byok-e2e.sh`, `verify-auth-email-reset-e2e.sh`, `verify-cli-device-flow-e2e.sh`, `verify-phase14-runtime.sh`, `verify-pm2-runtime.sh`, `verify-monitoring-stack.sh` | End-to-end / runtime verifiers. Deterministic, exit-code driven. |
| `check-*` (23, `.sh`/`.mjs`/`.js`) | `check-production-env-gate.sh`, `check-ecosystem-readiness.sh`, `check-hetzner-*`, `check-agent-instructions.ts`, `check-eval-gate.js`, `check-pm-bundles.mjs` | Pre-flight / drift / readiness gates (env consistency, Hetzner disk/db drift, instruction spine, eval gate). |
| `phase*` + `check-phase*` (14) | `phase3-production-gates.sh` (26 KB, the big one), `phase3-closeout.sh`, `phase16-production-validation.sh`, `phase1-main-branch-smoke.sh`, `check-phase3-ga-ready.sh` | Phased release gates. Write logs + summary MD/JSON to `logs/phase3-gates/`. |
| `e2e-*.mjs` (11) | `e2e-agents-auth.mjs`, `e2e-platform-check.mjs`, `e2e-web-ide-authenticated.mjs`, `e2e-agency-auth.mjs`, `e2e-pm-authenticated.mjs` | Playwright-driven authenticated browser E2E flows against live subdomains. |
| `deploy-*.sh` / `selfhost-*.sh` | `deploy-all-services.sh` (21 KB), `deploy-pm2-services.sh`, `deploy-pm-agents-agency.sh`, `selfhost-up.sh`, `selfhost-down.sh` | Production deploy (SSH→Hetzner, PM2/Docker) and one-command self-host bring-up. |
| `*-smoke.ts` / `*smoke*.sh` | `agent-os-smoke.ts`, `a2a-smoke.ts`, `mcp-smoke.ts`, `oss-stack-health.ts`, `a2a-production-smoke.sh`, `smoke-branding-endpoints.sh` | Lightweight contract/health smokes for Agent OS, A2A, MCP, OSS sidecars. |
| secrets / rotation `*.sh` + `*.regex` | `generate-ecosystem-secrets.sh`, `apply-ecosystem-secrets.sh`, `credential-rotation-audit.sh`, `post-rotation-verify.sh`, `scan-secrets-strict.sh`, `leak-scan-strict.sh`, `secret-scan-allowlist.regex`, `leak-scan-allowlist.regex` | Secret generation, application, rotation audit, and leak scanning with allowlists. |
| Agent OS / beads `*.ts` | `beads-sync.ts`, `beads-task-create.ts`, `beads-task-status.ts`, `compile-agent-instruction-sample.ts`, `generate-agent-schemas.ts`, `verify-runtime-adapter.ts` | `tsx`-run helpers that talk to Agent OS HTTP routes and the `bd` issue tracker. |
| conductor / services | `recoder-conductor.mjs`, `recoder-services.sh`, `selfhost-up.sh`, `cleanup-sandboxes.sh` | CLI + launcher for the parallel-agent conductor and the `py/` sidecar services. |
| build / setup | `build-all.js`, `build-all.sh`, `build-tmux*.sh`, `build-bd.sh`, `build-substrate-binaries.sh`, `setup.js`, `setup-manual.js`, `install-recoder.sh`, `health-check.js` | Build orchestration, local setup, native-tool builds. |
| eval / changelog | `run-eval-benchmark.js`, `score-composer-dataset.js`, `prepare-composer-results.js`, `generate-changelog.ts`, `aggregate-coverage.mjs`, `audit-dependency-security.mjs` | Eval harness, coverage aggregation, changelog/audit utilities. |
| `node_modules/` + `package.json` | axios, chalk, ora, fs-extra, semver | **Local** dependency island for the Node scripts (see Gotchas). |
| `*.log` (checked-in) | `vendor-green.log`, `vendor-variants.log` | Stale run output committed into the tree (artifacts, not code). |

## 3. Entry points

Most files are independently executable; there is no single "main". The highest-signal
files to start reading:

- **`recoder-services.sh`** — header doc (`:1`–`:23`) maps the four `py/` sidecars
  (`colbert`→`COLBERT_RERANK_URL` :8893, `billing`→`BILLING_BASE_URL` :8896,
  `ops` :8897, `mem0`→`MEM0_BASE_URL` :8888) and the `up`/`down`/`health` subcommands.
  Good model of the repo's degrade-safe, honest-health style.
- **`recoder-conductor.mjs`** — user-facing CLI for the parallel agent system; talks to
  the conductor backend at `RECODER_CONDUCTOR_URL` (default `http://localhost:3001`),
  API base `${CONDUCTOR_URL}/api/conductor` (`recoder-conductor.mjs:18`–`:19`). Note: a
  `.mjs` file written in TypeScript syntax (typed params) — run via `tsx`/loader, not bare node.
- **`phase3-production-gates.sh`** — the 26 KB release-gate engine. Env-driven
  (`PHASE3_MODE`, `DRY_RUN`, `SKIP_ENV_GATES`, …, `phase3-production-gates.sh:18`–`:34`),
  writes log + summary/scorecard MD+JSON into `logs/phase3-gates/$RUN_ID-*`.
- **`selfhost-up.sh`** — one-command self-host bring-up; loads `.env.selfhost`, generates
  safe secrets, fails fast on required `POSTGRES_*`, then `docker compose -f
  docker-compose.selfhost.yml up -d --build` and waits on healthchecks.
- **`verify-byok-e2e.sh`**, **`sso-logout-matrix.sh`** — canonical verifier shape
  (`set -euo pipefail`, `require_cmd curl/jq`, `pass()/fail()` counters, env-overridable
  `*_URL` bases defaulting to the real `*.recoder.xyz` domains).
- **`lib/recoder-auth.mjs`** — the shared auth helper imported by Node E2E scripts.
- **`scripts/package.json`** (`:6`–`:13`) — declares local `health-check`/`setup`/
  `build-all` targets, **but** `deploy`/`test-all`/`release` point at `deploy.js`/
  `test-all.js`/`release.js` that **do not exist** in the directory (dead targets).

The **authoritative invocation map is the root `package.json`** (`/Users/arhansubasi/recoder.xyz/package.json`),
not `scripts/package.json` — see below.

## 4. Build / run / test

There is no Makefile/Cargo.toml/pyproject here. Scripts are invoked two ways:

**(a) Named targets in the ROOT `package.json`** (run from repo root). Real examples
verified in `/Users/arhansubasi/recoder.xyz/package.json`:

```bash
# Agent OS / contracts (tsx)
pnpm agent:instructions:check     # node --experimental-strip-types scripts/check-agent-instructions.ts
pnpm agent-os:smoke               # tsx scripts/agent-os-smoke.ts
pnpm a2a:smoke                    # tsx scripts/a2a-smoke.ts
pnpm mcp:smoke                    # tsx scripts/mcp-smoke.ts
pnpm runtime-adapter:verify       # tsx scripts/verify-runtime-adapter.ts
pnpm oss:health                   # tsx scripts/oss-stack-health.ts
pnpm beads:sync                   # tsx scripts/beads-sync.ts

# Phase / release gates (bash)
pnpm phase3:gates                 # bash scripts/phase3-production-gates.sh
pnpm phase3:gates:dry             # DRY_RUN=true PHASE3_MODE=local-dev …
pnpm phase3:closeout              # bash scripts/phase3-closeout.sh
pnpm phase16:validate:production-deploy
pnpm release:evidence             # bash scripts/a5-release-evidence.sh

# Env / secrets / prod gates (bash)
pnpm check:prod-env-gate          # bash scripts/check-production-env-gate.sh
pnpm generate:secrets / pnpm apply:secrets / pnpm set:prod-vars
pnpm sync:internal-service-key    # bash scripts/sync-internal-service-key.sh
pnpm check:ecosystem[:local]      # bash scripts/check-ecosystem-readiness.sh

# Eval / coverage / changelog (node/tsx)
pnpm check:eval-gate              # node scripts/check-eval-gate.js
pnpm eval:harness                 # node scripts/run-eval-benchmark.js
pnpm coverage:aggregate           # node scripts/aggregate-coverage.mjs
pnpm changelog                    # npx tsx scripts/generate-changelog.ts
pnpm audit:deps:security          # node scripts/audit-dependency-security.mjs

# Continuous agent loop (bash)
pnpm agents:continuous            # bash scripts/agents-continuous-workflow.sh --mode local-dev --cycles 1
```

**(b) Direct invocation by path** (the majority — verifiers, deploys, E2E):

```bash
bash scripts/verify-byok-e2e.sh           # needs ADMIN_SECRET; RECODER_BASE_URL default https://recoder.xyz
bash scripts/sso-logout-matrix.sh         # BASE_URL / AGENTS_URL / … overridable; SSHes to Hetzner to verify
bash scripts/selfhost-up.sh               # docker compose self-host bring-up
node  scripts/e2e-agents-auth.mjs         # Playwright E2E (needs playwright installed at root)
scripts/recoder-services.sh up|down|health [service]
node  scripts/recoder-conductor.mjs run --runtime claude_code --prompt "…" --repo ./repo
```

The local `scripts/package.json` test surface is effectively non-functional: its
`deploy`/`test-all`/`release` targets reference files that are absent. Treat the **root**
`package.json` and direct paths as the real interface.

## 5. Key patterns & contracts

- **Bash verifier shape (dominant):** `#!/usr/bin/env bash` + `set -euo pipefail`,
  `require_cmd curl/jq`, env-overridable `*_URL` bases that default to live
  `https://*.recoder.xyz`, `PASS`/`FAIL` counters with `pass()`/`fail()` helpers, and a
  non-zero exit on failure. Verified in `verify-byok-e2e.sh:1`–`:40`, `sso-logout-matrix.sh:1`–`:30`.
- **Honest / degrade-safe health:** scripts explicitly report missing deps rather than
  faking healthy (e.g. `recoder-services.sh` header; `selfhost-up.sh` "FAILS FAST … No
  stubs, no faked success"). Matches the repo's "never imply success without evidence" rule.
- **Phase gates emit artifacts:** `phase3-production-gates.sh` writes
  `$OUT_DIR/$RUN_ID.log` + `-summary.md/.json` + `-scorecard.md/.json` +
  `-connectors-support.md/.json` to `logs/phase3-gates/` — these are the auditable
  evidence the Agent OS rules expect.
- **Agent OS HTTP contract (TS smokes):** `agent-os-smoke.ts` hits `/api/agent-os/health`,
  `/api/agent-os/agents`, `/api/agent-os/spaces`, `/api/mcp` on
  `RECODER_AGENT_OS_URL` (default `http://localhost:3002`), optional
  `Bearer ${RECODER_API_TOKEN}`, and expects the `{ data: … }` envelope.
- **A2A envelope contract:** `a2a-smoke.ts` builds a signed A2A envelope
  (`protocolVersion 0.3.0`, `envelopeVersion 2026-06-06`, HMAC-SHA256 of
  `${timestamp}.${body}` with `RECODER_A2A_SHARED_SECRET`, headers
  `x-recoder-a2a-timestamp` / `x-recoder-a2a-signature`). This is the reference for the
  wire contract enforced server-side.
- **Cross-subdomain auth helper:** `lib/recoder-auth.mjs` parses a base64url Better-Auth
  `SESSION_DATA` blob and emits cookies on domain `.recoder.xyz`
  (`_Secure-recoder.session_data`, `recoder.session_token`,
  `__Secure-recoder.session_token`). E2E scripts reuse this for authenticated Playwright runs.
- **Instruction-spine guard:** `check-agent-instructions.ts` asserts `CLAUDE.md` imports
  `@AGENTS.md`, `.codex/AGENTS.md` references `../AGENTS.md`, and `.gitignore` unignores
  `.codex/AGENTS.md` — a CI tripwire protecting the agent policy layering.
- **beads (`bd`) integration:** `beads-*.ts` shell out to the `bd` CLI with `--json` and
  re-emit `{ ok, mode: 'read-only', source: 'beads', … }`. They are read-only wrappers,
  not state owners.
- **Deploy SSH contract:** deploy scripts target `root@77.42.23.19`, remote
  `/root/recoder.xyz`, prefer key `~/.ssh/id_ed25519_hetzner`, with keep-alive SSH opts
  (`deploy-all-services.sh:13`–`:18`). Memory note: deploy **sequentially** (parallel SSH maxes connections).

## 6. Gotchas

- **CHECKED-IN PRODUCTION SECRET (high severity).** `e2e-agents-auth.mjs:3`–`:4` hardcode
  a **real Better-Auth production session** for the owner account
  (`SESSION_DATA` decodes to user `subasiarhan3@gmail.com`, a real user id, IP
  `94.55.235.67`, and a live `SESSION_TOKEN`). `lib/recoder-auth.mjs` and other E2E
  scripts re-extract these. This is a real credential committed to the repo, not a stub —
  it should be rotated/externalized. The expiry in the blob (`2026-04-30`) is already
  past, but the pattern of embedding live session tokens persists across the E2E scripts.
- **`scripts/package.json` is partly dead.** `deploy.js`, `test-all.js`, `release.js`
  (referenced by `npm run deploy|test-all|release`) **do not exist** in the directory.
  Use root `package.json` targets and direct paths instead.
- **Local `node_modules/` island.** `scripts/` carries its own `node_modules/` (axios,
  chalk, ora, fs-extra, semver) and `package.json`. It is a self-contained dep set for
  the plain-`node` `.js` scripts; the `.ts`/`.mjs` scripts instead rely on the **root**
  workspace (`tsx`, `playwright`). Don't assume one install covers both.
- **`.mjs` files written in TypeScript.** `recoder-conductor.mjs` uses typed function
  params (`function curl(method: string, …)`). It must be run through `tsx`/a TS loader,
  not bare `node file.mjs`, despite the `.mjs` extension.
- **Many scripts hit LIVE production.** Verifiers default `*_URL` to `https://*.recoder.xyz`
  and several (`sso-logout-matrix.sh`, deploy scripts) **SSH into the production Hetzner
  box** and run admin/seed endpoints. Read the env-default block before running; pass
  local `BASE_URL`/`RECODER_BASE_URL` overrides for dev. Honor the memory rule: no
  parallel SSH, no destructive prune without approval.
- **Checked-in run logs are artifacts, not code.** `vendor-green.log`,
  `vendor-variants.log` are stale output from `vendor-*.sh` runs; ignore them as docs.
- **Flat namespace, prefix-driven grouping.** There is no subdirectory taxonomy; the
  "structure" is purely the file-name prefix (`verify-`, `check-`, `phase3-`, `e2e-`,
  `deploy-`). Grep by prefix to find related scripts.
- **`phase3-production-gates.sh` uses `set -uo pipefail` (no `-e`)** and
  `CONTINUE_ON_FAIL=true` by default, intentionally collecting all gate results rather
  than bailing on first failure — unlike the verifiers' strict `set -euo pipefail`.
