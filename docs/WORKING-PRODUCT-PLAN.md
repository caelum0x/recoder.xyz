# Recoder — Make It Actually Work (working-product plan)

> Code-grounded plan (repo + live server probes): get ONE real end-to-end flow working — Google login -> dashboard -> launch a conductor agent run -> watch output -> see diff. The conductor backend is complete + committed but has NO UI front door; building it is the highest-leverage ungated work.

## Make Recoder Actually Work — Head-of-Product Plan

This plan is grounded in code I verified, not aspiration. The honest summary: **the engines are real, the wiring and provisioning are not.** Three independent areas each have one fatal gap. Two of those gaps are pure code (no secrets). One area (payments) is fully gated on a Polar org. We attack the code-only gaps first to get ONE provable end-to-end flow, and we explicitly fence off the gated items so they never block starting.

### 1) Honest current reality (per area)

**Auth (Better Auth on recoder.xyz)**
- WORKS: API mounted and live, email+password **signup** creates a real persisted user, password hashing/verify works, Google/GitHub social login returns a real consent URL (a user CAN log in via Google today), DB healthy, cross-subdomain cookie config coherent in `packages/auth`.
- BROKEN: email+password **login** is fully blocked. Live config (`/root/recoder.xyz/app/lib/auth-config.ts`) sets `requireEmailVerification:true`; verification email is never delivered because `lib/email.ts` "auto" mode prefers SMTP, `SMTP_HOST` is unset so it defaults to `localhost:25`, and Hetzner blocks outbound port 25 → mail deferred/lost. The valid Resend key is never reached. `/api/health` falsely reports `smtpConfigured:true`.
- KEY CONSTRAINT I verified locally: the live `auth-config.ts` and `email.ts` are **not in this repo checkout** (`ls app/lib/auth-config.ts` → no such file). They exist only server-side. The repo `packages/auth` has **no** `requireEmailVerification`, so the repo hides the real failure. This means the email fix touches server-resident files and must be reconciled back into the repo — it is NOT a clean local-only change. **For the first vertical slice we deliberately route around email entirely by using Google social login**, which already works end-to-end.

**Conductor (logged-in user → launch + watch a real coding-agent run)**
- WORKS: the backend is genuinely complete. I verified `conductor.routes.ts` (21KB) is committed on this branch and mounted at `server.ts:12327` behind `authenticateRequest`. Full REST surface exists: `POST /api/conductor/workspaces`, `GET /workspaces/:id`, `GET /workspaces/:id/output`, `GET /workspaces/:id/status`, `POST /workspaces/:id/steer`, `GET /workspaces/:id/diff`, `POST /workspaces/:id/pr|merge|archive`, plus a WS `/workspaces/:id/stream`. Standard `{success,data}` envelope. Control plane (persist-before-launch, write-lock, run-tailer, reconciler) is real.
- BROKEN — two fatal gaps:
  1. **No UI calls it anywhere.** I grepped `recoder-web app recoder-agents recoder-pm recoder-agency` for `api/conductor` → **zero matches.** No create form, no run list, no live terminal, no diff/PR view. The headline product has no front door.
  2. **Not deployed.** Per the investigation: nothing listens on prod `:3001`, no node/tsx process, `tmux list-sessions` errors, the PM2 "recoder-backend" is the legacy Python gunicorn on `:8000`, and the server's git HEAD predates the conductor entirely.

**Payments (Polar Merchant-of-Record)**
- WORKS: code compiles, routes mounted, typed Polar adapter with Zod + unit tests, genuinely fail-safe (no token → deny, no faked allows), real webhook signature verification, legacy JSON-store path can flip a tier.
- BROKEN: zero Polar credentials (every key is an empty placeholder) so the whole subsystem sits in deny mode. AND two competing billing stacks with a broken subject-linkage: the new distribution webhook only emits an audit RunEvent and never writes the store the plan gates read; checkout sets `metadata.recoder_subject` but legacy handlers key off `metadata.userId`; nothing registers the recoder userId as the Polar customer `external_id`, so even with keys a real payment would not reliably grant an entitlement.

### 2) THE minimal working vertical slice (target this first)

**Google login → land in dashboard → create ONE conductor workspace from a prompt → watch its live output → see the diff.**

Chosen because it proves the product is real with the fewest gated dependencies:
- It **skips the broken email path** by using Google social login (already works today).
- It **skips payments** entirely (entitlement is optional polish, fully gated on Polar).
- It exercises the genuinely-complete conductor engine via its existing, unchanged contract.
- Every step except the final "real agent CLI run on prod" is codeable now; even the run can be proven **locally** against `docker-backend` on `:3001` with a local tmux + claude CLI, decoupling proof-of-product from the prod deployment decision.

