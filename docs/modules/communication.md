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
