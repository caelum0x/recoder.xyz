# Recoder — Integration Plan (how we connect everything into the shipping product)

> The **how-we-wire-it** companion to the design docs. This file does not restate
> *what* the product is or *when* to build it — for that read:
> [`ARCHITECTURE.md`](../ARCHITECTURE.md) (the design + run loop),
> [`PRD.md`](../PRD.md) (requirements), [`PRODUCTS.md`](../PRODUCTS.md) (product line),
> [`DIRECTORY-MAP.md`](../DIRECTORY-MAP.md) (every tree → verdict),
> [`ROADMAP.md`](../ROADMAP.md) (milestones M0–M5), and
> [`WIRE-UP-BACKLOG.md`](../WIRE-UP-BACKLOG.md) (built-but-unused → consumer).
>
> This file answers a narrower question: **by what integration mode does each
> directory connect, per surface, and in what order do we wire them?** It cites the
> SURVEY verdicts and the docs above instead of duplicating them.

---

## 0. The integration-mode rule (the spine of this whole doc)

Every connection between two trees uses exactly **one** of three modes. The mode is
not a style choice — it is dictated by the trust boundary and the lifecycle.

| Mode | When it applies | Why | Examples (SURVEY `m=`) |
|------|-----------------|-----|------------------------|
| **`in-process-import`** (fusion) | Both sides are **first-party owned** TS/JS and share the Node process. | No serialization tax, no network trust boundary, types enforced at compile time. This is the default for the engines. | `agent-os`, `pal`, `coordination`, `governance`, `brain`, `interop`, `a2a-sdk`, `substrate` → `docker-backend` |
| **`subprocess-cli`** | The thing is a **coding-agent CLI** (Claude Code, Codex, pi, opencode) **or** a process-isolated tool (governance Rust daemon, beads `bd`, `bd`-style binaries, billing IPC, MCP stdio servers). | The agent CLI *is* the unit we drive headless; it must survive Node restarts (tmux moat); a Rust/Python authority is byte-interop'd over UDS/stdio, never linked. | `claude -p`, `codex`, `pi`, `opencode` under tmux; `crates/recoder-governance` daemon (UDS); `go/beads` (`bd`); `py/recoder-billing` (IPC); `py/pal-mcp-server` (stdio MCP) |
| **`http-edge`** | A **true edge**: cross-machine, cross-trust-domain, or a browser/external client. | Only here do we pay for HTTP. A signed/authz'd boundary is *required*, not incidental. | `app/` ↔ `docker-backend` over `/api/*`; Envoy mesh (`packages/network` + `go/recoder-xds`); external agents over `/api/a2a` + `/api/mcp`; `apps/mobile` |

**The rule stated bluntly:**
1. **First-party packages fuse in-process.** If it's `@recoder/*` TS and runs in the
   same host, you `import` it. You do **not** stand up an HTTP service between two
   owned packages. (This is why `apps/agent-gateway`/`apps/agent-worker` get *folded
   into* `docker-backend`, not called over the wire — WIRE-UP backlog #2.)
2. **The coding agents are subprocesses under tmux.** Claude Code / Codex / pi /
   opencode run **backgrounded in a tmux session inside a git worktree** (`c/tmux`,
   `packages/substrate`). They survive a host restart; a reconciler re-derives truth
   from `tmux`/`git`. node-pty was tried and reverted — that scar is the moat
   (ARCHITECTURE §1b, PRD NFR "restart-survivable").
3. **HTTP only at real edges.** Browser→backend, machine→machine (Envoy), and
   external-agent→Recoder (A2A/MCP). Inside one host, never.

The rest of this doc applies this rule per comms-path and per surface.

---

## (a) The comms model — `pal` as the inter-agent bus

### a.1 What is actually communicating

Two distinct kinds of "messages" flow, and they must not be conflated:

- **Control-plane messages** between the conductor and the *runtime drivers* —
  "launch this agent on this workspace", "here's the RunEvent stream", "you're
  blocked on a work-lock". This is **in-process** (`@recoder/coordination` +
  `@recoder/runtime` fused into `docker-backend`).
