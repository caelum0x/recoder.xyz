// Owned by Recoder. Multi-account resolution for the iMessage ConnectorPort
// adapter. The original social-gateways/imessage/accounts.ts resolves accounts
// from `OpenClawConfig` (the un-extracted `../config` monorepo module). This
// adapter resolves the same shape from environment-backed auth profiles so the
// connector is dependency-free and runtime-configurable, mirroring the
// auth-profiles foundation: one base profile plus optional per-account overrides
// keyed by account id (the same pattern the Signal adapter uses).
//
// Env contract (all optional; safe defaults applied). Identity is rebranded to
// Recoder; the legacy OPENCLAW_* names are honored as a deprecated fallback:
//   RECODER_IMESSAGE_ACCOUNTS        comma-separated account ids (default: "default")
//   RECODER_IMESSAGE_CLI_PATH        path to the `imsg` CLI (default: "imsg")
//   RECODER_IMESSAGE_DB_PATH         optional `--db <path>` for the chat.db
//   RECODER_IMESSAGE_SERVICE         default send service: imessage|sms|auto
//   RECODER_IMESSAGE_REGION          default dialing region for handles (default: US)
//   RECODER_IMESSAGE_MEDIA_MAX_MB    outbound media byte cap in MB (default: 16)
//   RECODER_IMESSAGE_ENABLED         set "false" to disable an account
// Per-account overrides use the upper-cased id as a suffix, e.g.:
//   RECODER_IMESSAGE_CLI_PATH_WORK, RECODER_IMESSAGE_DB_PATH_WORK, ...

import type { IMessageService } from "./targets.js";

export const DEFAULT_ACCOUNT_ID = "default";

const DEFAULT_CLI_PATH = "imsg";
const DEFAULT_REGION = "US";
const DEFAULT_MEDIA_MAX_MB = 16;

/** A fully-resolved iMessage account ready for monitor/send/probe. */
export interface ResolvedIMessageAccount {
  readonly accountId: string;
  readonly enabled: boolean;
  /** Path to the `imsg` CLI binary (or SSH wrapper script). */
  readonly cliPath: string;
  /** Optional `--db <path>` override for the Messages chat.db. */
  readonly dbPath?: string;
  /** Default send service when a target carries no explicit service prefix. */
  readonly service?: IMessageService;
  /** Default dialing region for bare phone handles (e.g. "US"). */
  readonly region: string;
  /** Outbound media byte cap. */
  readonly mediaMaxBytes: number;
  /** Whether any explicit configuration was supplied for this account. */
  readonly configured: boolean;
}

/** Normalize an account id to a non-empty, trimmed token. */
export function normalizeAccountId(accountId?: string | null): string {
  const trimmed = accountId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_ACCOUNT_ID;
}

function envSuffix(accountId: string): string {
  return accountId === DEFAULT_ACCOUNT_ID
    ? ""
    : `_${accountId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

/**
 * Read a connector env var, honoring the legacy `OPENCLAW_*` name as a
 * deprecated fallback and applying the per-account suffix to both names.
 */
function readEnv(base: string, accountId: string): string | undefined {
  const suffix = envSuffix(accountId);
  const legacyBase = base.replace(/^RECODER_/, "OPENCLAW_");
  const candidates = suffix
    ? [`${base}${suffix}`, `${legacyBase}${suffix}`, base, legacyBase]
    : [base, legacyBase];
  for (const name of candidates) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readNumberEnv(base: string, accountId: string): number | undefined {
  const raw = readEnv(base, accountId);
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseService(raw: string | undefined): IMessageService | undefined {
  const value = raw?.trim().toLowerCase();
  if (value === "imessage" || value === "sms" || value === "auto") {
    return value;
  }
  return undefined;
}

/** List configured account ids; falls back to the single default account. */
export function listIMessageAccountIds(): string[] {
  const raw = readEnv("RECODER_IMESSAGE_ACCOUNTS", DEFAULT_ACCOUNT_ID);
  if (!raw) {
    return [DEFAULT_ACCOUNT_ID];
  }
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

/** Resolve the `imsg` connection + send defaults for one iMessage account. */
export function resolveIMessageAccount(accountId?: string | null): ResolvedIMessageAccount {
  const id = normalizeAccountId(accountId);
  const cliPath = readEnv("RECODER_IMESSAGE_CLI_PATH", id) ?? DEFAULT_CLI_PATH;
  const dbPath = readEnv("RECODER_IMESSAGE_DB_PATH", id);
  const service = parseService(readEnv("RECODER_IMESSAGE_SERVICE", id));
  const region = readEnv("RECODER_IMESSAGE_REGION", id) ?? DEFAULT_REGION;
  const mediaMaxMb = readNumberEnv("RECODER_IMESSAGE_MEDIA_MAX_MB", id) ?? DEFAULT_MEDIA_MAX_MB;
  const disabled = readEnv("RECODER_IMESSAGE_ENABLED", id)?.toLowerCase() === "false";
  const configured = Boolean(
    readEnv("RECODER_IMESSAGE_CLI_PATH", id) ||
      dbPath ||
      service ||
      readEnv("RECODER_IMESSAGE_REGION", id) ||
      readNumberEnv("RECODER_IMESSAGE_MEDIA_MAX_MB", id) !== undefined,
  );

  return {
    accountId: id,
    enabled: !disabled,
    cliPath,
    dbPath,
    service,
    region,
    mediaMaxBytes: Math.max(1, mediaMaxMb) * 1024 * 1024,
    configured,
  };
}

/** Resolve every enabled account (used by callers that fan out monitors). */
export function listEnabledIMessageAccounts(): ResolvedIMessageAccount[] {
  return listIMessageAccountIds()
    .map((id) => resolveIMessageAccount(id))
    .filter((account) => account.enabled);
}
