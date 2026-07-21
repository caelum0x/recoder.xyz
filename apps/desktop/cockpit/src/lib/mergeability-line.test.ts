/**
 * mergeabilityLine — the terminal-plain merge-preflight projection.
 *
 * Mirrors preview-verify-line.test.ts: a pure mapper under test with no I/O.
 * The load-bearing contract is degrade-truthful — a 'clean'/'cleanly' verdict is
 * emitted ONLY for a real available+clean view; every other shape (unavailable,
 * unknown verdict, malformed payload) collapses to the truthful 'unknown' line.
 */
import { describe, expect, it } from 'vitest';
import { mergeabilityLine } from './mergeability-line';
import type { WorkspaceMergeability } from '../types';

function view(overrides: Partial<WorkspaceMergeability> = {}): WorkspaceMergeability {
  return {
    available: true,
    verdict: 'clean',
    conflicts: [],
    ahead: 0,
    behind: 0,
    base: 'main',
    branch: 'feature/x',
    ...overrides,
  };
}

describe('mergeabilityLine', () => {
  it('renders a clean merge with ahead + behind counts', () => {
    const line = mergeabilityLine(view({ verdict: 'clean', ahead: 2, behind: 1 }));
    expect(line.tone).toBe('good');
    expect(line.label).toBe('Will merge cleanly · 2 ahead, 1 behind main');
  });

  it('renders a clean merge with only ahead when behind is 0', () => {
    const line = mergeabilityLine(view({ verdict: 'clean', ahead: 3, behind: 0 }));
    expect(line.tone).toBe('good');
    expect(line.label).toBe('Will merge cleanly · 3 ahead');
  });

  it('renders a clean merge with no counts and no trailing punctuation', () => {
    const line = mergeabilityLine(view({ verdict: 'clean', ahead: 0, behind: 0, conflicts: [] }));
    expect(line.tone).toBe('good');
    expect(line.label).toBe('Will merge cleanly');
  });

  it('renders a single conflict with the singular noun', () => {
    const line = mergeabilityLine(view({ verdict: 'conflicting', conflicts: ['a.ts'] }));
    expect(line.tone).toBe('warn');
    expect(line.label).toBe('1 conflict: a.ts');
  });

  it('renders exactly 3 conflicts without a "+more" suffix', () => {
    const line = mergeabilityLine(view({ verdict: 'conflicting', conflicts: ['a', 'b', 'c'] }));
    expect(line.tone).toBe('warn');
    expect(line.label).toBe('3 conflicts: a, b, c');
  });

  it('truncates to 3 conflicts and counts the remainder', () => {
    const line = mergeabilityLine(
      view({ verdict: 'conflicting', conflicts: ['a', 'b', 'c', 'd', 'e'] }),
    );
    expect(line.tone).toBe('warn');
    expect(line.label).toBe('5 conflicts: a, b, c (+2 more)');
  });

  it('renders an unavailable view with its reason and never "clean"', () => {
    const line = mergeabilityLine(
      view({ available: false, verdict: 'unknown', reason: 'workspace has no worktree' }),
    );
    expect(line.tone).toBe('unknown');
    expect(line.label).toBe('Merge preflight unavailable — workspace has no worktree');
    expect(line.label).not.toMatch(/clean|cleanly/i);
  });

  it('renders an unavailable view with no reason', () => {
    const line = mergeabilityLine(view({ available: false, verdict: 'unknown', reason: undefined }));
    expect(line.tone).toBe('unknown');
    expect(line.label).toBe('Merge preflight unavailable');
  });

  it('never fakes clean for a defensive available:true, verdict:unknown', () => {
    const line = mergeabilityLine(view({ available: true, verdict: 'unknown' }));
    expect(line.tone).toBe('unknown');
    expect(line.label).not.toMatch(/clean|cleanly/i);
  });

  it('collapses a malformed cast (empty object) to unknown, never clean', () => {
    const line = mergeabilityLine([] as unknown as WorkspaceMergeability);
    expect(line.tone).toBe('unknown');
    expect(line.label).not.toMatch(/clean|cleanly/i);

    const missingAvailable = mergeabilityLine(
      { verdict: 'clean', conflicts: [], ahead: 1, behind: 0, base: 'main', branch: 'x' } as unknown as WorkspaceMergeability,
    );
    expect(missingAvailable.tone).toBe('unknown');
    expect(missingAvailable.label).not.toMatch(/clean|cleanly/i);
  });
});
