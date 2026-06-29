# Recoder — Product Requirements (PRD)

> What we're building and why, in requirement form. Pairs with
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) (how) and [`ROADMAP.md`](./ROADMAP.md)
> (when). Product line in [`PRODUCTS.md`](./PRODUCTS.md).

## 1. Problem
Developers increasingly run AI coding agents (Claude Code, Codex, Cursor, pi),
but running **several at once** is chaos: no isolation (agents stomp each other),
no shared context (each re-reads the repo), no review surface (you can't see what
each did), no controls (nothing gates a risky write), and no audit. Teams have no
safe way to let a fleet of agents work in parallel.

## 2. Users
- **Solo developer (BYOK)** — runs 2–8 agents in parallel on their Mac, their keys.
- **Team lead** — wants the same with approvals, shared context, and an audit trail.
- **Enterprise / regulated** — needs self-host, SSO, device control, tamper-evident
  audit, and a zero-trust boundary around autonomous agents.
- **Other agents** — external agents/automations that drive Recoder via MCP/A2A.

## 3. Product (one line)
A **local-first OS for running your own coding agents in parallel** — isolation via
git worktrees + tmux, one shared brain, work-locks + A2A coordination, governance +
tamper-evident audit — desktop-first (BYOK), with a cloud control plane for identity,
billing, teams, and a zero-trust mesh.

## 4. Functional requirements

### FR-1 Run any agent (BYOK)
- Run Claude Code, Codex, pi, open-agents, opencode via one driver contract.
- Use the user's existing login/keys; never proxy or resell tokens.
- Per-workspace substrate: **local** (tmux + git worktree, `dmux` console) or
  **remote** (Daytona sandbox) — same lifecycle, transparent choice.

### FR-2 Parallel workspaces
- Each agent gets an isolated git worktree on a fresh branch.
- Restart-survivable: sessions + state outlive the host process; a reconciler
  re-derives truth from tmux/git.
- Work-locks prevent two agents from colliding on the same files.

### FR-3 See / review / merge
- Live output stream per workspace; a "what changed" summary; truthful state
  badges (running / ready / awaiting-review / merge-conflict).
- Read-only diff view; merge or open a PR from the app.

### FR-4 Shared brain
- One repo context/memory (code-graph + mem0 + docs) shared across agents so they
  don't each re-read the repo; cuts repeat token spend.

### FR-5 Governance + audit
- Every risky action (file write to secrets, branch push, PR create) is gated:
  **allow / needs-approval / deny**, fail-closed, decided by the owned kernel.
- Tamper-evident **Merkle audit chain** of decisions + actions.

### FR-6 Auth + device (identity & access)
- **Device-flow sign-in**: the desktop/CLI authenticates via OAuth 2.0 Device
  Authorization Grant against recoder.xyz (no embedded browser/secret).
- **Device recognition / registry**: each install registers a device (fingerprint
  + name + OS); the control plane lists active devices, supports per-seat **device
  limits**, remote **revoke/sign-out**, and "new device" notification. Enterprise
  can require device approval before a seat activates.
- Cross-subdomain SSO; recoder.xyz is the auth source of truth.

### FR-7 Billing (BYOK economics)
- **Polar Merchant-of-Record** (Turkey/no-Stripe constraint): users keep model
  spend; pay Recoder for orchestration/seats/approvals/retention.
- Tiers Free / Pro / Team / Enterprise; entitlement gate that **fails safe to deny**
  when billing is unconfigured; checkout → webhook → entitlement, subject-linked.

### FR-8 Interop (agents in + out)
- **MCP server** + **A2A** so external agents/CLIs drive Recoder as a tool.
- **Connectors**: Slack/Telegram/Discord/etc. — hostile-by-default, signature-verified
  ingress → the same workspace loop; notify channels of run state.

### FR-9 Teams / cross-machine (Envoy mesh)
- **Envoy** L7 data plane fronts the cloud/team runtime host: **mTLS** between
  nodes, an **`ext_authz` filter that calls governance and fails closed**, JSON
  access logs. **`recoder-xds`** (Go control plane) serves dynamic LDS/CDS/RDS over
  ADS so the mesh reconfigures without restarts.
- Cross-machine fleets: a team shares workspaces/audit across machines through the
  mesh.

### FR-10 Security telemetry (XDR)
- **XDR** turns Envoy access logs into security **detections** (anomalous
  principals, denied-action bursts, unexpected egress) and seals them into the
  governance Merkle audit. Surfaced to admins; the enterprise compliance story.

### FR-11 Self-host (AMI)
- Ship Recoder Cloud as a **machine image (AMI / packer)** + a one-command
  `docker-compose.selfhost.yml` so regulated customers run the control plane
  (host + governance daemon + Envoy + xDS) in **their own VPC**; desktops point at
  their control plane instead of recoder.xyz.

## 5. Non-functional requirements
- **Local-first / privacy**: code never leaves the machine unless the user opts
  into remote (Daytona) execution.
- **Restart-survivable**: the proven moat (tmux + worktrees + state-of-record +
  reconciler). No node-pty (can't survive restarts).
- **Truthful health**: never imply success without evidence; degrade safely when a
  key/dependency is missing (explicit "not configured", not a fake-ready).
- **Fail-closed security**: governance/ext-authz deny on error; no secret in repo.
- **Cross-platform path**: macOS first; Windows/Linux via the same Electron + driver
  contract.

## 6. Success criteria (v1)
- A user can **download → sign in → run a real agent → review → merge**, entirely
  on their Mac, in under 5 minutes.
- The shipped app **uses the real stack** (tmux + runtime drivers + governance
  kernel + brain), not stubs.
- Free works BYOK; a paid tier gates a real capability through Polar.
- A team can share an audited fleet across two machines via the Envoy mesh.

## 7. Out of scope (v1)
- Hosting/serving models (BYOK only). A web-based code editor ("nobody codes on
  web"). Non-coding agents. Mobile *authoring* (mobile is monitor/approve only).
