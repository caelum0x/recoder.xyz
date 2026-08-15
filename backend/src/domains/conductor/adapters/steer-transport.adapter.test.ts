/**
 * tmux steer-transport adapter — config-injected, fake-exec driven.
 *
 * Proves (no real tmux on the box): the session is probed BEFORE any keys are
 * sent and a gone session throws truthfully (no silent drop); the steer text is
 * sent LITERALLY (`send-keys -l --`) followed by a separate `Enter` when
 * `submit:true`; `submit:false` injects the text without submitting; the
 * INJECTED `tmuxBin` is used for every call (never process.env).
 */
import { describe, it, expect } from 'vitest';
import type { ExecOptions, ExecResult } from '@recoder/substrate';
import { createTmuxSteerTransport } from './steer-transport.adapter.js';
import type { ExecFn } from './tmux-substrate.adapter.js';

interface Recorded {
  bin: string;
  args: string[];
}

function makeExec(opts: {
  fail?: (bin: string, args: readonly string[]) => boolean;
} = {}): { exec: ExecFn; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const exec: ExecFn = async (bin, args, _options?: ExecOptions) => {
    calls.push({ bin, args: [...args] });
    if (opts.fail?.(bin, args)) throw new Error(`${bin} ${args.join(' ')} failed`);
    return { stdout: '', stderr: '', code: 0 } satisfies ExecResult;
  };
  return { exec, calls };
}

const CONFIG = { tmuxBin: null } as const;

describe('tmux steer-transport adapter', () => {
  it('sends the text literally then a separate Enter when submit:true', async () => {
    const { exec, calls } = makeExec();
    const transport = createTmuxSteerTransport({ config: CONFIG, exec });

    await transport.sendKeys({
      substrate: 'tmux_worktree',
      sessionName: 'recoder-ws_1',
      keys: '-try again',
      submit: true,
    });

    expect(calls[0]?.args).toEqual(['has-session', '-t', 'recoder-ws_1']);
    // Literal (-l) + option-terminated (--) so text is never a key name or flag.
    expect(calls[1]?.args).toEqual(['send-keys', '-t', 'recoder-ws_1', '-l', '--', '-try again']);
    expect(calls[2]?.args).toEqual(['send-keys', '-t', 'recoder-ws_1', 'Enter']);
  });

  it('submit:false injects the text without a trailing Enter', async () => {
    const { exec, calls } = makeExec();
    const transport = createTmuxSteerTransport({ config: CONFIG, exec });

    await transport.sendKeys({
      substrate: 'tmux_worktree',
      sessionName: 'recoder-ws_1',
      keys: 'partial',
      submit: false,
    });

    const sendCalls = calls.filter((c) => c.args[0] === 'send-keys');
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]?.args).toContain('partial');
  });

  it('throws truthfully when the session is gone — no keys are ever sent', async () => {
    const { exec, calls } = makeExec({ fail: (_bin, args) => args[0] === 'has-session' });
    const transport = createTmuxSteerTransport({ config: CONFIG, exec });

    await expect(
      transport.sendKeys({
        substrate: 'tmux_worktree',
        sessionName: 'recoder-ws_gone',
        keys: 'hello',
        submit: true,
      }),
    ).rejects.toThrow(/session not found/);
    expect(calls.some((c) => c.args[0] === 'send-keys')).toBe(false);
  });

  it('uses the INJECTED tmux binary for every call', async () => {
    const { exec, calls } = makeExec();
    const transport = createTmuxSteerTransport({
      config: { tmuxBin: '/opt/recoder/tmux' },
      exec,
    });

    await transport.sendKeys({
      substrate: 'tmux_worktree',
      sessionName: 'recoder-ws_1',
      keys: 'x',
      submit: true,
    });

    expect(calls.every((c) => c.bin === '/opt/recoder/tmux')).toBe(true);
  });
});
