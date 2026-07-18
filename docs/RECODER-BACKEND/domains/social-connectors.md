# Domain: Social Connectors (`backend/src/domains/social/`)

> **STATUS (shipped):** SHIPPED as the `social` domain — one of the 15 live domains under
> `backend/src/domains/`. Composed by bootstrap via `createSocialComposer`, mounted at
> **`/api/social`** (NOT `/api/connectors`), health-registered, and MCP-registered under the
> `social` server. `apps/social` and the old `backend/src/connectors/*` are RETIRED (folded
> into this domain; both directories are gone).
>
> Boundary: **the agents' presence on human channels.** Connector ingress + webhook,
> the 7 live `ConnectorPort` adapters (telegram / slack / signal / imessage / whatsapp /
> line / feishu), the **hostile-by-default mention gate**, inbound→conductor dispatch,
> and the embedded conversational reply agent. **discord is dropped** from the live set
> (its adapter stays in the `@recoder/connectors` foundation at 8 channels, but is not
> wired to a live runtime).

---

## 1. Overview

The social domain is the **one place an outside human touches a Recoder agent**. A message
arrives on Telegram/Slack/Signal/etc.; it crosses a hostile-by-default trust boundary
(HMAC signature → replay window → allowlist → mention → command → signed interop claim);
only then does it become either (a) a `/run …` **conductor dispatch** that spins a real
git-worktree workspace, or (b) a conversational **reply-agent** turn answered in-channel.
Every reply travels back over the *same* real `ConnectorPort`.

Design laws this domain obeys:

- **Hostile-by-default.** Empty allowlist ⇒ nothing is admitted. Missing webhook secret ⇒
  `401`, never a faked `200`. Unverified signature ⇒ refused before a single byte is trusted.
- **Composer, not rewrite.** The old `backend/src/connectors/*` (gateway, gate, webhook-ingress,
  dispatch-runner, channel-adapters) and the `recoder-social` app (`apps/social`) were **folded
  behind** the composer and RETIRED (both dirs removed); the `@recoder/connectors` package and the
  `apps/desktop/engines/openclaw` social-gateways are **used in place** as the engine.
- **Fusion law.** No domain code shells out ad hoc. The zrok tunnel and the openclaw engine
  are reached only through `ports/` + degrade-safe `adapters/`.
- **State-of-record is Recoder's.** Channel bindings + inbound audit live in Postgres via the
  persistence `QueryExecutor`; dispatch state is a conductor `Task`/`Run`, never local.
- **Writes are gated at the identity layer** (`authenticateMutating`) and the MCP surface is
  **read-only** (send stays on the HTTP `/send` edge). MCP calls pass the interop-host
  `authorize→risk→policy→audit` chain; each subject-bearing tool binds identity to the
  host-authorized `McpToolCaller`. _(A dedicated `GovernanceGate.decide()` call on social writes
  is not yet wired — planned; the send/bind schemas note it as governance-gated intent.)_

---

## 2. File tree (`backend/src/domains/social/` — AS SHIPPED, + `apps/desktop/engines/openclaw` in place)

