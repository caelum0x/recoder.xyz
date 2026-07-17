# Inference & LLM Gateway Domain

**Folder prefix:** `backend/src/domains/inference/` (+ engine in `backend/engines/rust/tensorzero`)
**Owner boundary:** Every LLM/embedding call in the whole backend funnels through this domain: the TensorZero embedded gateway (napi-first → loopback → direct provider), the model/provider registry → TZ config generation, BYOK credential resolution, the model catalog, SSE streaming, the feedback→delivery-outcome loop, and the OpenAI-compatible edge.

---

## 1. Overview

The inference domain is the single seam through which the desktop AI panel, `agents.recoder.xyz`, the conductor runtimes, and every internal capability (memory embeddings, colbert, browser-use) obtain model inference. It exposes ONE public port, `InferenceGateway`, with a small, stable surface:

```ts
interface InferenceGateway {
  complete(req: CompletionRequest, ctx: CallContext): Promise<Result<CompletionResult>>;
  completeStream(req: CompletionRequest, ctx: CallContext, onDelta: (d: StreamDelta) => void): Promise<Result<CompletionResult>>;
  embed(req: EmbeddingRequest, ctx: CallContext): Promise<Result<EmbeddingResult>>;
  feedback(fb: DeliveryOutcome, ctx: CallContext): Promise<Result<FeedbackAck>>;
  listModels(ctx: CallContext): Promise<Result<ModelCatalogEntry[]>>;
  health(): InferenceHealth;
}
```

The composer (`inference-module.ts`) fuses four engines behind that interface, in a strict **native-first → subprocess → http-last** transport ladder, each rung degrade-safe:

1. **`tensorzero-gateway-napi`** (Rust `.node`, in-proc EmbeddedGateway) — default. Boots from a generated `tensorzero.toml`.
2. **TensorZero loopback daemon** (UDS/127.0.0.1 OpenAI wire) — used when the `.node` is absent but a gateway URL is configured.
3. **`llm-router`** direct-provider BYOK driver (OpenAI/OpenRouter/Groq/DeepSeek/xAI/Google/Mistral/Together/Ollama/vLLM/Anthropic-native/custom) — last resort and the path for providers TZ doesn't front.
4. **`down`** — when nothing is configured, the port returns a truthful `SERVICE_UNAVAILABLE`, never a fabricated completion.

Every call is: (a) validated at the boundary with zod, (b) BYOK-resolved (per-user vault key → platform key → env), (c) routed through the **governance gate** (`decide` on the write — model spend is a governed action), (d) passed the **interop chain** (`authorize→risk→policy→audit`) at the edge, (e) token-accounted via the billing hook, and (f) recorded as a `RunEvent` (`inference.completed` / `inference.failed`) on the outbox.

### What we REUSE vs write NEW

| Reuse (fold behind composer, do NOT rewrite) | Source |
|---|---|
| `LlmGatewayPort`, TZ OpenAI-wire client, embedded-gateway napi facade, degrade-safe contract | `backend/src/gateway/tensorzero-client.ts` |
| OpenAI-compat `/v1/chat/completions` mapper + SSE framing | `backend/src/gateway/openai-compat.routes.ts` |
| `/api/gateway` health/embed/complete routes | `backend/src/gateway/gateway.routes.ts` |
| Multi-provider BYOK router (`chatComplete`, provider table) | `backend/src/engines/llm-router.ts` |
| TZ `tensorzero.toml` config generation from registry | `backend/src/engines/tensorzero-config.ts` |
| Encrypted BYOK key cache (AES-256-GCM via VaultDriver, 5-min TTL) | `backend/src/engines/byok-key-cache.ts` |
| Native `.node` (EmbeddedGateway, feedback, inference) | `backend/engines/rust/tensorzero/crates/tensorzero-gateway-napi` + `tensorzero-node` |
| Token/usage quota check (`billing.checkQuota`) | `backend/src/agent-os/mcp/billing-engine.ts` (billing domain port) |
| `RunEvent`/outbox emit | `@recoder/agent-events` |
| Gate + interop chain | `@recoder/governance`, `@recoder/interop`, `@recoder/agent-policy` |
| Secrets at rest | `@recoder/vault` |
| MCP ToolRouter shape | `@recoder/agent-mcp` |
| Session/edge cookie | `@recoder/auth` |

