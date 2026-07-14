// Owned by Recoder. Real Discord REST API HTTP client used by the Discord
// ConnectorPort adapter.
//
// This is the SAME wire protocol the extracted gateway speaks. The raw
// extracted send.ts/send.shared.ts wrap `@buape/carbon`'s `RequestClient` and
// pull in a large web of OpenClaw-internal siblings (../config, ../web/media,
// ../polls, ../markdown, ../auto-reply, ../infra/channel-activity) that are NOT
// part of the extraction. To keep the adapter a real, self-contained, compiling
// implementation of ConnectorPort, we talk to the Discord REST API directly over
// the global `fetch` — exactly as the extracted `probe.ts` and `api.ts` already
// do for getMe / oauth2 application reads. The endpoints below
// (`/users/@me`, `/users/@me/channels`, `/channels/:id/messages`, the reaction
// PUT) are the real v10 routes carbon's `RequestClient` issues under the hood for
// `sendMessageDiscord` / `reactMessageDiscord` / the DM-channel create.

const DISCORD_API_BASE = "https://discord.com/api/v10";

/** Discord caps a single message `content` at 2000 UTF-16 code units. */
export const DISCORD_MAX_MESSAGE_LENGTH = 2000;

/** Raw Discord `User` object (subset we consume). */
export interface DiscordUser {
  id: string;
  username?: string;
  global_name?: string | null;
  discriminator?: string;
  bot?: boolean;
}

/** Result of `getCurrentUser` (`/users/@me`) — the bot identity. */
export interface DiscordBotIdentity {
  id: string;
  username?: string;
  globalName?: string;
  discriminator?: string;
}

/** The created-message shape Discord returns from a POST to channelMessages. */
export interface DiscordCreatedMessage {
  id: string;
  channel_id: string;
}

/** Error thrown for a non-ok Discord REST API response. Carries the real status. */
export class DiscordApiClientError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly route: string;

  constructor(route: string, status: number, detail: string, code?: number) {
    super(`Discord ${route} failed (${status})${detail ? `: ${detail}` : ""}`);
    this.name = "DiscordApiClientError";
    this.status = status;
    this.code = code;
    this.route = route;
  }
}

interface DiscordErrorBody {
  message?: string;
  code?: number;
}

function parseErrorBody(text: string): DiscordErrorBody | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as DiscordErrorBody;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * A minimal, real Discord REST API client. One instance binds one bot token
 * (one connector account). Uses the global `fetch` (Node >= 18, declared in the
 * package `engines`) so the adapter needs no channel SDK at the foundation
 * layer. The `fetchImpl` override is the adapter's true HTTP/SDK seam: a host or
 * a dispatch test injects an alternate transport here to drive the real
 * send/react/probe paths without a live Discord connection.
 */
export class DiscordApiClient {
  readonly #base: string;
  readonly #fetch: typeof fetch;
  readonly #token: string;
  readonly #defaultTimeoutMs: number;

  constructor(params: { token: string; fetchImpl?: typeof fetch; timeoutMs?: number }) {
    const token = params.token.trim().replace(/^Bot\s+/i, "");
    if (!token) {
      throw new Error("DiscordApiClient requires a non-empty bot token.");
    }
    this.#token = token;
    this.#base = DISCORD_API_BASE;
    this.#fetch = params.fetchImpl ?? fetch;
    this.#defaultTimeoutMs = params.timeoutMs ?? 30_000;
  }

  async #request<T>(
    route: string,
    init: { method: string; body?: unknown },
    timeoutMs?: number,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.#defaultTimeoutMs);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bot ${this.#token}`,
      };
      if (init.body !== undefined) {
        headers["content-type"] = "application/json";
      }
      const res = await this.#fetch(`${this.#base}${route}`, {
        method: init.method,
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const body = parseErrorBody(text);
        throw new DiscordApiClientError(
          route,
          res.status,
          body?.message ?? text.trim(),
          body?.code,
        );
      }
      if (res.status === 204) {
        return undefined as T;
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        return undefined as T;
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** `GET /users/@me` — used by probe() to confirm the token is authorized. */
  async getCurrentUser(timeoutMs?: number): Promise<DiscordBotIdentity> {
    const me = await this.#request<{
      id: string;
      username?: string;
      global_name?: string | null;
      discriminator?: string;
    }>("/users/@me", { method: "GET" }, timeoutMs);
    return {
      id: me.id,
      username: me.username,
      globalName: me.global_name ?? undefined,
      discriminator: me.discriminator,
    };
  }

  /**
   * `POST /users/@me/channels` — open (or fetch the existing) DM channel with a
   * user. Mirrors the DM-channel create the gateway issues before a user DM.
   */
  async createDmChannel(userId: string, timeoutMs?: number): Promise<string> {
    const channel = await this.#request<{ id: string }>(
      "/users/@me/channels",
      { method: "POST", body: { recipient_id: userId } },
      timeoutMs,
    );
    if (!channel?.id) {
      throw new Error("Failed to create Discord DM channel");
    }
    return channel.id;
  }

  /**
   * `POST /channels/:channelId/messages` — deliver one text message. Mirrors the
   * channelMessages POST `sendMessageDiscord` issues per chunk. `replyTo`
   * threads the message under another via a non-strict `message_reference`.
   */
  async createMessage(params: {
    channelId: string;
    content: string;
    replyTo?: string;
    timeoutMs?: number;
  }): Promise<DiscordCreatedMessage> {
    const body: Record<string, unknown> = { content: params.content };
    if (params.replyTo) {
      body.message_reference = { message_id: params.replyTo, fail_if_not_exists: false };
    }
    return await this.#request<DiscordCreatedMessage>(
      `/channels/${params.channelId}/messages`,
      { method: "POST", body },
      params.timeoutMs,
    );
  }

  /**
   * `PUT /channels/:channelId/messages/:messageId/reactions/:emoji/@me` — add the
   * bot's own reaction. Mirrors `reactMessageDiscord`. `emoji` is the already
   * url-safe reaction identifier (unicode emoji, or `name:id` for a custom one).
   */
  async addReaction(params: {
    channelId: string;
    messageId: string;
    emoji: string;
    timeoutMs?: number;
  }): Promise<void> {
    await this.#request<void>(
      `/channels/${params.channelId}/messages/${params.messageId}/reactions/${params.emoji}/@me`,
      { method: "PUT" },
      params.timeoutMs,
    );
  }
}
