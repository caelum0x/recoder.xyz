import assert from 'node:assert/strict';
import test from 'node:test';
import { getAuthEnv } from './keys';

/**
 * Save/restore the auth-relevant env vars around each case so tests never
 * leak state into one another (or into other test files in the same run).
 */
const AUTH_VARS = [
  'DOCKER',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'AUTH_DATABASE_URL',
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of AUTH_VARS) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const key of AUTH_VARS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test('getAuthEnv THROWS when DOCKER=1 and BETTER_AUTH_SECRET is unset (no fail-open empty secret)', () => {
  const snapshot = snapshotEnv();
  try {
    process.env.DOCKER = '1';
    delete process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_URL = 'https://recoder.xyz';
    process.env.AUTH_DATABASE_URL = 'postgres://user:pass@localhost:5432/auth';

    assert.throws(
      () => getAuthEnv(),
      /BETTER_AUTH_SECRET/,
      'getAuthEnv must fail fast when the signing secret is missing, even under DOCKER',
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test('getAuthEnv THROWS when DOCKER=1 and all required vars are unset', () => {
  const snapshot = snapshotEnv();
  try {
    process.env.DOCKER = 'true';
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.BETTER_AUTH_URL;
    delete process.env.AUTH_DATABASE_URL;

    assert.throws(() => getAuthEnv(), /Missing required environment variables/);
  } finally {
    restoreEnv(snapshot);
  }
});

test('getAuthEnv THROWS when DOCKER is unset and BETTER_AUTH_SECRET is missing', () => {
  const snapshot = snapshotEnv();
  try {
    delete process.env.DOCKER;
    delete process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_URL = 'https://recoder.xyz';
    process.env.AUTH_DATABASE_URL = 'postgres://user:pass@localhost:5432/auth';

    assert.throws(() => getAuthEnv(), /BETTER_AUTH_SECRET/);
  } finally {
    restoreEnv(snapshot);
  }
});

test('getAuthEnv returns the real values when all required vars are set (DOCKER=1)', () => {
  const snapshot = snapshotEnv();
  try {
    process.env.DOCKER = '1';
    process.env.BETTER_AUTH_SECRET = 'a-real-signing-secret';
    process.env.BETTER_AUTH_URL = 'https://recoder.xyz';
    process.env.AUTH_DATABASE_URL = 'postgres://user:pass@localhost:5432/auth';

    const env = getAuthEnv();
    assert.equal(env.BETTER_AUTH_SECRET, 'a-real-signing-secret');
    assert.equal(env.BETTER_AUTH_URL, 'https://recoder.xyz');
    assert.equal(env.AUTH_DATABASE_URL, 'postgres://user:pass@localhost:5432/auth');
    // Never a fail-open empty secret.
    assert.notEqual(env.BETTER_AUTH_SECRET, '');
  } finally {
    restoreEnv(snapshot);
  }
});

test('getAuthEnv returns the real values when all required vars are set (no DOCKER)', () => {
  const snapshot = snapshotEnv();
  try {
    delete process.env.DOCKER;
    process.env.BETTER_AUTH_SECRET = 'secret-2';
    process.env.BETTER_AUTH_URL = 'https://app.recoder.xyz';
    process.env.AUTH_DATABASE_URL = 'postgres://u:p@db:5432/a';

    const env = getAuthEnv();
    assert.equal(env.BETTER_AUTH_SECRET, 'secret-2');
    assert.equal(env.BETTER_AUTH_URL, 'https://app.recoder.xyz');
    assert.equal(env.AUTH_DATABASE_URL, 'postgres://u:p@db:5432/a');
  } finally {
    restoreEnv(snapshot);
  }
});
