/**
 * Empty-start create: the New Workspace form promises "start empty and chat
 * once it's running". applyEmptyStartDefault honors that — when neither a
 * prompt nor a command is given, it provisions the worktree with a clean no-op
 * (lands in awaiting_review, continuable by the first message) and labels the
 * workspace so the board shows a friendly goal instead of an empty diff.
 */
import { describe, expect, it } from 'vitest';
import { applyEmptyStartDefault, EMPTY_START_COMMAND } from './empty-start';

describe('applyEmptyStartDefault', () => {
  it('defaults a no-op command + empty-start metadata when prompt and command are absent', () => {
    const out = applyEmptyStartDefault({ repoPath: '/r' });
    expect(out.command).toBe(EMPTY_START_COMMAND);
    expect(out.metadata?.emptyStart).toBe(true);
    expect(typeof out.metadata?.prompt).toBe('string');
  });

  it('treats a whitespace-only prompt as empty', () => {
    const out = applyEmptyStartDefault({ repoPath: '/r', prompt: '   \n' });
    expect(out.command).toBe(EMPTY_START_COMMAND);
  });

  it('leaves a real prompt untouched (no no-op, no empty-start marker)', () => {
    const out = applyEmptyStartDefault({ repoPath: '/r', prompt: 'add a file' });
    expect(out.command).toBeUndefined();
    expect(out.prompt).toBe('add a file');
    expect(out.metadata?.emptyStart).toBeUndefined();
  });

  it('leaves an explicit command untouched', () => {
    const out = applyEmptyStartDefault({ repoPath: '/r', command: 'echo hi' });
    expect(out.command).toBe('echo hi');
    expect(out.metadata?.emptyStart).toBeUndefined();
  });

  it('preserves a caller-supplied prompt label in metadata when empty-starting with metadata', () => {
    const out = applyEmptyStartDefault({ repoPath: '/r', metadata: { foo: 'bar' } });
    expect(out.metadata?.foo).toBe('bar');
    expect(out.metadata?.emptyStart).toBe(true);
  });
});
