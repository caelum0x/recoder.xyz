# INFERENCE module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): backend/engines/rust/tensorzero

**Interface:** `infer · stream · embed · feedback · models · health`

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../docs/RECODER-MODULES.md §INFERENCE.

**Shipped:** a REAL standalone domain at `backend/src/domains/inference/`
(`createInferenceModule` in `index.ts` → `InferenceComposer` in
`inference-module.ts`). The composer slices `AppConfig` (no `process.env` reads),
assembles the delivery ladder, builds the durable repositories, wraps them with
cost accounting, and exposes the control + OpenAI-compatible routers, the MCP
tools, and truthful health.

## The TensorZero delivery ladder (rungs, verified in code)

`TensorzeroTransportAdapter` (`adapters/tensorzero-transport.adapter.ts`) is the
concrete `InferenceGatewayPort` as a degrade-safe LADDER — each rung DECLINES
(returns `null`/`routed:false` with a reason) so the next is tried, and a total
miss returns a truthful `notRouted(model, reason)`, never a fabricated completion:

- **Rung 1 — napi embedded gateway** (in-process, no HTTP hop). The `NapiTierPort`
  over the engines' TensorZero `.node`. CONFLICT #8-safe: the composer CONSUMES the
  engines client's process-memoized addon (`napiEngine: engines.tensorzero()` →
  `createEngineClientNapiTier`, `inference-module.ts:137-142`) and never re-loads a
  second `.node`. Tried first when `cfg.napiFirst` (default `true`,
  `config.ts:90`) and `napi.available()`.
- **Rung 2 — loopback** (`LlmGatewayPort`): the supervised HTTP gateway
  (`backend/src/gateway/tensorzero-client.ts` skin). Buffered `complete`/`embed`/
  `health` reuse it; streaming uses the `gateway-stream.ts` SSE seam for REAL
  per-token deltas.
- **Rung 3 — direct BYOK multi-provider router** (`RouterTierPort` over
  `createDirectProviderTransport`, `adapters/direct-provider.transport.ts`). Tried
  LAST when napi + loopback both decline, or FIRST when the request carries
  `preferDirect` (`tensorzero-transport.adapter.ts:127,150`). Its `available()` is
  true only when a key source is wired (BYOK secrets seam OR platform keys).
- **`none`** — truthful degrade with a reason
  (`tensorzero-transport.adapter.ts:156-158`).

`health()` reports the highest available rung honestly
(`tier: napi | loopback | router | none`, `tensorzero-transport.adapter.ts:307-341`)
— it never invents an `available:true`.

## infer · stream · embed · feedback · models · health

The `InferenceRoutingService` wraps the ladder with cost accounting + the durable
usage ledger + delivery-outcome rows (`inference-module.ts:164-170`). The surfaces:

- **infer** — buffered chat completion down the ladder.
- **stream** — `completeStream` streams via the napi `inferenceStream` binding
  (REAL in-process per-chunk deltas, no HTTP hop) first, then the loopback SSE
  tier, then a buffered single-chunk emit. It BUFFERS a rung's deltas until that
  rung confirms `routed`, and refuses to re-emit a buffered completion after a
  live tier partial-streamed then failed — so the client never sees duplicated
  output (`tensorzero-transport.adapter.ts:161-261,357-371`).
- **embed** — the embeddings edge (see below). Routes down the loopback tier
  (`tensorzero-transport.adapter.ts:263-282`).
- **feedback** — only the napi embedded gateway carries a feedback seam; there is
  no ladder to descend, so an unbound napi tier returns a truthful `routed:false`
  (`tensorzero-transport.adapter.ts:284-305`). Feedback attaches a signal
  (merge/approve = positive) to a prior `inference_id`.
- **models** — the routable model catalog (`ModelCatalogRepository`); `generateConfig`
  produces a TensorZero config from the enabled catalog (`inference-module.ts:247-250`).
- **health** — truthful component health, `down` when no tier binds
  (`health.ts`, `buildInferenceHealth`).

Optional post-construction injections (bootstrap wires each): the billing
**entitlement gate** + **usage meter** (BYOK-aware token quota + per-completion
metering, `inference.setEntitlementGate` / `setUsageMeter`, `bootstrap/index.ts:1083,1092`),
the **pal routing brain** (`setPalRouter` over `engines.pal()` — a `routingHint`
request routes by task INTENT, `bootstrap/index.ts:461`), and the conductor
**run-inference sink** (`setRunInferenceSink`, `bootstrap/index.ts:1106` — a
napi-tier completion carrying a `correlationWorkspaceId` correlates its
`inference_id` back to its workspace so a MERGE can fire real RLHF feedback;
non-napi ids are not emitted). Each is degrade-safe: absent ⇒ a truthful no-op.

## BYOK key resolution from the governance vault

`createByokKeyResolver` (`adapters/byok-key-resolver.ts`) is the seam that resolves
a user's provider key at inference time. Resolution order for `(ownerId, provider)`:

