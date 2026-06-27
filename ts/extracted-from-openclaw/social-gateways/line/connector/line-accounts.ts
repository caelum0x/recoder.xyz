// Owned by Recoder. Multi-account credential resolution for the LINE
// ConnectorPort adapter. This is a self-contained port of the REAL resolution
// logic in ../accounts.ts (token/secret precedence: account config -> account
// file -> base config -> base file -> env), kept standalone because the original
// imports the un-extracted monorepo `../config/config.js` (`OpenClawConfig` /
// `loadConfig`). The precedence and file-read behavior are preserved verbatim;
// only the config source is parameterized so the adapter compiles in isolation.
//
// Identity is rebranded to Recoder: the primary env vars are
// `RECODER_LINE_CHANNEL_ACCESS_TOKEN` / `RECODER_LINE_CHANNEL_SECRET`, with the
// original `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` honored as a
// deprecated fallback (same pattern as the foundation's RECODER_CONNECTORS_* env).

import fs from "node:fs";

export type LineTokenSource = "config" | "env" | "file" | "none";

/** Per-account LINE credential + policy config (mirror of ../types.ts). */
export interface LineAccountConfig {
  enabled?: boolean;
  channelAccessToken?: string;
  channelSecret?: string;
  tokenFile?: string;
  secretFile?: string;
  name?: string;
  webhookPath?: string;
  mediaMaxMb?: number;
}

/** Channel-level LINE config with named sub-accounts (mirror of ../types.ts). */
export interface LineConnectorConfig extends LineAccountConfig {
  accounts?: Record<string, LineAccountConfig>;
}

/** A fully-resolved LINE account ready for messaging (mirror of ResolvedLineAccount). */
export interface ResolvedLineAccount {
  accountId: string;
  name?: string;
  enabled: boolean;
  channelAccessToken: string;
  channelSecret: string;
  tokenSource: LineTokenSource;
  config: LineConnectorConfig;
}

export const DEFAULT_ACCOUNT_ID = "default";

function readFileIfExists(filePath: string | undefined): string | undefined {
  if (!filePath) {
    return undefined;
  }
  try {
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return undefined;
  }
}

/** Read a connector env var, honoring the legacy LINE_* name as a fallback. */
function readLineEnv(primary: string, legacy: string): string | undefined {
  const value = process.env[primary]?.trim();
  if (value) {
    return value;
  }
  return process.env[legacy]?.trim() || undefined;
}

function resolveToken(params: {
  accountId: string;
  baseConfig?: LineConnectorConfig;
  accountConfig?: LineAccountConfig;
}): { token: string; tokenSource: LineTokenSource } {
  const { accountId, baseConfig, accountConfig } = params;

  if (accountConfig?.channelAccessToken?.trim()) {
    return { token: accountConfig.channelAccessToken.trim(), tokenSource: "config" };
  }

  const accountFileToken = readFileIfExists(accountConfig?.tokenFile);
  if (accountFileToken) {
    return { token: accountFileToken, tokenSource: "file" };
  }

  if (accountId === DEFAULT_ACCOUNT_ID) {
    if (baseConfig?.channelAccessToken?.trim()) {
      return { token: baseConfig.channelAccessToken.trim(), tokenSource: "config" };
    }

    const baseFileToken = readFileIfExists(baseConfig?.tokenFile);
    if (baseFileToken) {
      return { token: baseFileToken, tokenSource: "file" };
    }

    const envToken = readLineEnv("RECODER_LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_ACCESS_TOKEN");
    if (envToken) {
      return { token: envToken, tokenSource: "env" };
    }
  }

  return { token: "", tokenSource: "none" };
}

function resolveSecret(params: {
  accountId: string;
  baseConfig?: LineConnectorConfig;
  accountConfig?: LineAccountConfig;
}): string {
  const { accountId, baseConfig, accountConfig } = params;

  if (accountConfig?.channelSecret?.trim()) {
    return accountConfig.channelSecret.trim();
  }

  const accountFileSecret = readFileIfExists(accountConfig?.secretFile);
  if (accountFileSecret) {
    return accountFileSecret;
  }

  if (accountId === DEFAULT_ACCOUNT_ID) {
    if (baseConfig?.channelSecret?.trim()) {
      return baseConfig.channelSecret.trim();
    }

    const baseFileSecret = readFileIfExists(baseConfig?.secretFile);
    if (baseFileSecret) {
      return baseFileSecret;
    }

    const envSecret = readLineEnv("RECODER_LINE_CHANNEL_SECRET", "LINE_CHANNEL_SECRET");
    if (envSecret) {
      return envSecret;
    }
  }

  return "";
}

export function normalizeAccountId(accountId: string | undefined): string {
  const trimmed = accountId?.trim().toLowerCase();
  if (!trimmed || trimmed === DEFAULT_ACCOUNT_ID) {
    return DEFAULT_ACCOUNT_ID;
  }
  return trimmed;
}

/**
 * Resolve a single LINE account's credentials from the connector config.
 * Preserves the real precedence: account-config -> account-file -> (default
 * only) base-config -> base-file -> env.
 */
export function resolveLineAccount(params: {
  config?: LineConnectorConfig;
  accountId?: string;
}): ResolvedLineAccount {
  const lineConfig = params.config;
  const accountId = normalizeAccountId(params.accountId);
  const accounts = lineConfig?.accounts;
  const accountConfig = accountId !== DEFAULT_ACCOUNT_ID ? accounts?.[accountId] : undefined;

  const { token, tokenSource } = resolveToken({
    accountId,
    baseConfig: lineConfig,
    accountConfig,
  });

  const secret = resolveSecret({
    accountId,
    baseConfig: lineConfig,
    accountConfig,
  });

  const mergedConfig: LineConnectorConfig = {
    ...lineConfig,
    ...accountConfig,
  };

  const enabled =
    accountConfig?.enabled ??
    (accountId === DEFAULT_ACCOUNT_ID ? (lineConfig?.enabled ?? true) : false);

  const name =
    accountConfig?.name ?? (accountId === DEFAULT_ACCOUNT_ID ? lineConfig?.name : undefined);

  return {
    accountId,
    name,
    enabled,
    channelAccessToken: token,
    channelSecret: secret,
    tokenSource,
    config: mergedConfig,
  };
}

/** Enumerate the configured LINE account ids (default + named sub-accounts). */
export function listLineAccountIds(config?: LineConnectorConfig): string[] {
  const accounts = config?.accounts;
  const ids = new Set<string>();

  if (
    config?.channelAccessToken?.trim() ||
    config?.tokenFile ||
    readLineEnv("RECODER_LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_ACCESS_TOKEN")
  ) {
    ids.add(DEFAULT_ACCOUNT_ID);
  }

  if (accounts) {
    for (const id of Object.keys(accounts)) {
      ids.add(normalizeAccountId(id));
    }
  }

  return Array.from(ids);
}
