# Domain: Social Connectors (`backend/src/domains/social/`)

> One of the 14 comprehensive-backend domains. Composer target: `backend/src/domains/social/`.
> Boundary: **the agents' presence on human channels.** Connector ingress + webhook,
> the 7 live `ConnectorPort` adapters (telegram / slack / signal / imessage / whatsapp /
> line / feishu), the **hostile-by-default mention gate**, inbound→conductor dispatch,
> and the embedded conversational reply agent. `apps/social` folds in here; **discord is
> dropped** from the live set (its adapter stays in the `@recoder/connectors` foundation
> at 8 channels, but is not wired to a live runtime).

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
- **Composer, not rewrite.** The existing `backend/src/connectors/*` (gateway, gate,
  webhook-ingress, dispatch-runner, channel-adapters) and the `recoder-social` app
  (`apps/social`) **move behind** `SocialModule`; the `@recoder/connectors` package and the
  `apps/desktop/engines/openclaw` social-gateways are **used in place** as the engine.
- **Fusion law.** No domain code shells out ad hoc. The zrok tunnel and the openclaw engine
  are reached only through `ports/` + degrade-safe `adapters/`.
- **State-of-record is Recoder's.** Channel bindings + inbound audit live in Postgres via the
  persistence `QueryExecutor`; dispatch state is a conductor `Task`/`Run`, never local.
- **Every WRITE (send, dispatch, bind) routes through the governance gate; every edge + MCP
  call passes the interop `authorize→risk→policy→audit` chain.**

---

## 2. File tree (`backend/src/domains/social/`, + `apps/desktop/engines/openclaw` in place)

```
backend/src/domains/social/
  index.ts                              # factory createSocialModule() + the ONE public SocialModule interface
  social-module.ts                      # composer: fuses gateway + gate + dispatch + engine behind SocialModule
  config.ts                             # SocialConfig slice (per-channel enable + secret refs) from AppConfig
  types.ts                              # ChannelId, InboundEnvelope, MentionDecision, DispatchOutcome, ChannelHealth
  schema.ts                             # zod schemas: inbound webhook body, admin bind, send payload
  health.ts                             # per-channel up|down aggregation → HealthReport

  ports/
    connector-port.ts                   # ConnectorPort contract (send/monitor/probe) narrowed from @recoder/connectors
    mention-gate.port.ts                # MentionGate: admit(inbound) → MentionDecision (hostile-by-default)
    dispatch.port.ts                    # DispatchPort: dispatchToConductor() + replyInChannel()
    tunnel.port.ts                      # PublicTunnelPort: ensurePublicUrl() for NAT webhook exposure (zrok)
    connector-secrets.port.ts           # ConnectorSecretsPort: resolve per-channel token/signing-secret
    social-repository.port.ts           # SocialRepository: connectors, bindings, inbound-log CRUD (impl in persistence)

  adapters/
    channel-adapter-registry.ts         # ChannelId → ConnectorPort factory; optional-SDK loader; degrade-safe
    openclaw-gateway.adapter.ts         # wraps apps/desktop/engines/openclaw social-gateways (used in place)
    mention-gate.adapter.ts             # hostile-by-default gate: allowlist+mention+command+signed interop claim
    webhook-ingress.adapter.ts          # HMAC verify (LINE/Slack) over raw body + replay window + challenge handshake
    zrok-tunnel.adapter.ts              # public-URL tunnel via zrok binary (loopback/subprocess), degrade → down
    conductor-dispatch.adapter.ts       # DispatchPort → conductor createWorkspace + RunEvent status follow
    reply-agent.adapter.ts              # embedded conversational reply agent via inference domain (gateway)
    connector-secrets.adapter.ts        # @recoder/vault-backed secret resolution, degrade → channel down
    social-repository.adapter.ts        # concrete SocialRepository over QueryExecutor (:param SQL)

  routes/
    social.routes.ts                    # GET /api/connectors (health), admin bind/unbind/send edges
    webhook.routes.ts                   # POST /api/connectors/webhooks/:channel (RAW body parser, HMAC gate)

  mcp/
    social-engine.ts                    # registerSocialMcpTools: social.list_channels/send_message/channel_health

  migrations/                           # copied into backend/migrations/ by persistence runner (canonical location)
    0001_social_connectors.sql          # connectors + channel_bindings tables
    0002_social_inbound_log.sql         # inbound_messages audit + dedup index

  __tests__/
    mention-gate.test.ts                # hostile-by-default: empty allowlist rejects; mention+allow admits
    webhook-ingress.test.ts             # LINE/Slack HMAC verify, replay reject, challenge, missing-secret 401
    dispatch-reply.test.ts              # /run → conductor createWorkspace; plain mention → reply-agent turn
    health.test.ts                      # truthful per-channel up|down, degraded labelling, no-channels inert

apps/desktop/engines/openclaw/          # USED IN PLACE (never copied) — the ConnectorPort engine implementations
  social-gateways/{telegram,slack,signal,imessage,whatsapp,line,feishu,_dispatch,config,infra}
```

