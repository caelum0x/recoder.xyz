/**
 * `openclaw-gateway.adapter` — binds the `@recoder/connectors` channel factories
 * (the openclaw social-gateways, in place) to the domain's {@link ConnectorPort}
 * seam. It is the ONE place that touches a channel SDK; every other file speaks
 * the narrowed port.
 *
 * DEGRADE-SAFE by construction: each channel is resolved via a DYNAMIC import of
 * its `@recoder/connectors/<channel>` subpath, wrapped in try/catch — if the
 * package (or that channel's build) is not on disk, the resolver yields `null` and
 * the channel-adapter registry marks it `down` rather than crashing module load.
 *
 * TELEGRAM is proven end-to-end (its `createTelegramConnector` factory is the
 * reference binding). Channels exposing a class instead of a factory
 * (`LineConnector`, `FeishuConnector`) are instantiated via their constructor.
 * `discord` is a dormant foundation channel (not in the live connector set) and
 * always resolves `null`.
 */
import type { ChannelId } from '../types.js';
import type { ConnectorPort } from '../ports/connector-port.js';

/** How to instantiate one channel's ConnectorPort from its subpath module. */
interface ChannelBinding {
  /** The `@recoder/connectors/<subpath>` module specifier. */
  readonly subpath: string;
  /** Preferred factory export name (`create<Channel>Connector`). */
  readonly factory?: string;
  /** Fallback class export name to `new` when no factory is present. */
  readonly className?: string;
}

/** The 7 LIVE channels' connector bindings (discord is dormant ⇒ omitted). */
const CHANNEL_BINDINGS: Partial<Record<ChannelId, ChannelBinding>> = {
  telegram: { subpath: '@recoder/connectors/telegram', factory: 'createTelegramConnector', className: 'TelegramConnector' },
  slack: { subpath: '@recoder/connectors/slack', factory: 'createSlackConnector', className: 'SlackConnector' },
  signal: { subpath: '@recoder/connectors/signal', factory: 'createSignalConnector', className: 'SignalConnector' },
  line: { subpath: '@recoder/connectors/line', className: 'LineConnector' },
  feishu: { subpath: '@recoder/connectors/feishu', className: 'FeishuConnector' },
  imessage: { subpath: '@recoder/connectors/imessage', factory: 'createIMessageConnector', className: 'IMessageConnector' },
  whatsapp: { subpath: '@recoder/connectors/whatsapp', factory: 'createWhatsAppConnector', className: 'WhatsAppConnector' },
};

/** The gateway resolver: channel → a live ConnectorPort, or `null` (degrade). */
export interface OpenclawGateway {
  /** Resolve a channel's ConnectorPort; `null` when the channel dep is absent. */
  resolve(channel: ChannelId): Promise<ConnectorPort | null>;
  /** The channels this gateway can attempt to bind (the live set). */
  supported(): readonly ChannelId[];
}

/** Structural guard: does `value` look like a ConnectorPort (has send/probe/monitor)? */
function looksLikeConnector(value: unknown): value is ConnectorPort {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.send === 'function' && typeof v.probe === 'function' && typeof v.monitor === 'function';
}

/** Instantiate a ConnectorPort from a dynamically-imported channel module. */
function instantiate(mod: Record<string, unknown>, binding: ChannelBinding): ConnectorPort | null {
  if (binding.factory && typeof mod[binding.factory] === 'function') {
    const port = (mod[binding.factory] as (opts?: unknown) => unknown)();
    if (looksLikeConnector(port)) return port;
  }
  if (binding.className && typeof mod[binding.className] === 'function') {
    const Ctor = mod[binding.className] as new (opts?: unknown) => unknown;
    const port = new Ctor();
    if (looksLikeConnector(port)) return port;
  }
  return null;
}

/** Build the openclaw gateway. Pure factory; per-channel resolution is lazy + safe. */
export function createOpenclawGateway(): OpenclawGateway {
  const cache = new Map<ChannelId, ConnectorPort | null>();

  return {
    supported(): readonly ChannelId[] {
      return Object.keys(CHANNEL_BINDINGS) as ChannelId[];
    },

    async resolve(channel: ChannelId): Promise<ConnectorPort | null> {
      if (cache.has(channel)) return cache.get(channel) ?? null;
      const binding = CHANNEL_BINDINGS[channel];
      if (!binding) {
        cache.set(channel, null); // dormant/unknown channel (e.g. discord)
        return null;
      }
      let port: ConnectorPort | null = null;
      try {
        // Variable specifier ⇒ resolved at runtime; a missing dep throws → null.
        const mod = (await import(/* @vite-ignore */ binding.subpath)) as Record<string, unknown>;
        port = instantiate(mod, binding);
      } catch {
        port = null; // channel dep absent on disk ⇒ truthfully unavailable.
      }
      cache.set(channel, port);
      return port;
    },
  };
}
