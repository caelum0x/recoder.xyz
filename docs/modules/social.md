# SOCIAL module

**Shipped** — a REAL standalone domain at `backend/src/domains/social/`
(`createSocialComposer` in `social-module.ts`, layered on the frozen core
`createSocialModule` in `index.ts`). It mounts at `/api/social` (NOT
`/api/connectors`) and registers its read-only tools under the `social` MCP
server. Uses the OSS engine **in place** (never copied): the openclaw
social-gateways at `apps/desktop/engines/openclaw/social-gateways/*`, bound
through the `@recoder/connectors` foundation package.

**What it is.** SOCIAL is the agents' human-channel presence: it lets a person
talk to Recoder from a chat app they already use, turns an admitted `/run …`
message into real conductor work, and answers conversational turns through the
inference gateway — all behind a hostile-by-default trust boundary, because
**every inbound byte is untrusted channel content**.

**Interface:** `channels · bindings · send · onInbound · dispatchToConductor ·
webhooks · health` — composed by `SocialComposite` (`social-module.ts`), which
consumes the frozen core (`mentionGate() / repository() / config()`) and layers
the channel registry, connector secrets, dispatch, zrok tunnel, and inbound
pipeline around it without ever editing the core.

## The `ConnectorPort` abstraction + 7 live channel adapters

The single per-channel seam is `ConnectorPort` (`ports/connector-port.ts`),
**re-exported straight from `@recoder/connectors`** so there is exactly ONE
contract (`send / probe / monitor / normalize`), never a second copy. Nothing in
the domain shells out to a channel SDK directly.

`adapters/openclaw-gateway.adapter.ts` is the ONE place that touches a channel
SDK: it resolves each channel via a **dynamic import** of
`@recoder/connectors/<channel>` wrapped in try/catch — an absent dep yields
`null` and the registry marks that channel `down` rather than crashing module
load. `adapters/channel-adapter-registry.ts` holds the resolved ports and exposes
`get / send / statuses`, each degrade-safe (a missing connector or missing secret
is a truthful non-delivery, never a faked `up`).

`types.ts` defines the channel sets: `CHANNEL_IDS` is the 8 foundation channels
(`telegram, slack, discord, signal, imessage, whatsapp, line, feishu`);
`LIVE_CHANNEL_IDS` is the **7 live channels** — **`discord` is dropped from the
live set** (foundation adapter only, always resolves `null`). The 7 live bindings
(factory or constructor) are declared in `openclaw-gateway.adapter.ts`
`CHANNEL_BINDINGS`. **Telegram is the reference proof that a channel works
end-to-end** (`createTelegramConnector`).

## Inbound message → `dispatchToConductor` pipeline

`dispatch/inbound-pipeline.ts` is the end-to-end path one inbound message travels
after it crosses the transport boundary. Five stages, each degrade-safe:

1. **DEDUP** — `repository.wasSeen(connectorId, providerMsgId)` drops replays.
2. **TRUST** — the hostile-by-default `MentionGate.admit(env)` decides admission.
3. **DISPATCH** — an admitted `/run …` → `dispatch.dispatchToConductor`; anything
   else → `dispatch.replyInChannel`.
4. **REPLY** — a produced reply is sent back over the `ConnectorPort` (best-effort).
5. **AUDIT** — every outcome is recorded via `repository.recordInbound` (which is
   also the step-1 idempotency guard).

Two ingress transports feed this pipeline. **Long-poll monitors** are started per
enabled channel in `SocialComposite.start()` (`port.monitor(...)` → `ingest`).
**HTTP webhooks** arrive at `POST /api/social/webhooks/:channel`, are verified,
normalized, then `ingest`ed. NAT exposure for webhooks is optional via
`adapters/zrok-tunnel.adapter.ts` (absent tunnel ⇒ push channels report `down`,
never silently dropped).

`dispatch/conductor-dispatch.ts` turns an admitted `/run` into a conductor
workspace + Run through the Phase-5 `createWorkspace` seam (`ConductorDispatchPort`,
consumed as a PORT — never a direct import). Crucially, the **owner principal is
resolved by the injected `ConductorTargetResolver`, never taken from channel
content**. A run id is returned ONLY when the conductor genuinely launched one;
an unwired seam, an unbound chat, or a conductor refusal all yield a truthful
`error` outcome (no faked run). `dispatch/reply-agent.ts` is the conversational
half — a bounded turn through the Phase-6 inference gateway
(`ReplyInferencePort`), likewise never fabricating a reply.

## Governance / trust boundary (social input is UNTRUSTED)

