import { describe, it, expect } from 'vitest';
import { createSshExecTransport, type SshProcessRunner } from './ssh-exec.js';
import type { SshExecResult } from '@recoder/substrate';

/** A recording fake runner — captures the argv it was called with. */
function fakeRunner(result: SshExecResult): { run: SshProcessRunner; calls: string[][] } {
  const calls: string[][] = [];
  const run: SshProcessRunner = async (argv) => {
    calls.push([...argv]);
    return result;
  };
  return { run, calls };
}

const OK: SshExecResult = { stdout: 'ok', stderr: '', exitCode: 0 };

describe('createSshExecTransport', () => {
  it('is not configured without RECODER_SSH_HOST (truthful gate)', () => {
    const { run } = fakeRunner(OK);
    const t = createSshExecTransport({ env: {}, run });
    expect(t.isConfigured()).toBe(false);
  });

  it('is configured when RECODER_SSH_HOST is set', () => {
    const { run } = fakeRunner(OK);
    const t = createSshExecTransport({ env: { RECODER_SSH_HOST: 'user@host' }, run });
    expect(t.isConfigured()).toBe(true);
  });

  it('shells ssh with BatchMode + ConnectTimeout + host + the command', async () => {
    const { run, calls } = fakeRunner(OK);
    const t = createSshExecTransport({ env: { RECODER_SSH_HOST: 'user@host' }, run });
    const res = await t.run('git status --porcelain');
    expect(res).toEqual(OK);
    const argv = calls[0];
    expect(argv[0]).toBe('ssh');
    expect(argv).toContain('BatchMode=yes');
    expect(argv.some((a) => a.startsWith('ConnectTimeout='))).toBe(true);
    expect(argv).toContain('user@host');
    // the remote command is the LAST argv element, passed verbatim as one arg
    expect(argv[argv.length - 1]).toBe('git status --porcelain');
  });

  it('prepends a quoted `cd <cwd> &&` when a cwd is given', async () => {
    const { run, calls } = fakeRunner(OK);
    const t = createSshExecTransport({ env: { RECODER_SSH_HOST: 'h' }, run });
    await t.run('ls', { cwd: '/srv/wt/amber otter' });
    const remote = calls[0][calls[0].length - 1];
    expect(remote).toBe(`cd '/srv/wt/amber otter' && ls`);
  });

  it('surfaces a non-zero remote exit code truthfully (not a fabricated 0)', async () => {
    const { run } = fakeRunner({ stdout: '', stderr: 'no such file', exitCode: 2 });
    const t = createSshExecTransport({ env: { RECODER_SSH_HOST: 'h' }, run });
    const res = await t.run('cat missing');
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain('no such file');
  });

  it('passes the caller timeout through to the runner (seconds → ms)', async () => {
    const seen: { timeoutMs: number }[] = [];
    const run: SshProcessRunner = async (_argv, opts) => {
      seen.push(opts);
      return OK;
    };
    const t = createSshExecTransport({ env: { RECODER_SSH_HOST: 'h' }, run });
    await t.run('echo', { timeoutSecs: 5 });
    expect(seen[0].timeoutMs).toBe(5000);
  });

  it('propagates a transport rejection (unreachable) instead of faking success', async () => {
    const run: SshProcessRunner = async () => {
      throw new Error('ssh transport failure (exit 255): connection failed');
    };
    const t = createSshExecTransport({ env: { RECODER_SSH_HOST: 'h' }, run });
    await expect(t.run('whoami')).rejects.toThrow(/transport failure/);
  });
});