- **Inter-agent handoffs** — codex → claude-code, claude-code → pi, CC → CC — where
  one agent finishes/blocks and another picks up. This rides the **handoff bus**
  (`packages/coordination/src/handoff/handoff-bus.ts`, `HandoffBus`), carried in a
  signed A2A envelope (`shared/src/a2a` + `packages/a2a-sdk`), and **planned** by
  `packages/pal`.

`pal` is **not a message transport**. It is the **decision layer** that turns a
`TaskSpec` into a `PALPlan` (`pal/src/planner.ts: planTask(task) → PALPlan`):
*which runtime team* (`agent-team.ts`), *which sandbox* (`sandbox-selector.ts`),
*which skills/tool-grants* (`skill-selector.ts`, `tool-grant-selector.ts`), *what
risk + approval* (`risk-model.ts`, `approval-estimator.ts`), *what routing*
(`routing-policy.ts`). The **bus** that carries the resulting work is
`@recoder/coordination` (locks + dispatch + handoff). pal decides; coordination
moves; the substrate runs. Keeping these separate is what makes the loop testable.

### a.2 The envelope (one shape, three carriers)

```
TaskEnvelope (shared/src/a2a) ── canonicalized by ── a2a-sdk (envelope-builders)
        │
        ├─ signed at the edge ───────────────► packages/interop  (admitSignedMcpCall,
        │                                        verifyEd25519Signature) — only for
        │                                        INBOUND external A2A/MCP (http-edge)
        │
        ├─ carried in-process between agents ─► coordination/handoff (HandoffBus)
        │
        └─ persisted as state-of-record ──────► agent-os (RunEvent / TaskSpec)
```

- **One envelope type** (`TaskEnvelope`, `shared/src/a2a`) for every agent↔agent
  message, whether the peers are two local tmux agents or a remote MCP caller.
- **Inbound from outside the host** (external Claude Code via MCP, a Slack
  connector, another machine) is **hostile-by-default**: it passes through
  `packages/interop` (signature + identity + policy + audit) **before** it becomes a
  `TaskSpec`. This is the only place signatures are verified (`http-edge`).
- **Inbound from a local sibling agent** (CC→CC, codex→pi on the same host) does
  **not** re-pay the HTTP/signature tax — it's an in-process `HandoffBus.publish(...)`
  call. Same envelope shape, in-process carrier.

### a.3 Where `pal` lives in the server run loop

The run loop today (grounded in `docker-backend/src/conductor/`):

```
cockpit ──http-edge──► POST /api/conductor/workspaces {prompt,...}
                          │  (conductor.routes.ts)
                          ▼
                 workspace-service.ts  ── persist record (agent-os = state-of-record)
                          │
        ┌─────────────────┤  ◄── PAL SLOTS IN HERE (new) ───────────────────┐
        │  planTask(taskSpec) → PALPlan  (in-process import of @recoder/pal) │
        │  → runtime team, substrate choice, tool-grants, risk, approval     │
        └─────────────────┬─────────────────────────────────────────────────┘
                          ▼
        coordination-integration.ts  ── claim-before-launch (work-lock)
                          │             (@recoder/coordination, ALREADY wired)
                          ▼
        governance-gate.ts  ── allow / needs_approval / deny  (Rust daemon, UDS)
                          │
                          ▼
        substrate-tmux.ts / substrate-daytona.ts  ── provision worktree+tmux OR sandbox
                          │
                          ▼
        runtime-driver.ts  ── spawn the agent CLI (subprocess-cli, backgrounded)
                          │
                          ▼
        run-tailer.ts  ── stream RunEvents ──► live-events.ts ──http-edge──► cockpit
                          │
                          ▼
        review.ts / review-publish.ts  ── diff → merge / PR
                          │
                          ▼  (on completion OR block)
        coordination/handoff (HandoffBus)  ── codex→claude→pi / CC→CC handoff
```

