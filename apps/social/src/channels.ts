/**
 * Channel drivers — the seam between this app and the eight compiled
 * @recoder/connectors adapter subpaths.
 *
 * Each driver has two jobs:
 *   1. `detect()` — read the channel's credentials from env and report
 *      TRUTHFULLY whether the channel is configured (and if not, WHY). Never
 *      touches a network.
 *   2. `create()` — build the channel's REAL ConnectorPort by dynamically
 *      importing its @recoder/connectors subpath. The subpath always exists;
 *      the channel's optional peer SDK is loaded lazily INSIDE the adapter, so
 *      a missing SDK surfaces as a truthful create/probe failure, never a boot
 *      crash.
 *
 * `requiresExternal` marks channels that need something beyond config+SDK to
 * take inbound live (webhook ingress, bridge daemon, gateway-WS source). This
 * app monitors only the self-contained channels (telegram/slack/feishu are the
 * closest-to-runnable drivers); the rest still get a real port for send/probe
 * and an honest reason in status.
 */
import { readConnectorEnv, type ConnectorKind, type ConnectorPort } from '@recoder/connectors';

/** Truthful detection result for one channel from the current environment. */
export interface ChannelDetection {
  readonly configured: boolean;
  /** Primary credential / presence marker. Only set when configured. Never logged. */
  readonly token?: string;
  readonly accountId?: string;
  /** Why not configured — or, when configured, which external dependency is missing. */
  readonly reason?: string;
}

/** A channel driver: truthful env detection + the lazy real-adapter factory. */
export interface ChannelDriver {
  readonly channel: ConnectorKind;
  readonly requiresExternal: boolean;
  detect(): ChannelDetection;
  create(detection: ChannelDetection): Promise<ConnectorPort>;
}

/** Read a channel credential env var (RECODER_CONNECTORS_/OPENCLAW_ prefix, then plain). */
function readEnv(connectorName: string, plainName?: string): string | undefined {
  const viaConnector = readConnectorEnv(connectorName);
  if (viaConnector && viaConnector.trim()) return viaConnector.trim();
  if (plainName) {
    const plain = process.env[plainName];
    if (plain && plain.trim()) return plain.trim();
  }
  return undefined;
}

/**
 * Static dynamic-import expressions (bundler-resolvable) so an adapter module —
 * and its optional channel SDK — is only loaded when that channel is configured.
 */
const SUBPATH_LOADERS: Readonly<Record<ConnectorKind, () => Promise<Record<string, any>>>> =
  Object.freeze({
    telegram: () => import('@recoder/connectors/telegram'),
    slack: () => import('@recoder/connectors/slack'),
    signal: () => import('@recoder/connectors/signal'),
    imessage: () => import('@recoder/connectors/imessage'),
    whatsapp: () => import('@recoder/connectors/whatsapp'),
    line: () => import('@recoder/connectors/line'),
    feishu: () => import('@recoder/connectors/feishu'),
    discord: () => import('@recoder/connectors/discord'),
  });

/** Pull a named export (or default-namespace export) from an adapter module. */
function pickExport(mod: Record<string, any>, name: string): any {
  const value = mod[name] ?? mod['default']?.[name];
  if (!value) throw new Error(`${name} export missing from adapter subpath`);
  return value;
}

const telegramDriver: ChannelDriver = {
  channel: 'telegram',
  requiresExternal: false, // long-poll ingress runs from the bot token alone
  detect(): ChannelDetection {
    const token = readEnv('TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_TOKEN');
    if (!token) return { configured: false, reason: 'TELEGRAM_BOT_TOKEN not set' };
    return { configured: true, token, accountId: readEnv('TELEGRAM_ACCOUNT_ID') ?? 'telegram' };
  },
  async create(): Promise<ConnectorPort> {
    const Ctor = pickExport(await SUBPATH_LOADERS.telegram(), 'TelegramConnector');
    return new Ctor() as ConnectorPort;
  },
};

const slackDriver: ChannelDriver = {
  channel: 'slack',
  // Socket Mode (app token) monitors live from config. This standalone app has
  // no HTTP events ingress, so an app token is the requirement here.
  requiresExternal: false,
  detect(): ChannelDetection {
    const botToken = readEnv('SLACK_BOT_TOKEN', 'SLACK_BOT_TOKEN');
    if (!botToken) return { configured: false, reason: 'SLACK_BOT_TOKEN not set' };
    const appToken = readEnv('SLACK_APP_TOKEN', 'SLACK_APP_TOKEN');
    if (!appToken) {
      return {
        configured: false,
        reason: 'SLACK_BOT_TOKEN set but SLACK_APP_TOKEN (Socket Mode) is not — this app has no HTTP events ingress',
      };
    }
    return { configured: true, token: botToken, accountId: readEnv('SLACK_ACCOUNT_ID') ?? 'slack' };
  },
  async create(): Promise<ConnectorPort> {
    const Ctor = pickExport(await SUBPATH_LOADERS.slack(), 'SlackConnector');
    return new Ctor() as ConnectorPort; // resolves its own tokens from env
  },
};

