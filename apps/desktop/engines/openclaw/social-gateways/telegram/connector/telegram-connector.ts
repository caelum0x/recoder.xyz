// Owned by Recoder. The Telegram ConnectorPort adapter.
//
// Wraps the real Telegram Bot API (the same wire protocol the extracted
// gateway's grammY client speaks) behind the single `ConnectorPort` contract:
//   - monitor() -> long-poll getUpdates, normalize each Update, invoke onMessage
//                  (mirrors monitorTelegramProvider's getUpdates runner loop)
//   - send()    -> sendMessage with chunking + thread/reply params
//                  (mirrors sendMessageTelegram)
//   - probe()   -> getMe, truthful readiness + bot identity
//                  (mirrors probeTelegram)
//   - normalize()-> Telegram Update -> NormalizedInboundMessage (pure)
//   - react()   -> setMessageReaction (mirrors reactMessageTelegram)
//
// Multi-account: each accountId resolves its own bot token via the owned
// auth/env foundation (resolveTelegramAccount). One TelegramApiClient is built
// per account on demand and cached. Identity is Recoder, not OpenClaw.
//
// Reuses the REAL self-contained extracted helpers verbatim:
//   - parseTelegramTarget / stripTelegramInternalPrefixes (../targets.js)
// which carry the real `chatId`, `chatId:topicId`, `chatId:topic:topicId`, and
// `telegram:`/`tg:` prefix parsing semantics.

import type {
  ConnectorMonitorHandle,
  ConnectorPort,
  ConnectorProbeResult,
  InboundHandler,
} from "../../../src/connector/connector-port.js";
import type { ConnectorKind } from "../../../src/connector/connector-kind.js";
import type { NormalizedInboundMessage } from "../../../src/connector/inbound-message.js";
import type {
  OutboundMessage,
  ReactionRequest,
  SendResult,
} from "../../../src/connector/outbound-message.js";
import { subsystemTag } from "../../../src/identity.js";
import { parseTelegramTarget } from "../targets.js";
import { resolveTelegramAccount } from "./accounts.js";
import { chunkTelegramText } from "./chunk.js";
import { normalizeTelegramUpdate } from "./normalize.js";
import {
  TelegramApiClient,
  TelegramApiError,
  type TelegramUpdate,
} from "./telegram-api.js";

const KIND: ConnectorKind = "telegram";

/** Long-poll hold the monitor loop requests from Telegram each cycle. */
const LONG_POLL_SECONDS = 25;

/** Update types we request — text + reactions, matching the gateway. */
const ALLOWED_UPDATES = ["message", "edited_message"] as const;

/** Backoff bounds for transient getUpdates failures (mirrors the gateway policy). */
const POLL_BACKOFF_INITIAL_MS = 2_000;
const POLL_BACKOFF_MAX_MS = 30_000;
const POLL_BACKOFF_FACTOR = 1.8;

type Logger = (message: string) => void;

export interface TelegramConnectorOptions {
  /** Optional fetch override (e.g. a proxy fetch). Defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Optional logger for transient ingress errors. Defaults to console.error. */
  readonly log?: Logger;
}

interface BoundAccount {
  readonly accountId: string;
  readonly client: TelegramApiClient;
  /** Resolved bot @username (lowercased) once getMe has been observed. */
  botUsername?: string;
}

/**
 * The Telegram connector. One instance serves many accounts; each account is
 * lazily bound to a real Bot API client keyed by its resolved token.
 */
export class TelegramConnector implements ConnectorPort {
  readonly kind: ConnectorKind = KIND;

  readonly #fetchImpl?: typeof fetch;
  readonly #log: Logger;
  readonly #accounts = new Map<string, BoundAccount>();

  constructor(options: TelegramConnectorOptions = {}) {
    this.#fetchImpl = options.fetchImpl;
    this.#log = options.log ?? ((message) => console.error(`[${subsystemTag("telegram")}] ${message}`));
  }

