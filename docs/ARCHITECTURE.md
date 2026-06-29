# Recoder — Product Architecture

> The OS for running **your own** coding agents in parallel. A Mac app that runs a
> local conductor (tmux + git worktrees + owned engines) entirely on your machine
> (BYOK), with a cloud control plane (recoder.xyz) for identity, billing, teams,
> and agent interop. Desktop like Conductor/Cursor; cloud as the spine that
> monetizes + scales it.

This is the canonical architecture. Every directory in the monorepo maps to a job
here. Build order is the **Roadmap** at the bottom.

---

## 0. The one product, two surfaces

1. **Recoder Desktop** — the paid product. A self-contained Mac app that **boots
   a local runtime host** and runs your agents on *your* machine, BYOK.
2. **Recoder Cloud** (`recoder.xyz`) — the control plane: auth/identity, billing
   (Polar MoR), distribution, teams/enterprise (seats, governance audit,
   cross-machine mesh), and the agent-interop surface (MCP/A2A + connectors).

The desktop **authenticates + bills** through the cloud but **runs agents 100%
locally**. Code never leaves the machine unless the user opts into remote
execution. That single split is what makes the engines *used by the product*
instead of tested in isolation.

---

## 1. How we actually run a user's agent  ← the core mechanism

The product question: *how do we run the user's Codex / Claude Code / pi /
open-agents / opencode?* Answer: one contract, swappable substrates, BYOK.

### 1a. The driver contract (`packages/runtime` + `ts/` forks)
`packages/agent-runtimes` defines a `RuntimeDriver`. One driver per agent CLI,
each fused from a vendored `ts/` engine with provenance:

| Agent | CLI invoked | Driver / fused source |
|-------|-------------|------------------------|
| Claude Code | `claude -p <prompt>` (or interactive) | `packages/runtime/drivers/claude-code` |
| Codex | `codex` | `packages/runtime/drivers/codex` (← `ts/oh-my-codex`) |
| pi | `pi` | `packages/runtime/drivers/pi` (← `@mariozechner/pi-*`) |
| open-agents | the open-agents runner | `packages/runtime` (← `ts/open-agents` / `ts/oh-my-openagent`) |
| opencode | `opencode` | `packages/runtime/drivers/opencode` (← `ts/opencode`) |
| in-process | owned tool loop | `packages/runtime/drivers/in-process` (read/write/edit/grep/bash) |

**BYOK auth**: the driver runs the agent CLI *exactly how the user is already
logged in* (Claude Pro/Max session, or an API key, or OpenRouter). Recoder never
proxies the model or resells tokens — same posture as Conductor. Keys are the
user's; we charge for orchestration.

### 1b. The substrate (where the CLI physically runs) — `packages/substrate`
The same `Workspace` lifecycle (`create → setting_up → ready → running →
awaiting_review → merged/archived`) over a swappable substrate:

- **`tmux_worktree` (LOCAL — the default desktop path)** — `c/tmux` (vendored,
  pinned, resolved via `TMUX_BIN`) + a fresh **git worktree** on a new branch.
  The agent CLI runs **backgrounded in a tmux session** inside the worktree.
  **`dmux`** is the operator console that visualizes/controls those tmux panes
  (the "conduct" view). Restart-survivable: the tmux session + worktree outlive
  the Node process; a reconciler re-derives truth from `tmux`/`git`. *This is the
  "runs entirely on your Mac" path.* node-pty was tried and reverted — it can't
  survive restarts; that scar tissue is the moat.
- **`daytona` (REMOTE — cloud / team / mobile / scale path)** — the conductor
  creates a **Daytona sandbox** (remote container), clones the repo by URL,
  runs the **same agent CLI** backgrounded with `nohup`, writes an exit marker.
  Output = `tail` the log; alive = exit-marker check; diff = git in the sandbox;
  teardown = `deleteSandbox`. Use when: running from mobile, at scale, in CI, or
  when the user wants execution off their machine. (`packages/agent-sandbox`,
  `packages/daytona-api-client`, `docker-backend/src/daytona-client.ts`.)
- **`in_process`** — the runtime's own tool loop for lightweight/embedded runs.

**The choice is per-workspace**, transparent to the orchestration layer:
`Workspace.substrate ∈ {tmux_worktree, daytona, in_process}`. Local-first for the
desktop product; Daytona for cloud/remote. dmux is the *console* over local tmux,
not a separate substrate.

### 1c. The run loop (identical regardless of substrate)
`cockpit → POST /api/conductor/workspaces {prompt,...}` → conductor persists the
record (state-of-record) → **work-lock** (coordination) so parallel agents don't
collide → substrate provisions (worktree+tmux *or* sandbox) → **governance** gates
the launch (Rust kernel: allow / needs_approval / deny, fail-closed) → driver runs
the agent CLI → **run-tailer** streams output as `RunEvent`s → **brain** supplies
shared repo context/memory → review the **diff** → merge / open PR.

---

## 2. Layers — every directory mapped

### L0 · Substrate (where agents run)
`c/` (tmux) · `packages/substrate` (contract) · git worktrees ·
`packages/agent-sandbox` + `packages/daytona-*-client` + `docker-backend/daytona-client.ts` (remote) ·
`ts/dmux` (operator console over tmux)

### L1 · Engines (owned brains — `packages/` + `crates/` + `go/` + `py/` + `ts/`)
- **`agent-os`** — canonical state spine (tasks/runs/approvals/artifacts/memory/
  workspaces/policies/instructions). *Every engine is an adapter around this; it
  owns state, adapters never do.*