| Write NEW |
|---|
| The domain composer + `InferenceGateway` port + factory (`create InferenceModule`) |
| DB-backed BYOK provider-key store (replaces the CUT `public-api/byok-provider-keys.ts` HTTP hop with `WHERE user_id` Postgres, per foundation) |
| DB-backed model catalog + registry loader (replaces env-only `TENSORZERO_MODELS`) |
| DeliveryOutcome/feedback repository + TZ `feedback()` bridge (the loop was TODO-only before) |
| Token-accounting adapter that turns usage → billing meter + `RunEvent` |
| The 3-rung transport dispatcher (napi → loopback → direct) with per-rung health |
| `mcp/inference-engine.ts` (`inference.complete` / `inference.embed` / `inference.feedback` MCP tools) |
| Migrations for `inference_provider_keys`, `inference_model_catalog`, `inference_delivery_outcome`, `inference_usage_ledger` |
| zod schemas + config slice + health + tests |

---

## 2. File tree (~26 files)

```
backend/src/domains/inference/
  index.ts                             # factory + the ONE public InferenceGateway interface (barrel)
  inference-module.ts                  # composer: fuses napi/loopback/router behind InferenceGateway
  config.ts                            # zod InferenceConfig slice (from AppConfig) — no process.env
  types.ts                             # domain types (CompletionRequest/Result, StreamDelta, DeliveryOutcome, ModelCatalogEntry, CallContext)
  health.ts                            # per-engine up|down health aggregation
  ports/
    inference-gateway.port.ts          # InferenceGateway public port (consumed by other domains)
    llm-transport.port.ts              # internal transport rung interface (complete/embed/stream + probe)
    byok-store.port.ts                 # BYOK credential repository PORT (persistence provides impl)
    model-catalog.port.ts              # model/provider registry repository PORT
    feedback-store.port.ts             # delivery-outcome/feedback repository PORT
  adapters/                            # SHIPPED: the TZ rungs are consolidated into ONE transport adapter
    tensorzero-transport.adapter.ts    # SINGLE TensorZero transport: napi-tier (in-proc EmbeddedGateway) → loopback wire
    engine-client-napi-tier.ts         # the in-proc `.node` EmbeddedGateway tier the transport wraps
    direct-provider.transport.ts       # rung 3: direct BYOK multi-provider (wraps engines/llm-router)
    default-transports.ts              # the SINGLE coupling point that assembles the ladder
    gateway-stream.ts                  # SSE streaming framing
    tz-config-generator.ts             # registry -> tensorzero.toml (wraps engines/tensorzero-config)
    byok-key-cache.ts / byok-key-resolver.ts  # AES-256-GCM per-user key cache + resolution (vault)
    token-accounting.ts                # usage -> billing meter + RunEvent emit
  routes/
    inference.routes.ts                # /api/inference/* edges (health, complete, embed, models, feedback, usage, keys)
    openai-compat.routes.ts            # /api/inference/v1/* + /api/gateway/v1/* chat/completions (OpenAI wire + SSE)
    openai-embeddings.routes.ts        # /api/inference/v1/embeddings + /api/gateway/v1/embeddings
    inference-feedback.routes.ts / inference-keys.routes.ts
  mcp/
    inference-engine.ts                # register InferenceMcpTools: inference.complete/embed/feedback/models
  repositories/
    byok-store.repository.ts           # concrete BYOK store (pg :param, WHERE user_id) — lives here, wired from persistence
    model-catalog.repository.ts        # concrete catalog repo (pg)
    feedback-store.repository.ts       # concrete delivery-outcome repo (pg)
  __tests__/
    inference-module.test.ts           # composer: transport ladder + degrade + governance/interop pass
    openai-compat.routes.test.ts       # OpenAI wire mapping + SSE framing + honest error bodies
    byok-resolution.test.ts            # per-user key -> platform -> env precedence + cache + fail-safe
    token-accounting.test.ts           # usage -> meter + RunEvent, degrade when billing down
    feedback-loop.test.ts              # DeliveryOutcome -> TZ feedback() + repo persistence

backend/migrations/
  inference_0001_gateway.sql           # SHIPPED: ONE consolidated migration (provider keys + model catalog + delivery outcome + usage ledger), not four
```

Rust engine (reused in place, not a new file — listed for the wiring seam):
`backend/engines/rust/tensorzero/crates/tensorzero-gateway-napi` → `tensorzero.node` (EmbeddedGateway.boot/infer/feedback). Byte-interop golden vectors pinned against the loopback wire.

---

## 3. Per-file responsibilities

