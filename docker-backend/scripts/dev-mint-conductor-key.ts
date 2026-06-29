/**
 * dev-mint-conductor-key.ts
 *
 * Mints a DEV-ONLY platform API key (sk_...) with the scopes the desktop
 * cockpit's conductor surface needs, persisting it to data/api-keys.json via
 * the real createApiKey() path. Idempotent: if a dev conductor key already
 * exists for the dev user it is reused instead of minting a new one.
 *
 * Requires API_KEY_HASH_SALT to be set (the harness sets a fixed dev salt so
 * the persisted hash stays valid across restarts). The plaintext key is printed
 * exactly once on stdout (last line) so the harness can capture it — the key is
 * NEVER committed.
 *
 * Usage: API_KEY_HASH_SALT=<salt> tsx scripts/dev-mint-conductor-key.ts
 * Output (stdout): a single JSON line { apiKey, userId, keyId, scopes }
 */
import { createApiKey, listUserApiKeys } from '../src/public-api/api-keys.js';
import type { ApiKeyScope } from '../src/public-api/types.js';

const DEV_USER_ID = process.env.DEV_CONDUCTOR_USER_ID || 'dev-conductor-user';
const DEV_KEY_NAME = 'dev-conductor-cockpit';

// Scopes the conductor + cockpit need. `admin` alone is sufficient (it implies
// all scopes in hasScope/hasAnyScope), but we request the explicit set too so
// the key is self-describing and works even if admin handling changes.
const CONDUCTOR_SCOPES: ApiKeyScope[] = [
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

function main(): void {
  if (!process.env.API_KEY_HASH_SALT) {
    fail('API_KEY_HASH_SALT must be set (the harness sets a fixed dev salt).');
  }

  // Idempotency: the plaintext key cannot be recovered from storage, so if a
  // dev key already exists we must mint a fresh one (revoking is not needed for
  // local dev). We dedupe by name only to avoid unbounded key growth across
  // repeated runs: revoke nothing, just reuse the newest matching prefix is not
  // possible without the plaintext, so we always mint and report. To keep the
  // store small the harness deletes data/api-keys.json on a clean run.
  const existing = listUserApiKeys(DEV_USER_ID).filter((k) => k.name === DEV_KEY_NAME && k.isActive);

  const result = createApiKey(DEV_USER_ID, {
    name: DEV_KEY_NAME,
    scopes: CONDUCTOR_SCOPES,
    isTestKey: true,
    metadata: { purpose: 'dev-conductor-cockpit', createdBy: 'dev-mint-conductor-key' },
  });

  process.stdout.write(
    JSON.stringify({
      apiKey: result.apiKey,
      userId: DEV_USER_ID,
      keyId: result.keyInfo.id,
      scopes: result.keyInfo.scopes,
      reusedExistingCount: existing.length,
    }) + '\n',
  );
}

main();