- **`runtime`** (+ `ts/` opencode/dmux/codex/open-agents forks) — the agent drivers (§1a)
- **`governance`** (+ `crates/recoder-governance` Rust kernel over UDS IPC) — policy / approval / **Merkle audit**
- **`brain`** (+ `ts/recodergit` code-graph + `py/mem0` + `context7`) — shared context/memory
- **`coordination`** — work-locks + A2A bus + handoff (parallel agents don't collide)
- **`network`** (+ `go/recoder-xds`) — **Envoy** zero-trust mesh + **XDR** (teams/enterprise, §3)
- **`distribution`** (+ `py/recoder-billing` Polar MoR) — device-flow auth + entitlements + billing
- **`interop`** (+ `shared` a2a contracts + `mcp/` + `ts/extracted-from-openclaw` connectors) — A2A/MCP + Slack/Discord/Telegram/etc.

### L2 · Runtime Host — `docker-backend`
Mounts the L1 engines; exposes `/api/conductor`, `/api/agent-os`, `/api/a2a`,
`/api/connectors`. **Runs in two places**: embedded in the desktop app (local,
per §0) **and** in the cloud (teams/remote-substrate). Same code, different host.

### L3 · Surfaces
`apps/desktop` (cockpit + Electron — **the paid product**) · `apps/mobile`
(monitor/approve on the go via `/api/a2a`) · `app/` (recoder.xyz — Better Auth
source of truth + project/billing data) · `site/` (marketing/download) · `mcp/` +
`packages/cli` + `recoder-skill` + `skills/` (agents drive Recoder; Recoder is a
tool for other agents) · `apps/agent-gateway` + `apps/agent-worker` (standalone
scale-out of the host)

### L4 · Distribution
`homebrew-recoder` (brew tap) · electron-builder (signed/notarized `.dmg`) ·
`packages/distribution` (device-flow + entitlement gate) · `deploy/packer` (**AMI**, §3)

### Cross-cutting
`skills/` (agent capabilities: brave-search/browser-tools/recoder-platform/yt) ·
`tools/` (CI: a2a-interop, branding-drift, evals, security-secrets, tsconfig) ·
`tasks/` (internal lessons/todo — **not product**) · `shared/` (a2a wire contracts)

---

## 3. Envoy · XDR · AMI  (the cloud / teams / enterprise spine)

These are **not** in the local desktop path — they are the cloud + enterprise moat.

- **Envoy** (`packages/network` data-plane config + `go/recoder-xds` control
  plane): the L7 zero-trust mesh fronting the **cloud** runtime host and, for
  **teams**, routing cross-machine agent traffic. mTLS between nodes;
  `ext_authz` filter → **governance** (fail-closed: if governance is down, the
  edge denies); JSON access-logs. `recoder-xds` serves dynamic LDS/CDS/RDS over
  ADS so config updates without restarts; `generateXdsBootstrap()` is the Envoy
  client. Cross-language contract pins NodeID/filter-order TS↔Go.
- **XDR** (`packages/network/xdr`): turns Envoy access-logs into security
  detections (e.g. anomalous principals, denied-action bursts) sealed into the
  governance **Merkle audit** chain. This is the **enterprise compliance
  surface** — tamper-evident "who did what" across an agent fleet.
- **AMI / self-host** (`deploy/packer/recoder.pkr.hcl` +
  `docker-compose.selfhost.yml`): ship **Recoder Cloud as a machine image** for
  enterprises who must run the control plane in their own VPC. One image boots
  the host + governance daemon + Envoy + xDS. The local desktop talks to *their*
  control plane instead of recoder.xyz.

**Where each runs:** local desktop = tmux/dmux substrate, no Envoy. Cloud/teams =
Envoy mesh + Daytona-or-remote substrate + governance daemon + XDR. Enterprise =
the same, shipped as an AMI in their VPC.

---

## 4. The v1 flow

`brew install recoder` / download `.dmg`
→ **sign in** (device-flow → recoder.xyz Better Auth)
→ **entitlement check** (`distribution` → Polar; free tier works BYOK)
→ **app boots the local runtime host** (embedded `docker-backend` on a loopback
  port, `TMUX_BIN`→bundled `c/tmux`, governance daemon optional)
→ **add a repo** → conductor makes a **worktree** + runs **your agent** (Claude
  Code/Codex/pi/open-agents) in a **tmux session** (dmux console)
→ governance gates risky writes · brain shares context · coordination prevents
  collisions across your parallel agents
→ **review the diff** → merge / open PR.
Connectors + MCP let Slack / external agents drive the same loop. Mobile monitors
+ approves. Remote/scale runs flip the substrate to **Daytona**.

---

## 5. Roadmap to a shippable v1 (ordered by leverage)

1. **Self-contained desktop** — Electron **spawns + bundles the local runtime
   host** (`docker-backend` + `c/tmux` + the engines) and points the cockpit at
   it. *The unlock: turns the `.dmg` from an empty shell that 404s into a working
   product that actually uses tmux(C)/runtime(TS)/governance(Rust)/packages.*
2. **Auth + entitlement in the app** — device-flow sign-in → recoder.xyz → gate
   (+ the email-verification stopgap so login works).
3. **Cloud control plane live** — deploy recoder.xyz app + a cloud runtime host;
   billing live (needs real Polar keys); Envoy mesh in front of the cloud host.
4. **Distribution** — signed/notarized `.dmg` + brew tap + site download wired to
   real GitHub releases (and a real product icon).
5. **Teams / Enterprise** — cross-machine via the Envoy/xDS mesh + Daytona remote
   substrate; XDR audit; seats; the AMI self-host image. *The monetization moat.*

Each step is gated on the one before it being genuinely runnable — no step is
"done" until it runs end-to-end, not just compiles.
