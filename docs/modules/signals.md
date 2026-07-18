# SIGNALS module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): backend/engines/py/ops-recorder

> **SHIPPED (this capability was split, no standalone `signals` composer).** The
> Recoder-authored FastAPI `ops-recorder` sidecar is **supervised in the `engines`
> domain** — `domains/engines/ops-recorder-daemon.ts` spawns `uvicorn main:app`
> behind an auth preflight (refuses to spawn keyless) with `domains/engines/ops-recorder-adapter.ts`
> forwarding the ingest roundtrip (real GH/Linear detectors; local JSON store). The
> **signal composition + interface ship in the `observability` domain**:
> `observability/adapters/ops-recorder.adapter.ts` (supervised loopback client,
> `X-API-Key`), `observability/ports/signals.port.ts` (fetch-only engine boundary —
> the TS side never fabricates a signal), and `observability/services/work-signals.service.ts`
> (pull raw → normalize to `RunEvent` → emit to the agent-os bus + board; governance-gated
> disposition writes). Read the interface below as the original intent — the shipped
> facets are `refresh · normalize · disposition · notify · health`, not the folder layout.

**Interface:** `ingest · query · onSignal · health`

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../docs/RECODER-MODULES.md §SIGNALS.