| # | Path | lang | kind | Responsibility | Key exports |
|---|------|------|------|----------------|-------------|
| 1 | `index.ts` | ts | service | Barrel: re-export the port + the `createInferenceModule` factory only. | `createInferenceModule`, `InferenceGateway`, `InferenceModule` |
| 2 | `inference-module.ts` | ts | service | Composer. Builds the 3-rung transport ladder, resolves BYOK, calls governance `decide` on each write, emits `RunEvent`, invokes token accounting, aggregates health. Pure factory `createInferenceModule(deps)`. | `createInferenceModule(deps): InferenceModule` |
| 3 | `config.ts` | ts | config | Zod slice of `AppConfig`: TZ url(s), napi enable flag, config-gen model list source, default model, timeouts, BYOK/vault flags. Fail-safe defaults; NO `process.env` reads. | `InferenceConfigSchema`, `InferenceConfig` |
| 4 | `types.ts` | ts | type | Domain types + zod request/response schemas. | `CompletionRequest`, `CompletionResult`, `StreamDelta`, `EmbeddingRequest`, `EmbeddingResult`, `DeliveryOutcome`, `ModelCatalogEntry`, `CallContext`, `Usage` |
| 5 | `health.ts` | ts | service | Probe each rung (napi loaded? loopback reachable? router keys present?) → `{status, degraded, engines:[{name,status}]}`. Truthful. | `buildInferenceHealth(rungs): InferenceHealth` |
| 6 | `ports/inference-gateway.port.ts` | ts | port | The ONE public port other domains consume. | `InferenceGateway` |
| 7 | `ports/llm-transport.port.ts` | ts | port | Internal rung contract each adapter implements + a `probe()` for health. | `LlmTransport`, `TransportProbe` |
| 8 | `ports/byok-store.port.ts` | ts | port | BYOK credential repository interface (persistence impl). | `ByokStore`, `ProviderKeyRecord` |
| 9 | `ports/model-catalog.port.ts` | ts | port | Model/provider registry repository interface. | `ModelCatalogStore` |
| 10 | `ports/feedback-store.port.ts` | ts | port | Delivery-outcome persistence interface. | `FeedbackStore` |
| 11 | `adapters/tensorzero-transport.adapter.ts` (+ `engine-client-napi-tier.ts`) | ts | client | SHIPPED SINGLE TZ transport: napi-tier (in-proc EmbeddedGateway `.node`) → loopback OpenAI wire, both behind one adapter. `probe()` reflects real bind state; degrades to `down` when addon+gateway absent. | `createTensorzeroTransport(deps)`, `NapiTierPort` |
| 12 | `adapters/default-transports.ts` | ts | client | The SINGLE coupling point that assembles the transport ladder (TZ transport + direct provider) for the module. | `buildDefaultTransports(deps)` |
| 13 | `adapters/direct-provider.transport.ts` | ts | client | Rung 3. Direct BYOK multi-provider incl. Anthropic-native. Missing key → explicit error, never silent reroute. | `createDirectProviderTransport(deps)` |
| 14 | `adapters/tz-config-generator.ts` | ts | client | Builds `tensorzero.toml` from the catalog (env var NAMES only, never key material) and materializes to a temp path for `EmbeddedGateway.boot`. | `generateTensorzeroConfig(catalog): string`, `materializeConfig(toml): Promise<string>` |
| 15 | `adapters/byok-key-cache.adapter.ts` | ts | client | Per-user AES-256-GCM key cache (VaultDriver, 5-min TTL); resolution order per-user → platform → env; fail-safe. | `createByokResolver(deps): { resolve(userId, provider): Promise<ResolvedKey \| null> }` |
| 16 | `adapters/token-accounting.adapter.ts` | ts | client | Maps `Usage` → billing meter (`billing.checkQuota`/record) + emits `RunEvent`; degrades to log-only when billing `down`. | `createTokenAccountant(deps): { account(usage, ctx): Promise<void> }` |
| 17 | `routes/inference.routes.ts` | ts | route | `/api/inference` edges: `GET /health` (**session-authed**, no key leak), `POST /complete`, `GET /models`, `POST /feedback`, `GET /usage`, `GET/PUT/DELETE /keys/:provider`. zod-validated, `sendSuccess`/`sendError`, interop chain. | `buildInferenceRouter(deps): Router` |
| 18 | `routes/openai-compat.routes.ts` | ts | route | OpenAI wire: `POST /v1/chat/completions` (+ SSE `stream:true`), `POST /v1/embeddings`. Honest error bodies; status before stream. | `createOpenAiCompatRouter(deps): Router` |
| 19 | `mcp/inference-engine.ts` | ts | client | Registers MCP tools `inference.complete`/`inference.embed`/`inference.feedback`/`inference.models` on the ToolRouter; each passes interop `authorize→risk→policy→audit`. | `registerInferenceMcpTools(router, deps)` |
| 20 | `repositories/byok-store.repository.ts` | ts | repository | Concrete `ByokStore` (pg `:param`, `WHERE user_id = :user_id`, encrypted-at-rest ciphertext columns). | `createByokStoreRepository(qx): ByokStore` |
| 21 | `repositories/model-catalog.repository.ts` | ts | repository | Concrete `ModelCatalogStore` (pg). Seeds default platform models. | `createModelCatalogRepository(qx): ModelCatalogStore` |
| 22 | `repositories/feedback-store.repository.ts` | ts | repository | Concrete `FeedbackStore` (pg) for delivery outcomes + inference ids. | `createFeedbackStoreRepository(qx): FeedbackStore` |
| 23 | `backend/migrations/inference_0001_gateway.sql` | sql | migration | SHIPPED: ONE consolidated migration — `inference_provider_keys` + `inference_model_catalog` + `inference_delivery_outcome` + `inference_usage_ledger`. | — |
| T1 | `__tests__/inference-module.test.ts` | ts | test | Ladder: napi→loopback→router fallthrough; degrade to `down`; governance `decide` denial short-circuits; RunEvent emitted. | — |
| T2 | `__tests__/openai-compat.routes.test.ts` | ts | test | OpenAI mapping, SSE chunk framing, `[DONE]`, honest error status. | — |
| T3 | `__tests__/byok-resolution.test.ts` | ts | test | key precedence, cache hit/expiry, fail-safe on missing key. | — |
| T4 | `__tests__/token-accounting.test.ts` | ts | test | usage→meter+RunEvent; billing-down degrade path. | — |
| T5 | `__tests__/feedback-loop.test.ts` | ts | test | DeliveryOutcome→TZ `feedback()` + persistence + interop audit. | — |

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