```
backend/src/domains/social/
  index.ts                              # factory createSocialModule() (frozen CORE: gate + repo + config + health) + SocialModule interface
  social-module.ts                      # createSocialComposer() → SocialComposite: fuses core + registry + dispatch + tunnel + pipeline + routes + mcp
  config.ts                             # SocialConfig slice (per-channel enable + secret refs) from AppConfig + overrides
  types.ts                              # ChannelId, InboundEnvelope, MentionDecision, DispatchOutcome, ChannelHealth, ConnectorRow, ChannelBinding
  schema.ts                             # zod schemas: bindChannelSchema, sendMessageSchema
  health.ts                             # config-posture per-channel up|down aggregation → ComponentHealth
  live-health.ts                        # buildLiveSocialHealth: config posture + live channel probes (truthful)

  ports/
    connector-port.ts                   # ConnectorPort contract (send/monitor/probe) narrowed from @recoder/connectors
    mention-gate.port.ts                # MentionGate: admit(inbound) → MentionDecision (hostile-by-default)
    dispatch.port.ts                    # DispatchPort: dispatchToConductor() + replyInChannel()
    tunnel.port.ts                      # PublicTunnelPort: ensurePublicUrl() for NAT webhook exposure (zrok)
    connector-secrets.port.ts           # ConnectorSecretsPort: resolve per-channel token/signing-secret
    social-repository.port.ts           # SocialRepository: connectors, bindings, inbound-log CRUD (impl in adapters)

  adapters/
    channel-adapter-registry.ts         # ChannelId → ConnectorPort factory; optional-SDK loader; degrade-safe; send()/statuses()
    openclaw-gateway.adapter.ts         # wraps apps/desktop/engines/openclaw social-gateways (used in place)
    mention-gate.adapter.ts             # hostile-by-default gate: allowlist+mention+command+signed vouch (BindingCheck opt-in)
    webhook-ingress.adapter.ts          # HMAC verify (LINE/Slack) over raw body + replay window + challenge handshake
    signed-vouch.adapter.ts             # createSealedIngressVouch: signed connector-ingress vouch verification (degrade-safe)
    zrok-tunnel.adapter.ts              # public-URL tunnel via zrok binary (loopback/subprocess), degrade → down
    connector-secrets.adapter.ts        # vault-backed (or direct) secret resolution, degrade → channel down
    social-repository.adapter.ts        # concrete SocialRepository over QueryExecutor (:param SQL); in-memory when executor absent

  dispatch/                             # (NOT under adapters/) — the inbound→dispatch path
    inbound-pipeline.ts                 # dedup → mention gate → dispatch (conductor|reply) → reply-send → audit
    conductor-dispatch.ts               # DispatchPort['dispatchToConductor'] → conductor createWorkspace (via port)
    reply-agent.ts                      # embedded conversational reply turn via inference gateway (via ReplyInferencePort)

  routes/
    social.routes.ts                    # buildSocialRoutes: /api/social reads + writes + POST /webhooks/:channel (RAW-body HMAC folded in)
    channel-status.ts                   # buildChannelsView / buildConnectorsView read-model helpers

  mcp/
    social-engine.ts                    # buildSocialMcpTools: READ-ONLY social_list_connectors / social_list_bindings / social_channel_health

  __tests__/
    mention-gate.test.ts                # hostile-by-default: empty allowlist rejects; mention+allow admits
    webhook-ingress.test.ts             # LINE/Slack HMAC verify, replay reject, challenge, missing-secret 401
    dispatch-reply.test.ts              # /run → conductor createWorkspace; plain mention → reply-agent turn
    channel-status.test.ts              # truthful channel/connector read-model shapes
    composer-monitors.test.ts           # long-poll monitor lifecycle (start/stop, degrade-truthful)
    connector-secrets-env.test.ts       # secret resolution + degrade → down
    signed-vouch.test.ts                # signed connector-ingress vouch verify + tamper reject
    social-engine.mcp.test.ts           # MCP read-only tools + tenant-bound caller identity (cross-tenant 403 / AUTH_REQUIRED)
    social.routes.test.ts               # /api/social edge surface (reads/writes/webhooks)

backend/migrations/                     # canonical migrations location (NOT under the domain dir)
  social_0001_connectors.sql            # connectors + channel_bindings tables
  social_0002_inbound_log.sql           # inbound_messages audit + dedup index

apps/desktop/engines/openclaw/          # USED IN PLACE (never copied) — the ConnectorPort engine implementations
  social-gateways/{telegram,slack,signal,imessage,whatsapp,line,feishu,_dispatch,config,infra}
```

Note vs the original plan: `conductor-dispatch` + `reply-agent` live under `dispatch/` (with a new
`inbound-pipeline.ts`), not `adapters/`; the webhook route folded into `social.routes.ts` (no separate
`webhook.routes.ts`); `live-health.ts`, `channel-status.ts`, and `signed-vouch.adapter.ts` were added;
migrations landed in `backend/migrations/social_000*.sql` (prefixed, canonical) rather than under the domain.

