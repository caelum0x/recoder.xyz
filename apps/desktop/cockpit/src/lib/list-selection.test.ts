/**
 * list-selection — the pure cursor reducer. These assert the clamped, no-wrap
 * contract that keeps the highlight in-bounds even as the polled list mutates:
 * clamp at both ends, empty ⇒ no selection, and the terminal "first keypress
 * lands on an end" behavior from a no-cursor start.
 */
import { describe, expect, it } from 'vitest';
import { clampIndex, idAt, indexOfId, move } from './list-selection';

describe('clampIndex', () => {
  it('returns the index unchanged when in range', () => {
    expect(clampIndex(2, 5)).toBe(2);
  });

  it('clamps below zero to zero', () => {
    expect(clampIndex(-3, 5)).toBe(0);
  });

  it('clamps at or past the end to the last index', () => {
    expect(clampIndex(5, 5)).toBe(4);
    expect(clampIndex(99, 5)).toBe(4);
  });

  it('returns -1 for an empty list', () => {
    expect(clampIndex(0, 0)).toBe(-1);
    expect(clampIndex(3, 0)).toBe(-1);
    expect(clampIndex(0, -1)).toBe(-1);
  });
});

describe('move', () => {
  it('steps down within bounds', () => {
    expect(move(0, 'down', 3)).toBe(1);
    expect(move(1, 'down', 3)).toBe(2);
  });

  it('steps up within bounds', () => {
    expect(move(2, 'up', 3)).toBe(1);
    expect(move(1, 'up', 3)).toBe(0);
  });

  it('clamps at the top — up from 0 stays 0 (no wrap)', () => {
    expect(move(0, 'up', 3)).toBe(0);
  });

  it('clamps at the bottom — down from last stays last (no wrap)', () => {
    expect(move(2, 'down', 3)).toBe(2);
  });

  it('returns -1 for an empty list', () => {
    expect(move(0, 'down', 0)).toBe(-1);
    expect(move(-1, 'up', 0)).toBe(-1);
  });

  it('from no cursor (-1): down lands on the first, up lands on the last', () => {
    expect(move(-1, 'down', 4)).toBe(0);
    expect(move(-1, 'up', 4)).toBe(3);
  });

  it('from no cursor on a single-item list lands on 0 both ways', () => {
    expect(move(-1, 'down', 1)).toBe(0);
    expect(move(-1, 'up', 1)).toBe(0);
  });
});

describe('indexOfId', () => {
  const ids = ['a', 'b', 'c'];

  it('finds a present id', () => {
    expect(indexOfId(ids, 'b')).toBe(1);
  });

  it('returns -1 for an absent id', () => {
    expect(indexOfId(ids, 'z')).toBe(-1);
  });

  it('returns -1 for a null id', () => {
    expect(indexOfId(ids, null)).toBe(-1);
  });
});

describe('idAt', () => {
  const ids = ['a', 'b', 'c'];

  it('reads the id at an in-range index', () => {
    expect(idAt(ids, 0)).toBe('a');
    expect(idAt(ids, 2)).toBe('c');
  });

  it('returns null for an out-of-range index', () => {
    expect(idAt(ids, 3)).toBeNull();
    expect(idAt(ids, -1)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(idAt([], 0)).toBeNull();
  });
});
