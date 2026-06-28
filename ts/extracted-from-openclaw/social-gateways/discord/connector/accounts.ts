// Owned by Recoder. Multi-account token resolution for the Discord ConnectorPort
// adapter.
//
// The raw extracted `../accounts.ts`/`../token.ts` resolve per-account config
// from a large `OpenClawConfig` object (channels.discord.accounts.<id>.token)
// plus `../routing/session-key.js`, neither of which is part of the extraction.
// This file preserves the SAME resolution semantics — per-account token, then a
// default-account env fallback, with a normalized account id and a "default"
// account — but sources them from the owned Recoder connectors env convention
// (`readConnectorEnv`, i.e. RECODER_CONNECTORS_* with the legacy OPENCLAW_*
// fallback) plus the channel's own DISCORD_BOT_TOKEN env var. No fake values: an
// account with no resolvable token reports `tokenSource: "none"` and a truthful
// probe failure downstream.

import fs from "node:fs";
import { readConnectorEnv } from "../../../src/identity.js";

/** The implicit account id used when a caller passes no explicit account. */
export const DEFAULT_DISCORD_ACCOUNT_ID = "default";

export type DiscordTokenSource = "env" | "tokenFile" | "config" | "none";

/** A resolved Discord connector account: its id, token, and source. */
export interface ResolvedDiscordAccount {
  readonly accountId: string;
  readonly token: string;
  readonly tokenSource: DiscordTokenSource;
}

/** Strip a leading `Bot ` prefix and surrounding whitespace from a raw token. */
export function normalizeDiscordToken(raw?: string | null): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim().replace(/^Bot\s+/i, "");
  return trimmed ? trimmed : undefined;
}

/**
 * Normalize an account id the same way the extracted routing layer did: trim,
 * lowercase, and collapse empties to the default account. Keeps env-key lookups
 * deterministic across casings.
 */
export function normalizeAccountId(accountId?: string | null): string {
  const trimmed = accountId?.trim().toLowerCase();
  return trimmed ? trimmed : DEFAULT_DISCORD_ACCOUNT_ID;
}

/**
 * The env suffix segment for a non-default account. `default` resolves the bare
 * keys (`DISCORD_BOT_TOKEN`, `RECODER_CONNECTORS_DISCORD_BOT_TOKEN`); a named
 * account `support` resolves `..._DISCORD_SUPPORT_BOT_TOKEN`.
 */
function accountEnvSegment(accountId: string): string {
  return accountId === DEFAULT_DISCORD_ACCOUNT_ID
    ? ""
    : `_${accountId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

function readTokenFile(path: string): string {
  if (!fs.existsSync(path)) {
    throw new Error(`Discord tokenFile not found: ${path}`);
  }
  return fs.readFileSync(path, "utf-8").trim();
}

/**
 * Optional per-account config a host may pass to {@link DiscordConnector}. When a
 * token is supplied here it takes precedence over the env resolution, mirroring
 * the raw gateway's `channels.discord.accounts.<id>.token` precedence over env.
 */
export interface DiscordAccountConfig {
  /** Explicit bot token (config-sourced). */
  token?: string;
  /** Path to a file whose trimmed contents are the bot token. */
  tokenFile?: string;
}

/** Channel-level Discord config with named sub-accounts. */
export interface DiscordConnectorConfig extends DiscordAccountConfig {
  accounts?: Record<string, DiscordAccountConfig>;
}

/**
 * Resolve the bot token for an account. Precedence mirrors the extracted
 * `resolveDiscordToken`: explicit account config (token / tokenFile), then the
 * connector env var, then the default-account `DISCORD_BOT_TOKEN` fallback.
 *
 * Env keys (per account `<id>`, uppercased; default account uses no segment):
 *  - token file:  `RECODER_CONNECTORS_DISCORD<seg>_TOKEN_FILE`
 *  - token value: `RECODER_CONNECTORS_DISCORD<seg>_BOT_TOKEN`
 *  - default-only fallback: `DISCORD_BOT_TOKEN`
 */
export function resolveDiscordAccount(
  accountId?: string | null,
  config?: DiscordConnectorConfig,
): ResolvedDiscordAccount {
  const id = normalizeAccountId(accountId);

  const accountConfig =
    id === DEFAULT_DISCORD_ACCOUNT_ID ? config : config?.accounts?.[id];

  const configToken = normalizeDiscordToken(accountConfig?.token);
  if (configToken) {
    return { accountId: id, token: configToken, tokenSource: "config" };
  }

  const configTokenFile = accountConfig?.tokenFile?.trim();
  if (configTokenFile) {
    const fileToken = normalizeDiscordToken(readTokenFile(configTokenFile));
    if (fileToken) {
      return { accountId: id, token: fileToken, tokenSource: "tokenFile" };
    }
    return { accountId: id, token: "", tokenSource: "none" };
  }

  const seg = accountEnvSegment(id);

  const envTokenFile = readConnectorEnv(`DISCORD${seg}_TOKEN_FILE`)?.trim();
  if (envTokenFile) {
    const fileToken = normalizeDiscordToken(readTokenFile(envTokenFile));
    if (fileToken) {
      return { accountId: id, token: fileToken, tokenSource: "tokenFile" };
    }
    return { accountId: id, token: "", tokenSource: "none" };
  }

  const directToken = normalizeDiscordToken(readConnectorEnv(`DISCORD${seg}_BOT_TOKEN`));
  if (directToken) {
    return { accountId: id, token: directToken, tokenSource: "config" };
  }

  if (id === DEFAULT_DISCORD_ACCOUNT_ID) {
    const envToken = normalizeDiscordToken(process.env.DISCORD_BOT_TOKEN);
    if (envToken) {
      return { accountId: id, token: envToken, tokenSource: "env" };
    }
  }

  return { accountId: id, token: "", tokenSource: "none" };
}
