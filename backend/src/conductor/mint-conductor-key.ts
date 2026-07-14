/**
 * mint-conductor-key.ts
 *
 * Packaged-app variant of scripts/dev-mint-conductor-key.ts. It lives under
 * src/ so `tsc` compiles it to dist/conductor/mint-conductor-key.js, which the
 * desktop BackendSupervisor runs (with bundled node) when isPackaged is true.
 * The dev path still uses scripts/dev-mint-conductor-key.ts via tsx.
 *
 * Mints a platform API key (sk_...) with the scopes the desktop cockpit's
 * conductor surface needs, persisting it to <DATA_DIR>/api-keys.json via the
 * real createApiKey() path. Requires API_KEY_HASH_SALT to be set so the
 * persisted hash stays valid for the server spawned with the same salt.
 *
 * Output (stdout): a single JSON line { apiKey, userId, keyId, scopes } — the
 * plaintext key is printed exactly once so the supervisor can capture it. It is
 * NEVER committed.
 */
import { createApiKey, listUserApiKeys } from '../public-api/api-keys.js';
import type { ApiKeyScope } from '../public-api/types.js';

const DEV_USER_ID = process.env.DEV_CONDUCTOR_USER_ID || 'dev-conductor-user';
const KEY_NAME = 'desktop-conductor-cockpit';

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
  process.stderr.write(`[mint-conductor-key] ${message}\n`);
  process.exit(1);
}

function main(): void {
  if (!process.env.API_KEY_HASH_SALT) {
    fail('API_KEY_HASH_SALT must be set (the supervisor sets a per-install salt).');
  }

  const existing = listUserApiKeys(DEV_USER_ID).filter(
    (k) => k.name === KEY_NAME && k.isActive,
  );

  const result = createApiKey(DEV_USER_ID, {
    name: KEY_NAME,
    scopes: CONDUCTOR_SCOPES,
    isTestKey: true,
    metadata: { purpose: 'desktop-conductor-cockpit', createdBy: 'mint-conductor-key' },
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
