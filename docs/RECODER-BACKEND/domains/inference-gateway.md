# Inference & LLM Gateway Domain

**Folder prefix:** `backend/src/domains/inference/` (+ engine in `backend/engines/rust/tensorzero`)
**Owner boundary:** Every LLM/embedding call in the whole backend funnels through this domain: the TensorZero embedded gateway (napi-first → loopback → direct provider), the model/provider registry → TZ config generation, BYOK credential resolution, the model catalog, SSE streaming, the feedback→delivery-outcome loop, and the OpenAI-compatible edge.

---

## 1. Overview

The inference domain is the single seam through which the desktop AI panel, `agents.recoder.xyz`, the conductor runtimes, and every internal capability (memory embeddings, colbert, browser-use) obtain model inference. It exposes ONE public port, `InferenceGatewayPort` (SHIPPED name), with a small, stable surface. The port NEVER throws and NEVER fabricates a value — an unroutable call resolves `{ routed:false, reason }`:

```ts
interface InferenceGatewayPort {
  complete(req: InferenceRequest): Promise<InferenceResult>;
  completeStream(req: InferenceRequest, onDelta: StreamSink): Promise<InferenceStreamResult>;
  embed(req: EmbeddingRequest): Promise<EmbeddingResult>;
  feedback(req: FeedbackRequest): Promise<FeedbackResult>;
  health(): Promise<InferenceHealth>;
}
```

> **SHIPPED note:** the port carries no `listModels` — the routable model catalog is served through the `catalog()` repository, the `GET /inference/models` route, and the `inference.models` MCP tool. Actor identity travels on the request (`req.userId`), not a separate `ctx` arg. Cost accounting + the usage ledger + the delivery-outcome audit trail live one layer up in `services/inference-routing.service.ts` (the `InferenceRoutingService`), which the routes/MCP call and which wraps this gateway port.

The composer (`inference-module.ts`, class `InferenceComposer`) fuses the tiers behind that interface, in a strict **native-first → subprocess → direct** transport ladder, each rung degrade-safe:

1. **napi embedded gateway** (`tensorzero-gateway-napi` Rust `.node`, in-proc EmbeddedGateway) — default. Boots from a generated `tensorzero.toml`; REAL per-token SSE via the `inferenceStream` binding.
2. **TensorZero loopback daemon** (127.0.0.1 OpenAI wire) — used when the `.node` is absent but a gateway URL is configured.
3. **direct-provider BYOK router** (`direct-provider.transport.ts`, rung 3) — the SHIPPED direct rung supports five providers by model-id prefix: **openai / openrouter / groq** (OpenAI wire), **anthropic** (Anthropic-native wire), **google** (Gemini wire). Last resort and the path for providers TZ doesn't front. Missing key → explicit `{ routed:false }`, never a silent reroute.
4. **`none`** — when nothing is configured, the port returns a truthful `{ routed:false }` / `SERVICE_UNAVAILABLE`, never a fabricated completion.

Every call is: (a) validated at the boundary with zod, (b) BYOK-resolved (per-user governance-vault key → platform key), (c) for the governed surfaces — the key-write route (`decide('inference.key.write')`) + the MCP `inference.complete`/`embed`/`feedback` tools — gated (model spend is a governed action), (d) MCP tools pass the host interop chain (`authorize→risk→execute→audit`), (e) token-accounted through the `InferenceRoutingService` (usage-ledger row + optional `UsageMeterPort` decrement + optional `EntitlementGate` pre-dispatch quota), and (f) audited as a delivery-outcome row. (SHIPPED note: the domain does NOT emit `RunEvent`/outbox events today.)

### What we REUSED vs wrote NEW

> **SHIPPED note:** the legacy flat `backend/src/gateway/` and `backend/src/engines/` dirs are GONE — their source was ABSORBED into this domain (`84c3d41f3`). The "Source" column below records provenance; the landing paths are the shipped domain files noted in-line.

