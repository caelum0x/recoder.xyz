/**
 * Channel adapter registry — the single seam between the connectors gateway and
 * the eight live @recoder/connectors adapter subpaths (./telegram ./slack
 * ./signal ./imessage ./whatsapp ./line ./feishu ./discord).
 *
 * Each channel is described by a CHANNEL DESCRIPTOR with three jobs:
 *   1. `detect()`  — read the channel's credentials from the env (the existing
 *      connector env pattern via readConnectorEnv) and report TRUTHFULLY whether
 *      the channel is configured, and if not, WHY (reason). Nothing here touches
 *      a network.
 *   2. `requiresExternal` — whether a configured channel still needs something
 *      beyond config to take inbound LIVE (an HTTP webhook ingress for LINE, an
 *      external bridge/daemon for signal/whatsapp/imessage). Such channels still
 *      register a real port and report truthfully, but the operator is told the
 *      extra dependency in the `reason`.
 *   3. `create()`  — construct the channel's REAL ConnectorPort from its
 *      @recoder/connectors adapter subpath, behind the optional-SDK loader. The
 *      subpath is imported DYNAMICALLY so a deployment without the channel SDK
 *      degrades truthfully (configured but unavailable) instead of crashing boot.
 *
 * The optional-SDK boundary lives entirely in the lazy `import()` inside each
 * `create()`. Tests inject an in-memory ConnectorPort factory at this exact seam
 * (overrideAdapterFactory) so the gateway's real dispatch path can be exercised
 * with each adapter's REAL normalize() without installing seven channel SDKs.
 */
import {
  readConnectorEnv,
  type ConnectorKind,
  type ConnectorPort,
} from '@recoder/connectors';
import { resolveDiscordEventSource } from './discord-event-source.js';

/** Read a channel credential env var (RECODER_CONNECTORS_ / OPENCLAW_ prefixes, then plain). */
function readEnv(connectorName: string, plainName?: string): string | undefined {
  const viaConnector = readConnectorEnv(connectorName);
  if (viaConnector && viaConnector.trim()) return viaConnector.trim();
  if (plainName) {
    const plain = process.env[plainName];
    if (plain && plain.trim()) return plain.trim();
  }
  return undefined;
}

/** Truthful detection result for one channel from the current environment. */
export interface ChannelDetection {
  /** Genuine credentials are present (the channel can be instantiated). */
  readonly configured: boolean;
  /**
   * The resolved primary credential (token / encoded creds). Only set when
   * `configured`. Never logged. For multi-secret channels (slack/feishu/line)
   * this is a presence marker — the adapter re-resolves the real secrets itself.
   */
  readonly token?: string;
  /** Connector account id this credential authenticates as. */
  readonly accountId?: string;
  /**
   * When NOT configured: why (which env var is missing). When configured but the
   * channel needs an external dependency to take inbound live: that requirement.
   */
  readonly reason?: string;
}

/** A channel descriptor: detection + the lazy real-adapter factory (SDK seam). */
export interface ChannelAdapter {
  readonly channel: ConnectorKind;
  /**
   * True when a CONFIGURED channel still needs something beyond config+SDK to
   * take inbound LIVE (an HTTP webhook ingress, or an external bridge/daemon).
   * It still registers a real port; the operator is told the dependency.
   */
  readonly requiresExternal: boolean;
  /** Read the env and report whether this channel is configured (+ why not). */
  detect(): ChannelDetection;
  /**
   * Build the REAL ConnectorPort from the @recoder/connectors adapter subpath,
   * behind the optional-SDK loader. Throws a truthful error if the SDK subpath
   * cannot be loaded — the gateway catches it and reports the channel
   * unavailable (never a fake connection).
   */
  create(detection: ChannelDetection): Promise<ConnectorPort>;
}

/**
 * Lazily import a @recoder/connectors adapter subpath (the optional-SDK seam).
 *
 * Each subpath is a STATIC dynamic-import expression (not a template literal) so
 * any bundler can resolve it, yet the module is only loaded when a channel is
 * actually configured. The subpath itself always exists in @recoder/connectors;
 * the channel's optional peer SDK (@slack/*, @line/bot-sdk,
 * @larksuiteoapi/node-sdk, …) is loaded lazily INSIDE the adapter, so a missing
 * peer SDK surfaces as a truthful probe() failure rather than an import crash.
 */