Count: 30 files under the domain prefix (~28 target) + the openclaw engine in place.

---

## 3. Per-file responsibilities

| # | Path | Lang | Kind | Responsibility | Key exports |
|---|------|------|------|----------------|-------------|
| 1 | `index.ts` | ts | service | Pure factory + the single public interface other domains import | `createSocialModule(deps): SocialModule`, `interface SocialModule` |
| 2 | `social-module.ts` | ts | service | Composer: builds registry, gate, dispatcher, tunnel; wires inbound pipeline; owns lifecycle | `class SocialComposer implements SocialModule`, `start()`, `stop()` |
| 3 | `config.ts` | ts | config | Typed `SocialConfig` slice: per-channel `{enabled, secretRef}`, ingress secret, zrok settings; no `process.env` | `type SocialConfig`, `sliceSocialConfig(app: AppConfig)` |
| 4 | `types.ts` | ts | type | Domain value types | `ChannelId`, `InboundEnvelope`, `MentionDecision`, `DispatchOutcome`, `ChannelHealth`, `SendRequest` |
| 5 | `schema.ts` | ts | schema | zod validation at the boundary (reuses `@recoder/agent-schemas` where shared) | `WebhookBodySchema`, `BindChannelSchema`, `SendMessageSchema` |
| 6 | `health.ts` | ts | service | Aggregate per-channel probe results into `HealthReport`; truthful degraded flag | `buildSocialHealth(runtimes): HealthReport` |
| 7 | `ports/connector-port.ts` | ts | port | Narrow the `@recoder/connectors` `ConnectorPort` (send/monitor/probe) to the domain seam | `type ConnectorPort`, `NormalizedInboundMessage`, `ConnectorProbeResult` (re-export) |
| 8 | `ports/mention-gate.port.ts` | ts | port | Interface for the trust boundary decision | `interface MentionGate { admit(env: InboundEnvelope): Promise<MentionDecision> }` |
| 9 | `ports/dispatch.port.ts` | ts | port | Interface into the conductor + reply agent | `interface DispatchPort { dispatchToConductor(...); replyInChannel(...) }` |
| 10 | `ports/tunnel.port.ts` | ts | port | NAT public-URL exposure contract | `interface PublicTunnelPort { ensurePublicUrl(path): Promise<string \| null> }` |
| 11 | `ports/connector-secrets.port.ts` | ts | port | Per-channel secret resolution seam (vault) | `interface ConnectorSecretsPort { resolve(channel, kind): Promise<string \| null> }` |
| 12 | `ports/social-repository.port.ts` | ts | port | Data-access contract implemented by persistence | `interface SocialRepository { listBindings(); upsertBinding(); recordInbound(); wasSeen() }` |
| 13 | `adapters/channel-adapter-registry.ts` | ts | adapter | Map `ChannelId`→`ConnectorPort` factory; lazy optional-SDK import; test seam override; degrade to `down` | `getChannelAdapter(id)`, `overrideAdapterFactory(id, fn)`, `SUPPORTED_CHANNELS` |
| 14 | `adapters/openclaw-gateway.adapter.ts` | ts | adapter | Load the real `ConnectorPort` impls from `engines/openclaw/social-gateways` in place | `buildOpenclawPort(channel, cfg): Promise<ConnectorPort>` |
| 15 | `adapters/mention-gate.adapter.ts` | ts | adapter | Hostile-by-default gate: allowlist → mention → command parse → signed `ConnectorIngressClaim`; reuses `connector-ingress-gate` | `class HostileMentionGate implements MentionGate` |
| 16 | `adapters/webhook-ingress.adapter.ts` | ts | middleware | Verify HMAC over RAW body (LINE `x-line-signature`, Slack `v0`), replay window, `url_verification` challenge after verify | `verifyLineSignature`, `verifySlackSignature`, `processWebhookDelivery` |
| 17 | `adapters/zrok-tunnel.adapter.ts` | ts | client | Reserve/attach a zrok public share for the webhook path via loopback/subprocess; degrade→`null`+`down` | `class ZrokTunnel implements PublicTunnelPort` |
| 18 | `adapters/conductor-dispatch.adapter.ts` | ts | adapter | `/run …` → conductor `createWorkspace`; subscribe to `RunEvent`s; stream status back to channel | `class ConductorDispatch implements DispatchPort['dispatchToConductor']` |
| 19 | `adapters/reply-agent.adapter.ts` | ts | adapter | Embedded conversational turn via inference gateway (tensorzero/byok); short, bounded, no tools | `class ReplyAgent`, `runReplyTurn(env): Promise<string>` |
| 20 | `adapters/connector-secrets.adapter.ts` | ts | adapter | Resolve tokens/signing secrets from `@recoder/vault`; missing ⇒ channel `down` (never fake) | `class VaultConnectorSecrets implements ConnectorSecretsPort` |
| 21 | `adapters/social-repository.adapter.ts` | ts | repository | Concrete `SocialRepository` over persistence `QueryExecutor`, `:param` SQL, `WHERE user_id = :user_id` | `class PgSocialRepository implements SocialRepository` |
| 22 | `routes/social.routes.ts` | ts | route | HTTP edges: health, admin bind/unbind, manual send; interop chain + `sendSuccess/sendError` | `createSocialRouter(mod): Router` |
| 23 | `routes/webhook.routes.ts` | ts | route | Raw-body webhook POST per channel; signature gate before JSON parse; `markWebhookIngressMounted` | `createWebhookRouter(mod): Router` |
| 24 | `mcp/social-engine.ts` | ts | service | MCP tools conforming to `@recoder/agent-mcp` ToolRouter; each passes interop chain | `registerSocialMcpTools(router)`: `social.list_channels`, `social.send_message`, `social.channel_health` |
| 25 | `migrations/0001_social_connectors.sql` | sql | migration | `connectors` + `channel_bindings` tables | — |
| 26 | `migrations/0002_social_inbound_log.sql` | sql | migration | `inbound_messages` audit + dedup unique index | — |
| 27 | `__tests__/mention-gate.test.ts` | ts | test | Empty allowlist rejects; correct mention+allowlist admits; command parse | — |
| 28 | `__tests__/webhook-ingress.test.ts` | ts | test | LINE/Slack HMAC verify + tamper reject, replay reject, challenge, missing-secret ⇒ 401 | — |
| 29 | `__tests__/dispatch-reply.test.ts` | ts | test | `/run` path calls conductor `createWorkspace`; plain mention calls reply agent; reply routes back on same port | — |
| 30 | `__tests__/health.test.ts` | ts | test | No channels ⇒ inert but healthy; configured-but-no-secret ⇒ `down`; degraded labelled | — |

