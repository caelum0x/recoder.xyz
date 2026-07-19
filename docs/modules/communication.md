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
facet reports down, never fakes success. See ../docs/RECODER-MODULES.md §COMMUNICATION.

## Engine MCP tools — pal (SHIPPED)

Real-bound, degrade-truthful pal tools exposed to agents through the `pal-mcp` sidecar.
These surface the `routeModel · consensus · escalate` facets above as callable MCP tools:

- **`pal.route`** — SHIPPED. Route a prompt/task to the best model given the pal routing policy.
- **`pal.consensus`** — SHIPPED. Run a multi-model consensus pass and return the agreed answer + per-model votes.
- **`pal.debate`** — SHIPPED. Structured multi-model debate (proposer/critic rounds) for higher-stakes decisions; escalates on disagreement.
- **`pal.models`** — SHIPPED. List the models available to pal with their routing metadata/health.

Degrade-safe: if the pal engine or an underlying model provider is down, the affected
tool reports down and never fakes a result.
