/**
 * Diff-review comment folding — the pure parser + prompt composer.
 *
 * Proves: untrusted payloads coerce to clean comments (malformed dropped, never a
 * throw, never a fabricated entry, count-capped); the composed steer prompt
 * carries every `file:line` anchor, numbers multi-comment lists, degrades a
 * file-level (no-line) comment to a bare path, and returns '' when there is
 * nothing valid to say (so the caller refuses to steer an empty prompt).
 */
import { describe, it, expect } from 'vitest';
import { parseReviewComments, composeReviewPrompt } from './review-comments.js';

describe('parseReviewComments', () => {
  it('keeps well-formed comments, trimming file and body', () => {
    expect(parseReviewComments([{ file: ' src/a.ts ', line: 12, body: ' fix this ' }])).toEqual([
      { file: 'src/a.ts', line: 12, body: 'fix this' },
    ]);
  });

  it('drops entries missing a file or a body, never throwing', () => {
    expect(
      parseReviewComments([
        { file: '', body: 'x' },
        { file: 'a.ts', body: '' },
        { file: 'a.ts' },
        { body: 'x' },
        null,
        'junk',
        42,
      ]),
    ).toEqual([]);
  });

  it('keeps a line only when it is a positive integer, else file-level', () => {
    expect(parseReviewComments([{ file: 'a.ts', line: 0, body: 'b' }])).toEqual([{ file: 'a.ts', body: 'b' }]);
    expect(parseReviewComments([{ file: 'a.ts', line: -3, body: 'b' }])).toEqual([{ file: 'a.ts', body: 'b' }]);
    expect(parseReviewComments([{ file: 'a.ts', line: 1.5, body: 'b' }])).toEqual([{ file: 'a.ts', body: 'b' }]);
    expect(parseReviewComments([{ file: 'a.ts', line: '3', body: 'b' }])).toEqual([{ file: 'a.ts', body: 'b' }]);
    expect(parseReviewComments([{ file: 'a.ts', line: 3, body: 'b' }])).toEqual([{ file: 'a.ts', line: 3, body: 'b' }]);
  });

  it('returns [] for a non-array payload', () => {
    expect(parseReviewComments(null)).toEqual([]);
    expect(parseReviewComments({ file: 'a.ts', body: 'b' })).toEqual([]);
    expect(parseReviewComments('nope')).toEqual([]);
  });

  it('caps the number of comments at 50', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ file: `f${i}.ts`, line: i + 1, body: `c${i}` }));
    expect(parseReviewComments(many)).toHaveLength(50);
  });
});

describe('composeReviewPrompt', () => {
  it('returns "" when there are no valid comments (caller refuses to steer)', () => {
    expect(composeReviewPrompt([])).toBe('');
    expect(composeReviewPrompt([{ file: ' ', body: ' ' }])).toBe('');
  });

  it('composes a single line-anchored comment as a one-liner with its anchor', () => {
    const prompt = composeReviewPrompt([{ file: 'src/a.ts', line: 42, body: 'rename this' }]);
    expect(prompt).toContain('src/a.ts:42 — rename this');
    expect(prompt).toContain('this review comment');
    expect(prompt).toContain('summarize what you changed');
  });

  it('numbers multiple comments and preserves every anchor', () => {
    const prompt = composeReviewPrompt([
      { file: 'src/a.ts', line: 10, body: 'extract helper' },
      { file: 'src/b.ts', body: 'add a test' },
    ]);
    expect(prompt).toContain('these 2 review comments');
    expect(prompt).toContain('1. src/a.ts:10 — extract helper');
    // a file-level comment (no line) degrades to the bare path.
    expect(prompt).toContain('2. src/b.ts — add a test');
    expect(prompt).not.toContain('src/b.ts: ');
  });
});
