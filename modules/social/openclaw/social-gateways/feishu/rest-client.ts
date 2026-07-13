// Owned by Recoder. Self-contained Feishu / Lark Open Platform REST client used
// by the ConnectorPort adapter. This is the REAL Feishu protocol — the same
// endpoints the @larksuiteoapi/node-sdk wraps — implemented directly over
// `fetch`, exactly like the extracted `probe.ts` already does (tenant access
// token exchange + bot info). No SDK dependency, no OpenClaw config tree.
//
// Endpoints (verified against open.larksuite.com / open.feishu.cn docs):
//   POST /open-apis/auth/v3/tenant_access_token/internal   -> tenant_access_token
//   GET  /open-apis/bot/v3/info                             -> bot identity
//   POST /open-apis/im/v1/messages?receive_id_type=...      -> send message
//   POST /open-apis/im/v1/messages/:message_id/reactions    -> add emoji reaction

import { formatErrorMessage } from "./errors.js";
import { resolveFeishuApiBase } from "./domain.js";

/** Where the token + receive id are resolved against. */
export type FeishuReceiveIdType =
  | "open_id"
  | "user_id"
  | "union_id"
  | "email"
  | "chat_id";

/** Immutable credentials for one Feishu app (one connector account). */
export interface FeishuCredentials {
  readonly appId: string;
  readonly appSecret: string;
  /** Optional region/domain ("feishu" | "lark" | full URL). */
  readonly domain?: string;
}

/** Identity reported by the Feishu bot info endpoint. */
export interface FeishuBotIdentity {
  readonly appId: string;
  readonly appName?: string;
  readonly openId?: string;
  readonly avatarUrl?: string;
}

interface TokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}

interface BotInfoResponse {
  code: number;
  msg: string;
  bot?: {
    app_name?: string;
    avatar_url?: string;
    open_id?: string;
  };
}

interface SendMessageResponse {
  code: number;
  msg: string;
  data?: { message_id?: string };
}

interface ReactionResponse {
  code: number;
  msg: string;
  data?: { reaction_id?: string };
}

interface CachedToken {
  token: string;
  /** Epoch ms the cached token must be refreshed at (with safety margin). */
  expiresAt: number;
}

const DEFAULT_TIMEOUT_MS = 8000;
/** Refresh the tenant token this many ms before the API-reported expiry. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

function cacheKey(creds: FeishuCredentials): string {
  return `${resolveFeishuApiBase(creds.domain)}|${creds.appId}`;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A real Feishu Open Platform REST client for one app/account. Caches the
 * tenant access token and refreshes it before expiry. Throws truthful errors on
 * any non-zero API code — never swallows failures (interop §6).
 */
export class FeishuRestClient {
  readonly #creds: FeishuCredentials;
  readonly #apiBase: string;
  readonly #timeoutMs: number;
  static readonly #tokenCache = new Map<string, CachedToken>();

  constructor(creds: FeishuCredentials, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    if (!creds.appId.trim() || !creds.appSecret.trim()) {
      throw new Error("FeishuRestClient requires a non-empty appId and appSecret");
    }
    this.#creds = creds;
    this.#apiBase = resolveFeishuApiBase(creds.domain);
    this.#timeoutMs = timeoutMs;
  }

  /** Fetch (and cache) a tenant_access_token for this app. */
  async tenantAccessToken(now: number = Date.now()): Promise<string> {
    const key = cacheKey(this.#creds);
    const cached = FeishuRestClient.#tokenCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.token;
    }

    const res = await fetchWithTimeout(
      `${this.#apiBase}/auth/v3/tenant_access_token/internal`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          app_id: this.#creds.appId,
          app_secret: this.#creds.appSecret,
        }),
      },
      this.#timeoutMs,
    );

    const json = (await res.json()) as TokenResponse;
    if (json.code !== 0 || !json.tenant_access_token) {
      throw new Error(
        json.msg || `Feishu token exchange failed: code ${json.code}`,
      );
    }

    const expireSeconds = typeof json.expire === "number" ? json.expire : 7200;
    FeishuRestClient.#tokenCache.set(key, {
      token: json.tenant_access_token,
      expiresAt: now + expireSeconds * 1000 - TOKEN_REFRESH_MARGIN_MS,
    });
    return json.tenant_access_token;
  }

  /** Read the bot identity for this app (used by probe to report identity). */
  async botInfo(): Promise<FeishuBotIdentity> {
    const token = await this.tenantAccessToken();
    const res = await fetchWithTimeout(
      `${this.#apiBase}/bot/v3/info`,
      { method: "GET", headers: { Authorization: `Bearer ${token}` } },
      this.#timeoutMs,
    );
    const json = (await res.json()) as BotInfoResponse;
    if (json.code !== 0) {
      throw new Error(json.msg || `Feishu bot info failed: code ${json.code}`);
    }
    return {
      appId: this.#creds.appId,
      appName: json.bot?.app_name,
      openId: json.bot?.open_id,
      avatarUrl: json.bot?.avatar_url,
    };
  }

  /**
   * Send one text message. Mirrors the SDK `im.message.create` call in the
   * extracted `send.ts` — same `receive_id_type` query + `{receive_id, msg_type,
   * content}` body — over raw fetch. Returns the channel-native message id.
   */
  async sendText(
    receiveId: string,
    text: string,
    receiveIdType: FeishuReceiveIdType = "chat_id",
  ): Promise<string> {
    const token = await this.tenantAccessToken();
    const url = `${this.#apiBase}/im/v1/messages?receive_id_type=${encodeURIComponent(
      receiveIdType,
    )}`;
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          receive_id: receiveId,
          msg_type: "text",
          content: JSON.stringify({ text }),
        }),
      },
      this.#timeoutMs,
    );

    const json = (await res.json()) as SendMessageResponse;
    if (json.code !== 0) {
      throw new Error(json.msg || `Feishu send failed: code ${json.code}`);
    }
    const messageId = json.data?.message_id;
    if (!messageId) {
      throw new Error("Feishu send succeeded but returned no message_id");
    }
    return messageId;
  }

  /**
   * Add an emoji reaction to a message. Mirrors the real
   * `POST /im/v1/messages/:message_id/reactions` endpoint with
   * `{reaction_type:{emoji_type}}`. Resolves the new reaction id.
   */
  async addReaction(messageId: string, emojiType: string): Promise<string> {
    const token = await this.tenantAccessToken();
    const url = `${this.#apiBase}/im/v1/messages/${encodeURIComponent(
      messageId,
    )}/reactions`;
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ reaction_type: { emoji_type: emojiType } }),
      },
      this.#timeoutMs,
    );

    const json = (await res.json()) as ReactionResponse;
    if (json.code !== 0) {
      throw new Error(json.msg || `Feishu reaction failed: code ${json.code}`);
    }
    const reactionId = json.data?.reaction_id;
    if (!reactionId) {
      throw new Error("Feishu reaction succeeded but returned no reaction_id");
    }
    return reactionId;
  }

  /** Test-only: clear the static token cache (avoids cross-test bleed). */
  static resetTokenCache(): void {
    FeishuRestClient.#tokenCache.clear();
  }
}

/** Narrow an unknown thrown value to a truthful error string. */
export function describeError(err: unknown): string {
  return formatErrorMessage(err);
}