| Reused (folded behind composer, not rewritten from scratch) | Provenance → shipped landing |
|---|---|
| `LlmGatewayPort`, TZ OpenAI-wire client, embedded-gateway napi facade, degrade-safe contract | `src/gateway/tensorzero-client.ts` → `domains/inference/llm-gateway-client.ts` + `tensorzero-embedded-client.ts` |
| OpenAI-compat `/v1/chat/completions` mapper + SSE framing | `src/gateway/openai-compat.routes.ts` → `domains/inference/routes/openai-compat.routes.ts` |
| health/embed/complete control routes | `src/gateway/gateway.routes.ts` → `domains/inference/routes/inference.routes.ts` |
| Multi-provider BYOK router (provider table) | `src/engines/llm-router.ts` → REWRITTEN self-contained as `adapters/direct-provider.transport.ts` (rung 3) |
| TZ `tensorzero.toml` config generation from registry | `src/engines/tensorzero-config.ts` → `domains/inference/tensorzero-config.ts` + `adapters/tz-config-generator.ts` |
| Encrypted BYOK key cache (AES-256-GCM, TTL) | `src/engines/byok-key-cache.ts` → `adapters/byok-key-cache.ts` + `byok-key-resolver.ts` |
| Native `.node` (EmbeddedGateway, feedback, inference) | `backend/engines/rust/tensorzero/crates/tensorzero-gateway-napi` (release `.node` built) — reached via `domains/engines` `EngineClientPort` |
| Token/usage quota check + metering | billing domain `EntitlementGate` + `UsageMeterPort` (injected post-construction by bootstrap) |
| `RunEvent`/outbox emit | `@recoder/agent-events` |
| Gate + interop chain | `@recoder/governance`, `@recoder/interop`, `@recoder/agent-policy` |
| Secrets at rest (BYOK) | governance secrets vault (`governance.secrets()`), NOT a standalone `@recoder/vault` |
| MCP tool shape | `@recoder/agent-mcp` (registered via the domain-tools bridge) |
| Session/edge cookie | `@recoder/auth` (identity domain `AuthMiddleware`) |

| Write NEW |
|---|
| The domain composer + `InferenceGateway` port + factory (`create InferenceModule`) |
| DB-backed BYOK provider-key store (replaces the CUT `public-api/byok-provider-keys.ts` HTTP hop with `WHERE user_id` Postgres, per foundation) |
| DB-backed model catalog + registry loader (replaces env-only `TENSORZERO_MODELS`) |
| DeliveryOutcome/feedback repository + TZ `feedback()` bridge (the loop was TODO-only before) |
| Token/cost accounting in the routing service: usage-ledger row + delivery-outcome row + optional `UsageMeterPort` decrement (no `RunEvent` emit) |
| The 3-rung transport dispatcher (napi → loopback → direct) with per-rung health |
| `mcp/inference-engine.ts` — FIVE MCP tools: `inference.models` / `inference.health` (read-only) + `inference.complete` / `inference.embed` / `inference.feedback` (governed) |
| ONE consolidated migration `inference_0001_gateway.sql` with `inference_provider_keys` + `inference_model_catalog` + `inference_delivery_outcome` + `inference_usage_ledger` |
| zod schemas + config slice + health + tests |

---

## 2. File tree (SHIPPED — tests are CO-LOCATED `*.test.ts`, there is no `__tests__/` dir)