---

## 4. DB schema (`backend/migrations/`, canonical location; runner in `domains/persistence`)

All access via persistence `QueryExecutor` with `:param` placeholders. App-layer access control
(`WHERE user_id = :user_id`). **No Supabase RLS / `auth.uid()`.**

```sql
-- 0001_social_connectors.sql
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

-- 0002_social_inbound_log.sql
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

HTTP (mounted by the `edge` domain route table; every call passes interop `authorize→risk→policy→audit`):

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/connectors` | session | Truthful per-channel health (configured? connected? up/down) |
| POST | `/api/connectors/webhooks/:channel` | **HMAC signature** (raw body) | Inbound webhook ingress (LINE/Slack/etc.); 401 on bad/missing sig |
| POST | `/api/connectors/:id/bind` | session + governance | Bind an allowlisted chat_ref → space/agent (WRITE, gated) |
| DELETE | `/api/connectors/:id/bind/:chatRef` | session + governance | Revoke a binding (WRITE, gated) |
| POST | `/api/connectors/:id/send` | session + governance | Manual outbound send over the real ConnectorPort (WRITE, gated) |
| POST | `/internal/social/probe` | `INTERNAL_SERVICE_KEY` | Worker-triggered channel probe |

MCP tools (`mcp/social-engine.ts`, registered via the wiring checklist — add to `IN_PROC_SERVERS`
+ `ENGINE_SERVERS`, write `registerSocialMcpTools`, call in `buildInProcEngineRouter`):

