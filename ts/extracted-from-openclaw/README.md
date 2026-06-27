# @recoder/connectors

Recoder's connectors / social-gateway package. **Owned in place** from OpenClaw's
extracted gateway-core + social-gateways + embedded agents (formerly
"extracted-from-openclaw"). Identity rebranded to Recoder (`RECODER_CONNECTORS_*`
env, `@recoder/*` naming).

## Foundation (`src/`) — built, type-checked, tested green

This package's compiled surface is the **foundation** described in
`docs/subsystems/interop.md` §7.4. The per-channel adapters
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
- `src/agents/` — multi-account `auth-profiles` + the embedded pi-agent
  `EmbeddedRunner` contract (ported from `agents/agents/auth-profiles/*` and
  `pi-embedded-runner/*`).
- `src/identity.ts` — `RECODER_CONNECTORS_*` env (legacy `OPENCLAW_*` honored as
  a deprecated fallback).

Verify: `bun install` -> `tsc --noEmit` (clean) -> `vitest run` (13 real gating
tests pass) -> `tsup` (ESM + CJS + d.ts).

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
