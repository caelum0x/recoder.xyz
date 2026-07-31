/**
 * `RECODER_SOLO_MODE` boot guardrail (reliability item #19).
 *
 * Solo mode makes auth fail OPEN on mutating routes so the DB-less embedded
 * desktop (one local user, no sign-in plane, no shared key store) can create /
 * run / merge workspaces on their own machine. That is safe for a loopback-only
 * desktop; it is DANGEROUS on a shared or multi-tenant host, where fail-open auth
 * would hand every mutating route to any reachable caller and expose a shared
 * database with no credential check.
 *
 * This guard refuses to start in exactly that dangerous combination and ONLY
 * that one: solo mode enabled AND (the server binds a non-loopback address, i.e.
 * it is reachable off the machine, OR a remote/shared multi-tenant database is
 * configured). A loopback desktop with no cloud DB — the sanctioned solo shape —
 * still boots untouched, and a cloud deploy (solo mode OFF) is never affected.
 *
 * Pure + side-effect free so it is trivially unit-testable; `loadConfig` calls
 * `assertSoloModeSafe` after building the config so an unsafe combination fails
 * fast at boot with a clear fatal error instead of silently exposing the host.
 */

/** The inputs the guard reasons over (a narrow slice of the built `AppConfig`). */
export interface SoloModeGuardInput {
  /** Whether `RECODER_SOLO_MODE` resolved to on (`AppConfig.runtime.soloMode`). */
  readonly soloMode: boolean;
  /** The address the HTTP server binds (`AppConfig.server.host`). */
  readonly host: string;
  /** The primary control-plane DB URL, if configured (`AppConfig.database.url`). */
  readonly databaseUrl?: string | null;
  /** The Better Auth DB URL, if configured (`AppConfig.auth.authDatabaseUrl`). */
  readonly authDatabaseUrl?: string | null;
}

/** Exact loopback host names; `0.0.0.0`/`::` (all interfaces) are NOT loopback. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '::1',
  '::ffff:127.0.0.1',
  '0:0:0:0:0:0:0:1',
]);

/**
 * Is `host` a loopback address (only reachable from the same machine)? The IPv4
 * loopback block is the whole `127.0.0.0/8`, so any `127.*` host counts. The
 * unspecified address `0.0.0.0` / `::` binds ALL interfaces and is explicitly
 * NOT loopback — it is the reachable-off-the-box case this guard blocks.
 */
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (h.length === 0) return false;
  if (h.startsWith('127.')) return true;
  return LOOPBACK_HOSTS.has(h);
}

/**
 * Does this DB URL point at a remote/shared database server (i.e. a plausibly
 * multi-tenant DB)? A `sqlite`/`file:` URL is a single local file and a loopback
 * host is single-machine — both are single-tenant. Any other real network host
 * is treated as shared/multi-tenant. An absent URL is not a DB at all.
 */
export function isMultiTenantDbUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lowered = url.toLowerCase();
  if (lowered.startsWith('sqlite') || lowered.startsWith('file:')) return false;
  if (
    lowered.includes('127.0.0.1') ||
    lowered.includes('localhost') ||
    lowered.includes('[::1]') ||
    lowered.includes('@::1') ||
    lowered.includes('/::1')
  ) {
    return false;
  }
  return true;
}

/**
 * Return every reason the solo-mode configuration is unsafe (empty ⇒ safe). A
 * no-op unless solo mode is enabled, so cloud deploys are never affected.
 */
export function soloModeGuardErrors(input: SoloModeGuardInput): string[] {
  if (!input.soloMode) return [];
  const errors: string[] = [];

  if (!isLoopbackHost(input.host)) {
    errors.push(
      `RECODER_SOLO_MODE fails auth open on mutating routes but the server binds a non-loopback address ` +
        `(HOST=${input.host}); it would be reachable off this machine with no auth. ` +
        `Solo mode is desktop-only — bind 127.0.0.1, or unset RECODER_SOLO_MODE and run with real auth.`,
    );
  }
  if (isMultiTenantDbUrl(input.databaseUrl)) {
    errors.push(
      `RECODER_SOLO_MODE fails auth open but DATABASE_URL points at a remote/shared (multi-tenant) database; ` +
        `fail-open auth would expose it. Unset RECODER_SOLO_MODE and run with real auth.`,
    );
  }
  if (isMultiTenantDbUrl(input.authDatabaseUrl)) {
    errors.push(
      `RECODER_SOLO_MODE fails auth open but AUTH_DATABASE_URL points at a remote/shared (multi-tenant) database; ` +
        `fail-open auth would expose it. Unset RECODER_SOLO_MODE and run with real auth.`,
    );
  }
  return errors;
}

/**
 * Throw a single aggregated fatal error if solo mode is configured on a
 * genuinely-dangerous host; otherwise return quietly. Called from `loadConfig`.
 */
export function assertSoloModeSafe(input: SoloModeGuardInput): void {
  const errors = soloModeGuardErrors(input);
  if (errors.length > 0) {
    throw new Error(
      `Unsafe RECODER_SOLO_MODE configuration — refusing to start:\n${errors
        .map((e) => `  - ${e}`)
        .join('\n')}`,
    );
  }
}
