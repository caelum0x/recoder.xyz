// Owned by Recoder. Real Telegram Bot API HTTP client used by the Telegram
// ConnectorPort adapter.
//
// This is the SAME wire protocol the extracted gateway speaks. The raw
// extracted send.ts/monitor.ts wrap grammY's `Bot` (which is itself a thin
// client over this exact HTTP API) and pull in a large web of OpenClaw-internal
// siblings (../config, ../infra, ../routing, ../logging, ../media, ../web) that
// are NOT part of the extraction. To keep the adapter a real, self-contained,
// compiling implementation of ConnectorPort, we talk to the Bot API directly
// over the global `fetch` — exactly as the extracted `probe.ts` already does
// for getMe/getWebhookInfo. Long-polling here mirrors `monitorTelegramProvider`
// (grammY's runner is a getUpdates long-poll loop with backoff); send/react
// mirror `sendMessageTelegram` / `reactMessageTelegram`.

const TELEGRAM_API_BASE = "https://api.telegram.org";

/** Telegram caps a single sendMessage `text` at 4096 UTF-16 code units. */
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

/** Raw Telegram `User` object (subset we consume). */
export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

/** Raw Telegram `Chat` object (subset we consume). */
export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
}

/** Raw Telegram `MessageEntity` (subset we consume for mention detection). */
export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
}

/** Raw Telegram `Message` object (subset we consume). */
export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  message_thread_id?: number;
  text?: string;
  caption?: string;
  entities?: TelegramMessageEntity[];
  caption_entities?: TelegramMessageEntity[];
  photo?: Array<{ file_id: string; file_size?: number }>;
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  voice?: { file_id: string; mime_type?: string; file_size?: number };
  audio?: { file_id: string; mime_type?: string; file_name?: string; file_size?: number };
  video?: { file_id: string; mime_type?: string; file_size?: number };
}

/** Raw Telegram `Update` object (subset we consume). */
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

/** Result of `getMe`. */
export interface TelegramBotIdentity {
  id: number;
  username?: string;
  firstName?: string;
  canJoinGroups?: boolean;
  canReadAllGroupMessages?: boolean;
  supportsInlineQueries?: boolean;
}

interface TelegramApiOk<T> {
  ok: true;
  result: T;
}

interface TelegramApiErr {
  ok: false;
  error_code?: number;
  description?: string;
}

type TelegramApiResponse<T> = TelegramApiOk<T> | TelegramApiErr;

/** Error thrown for a non-ok Telegram Bot API response. Carries the real code. */
export class TelegramApiError extends Error {
  readonly errorCode?: number;
  readonly method: string;
  constructor(method: string, description: string, errorCode?: number) {
    super(`Telegram ${method} failed${errorCode != null ? ` (${errorCode})` : ""}: ${description}`);
    this.name = "TelegramApiError";
    this.method = method;
    this.errorCode = errorCode;
  }
}

/**
 * A minimal, real Telegram Bot API client. One instance binds one bot token
 * (one connector account). Uses the global `fetch` (Node >= 18, declared in the
 * package `engines`) so the adapter needs no channel SDK at the foundation
 * layer.
 */
export class TelegramApiClient {
  readonly #base: string;
  readonly #fetch: typeof fetch;
  readonly #defaultTimeoutMs: number;

  constructor(params: { token: string; fetchImpl?: typeof fetch; timeoutMs?: number }) {
    const token = params.token.trim();
    if (!token) {
      throw new Error("TelegramApiClient requires a non-empty bot token.");
    }
    this.#base = `${TELEGRAM_API_BASE}/bot${token}`;
    this.#fetch = params.fetchImpl ?? fetch;
    this.#defaultTimeoutMs = params.timeoutMs ?? 30_000;
  }