```
backend/src/domains/inference/
  index.ts                             # factory + the ONE public InferenceModule/InferenceGatewayPort barrel
  inference-module.ts                  # composer (class InferenceComposer): fuses napi/loopback/direct behind the gateway port
  config.ts                            # zod InferenceConfigOverrides slice — no process.env
  types.ts                             # domain types (InferenceRequest/Result, StreamDelta, DeliveryStatus, TokenUsage, EmbeddingRequest/Result, FeedbackRequest/Result, InferenceHealth)
  health.ts                            # truthful tier up|down health aggregation
  llm-gateway-client.ts                # LlmGatewayPort + loopback OpenAI-wire client (absorbed from src/gateway)
  tensorzero-config.ts                 # TZ config model (absorbed from src/engines)
  tensorzero-embedded-client.ts        # embedded-gateway napi facade (absorbed from src/gateway)
  ports/
    index.ts                           # barrel re-export of every inference port
    inference-gateway.port.ts          # InferenceGatewayPort public port + StreamSink (consumed by other domains)
    byok-resolver.port.ts              # ByokKeyResolver + ByokSecretsPort + InferenceKeyWriteGate
    provider-keys.port.ts              # ProviderKeyRepository + ProviderKeyCache PORTs
    model-catalog.port.ts              # ModelCatalogRepository PORT
    usage-ledger.port.ts               # UsageLedgerRepository + DeliveryOutcomeRepository PORTs
    entitlement-gate.port.ts           # billing EntitlementGate (optional pre-dispatch token quota)
    usage-meter.port.ts                # billing UsageMeterPort (optional token metering)
  adapters/                            # the TZ rungs are consolidated into ONE transport adapter
    tensorzero-transport.adapter.ts    # SINGLE TensorZero transport: napi-tier (in-proc EmbeddedGateway) → loopback wire; NapiTierPort + RouterTierPort
    engine-client-napi-tier.ts         # the in-proc `.node` EmbeddedGateway tier the transport wraps
    direct-provider.transport.ts       # rung 3: SELF-CONTAINED direct BYOK router (openai/openrouter/groq/anthropic/google); DIRECT_PROVIDERS table
    default-transports.ts              # the SINGLE coupling point that assembles the ladder
    gateway-stream.ts                  # SSE streaming framing
    tz-config-generator.ts             # catalog -> tensorzero.toml (GeneratedTzConfig)
    byok-key-cache.ts / byok-key-resolver.ts  # AES-256-GCM per-user key cache + resolution (governance secrets vault)
    token-accounting.ts                # usage/cost helpers (resolveUsage, computeCostMicroUsd) consumed by the routing service
  services/
    inference-routing.service.ts       # InferenceRoutingService: gateway + cost accounting + usage ledger + delivery-outcome audit + entitlement/metering
  routes/
    inference.routes.ts                # control edges (health, models, complete, feedback, usage, keys + key rotate/delete) — feedback & keys folded IN, not separate files
    openai-compat.routes.ts            # /v1/chat/completions (OpenAI wire + SSE)
    openai-embeddings.routes.ts        # /v1/embeddings (OpenAI wire)
  mcp/
    inference-engine.ts                # buildInferenceMcpTools: inference.models/health/complete/embed/feedback (5)
  repositories/
    provider-key.repository.ts         # concrete ProviderKeyRepository (pg :param, WHERE user_id)
    model-catalog.repository.ts        # concrete ModelCatalogRepository (pg)
    usage-ledger.repository.ts         # concrete UsageLedgerRepository + DeliveryOutcomeRepository (pg)

backend/migrations/
  inference_0001_gateway.sql           # SHIPPED: ONE consolidated migration (provider keys + model catalog + delivery outcome + usage ledger), not four
```

Co-located tests (`*.test.ts` next to the source): `config.test.ts`, `adapters/{byok-key-cache,byok-key-resolver,direct-provider.transport,engine-client-napi-tier,gateway-stream,tensorzero-transport.adapter,token-accounting,tz-config-generator}.test.ts`, `services/{inference-routing.service,inference-routing.entitlement}.test.ts`, `routes/{inference-feedback,inference-keys,openai-compat,openai-embeddings}.routes.test.ts`, `mcp/inference-engine.test.ts`.

