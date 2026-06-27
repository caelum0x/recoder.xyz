/**
 * Telegram ConnectorPort — the one REAL channel adapter for the connectors
 * bridge. Wraps grammy (the Telegram Bot API SDK) behind the @recoder/connectors
 * `ConnectorPort` contract: monitor/send/probe/normalize/react.
 *
 * Degrade-safe by construction: grammy is imported DYNAMICALLY, so a deployment
 * without the SDK installed reports the channel unavailable via probe() and
 * never crashes boot. The bot is REAL — it long-polls live updates when a real
 * TELEGRAM_BOT_TOKEN is set; nothing here is stubbed or mocked.
 */
import type {
  ConnectorMonitorHandle,
  ConnectorPort,
  ConnectorProbeResult,
  InboundHandler,
  NormalizedInboundMessage,
  OutboundMessage,
  ReactionRequest,
  SendResult,
} from '@recoder/connectors';
import { createLogger } from '../logger';

const logger = createLogger('connectors:telegram');

/** Telegram caps a single text message at 4096 chars; chunk longer bodies. */
const TELEGRAM_MAX_CHARS = 4096;

/** grammy's runtime shapes we touch — kept minimal so the dynamic import stays loose. */
type GrammyApi = {
  getMe(): Promise<{ id: number; username?: string; first_name?: string }>;
  sendMessage(chatId: number | string, text: string, other?: Record<string, unknown>): Promise<{ message_id: number }>;
  setMessageReaction(
    chatId: number | string,
    messageId: number,
    reaction: Array<{ type: 'emoji'; emoji: string }>,
  ): Promise<true>;
};
type GrammyBot = {
  api: GrammyApi;
  botInfo?: { username?: string };
  on(filter: 'message', handler: (ctx: { update: unknown; msg?: unknown }) => unknown): void;
  start(options?: { drop_pending_updates?: boolean }): Promise<void>;
  stop(): Promise<void>;
};

/** Load grammy lazily so absence is reported (probe) instead of crashing import. */
async function loadGrammy(): Promise<{ Bot: new (token: string) => GrammyBot } | null> {
  try {
    const mod: any = await import('grammy');
    if (!mod?.Bot) return null;
    return { Bot: mod.Bot };
  } catch {
    return null;
  }
}

