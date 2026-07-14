/**
 * Webhook channel constants + verification-secret resolution.
 *
 * Kept dependency-free (only `@recoder/connectors` env reader) so it can be
 * imported by the gateway, the connectors index, and the webhook ingress router
 * WITHOUT creating an import cycle. Nothing here contacts a network or touches
 * a channel SDK; it is purely the env -> "is this push-only channel verifiable"
 * boundary.
 */
import { readConnectorEnv } from '@recoder/connectors';

/** Push-only channels whose ONLY live-inbound transport is an HTTP webhook. */
export const WEBHOOK_CHANNELS = Object.freeze(['line', 'slack'] as const);
export type WebhookChannel = (typeof WEBHOOK_CHANNELS)[number];

/** Set form for O(1) membership tests in health computation. */
export const WEBHOOK_INBOUND_CHANNELS: ReadonlySet<string> = new Set(WEBHOOK_CHANNELS);

/** True when `value` is one of the push-only webhook channels. */
export function isWebhookChannel(value: string): value is WebhookChannel {
  return (WEBHOOK_CHANNELS as readonly string[]).includes(value);
}

/** Read a channel credential env var (RECODER_CONNECTORS_/OPENCLAW_ then plain). */
function readEnv(connectorName: string, plainName?: string): string | undefined {
  const viaConnector = readConnectorEnv(connectorName);
  if (viaConnector && viaConnector.trim()) return viaConnector.trim();
  if (plainName) {
    const plain = process.env[plainName];
    if (plain && plain.trim()) return plain.trim();
  }
  return undefined;
}

/** The verification secret a push-only channel uses, or undefined when absent. */
export function webhookSecretFor(channel: string): string | undefined {
  if (channel === 'line') return readEnv('LINE_CHANNEL_SECRET', 'LINE_CHANNEL_SECRET');
  if (channel === 'slack') return readEnv('SLACK_SIGNING_SECRET', 'SLACK_SIGNING_SECRET');
  return undefined;
}

/** True when the channel's webhook verification secret is present in the env. */
export function hasWebhookSecret(channel: string): boolean {
  return Boolean(webhookSecretFor(channel));
}

/** Resolve the channel's connector account id from the env (matches adapters). */
export function webhookAccountIdFor(channel: WebhookChannel): string {
  if (channel === 'line') return readEnv('LINE_ACCOUNT_ID') ?? 'line';
  return readEnv('SLACK_ACCOUNT_ID') ?? 'slack';
}