const feishuDriver: ChannelDriver = {
  channel: 'feishu',
  requiresExternal: false, // Lark long-connection runs from app credentials
  detect(): ChannelDetection {
    const appId = readEnv('FEISHU_APP_ID', 'FEISHU_APP_ID');
    const appSecret = readEnv('FEISHU_APP_SECRET', 'FEISHU_APP_SECRET');
    if (!appId || !appSecret) {
      return { configured: false, reason: appId ? 'FEISHU_APP_SECRET not set' : 'FEISHU_APP_ID not set' };
    }
    return { configured: true, token: `${appId}:configured`, accountId: readEnv('FEISHU_ACCOUNT_ID') ?? 'feishu' };
  },
  async create(): Promise<ConnectorPort> {
    const Ctor = pickExport(await SUBPATH_LOADERS.feishu(), 'FeishuConnector');
    return new Ctor() as ConnectorPort; // env-seeded account registry
  },
};

const lineDriver: ChannelDriver = {
  channel: 'line',
  // LINE is webhook-push only and this app mounts no HTTP webhook ingress yet.
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
      reason: 'configured; live inbound needs an HTTP webhook ingress this app does not mount yet (send/probe are real)',
    };
  },
  async create(detection: ChannelDetection): Promise<ConnectorPort> {
    const Ctor = pickExport(await SUBPATH_LOADERS.line(), 'LineConnector');
    const token = readEnv('LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_ACCESS_TOKEN') ?? detection.token ?? '';
    const secret = readEnv('LINE_CHANNEL_SECRET', 'LINE_CHANNEL_SECRET') ?? '';
    // No-op ingress: the port is real (send/probe work); inbound stays truthfully
    // not-live until a webhook ingress is wired (requiresExternal reports this).
    const ingress = { register: () => ({ unregister: () => {} }) };
    return new Ctor({ config: { channelAccessToken: token, channelSecret: secret }, ingress }) as ConnectorPort;
  },
};

const signalDriver: ChannelDriver = {
  channel: 'signal',
  requiresExternal: true, // needs a reachable signal-cli REST daemon
  detect(): ChannelDetection {
    const account = readEnv('SIGNAL_ACCOUNT', 'SIGNAL_ACCOUNT');
    const baseUrl = readEnv('SIGNAL_BASE_URL', 'SIGNAL_BASE_URL');
    if (!account || !baseUrl) {
      return { configured: false, reason: account ? 'SIGNAL_BASE_URL not set' : 'SIGNAL_ACCOUNT not set' };
    }
    return {
      configured: true,
      token: account,
      accountId: account,
      reason: 'configured; live inbound needs a reachable signal-cli REST daemon',
    };
  },
  async create(): Promise<ConnectorPort> {
    const factory = pickExport(await SUBPATH_LOADERS.signal(), 'createSignalConnector');
    return factory() as ConnectorPort;
  },
};

const whatsappDriver: ChannelDriver = {
  channel: 'whatsapp',
  requiresExternal: true, // needs a reachable WhatsApp bridge
  detect(): ChannelDetection {
    const baseUrl = readEnv('WHATSAPP_BASE_URL', 'WHATSAPP_BASE_URL');
    if (!baseUrl) return { configured: false, reason: 'WHATSAPP_BASE_URL not set' };
    const token = readEnv('WHATSAPP_TOKEN', 'WHATSAPP_TOKEN');
    return {
      configured: true,
      token: token ?? baseUrl,
      accountId: readEnv('WHATSAPP_ACCOUNT_ID') ?? 'whatsapp',
      reason: 'configured; live inbound needs a reachable WhatsApp bridge',
    };
  },
  async create(): Promise<ConnectorPort> {
    const factory = pickExport(await SUBPATH_LOADERS.whatsapp(), 'createWhatsAppConnector');
    return factory() as ConnectorPort;
  },
};

const imessageDriver: ChannelDriver = {
  channel: 'imessage',
  requiresExternal: true, // needs the local imsg CLI on a macOS host
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
    const factory = pickExport(await SUBPATH_LOADERS.imessage(), 'createIMessageConnector');
    return factory() as ConnectorPort;
  },
};

const discordDriver: ChannelDriver = {
  channel: 'discord',
  // Discord inbound is gateway-WS only; this app wires no WS event source yet.
  requiresExternal: true,
  detect(): ChannelDetection {
    const token = readEnv('DISCORD_BOT_TOKEN', 'DISCORD_BOT_TOKEN');
    if (!token) return { configured: false, reason: 'DISCORD_BOT_TOKEN not set' };
    return {
      configured: true,
      token,
      accountId: readEnv('DISCORD_ACCOUNT_ID') ?? 'discord',
      reason: 'configured; live inbound needs a Discord gateway-WS event source this app does not wire yet (send/probe are real REST)',
    };
  },
  async create(detection: ChannelDetection): Promise<ConnectorPort> {
    const factory = pickExport(await SUBPATH_LOADERS.discord(), 'createDiscordConnector');
    const token = readEnv('DISCORD_BOT_TOKEN', 'DISCORD_BOT_TOKEN') ?? detection.token;
    // Built WITHOUT an eventSource: send/probe/normalize/react work over the real
    // Discord REST wire; monitor() surfaces a truthful "ingress not configured".
    return factory({ ...(token ? { config: { token } } : {}) }) as ConnectorPort;
  },
};

/** The eight real channel drivers, in status-report order. */
export function builtinChannelDrivers(): readonly ChannelDriver[] {
  return [
    telegramDriver,
    slackDriver,
    feishuDriver,
    lineDriver,
    signalDriver,
    whatsappDriver,
    imessageDriver,
    discordDriver,
  ];
}
