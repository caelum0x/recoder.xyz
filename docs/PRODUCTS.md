# Recoder — Product Line

> The shippable products and how the monorepo powers each. Pairs with
> [`PRD.md`](./PRD.md) (requirements), [`ARCHITECTURE.md`](./ARCHITECTURE.md)
> (design), [`DIRECTORY-MAP.md`](./DIRECTORY-MAP.md) (every tree → job).

One company, one stack, four products around a single loop: **run your own coding
agents in parallel, safely.**

---

## 1. Recoder Desktop — *the core product*
A self-contained Mac app that runs parallel coding agents on your machine.

- **What it is:** a 3-pane console — workspaces sidebar │ agent conversation +
  change summary │ diffs + terminal + PR/merge. Opens, boots its own local backend,
  runs your agents in isolated git worktrees (tmux), shows you what each did.
- **Key features:** parallel worktree isolation · BYOK (Claude Code/Codex/pi/
  open-agents/opencode, your login) · live output + review + merge/PR · one shared
  brain · governance gates risky writes · restart-survivable.
- **Powered by:** `apps/desktop` (Electron + cockpit) → embeds `docker-backend`
  (host) → `packages/{substrate,runtime,coordination,brain,governance,agent-os}` +
  `c/tmux` + `ts/{dmux,opencode,oh-my-codex,recodergit}`.
- **Install:** `.dmg` (electron-builder) · `brew install --cask recoder`
  (`homebrew-recoder`).
- **Proof it's a real product (not a shell):** two headless, runnable proofs back
  the core loop without a BYOK key.
  - **Embedded-backend boot** — `apps/desktop/scripts/dev-boot-proof.js` drives the
    desktop `BackendSupervisor`, boots the embedded `docker-backend` (tmux + engines
    host), mints a real platform key, and asserts `GET /api/conductor/health`
    returns 200 with the substrate shape `{ available, git, tmux, tmuxBin }`.
    Exit 0 = PASS; never fakes readiness.
  - **Headless conductor loop** — `docker-backend/scripts/e2e-conductor-loop.ts`
    drives the real fused loop (`workspace-service.createWorkspace` → run-tailer →
    completion-watcher) over a BYOK-free in-process substrate, asserting
    `created → running → awaiting_review` with real RunEvents and a review handoff.
    Run `cd docker-backend && npx tsx scripts/e2e-conductor-loop.ts` (exit 0 = PASS).
- **Plan:** Free (BYOK, local, core loop). Pro adds more parallel agents, retention,
  context reuse.

## 2. Recoder Cloud — *identity, billing, control plane* (recoder.xyz)
The spine that monetizes + connects the desktop.

- **What it is:** auth (Better Auth, source of truth) · **device-flow sign-in** +
  **device registry/recognition** · billing (Polar MoR) · downloads/releases ·
  the marketing site · the optional cloud runtime host (remote substrate).
- **Key features:** OAuth device authorization grant for desktop/CLI · per-seat
  **device limits + remote revoke + new-device alerts** · entitlement gate
  (fail-safe deny) · checkout→webhook→entitlement (subject-linked).
- **Powered by:** `app/` (Next auth/data) · `site/` (marketing) ·
  `packages/{auth,distribution}` · `py/recoder-billing` (Polar engine) ·
  `docker-backend` (cloud host).
- **Plan:** the billing + identity layer under every paid tier.

## 3. Recoder for Teams / Enterprise — *the moat*
Shared, audited agent fleets across machines, optionally self-hosted.

- **What it is:** a team shares workspaces + audit across machines through a
  **zero-trust Envoy mesh**, with security telemetry (**XDR**), seats/SSO, and a
  **self-host AMI** for regulated customers.
- **Key features:**
  - **Envoy mesh** — L7 data plane fronting the cloud/team host: mTLS, an
    `ext_authz` filter that calls **governance and fails closed**, JSON access
    logs. `recoder-xds` (Go) serves dynamic config over ADS (no-restart updates).
  - **XDR** — Envoy logs → security detections (anomalous principals, denied-action
    bursts, unexpected egress) → sealed into the **Merkle audit** chain. The
    compliance/"who-did-what" surface.
  - **Remote substrate (Daytona)** — flip workspaces to run off-machine (CI, scale,
    no local resources).
  - **AMI self-host** — Recoder Cloud as a machine image (`deploy/packer`) +
    `docker-compose.selfhost.yml`: host + governance daemon + Envoy + xDS in the
    customer's VPC; desktops point at *their* control plane.
  - **Device recognition** — enterprise device approval before seat activation;
    fleet device inventory + revoke.
  - SSO / OIDC · seats · usage metering · webhooks.
- **Powered by:** `packages/{network,governance,distribution,interop}` ·
  `go/recoder-xds` · `crates/recoder-governance` (Rust kernel) · `deploy/` (AMI,
  compose) · `py/ops-recorder` (work signals).
- **Plan:** Team and Enterprise tiers.

## 4. Recoder for Agents — *interop surface* (CLI / MCP / Skill)
Recoder as a tool other agents and channels drive.

- **What it is:** an **MCP server** + **A2A** endpoints + a portable **skill** so a
  developer's Claude Code/Codex (or Slack/Discord) can create workspaces, run
  tasks, fetch artifacts, and get approvals — driving the same loop.
- **Key features:** MCP tools (list/run/inbox/sandbox-exec/respond) · A2A wire
  contracts · signature-verified connector ingress (Slack/Telegram/Discord/Signal/
  WhatsApp/iMessage/Line/Feishu/Discord) · the skill wrapping `/api/v1`.
- **Powered by:** `mcp/` · `packages/{interop,agent-mcp,a2a-sdk,cli,recoder-a2a}` ·
  `shared/src/a2a` · `ts/extracted-from-openclaw` (connectors) · `recoder-skill`.
- **Plan:** included; expands the surface area of every tier.

---

## Pricing ladder (honest, BYOK-first)
| Tier | Who | What it adds | Status |
|------|-----|-------------|--------|
| **Free** | solo | core loop, BYOK, local, a few parallel agents | the product |
| **Pro** | power solo | more parallel agents, retention, context reuse, priority | coming soon |
| **Team** | teams | shared fleet, approvals, audit, cross-machine mesh, seats | coming soon |
| **Enterprise** | regulated | SSO, device control, XDR audit, AMI self-host | sales-gated |

*BYOK always: you keep model spend; you pay Recoder for orchestration, reliability,
approvals, audit, and control — not tokens.*

---

## What each surface needs to ship (cross-ref ROADMAP)
- **Desktop**: M1 (self-contained boot) → M4 (signed dmg + brew).
- **Cloud**: M2 (device-flow + entitlement) → M3 (deploy + billing live).
- **Teams/Enterprise**: M5 (Daytona remote, Envoy/xDS mesh, XDR, AMI, seats).
- **Agents/MCP**: already live (hardened); expands with each tier.