**Layer 1 — transport boundary (`adapters/webhook-ingress.adapter.ts`).**
Push channels (LINE, Slack Events) are hostile-by-default: the channel signature
is verified over the **RAW body** using Node `crypto` only (LINE
`base64(HMAC-SHA256)`, Slack `v0` with a 5-minute replay window). A missing
signing secret ⇒ 401 (cannot verify ⇒ refuse, never a faked 200); the Slack
`url_verification` challenge is answered only AFTER verification.

**Layer 2 — trust boundary (`adapters/mention-gate.adapter.ts`,
`HostileMentionGate`).** A verified delivery is still untrusted until this gate
admits it. Its ladder fails CLOSED at each rung: (1) **allowlist** — an empty
allowlist admits nothing (`allowlist_empty`); a `*` wildcard, a listed sender id,
or a binding-backed `allow:true` for the chat_ref satisfies it; (2) **mention** —
when `requireMention`, a group message must @-mention the agent or carry a control
command; (3) **command** parse (`/run …` → conductor, else reply); (4) optional
**signed vouch** (`adapters/signed-vouch.adapter.ts`) re-proves the message when an
ingress HMAC secret is configured. `admit` NEVER throws on untrusted input.

**Config posture (`config.ts`).** Hostile-by-default and truthful: every channel
defaults OFF with no secret; the allowlist defaults EMPTY; `requireMention`
defaults true. Secrets are stored as vault **references**, never plaintext —
`adapters/connector-secrets.adapter.ts` resolves them lazily (absent vault ⇒ null
secret ⇒ channel `down`).

**HTTP edge gating (`routes/social.routes.ts`).** Reads use
`middleware.authenticate`; mutating writes (`POST /bindings`,
`DELETE /bindings/:connectorId/:chatRef`, `POST /send`) use
`authenticateMutating`, and the owner is always taken from the resolved
`Principal`, never the body. Full surface: `GET /`, `GET /channels`,
`GET /connectors`, `GET /bindings`, `POST /bindings`,
`DELETE /bindings/:connectorId/:chatRef`, `POST /send`, `POST /webhooks/:channel`
(session-unauthenticated but HMAC-hostile), `GET /health`.

## Agent-facing MCP tools

`mcp/social-engine.ts` (`buildSocialMcpTools`) exposes a **READ-ONLY** surface
registered as the **`social`** MCP server. Bootstrap bridges it into the ONE
interop-gated host via `engines.registerDomainTools('social', social.mcp())`
(`bootstrap/index.ts:1403`), so every call passes the host's
`authorize → risk → policy → audit` chain. Agents call these over the governed
edge **`POST /api/mcp/tools/social/:tool/call`**; there is **no `recoder_social`
alias on the public `recoder` MCP server** — the governed name space is
`server = social`, `tool = social_*` (documenting a fabricated alias would be
untruthful):

- **`social_list_connectors`** — registered connectors (channel/enabled/status).
- **`social_list_bindings`** — the caller's allowlisted chat bindings. Its owner
  is derived from the host-authorized `McpToolCaller`, **never** from free-form
  `args` — a non-privileged caller that names a `userId` it does not own is
  rejected 403 (the cross-tenant binding-disclosure class is closed;
  `mcp/social-engine.ts` `resolveOwner`).
- **`social_channel_health`** — live per-channel readiness probes for enabled
  live channels.

The write-bearing operations (bind a chat, send a message) deliberately stay on
the governed HTTP edges above, **not** on the agent-callable MCP surface.

## Desktop surface

The read-only **Connectors** view (`recoder-connectors`) was **retired** (DT-5,
`ec1bdbe62`) — the desktop is terminal-plain and carries no infra/connector
dashboard. The backend `GET /api/social` surface remains (truthful per-channel
`status`, an **explicit field allowlist** so nothing token-shaped is ever exposed,
`not-connected` on a non-OK response, `empty` for zero channels), but there is no
desktop view/viewModel bound to it today.

**Health (`live-health.ts` `buildLiveSocialHealth`).** Config posture plus live
`ConnectorPort` probes: no enabled channels ⇒ an inert-but-truthful `up`; any
enabled channel not reachable ⇒ `degraded` with the per-channel reason named.

**Rule:** this module drives the real engine(s) directly and exposes ONE
cohesive, governed, health-truthful interface to the backend. Depth lives in the
engine dirs; this folder owns the composition + interface. Degrade-safe: any
engine/connector down → that channel reports `down` with the missing source
named, never fakes success; an unwired conductor/inference seam makes dispatch
fail truthfully rather than fabricate a run or reply. See
../RECODER-MODULES.md §SOCIAL.