- `social.list_channels` — read: configured channels + status.
- `social.channel_health` — read: probe one channel.
- `social.send_message` — **write** (governance-gated): send text to a bound chat_ref.

WS: none owned; conductor dispatch status streams over the conductor domain's `RunEvent` bus,
mirrored back to the channel by `conductor-dispatch.adapter.ts`.

---

## 6. Interfaces (ports exposed & consumed)

**Exposes to other domains** (`index.ts` → `SocialModule`):
- `SocialModule.health()` — for the bootstrap health aggregate.
- `SocialModule.send(req: SendRequest)` — governance-gated outbound (used by `notify`/observability).
- `SocialModule.listChannels()` — read model for the desktop cockpit / edge.

**Consumes from other domains** (constructor deps, strictly downward):
- `identity` → `Session` (edge auth on every non-webhook route).
- `persistence` → `QueryExecutor` (behind `SocialRepository`).
- `governance` → `GovernanceGate.decide()` (every send/bind/dispatch WRITE).
- `interop` → `InteropChain` (every edge + MCP call) + signed `ConnectorIngressClaim` re-admit.
- `conductor` → `createWorkspace()` + `RunEvent` bus (dispatch path).
- `inference` → LLM gateway (reply-agent turns).
- `governance/vault` → `@recoder/vault` (connector secrets).
- `agent-os` → `Space` / `Task` shapes (`@recoder/agent-os`, `@recoder/agent-schemas`).

**Load-bearing seams wired here:** `Session`, `QueryExecutor`, `GovernanceGate.decide()`,
`InteropChain`, `RunEvent` bus, `ToolRouter`, `AppConfig` slice.

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

**REUSE (move behind the composer — do NOT rewrite):**
- `backend/src/connectors/gateway.ts` → `social-module.ts` composer core.
- `backend/src/connectors/connector-ingress-gate.ts` → `mention-gate.adapter.ts`.
- `backend/src/connectors/webhook-ingress.ts` + `webhook-channels.ts` → `webhook-ingress.adapter.ts` + `routes/webhook.routes.ts`.
- `backend/src/connectors/channel-adapters.ts` → `channel-adapter-registry.ts` + `openclaw-gateway.adapter.ts`.
- `backend/src/connectors/dispatch-runner.ts` → `conductor-dispatch.adapter.ts` + `reply-agent.adapter.ts`.
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

1. **Contracts & config** — `types.ts`, `schema.ts`, `config.ts`, all `ports/*`. (Compile-only; no behavior.)
2. **Persistence** — `migrations/0001` + `0002`, `social-repository.port.ts` impl
   `social-repository.adapter.ts`. Verify with a focused repo test against the `QueryExecutor`.
3. **Trust boundary** — `webhook-ingress.adapter.ts` + `mention-gate.adapter.ts` (port the two
   existing modules verbatim behind the ports). Land `webhook-ingress.test.ts` +
   `mention-gate.test.ts` first (RED→GREEN).
4. **Engine binding** — `channel-adapter-registry.ts` + `openclaw-gateway.adapter.ts` +
   `connector-secrets.adapter.ts`. Prove one channel (telegram) end-to-end probe.
5. **Dispatch** — `conductor-dispatch.adapter.ts` + `reply-agent.adapter.ts`; `dispatch-reply.test.ts`.
6. **NAT** — `zrok-tunnel.adapter.ts` (degrade-safe; optional in dev).
7. **Composer + edges** — `social-module.ts`, `index.ts`, `health.ts`, `routes/*`, `mcp/social-engine.ts`;
   register MCP via the wiring checklist. `health.test.ts`.
8. **Fold-in cleanup** — retire `apps/social`; delete discord live wiring; move `backend/src/connectors/*`
   behind the composer (no 4th copy).

**Verification:** `pnpm check-types`, `pnpm test` (domain vitest), `pnpm test:contracts:agent-os`,
and the connector-specific gate/webhook unit tests. Truthful health verified before claiming done.