  /** Resolve (and cache) the Bot API client for an account; throws if no token. */
  #bind(accountId: string): BoundAccount {
    const resolved = resolveTelegramAccount(accountId);
    const cached = this.#accounts.get(resolved.accountId);
    if (cached) {
      return cached;
    }
    if (resolved.tokenSource === "none" || !resolved.token) {
      throw new Error(
        `Telegram account "${resolved.accountId}" has no bot token. Set RECODER_CONNECTORS_TELEGRAM_BOT_TOKEN (or TELEGRAM_BOT_TOKEN for the default account).`,
      );
    }
    const proxyFetch = this.#fetchImpl;
    const bound: BoundAccount = {
      accountId: resolved.accountId,
      client: new TelegramApiClient({ token: resolved.token, fetchImpl: proxyFetch }),
    };
    this.#accounts.set(resolved.accountId, bound);
    return bound;
  }

  async monitor(accountId: string, onMessage: InboundHandler): Promise<ConnectorMonitorHandle> {
    const bound = this.#bind(accountId);
    // Learn the bot @username up front so mention detection in normalize() works
    // on the very first message. A getMe failure here is surfaced (no fake ready).
    try {
      const me = await bound.client.getMe();
      bound.botUsername = me.username?.toLowerCase();
    } catch (err) {
      throw new Error(
        `Telegram monitor could not start for account "${bound.accountId}": ${errMessage(err)}`,
      );
    }

    const controller = new AbortController();
    const loop = this.#runPollLoop({ bound, onMessage, signal: controller.signal });

    return {
      stop: async () => {
        controller.abort();
        await loop.catch(() => {
          /* the loop resolves on abort; swallow the abort rejection only */
        });
      },
    };
  }

  async #runPollLoop(params: {
    bound: BoundAccount;
    onMessage: InboundHandler;
    signal: AbortSignal;
  }): Promise<void> {
    const { bound, onMessage, signal } = params;
    let offset: number | undefined;
    let backoffAttempts = 0;

    while (!signal.aborted) {
      let updates: TelegramUpdate[];
      try {
        updates = await bound.client.getUpdates({
          offset,
          timeoutSeconds: LONG_POLL_SECONDS,
          allowedUpdates: ALLOWED_UPDATES,
          abortSignal: signal,
        });
        backoffAttempts = 0;
      } catch (err) {
        if (signal.aborted) {
          return;
        }
        backoffAttempts += 1;
        const delay = computeBackoff(backoffAttempts);
        this.#log(
          `account "${bound.accountId}" getUpdates failed: ${errMessage(err)}; retrying in ${delay}ms`,
        );
        await sleep(delay, signal);
        continue;
      }

      for (const update of updates) {
        offset = update.update_id + 1;
        if (signal.aborted) {
          return;
        }
        const normalized = this.#normalizeForAccount(update, bound);
        if (!normalized) {
          continue;
        }
        try {
          await onMessage(normalized);
        } catch (err) {
          // A handler failure must not kill ingress; surface and continue.
          this.#log(
            `account "${bound.accountId}" onMessage handler threw: ${errMessage(err)}`,
          );
        }
      }
    }
  }

  #normalizeForAccount(
    rawUpdate: unknown,
    bound: BoundAccount,
  ): NormalizedInboundMessage | undefined {
    const update = asTelegramUpdate(rawUpdate);
    if (!update) {
      return undefined;
    }
    return normalizeTelegramUpdate({
      update,
      accountId: bound.accountId,
      botUsername: bound.botUsername,
    });
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const bound = this.#bind(message.target.accountId);
    const target = parseTelegramTarget(message.target.conversationId);
    const replyToMessageId = message.target.replyTo
      ? Number.parseInt(message.target.replyTo, 10)
      : undefined;

    const segments =
      message.chunks && message.chunks.length > 0
        ? [...message.chunks]
        : chunkTelegramText(message.text);

    const messageIds: string[] = [];
    for (let i = 0; i < segments.length; i += 1) {
      const result = await bound.client.sendMessage({
        chatId: target.chatId,
        text: segments[i],
        messageThreadId: target.messageThreadId,
        // Only thread the first segment under the reply; the rest follow it.
        replyToMessageId: i === 0 ? replyToMessageId : undefined,
      });
      messageIds.push(String(result.messageId));
    }

    return {
      delivered: messageIds.length > 0,
      messageIds,
    };
  }

  async probe(accountId: string): Promise<ConnectorProbeResult> {
    const checkedAt = Date.now();
    let bound: BoundAccount;
    try {
      bound = this.#bind(accountId);
    } catch (err) {
      return {
        channel: KIND,
        accountId: resolveTelegramAccount(accountId).accountId,
        ready: false,
        error: errMessage(err),
        checkedAt,
      };
    }

    try {
      const me = await bound.client.getMe();
      bound.botUsername = me.username?.toLowerCase();
      return {
        channel: KIND,
        accountId: bound.accountId,
        ready: true,
        identity: me.username ? `@${me.username}` : String(me.id),
        checkedAt,
      };
    } catch (err) {
      return {
        channel: KIND,
        accountId: bound.accountId,
        ready: false,
        error: errMessage(err),
        checkedAt,
      };
    }
  }

  normalize(rawEvent: unknown, accountId: string): NormalizedInboundMessage | undefined {
    const update = asTelegramUpdate(rawEvent);
    if (!update) {
      return undefined;
    }
    const normalizedAccountId = resolveTelegramAccount(accountId).accountId;
    const botUsername = this.#accounts.get(normalizedAccountId)?.botUsername;
    return normalizeTelegramUpdate({ update, accountId: normalizedAccountId, botUsername });
  }

  async react(request: ReactionRequest): Promise<boolean> {
    const bound = this.#bind(request.accountId);
    const target = parseTelegramTarget(request.conversationId);
    const messageId = Number.parseInt(request.messageId, 10);
    if (!Number.isFinite(messageId)) {
      return false;
    }
    try {
      await bound.client.setMessageReaction({
        chatId: target.chatId,
        messageId,
        emoji: request.emoji,
      });
      return true;
    } catch (err) {
      // Telegram rejects unsupported emoji / messages it can't react to.
      // The contract: return false rather than throw on a reaction miss.
      if (err instanceof TelegramApiError) {
        this.#log(
          `account "${bound.accountId}" reaction failed: ${err.message}`,
        );
        return false;
      }
      throw err;
    }
  }
}

/** Construct a Telegram connector. */
export function createTelegramConnector(
  options: TelegramConnectorOptions = {},
): TelegramConnector {
  return new TelegramConnector(options);
}

function computeBackoff(attempt: number): number {
  const raw = POLL_BACKOFF_INITIAL_MS * POLL_BACKOFF_FACTOR ** (attempt - 1);
  return Math.min(POLL_BACKOFF_MAX_MS, Math.round(raw));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function errMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

/** Narrow an unknown raw event to a TelegramUpdate, or undefined. */
function asTelegramUpdate(value: unknown): TelegramUpdate | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as { update_id?: unknown };
  if (typeof candidate.update_id !== "number") {
    return undefined;
  }
  return value as TelegramUpdate;
}
