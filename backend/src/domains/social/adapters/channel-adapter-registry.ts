/**
 * `channel-adapter-registry` — the per-channel {@link ConnectorPort} registry the
 * social domain sends/probes through. It resolves each live channel lazily via the
 * {@link OpenclawGateway} and holds it, so the rest of the domain never touches a
 * channel SDK.
 *
 * TRUTHFUL + degrade-safe: a channel with no resolvable connector (dep absent) or
 * no configured secret is reported `down` — never a faked `up`. `send`/`probe`
 * against an unavailable channel returns a truthful failure, not a throw.
 */
import type { ChannelId } from '../types.js';
import type { ConnectorPort, OutboundMessage, SendResult } from '../ports/connector-port.js';
import type { ConnectorSecretsPort } from '../ports/connector-secrets.port.js';
import type { OpenclawGateway } from './openclaw-gateway.adapter.js';
import { LIVE_CHANNEL_IDS } from '../types.js';

/** Truthful readiness of one channel adapter. */
export interface ChannelAdapterStatus {
  readonly channel: ChannelId;
  /** Whether a ConnectorPort resolved (the channel dep is on disk). */
  readonly bound: boolean;
  /** Whether a token secret is configured for the channel. */
  readonly configured: boolean;
  /** Genuine reachability (only probed when both bound + configured). */
  readonly ready: boolean;
  readonly reason?: string;
}

export interface ChannelAdapterRegistry {
  /** Resolve the ConnectorPort for a live channel; `null` when unavailable. */
  get(channel: ChannelId): Promise<ConnectorPort | null>;
  /** Send an outbound message over a channel (truthful failure when unavailable). */
  send(channel: ChannelId, message: OutboundMessage): Promise<SendResult>;
  /** Probe truthful readiness of every live channel that is enabled. */
  statuses(enabled: readonly ChannelId[], accountId?: string): Promise<readonly ChannelAdapterStatus[]>;
}

export interface ChannelAdapterRegistryDeps {
  readonly gateway: OpenclawGateway;
  readonly secrets: ConnectorSecretsPort;
}

const NOT_DELIVERED: SendResult = { delivered: false, messageIds: [] };

/** Build the channel-adapter registry. Pure factory; lazy + degrade-safe. */
export function createChannelAdapterRegistry(deps: ChannelAdapterRegistryDeps): ChannelAdapterRegistry {
  const { gateway, secrets } = deps;

  async function get(channel: ChannelId): Promise<ConnectorPort | null> {
    if (!(LIVE_CHANNEL_IDS as readonly ChannelId[]).includes(channel)) return null;
    return gateway.resolve(channel);
  }

  return {
    get,

    async send(channel: ChannelId, message: OutboundMessage): Promise<SendResult> {
      const port = await get(channel);
      if (!port) return NOT_DELIVERED;
      // A configured token is required to send; missing secret ⇒ truthful non-delivery.
      const token = await safe(() => secrets.resolve(channel, 'token'));
      if (!token) return NOT_DELIVERED;
      const result = await safe(() => port.send(message));
      return result ?? NOT_DELIVERED;
    },

    async statuses(enabled: readonly ChannelId[], accountId = 'default'): Promise<readonly ChannelAdapterStatus[]> {
      const out: ChannelAdapterStatus[] = [];
      for (const channel of enabled) {
        if (!(LIVE_CHANNEL_IDS as readonly ChannelId[]).includes(channel)) continue;
        const port = await get(channel);
        const configured = Boolean(await safe(() => secrets.resolve(channel, 'token')));
        if (!port) {
          out.push({ channel, bound: false, configured, ready: false, reason: 'connector dependency not available on disk' });
          continue;
        }
        if (!configured) {
          out.push({ channel, bound: true, configured: false, ready: false, reason: 'channel enabled but secret not configured' });
          continue;
        }
        const probe = await safe(() => port.probe(accountId));
        out.push({
          channel,
          bound: true,
          configured: true,
          ready: Boolean(probe?.ready),
          ...(probe && !probe.ready ? { reason: probe.error ?? 'channel not reachable' } : {}),
        });
      }
      return out;
    },
  };
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
