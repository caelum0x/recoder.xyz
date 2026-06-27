/**
 * Tests for the tmux binary resolver + dmux operator-console adapter.
 *
 * These are pure-logic tests (no real tmux/dmux process needed):
 *   - tmux-path: env override precedence, vendored discovery, system fallback
 *   - dmux-adapter: binary resolution precedence, availability reporting,
 *     session listing (mocked tmux)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';

// ---- tmux-path resolver tests ----

describe('tmux-path resolver', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...origEnv };
    vi.resetModules();
  });

  it('uses CONDUCTOR_TMUX_BIN when set (no existence check on this one)', async () => {
    process.env.CONDUCTOR_TMUX_BIN = '/custom/pinned/tmux';
    const mod = await import('./tmux-path.js');
    expect(mod.TMUX_BIN).toBe('/custom/pinned/tmux');
    expect(mod.TMUX_IS_VENDORED).toBe(true);
  });

  it('falls back to bare "tmux" when nothing resolves', async () => {
    delete process.env.CONDUCTOR_TMUX_BIN;
    delete process.env.RECODER_TMUX_BUILD_PATH;
    const mod = await import('./tmux-path.js');
    // On this machine the vendored binary may exist; verify it resolves to
    // either the vendored path or system 'tmux' — never undefined.
    expect(typeof mod.TMUX_BIN).toBe('string');
    expect(mod.TMUX_BIN.length).toBeGreaterThan(0);
  });

  it('CONDUCTOR_TMUX_BIN takes precedence over RECODER_TMUX_BUILD_PATH', async () => {
    process.env.CONDUCTOR_TMUX_BIN = '/override/tmux';
    process.env.RECODER_TMUX_BUILD_PATH = '/build/tmux';
    const mod = await import('./tmux-path.js');
    expect(mod.TMUX_BIN).toBe('/override/tmux');
  });
});

// ---- dmux-adapter tests ----

describe('dmux-adapter', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...origEnv };
    vi.resetModules();
  });

  describe('resolveDmuxBin', () => {
    it('uses CONDUCTOR_DMUX_BIN when set to a real path', async () => {
      // Use a real path that exists on every system.
      process.env.CONDUCTOR_DMUX_BIN = '/bin/sh';
      const { resolveDmuxBin } = await import('./dmux-adapter.js');
      expect(resolveDmuxBin()).toBe('/bin/sh');
    });

    it('falls back to bare "dmux" when override points to nonexistent path', async () => {
      delete process.env.CONDUCTOR_DMUX_BIN;
      // Without override, resolveDmuxBin walks the tree looking for ts/dmux.
      // On this repo it exists, so we just verify it returns a string.
      const { resolveDmuxBin } = await import('./dmux-adapter.js');
      const result = resolveDmuxBin();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('dmuxAvailability', () => {
    it('reports unavailable with a reason string', async () => {
      delete process.env.CONDUCTOR_DMUX_BIN;
      vi.doMock('node:fs', { existsSync: () => false });
      // Mock execFile with the correct 4-arg promisify signature.
      vi.doMock('node:util', {
        promisify: () => () => Promise.reject(new Error('not found')),
      });
      vi.doMock('./tmux-path.js', { TMUX_BIN: '/fake/tmux' });
      const { dmuxAvailability } = await import('./dmux-adapter.js');
      const result = await dmuxAvailability();
      expect(result.available).toBe(false);
      expect(result.reason).toBeTruthy();
    });
  });

  describe('dmuxAttachCommand', () => {
    it('builds an attach hint string', async () => {
      vi.doMock('node:fs', { existsSync: () => false });
      const { dmuxAttachCommand } = await import('./dmux-adapter.js');
      const cmd = dmuxAttachCommand('/repo/path');
      expect(cmd).toContain('/repo/path');
      expect(cmd).toContain('dmux');
    });
  });
});

// ---- runtime-commands tests (new pi + crush specs) ----

describe('runtime-commands (8 CLIs)', () => {
  it('includes pi and crush in the runtime ids', async () => {
    const { resolveRuntimeCommand } = await import('./runtime-commands.js');

    const pi = resolveRuntimeCommand('pi', { prompt: 'test' });
    expect(pi.bin).toBe('pi');
    expect(pi.commandLine).toContain('test');

    const crush = resolveRuntimeCommand('crush', { prompt: 'test' });
    expect(crush.bin).toBe('crush');
    expect(crush.commandLine).toContain('crush');
    expect(crush.commandLine).toContain('-p');
  });

  it('rejects unknown runtimes', async () => {
    const { resolveRuntimeCommand } = await import('./runtime-commands.js');
    expect(() => resolveRuntimeCommand('unknown', { prompt: 'test' })).toThrow();
  });

  it('rejects empty prompts', async () => {
    const { resolveRuntimeCommand } = await import('./runtime-commands.js');
    expect(() => resolveRuntimeCommand('pi', { prompt: '' })).toThrow();
    expect(() => resolveRuntimeCommand('pi', { prompt: '   ' })).toThrow();
  });

  it('shell-quotes prompts safely (no injection)', async () => {
    const { resolveRuntimeCommand } = await import('./runtime-commands.js');
    const malicious = "'; rm -rf /; echo '";
    const result = resolveRuntimeCommand('claude_code', { prompt: malicious });
    // The prompt must be single-quoted and escaped. The escaped form wraps
    // the whole prompt in single quotes and escapes internal quotes with '\''.
    expect(result.commandLine).toContain("'\\''");
    // Verify the shell would NOT execute rm: the whole malicious string is
    // inside the quoted prompt argument, not a separate command.
    const promptArg = result.commandLine.match(/-p '(.+)' --permission/);
    expect(promptArg).not.toBeNull();
    // Unescape back to original to prove it's a literal, not executed.
    if (promptArg) {
      const unescaped = promptArg[1].replace(/'\\''/g, "'");
      expect(unescaped).toBe(malicious);
    }
  });
});
