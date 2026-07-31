# COMMUNICATION module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): packages/pal + a2a

> **SHIPPED (this composer was split).** There is no single COMMUNICATION composer.
> The A2A facets (`handoff · message`) ship in the **`interop`** (gate) + **`interop-wire`**
> (wire/runtimes/dispatch) domains; the pal facets (`plan · routeModel · consensus · escalate`)
> ship as the `pal-plan` in-proc engine + the supervised `pal-mcp` sidecar in the **`engines`**
> domain. Read this as the original intent, not the shipped folder layout.

**Interface:** `plan · routeModel · consensus · escalate · handoff · message · health`

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../RECODER-MODULES.md §COMMUNICATION.

## The pal brain facet (SHIPPED) — `engines.pal()`

The cohesive pal decision layer ships as `PalBrainService`
(`backend/src/domains/engines/pal-brain/pal-brain.service.ts`, interface
`engines/ports/pal-brain.port.ts`), memoized on the engines module as
`engines.pal()` — mirroring the openfang `engines.agentEngine()` precedent. It is
thin composition over two engines-internal seams, never a re-implementation of pal:

- **Pure owned-TS verbs** — `plan · routeModel · planLaunch · escalate` — compose
  `@recoder/pal` in-proc (deterministic, no I/O): `computePalPlanDecision`,
  `classifyTaskIntent`, `getPreferredFallbackModel`, the runtime/skill/tool-grant/
  sandbox selectors, and the expert-escalation ladder. These never throw; on a
  fault they return a conservative, deny-biased default.
- **Sidecar I/O verbs** — `consensus · debate · health` — compose the frozen
  `EngineClientPort` pal-mcp transport (`invoke({ op:'agentcomms' })` into the
  supervised Python server). Degrade-truthful: sidecar/model down ⇒
  `recommendation:'abstain'`, `degraded:true`, `engine:'synthetic'` — never a
  fabricated verdict.

### Facet consumption — three product-flow consumers (SHIPPED)

Each consumer defines its own port and receives a bootstrap-built adapter over
`engines.pal()`; no consumer imports `engines` internals or `@recoder/pal`.

- **(a) inference · `routeModel`** — `inference-routing.service.ts` resolves the
  model through `PalRoutePlannerPort` (`inference/ports/pal-route.port.ts`), backed
  at bootstrap by `createInferenceRoutePalAdapter(engines.pal())`. The route-brain
  internals moved into the facet; inference now takes **zero** `@recoder/pal`
  imports and re-declares pal's `low|medium|high` / `extended_reasoning|
  fast_response|balanced` string unions locally (a parity test guards drift). When
  the facet declines (empty catalog / off-catalog pick / fault) the decision
  degrades to `source:'default'` and the caller's requested model is unchanged.
- **(b) conductor · `planLaunch`** — `createWorkspace` consults the optional
  `ConductorPlanPort` (`conductor/ports/plan.port.ts`) after the governance write
  allow and before substrate/skill selection. pal only *fills gaps* the caller left
  blank; an explicit operator `runtimeId`/substrate is **never** overridden. The
  port is optional ⇒ absent = byte-identical to prior behavior; a throwing port
  never fails the launch. `plan.risk`/`approvalRequired` are recorded on the launch
  audit metadata — pal advises, the governance kernel still decides.
- **(c) governance · `consensus`** — the Wave-4 `pal-consensus.adapter.ts` is folded
  onto the facet's `consensus()` and wired via `governance.setConsensusReview`.
  `governance-gate.service.ts decide()` consults it **only** when
  `effect==='allow'` AND `riskTier >= high` AND the allow was not human-pre-approved.
  An explicit consensus `block` downgrades the verdict to `needs_approval` (sealed
  into the existing Merkle audit chain); `abstain`/unavailable/timeout/throw leave
  the kernel allow standing — never a silent deny, never a gate hung open.

### Governance high-risk latency trade

The consensus hook is the only new I/O on the gate hot path: an `await` on the
multi-model sidecar bounded by the governance-owned `DEFAULT_CONSENSUS_TIMEOUT_MS`
(20 s). It runs *only* on the rarest decisions — high-risk allows that were not
human-pre-approved — so every low/medium verdict, every `deny`/`needs_approval`,
and every pre-approved allow returns on the existing synchronous path with zero
added latency. Worst case adds one wall-clock `timeoutMs` (≤20 s) to a single
high-risk allow, never compounded and never a shared lock; on timeout/failure the
facet abstains and the kernel allow stands. The trade is intentional and observable
(recorded on the audit entry), applied to the highest-risk writes only.

### Deliberately-dark surface (thin MCP affordances, no faked consumer)

The facet exposes exactly the two sidecar verbs a backend service consumes
(`consensus`, `debate`) plus the four pure verbs. The following stay dark **by
design** — wiring them into a product flow would invent a consumer that does not
exist:

- **`pal.route` (single-model chat) + `pal.models` (provider discovery)** — served
  by `pal-comms.binder.ts` as agent-callable MCP tools over the same
  `EngineClientPort` transport. No backend service routes a single prompt or
  enumerates providers as a decision seam, so they get **no facet method**. The
  binder and the facet are two parallel thin surfaces over one frozen transport —
  the binder is left as-is (not re-pointed at the facet).
- **`clink` CLI bridge** and the sidecar orchestration tools (`thinkdeep`,
  `codereview`, `secaudit`, `refactor`, `tracer`, `testgen`, …) — agent-facing
  tools, reachable via the pal-mcp sidecar behind the interop gate, with no backend
  decision seam.
- **`conversation_memory` threading (`continuation_id`)** — TTL-bound and
  non-tenant-scoped; Recoder's memory-of-record is beads, so this stays a sidecar
  passthrough.
- **`debate`** — on the facet for cohesion (sidecar sibling of `consensus`) but no
  backend service consumes it yet; activating it in governance is a later optional
  escalation of `consensus`.
- **`escalate`** — on the facet (activates the `@recoder/pal` expert-escalation
  ladder), reserved for a conductor run-loop completion gate that does not exist
  today; not force-wired to a consumer.

## Engine MCP tools — pal (SHIPPED)

Real-bound, degrade-truthful pal tools exposed to agents through the `pal-mcp` sidecar.
These surface the `routeModel · consensus · escalate` facets above as callable MCP tools:

- **`pal.route`** — SHIPPED. Route a prompt/task to the best model given the pal routing policy.
- **`pal.consensus`** — SHIPPED. Run a multi-model consensus pass and return the agreed answer + per-model votes.
- **`pal.debate`** — SHIPPED. Structured multi-model debate (proposer/critic rounds) for higher-stakes decisions; escalates on disagreement.
- **`pal.models`** — SHIPPED. List the models available to pal with their routing metadata/health.

Degrade-safe: if the pal engine or an underlying model provider is down, the affected
tool reports down and never fakes a result.

### Agent-facing MCP tool (governed)

The one public `recoder_*` id agents call for the pal layer is **`recoder_pal_plan`**,
bridged by `mcp/recoder-capability-tools.cjs` to the `recoder.pal-plan` server's
`pal.plan` verb (the owned in-proc `computePalPlanDecision` seam, deny-biased) through
the gated MCP host (`authorize → risk → execute → audit`). It surfaces the
`plan` / `planLaunch` facet — runtime / substrate / tool-grants / risk / approval — to
agents. The sidecar `pal.route · pal.consensus · pal.debate · pal.models` verbs above
stay engine-namespace only (no `recoder_*` wrapper, no backend decision seam).