Rust engine (reused in place, not a new file — listed for the wiring seam):
`backend/engines/rust/tensorzero/crates/tensorzero-gateway-napi` → `tensorzero.node` (EmbeddedGateway.boot/infer/feedback). Byte-interop golden vectors pinned against the loopback wire.

---

## 3. Per-file responsibilities

| # | Path | lang | kind | Responsibility | Key exports |
|---|------|------|------|----------------|-------------|
| 1 | `index.ts` | ts | service | Barrel: re-export the port + the ASYNC `createInferenceModule` factory + module/deps interfaces. | `createInferenceModule` (async), `InferenceGatewayPort`, `InferenceModule`, `InferenceModuleDeps` |
| 2 | `inference-module.ts` | ts | service | Composer (`class InferenceComposer`). Builds the 3-rung transport ladder, resolves BYOK, governs the key-write route, wires the routing service, aggregates health. | `InferenceComposer` |
| 3 | `config.ts` | ts | config | Zod slice: TZ url(s), napi enable flag, default model, timeouts, BYOK flags. Fail-safe defaults; NO `process.env` reads. | `InferenceConfigSchema`, `InferenceConfigOverrides` |
| 4 | `types.ts` | ts | type | Domain types + zod schemas + `notRouted`/`tokenUsage` helpers. | `InferenceRequest`, `InferenceResult`, `InferenceStreamResult`, `StreamDelta`, `EmbeddingRequest`, `EmbeddingResult`, `FeedbackRequest`, `FeedbackResult`, `DeliveryStatus`, `TokenUsage`, `InferenceHealth` |
| 5 | `health.ts` | ts | service | Probe the gateway tier (napi bound? loopback reachable?) + ledger durability → truthful `ComponentHealth`. | `buildInferenceHealth(deps): Promise<ComponentHealth>` |
| 6 | `ports/inference-gateway.port.ts` | ts | port | The ONE public port other domains consume. | `InferenceGatewayPort`, `StreamSink` |
| 7 | `ports/{provider-keys,usage-ledger}.port.ts` | ts | port | Repository interfaces for provider keys + cache, usage ledger + delivery outcomes. | `ProviderKeyRepository`, `ProviderKeyCache`, `UsageLedgerRepository`, `DeliveryOutcomeRepository` |
| 8 | `ports/byok-resolver.port.ts` | ts | port | BYOK resolution + governed-store seams. | `ByokKeyResolver`, `ByokSecretsPort`, `InferenceKeyWriteGate` |
| 9 | `ports/model-catalog.port.ts` | ts | port | Model/provider registry repository interface. | `ModelCatalogRepository`, `ModelCatalogUpsert` |
| 10 | `ports/{entitlement-gate,usage-meter}.port.ts` | ts | port | OPTIONAL billing seams injected post-construction (pre-dispatch token quota + token metering). | `EntitlementGate`, `BillingSubject`, `UsageMeterPort` |
| 11 | `adapters/tensorzero-transport.adapter.ts` (+ `engine-client-napi-tier.ts`) | ts | client | SINGLE TZ transport: napi-tier (in-proc EmbeddedGateway `.node`) → loopback OpenAI wire, both behind one adapter. `health()` reflects real bind state; degrades to `none` when addon+gateway absent. | `NapiTierPort`, `RouterTierPort` |
| 12 | `adapters/default-transports.ts` | ts | client | The SINGLE coupling point that assembles the transport ladder (TZ transport + direct provider) for the module. | `buildDefaultTransports(deps)` |
| 13 | `adapters/direct-provider.transport.ts` | ts | client | Rung 3. SELF-CONTAINED direct BYOK router (openai/openrouter/groq/anthropic/google) — does NOT wrap llm-router. Missing key → explicit `{ routed:false }`, never silent reroute. | `DIRECT_PROVIDERS`, direct transport factory |
| 14 | `adapters/tz-config-generator.ts` | ts | client | Builds `tensorzero.toml` from the enabled catalog (env var NAMES only, never key material). | `GeneratedTzConfig`, config generator |
| 15 | `adapters/byok-key-cache.ts` / `byok-key-resolver.ts` | ts | client | Per-user AES-256-GCM key cache + resolution (per-user → platform); fail-safe. Resolves from the governance secrets vault. | `byokSecretRef`, resolver factory |
| 16 | `adapters/token-accounting.ts` | ts | client | Usage/cost helpers (`resolveUsage`, `computeCostMicroUsd`) consumed by the routing service; billing metering is via the injected `UsageMeterPort`, not a direct RunEvent emit. | `resolveUsage`, `computeCostMicroUsd` |
| 16b | `services/inference-routing.service.ts` | ts | service | `InferenceRoutingService`: routes through the gateway ladder, resolves usage + cost, appends the usage-ledger + delivery-outcome rows (best-effort), applies the optional entitlement gate + usage meter. Accounting NEVER blocks delivery. | `InferenceRoutingService` |
| 17 | `routes/inference.routes.ts` | ts | route | Control edges (mounted under `/api/gateway/inference`): `GET /health` (session), `GET /models`, `POST /complete`, `POST /feedback`, `GET /usage`, `GET /keys`, `PUT/POST(rotate)/DELETE /keys/:provider` (governed). zod-validated, `sendSuccess`/`sendError`. Feedback + keys are folded in here, NOT separate files. | `buildInferenceRouter(deps): Router` |
| 18 | `routes/openai-compat.routes.ts` / `openai-embeddings.routes.ts` | ts | route | OpenAI wire: `POST /v1/chat/completions` (+ SSE `stream:true`) and `POST /v1/embeddings`. Honest error bodies; status before stream. | `createOpenAiCompatRouter`, `createOpenAiEmbeddingsRouter` |
| 19 | `mcp/inference-engine.ts` | ts | client | Builds MCP tools `inference.models`/`inference.health` (read-only) + `inference.complete`/`inference.embed`/`inference.feedback` (governed) via the domain-tools bridge. | `buildInferenceMcpTools(deps)` |
| 20 | `repositories/provider-key.repository.ts` | ts | repository | Concrete `ProviderKeyRepository` (pg `:param`, `WHERE user_id = :user_id`). | provider-key repo factory |
| 21 | `repositories/model-catalog.repository.ts` | ts | repository | Concrete `ModelCatalogRepository` (pg). Seeds default platform models. | model-catalog repo factory |
| 22 | `repositories/usage-ledger.repository.ts` | ts | repository | Concrete `UsageLedgerRepository` + `DeliveryOutcomeRepository` (pg) — usage rows + delivery outcomes (there is no separate feedback repo). | usage-ledger repo factory |
| 23 | `backend/migrations/inference_0001_gateway.sql` | sql | migration | SHIPPED: ONE consolidated migration — `inference_provider_keys` + `inference_model_catalog` + `inference_delivery_outcome` + `inference_usage_ledger`. | — |
| T | `*.test.ts` (CO-LOCATED) | ts | test | Ladder fallthrough + degrade, OpenAI mapping/SSE, BYOK resolution precedence + cache, usage/cost accounting, entitlement-gated routing, feedback delivery-outcome. See the co-located test list under §2. | — |