const SUBPATH_LOADERS: Readonly<Record<ConnectorKind, () => Promise<any>>> = Object.freeze({
  telegram: () => import('@recoder/connectors/telegram'),
  slack: () => import('@recoder/connectors/slack'),
  signal: () => import('@recoder/connectors/signal'),
  imessage: () => import('@recoder/connectors/imessage'),
  whatsapp: () => import('@recoder/connectors/whatsapp'),
  line: () => import('@recoder/connectors/line'),
  feishu: () => import('@recoder/connectors/feishu'),
  discord: () => import('@recoder/connectors/discord'),
});

async function importSubpath(channel: ConnectorKind): Promise<any> {
  const loader = SUBPATH_LOADERS[channel];
  if (!loader) throw new Error(`no adapter subpath for ${channel}`);
  return loader();
}

// --- telegram ---------------------------------------------------------------
const telegramAdapter: ChannelAdapter = {
  channel: 'telegram',
  requiresExternal: false,
  detect(): ChannelDetection {
    const token = readEnv('TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_TOKEN');
    if (!token) {
      return { configured: false, reason: 'TELEGRAM_BOT_TOKEN not set' };
    }
    return { configured: true, token, accountId: readEnv('TELEGRAM_ACCOUNT_ID') ?? 'telegram' };
  },
  async create(): Promise<ConnectorPort> {
    const mod = await importSubpath('telegram');
    const Ctor = mod.TelegramConnector ?? mod.default?.TelegramConnector;
    if (!Ctor) throw new Error('telegram adapter export missing');
    return new Ctor() as ConnectorPort;
  },
};

// --- slack ------------------------------------------------------------------
const slackAdapter: ChannelAdapter = {
  channel: 'slack',
  // Socket Mode (app token) ingress runs from config; HTTP Events mode would need
  // an ingress, but with an app token slack monitors live without one.
  requiresExternal: false,
  detect(): ChannelDetection {
    const botToken = readEnv('SLACK_BOT_TOKEN', 'SLACK_BOT_TOKEN');
    if (!botToken) {
      return { configured: false, reason: 'SLACK_BOT_TOKEN not set' };
    }
    const appToken = readEnv('SLACK_APP_TOKEN', 'SLACK_APP_TOKEN');
    const signingSecret = readEnv('SLACK_SIGNING_SECRET', 'SLACK_SIGNING_SECRET');
    if (!appToken && !signingSecret) {
      return {
        configured: false,
        reason: 'SLACK_BOT_TOKEN set but neither SLACK_APP_TOKEN (Socket Mode) nor SLACK_SIGNING_SECRET (HTTP Events) is set',
      };
    }
    return { configured: true, token: botToken, accountId: readEnv('SLACK_ACCOUNT_ID') ?? 'slack' };
  },
  async create(): Promise<ConnectorPort> {
    const mod = await importSubpath('slack');
    const Ctor = mod.SlackConnector ?? mod.default?.SlackConnector;
    if (!Ctor) throw new Error('slack adapter export missing');
    // The connector resolves the default account's tokens from the env itself.
    return new Ctor() as ConnectorPort;
  },
};

// --- feishu -----------------------------------------------------------------
const feishuAdapter: ChannelAdapter = {
  channel: 'feishu',
  requiresExternal: false, // Lark long-connection runs from app credentials.
  detect(): ChannelDetection {
    const appId = readEnv('FEISHU_APP_ID', 'FEISHU_APP_ID');
    const appSecret = readEnv('FEISHU_APP_SECRET', 'FEISHU_APP_SECRET');
    if (!appId || !appSecret) {
      return {
        configured: false,
        reason: appId ? 'FEISHU_APP_SECRET not set' : 'FEISHU_APP_ID not set',
      };
    }
    // A presence marker only; the adapter re-resolves real creds from env.
    return { configured: true, token: `${appId}:configured`, accountId: readEnv('FEISHU_ACCOUNT_ID') ?? 'feishu' };
  },
  async create(): Promise<ConnectorPort> {
    const mod = await importSubpath('feishu');
    const Ctor = mod.FeishuConnector ?? mod.default?.FeishuConnector;
    if (!Ctor) throw new Error('feishu adapter export missing');
    // Defaults to an env-seeded account registry.
    return new Ctor() as ConnectorPort;
  },
};

