import { describe, expect, it } from 'vitest';
import { TMUX_BIN, TMUX_IS_VENDORED, tmuxBinFile, tmuxCommand } from '../src/utils/tmuxBin.js';

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
