# INFERENCE module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): backend/engines/rust/tensorzero

**Interface:** `infer · stream · embed · feedback · models · health`

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../docs/RECODER-MODULES.md §INFERENCE.

**Shipped (2026-07-19): deep TensorZero MCP surface (`model_catalog`/`batch_inference`).**
Beyond the single `tensorzero.inference` / `feedback` / `config_validate` / `version` ops
(the napi-engines path), the embedded gateway now exposes TWO genuinely-new deep ops under
a DISTINCT `recoder.tensorzero` server (no duplicate capability claim). Both bind LIVE
through the governed interop host, reachable over the MCP HTTP edge
`POST /api/mcp/tools/:server/:tool/call`:

- **`tensorzero.model_catalog`** (read-only) — introspects the model/function catalog the
  embedded gateway would route (env registry → generated config). Needs no gateway boot,
  so it stays truthful even when the `tensorzero-gateway-napi.node` addon is absent.
- **`tensorzero.batch_inference`** (side-effecting) — runs many inferences over the EXISTING
  single `inference` napi with bounded concurrency (optional `concurrency` / `stopOnError`),
  aggregating per-item outcomes. Because it calls model providers, the host-authorized
  caller is threaded into result metadata as `requestedBy` for a truthful audit trail.

Wiring lives at `backend/src/domains/engines/mcp/tensorzero-inference-engine.ts`
(`registerTensorzeroInferenceMcpTools` over the injected `TensorzeroInferencePort`), with
the server descriptor registered in `IN_PROC_SERVERS` + `ENGINE_SERVERS` so the wiring
guard passes and the tools are agent-visible + callable. Neither tool is tenant-subject-
bearing (no cross-tenant data path introduced; the closed class stays closed), yet every
call still traverses interop's `authorize → risk → execute → audit` gate at the host
boundary. Truthful degrade: an unbound port (adapter absent), a missing `.node`, an
unbooted gateway, or bad input throws the real reason — the interop host records it, and
nothing is ever fabricated.