  async #call<T>(
    method: string,
    body?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.#defaultTimeoutMs);
    try {
      const res = await this.#fetch(`${this.#base}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });
      const json = (await res.json()) as TelegramApiResponse<T>;
      if (!json.ok) {
        throw new TelegramApiError(
          method,
          json.description ?? `HTTP ${res.status}`,
          json.error_code ?? res.status,
        );
      }
      return json.result;
    } finally {
      clearTimeout(timer);
    }
  }

  /** `getMe` — used by probe() to confirm the token is reachable and authorized. */
  async getMe(timeoutMs?: number): Promise<TelegramBotIdentity> {
    const me = await this.#call<{
      id: number;
      username?: string;
      first_name?: string;
      can_join_groups?: boolean;
      can_read_all_group_messages?: boolean;
      supports_inline_queries?: boolean;
    }>("getMe", undefined, timeoutMs);
    return {
      id: me.id,
      username: me.username,
      firstName: me.first_name,
      canJoinGroups: me.can_join_groups,
      canReadAllGroupMessages: me.can_read_all_group_messages,
      supportsInlineQueries: me.supports_inline_queries,
    };
  }

  /**
   * `getUpdates` long-poll. `offset` is `last_update_id + 1`; `timeoutSeconds`
   * is the server-side long-poll hold. Mirrors the getUpdates loop grammY's
   * runner drives inside `monitorTelegramProvider`.
   */
  async getUpdates(params: {
    offset?: number;
    timeoutSeconds: number;
    allowedUpdates?: readonly string[];
    abortSignal?: AbortSignal;
  }): Promise<TelegramUpdate[]> {
    // The HTTP request must outlive the server-side long poll: client timeout =
    // long-poll seconds + a network grace window.
    const httpTimeoutMs = (params.timeoutSeconds + 10) * 1000;
    const body: Record<string, unknown> = { timeout: params.timeoutSeconds };
    if (params.offset != null) {
      body.offset = params.offset;
    }
    if (params.allowedUpdates) {
      body.allowed_updates = params.allowedUpdates;
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (params.abortSignal) {
      if (params.abortSignal.aborted) {
        controller.abort();
      } else {
        params.abortSignal.addEventListener("abort", onAbort, { once: true });
      }
    }
    const timer = setTimeout(() => controller.abort(), httpTimeoutMs);
    try {
      const res = await this.#fetch(`${this.#base}/getUpdates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = (await res.json()) as TelegramApiResponse<TelegramUpdate[]>;
      if (!json.ok) {
        throw new TelegramApiError(
          "getUpdates",
          json.description ?? `HTTP ${res.status}`,
          json.error_code ?? res.status,
        );
      }
      return json.result;
    } finally {
      clearTimeout(timer);
      if (params.abortSignal) {
        params.abortSignal.removeEventListener("abort", onAbort);
      }
    }
  }

  /** `sendMessage`. Returns the created message id + chat id. Mirrors `sendMessageTelegram`. */
  async sendMessage(params: {
    chatId: string | number;
    text: string;
    messageThreadId?: number;
    replyToMessageId?: number;
    silent?: boolean;
  }): Promise<{ messageId: number; chatId: string }> {
    const body: Record<string, unknown> = {
      chat_id: params.chatId,
      text: params.text,
    };
    if (params.messageThreadId != null) {
      body.message_thread_id = params.messageThreadId;
    }
    if (params.replyToMessageId != null) {
      body.reply_parameters = { message_id: params.replyToMessageId };
    }
    if (params.silent === true) {
      body.disable_notification = true;
    }
    const msg = await this.#call<{ message_id: number; chat?: { id: number } }>(
      "sendMessage",
      body,
    );
    return {
      messageId: msg.message_id,
      chatId: String(msg.chat?.id ?? params.chatId),
    };
  }

  /**
   * `setMessageReaction`. Empty `emoji` clears reactions. Mirrors
   * `reactMessageTelegram`. Resolves the raw API result.
   */
  async setMessageReaction(params: {
    chatId: string | number;
    messageId: number;
    emoji?: string;
  }): Promise<boolean> {
    const trimmed = params.emoji?.trim();
    const body: Record<string, unknown> = {
      chat_id: params.chatId,
      message_id: params.messageId,
      reaction: trimmed ? [{ type: "emoji", emoji: trimmed }] : [],
    };
    return await this.#call<boolean>("setMessageReaction", body);
  }
}
