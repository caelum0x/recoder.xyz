// Owned by Recoder. Multi-account resolution for the Signal ConnectorPort
// adapter. The original social-gateways/signal/accounts.ts resolves accounts
// from `OpenClawConfig` (the un-extracted `../config` monorepo module). This
// adapter resolves the same shape from environment-backed auth profiles so the
// connector is dependency-free and runtime-configurable, mirroring the
// auth-profiles foundation: one base profile plus optional per-account
// overrides keyed by account id.
//
// Env contract (all optional; safe defaults applied):
//   SIGNAL_ACCOUNTS                 comma-separated account ids (default: "default")
//   SIGNAL_BASE_URL                 base daemon URL for the default account
//   SIGNAL_ACCOUNT                  signal-cli registered number for the default account
//   SIGNAL_HTTP_HOST                default daemon host (default: 127.0.0.1)
//   SIGNAL_HTTP_PORT                default daemon port (default: 8080)
//   SIGNAL_MEDIA_MAX_MB             default outbound/inbound media cap in MB (default: 8)
// Per-account overrides use the upper-cased id as a suffix, e.g.:
//   SIGNAL_BASE_URL_WORK, SIGNAL_ACCOUNT_WORK, SIGNAL_HTTP_PORT_WORK, ...

export const DEFAULT_ACCOUNT_ID = "default";

export interface ResolvedSignalAccount {
  readonly accountId: string;
  readonly enabled: boolean;
  readonly baseUrl: string;
  /** signal-cli registered account number (E.164), if configured. */
  readonly account?: string;
  /** Whether any explicit configuration was supplied for this account. */
  readonly configured: boolean;
  /** Outbound/inbound media byte cap. */
  readonly mediaMaxBytes: number;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8080;
const DEFAULT_MEDIA_MAX_MB = 8;

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

function readEnv(base: string, accountId: string): string | undefined {
  const suffix = envSuffix(accountId);
  const scoped = suffix ? process.env[`${base}${suffix}`] : undefined;
  const value = scoped?.trim() || process.env[base]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function readNumberEnv(base: string, accountId: string): number | undefined {
  const raw = readEnv(base, accountId);
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** List configured account ids; falls back to the single default account. */
export function listSignalAccountIds(): string[] {
  const raw = process.env.SIGNAL_ACCOUNTS?.trim();
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

/** Resolve the daemon connection + identity for one Signal account. */
export function resolveSignalAccount(accountId?: string | null): ResolvedSignalAccount {
  const id = normalizeAccountId(accountId);
  const host = readEnv("SIGNAL_HTTP_HOST", id) ?? DEFAULT_HOST;
  const port = readNumberEnv("SIGNAL_HTTP_PORT", id) ?? DEFAULT_PORT;
  const explicitUrl = readEnv("SIGNAL_BASE_URL", id);
  const baseUrl = explicitUrl ?? `http://${host}:${port}`;
  const account = readEnv("SIGNAL_ACCOUNT", id);
  const mediaMaxMb = readNumberEnv("SIGNAL_MEDIA_MAX_MB", id) ?? DEFAULT_MEDIA_MAX_MB;
  const configured = Boolean(
    explicitUrl ||
      account ||
      readEnv("SIGNAL_HTTP_HOST", id) ||
      readNumberEnv("SIGNAL_HTTP_PORT", id) !== undefined,
  );
  const disabled = readEnv("SIGNAL_ENABLED", id)?.toLowerCase() === "false";
  return {
    accountId: id,
    enabled: !disabled,
    baseUrl,
    account,
    configured,
    mediaMaxBytes: Math.max(1, mediaMaxMb) * 1024 * 1024,
  };
}

/** Resolve every enabled account (used by callers that fan out monitors). */
export function listEnabledSignalAccounts(): ResolvedSignalAccount[] {
  return listSignalAccountIds()
    .map((id) => resolveSignalAccount(id))
    .filter((account) => account.enabled);
}