The slice is provable in two stages: (a) **local proof** — run docker-backend locally, drive the new UI against `localhost:3001`, launch a real `claude -p` workspace, watch output, see diff; this alone proves the product is real. (b) **prod rollout** — gated, handled separately.

### 3) Ordered codeable-now steps (no external secrets)

All of these can be done from this checkout against the **unchanged** `/api/conductor/*` contract I verified.

1. **Typed conductor API client** wrapping the real endpoints (`createWorkspace`, `getWorkspace`, `getOutput`, `getStatus`, `steer`, `getDiff`, `listWorkspaces`). Payload for create is exactly: `{spaceId, projectId, taskId, repoPath, runtimeId, createdBy, prompt}` (verified required at `conductor.routes.ts:163-202`). All return `{success,data}`.
2. **Default-fill the create payload** so the user only types a prompt: default `runtimeId:'claude'`, a seeded `repoPath`, and derive `spaceId/projectId/taskId/createdBy` from the session — collapsing the 7-field schema to one prompt box.
3. **Live terminal component**: open WS `/api/conductor/workspaces/:id/stream`, render `{type:'event'}` RunEvents; fallback to polling `GET /output?lines=` every ~2s (run-tailer already feeds it).
4. **Run list + state badges**: reuse `GET /api/conductor/workspaces`; render `create→setting_up→ready→running→awaiting_review` truthfully from persisted state. Per the frontend rule, show real state labels, not "AI is working".
5. **Diff view**: `GET /workspaces/:id/diff` rendered read-only; this completes the "review" leg of the slice without needing the gated PR/merge path.
6. **Same-origin proxy** in the deployed dashboard's Next app that forwards `/api/conductor/*` to the docker-backend base URL with the user's session (mirrors how the app already proxies platform URLs via `lib/config/platforms.ts`), so `authenticateRequest` sees a valid session.
7. **Local-run harness** (Makefile target / script) to start `docker-backend` (Express on 3001) with system tmux resolved by `tmux-path.ts`, so the whole slice is provable on a dev box with no infra ticket.

Note on canonical-tree blocker: the local `app/` differs from the deployed dashboard (verified — local has no `app/lib/auth-config.ts` and no deployed `[locale]/playground`). Steps 1–5 (client + components) are framework-agnostic and land cleanly now; steps 6–7 must target whichever `app/` tree is confirmed canonical (see gated items), but that decision does not block writing the client/components.

### 4) Gated items (need the user — do NOT block starting)

**Auth / email**
- Resend domain `recoder.xyz` verified (SPF/DKIM) in the Resend dashboard; set `EMAIL_PROVIDER=resend` (or remove the localhost-SMTP fallback). The provided key is send-only and can't verify domains via API.
- OR a real outbound relay/smarthost (Hetzner blocks :25).
- `CRON_SECRET` + scheduler to drain the 48 pending onboarding emails.
- Product decision: keep `requireEmailVerification:true` vs. disable as a stopgap.
- Repo reconciliation: the live `auth-config.ts`/`email.ts` are server-only and must be checked into the repo so the email fix is auditable.

**Conductor deployment**
- Decision to build+run `docker-backend` (Node/Express :3001) on the prod box alongside/replacing the legacy Python backend; nginx route for the `/api/conductor` proxy.
- Advance server git checkout to a commit containing the conductor; merge this branch to main.
- tmux present on the prod host (build vendored tmux or install system tmux).
- Agent CLI binary (`claude`) + an Anthropic key / BYOK on the host where tmux runs, for a real `claude -p` run.
- **Confirm which `app/` tree is canonical** for the dashboard before landing the proxy/page (local diverges from deployed).

**Payments (fully gated)**
- Polar org + Pro/Enterprise products (sandbox first via `POLAR_SERVER=sandbox`).
- `POLAR_ACCESS_TOKEN`, `POLAR_ORGANIZATION_ID`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRO_PRODUCT_ID`, `POLAR_ENTERPRISE_PRODUCT_ID`.
- Decision: durable entitlement read live from Polar grants vs. cached store — determines which webhook path is canonical and is a prerequisite to fixing the subject-linkage. (Linkage fixes themselves are codeable, but pointless to prove without keys, so payments stays a separate gated track, not part of slice #1.)