---

## 4. DB schema

All app-layer access control (`WHERE user_id = :user_id`), parameterized SQL, no RLS.

**`inference_provider_keys`** — DB-backed BYOK (replaces the CUT HTTP `byok-provider-keys.ts`).
```
id            uuid pk default gen_random_uuid()
user_id       text not null                      -- owner; app-layer scoped
provider      text not null                      -- 'openai' | 'openrouter' | 'anthropic' | ...
key_ciphertext bytea not null                     -- AES-256-GCM (vault master key); NEVER plaintext
key_nonce     bytea not null
key_hint      text                                -- last-4 for UI, never the key
scope         text not null default 'byok'        -- 'byok' | 'platform'
created_at    timestamptz not null default now()
updated_at    timestamptz not null default now()
unique (user_id, provider, scope)
index (user_id)
```

**`inference_model_catalog`** — registry that drives `tz-config-generator` + `GET /models`.
```
id            uuid pk
model_id      text not null unique               -- 'openai/gpt-4o-mini' (llm-router id format)
provider      text not null
display_name  text not null
capabilities  jsonb not null default '{}'         -- {chat,embed,vision,tools,ctx_window,max_out}
api_key_env   text                                -- env var NAME for platform models (never a value)
enabled       boolean not null default true
is_platform   boolean not null default false      -- platform-provided vs BYOK-only
created_at    timestamptz not null default now()
index (provider) where enabled
```

