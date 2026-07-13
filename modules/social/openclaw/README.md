# @recoder/connectors

Recoder's connectors / social-gateway package. **Owned in place** from OpenClaw's
extracted gateway-core + social-gateways + embedded agents (formerly
"extracted-from-openclaw"). Identity rebranded to Recoder (`RECODER_CONNECTORS_*`
env, `@recoder/*` naming).

## Foundation (`src/`) — built, type-checked, tested green

This package's compiled surface is the **foundation** for the interop subsystem.
The per-channel adapters
(telegram/slack/discord/signal/line/feishu/imessage/whatsapp) are a later phase
that wrap each real gateway behind the `ConnectorPort`.

- `src/connector/` — the domain types + the **`ConnectorPort`** contract
  (`monitor` / `send` / `probe` / `normalize` / `react`), grounded in the real
  extracted gateway signatures (`monitorTelegramProvider`, `sendMessageTelegram`,
  `probeTelegram`, `reactMessageTelegram`).
- `src/gating/` — the connector **trust boundary** (interop §2): the real, pure
  `allowlist-match` + `mention-gating` + `command-gating` modules (extracted
  verbatim from gateway-core — zero-dependency working code, not stubs),
  composed by `resolveGate()` into one decision. A message that fails gating
  produces **no** control-plane action.
- `src/agents/` — multi-account `auth-profiles`, the embedded pi-agent
  `EmbeddedRunner` contract, and the **concrete `PiEmbeddedRunner`** that drives
  the real pi coding-agent harness (`@mariozechner/pi-agent-core` `Agent` +
  `@mariozechner/pi-ai` `streamSimple`). The pi SDKs are OPTIONAL peers: the
  foundation imports only their *types* (erased at build) and loads their
  *values* lazily via `loadOptionalPi` (`src/agents/optional-pi.ts`), so the
  foundation bundle pulls in none of the heavy pi graph and install stays
  ENOSPC-safe. A consumer without the pi SDKs gets a truthful, actionable error
  the moment they call `run()` — never a fake success.
- `src/dispatch/` — the inbound -> gating -> embedded-agent -> outbound
  **dispatch pipeline**. `ConnectorRegistry` maps a `ConnectorKind` to a live
  `ConnectorPort`; `dispatchInbound` runs `resolveGate`, and only on an
  authorized message drives one embedded agent turn and delivers the collected
  reply through the registered port. Every failure mode (blocked, empty reply,
  unsupported channel, runner error, send error) is encoded in a truthful
  `DispatchOutcome` — the pipeline never throws and never fakes a delivery.
  `makeAllowlistGatePolicy` is the default `GatePolicy`: it derives the pure
  `GateInput` the trust boundary consumes directly from a normalized inbound
  message + a small deployment policy (allowlist match against the sender
  identity, group mention requirement, control-command prefixes), so any adapter
  goes live end-to-end behind the gate without an integrator re-deriving the
  mapping. Hostile-by-default: an empty allowlist authorizes nobody.
- `src/identity.ts` — `RECODER_CONNECTORS_*` env (legacy `OPENCLAW_*` honored as
  a deprecated fallback).

### Per-channel adapter subpaths (consumable)

The typecheck-clean `ConnectorPort` adapters are shipped as their own subpaths so
importing one pulls only that channel's optional SDK:

- `@recoder/connectors/telegram` — raw Bot API over fetch (no SDK).
- `@recoder/connectors/slack` — `@slack/web-api` / `@slack/bolt` (optional, lazy).
- `@recoder/connectors/signal` — signal-cli JSON-RPC.
- `@recoder/connectors/imessage` — local iMessage RPC bridge.
- `@recoder/connectors/whatsapp` — WhatsApp wire transport.
- `@recoder/connectors/line` — LINE Messaging API (`@line/bot-sdk` optional, lazy).
- `@recoder/connectors/feishu` — Feishu / Lark (`@larksuiteoapi/node-sdk` optional, lazy).

