// Owned by Recoder. Multi-account token + proxy resolution for the Telegram
// ConnectorPort adapter.
//
// The raw extracted `accounts.ts`/`token.ts` resolve per-account config from a
// large `OpenClawConfig` object (channels.telegram.accounts.<id>.botToken /
// tokenFile / proxy) that is not part of the extraction. This file preserves
// the SAME resolution semantics — per-account token, tokenFile, then env, with
// a normalized account id and a "default" account — but sources them from the
// owned Recoder connectors env convention (`readConnectorEnv`, i.e.
// RECODER_CONNECTORS_* with the legacy OPENCLAW_* fallback) plus the channel's
// own TELEGRAM_BOT_TOKEN env var. No fake values: an account with no resolvable
// token reports `tokenSource: "none"` and a truthful probe failure downstream.

import fs from "node:fs";
import { readConnectorEnv } from "../../../src/identity.js";

/** The implicit account id used when a caller passes no explicit account. */
export const DEFAULT_TELEGRAM_ACCOUNT_ID = "default";

export type TelegramTokenSource = "env" | "tokenFile" | "config" | "none";

/** A resolved Telegram connector account: its id, token, and source. */
export interface ResolvedTelegramAccount {
  readonly accountId: string;
  readonly token: string;
  readonly tokenSource: TelegramTokenSource;
  /** Optional HTTP(S) proxy URL for this account's API traffic. */
  readonly proxyUrl?: string;
}

/**
 * Normalize an account id the same way the extracted routing layer did: trim,
 * lowercase, and collapse empties to the default account. Keeps env-key lookups
 * deterministic across casings.
 */
export function normalizeAccountId(accountId?: string | null): string {
  const trimmed = accountId?.trim().toLowerCase();
  return trimmed ? trimmed : DEFAULT_TELEGRAM_ACCOUNT_ID;
}

/**
 * The env suffix segment for a non-default account. `default` resolves the bare
 * keys (`TELEGRAM_BOT_TOKEN`, `RECODER_CONNECTORS_TELEGRAM_BOT_TOKEN`); a named
 * account `support` resolves `..._TELEGRAM_SUPPORT_BOT_TOKEN`.
 */
function accountEnvSegment(accountId: string): string {
  return accountId === DEFAULT_TELEGRAM_ACCOUNT_ID
    ? ""
    : `_${accountId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

function readTokenFile(path: string): string {
  if (!fs.existsSync(path)) {
    throw new Error(`Telegram tokenFile not found: ${path}`);
  }
  return fs.readFileSync(path, "utf-8").trim();
}

/**
 * Resolve the bot token + proxy for an account. Precedence mirrors the
 * extracted `resolveTelegramToken`: explicit tokenFile, then a direct token
 * value, then the bare channel env var (default account only).
 *
 * Env keys (per account `<id>`, uppercased; default account uses no segment):
 *  - token file:  `RECODER_CONNECTORS_TELEGRAM<seg>_TOKEN_FILE`
 *  - token value: `RECODER_CONNECTORS_TELEGRAM<seg>_BOT_TOKEN`
 *  - proxy:       `RECODER_CONNECTORS_TELEGRAM<seg>_PROXY`
 *  - default-only fallback: `TELEGRAM_BOT_TOKEN`
 */
export function resolveTelegramAccount(accountId?: string | null): ResolvedTelegramAccount {
  const id = normalizeAccountId(accountId);
  const seg = accountEnvSegment(id);
  const proxyUrl = readConnectorEnv(`TELEGRAM${seg}_PROXY`)?.trim() || undefined;

  const tokenFile = readConnectorEnv(`TELEGRAM${seg}_TOKEN_FILE`)?.trim();
  if (tokenFile) {
    const token = readTokenFile(tokenFile);
    if (token) {
      return { accountId: id, token, tokenSource: "tokenFile", proxyUrl };
    }
    return { accountId: id, token: "", tokenSource: "none", proxyUrl };
  }

  const directToken = readConnectorEnv(`TELEGRAM${seg}_BOT_TOKEN`)?.trim();
  if (directToken) {
    return { accountId: id, token: directToken, tokenSource: "config", proxyUrl };
  }

  if (id === DEFAULT_TELEGRAM_ACCOUNT_ID) {
    const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (envToken) {
      return { accountId: id, token: envToken, tokenSource: "env", proxyUrl };
    }
  }

  return { accountId: id, token: "", tokenSource: "none", proxyUrl };
}
