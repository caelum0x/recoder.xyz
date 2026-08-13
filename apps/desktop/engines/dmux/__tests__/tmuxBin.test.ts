import { afterEach, describe, expect, it } from 'vitest';
import { TMUX_BIN, TMUX_IS_VENDORED, resolveTmuxBin, tmuxBinFile, tmuxCommand } from '../src/utils/tmuxBin.js';

describe('tmuxBin resolver', () => {
  it('exposes a resolved binary that tmuxBinFile() returns verbatim', () => {
    expect(typeof TMUX_BIN).toBe('string');
    expect(TMUX_BIN.length).toBeGreaterThan(0);
    expect(tmuxBinFile()).toBe(TMUX_BIN);
  });

  it('TMUX_IS_VENDORED is true exactly when the binary is not bare "tmux"', () => {
    expect(TMUX_IS_VENDORED).toBe(TMUX_BIN !== 'tmux');
  });

  it('tmuxCommand leaves commands unchanged when tmux is system PATH', () => {
    if (TMUX_BIN !== 'tmux') {
      // Not applicable when a pinned binary is resolved in this environment.
      expect(TMUX_IS_VENDORED).toBe(true);
      return;
    }
    expect(tmuxCommand('tmux list-panes')).toBe('tmux list-panes');
  });

  it('tmuxCommand rewrites only leading/separated tmux tokens, not embedded substrings', () => {
    const out = tmuxCommand("tmux send-keys -t '%1' 'tmux is my favorite' Enter");
    // The argument literal "tmux is my favorite" must NOT be rewritten.
    expect(out).toContain("'tmux is my favorite'");
    if (TMUX_BIN !== 'tmux') {
      // The command word was rewritten to the resolved binary.
      expect(out.startsWith(TMUX_BIN) || out.startsWith(`'${TMUX_BIN}'`)).toBe(true);
      // Exactly one rewrite of the leading command word.
      expect(out.indexOf('send-keys')).toBeGreaterThan(0);
    }
  });

  it('tmuxCommand rewrites every tmux in a chained command', () => {
    const out = tmuxCommand('tmux set-option a on \\; tmux set-option b on');
    if (TMUX_BIN === 'tmux') {
      expect(out).toBe('tmux set-option a on \\; tmux set-option b on');
    } else {
      // Both command words rewritten; the chain separator preserved.
      expect(out).toContain('\\;');
      expect(out.match(/set-option/g)?.length).toBe(2);
      // No bare "tmux " command word should remain at a command boundary.
      expect(/(^|[\n;&|(]\s*)tmux(?=\s)/.test(out)).toBe(false);
    }
  });
});

describe('resolveTmuxBin resolution contract (backend parity)', () => {
  const saved = {
    DMUX_TMUX_BIN: process.env.DMUX_TMUX_BIN,
    CONDUCTOR_TMUX_BIN: process.env.CONDUCTOR_TMUX_BIN,
  };

  afterEach(() => {
    for (const key of Object.keys(saved) as (keyof typeof saved)[]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('honors CONDUCTOR_TMUX_BIN unconditionally, matching backend/src/domains/engines/tmux-path.ts', () => {
    // The Conductor may pin a binary that is not present on THIS host at import time
    // (e.g. a container path). dmux must still return it verbatim so both halves target
    // the same tmux server, exactly like the backend's unconditional read.
    delete process.env.DMUX_TMUX_BIN;
    process.env.CONDUCTOR_TMUX_BIN = '/nonexistent/pinned/tmux';
    expect(resolveTmuxBin()).toBe('/nonexistent/pinned/tmux');
  });

  it('prefers the dmux-only DMUX_TMUX_BIN console override over CONDUCTOR_TMUX_BIN', () => {
    process.env.DMUX_TMUX_BIN = '/opt/dmux/tmux';
    process.env.CONDUCTOR_TMUX_BIN = '/opt/conductor/tmux';
    expect(resolveTmuxBin()).toBe('/opt/dmux/tmux');
  });

  it('falls through to vendored/system resolution when no override is set', () => {
    delete process.env.DMUX_TMUX_BIN;
    delete process.env.CONDUCTOR_TMUX_BIN;
    const resolved = resolveTmuxBin();
    expect(typeof resolved).toBe('string');
    expect(resolved.length).toBeGreaterThan(0);
    // No override present, so it never returns a leftover override value.
    expect(resolved).not.toBe('/nonexistent/pinned/tmux');
  });
});
