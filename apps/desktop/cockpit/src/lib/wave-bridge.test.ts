import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasWaveTerminalBridge, openWorkspaceTerminal } from './wave-bridge';

type BridgeGlobal = {
  __RECODER_COCKPIT__?: { openWorkspaceTerminal?: unknown };
};

function setBridge(value: unknown): void {
  (globalThis as BridgeGlobal).__RECODER_COCKPIT__ =
    value as BridgeGlobal['__RECODER_COCKPIT__'];
}

afterEach(() => {
  delete (globalThis as BridgeGlobal).__RECODER_COCKPIT__;
});

describe('hasWaveTerminalBridge', () => {
  it('is false in a plain browser (no injected bridge)', () => {
    expect(hasWaveTerminalBridge()).toBe(false);
  });

  it('is false when the shell injected config without the terminal function', () => {
    setBridge({ backendUrl: 'http://127.0.0.1:3100' });
    expect(hasWaveTerminalBridge()).toBe(false);
  });

  it('is true when the wave shell exposed openWorkspaceTerminal', () => {
    setBridge({ openWorkspaceTerminal: () => undefined });
    expect(hasWaveTerminalBridge()).toBe(true);
  });
});

describe('openWorkspaceTerminal', () => {
  it('is a no-op returning false without a bridge', () => {
    expect(openWorkspaceTerminal({ sessionName: 'conductor-s1' })).toBe(false);
  });

  it('forwards sessionName + cwd to the bridge and returns true', () => {
    const bridgeFn = vi.fn();
    setBridge({ openWorkspaceTerminal: bridgeFn });
    expect(
      openWorkspaceTerminal({ sessionName: 'conductor-s1', cwd: '/wt/s1' })
    ).toBe(true);
    expect(bridgeFn).toHaveBeenCalledWith({
      sessionName: 'conductor-s1',
      cwd: '/wt/s1',
    });
  });

  it('omits an empty cwd instead of sending it', () => {
    const bridgeFn = vi.fn();
    setBridge({ openWorkspaceTerminal: bridgeFn });
    expect(openWorkspaceTerminal({ sessionName: 's1', cwd: '  ' })).toBe(true);
    expect(bridgeFn).toHaveBeenCalledWith({ sessionName: 's1' });
  });

  it('refuses an empty sessionName without touching the bridge', () => {
    const bridgeFn = vi.fn();
    setBridge({ openWorkspaceTerminal: bridgeFn });
    expect(openWorkspaceTerminal({ sessionName: '   ' })).toBe(false);
    expect(bridgeFn).not.toHaveBeenCalled();
  });

  it('returns false when the bridge call throws (degrade-safe)', () => {
    setBridge({
      openWorkspaceTerminal: () => {
        throw new Error('ipc gone');
      },
    });
    expect(openWorkspaceTerminal({ sessionName: 's1' })).toBe(false);
  });
});
