/**
 * dev-mint-conductor-key.ts
 *
 * Mints a DEV-ONLY platform API key (sk_...) with the scopes the desktop
 * cockpit's conductor surface needs. The sk_ key store moved from the legacy
 * filesystem `public-api/api-keys` (data/api-keys.json) into the identity
 * domain's DB-backed service (`identity.platform_api_key`, migration
 * 0003_identity_keys.sql), so this script now mints through the same
 * `ApiKeyService` + `PgApiKeyStore` path the running server validates against.
 *
 * Requires:
 *  - API_KEY_HASH_SALT — the same fixed dev salt the server is booted with
 *    (the pepper is mixed into the stored hash, so a different salt makes the
 *    minted key unverifiable).
 *  - DATABASE_URL — the same Postgres the server uses (backend/.env is loaded,
 *    matching src/server.ts's `dotenv/config`). No DB → truthful failure, never
 *    a fake key.
 *
 * The plaintext key is printed exactly once on stdout (last line) so the
 * harness (scripts/dev-conductor.sh) can capture it — the key is NEVER
 * committed. Logs are silenced by default so stdout stays JSON-only; set
 * LOG_LEVEL explicitly to see them (they go through pino as usual).
 *
 * Usage: API_KEY_HASH_SALT=<salt> DATABASE_URL=<pg-url> tsx scripts/dev-mint-conductor-key.ts
 * Output (stdout): a single JSON line { apiKey, userId, keyId, scopes, reusedExistingCount }
 */

import { resolve as pathResolve } from 'node:path';

const DEV_KEY_NAME = 'dev-conductor-cockpit';

// Scopes the conductor + cockpit need. `admin` alone is sufficient (it implies
// all scopes in hasScope/hasAnyScope), but we request the explicit set too so
// the key is self-describing and works even if admin handling changes.
const CONDUCTOR_SCOPES: readonly string[] = [
  'admin',
  'projects:read',
  'projects:write',
  'execute:commands',
  'files:read',
  'files:write',
  'sandboxes:read',
  'sandboxes:write',
];

function fail(message: string): never {
  process.stderr.write(`[dev-mint-conductor-key] ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  // Match the server entrypoint: backend/.env is the shared env source, so the
  // mint lands in the same database the booted server validates against.
  await import('dotenv/config');

  // Keep stdout JSON-only for the harness (`tail -n 1` contract): the pino root
  // logger reads LOG_LEVEL at import time, so default it to silent BEFORE any
  // src module is imported. An explicit LOG_LEVEL still wins.
  if (!process.env.LOG_LEVEL) {
    process.env.LOG_LEVEL = 'silent';
  }

  if (!process.env.API_KEY_HASH_SALT) {
    fail('API_KEY_HASH_SALT must be set (the harness sets a fixed dev salt).');
  }
  // DATABASE_URL is no longer required: with a DB we mint into Postgres; WITHOUT
  // one (the embedded/desktop backend) we mint into the SAME durable filesystem
  // store the server validates against (API_KEY_STORE_PATH ?? data/api-keys.json),
  // so a DB-less desktop can run fail-closed.

  // Dynamic imports keep the LOG_LEVEL default above effective (static imports
  // would hoist past it and lock the pino level to 'info').
  const [
    { loadConfig },
    { childLogger },
    { PersistenceComposer },
    { PgApiKeyStore },
    { FilesystemApiKeyStore },
    { createApiKeyService },
    { sliceIdentityConfig },
  ] = await Promise.all([
    import('../src/bootstrap/config.js'),
    import('../src/shared/logger.js'),
    import('../src/domains/persistence/persistence-module.js'),
    import('../src/domains/identity/repositories/api-key.repository.js'),
    import('../src/domains/identity/repositories/filesystem-api-key.repository.js'),
    import('../src/domains/identity/api-key.service.js'),
    import('../src/domains/identity/config.js'),
  ]);

  const config = loadConfig(process.env);
  const log = childLogger('dev-mint-conductor-key');
  const persistence = new PersistenceComposer(config, log);

  try {
    // Idempotent + safe on an already-migrated dev database: the same runner
    // the server boot uses (identity.platform_api_key ships in
    // 0003_identity_keys.sql). Same degrade policy as bootstrap: a migration
    // failure is warned, not fatal — if the identity table is genuinely
    // missing, the mint below fails truthfully instead.
    const report = await persistence.migrate();
    if (!report.ok) {
      process.stderr.write(
        `[dev-mint-conductor-key] WARNING: migrations incomplete (${report.error ?? 'unknown error'}) — continuing against the existing schema\n`,
      );
    }

    const identityCfg = sliceIdentityConfig(config);
    // Same selection as the server bootstrap: Postgres when a pool is connectable,
    // else the durable filesystem store at the shared path — so mint + validate
    // agree on where DB-less desktop keys live.
    const store = persistence.executor().isAvailable()
      ? new PgApiKeyStore(persistence.executor(), log)
      : new FilesystemApiKeyStore({
          logger: log,
          filePath: process.env.API_KEY_STORE_PATH ?? pathResolve(process.cwd(), 'data', 'api-keys.json'),
        });
    if (!store.isAvailable()) {
      fail('key store unavailable (no key was minted).');
    }

    const service = createApiKeyService({
      store,
      logger: log,
      hashSalt: process.env.API_KEY_HASH_SALT ?? null,
      isAvailable: () => store.isAvailable(),
      prefixLength: identityCfg.apiKeyPrefixLength,
      defaultTtlDays: identityCfg.apiKeyDefaultTtlDays,
    });

    const userId = process.env.DEV_CONDUCTOR_USER_ID || 'dev-conductor-user';

    // The plaintext of prior keys is unrecoverable (only the peppered hash is
    // stored), so we always mint a fresh key and report how many earlier dev
    // keys exist — same contract as the legacy filesystem-store script.
    const existing = (await service.list(userId)).filter(
      (k) => k.name === DEV_KEY_NAME && !k.revokedAt,
    );

    const minted = await service.mint({
      userId,
      name: DEV_KEY_NAME,
      scopes: CONDUCTOR_SCOPES,
      // Trusted operator bootstrap: a human running this dev/desktop mint
      // explicitly authorizes these scopes (incl. the privileged `admin` the
      // conductor surface needs). This is NOT the untrusted request path — the
      // granter must carry every requested scope, so pass the same set. Without
      // it, `resolveGrantableScopes` refuses `admin` (fail-closed) and the mint
      // throws, so a DB-less desktop could never mint its conductor key.
      granterScopes: CONDUCTOR_SCOPES,
    });

    process.stdout.write(
      JSON.stringify({
        apiKey: minted.rawKey,
        userId,
        keyId: minted.record.id,
        scopes: minted.record.scopes,
        reusedExistingCount: existing.length,
      }) + '\n',
    );
  } finally {
    await persistence.stop();
  }
}

void main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
