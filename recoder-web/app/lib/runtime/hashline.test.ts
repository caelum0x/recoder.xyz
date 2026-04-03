import { describe, expect, it } from 'vitest';
import {
  HashlineMismatchError,
  computeLineHash,
  formatHashLines,
  parseLineRef,
  resolveLineRef,
  validateLineRefs,
} from './hashline';

describe('hashline', () => {
  it('formats lines with stable hashline prefixes', () => {
    const formatted = formatHashLines('const a = 1;\nreturn a;', 10);

    expect(formatted).toBe(
      `10#${computeLineHash(10, 'const a = 1;')}|const a = 1;\n11#${computeLineHash(11, 'return a;')}|return a;`,
    );
  });

  it('parses line references with inline content', () => {
    const ref = parseLineRef(`12#${computeLineHash(12, 'hello')}|hello`);

    expect(ref).toEqual({
      line: 12,
      hash: computeLineHash(12, 'hello'),
    });
  });

  it('resolves a valid line reference to its current line number', () => {
    const lines = ['first line', 'second line', 'third line'];
    const lineRef = `2#${computeLineHash(2, lines[1])}`;

    expect(resolveLineRef(lines, lineRef)).toBe(2);
  });

  it('throws a mismatch error with updated refs when content changed', () => {
    const lines = ['first line', 'changed second line', 'third line'];
    const staleRef = `2#${computeLineHash(2, 'second line')}`;

    expect(() => validateLineRefs(lines, [staleRef])).toThrow(HashlineMismatchError);

    try {
      validateLineRefs(lines, [staleRef]);
    } catch (error) {
      expect(error).toBeInstanceOf(HashlineMismatchError);
      expect((error as HashlineMismatchError).message).toContain('changed since last read');
      expect((error as HashlineMismatchError).message).toContain(`2#${computeLineHash(2, lines[1])}|changed second line`);
    }
  });
});