**`inference_delivery_outcome`** — the feedback loop's state of record.
```
id            uuid pk
inference_id  text not null                       -- TZ inference id (episode/inference) or router synthetic id
user_id       text not null
model_id      text not null
outcome       text not null                       -- 'accepted' | 'rejected' | 'edited' | 'errored'
metric        text                                -- TZ feedback metric name
value         double precision                    -- boolean(0/1) or float metric
run_id        text                                -- links to agent-os Run
created_at    timestamptz not null default now()
index (inference_id), index (user_id, created_at)
```

**`inference_usage_ledger`** — token accounting audit trail (billing domain reads this to meter).
```
id            uuid pk
user_id       text not null
run_id        text
model_id      text not null
prompt_tokens int not null default 0
completion_tokens int not null default 0
embed_tokens  int not null default 0
rung          text not null                       -- 'napi' | 'loopback' | 'router'
governed      boolean not null default true       -- passed the gate
created_at    timestamptz not null default now()
index (user_id, created_at), index (run_id)
```

---

## 5. Edges (HTTP / WS / MCP)

SHIPPED: the domain's `routes()` mounts under the `inference` registry base **`/api/gateway`** (`domain-registry.ts`). The control edges live under the `/inference` sub-path; the OpenAI-wire router is mounted at BOTH `/inference/v1/*` and `/gateway/v1/*`. So the effective absolute paths are below. Key writes pass the governance gate (`inference.key.write`); `/keys/*` mutations require a real (non-anonymous) principal.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/gateway/inference/health` | **session** | truthful `{ tier, available, napiBound, ... }` — never the key/endpoint |
| GET | `/api/gateway/inference/models` | session | catalog for the desktop AI panel + agents model picker |
| POST | `/api/gateway/inference/complete` | session | governed completion (single-shot); over-quota → truthful `429 QUOTA_EXCEEDED` |
| POST | `/api/gateway/inference/feedback` | session | DeliveryOutcome → TZ `feedback()` |
| GET | `/api/gateway/inference/usage` | session | token/cost usage ledger summary (recent + totals) |
| GET | `/api/gateway/inference/keys` | session | BYOK provider-key metadata (never ciphertext) |
| PUT / POST `…/rotate` / DELETE | `/api/gateway/inference/keys/:provider` | session | governed BYOK key write / rotate / delete |
| POST | `/api/gateway/inference/v1/chat/completions` (+ `/api/gateway/gateway/v1/...` alias) | session/BYOK | OpenAI wire; `stream:true` → SSE `chat.completion.chunk` + `[DONE]` |
| POST | `/api/gateway/inference/v1/embeddings` (+ `/api/gateway/gateway/v1/...` alias) | session/BYOK | OpenAI wire embeddings |

**MCP tools** (SHIPPED — registered via the **domain-tools MCP bridge**: bootstrap collects `{ name: 'inference', tools: () => inference.mcp() }` into the host registrar, NOT via `IN_PROC_SERVERS`/`ENGINE_SERVERS`):
`inference.models`, `inference.health` (read-only), `inference.complete`, `inference.embed`, `inference.feedback` (governed).

