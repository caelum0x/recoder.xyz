/**
 * Regression tests for scripts/dev-mint-conductor-key.ts.
 *
 * The script used to import the absorbed legacy module
 * `../src/public-api/api-keys.js` and crashed with MODULE_NOT_FOUND before
 * printing anything. It now mints through the identity domain's DB-backed
 * `ApiKeyService` (`identity.platform_api_key`). These tests spawn the real
 * script (via tsx) and assert:
 *  - imports resolve (no MODULE_NOT_FOUND) and the guards fail truthfully,
 *  - missing API_KEY_HASH_SALT / DATABASE_URL each produce a clear stderr
 *    message and a non-zero exit — never a fake key,
 *  - (gated on MINT_TEST_DATABASE_URL) a real mint prints a single JSON line
 *    whose apiKey starts with `sk_`.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const BACKEND_ROOT = path.resolve(__dirname, '..');
const TSX_BIN = path.join(BACKEND_ROOT, 'node_modules', '.bin', 'tsx');
const SCRIPT = path.join(BACKEND_ROOT, 'scripts', 'dev-mint-conductor-key.ts');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run the script with a controlled env from a temp cwd so backend/.env (loaded
 * via dotenv relative to cwd) cannot leak salt/db values into the assertion.
 */
async function runScript(env: Record<string, string>): Promise<RunResult> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'mint-test-'));
  try {
    const { stdout, stderr } = await execFileAsync(TSX_BIN, [SCRIPT], {
      cwd,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
      timeout: 25_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error: unknown) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('scripts/dev-mint-conductor-key.ts', () => {
  it('imports resolve — no MODULE_NOT_FOUND from the absorbed public-api path', async () => {
    const result = await runScript({});
    expect(result.stderr).not.toContain('MODULE_NOT_FOUND');
    expect(result.stderr).not.toContain('public-api/api-keys');
    expect(result.code).not.toBe(0);
  });

  it('fails truthfully without API_KEY_HASH_SALT', async () => {
    const result = await runScript({});
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('API_KEY_HASH_SALT must be set');
    expect(result.stdout).not.toContain('sk_');
  });

  it('mints into the filesystem store when there is no DATABASE_URL (DB-less desktop)', async () => {
    const keyPath = path.join(mkdtempSync(path.join(os.tmpdir(), 'mint-fs-')), 'api-keys.json');
    const result = await runScript({ API_KEY_HASH_SALT: 'test-salt', API_KEY_STORE_PATH: keyPath });
    expect(result.code).toBe(0);
    const lastLine = result.stdout.trim().split('\n').at(-1) ?? '';
    const parsed = JSON.parse(lastLine) as { apiKey?: string };
    expect(parsed.apiKey).toMatch(/^sk_/);
    // The store persists ONLY the hashed key — never the raw sk_ value.
    const stored = readFileSync(keyPath, 'utf8');
    expect(stored).toContain('keyHash');
    expect(stored).not.toContain(parsed.apiKey as string);
  });

  it.skipIf(!process.env.MINT_TEST_DATABASE_URL)(
    'mints a real sk_ key as the last stdout line when a database is provided',
    async () => {
      const result = await runScript({
        API_KEY_HASH_SALT: 'test-salt',
        DATABASE_URL: process.env.MINT_TEST_DATABASE_URL as string,
      });
      expect(result.code).toBe(0);
      const lastLine = result.stdout.trim().split('\n').at(-1) ?? '';
      const parsed = JSON.parse(lastLine) as { apiKey?: string; keyId?: string; scopes?: string[] };
      expect(parsed.apiKey).toMatch(/^sk_/);
      expect(parsed.keyId).toBeTruthy();
      expect(parsed.scopes).toContain('admin');
    },
  );
});