**Key fact from the code:** `@recoder/coordination` is **already fused** into the
loop — `docker-backend/src/conductor/coordination-integration.ts` builds a
`CoordinationEngine` (`buildCoordinationEngine`), does **claim-before-launch** on
dispatch and **review handoff**, degrade-safe (skips, never blocks, if the engine is
unavailable). What is **missing** is the **`pal` decision step** between
`workspace-service` persistence and the coordination claim. That is WIRE-UP
backlog **#1** (`pal` → run loop), the headline gap. The bus exists; the brain of
the loop does not call it yet.

### a.4 Concrete wiring steps (pal → run loop)

Each step is a small disjoint PR; flip the `DIRECTORY-MAP` verdict + check the
`WIRE-UP-BACKLOG` box only when the consumer imports **and** runs it end-to-end.

1. **Add the dep + import.** `docker-backend` already declares `@recoder/pal`
   transitively; add a direct workspace dep and `import { planTask } from
   '@recoder/pal'` in a new `conductor/pal-plan.ts` seam (in-process fusion — **no**
   HTTP, per the rule).
2. **Build the `TaskSpec` once** from the workspace request in `workspace-service.ts`
   and call `planTask(taskSpec)` → `PALPlan`.
3. **Feed the plan into the existing seams** (do not duplicate their logic):
   - `PALPlan.runtime/team` → `runtime-driver.ts` runtime selection.
   - `PALPlan.substrate` → `substrate.ts` substrate choice (tmux vs daytona vs in-process).
   - `PALPlan.toolGrants/skills` → `packages/agent-mcp` permission set for the run.
   - `PALPlan.risk/approval` → `governance-gate.ts` (so the gate routes by pal's risk
     tier instead of a hardcoded default).
