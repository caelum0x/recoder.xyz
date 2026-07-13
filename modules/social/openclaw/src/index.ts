// @recoder/connectors — Recoder's connectors / social-gateway package.
//
// Owned in place from OpenClaw's extracted gateway-core + social-gateways +
// embedded agents (ts/extracted-from-openclaw). This is the FOUNDATION layer:
// the ConnectorPort contract, the connector domain types, the connector trust
// boundary (allowlist + mention + command gating), and the embedded-agent
// auth/runner contracts. The per-channel adapters (telegram/slack/discord/
// signal/line/feishu/imessage/whatsapp) wrap each real extracted gateway behind
// ConnectorPort in a later phase.

export * from "./identity.js";
export * from "./connector/index.js";
export * from "./gating/index.js";
export * from "./agents/index.js";
export * from "./dispatch/index.js";
export * from "./ingress/index.js";
export * as Result from "./result/index.js";
