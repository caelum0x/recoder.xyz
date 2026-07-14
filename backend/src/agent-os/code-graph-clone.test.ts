import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  createAuthenticatedClone,
  isCodeGraphEnabled,
  parseRepoInput,
  GIT_TOKEN_USERNAME,
  type CloneSpawn,
  type CloneSpawnResult,
} from './code-graph-clone';

const SECRET = 'ghp_SUPERSECRETTOKEN1234567890';

function recordingSpawn(result: Partial<CloneSpawnResult> = {}): {
  spawn: CloneSpawn;
  calls: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string }>;
} {
  const calls: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string }> = [];
  const spawn: CloneSpawn = async (command, args, opts) => {
    calls.push({ command, args, env: opts.env, cwd: opts.cwd });
    return { stdout: '', stderr: '', code: 0, ...result };
  };
  return { spawn, calls };
}

describe('parseRepoInput', () => {
  it('resolves owner/name to a clean https URL + path-safe repoId', () => {
    const parsed = parseRepoInput('Recoder/awesome-repo');
    expect(parsed.cloneUrl).toBe('https://github.com/Recoder/awesome-repo.git');
    expect(parsed.fullName).toBe('Recoder/awesome-repo');
    expect(parsed.repoId).toBe('recoder__awesome-repo');
    expect(parsed.repoId).not.toContain('/');
  });

  it('accepts a clean clone URL and extracts owner/name', () => {
    const parsed = parseRepoInput('https://github.com/acme/widgets.git');
    expect(parsed.cloneUrl).toBe('https://github.com/acme/widgets.git');
    expect(parsed.fullName).toBe('acme/widgets');
  });

  it('rejects a clone URL that embeds credentials (no token-in-url)', () => {
    expect(() => parseRepoInput(`https://x-access-token:${SECRET}@github.com/acme/secret.git`)).toThrow(
      /credentials/i,
    );
  });

  it('rejects garbage input', () => {
    expect(() => parseRepoInput('not a repo at all')).toThrow();
  });
});

describe('isCodeGraphEnabled', () => {
  it('is OFF by default and ON only for truthy env', () => {
    const prev = process.env.RECODER_CODE_GRAPH_ENABLED;
    delete process.env.RECODER_CODE_GRAPH_ENABLED;
    expect(isCodeGraphEnabled()).toBe(false);
    process.env.RECODER_CODE_GRAPH_ENABLED = 'true';
    expect(isCodeGraphEnabled()).toBe(true);
    process.env.RECODER_CODE_GRAPH_ENABLED = 'off';
    expect(isCodeGraphEnabled()).toBe(false);
    if (prev === undefined) delete process.env.RECODER_CODE_GRAPH_ENABLED;
    else process.env.RECODER_CODE_GRAPH_ENABLED = prev;
  });
});

describe('createAuthenticatedClone — token safety', () => {
  it('NEVER puts the token in argv or the clone URL (private repo)', async () => {
    const { spawn, calls } = recordingSpawn();
    const clone = createAuthenticatedClone(spawn);

    await clone({
      cloneUrl: 'https://github.com/acme/private.git',
      dest: '/tmp/recoder-test-dest/private',
      token: SECRET,
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.command).toBe('git');

    // The token must not appear anywhere in argv.
    const argvString = call.args.join(' ');
    expect(argvString).not.toContain(SECRET);
    // The clone URL passed to git is the clean URL (no token, no userinfo).
    expect(call.args).toContain('https://github.com/acme/private.git');
    expect(argvString).not.toContain('@github.com');

    // The token is supplied to git ONLY via ENV through a GIT_ASKPASS helper.
    expect(call.env.GIT_ASKPASS).toBeTruthy();
    expect(call.env.RECODER_GH_TOKEN).toBe(SECRET);
    expect(call.env.RECODER_GH_USER).toBe(GIT_TOKEN_USERNAME);
    expect(call.env.GIT_TERMINAL_PROMPT).toBe('0');
  });

  it('removes the transient GIT_ASKPASS helper after the clone', async () => {
    const { spawn, calls } = recordingSpawn();
    const clone = createAuthenticatedClone(spawn);
    await clone({ cloneUrl: 'https://github.com/acme/private.git', dest: '/tmp/recoder-test-dest/p2', token: SECRET });
    const askpass = calls[0].env.GIT_ASKPASS as string;
    expect(askpass).toBeTruthy();
    expect(existsSync(askpass)).toBe(false);
  });

  it('does not set any token env for a public (token-less) clone', async () => {
    const { spawn, calls } = recordingSpawn();
    const clone = createAuthenticatedClone(spawn);
    await clone({ cloneUrl: 'https://github.com/acme/public.git', dest: '/tmp/recoder-test-dest/pub', token: null });
    expect(calls[0].env.GIT_ASKPASS).toBeUndefined();
    expect(calls[0].env.RECODER_GH_TOKEN).toBeUndefined();
    expect(calls[0].env.GIT_TERMINAL_PROMPT).toBe('0');
  });

  it('redacts the token from a failing clone error message', async () => {
    const { spawn } = recordingSpawn({ code: 128, stderr: `fatal: auth with ${SECRET} failed` });
    const clone = createAuthenticatedClone(spawn);
    await expect(
      clone({ cloneUrl: 'https://github.com/acme/private.git', dest: '/tmp/recoder-test-dest/fail', token: SECRET }),
    ).rejects.toThrow(/git clone failed/);
    await clone({
      cloneUrl: 'https://github.com/acme/private.git',
      dest: '/tmp/recoder-test-dest/fail2',
      token: SECRET,
    }).catch((error: Error) => {
      expect(error.message).not.toContain(SECRET);
    });
  });

  it('passes --branch when a ref is given, still token-free', async () => {
    const { spawn, calls } = recordingSpawn();
    const clone = createAuthenticatedClone(spawn);
    await clone({
      cloneUrl: 'https://github.com/acme/private.git',
      dest: '/tmp/recoder-test-dest/ref',
      ref: 'main',
      token: SECRET,
    });
    expect(calls[0].args).toContain('--branch');
    expect(calls[0].args).toContain('main');
    expect(calls[0].args.join(' ')).not.toContain(SECRET);
  });

  it('rejects a cloneUrl that embeds credentials', async () => {
    const { spawn } = recordingSpawn();
    const clone = createAuthenticatedClone(spawn);
    await expect(
      clone({
        cloneUrl: `https://x-access-token:${SECRET}@github.com/acme/x.git`,
        dest: '/tmp/recoder-test-dest/bad',
        token: SECRET,
      }),
    ).rejects.toThrow(/credentials/i);
  });
});