Mounted by the `edge` domain route table under `/api/inference` (with `/api/gateway/v1/*` kept as the OpenAI-wire alias). Every write passes interop `authorize→risk→policy→audit`; `/internal/*` variants are `INTERNAL_SERVICE_KEY`-gated.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/inference/health` | **session** | truthful `{configured, endpoint, rungs}` — never the key |
| GET | `/api/inference/models` | session | catalog for the desktop AI panel + agents model picker |
| POST | `/api/inference/complete` | session | governed completion (single-shot) |
| POST | `/api/inference/feedback` | session | DeliveryOutcome → TZ `feedback()` |
| GET | `/api/inference/usage` | session | token/cost usage ledger summary |
| GET/PUT/DELETE | `/api/inference/keys/:provider` | session | BYOK provider-key metadata (governed writes) |
| POST | `/api/inference/v1/chat/completions` (+ `/api/gateway/v1/...` alias) | session/BYOK | OpenAI wire; `stream:true` → SSE `chat.completion.chunk` + `[DONE]` |
| POST | `/api/inference/v1/embeddings` (+ `/api/gateway/v1/...` alias) | session/BYOK | OpenAI wire embeddings |

**MCP tools** (registered via wiring checklist — add to `IN_PROC_SERVERS` + `ENGINE_SERVERS`, `registerInferenceMcpTools`, call in `buildInProcEngineRouter`):
`inference.complete`, `inference.embed`, `inference.feedback`, `inference.models`.

**SSE streaming:** rung 1 (napi) and rung 2 (loopback) support true token-granular SSE via TZ's OpenAI-compatible stream; rung 3 buffers and frames one content chunk (existing behavior). Status is asserted before the stream opens so pre-stream failures stay honest JSON.

---

## 6. Interfaces exposed / consumed

**Exposed to other domains** (via `ports/inference-gateway.port.ts`, surfaced through `shared/` registry):
- `InferenceGateway` — memory (embeddings), agent-os/conductor (agent inference), social/browser-use, observability.

**Consumed from other domains:**
- `GovernanceGate.decide()` (`@recoder/governance`) — every completion/embedding is a governed write (spend).
- `InteropChain` (`@recoder/interop`) — every edge + MCP call.
- `QueryExecutor`/`Repository` (persistence) — the three repos.
- `VaultDriver` (`@recoder/vault`) — BYOK encrypt/decrypt at rest.
- `RunEvent` bus + outbox (`@recoder/agent-events`) — `inference.completed`/`inference.failed`.
- Billing port (`billing.checkQuota`/record) — token accounting + quota gating.
- `Session` (`@recoder/auth`) — actor identity on every request.
- `ToolRouter` (`@recoder/agent-mcp`) — MCP registration.
- `AppConfig` (bootstrap) — the `InferenceConfig` slice.

**Fusion law:** the domain reaches Rust (`tensorzero.node`) ONLY through `ports/llm-transport.port.ts` + `adapters/tensorzero-napi.adapter.ts`; it never imports a raw engine dist. Byte-interop: napi EmbeddedGateway output is pinned against the loopback OpenAI wire via golden vectors.

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