All seven adapters are wired **live end-to-end**: each is exercised by a real
per-channel dispatch test (`social-gateways/_dispatch/*.dispatch.test.ts`) that
feeds a real channel-native event through the adapter's **real `normalize`**,
registers the **real adapter** in the **real `ConnectorRegistry`**, and runs
**real `dispatchInbound`** so the gate -> embedded runner -> the adapter's **real
`send()`** flow executes. The only thing doubled is each channel's true SDK seam:
telegram's `fetchImpl`, slack's `clientFactory` (`SlackWebClient`), line's
`clientFactory` (`MessagingApiClient`), signal/whatsapp/feishu's `globalThis.fetch`
(their HTTP wire), and iMessage's `imsg rpc` subprocess
(`RECODER_IMESSAGE_CLI_PATH`, a faithful in-memory JSON-RPC daemon double). The
dispatch logic itself is never mocked.

The **discord** adapter is intentionally NOT exported. Its foundation-facing
normalize surface typechecks clean (`social-gateways/discord/tsconfig.adapter.json`)
and the `../infra/*` leaf cluster it depends on is now really extracted —
`social-gateways/infra/{retry,retry-policy,errors,channel-activity,sleep}.ts`
(verified via `social-gateways/infra/tsconfig.json`, 0 errors). But the full
`connector-port.ts` dispatch pipeline still imports the un-extracted OpenClaw bot
core: **172 type errors** remain, of which **74 are `TS2307`** missing-module
errors across **15 un-extracted sibling root clusters** —
`auto-reply/*` (32 refs: `reply/{history,inbound-context,mentions,reply-dispatcher,
provider-dispatcher,reply-reference}`, `commands-registry`, `dispatch`,
`command-detection`, `envelope`, `inbound-debounce`, `skill-commands`, `chunk`,
`types`), `channels/*` (15 refs), `config/{commands,sessions,markdown-tables}`,
`gateway/{client,protocol}`, `pairing/{pairing-store,pairing-messages}`,
`security/channel-metadata`, `web/media`, `polls`, `markdown/tables`,
`agents/identity`, `infra/exec-approvals`, `utils*`, `logger`/`logging`. The
remaining 98 errors (`TS2339`/`TS7006`/`TS2305`/…) are all downstream noise in
discord's own `monitor/*` files caused by those unresolved imports and clear once
the clusters are extracted. This is the entire OpenClaw agent reply pipeline, not
a minimal leaf — so `./discord` stays out of exports and the package build stays
green.

Verify: `npx tsc --noEmit` (0 errors) -> `vitest run` (51 tests: 21 gating +
dispatch foundation, 16 default-gate-policy, 14 per-channel end-to-end dispatch)
-> `tsup` (ESM + CJS + d.ts for the foundation + 7 adapter subpaths).

## Raw reference source (NOT compiled by this package)

`gateway-core/`, `social-gateways/`, and `agents/` are the **raw extraction** and
are excluded from `tsconfig.json` / `vitest.config.ts`. They were torn out of a
larger monorepo and still import sibling modules that were **not** part of the
extraction (`../config`, `../infra`, `../auto-reply`, `../routing`, `../logging`,
`../markdown`, `../cli`, `../plugins/runtime`, ...). They therefore do **not**
compile in isolation; they are the working-code reference the adapter phase
ports from, channel by channel, behind `ConnectorPort`.

## Original extraction notes (2026-03-28)

Code extracted before removing OpenClaw from production.

## What's Here

### social-gateways/
Channel implementations — WhatsApp, Telegram, Slack, Discord, Signal, LINE, Feishu, iMessage.
Each has accounts, message normalization, API clients, and delivery logic.
**Use for:** porting into Agency or IronClaw as messaging channel plugins.

### agents/
Agent execution logic — scope management, patch application, auth, tool calling.
**Use for:** studying PIC agent patterns, potentially porting to Recoder Agents.

### gateway-core/
Core gateway + channel routing — auth, boot, chat handling, abort, attachments.
Also includes channel framework (allowlists, mention gating, sender identity, etc.).
**Use for:** reference when building Agency's channel layer.

### skills-reference/
List of 53 OpenClaw skills (not copied — just the directory listing).
Skills include: 1password, apple-notes, bear-notes, canvas, camsnap, etc.
**Use for:** inspiration for Recoder Agent skills.

## What Was Removed
- OpenClaw nginx server block (openclaw.recoder.xyz)
- OpenClaw upstream definition
- vcpeer + vcpeer-cron PM2 services (stop on server)
- openclaw-gateway Docker container (remove on server)

## Replacement Plan
See plan.md Phase 5 for IronClaw/ZeroClaw/build-into-Agency options.