---

## 3. Per-file responsibilities

| # | Path | Lang | Kind | Responsibility | Key exports |
|---|------|------|------|----------------|-------------|
| 1 | `index.ts` | ts | service | Frozen CORE factory (mention gate + repository + config + health) + the public interface | `createSocialModule(deps): SocialModule`, `interface SocialModule` |
| 2 | `social-module.ts` | ts | service | Composer: builds registry, secrets, dispatch, tunnel, pipeline; wires routes + MCP; owns lifecycle | `createSocialComposer(deps): SocialComposite`, `interface SocialComposite`, `start()`, `stop()` |
| 3 | `config.ts` | ts | config | Typed `SocialConfig` slice: per-channel `{enabled, secretRef}`, ingress secret, zrok settings; no `process.env` | `type SocialConfig`, `sliceSocialConfig(app: AppConfig)` |
| 4 | `types.ts` | ts | type | Domain value types | `ChannelId`, `InboundEnvelope`, `MentionDecision`, `DispatchOutcome`, `ChannelHealth`, `SendRequest` |
| 5 | `schema.ts` | ts | schema | zod validation at the boundary (reuses `@recoder/agent-schemas` where shared) | `WebhookBodySchema`, `BindChannelSchema`, `SendMessageSchema` |
| 6 | `health.ts` | ts | service | Aggregate config-posture per-channel status into `ComponentHealth`; truthful degraded flag | `buildSocialHealth(cfg): ComponentHealth` |
| 6b | `live-health.ts` | ts | service | Config posture + LIVE channel probes → truthful `ComponentHealth` | `buildLiveSocialHealth(...)` |
| 7 | `ports/connector-port.ts` | ts | port | Narrow the `@recoder/connectors` `ConnectorPort` (send/monitor/probe) to the domain seam | `type ConnectorPort`, `NormalizedInboundMessage`, `ConnectorProbeResult` (re-export) |
| 8 | `ports/mention-gate.port.ts` | ts | port | Interface for the trust boundary decision | `interface MentionGate { admit(env: InboundEnvelope): Promise<MentionDecision> }` |
| 9 | `ports/dispatch.port.ts` | ts | port | Interface into the conductor + reply agent | `interface DispatchPort { dispatchToConductor(...); replyInChannel(...) }` |
| 10 | `ports/tunnel.port.ts` | ts | port | NAT public-URL exposure contract | `interface PublicTunnelPort { ensurePublicUrl(path): Promise<string \| null> }` |
| 11 | `ports/connector-secrets.port.ts` | ts | port | Per-channel secret resolution seam (vault) | `interface ConnectorSecretsPort { resolve(channel, kind): Promise<string \| null> }` |
| 12 | `ports/social-repository.port.ts` | ts | port | Data-access contract implemented by persistence | `interface SocialRepository { listBindings(); upsertBinding(); recordInbound(); wasSeen() }` |
| 13 | `adapters/channel-adapter-registry.ts` | ts | adapter | Map `ChannelId`→`ConnectorPort` factory; lazy optional-SDK import; test seam override; degrade to `down` | `getChannelAdapter(id)`, `overrideAdapterFactory(id, fn)`, `SUPPORTED_CHANNELS` |
| 14 | `adapters/openclaw-gateway.adapter.ts` | ts | adapter | Load the real `ConnectorPort` impls from `engines/openclaw/social-gateways` in place | `buildOpenclawPort(channel, cfg): Promise<ConnectorPort>` |
| 15 | `adapters/mention-gate.adapter.ts` | ts | adapter | Hostile-by-default gate: allowlist → mention → command parse → signed `ConnectorIngressClaim`; reuses `connector-ingress-gate` | `class HostileMentionGate implements MentionGate` |
| 16 | `adapters/webhook-ingress.adapter.ts` | ts | adapter | Verify HMAC over RAW body (LINE `x-line-signature`, Slack `v0`), replay window, `url_verification` challenge after verify | `processWebhookDelivery`, `isWebhookChannel` |
| 16b | `adapters/signed-vouch.adapter.ts` | ts | adapter | Verify a signed connector-ingress vouch (degrade-safe; absent secret ⇒ inert) | `createSealedIngressVouch({secret})`, `SignedVouch` |
| 17 | `adapters/zrok-tunnel.adapter.ts` | ts | client | Reserve/attach a zrok public share for the webhook path via loopback/subprocess; degrade→`null`+`down` | `createZrokTunnelAdapter(...)` (impl `PublicTunnelPort`) |
| 18 | `dispatch/conductor-dispatch.ts` | ts | adapter | `/run …` → conductor `createWorkspace` via `ConductorDispatchPort` + `ConductorTargetResolver`; run id only when genuinely launched | `createConductorDispatch(...)`, `ConductorDispatchPort`, `ConductorTargetResolver` |
| 18b | `dispatch/inbound-pipeline.ts` | ts | adapter | dedup → mention gate → dispatch → reply-send → audit; degrade-truthful | `createInboundPipeline(...)`, `InboundPipeline` |
| 19 | `dispatch/reply-agent.ts` | ts | adapter | Bounded conversational turn via inference gateway (`ReplyInferencePort`); reply only when gateway produced one | `createReplyAgent(...)`, `ReplyInferencePort` |
| 20 | `adapters/connector-secrets.adapter.ts` | ts | adapter | Resolve tokens/signing secrets from vault (or direct resolver); missing ⇒ channel `down` (never fake) | `createConnectorSecretsAdapter(...)` (impl `ConnectorSecretsPort`) |
| 21 | `adapters/social-repository.adapter.ts` | ts | repository | Concrete `SocialRepository` over persistence `QueryExecutor`, `:param` SQL, `WHERE user_id = :user_id`; in-memory when executor absent | `createSocialRepository({executor})` (impl `SocialRepository`) |
| 22 | `routes/social.routes.ts` | ts | route | `/api/social` HTTP edges: reads + writes + `POST /webhooks/:channel` (RAW-body HMAC folded in); `sendSuccess/sendError` | `buildSocialRoutes(deps): Router` |
| 23 | `routes/channel-status.ts` | ts | route | Read-model helpers for the health-shaped `/api/social` reads | `buildChannelsView(cfg)`, `buildConnectorsView(cfg, channels)` |
| 24 | `mcp/social-engine.ts` | ts | service | READ-ONLY MCP tools; tenant-bound caller identity (owner from `McpToolCaller`, cross-tenant ⇒ 403) | `buildSocialMcpTools(deps)`: `social_list_connectors`, `social_list_bindings`, `social_channel_health` |
| 25 | `backend/migrations/social_0001_connectors.sql` | sql | migration | `connectors` + `channel_bindings` tables | — |
| 26 | `backend/migrations/social_0002_inbound_log.sql` | sql | migration | `inbound_messages` audit + dedup unique index | — |
| 27 | `__tests__/mention-gate.test.ts` | ts | test | Empty allowlist rejects; correct mention+allowlist admits; command parse | — |
| 28 | `__tests__/webhook-ingress.test.ts` | ts | test | LINE/Slack HMAC verify + tamper reject, replay reject, challenge, missing-secret ⇒ 401 | — |
| 29 | `__tests__/dispatch-reply.test.ts` | ts | test | `/run` path calls conductor `createWorkspace`; plain mention calls reply agent; reply routes back on same port | — |
| 30 | `__tests__/{channel-status,composer-monitors,connector-secrets-env,signed-vouch,social-engine.mcp,social.routes}.test.ts` | ts | test | Read-model shapes, monitor lifecycle, secret degrade, signed-vouch verify, MCP tenant identity, edge surface | — |

