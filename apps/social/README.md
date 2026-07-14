# recoder-social

The Recoder social layer as a standalone supervised runtime. It composes the
**compiled** `@recoder/connectors` package surface (nothing under the package's
raw-reference `gateway-core/` / `social-gateways/` trees is touched):

- the eight per-channel `ConnectorPort` adapters (`@recoder/connectors/telegram`,
  `/slack`, `/feishu`, `/line`, `/signal`, `/whatsapp`, `/imessage`, `/discord`),
  loaded lazily so an unconfigured channel never pulls its SDK,
- the trust boundary (`makeAllowlistGatePolicy` + `resolveGate` — hostile by
  default: an **empty allowlist authorizes nobody**),
- the dispatch pipeline (`ConnectorRegistry` + `dispatchInbound`) with the
  optional embedded pi-agent reply runner.

Boot order: env config → status HTTP listener → channel runtime. Degrade-safe:
with no channel tokens configured the app starts, logs
`no channels configured`, and keeps serving truthful status.

## Honest state

- **Live inbound today (config alone):** telegram (long-poll), slack (Socket
  Mode app token), feishu (Lark long connection). Their monitors run in-process.
- **Configured but inbound NOT live here:** line (needs an HTTP webhook ingress
  this app does not mount yet), discord (needs a gateway-WS event source),
  signal / whatsapp / imessage (need an external daemon/bridge/CLI). These get a
  real port — `send`/`probe` work — and status says exactly which dependency is
  missing (`requiresExternal` + `reason`).
- **Replies:** the embedded pi-agent runner is opt-in
  (`CONNECTORS_AGENT_ENABLED=true`) and its pi SDKs are optional peers. Without
  it, an authorized message is recorded as a truthful `no-runner` outcome and
  **nothing is sent** — never a fake reply.
- **Workspace membership:** `apps/social` is NOT yet listed in
  `pnpm-workspace.yaml` (owner action; see repo task notes). Local `tsc`,
  `vitest`, and `esbuild` already resolve `@recoder/connectors` through the root
  `node_modules` link created by the existing `apps/desktop/engines/openclaw`
  membership.
- The channel SDKs (`grammy`, `@slack/bolt`, …) are optional peers of the
  connectors package. A configured channel whose SDK is missing degrades to a
  truthful `adapter unavailable: …` status entry.

## Run

```bash
# dev (from apps/social)
npx tsx src/main.ts

# tests (10 composition tests; in-memory ports, no network)
npx vitest run

# type-check / bundle
npx tsc --noEmit
npx esbuild src/main.ts --bundle --platform=node --format=esm --outfile=dist/main.mjs
node dist/main.mjs
```

Then:

```bash
curl -s http://127.0.0.1:7391/health
curl -s http://127.0.0.1:7391/status          # or /api/social/status
```

## Environment

App-only (`SOCIAL_*`):

| Var | Default | Meaning |
| --- | --- | --- |
| `SOCIAL_HOST` | `127.0.0.1` | Status listener bind host (loopback by default). |
| `SOCIAL_PORT` | `7391` | Status listener port (`0` = ephemeral). Invalid values fail fast. |

Shared connectors surface (same vocabulary as the backend bridge; each
also honors the `RECODER_CONNECTORS_*` / legacy `OPENCLAW_*` prefixes):

| Var | Default | Meaning |
| --- | --- | --- |
| `CONNECTORS_CHANNELS` | all eight | Comma-list pinning the candidate channels. |
| `CONNECTORS_ALLOWLIST` | *(empty = block everyone)* | Sender ids/usernames allowed to invoke. Literal `*` = explicit allow-all. |
| `CONNECTORS_REQUIRE_MENTION` | `true` | Require an @mention in groups/channels. |
| `CONNECTORS_AGENT_ENABLED` | `false` | Opt-in embedded pi-agent replies. |
| `CONNECTORS_AGENT_ID` | `connector-reply` | Logical agent id for reply turns. |
| `CONNECTORS_AGENT_MODEL` | — | Model override for the embedded runner. |

Per-channel credentials (never hardcoded; presence decides `configured`):
`TELEGRAM_BOT_TOKEN`, `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN`, `FEISHU_APP_ID` +
`FEISHU_APP_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` + `LINE_CHANNEL_SECRET`,
`SIGNAL_ACCOUNT` + `SIGNAL_BASE_URL`, `WHATSAPP_BASE_URL` (+`WHATSAPP_TOKEN`),
`RECODER_IMESSAGE_ENABLED`, `DISCORD_BOT_TOKEN`.

## Layout

```
src/config.ts    env -> typed config (fail fast, no secrets)
src/channels.ts  8 channel drivers: truthful detect() + lazy real adapter create()
src/runtime.ts   SocialRuntime: registry, monitors, gate -> dispatch, truthful status
src/health.ts    zero-dep node:http status listener (/health, /status)
src/main.ts      supervised boot + graceful shutdown
```

The webhook/signed-ingress path (LINE/Slack HTTP events, `@recoder/interop`
seal+admit) remains owned by `backend/src/connectors/` — this app does
not duplicate it; wiring an ingress here is future work.