function chunk(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/** A real grammy-backed Telegram connector for a single bot account. */
export class TelegramConnector implements ConnectorPort {
  readonly kind = 'telegram' as const;

  private readonly token: string;
  private readonly accountId: string;
  private bot: GrammyBot | null = null;
  private botUsername: string | undefined;

  constructor(params: { token: string; accountId: string }) {
    this.token = params.token;
    this.accountId = params.accountId;
  }

  /** Lazily construct the grammy Bot. Returns null if the SDK is unavailable. */
  private async ensureBot(): Promise<GrammyBot | null> {
    if (this.bot) return this.bot;
    const grammy = await loadGrammy();
    if (!grammy) {
      logger.warn('grammy SDK not installed — telegram connector unavailable');
      return null;
    }
    this.bot = new grammy.Bot(this.token);
    return this.bot;
  }

  async monitor(accountId: string, onMessage: InboundHandler): Promise<ConnectorMonitorHandle> {
    const bot = await this.ensureBot();
    if (!bot) {
      // No SDK: a no-op handle so the caller never crashes. probe() tells the truth.
      return { stop: async () => {} };
    }

    bot.on('message', async (ctx) => {
      try {
        const normalized = this.normalize(ctx.update, accountId);
        if (normalized) await onMessage(normalized);
      } catch (err) {
        logger.error({ err }, 'telegram inbound handler failed');
      }
    });

    // bot.start() resolves only when the bot is stopped; do NOT await it here or
    // monitor() would never return. Errors during polling are surfaced, not swallowed.
    void bot.start({ drop_pending_updates: true }).catch((err) => {
      logger.error({ err }, 'telegram long-poll loop ended with error');
    });
    try {
      const me = await bot.api.getMe();
      this.botUsername = me.username;
      logger.info({ account: accountId, bot: me.username }, 'telegram monitor started');
    } catch (err) {
      logger.warn({ err }, 'telegram getMe failed after start');
    }

    return {
      stop: async () => {
        try {
          await bot.stop();
        } catch (err) {
          logger.warn({ err }, 'telegram stop failed');
        }
      },
    };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const bot = await this.ensureBot();
    if (!bot) return { delivered: false, messageIds: [] };

    const segments =
      message.chunks && message.chunks.length > 0
        ? [...message.chunks]
        : chunk(message.text, TELEGRAM_MAX_CHARS);
    const messageIds: string[] = [];
    for (const segment of segments) {
      if (!segment) continue;
      const other = message.target.replyTo
        ? { reply_parameters: { message_id: Number(message.target.replyTo) } }
        : undefined;
      const sent = await bot.api.sendMessage(message.target.conversationId, segment, other);
      messageIds.push(String(sent.message_id));
    }
    return { delivered: messageIds.length > 0, messageIds };
  }

  async probe(accountId: string): Promise<ConnectorProbeResult> {
    const checkedAt = Date.now();
    const grammy = await loadGrammy();
    if (!grammy) {
      return {
        channel: this.kind,
        accountId,
        ready: false,
        error: 'grammy SDK not installed',
        checkedAt,
      };
    }
    if (!this.token) {
      return { channel: this.kind, accountId, ready: false, error: 'no bot token configured', checkedAt };
    }
    try {
      const bot = await this.ensureBot();
      if (!bot) {
        return { channel: this.kind, accountId, ready: false, error: 'bot init failed', checkedAt };
      }
      const me = await bot.api.getMe();
      this.botUsername = me.username;
      return {
        channel: this.kind,
        accountId,
        ready: true,
        identity: me.username ? `@${me.username}` : String(me.id),
        checkedAt,
      };
    } catch (err) {
      return {
        channel: this.kind,
        accountId,
        ready: false,
        error: err instanceof Error ? err.message : 'getMe failed',
        checkedAt,
      };
    }
  }

  normalize(rawEvent: unknown, accountId: string): NormalizedInboundMessage | undefined {
    const update = rawEvent as any;
    const msg = update?.message ?? update?.msg;
    if (!msg) return undefined;
    const text: string = typeof msg.text === 'string' ? msg.text : typeof msg.caption === 'string' ? msg.caption : '';
    if (!text) return undefined; // non-text events carry no actionable command

    const chat = msg.chat ?? {};
    const from = msg.from ?? {};
    const chatType = chat.type === 'private' ? 'direct' : chat.type === 'channel' ? 'channel' : 'group';

    // Mention detection: explicit @bot or text_mention entity referencing the bot.
    const entities: any[] = Array.isArray(msg.entities) ? msg.entities : [];
    const handle = this.botUsername ? `@${this.botUsername}`.toLowerCase() : undefined;
    const wasMentioned =
      (handle ? text.toLowerCase().includes(handle) : false) ||
      entities.some((e) => e?.type === 'mention' || e?.type === 'text_mention');

    return {
      channel: this.kind,
      accountId,
      messageId: String(msg.message_id),
      conversationId: String(chat.id),
      chatType,
      sender: {
        SenderId: from.id != null ? String(from.id) : undefined,
        SenderName: [from.first_name, from.last_name].filter(Boolean).join(' ') || undefined,
        SenderUsername: typeof from.username === 'string' ? from.username : undefined,
      },
      text,
      wasMentioned,
      attachments: [],
      timestamp: typeof msg.date === 'number' ? msg.date * 1000 : Date.now(),
      raw: rawEvent,
    };
  }

  async react(request: ReactionRequest): Promise<boolean> {
    const bot = await this.ensureBot();
    if (!bot) return false;
    try {
      await bot.api.setMessageReaction(request.conversationId, Number(request.messageId), [
        { type: 'emoji', emoji: request.emoji },
      ]);
      return true;
    } catch (err) {
      logger.warn({ err }, 'telegram react failed');
      return false;
    }
  }
}
