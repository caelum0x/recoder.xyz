/**
 * Tests for hashline-edit — hash-anchored file editing for reliable
 * multi-turn modifications. This is a critical path for Deep Coding mode.
 */

import { describe, expect, it } from 'vitest';
import {
  formatHashLine,
  formatHashLines,
  parseAnchor,
  applyEdits,
  parseEdits,
  type HashlineEdit,
} from '../hashline-edit';

describe('formatHashLine', () => {
  it('formats a single line with lineNum#hash|content pattern', () => {
    const result = formatHashLine(1, 'hello world');
    expect(result).toMatch(/^1#[A-Z0-9]{2}\|hello world$/);
  });

  it('handles empty lines', () => {
    const result = formatHashLine(5, '');
    expect(result).toMatch(/^5#[A-Z0-9]{2}\|$/);
  });

  it('is deterministic for the same input', () => {
    expect(formatHashLine(1, 'foo')).toBe(formatHashLine(1, 'foo'));
    expect(formatHashLine(10, 'bar')).toBe(formatHashLine(10, 'bar'));
  });

  it('produces same hash for same content regardless of line number (when content has letters/numbers)', () => {
    // Line 1 "hello" and line 2 "hello" should share a hash because
    // the seed is "0" when content has significant chars
    const line1 = formatHashLine(1, 'hello');
    const line2 = formatHashLine(2, 'hello');
    const hash1 = line1.match(/#([A-Z0-9]{2})\|/)?.[1];
    const hash2 = line2.match(/#([A-Z0-9]{2})\|/)?.[1];
    expect(hash1).toBe(hash2);
  });

  it('uses line-number-seeded hash for empty/whitespace lines', () => {
    // Empty lines on different line numbers should get different hashes
    const empty1 = formatHashLine(1, '');
    const empty2 = formatHashLine(5, '');
    // They could theoretically collide but very unlikely
    expect(empty1).not.toBe(empty2);
  });
});

describe('formatHashLines', () => {
  it('formats a multiline file', () => {
    const content = 'line one\nline two\nline three';
    const result = formatHashLines(content);
    const lines = result.split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^1#[A-Z0-9]{2}\|line one$/);
    expect(lines[1]).toMatch(/^2#[A-Z0-9]{2}\|line two$/);
    expect(lines[2]).toMatch(/^3#[A-Z0-9]{2}\|line three$/);
  });

  it('returns empty string for empty input', () => {
    expect(formatHashLines('')).toBe('');
  });

  it('handles single line', () => {
    expect(formatHashLines('solo')).toMatch(/^1#[A-Z0-9]{2}\|solo$/);
  });
});

describe('parseAnchor', () => {
  it('parses valid anchors', () => {
    expect(parseAnchor('1#AB')).toEqual({ lineNumber: 1, hash: 'AB' });
    expect(parseAnchor('42#Z9')).toEqual({ lineNumber: 42, hash: 'Z9' });
    expect(parseAnchor('100#00')).toEqual({ lineNumber: 100, hash: '00' });
  });

  it('rejects invalid formats', () => {
    expect(parseAnchor('abc')).toBeNull();
    expect(parseAnchor('1#')).toBeNull();
    expect(parseAnchor('#AB')).toBeNull();
    expect(parseAnchor('1#ABC')).toBeNull(); // hash must be exactly 2 chars
    expect(parseAnchor('1#ab')).toBeNull(); // must be uppercase/digit
    expect(parseAnchor('')).toBeNull();
  });
});

describe('applyEdits — replace', () => {
  it('replaces a single line', () => {
    const content = 'alpha\nbeta\ngamma';
    const indexed = formatHashLines(content).split('\n');
    const betaAnchor = indexed[1].split('|')[0]; // e.g. "2#XY"

    const result = applyEdits(content, [
      { op: 'replace', pos: betaAnchor, lines: ['BETA_NEW'] },
    ]);

    expect(result).toBe('alpha\nBETA_NEW\ngamma');
  });

  it('replaces a range of lines', () => {
    const content = 'a\nb\nc\nd\ne';
    const formatted = formatHashLines(content).split('\n');
    const bAnchor = formatted[1].split('|')[0];
    const dAnchor = formatted[3].split('|')[0];

    const result = applyEdits(content, [
      { op: 'replace', pos: bAnchor, end: dAnchor, lines: ['REPLACED'] },
    ]);

    expect(result).toBe('a\nREPLACED\ne');
  });

  it('replaces with multiple lines', () => {
    const content = 'start\nmiddle\nend';
    const formatted = formatHashLines(content).split('\n');
    const middleAnchor = formatted[1].split('|')[0];

    const result = applyEdits(content, [
      { op: 'replace', pos: middleAnchor, lines: ['one', 'two', 'three'] },
    ]);

    expect(result).toBe('start\none\ntwo\nthree\nend');
  });

  it('throws on unknown anchor', () => {
    expect(() => applyEdits('a\nb', [
      { op: 'replace', pos: '99#ZZ', lines: ['x'] },
    ])).toThrow(/start anchor not found/);
  });
});

describe('applyEdits — append', () => {
  it('appends after a specific line', () => {
    const content = 'first\nsecond\nthird';
    const formatted = formatHashLines(content).split('\n');
    const firstAnchor = formatted[0].split('|')[0];

    const result = applyEdits(content, [
      { op: 'append', pos: firstAnchor, lines: ['INSERTED'] },
    ]);

    expect(result).toBe('first\nINSERTED\nsecond\nthird');
  });

  it('appends at end of file when no pos provided', () => {
    const content = 'line1\nline2';
    const result = applyEdits(content, [
      { op: 'append', lines: ['line3', 'line4'] },
    ]);
    expect(result).toBe('line1\nline2\nline3\nline4');
  });

  it('appends multiple lines', () => {
    const content = 'only';
    const formatted = formatHashLines(content).split('\n');
    const onlyAnchor = formatted[0].split('|')[0];

    const result = applyEdits(content, [
      { op: 'append', pos: onlyAnchor, lines: ['a', 'b', 'c'] },
    ]);

    expect(result).toBe('only\na\nb\nc');
  });
});

describe('applyEdits — prepend', () => {
  it('prepends before a specific line', () => {
    const content = 'foo\nbar';
    const formatted = formatHashLines(content).split('\n');
    const barAnchor = formatted[1].split('|')[0];

    const result = applyEdits(content, [
      { op: 'prepend', pos: barAnchor, lines: ['BEFORE'] },
    ]);

    expect(result).toBe('foo\nBEFORE\nbar');
  });

  it('prepends at start of file when no pos provided', () => {
    const content = 'main';
    const result = applyEdits(content, [
      { op: 'prepend', lines: ['header'] },
    ]);
    expect(result).toBe('header\nmain');
  });
});

describe('applyEdits — multiple edits', () => {
  it('applies edits in reverse order to preserve anchors', () => {
    const content = 'a\nb\nc\nd\ne';
    const formatted = formatHashLines(content).split('\n');
    const aAnchor = formatted[0].split('|')[0];
    const cAnchor = formatted[2].split('|')[0];
    const eAnchor = formatted[4].split('|')[0];

    // Replace 'a', 'c', 'e' independently
    const result = applyEdits(content, [
      { op: 'replace', pos: aAnchor, lines: ['A'] },
      { op: 'replace', pos: cAnchor, lines: ['C'] },
      { op: 'replace', pos: eAnchor, lines: ['E'] },
    ]);

    expect(result).toBe('A\nb\nC\nd\nE');
  });

  it('combines append + replace correctly', () => {
    const content = 'x\ny\nz';
    const formatted = formatHashLines(content).split('\n');
    const yAnchor = formatted[1].split('|')[0];

    const result = applyEdits(content, [
      { op: 'replace', pos: yAnchor, lines: ['Y'] },
      { op: 'append', lines: ['END'] },
    ]);

    expect(result).toBe('x\nY\nz\nEND');
  });
});

describe('applyEdits — fuzzy anchor matching', () => {
  it('matches by hash when line numbers have shifted', () => {
    // Start with 5 lines, get the anchor for line 3
    const original = 'line1\nline2\nline3\nline4\nline5';
    const originalFormatted = formatHashLines(original).split('\n');
    const line3Anchor = originalFormatted[2].split('|')[0];

    // Now the file has shifted — line3 is now at position 4 (after insertions)
    const shifted = 'NEW1\nNEW2\nline1\nline2\nline3\nline4\nline5';

    // Use the original line3 anchor to modify the shifted file
    const result = applyEdits(shifted, [
      { op: 'replace', pos: line3Anchor, lines: ['MODIFIED'] },
    ]);

    // Should find line3 by its hash even at its new position
    expect(result).toContain('MODIFIED');
    expect(result).not.toContain('line3');
  });
});

describe('parseEdits', () => {
  it('parses valid edit JSON', () => {
    const json = JSON.stringify({
      edits: [
        { op: 'replace', pos: '1#AB', lines: ['new line'] },
        { op: 'append', pos: '5#CD', lines: ['added'] },
      ],
    });

    const result = parseEdits(json);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ op: 'replace', pos: '1#AB', end: undefined, lines: ['new line'] });
    expect(result[1]).toEqual({ op: 'append', pos: '5#CD', lines: ['added'] });
  });

  it('parses naked array (without edits wrapper)', () => {
    const json = JSON.stringify([
      { op: 'replace', pos: '1#AB', lines: ['x'] },
    ]);
    const result = parseEdits(json);
    expect(result).toHaveLength(1);
  });

  it('splits string lines into arrays', () => {
    const json = JSON.stringify({
      edits: [{ op: 'replace', pos: '1#AB', lines: 'line1\nline2\nline3' }],
    });
    const result = parseEdits(json);
    expect(result[0].lines).toEqual(['line1', 'line2', 'line3']);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseEdits('not json')).toThrow(/Failed to parse edits/);
  });

  it('throws on unknown op', () => {
    const json = JSON.stringify({ edits: [{ op: 'delete', pos: '1#AB' }] });
    expect(() => parseEdits(json)).toThrow(/Unknown edit op/);
  });

  it('throws when not an array', () => {
    const json = JSON.stringify({ edits: 'not an array' });
    expect(() => parseEdits(json)).toThrow(/Expected array/);
  });
});

describe('round-trip: format → edit → verify', () => {
  it('edits survive a full read/format/edit cycle', () => {
    const original = 'const x = 1;\nconst y = 2;\nconst z = 3;';

    // Simulate what the LLM sees: formatted with anchors
    const formatted = formatHashLines(original);
    const lines = formatted.split('\n');
    expect(lines).toHaveLength(3);

    // Extract anchors for line 2
    const line2Anchor = lines[1].split('|')[0];

    // Apply an edit
    const edited = applyEdits(original, [
      { op: 'replace', pos: line2Anchor, lines: ['const y = 42;'] },
    ]);

    expect(edited).toBe('const x = 1;\nconst y = 42;\nconst z = 3;');
  });

  it('parseEdits + applyEdits integration', () => {
    const content = 'foo\nbar\nbaz';
    const formatted = formatHashLines(content).split('\n');
    const barAnchor = formatted[1].split('|')[0];

    const json = JSON.stringify({
      edits: [{ op: 'replace', pos: barAnchor, lines: ['BAR'] }],
    });

    const edits = parseEdits(json);
    const result = applyEdits(content, edits);
    expect(result).toBe('foo\nBAR\nbaz');
  });
});

describe('applyEdits — edge cases', () => {
  it('handles empty file', () => {
    const result = applyEdits('', [{ op: 'append', lines: ['first'] }]);
    expect(result).toBe('\nfirst');
  });

  it('handles file with single line', () => {
    const formatted = formatHashLines('only').split('\n');
    const anchor = formatted[0].split('|')[0];

    const result = applyEdits('only', [
      { op: 'replace', pos: anchor, lines: ['replaced'] },
    ]);
    expect(result).toBe('replaced');
  });

  it('preserves empty lines during edit', () => {
    const content = 'a\n\nb\n\nc';
    const formatted = formatHashLines(content).split('\n');
    const bAnchor = formatted[2].split('|')[0];

    const result = applyEdits(content, [
      { op: 'replace', pos: bAnchor, lines: ['B'] },
    ]);

    expect(result).toBe('a\n\nB\n\nc');
  });
});
