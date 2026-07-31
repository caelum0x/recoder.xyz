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

> **SHIPPED — agent-callable signal read-side (MCP).** The `query` facet is now
> exposed to agents as **two real-bound, degrade-truthful in-proc MCP tools**,
> bound in the `engines` domain over the ops-recorder adapter seam
> (`engines/engines-module.ts` binds them on the host;
> `engines/adapters/daemon/mcp/ops-recorder-signals-mcp.ts` is the binder, own
> `serverId` = `ops-recorder-signals`):
>
> - **`ops-recorder.query`** — filtered, sorted view of recorded work-signals.
>   Optional AND filters: `source` (github|linear), `item_type`
>   (pull_request|issue), `priority` (high|medium|low), `resolved` (bool),
>   `since`/`until` (ISO-8601 detection-time window), `limit` (int ≥ 0). No
>   filters returns every signal, priority-then-detection-time ordered.
> - **`ops-recorder.stats`** — aggregation roll-up: total plus counts by source,
>   item_type, priority, and status (open/resolved), and oldest/newest detection
>   timestamps. Takes the same filters as `ops-recorder.query` (minus `limit`) to
>   scope the aggregation.
>
> Both are **READ-ONLY over the engine's GLOBAL signal store** — no per-tenant
> subject, so they are **not** in the cross-tenant mutation class and bind no
> `McpToolCaller` subject (the closed class stays closed). They still traverse
> interop's `authorize → risk → execute → audit` gate at the host boundary, and
> degrade truthfully: engine down → the tool surfaces the failure, never fakes a
> signal.

> **Agent-facing MCP tools (governed): none.** There is no public `recoder_*`
> capability-bridge tool for work-signals in `mcp/recoder-capability-tools.cjs` — agents
> reach the read-side only through the engine-namespace `ops-recorder.query` /
> `ops-recorder.stats` ids above. (The `recoder_logs_*` capability tools bridge the
> observability *run-event* log, a different engine, not this ops-recorder signal store.)

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../docs/RECODER-MODULES.md §SIGNALS.
