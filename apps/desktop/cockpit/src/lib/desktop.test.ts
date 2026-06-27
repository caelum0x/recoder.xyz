/**
 * Unit tests for the pure desktop-bridge helpers (desktop.ts).
 *
 * These exercise the REAL normalization logic with no production code stubbed.
 * `pickedFolderPath` is the seam between the native folder picker's loosely-typed
 * IPC result and the form's repoPath string — it must never fabricate a path.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  hasFolderPicker,
  pickedFolderPath,
  spawnedTerminalId,
} from './desktop';

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
});

describe('pickedFolderPath', () => {
  it('returns a trimmed string path when the picker resolves a string', () => {
    expect(pickedFolderPath('/Users/me/project')).toBe('/Users/me/project');
    expect(pickedFolderPath('  /Users/me/project  ')).toBe('/Users/me/project');
  });

  it('returns null for a cancelled pick (null/undefined)', () => {
    expect(pickedFolderPath(null)).toBeNull();
    expect(pickedFolderPath(undefined)).toBeNull();
  });

  it('returns null for an empty or whitespace-only string', () => {
    expect(pickedFolderPath('')).toBeNull();
    expect(pickedFolderPath('   ')).toBeNull();
  });

  it('extracts path from an object shape ({ path } or { filePath })', () => {
    expect(pickedFolderPath({ path: '/abs/p' })).toBe('/abs/p');
    expect(pickedFolderPath({ filePath: '/abs/q' })).toBe('/abs/q');
    expect(pickedFolderPath({ path: '  /abs/r  ' })).toBe('/abs/r');
  });

  it('returns null for malformed / unexpected shapes (never fabricates a path)', () => {
    expect(pickedFolderPath({})).toBeNull();
    expect(pickedFolderPath({ path: 123 })).toBeNull();
    expect(pickedFolderPath({ path: '' })).toBeNull();
    expect(pickedFolderPath(42)).toBeNull();
    expect(pickedFolderPath(['x'])).toBeNull();
  });
});

describe('hasFolderPicker', () => {
  it('is false when there is no window bridge (plain browser)', () => {
    expect(hasFolderPicker()).toBe(false);
  });

  it('is false when recoderDesktop exists but lacks openFolder', () => {
    (globalThis as Record<string, unknown>).window = { recoderDesktop: {} };
    expect(hasFolderPicker()).toBe(false);
  });

  it('is true when the Electron shell exposes openFolder', () => {
    (globalThis as Record<string, unknown>).window = {
      recoderDesktop: { openFolder: async () => null },
    };
    expect(hasFolderPicker()).toBe(true);
  });
});

describe('spawnedTerminalId', () => {
  it('normalizes both the bare-string and { id } shapes', () => {
    expect(spawnedTerminalId('term-1')).toBe('term-1');
    expect(spawnedTerminalId({ id: 'term-2' })).toBe('term-2');
  });
});
