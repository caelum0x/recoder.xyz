/**
 * workspaceCodename — a stable, friendly two-word name derived purely from the
 * workspace id, replacing raw ws_<uuid> strings in the UI.
 */
import { describe, expect, it } from 'vitest';
import { workspaceCodename } from './workspace-codename';

describe('workspaceCodename', () => {
  it('is deterministic — the same id always yields the same codename', () => {
    const id = 'ws_ea6c7cc1-7d36-410e-8eb6-4f52dce56a61';
    expect(workspaceCodename(id)).toBe(workspaceCodename(id));
  });

  it('produces a two-word adjective-noun codename (no uuid, no ws_ prefix)', () => {
    const name = workspaceCodename('ws_ea6c7cc1-7d36-410e-8eb6-4f52dce56a61');
    expect(name).toMatch(/^[a-z]+-[a-z]+$/);
    expect(name).not.toContain('ws_');
    expect(name).not.toMatch(/[0-9]/);
  });

  it('gives different ids different codenames (low collision on distinct uuids)', () => {
    const a = workspaceCodename('ws_11111111-1111-1111-1111-111111111111');
    const b = workspaceCodename('ws_22222222-2222-2222-2222-222222222222');
    const c = workspaceCodename('ws_33333333-3333-3333-3333-333333333333');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('degrades to a generic name for empty/missing ids instead of throwing', () => {
    expect(workspaceCodename('')).toBe('workspace');
    expect(workspaceCodename(null)).toBe('workspace');
    expect(workspaceCodename(undefined)).toBe('workspace');
  });
});
