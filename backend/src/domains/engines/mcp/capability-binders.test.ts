/**
 * Security regression: the `recoder.workflow.verify` verification exec must run
 * with a MINIMAL env overlay (PATH/HOME only) — NEVER the full `process.env` —
 * so an executed command cannot exfiltrate backend secrets. Mirrors the
 * PATH-only guard the sibling `runCli` (cli-exec.ts) enforces.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createEnginesVerifyExec } from './capability-binders';

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