4. **Persist the plan** as part of the run record (agent-os) so it shows in the
   cockpit (PRD FR "truthful state"; frontend rule "show provenance, not 'AI is
   working'").
5. **Handoff wiring (the agent↔agent leg):** on completion/block, the conductor
   already reaches the review-handoff path; extend it so a `PALPlan` that names a
   **next runtime** (e.g. codex implements → claude-code reviews → pi tests) emits a
   `HandoffBus.publish(envelope)` carrying the same `TaskEnvelope`. CC→CC is the
   same call with the same target runtime.
6. **Degrade-safe, like coordination:** if `planTask` throws or pal is unavailable,
   log and fall back to today's default routing — **never block a launch on the
   planner**. (Matches the existing coordination posture: dispatch errors → `skipped`,
   launch proceeds.)
7. **Test the seam:** a unit test that a workspace request produces a `PALPlan` and
   that the plan's substrate/runtime/risk actually reach the three downstream seams
   (proves "consumer imports + runs it", the WIRE-UP done-bar).

> Reasoning recap: pal fuses **in-process** because it is first-party TS sharing the
> host (rule #1). The handoff it triggers is **in-process** for local siblings and
> **http-edge (signed)** only when the peer is off-host. The agents it routes to are
> **subprocess-cli** under tmux (rule #2).

---

## (b) Per-surface wiring checklist

Ordered lists of which dirs to fuse and how, per surface, **building on**
[`WIRE-UP-BACKLOG.md`](../WIRE-UP-BACKLOG.md) (cited as `[WB#n]`) and the
[`ROADMAP`](../ROADMAP.md) milestones (cited as `[M#]`). This does not re-rank the
backlog — it groups it by the surface that consumes it.

### b.1 Server (`docker-backend` — the L2 host, the center of gravity)

This is where most fusion happens. In dependency order:

1. **`pal` → conductor run loop** `[WB#1]` — in-process; per §(a.4) above. **Highest
   leverage; do first.**
2. **Fold `apps/agent-gateway` + `apps/agent-worker` into the host** `[WB#2]` —
   in-process. The A2A ingress and the outbox/queue worker are **re-implemented
   inline** in the backend; the worker's own `index.ts` says "mount from the backend
   container". Import their queue/workflow modules into `docker-backend`; delete the
   inline re-impl; keep the standalone entrypoints only as optional scale-out
   processes (`[M3]` cloud). **Not** an HTTP hop between owned packages.
3. **`agent-workflows` → conductor** `[WB#3]` — in-process. The
   verification/approval/deploy/PR/browser-check node graph the run loop should drive
   (currently only gateway/worker import it). Wire `workflow-runner.ts` in the
   conductor to the package's runner.
4. **`agent-hooks` → run-tailer / governance gate** `[WB#4]` — **subprocess-cli**
   (the hooks CLI is a stdin/stdout evaluator, SURVEY `m=subprocess-cli`) *or*
   in-process helper calls for `artifact-capture`/`secret-scan`/`memory-candidate`.
   Gate PostToolUse deterministically.
5. **`agent-schemas` → ingress + `interop` boundary validation** `[WB#6 in map / WB#5
   here]` — in-process. Enforce the Zod guards at the request boundary (coding-style
   rule: "validate at system boundaries").
6. **`beads-adapter` → agent-os task store ↔ `bd`** `[WB#7]` — in-process adapter
   that shells to `go/beads` (`bd`, **subprocess-cli**). Two-way TaskSpec↔issue sync
   (AGENTS.md mandates `bd`).
7. **`agent-oss` → runtime/substrate dispatch** `[WB#9 map]` — in-process boundary so
   OSS frameworks (langgraph/crewai/browser-use/e2b) are replaceable execution
   surfaces, never owners of state (monorepo rule).
8. **`py/ops-recorder` → `/work-signals` ingress** `[WB#10]` — **http-edge** (it's a
   FastAPI service) **or** subprocess; emit stuck-work → handoff prompts into the
   coordination bus.
9. **`document-preprocessor` → brain RAG ingest** `[WB#11]` — in-process (needs a
   dist build first).
10. **`browser-verification` + `recoder-browser-tools` → a browser-check node**
    `[WB#12 map]` — in-process tool + a workflow node; verifies preview health (PRD
    "preview verification").

> Already-fused (do **not** re-wire): `coordination` (claim-before-launch + handoff,
> see §a.3), `governance` (Rust daemon over UDS), `substrate` (tmux/daytona),
> `brain`, `interop`, `a2a-sdk`, `agent-os`. Verdicts `keep-core` in SURVEY.

### b.2 Desktop (`apps/desktop` + `cockpit`)

The desktop **embeds** the server (in-process to the user's machine; the Electron
main spawns `docker-backend` as a child and talks to it over **loopback http** —
that is a real process boundary, so http-edge is correct here) `[M1.1 done]`.

1. **`conductor-ui` → `cockpit`** `[WB#8]` — in-process import. Replace the cockpit's
   bespoke fetch wiring with the typed `ConductorClient` (needs a dist build).
2. **`design-tokens` + `shared/src/animations` → `cockpit`** `[WB#14, WB#15]` —
   in-process. One design system + shared motion across surfaces.
3. **Bundle for `.dmg`** `[M1.2]` — electron-builder `extraResources` bundles backend
   dist + `c/tmux` + governance daemon. The bundled tmux is the **subprocess-cli**
   substrate host; the daemon is a **subprocess** over UDS.
4. **Device-flow sign-in** `[M2.1]` — `packages/distribution` in-process in the
   embedded backend; the actual sign-in hits `recoder.xyz` (**http-edge**).

### b.3 MCP (`mcp/` + `packages/agent-mcp` + `recoder-a2a`)

Recoder-as-a-tool for *other* agents. Everything here is a **boundary**, so the
modes are subprocess (stdio) and http-edge:

1. **`agent-mcp` host/registry/permissions** — in-process in `docker-backend`
   (already `keep-core`); it governs which agent may call which tool.
2. **`mcp/recoder-a2a-server.js` (live) / `packages/recoder-a2a` (published)** —
   **subprocess-cli** stdio MCP servers external agents spawn. Keep the live in-repo
   server as the wired one; the package is the publishable copy.
3. **`py/pal-mcp-server`** — **subprocess-cli** stdio (supervised external multi-model
   MCP). `park-vendor`, supervised by `interop`.
4. **Inbound MCP calls** are admitted through `packages/interop`
   (`admitSignedMcpCall`) — **http-edge**, signature-verified, hostile-by-default.

### b.4 Cloud (`docker-backend` in the cloud + `app/` + `site/`)

Same backend code, cloud host `[M3]`:

1. **`app/` (recoder.xyz Better Auth) ↔ backend** — **http-edge** over `/api/*`. Auth
   source of truth; cross-subdomain SSO (critical architecture rule #1).
2. **`py/recoder-billing` (Polar MoR)** — **subprocess-cli / IPC**, mounted at
   `/internal/agent-os/billing/*` with `INTERNAL_SERVICE_KEY` + signed envelopes
   (SURVEY note). Never a public source of task/approval state.
3. **`distribution` entitlement gate** — in-process in the backend; fails **safe to
   deny** when billing is unconfigured (security rule).
4. **`site/` download → real GitHub releases** `[M4.3]` — static edge; no backend
   coupling beyond the release URL.

### b.5 Mesh (`packages/network` + `go/recoder-xds` — teams/enterprise §3)

**Not** on the local desktop path (ARCHITECTURE §3). Pure **http-edge / mesh**:

1. **Envoy data-plane config** — `packages/network` generates the bootstrap
   (`generateEnvoyConfig`), in-process where it's generated; the config itself is
   consumed by Envoy (external process).
2. **`go/recoder-xds` ADS control plane** — **subprocess-cli** daemon serving dynamic
   LDS/CDS/RDS; contract-pinned to `packages/network` via `contract.json`.
3. **`ext_authz` → governance** — Envoy filter calls governance, **fails closed**
   `[M3.3]`. The edge denies when governance is down (PRD FR-9).
4. **XDR** — Envoy access-logs → detections → sealed into the governance Merkle
   chain `[M5.3]`. Cross-machine fleet audit.
5. **`go/ziti`** — `park-vendor` zero-trust overlay behind a thin adapter; not the
   local path.

---

## (c) What stays subprocess vs in-process vs http-edge (and why)

| Tree(s) | Mode | Reasoning |
|---------|------|-----------|
| The agent CLIs — `claude -p`, `codex`, `pi`, `opencode`, recoder-code | **subprocess-cli under tmux** | They *are* the unit we drive headless; must outlive the Node host (restart-survivable moat); node-pty reverted. ARCHITECTURE §1b. |
| `crates/recoder-governance` (Rust daemon) | **subprocess-cli (UDS IPC)** | Byte-interop authority; deny-biased, fail-closed. A different language + a hard trust boundary — never linked into Node. |
| `go/beads` (`bd`), `py/recoder-billing` (IPC), `py/pal-mcp-server`, `mcp/*` stdio servers, `agent-hooks` CLI | **subprocess-cli** | Cross-language or stdin/stdout protocol units; isolated lifecycles; one is a billing *authority* (signed envelopes + `INTERNAL_SERVICE_KEY`). |
| All `@recoder/*` TS engines — `agent-os`, `pal`, `coordination`, `governance` (facade), `brain`, `interop`, `a2a-sdk`, `substrate`, `runtime`, `agent-mcp`, `agent-workflows`, `agent-hooks` (helpers), `agent-schemas`, `distribution`, `conductor-ui`, `design-tokens` | **in-process-import** | First-party, same host, same language. Fusion = no serialization tax, compile-time types, no incidental network boundary. **Folding `agent-gateway`/`agent-worker` in is the canonical example** (`[WB#2]`): two owned packages must not talk over HTTP. |
| `app/` ↔ backend, `apps/mobile`, `site/`, external agents over `/api/a2a` + `/api/mcp`, Electron-main ↔ embedded-backend (loopback), the Envoy mesh + `recoder-xds` | **http-edge** | True edges: browser, cross-machine, cross-trust-domain, or a real process boundary on the user's machine. Each is signed/authz'd (`interop`, `ext_authz`, Better Auth). |

**The one-line test:** *Is the other side first-party TS in my host?* → import it.
*Is it a coding agent or a foreign-language/stdio authority?* → subprocess. *Is it
across a machine, a browser, or a trust domain?* → http-edge, signed.

---

## (d) Decisions + open questions

**Resolved (user, 2026-06-29):**

- ✅ **D1 — pal ↔ governance: pal *annotates*, governance independently *decides*.**
  `PALPlan.risk` is advisory metadata persisted on the run; the Rust governance kernel
  keeps its own independent allow/needs_approval/deny judgment. Defense in depth — a
  planner bug can never lower a gate. (Wiring §a.4 step 3: feed `PALPlan.risk` to
  `governance-gate` as a *hint/annotation*, not as the routing authority.)
- ✅ **D2 — agent-gateway/agent-worker: fold in *and* keep standalone.** Import their
  real queue/workflow/ingress modules into `docker-backend` (the desktop + cloud
  in-process path) **and** keep the standalone entrypoints as **optional scale-out
  processes** for the cloud `[M3]`. One codebase, two hosts; delete only the *duplicate
  inline re-implementation*, never the shared modules. (§b.1 step 2.)

**Still open:**

3. **agent-hooks: subprocess CLI vs in-process helpers.** The package exposes both a
   `runHookCli` (subprocess, matches the Claude Code hooks protocol) and direct
   helpers. For the embedded desktop backend, do we run hooks as a subprocess (true
   to the external protocol, slower) or call the helpers in-process (faster, but
   diverges from how external Claude Code hooks fire)? Affects b.1 step 4.
4. **`/work-signals` reconciliation.** `py/ops-recorder` is a FastAPI service but the
   backend already has a *same-named, separate* `/work-signals` concept `[WB#10]`. Do
   we (a) replace the inline concept with the ops-recorder service (http-edge), or
   (b) port ops-recorder's detectors into the backend in-process? Need a call on
   whether stuck-work detection lives in Python or moves to TS.
5. **Connector ingress trust posture.** Local sibling handoffs (CC→CC) skip signature
   verification (in-process). Confirm that's acceptable for the desktop single-user
   case, and that **only** off-host / connector / mesh traffic must be signed via
   `interop`. (PRD treats connectors as hostile-by-default; this question is purely
   about the *local* fast path.)
6. **document-preprocessor / browser-verification dist builds.** Both need a `dist`
   build before they can be imported `[WB#11, WB#12]`. Is wiring these in-scope for
   the current milestone, or parked until after `[M1]` ships the core loop?
3. **agent-hooks: subprocess CLI vs in-process helpers.** The package exposes both a
   `runHookCli` (subprocess, matches the Claude Code hooks protocol) and direct
   helpers. For the embedded desktop backend, do we run hooks as a subprocess (true
   to the external protocol, slower) or call the helpers in-process (faster, but
   diverges from how external Claude Code hooks fire)? Affects b.1 step 4.
4. **`/work-signals` reconciliation.** `py/ops-recorder` is a FastAPI service but the
   backend already has a *same-named, separate* `/work-signals` concept `[WB#10]`. Do
   we (a) replace the inline concept with the ops-recorder service (http-edge), or
   (b) port ops-recorder's detectors into the backend in-process? Need a call on
   whether stuck-work detection lives in Python or moves to TS.
5. **Connector ingress trust posture.** Local sibling handoffs (CC→CC) skip signature
   verification (in-process). Confirm that's acceptable for the desktop single-user
   case, and that **only** off-host / connector / mesh traffic must be signed via
   `interop`. (PRD treats connectors as hostile-by-default; this question is purely
   about the *local* fast path.)
6. **document-preprocessor / browser-verification dist builds.** Both need a `dist`
   build before they can be imported `[WB#11, WB#12]`. Is wiring these in-scope for
   the current milestone, or parked until after `[M1]` ships the core loop?

---

> Maintenance: when a wiring lands end-to-end, check its box in
> [`WIRE-UP-BACKLOG.md`](../WIRE-UP-BACKLOG.md), flip the `DIRECTORY-MAP` verdict, and
> (if it advances a milestone) tick it in [`ROADMAP.md`](../ROADMAP.md). This file
> tracks **mode + order**, not status.