// --- line -------------------------------------------------------------------
const lineAdapter: ChannelAdapter = {
  channel: 'line',
  // LINE is webhook-push only: it has no long-poll. Live inbound needs an HTTP
  // ingress wired into Express (LineConnectorOptions.ingress). Configured from
  // creds, but inbound dispatch is not live from config alone.
  requiresExternal: true,
  detect(): ChannelDetection {
    const token = readEnv('LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_ACCESS_TOKEN');
    const secret = readEnv('LINE_CHANNEL_SECRET', 'LINE_CHANNEL_SECRET');
    if (!token || !secret) {
      return {
        configured: false,
        reason: token ? 'LINE_CHANNEL_SECRET not set' : 'LINE_CHANNEL_ACCESS_TOKEN not set',
      };
    }
    return {
      configured: true,
      token,
      accountId: readEnv('LINE_ACCOUNT_ID') ?? 'line',
      reason: 'configured; live inbound needs an HTTP webhook ingress (not config-only)',
    };
  },
  async create(detection: ChannelDetection): Promise<ConnectorPort> {
    const mod = await importSubpath('line');
    const Ctor = mod.LineConnector ?? mod.default?.LineConnector;
    if (!Ctor) throw new Error('line adapter export missing');
    const token = readEnv('LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_ACCESS_TOKEN') ?? detection.token ?? '';
    const secret = readEnv('LINE_CHANNEL_SECRET', 'LINE_CHANNEL_SECRET') ?? '';
    // LINE requires an ingress to construct. We supply a no-op ingress so the
    // port is real and probe()/send() work; inbound monitor() registers a
    // webhook receiver that an HTTP ingress would feed. Until that ingress is
    // wired into Express, inbound is not live (reported via requiresExternal).
    const ingress = { register: () => ({ unregister: () => {} }) };
    return new Ctor({
      config: { channelAccessToken: token, channelSecret: secret },
      ingress,
    }) as ConnectorPort;
  },
};

// --- signal -----------------------------------------------------------------
const signalAdapter: ChannelAdapter = {
  channel: 'signal',
  // Signal ingress is a signal-cli REST daemon (SIGNAL_BASE_URL). Configured
  // from env, but live inbound needs that external daemon reachable.
  requiresExternal: true,
  detect(): ChannelDetection {
    const account = readEnv('SIGNAL_ACCOUNT', 'SIGNAL_ACCOUNT');
    const baseUrl = readEnv('SIGNAL_BASE_URL', 'SIGNAL_BASE_URL');
    if (!account || !baseUrl) {
      return {
        configured: false,
        reason: account ? 'SIGNAL_BASE_URL not set' : 'SIGNAL_ACCOUNT not set',
      };
    }
    return {
      configured: true,
      token: account,
      accountId: account,
      reason: 'configured; live inbound needs a reachable signal-cli REST daemon',
    };
  },
  async create(): Promise<ConnectorPort> {
    const mod = await importSubpath('signal');
    const factory = mod.createSignalConnector ?? mod.default?.createSignalConnector;
    if (!factory) throw new Error('signal adapter export missing');
    return factory() as ConnectorPort;
  },
};

// --- whatsapp ---------------------------------------------------------------
const whatsappAdapter: ChannelAdapter = {
  channel: 'whatsapp',
  // WhatsApp ingress is an external bridge (WHATSAPP_BASE_URL + token).
  requiresExternal: true,
  detect(): ChannelDetection {
    const baseUrl = readEnv('WHATSAPP_BASE_URL', 'WHATSAPP_BASE_URL');
    if (!baseUrl) {
      return { configured: false, reason: 'WHATSAPP_BASE_URL not set' };
    }
    const token = readEnv('WHATSAPP_TOKEN', 'WHATSAPP_TOKEN');
    return {
      configured: true,
      token: token ?? baseUrl,
      accountId: readEnv('WHATSAPP_ACCOUNT_ID') ?? 'whatsapp',
      reason: 'configured; live inbound needs a reachable WhatsApp bridge',
    };
  },
  async create(): Promise<ConnectorPort> {
    const mod = await importSubpath('whatsapp');
    const factory = mod.createWhatsAppConnector ?? mod.default?.createWhatsAppConnector;
    if (!factory) throw new Error('whatsapp adapter export missing');
    return factory() as ConnectorPort;
  },
};

