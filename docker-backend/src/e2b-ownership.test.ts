/**
 * E2B sandbox ownership (recoder-5kyy) — the IDOR fix: a caller may only
 * exec/run/kill against a sandbox they own. Ownership is stamped as sandbox
 * metadata at create and asserted before connecting to a caller-supplied id.
 *
 * Drives the real e2b-client against an INJECTED fake E2B SDK module (no
 * network, no E2B_API_KEY) so the guard logic is proven deterministically.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  e2bExec,
  e2bKill,
  E2bOwnershipError,
  OWNER_METADATA_KEY,
  __setE2BModuleForTest,
} from './e2b-client';

interface FakeSandbox {
  sandboxId: string;
  metadata?: Record<string, string>;
}

function makeFakeE2B(existing: FakeSandbox[]) {
  const created: Array<{ metadata?: Record<string, string> }> = [];
  const killed: string[] = [];
  let counter = 0;

  class Sandbox {
    sandboxId: string;
    constructor(id: string) { this.sandboxId = id; }
    static async create(opts: { metadata?: Record<string, string> }) {
      counter += 1;
      const id = `sbx_new_${counter}`;
      created.push({ metadata: opts.metadata });
      existing.push({ sandboxId: id, metadata: opts.metadata });
      return new Sandbox(id);
    }
    static async connect(id: string) {
      return new Sandbox(id);
    }
    static async list() {
      return existing.map((s) => ({ sandboxId: s.sandboxId, metadata: s.metadata ?? {} }));
    }
    commands = {
      run: async () => ({ stdout: 'ok', stderr: '', exitCode: 0 }),
    };
    files = { write: async () => {} };
    async kill() { killed.push(this.sandboxId); return true; }
  }

  return { module: { Sandbox } as never, created, killed };
}

beforeEach(() => {
  vi.stubEnv('E2B_API_KEY', 'e2b_test_key');
});

afterEach(() => {
  vi.unstubAllEnvs();
  __setE2BModuleForTest(undefined);
});

describe('E2B ownership on caller-supplied sandboxId', () => {
  it('stamps the owner id in sandbox metadata at create', async () => {
    const fake = makeFakeE2B([]);
    __setE2BModuleForTest(fake.module);
    await e2bExec({ command: 'echo hi', userId: 'user-a' });
    expect(fake.created[0]?.metadata?.[OWNER_METADATA_KEY]).toBe('user-a');
  });

  it('lets the owner exec against their own sandbox', async () => {
    const fake = makeFakeE2B([{ sandboxId: 'sbx_owned', metadata: { [OWNER_METADATA_KEY]: 'user-a' } }]);
    __setE2BModuleForTest(fake.module);
    const result = await e2bExec({ command: 'echo hi', sandboxId: 'sbx_owned', userId: 'user-a' });
    expect(result.exitCode).toBe(0);
  });

  it("rejects exec against another user's sandbox with E2bOwnershipError", async () => {
    const fake = makeFakeE2B([{ sandboxId: 'sbx_a', metadata: { [OWNER_METADATA_KEY]: 'user-a' } }]);
    __setE2BModuleForTest(fake.module);
    await expect(
      e2bExec({ command: 'echo hi', sandboxId: 'sbx_a', userId: 'user-b' }),
    ).rejects.toBeInstanceOf(E2bOwnershipError);
  });

  it("rejects kill of another user's sandbox and never calls kill", async () => {
    const fake = makeFakeE2B([{ sandboxId: 'sbx_a', metadata: { [OWNER_METADATA_KEY]: 'user-a' } }]);
    __setE2BModuleForTest(fake.module);
    await expect(e2bKill('sbx_a', 'user-b')).rejects.toBeInstanceOf(E2bOwnershipError);
    expect(fake.killed).not.toContain('sbx_a');
  });

  it('lets the owner kill their own sandbox', async () => {
    const fake = makeFakeE2B([{ sandboxId: 'sbx_a', metadata: { [OWNER_METADATA_KEY]: 'user-a' } }]);
    __setE2BModuleForTest(fake.module);
    const ok = await e2bKill('sbx_a', 'user-a');
    expect(ok).toBe(true);
    expect(fake.killed).toContain('sbx_a');
  });

  it('an unowned sandbox (no owner metadata) is refused to a specific caller (fail closed)', async () => {
    const fake = makeFakeE2B([{ sandboxId: 'sbx_legacy', metadata: {} }]);
    __setE2BModuleForTest(fake.module);
    await expect(
      e2bExec({ command: 'echo hi', sandboxId: 'sbx_legacy', userId: 'user-a' }),
    ).rejects.toBeInstanceOf(E2bOwnershipError);
  });

  it('no caller identity (internal/unauthenticated) skips the check (back-compat)', async () => {
    const fake = makeFakeE2B([{ sandboxId: 'sbx_a', metadata: { [OWNER_METADATA_KEY]: 'user-a' } }]);
    __setE2BModuleForTest(fake.module);
    const result = await e2bExec({ command: 'echo hi', sandboxId: 'sbx_a' });
    expect(result.exitCode).toBe(0);
  });
});