**SSE streaming:** rung 1 (napi) and rung 2 (loopback) support true token-granular SSE via TZ's OpenAI-compatible stream; rung 3 buffers and frames one content chunk (existing behavior). Status is asserted before the stream opens so pre-stream failures stay honest JSON.

---

## 6. Interfaces exposed / consumed

**Exposed to other domains** (via `ports/inference-gateway.port.ts`, surfaced through `shared/` registry):
- `InferenceGateway` — memory (embeddings), agent-os/conductor (agent inference), social/browser-use, observability.

**Consumed from other domains:**
- `GovernanceGate.decide()` (`@recoder/governance`) — every completion/embedding is a governed write (spend).
- `InteropChain` (`@recoder/interop`) — every edge + MCP call.
- `QueryExecutor`/`Repository` (persistence) — the three repos.
- Governance secrets vault (`governance.secrets()`) — BYOK encrypt/decrypt at rest (the durable envelope-encrypted store, `inference/byok/<provider>` refs).
- Billing seams — the OPTIONAL `EntitlementGate` (pre-dispatch token quota) + `UsageMeterPort` (token metering), injected post-construction by bootstrap; a fault never fails delivery.
- `Session` (`@recoder/auth`) — actor identity on every request.
- `ToolRouter` (`@recoder/agent-mcp`) — MCP registration.
- `AppConfig` (bootstrap) — the `InferenceConfig` slice.

**Fusion law:** the domain reaches Rust (`tensorzero.node`) ONLY through `ports/inference-gateway.port.ts` + `adapters/tensorzero-transport.adapter.ts` (+ `engine-client-napi-tier.ts`), preferably over the shared `domains/engines` `EngineClientPort` (CONFLICT #8-safe: one shared `.node` load); it never imports a raw engine dist. Byte-interop: napi EmbeddedGateway output is pinned against the loopback OpenAI wire.

---

## 7. Degrade-safe / security posture

- No endpoint + no BYOK/platform key → port returns `SERVICE_UNAVAILABLE`; `/health` reports `down`; callers fall back — never a faked 200.
- Missing per-user BYOK key → explicit error, never silent reroute to another provider (llm-router contract preserved).
- Keys: only ciphertext at rest; only env var NAMES in the generated TZ TOML; `/health` never returns key/endpoint secret; `key_hint` last-4 only for UI.
- Vault master key absent → cache disabled (every call re-resolves), not a crash.
- Billing `down` → accounting degrades to structured log + ledger insert; inference still serves (truthful `degraded:true`).
- All inbound validated with zod at the boundary; server-side error context logged via `@recoder/logger` child `inference`, user-safe messages returned.

---

## 8. Implementation order

1. **Ports + types + config** (files 3,4,6–10) — lock the seams first so persistence/billing/governance wiring is known.
2. **Migration** (23, the ONE consolidated `inference_0001_gateway.sql`) + **repositories** (20–22) — DB-backed BYOK/catalog/feedback; verify with a persistence contract test.
3. **Transport adapters** (11–13) behind `LlmTransport`, folding in the existing `tensorzero-client` / `llm-router` / napi facade unchanged; **tz-config-generator** (14) + **byok-key-cache** (15).
4. **Composer** (2) — assemble the ladder, wire governance `decide` + RunEvent + token-accounting (16); **health** (5).
5. **Edges** (17,18) + **MCP** (19) — mount via edge table + MCP wiring checklist.
6. **Factory/barrel** (1) — `createInferenceModule` into `bootstrap/container.ts`.
7. **Tests** (T1–T5) throughout (TDD per rung), then `pnpm check-types`, `pnpm test`, `pnpm test:contracts:agent-os`, and `scripts/verify-byok-e2e.sh`.

**Verification:** `scripts/verify-byok-e2e.sh` (BYOK path), `pnpm test:contracts:agent-os` (governance/interop pass), plus co-located vitest. Golden-vector interop test pins napi EmbeddedGateway output to the loopback wire.
