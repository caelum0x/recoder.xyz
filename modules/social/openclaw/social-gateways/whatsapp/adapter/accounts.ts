// Owned by Recoder. Multi-account resolution for the WhatsApp ConnectorPort
// adapter. The original WhatsApp gateway resolves accounts from `OpenClawConfig`
// + an on-disk Baileys auth dir (`creds.json`) via the un-extracted
// `web/accounts.js` (`resolveWhatsAppAuthDir`, `listWhatsAppAccountIds`,
// `resolveDefaultWhatsAppAccountId`). This adapter resolves the same multi-
// account shape from environment-backed auth profiles so the connector is
// dependency-free and runtime-configurable, mirroring both the auth-profiles
// foundation and the Signal adapter's `resolveSignalAccount`: one base profile
// plus optional per-account overrides keyed by account id.
//
// WhatsApp Web runs as a local bridge daemon (Baileys behind an HTTP/SSE API)
// on the gateway host; the connector talks to that daemon, exactly as the Signal
// adapter talks to the signal-cli JSON-RPC daemon.
//
// Env contract (all optional; safe defaults applied):
//   WHATSAPP_ACCOUNTS        comma-separated account ids (default: "default")
//   WHATSAPP_BASE_URL        bridge daemon URL for the default account
//   WHATSAPP_HTTP_HOST       default daemon host (default: 127.0.0.1)
//   WHATSAPP_HTTP_PORT       default daemon port (default: 8088)
//   WHATSAPP_TOKEN           bearer token the bridge requires, if any
//   WHATSAPP_ENABLED         "false" disables the account
//   WHATSAPP_MEDIA_MAX_MB    outbound/inbound media cap in MB (default: 16)
// Per-account overrides use the upper-cased id as a suffix, e.g.:
//   WHATSAPP_BASE_URL_WORK, WHATSAPP_HTTP_PORT_WORK, WHATSAPP_TOKEN_WORK, ...

export const DEFAULT_ACCOUNT_ID = "default";

export interface ResolvedWhatsAppAccount {
  readonly accountId: string;
  readonly enabled: boolean;
  /** Origin of the WhatsApp Web bridge daemon (no trailing slash). */
  readonly baseUrl: string;
  /** Bearer token the bridge requires, if configured. */
  readonly token?: string;
  /** Whether any explicit configuration was supplied for this account. */
  readonly configured: boolean;
  /** Outbound/inbound media byte cap. */
  readonly mediaMaxBytes: number;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8088;
const DEFAULT_MEDIA_MAX_MB = 16;

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
export function listWhatsAppAccountIds(): string[] {
  const raw = process.env.WHATSAPP_ACCOUNTS?.trim();
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

/** Resolve the WhatsApp Web bridge connection for one account. */
export function resolveWhatsAppAccount(accountId?: string | null): ResolvedWhatsAppAccount {
  const id = normalizeAccountId(accountId);
  const host = readEnv("WHATSAPP_HTTP_HOST", id) ?? DEFAULT_HOST;
  const port = readNumberEnv("WHATSAPP_HTTP_PORT", id) ?? DEFAULT_PORT;
  const explicitUrl = readEnv("WHATSAPP_BASE_URL", id);
  const baseUrl = (explicitUrl ?? `http://${host}:${port}`).replace(/\/+$/, "");
  const token = readEnv("WHATSAPP_TOKEN", id);
  const mediaMaxMb = readNumberEnv("WHATSAPP_MEDIA_MAX_MB", id) ?? DEFAULT_MEDIA_MAX_MB;
  const configured = Boolean(
    explicitUrl ||
      token ||
      readEnv("WHATSAPP_HTTP_HOST", id) ||
      readNumberEnv("WHATSAPP_HTTP_PORT", id) !== undefined,
  );
  const disabled = readEnv("WHATSAPP_ENABLED", id)?.toLowerCase() === "false";
  return {
    accountId: id,
    enabled: !disabled,
    baseUrl,
    token,
    configured,
    mediaMaxBytes: Math.max(1, mediaMaxMb) * 1024 * 1024,
  };
}

/** Resolve every enabled account (used by callers that fan out monitors). */
export function listEnabledWhatsAppAccounts(): ResolvedWhatsAppAccount[] {
  return listWhatsAppAccountIds()
    .map((id) => resolveWhatsAppAccount(id))
    .filter((account) => account.enabled);
}