1. the short-TTL, AES-at-rest `ProviderKeyCache` (`byok-key-cache.ts`);
2. the durable governance secret — `secrets.get(ownerId, "inference/byok/<provider>")`
   (`byokSecretRef`, `byok-key-resolver.ts:30-32`), backed by the governance vault
   (`governance.secrets()`, injected at `bootstrap/index.ts:434`);
3. cache upsert of the durable hit.

Rung 3 (`direct-provider.transport.ts`) consumes this resolver, so a per-tenant BYOK
key flows into the actual provider call, falling back to `platformProviderKeys`
(env-folded in bootstrap, `bootstrap/index.ts:437-445`). Degrade truth table
(`byok-key-resolver.ts:10-20`): secrets seam unwired ⇒ `enabled()===false`,
`resolve` → `null`, `store` → `{stored:false}` (fail closed); vault master key down
⇒ get/set reject → truthful `null` / `{stored:false, reason}` — **no plaintext key
ever reaches a log line, error message, or any return other than `resolve()`'s**.
Key WRITES (`PUT /inference/keys/:provider`) are governed by
`inference.setGovernanceGate(governance.gate())` and fail CLOSED with a truthful 503
until the gate is wired (`inference-module.ts:217-224`).

## The embeddings edge + `inference.embed`

- **HTTP edge:** `createOpenAiEmbeddingsRouter` (`routes/openai-embeddings.routes.ts`)
  mounts `POST /v1/embeddings` (OpenAI-wire-compatible) under BOTH `/inference` and
  `/gateway`, and at `/api/gateway` via `gatewayRoutes()` so the built-in AI panel
  resolves without a doubled prefix (`inference-module.ts:272-313`). It maps the
  request onto `InferenceRoutingService.embed`.
- **MCP tool:** `inference.embed` routes a string / string[] embedding call down the
  same gateway seam, returning a truthful `{ routed, tier, embeddings, usage }`
  (`mcp/inference-engine.ts:124-144`).

## Agent-facing MCP tools

The inference domain's own in-proc **`inference`** server (`mcp/inference-engine.ts`,
contributed via `inference.mcp()` at `bootstrap/index.ts:1398`) exposes:
`inference.models`, `inference.health`, `inference.complete`, `inference.embed`,
`inference.feedback`. Tenant identity for quota + spend is the HOST-AUTHORIZED,
edge-bound `caller.userId` — NEVER a caller-supplied arg (an earlier
`args.requestedBy` selector that let any caller drain a victim's quota is dropped,
`mcp/inference-engine.ts:14-21,58-69`).

The deep TensorZero surface lives under a DISTINCT **`recoder.tensorzero`** server
(`domains/engines/mcp/tensorzero-inference-engine.ts`, registered in
`IN_PROC_SERVERS` + `ENGINE_SERVERS`), adding two genuinely-new ops WITHOUT
re-advertising the single ones:

- **`tensorzero.model_catalog`** (read-only) — introspects the model/function
  catalog the embedded gateway would route (env registry → generated config); needs
  no gateway boot, so it stays truthful even when the `.node` is absent.
- **`tensorzero.batch_inference`** (side-effecting) — runs many inferences over the
  EXISTING single `inference` napi with bounded concurrency; the host-authorized
  caller is threaded into result metadata as `requestedBy` for a truthful audit.

These are DISTINCT from the single `tensorzero.inference` / `tensorzero.feedback` /
`tensorzero.config_validate` / `tensorzero.version` ops that already exist on the
napi-engines path. Every call still traverses interop's `authorize → risk →
execute → audit` gate at the host boundary; an unbound port / missing `.node` /
unbooted gateway / bad input throws the real reason and nothing is fabricated.

**No public `recoder_*` alias for raw inference.** There is deliberately no
`recoder_inference`/`recoder_embed` in the public capability-tool set — an agent
reaches inference through the engine-namespace tools above. The public `recoder_*`
tools that CONSUME inference are `recoder_pal_plan` (the routing brain that picks
provider/model/rung by intent) and `recoder_retrieval_search` /
`recoder_retrieval_ingest` (embeddings-backed RAG).

## Desktop surface

The desktop `RecoderModel` (`apps/desktop/app/frontend/app/view/recoder/recoder-model.ts`)
is the launch/agent picker of record — it reads `/api/conductor/runtimes` +
`/api/conductor/health` into `setupAtom` and holds the chosen runtime in
`launchRuntimeIdAtom` (`recoder-model.ts:376-401`), deliberately FILTERING OUT
`openfang` because it is the in-process inference engine, not a coding agent a user
launches into a worktree (`recoder-model.ts:385-393`). Provider/model selection for
inference itself is server-side (the model catalog + the pal routing brain), not a
client dropdown — so the desktop never fakes a model list the backend cannot route.

Degrade-safe throughout: without a DB the catalog/ledger/provider-key repos no-op
truthfully; without a gateway endpoint the ladder falls to napi or reports `down`;
without a vault master key the BYOK cache disables rather than storing plaintext.