---

## 4. DB schema (`backend/migrations/`, canonical location; runner in `domains/persistence`)

All access via persistence `QueryExecutor` with `:param` placeholders. App-layer access control
(`WHERE user_id = :user_id`). **No Supabase RLS / `auth.uid()`.**

```sql
-- backend/migrations/social_0001_connectors.sql
CREATE TABLE IF NOT EXISTS connectors (
  id            TEXT PRIMARY KEY,               -- e.g. 'telegram', 'slack'
  channel       TEXT NOT NULL,                  -- ChannelId enum value
  enabled       BOOLEAN NOT NULL DEFAULT false,
  secret_ref    TEXT,                           -- vault reference, NEVER the secret itself
  status        TEXT NOT NULL DEFAULT 'down',   -- up|down|degraded (last probe)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channel_bindings (
  id            TEXT PRIMARY KEY,
  connector_id  TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,                  -- Recoder owner of this binding
  space_id      TEXT,                           -- agent-os Space the inbound dispatches into
  chat_ref      TEXT NOT NULL,                  -- channel-native room/chat id (allowlisted)
  allow         BOOLEAN NOT NULL DEFAULT false, -- hostile-by-default: false unless explicitly allowed
  agent_id      TEXT,                           -- reply-agent / dispatch agent identity
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connector_id, chat_ref)
);
CREATE INDEX IF NOT EXISTS idx_channel_bindings_user ON channel_bindings(user_id);

-- backend/migrations/social_0002_inbound_log.sql
CREATE TABLE IF NOT EXISTS inbound_messages (
  id            TEXT PRIMARY KEY,
  connector_id  TEXT NOT NULL,
  chat_ref      TEXT NOT NULL,
  provider_msg  TEXT NOT NULL,                  -- provider-native message id (dedup key)
  user_id       TEXT,
  decision      TEXT NOT NULL,                  -- admitted|rejected|ignored
  reason        TEXT,                           -- gate reason (audit)
  dispatch_kind TEXT,                           -- conductor|reply|none
  run_id        TEXT,                           -- conductor Run when dispatched
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotency / replay protection: one provider message processed once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_dedup
  ON inbound_messages(connector_id, provider_msg);
```

