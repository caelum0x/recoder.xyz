/**
 * Security regression: the `recoder.workflow.verify` verification exec must run
 * with a MINIMAL env overlay (PATH/HOME only) — NEVER the full `process.env` —
 * so an executed command cannot exfiltrate backend secrets. Mirrors the
 * PATH-only guard the sibling `runCli` (cli-exec.ts) enforces.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createEnginesVerifyExec, confineRepoRoot } from './capability-binders';

describe('createEnginesVerifyExec — minimal env overlay', () => {
  afterEach(() => {
    delete process.env.RECODER_FAKE_SECRET;
  });

  it('does not leak arbitrary process.env secrets into the spawned command', async () => {
    process.env.RECODER_FAKE_SECRET = 'super-secret-value-do-not-leak';
    const exec = createEnginesVerifyExec(process.cwd());

    const res = await exec(
      'echo "SECRET=[$RECODER_FAKE_SECRET] PATH_PRESENT=${PATH:+yes}"',
    );

    expect(res.exitCode).toBe(0);
    // The backend secret is NOT present in the child environment.
    expect(res.stdout).toContain('SECRET=[]');
    expect(res.stdout).not.toContain('super-secret-value-do-not-leak');
    // PATH still resolves bare binaries.
    expect(res.stdout).toContain('PATH_PRESENT=yes');
  });

  it('surfaces a non-zero exit truthfully without throwing', async () => {
    const exec = createEnginesVerifyExec(process.cwd());
    const res = await exec('exit 7');
    expect(res.exitCode).toBe(7);
  });
});

describe('confineRepoRoot — git_nexus path confinement (recoder-wi8e)', () => {
  const ROOT = '/srv/repo';

  it('returns the root when no repo is requested', () => {
    expect(confineRepoRoot(ROOT, undefined)).toBe(ROOT);
    expect(confineRepoRoot(ROOT, '')).toBe(ROOT);
  });

  it('allows a subpath INSIDE the root', () => {
    expect(confineRepoRoot(ROOT, 'packages/app')).toBe('/srv/repo/packages/app');
    expect(confineRepoRoot(ROOT, '/srv/repo/sub')).toBe('/srv/repo/sub'); // absolute-but-inside
  });

  it('REJECTS an absolute path outside the root', () => {
    expect(() => confineRepoRoot(ROOT, '/etc')).toThrow(/escapes the allowed root/);
    expect(() => confineRepoRoot(ROOT, '/home/other/secrets')).toThrow(/escapes/);
  });

  it('REJECTS a ../ traversal that escapes the root', () => {
    expect(() => confineRepoRoot(ROOT, '../../etc/passwd')).toThrow(/escapes/);
  });

  it('requires a configured root to confine a caller-supplied repo', () => {
    expect(() => confineRepoRoot(null, '/etc')).toThrow(/requires a configured repoRoot/);
    expect(() => confineRepoRoot(null, undefined)).toThrow(/unconfigured/);
  });
});