// --- imessage ---------------------------------------------------------------
const imessageAdapter: ChannelAdapter = {
  channel: 'imessage',
  // iMessage ingress is a local `imsg` CLI/daemon (macOS host only).
  requiresExternal: true,
  detect(): ChannelDetection {
    const enabled = readEnv('IMESSAGE_ENABLED', 'RECODER_IMESSAGE_ENABLED');
    if (!enabled || enabled.toLowerCase() === 'false' || enabled === '0') {
      return { configured: false, reason: 'RECODER_IMESSAGE_ENABLED not set to true' };
    }
    return {
      configured: true,
      token: 'imessage',
      accountId: readEnv('IMESSAGE_ACCOUNT_ID') ?? 'imessage',
      reason: 'configured; live inbound needs the local imsg CLI on a macOS host',
    };
  },
  async create(): Promise<ConnectorPort> {
    const mod = await importSubpath('imessage');
    const factory = mod.createIMessageConnector ?? mod.default?.createIMessageConnector;
    if (!factory) throw new Error('imessage adapter export missing');
    return factory() as ConnectorPort;
  },
};

// --- discord -----------------------------------------------------------------
const discordAdapter: ChannelAdapter = {
  channel: 'discord',
  // Discord inbound is gateway-WS only: it has no long-poll and no HTTP webhook.
  // Live inbound needs a gateway-WS event source (the carbon GatewayPlugin
  // bridge) wired via registerDiscordEventSource. Configured from the bot token,
  // but inbound dispatch is not live until that source is present.
  requiresExternal: true,
  detect(): ChannelDetection {
    const token = readEnv('DISCORD_BOT_TOKEN', 'DISCORD_BOT_TOKEN');
    if (!token) {
      return { configured: false, reason: 'DISCORD_BOT_TOKEN not set' };
    }
    return {
      configured: true,
      token,
      accountId: readEnv('DISCORD_ACCOUNT_ID') ?? 'discord',
      reason: 'configured; live inbound needs a Discord gateway-WS event source (carbon GatewayPlugin)',
    };
  },
  async create(detection: ChannelDetection): Promise<ConnectorPort> {
    const mod = await importSubpath('discord');
    const factory = mod.createDiscordConnector ?? mod.default?.createDiscordConnector;
    if (!factory) throw new Error('discord adapter export missing');
    // Resolve the host-registered gateway-WS bridge. When absent the adapter is
    // built WITHOUT an eventSource: send()/probe()/normalize()/react() work over
    // the real Discord REST wire, while monitor() surfaces a truthful "ingress
    // not configured" error — never a faked running gateway.
    const eventSource = resolveDiscordEventSource();
    const token = readEnv('DISCORD_BOT_TOKEN', 'DISCORD_BOT_TOKEN') ?? detection.token;
    return factory({
      ...(token ? { config: { token } } : {}),
      ...(eventSource ? { eventSource } : {}),
    }) as ConnectorPort;
  },
};

/** The eight live channel adapters, keyed by ConnectorKind. */
const ADAPTERS: Readonly<Record<string, ChannelAdapter>> = Object.freeze({
  telegram: telegramAdapter,
  slack: slackAdapter,
  feishu: feishuAdapter,
  line: lineAdapter,
  signal: signalAdapter,
  whatsapp: whatsappAdapter,
  imessage: imessageAdapter,
  discord: discordAdapter,
});

/** The ConnectorKinds this bridge has a real adapter for (the eight subpaths). */
export const SUPPORTED_CHANNELS: readonly ConnectorKind[] = Object.freeze([
  'telegram',
  'slack',
  'feishu',
  'line',
  'signal',
  'whatsapp',
  'imessage',
  'discord',
]);

/** Look up the descriptor for a channel, or undefined when unsupported. */
export function getChannelAdapter(channel: ConnectorKind): ChannelAdapter | undefined {
  return ADAPTERS[channel];
}

/**
 * Test/SDK seam: override the ConnectorPort factory for a channel with an
 * in-memory double. Returns a restore function. Used to drive the gateway's REAL
 * dispatch path with an adapter's REAL normalize() while substituting the live
 * SDK transport — never to fake the gateway or dispatch itself.
 */
const factoryOverrides = new Map<ConnectorKind, ChannelAdapter['create']>();

export function overrideAdapterFactory(
  channel: ConnectorKind,
  create: ChannelAdapter['create'],
): () => void {
  const prev = factoryOverrides.get(channel);
  factoryOverrides.set(channel, create);
  return () => {
    if (prev) factoryOverrides.set(channel, prev);
    else factoryOverrides.delete(channel);
  };
}

/** Resolve the (possibly overridden) factory for a channel. */
export function resolveAdapterFactory(channel: ConnectorKind): ChannelAdapter['create'] | undefined {
  const override = factoryOverrides.get(channel);
  if (override) return override;
  return ADAPTERS[channel]?.create.bind(ADAPTERS[channel]);
}