---

## 5. Edges (HTTP / WS / MCP)

HTTP (mounted by bootstrap at `mountBase = /api/social`):

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/social/` | session (`authenticate`) | Truthful per-channel connectors view (configured? up/down) |
| GET | `/api/social/channels` | session | Configured channels w/ enabled/disabled + reason |
| GET | `/api/social/connectors` | session | List registered connectors from the repository |
| GET | `/api/social/bindings` | session | List this owner's chat bindings |
| GET | `/api/social/health` | session | Truthful LIVE channel health |
| POST | `/api/social/bindings` | `authenticateMutating` | Bind/allow a chat_ref → space/agent (WRITE; owner from principal) |
| DELETE | `/api/social/bindings/:connectorId/:chatRef` | `authenticateMutating` | Revoke a binding (WRITE) |
| POST | `/api/social/send` | `authenticateMutating` | Manual outbound send over the real ConnectorPort (WRITE) |
| POST | `/api/social/webhooks/:channel` | **HMAC signature** (raw body) | Inbound webhook ingress (LINE/Slack/etc.); 401 on bad/missing sig |

_(No `/internal/social/probe` edge shipped; probing is exposed via the `social_channel_health` MCP tool and the `/health` read. Writes are gated at the identity layer via `authenticateMutating`; a dedicated governance-gate call is planned, not yet wired.)_

MCP tools (`mcp/social-engine.ts` → `buildSocialMcpTools`, registered by bootstrap into the `social`
MCP server via the `mcpDomains` list `{ name: 'social', tools: () => social.mcp() }` → `engines.registerDomainTools`).
The governed MCP HTTP edge `POST /api/mcp/tools/social/:tool/call` is LIVE. **All three tools are READ-ONLY**
(send stays on the HTTP `/send` edge):

- `social_list_connectors` — read: registered connectors (channel/enabled/status).
- `social_list_bindings` — read: caller's chat bindings; owner bound to the host-authorized `McpToolCaller` (cross-tenant request ⇒ 403, no caller ⇒ AUTH_REQUIRED; admin/internal may name an arbitrary owner).
- `social_channel_health` — read: live per-channel readiness probes for enabled live channels.

WS: none owned; conductor dispatch status streams over the conductor domain's `RunEvent` bus,
mirrored back to the channel by `dispatch/conductor-dispatch.ts`.

---

## 6. Interfaces (ports exposed & consumed)

**Exposes to other domains** — the frozen CORE (`index.ts` → `SocialModule`): `config()`,
`mentionGate()`, `repository()`, `health()`. The composer (`social-module.ts` → `SocialComposite`)
additionally exposes `core()`, `channels()`, `secrets()`, `dispatchPort()`, `tunnel()`, `pipeline()`,
`routes()` (the `/api/social` router), `mcp()` (read-only tools), `health()` (live), `start()`, `stop()`.

**Consumes from other domains** (constructor deps, strictly downward):
- `identity` → auth middleware (`authenticate` / `authenticateMutating`) on every non-webhook route; owner from the resolved `Principal`.
- `persistence` → `QueryExecutor` (behind `SocialRepository`; absent ⇒ in-memory degrade).
- `conductor` → `createWorkspace()` seam via `ConductorDispatchPort` (dispatch path).
- `inference` → LLM gateway via `ReplyInferencePort` (reply-agent turns).
- `governance/vault` → vault (connector secrets), via `ConnectorSecretsPort`.
- signed connector-ingress vouch → `createSealedIngressVouch` (degrade-safe; absent secret ⇒ inert).

**Load-bearing seams wired here:** identity auth middleware, `QueryExecutor`, conductor
`createWorkspace`, inference gateway, MCP `McpToolCaller`/`McpToolRegistration`, `AppConfig` slice.
_(A `GovernanceGate.decide()` seam on social writes is planned, not yet wired.)_

---

## 7. Engine / daemon deps

- **`@recoder/connectors`** (package) — the 8-channel `ConnectorPort` foundation, `resolveGate`,
  `NormalizedInboundMessage`. REUSE as-is; the 7 live channels bind, discord stays dormant.
- **`apps/desktop/engines/openclaw/social-gateways`** — the REAL ConnectorPort implementations,
  **used in place** via `openclaw-gateway.adapter.ts` (never copied; per no-pruning-OSS rule).
- **zrok** — public-URL tunnel binary for NAT webhook exposure; reached via
  `zrok-tunnel.adapter.ts` (subprocess/loopback); absent ⇒ degrade to `down`, webhooks require a
  reachable public URL configured out-of-band.
- **inference gateway** (tensorzero / byok) — for the reply agent; absent ⇒ reply path `down`,
  dispatch path still works.

All non-TS/engine reach is through `ports/` + degrade-safe `adapters/`. No raw dist import.

---

## 8. Reuse vs new

> **STATUS:** this migration is DONE. `backend/src/connectors/*` and `apps/social` have been
> folded behind the composer and REMOVED; discord live wiring was cut (foundation adapter kept).
> The bullets below are the historical provenance map, not remaining work.

**REUSE (moved behind the composer — did NOT rewrite):**
- `backend/src/connectors/gateway.ts` → `social-module.ts` composer core.
- `backend/src/connectors/connector-ingress-gate.ts` → `mention-gate.adapter.ts`.
- `backend/src/connectors/webhook-ingress.ts` + `webhook-channels.ts` → `webhook-ingress.adapter.ts` + the `/webhooks/:channel` route folded into `routes/social.routes.ts`.
- `backend/src/connectors/channel-adapters.ts` → `channel-adapter-registry.ts` + `openclaw-gateway.adapter.ts`.
- `backend/src/connectors/dispatch-runner.ts` → `dispatch/conductor-dispatch.ts` + `dispatch/reply-agent.ts` + `dispatch/inbound-pipeline.ts`.
- `backend/src/connectors/config.ts` → `config.ts` (rehomed to read the `AppConfig` slice, not `process.env`).
- `backend/src/connectors/index.ts` → `index.ts` + `health.ts`.
- `apps/social` (`recoder-social`) — **folds in**: its "compose the compiled package into a
  supervised runtime" job becomes the composer; the standalone app is retired.

**REUSE (packages/engines, unchanged):** `@recoder/connectors`, `@recoder/interop`,
`@recoder/governance`, `@recoder/agent-mcp`, `@recoder/agent-os`, `@recoder/agent-schemas`,
`@recoder/agent-events`, `@recoder/vault`, `@recoder/logger`, `@recoder/auth`,
`apps/desktop/engines/openclaw`.

**WRITE NEW (thin):** the `ports/*` interfaces (formalizing seams that were implicit),
`zrok-tunnel.adapter.ts` (NAT exposure was previously assumed), `social-repository.adapter.ts`
+ migrations (bindings/inbound-log were env/in-memory before → now DB-backed, Recoder-owned
state), `config.ts` AppConfig-slice rehome, and `mcp/social-engine.ts` tool registration.

**CUT:** `backend/src/connectors/discord-event-source.ts` + `discord.test.ts` (discord dropped
from the live set; the foundation adapter remains in `@recoder/connectors`, unwired).

---

## 9. Health / degrade-safe behavior

- No channel configured ⇒ module `up`, `degraded:false`, `engines:[]`, logs "no channels configured".
- Channel enabled but secret missing ⇒ that engine `down`; module `degraded:true`. **Never faked up.**
- Webhook missing signing secret ⇒ ingress returns `401` (`sendError(SERVICE_UNAVAILABLE)` path),
  not a `200`.
- zrok absent ⇒ tunnel `down`; if the deployment relies on it for inbound, that channel reports
  `down` (truthful) rather than silently dropping messages.
- Reply gateway absent ⇒ reply path `down`, conductor dispatch unaffected.
- `health()` shape: `{ status, degraded, engines: [{ name: ChannelId, status: 'up'|'down' }] }`.

---

## 10. Implementation order

> **STATUS:** all steps below are SHIPPED (Phase 7b). MCP tools register via the bootstrap
> `mcpDomains` list (`{ name: 'social', tools: () => social.mcp() }` → `engines.registerDomainTools`),
> not the older `IN_PROC_SERVERS`/`buildInProcEngineRouter` checklist. Kept as the build narrative.

1. **Contracts & config** — `types.ts`, `schema.ts`, `config.ts`, all `ports/*`. (Compile-only; no behavior.)
2. **Persistence** — `migrations/0001` + `0002`, `social-repository.port.ts` impl
   `social-repository.adapter.ts`. Verify with a focused repo test against the `QueryExecutor`.
3. **Trust boundary** — `webhook-ingress.adapter.ts` + `mention-gate.adapter.ts` (port the two
   existing modules verbatim behind the ports). Land `webhook-ingress.test.ts` +
   `mention-gate.test.ts` first (RED→GREEN).
4. **Engine binding** — `channel-adapter-registry.ts` + `openclaw-gateway.adapter.ts` +
   `connector-secrets.adapter.ts`. Prove one channel (telegram) end-to-end probe.
5. **Dispatch** — `dispatch/conductor-dispatch.ts` + `dispatch/reply-agent.ts` + `dispatch/inbound-pipeline.ts`; `dispatch-reply.test.ts`.
6. **NAT** — `zrok-tunnel.adapter.ts` (degrade-safe; optional in dev).
7. **Composer + edges** — `social-module.ts`, `index.ts`, `health.ts`/`live-health.ts`, `routes/*`,
   `mcp/social-engine.ts`; register MCP via the bootstrap `mcpDomains` list. Read-model + edge tests.
8. **Fold-in cleanup** — retired `apps/social`; deleted discord live wiring; removed `backend/src/connectors/*`
   (folded behind the composer, no 4th copy).

**Verification:** `pnpm check-types`, `pnpm test` (domain vitest), `pnpm test:contracts:agent-os`,
and the connector-specific gate/webhook unit tests. Truthful health verified before claiming done.
