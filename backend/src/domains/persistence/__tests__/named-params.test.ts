import { describe, it, expect } from 'vitest';
import { compileNamedQuery } from '../query/named-params.js';

describe('compileNamedQuery', () => {
  it('compiles :name placeholders to positional $n in first-seen order', () => {
    const { text, values } = compileNamedQuery(
      'select * from t where a = :a and b = :b',
      { a: 1, b: 'x' },
    );
    expect(text).toBe('select * from t where a = $1 and b = $2');
    expect(values).toEqual([1, 'x']);
  });

  it('reuses the same index when a name recurs', () => {
    const { text, values } = compileNamedQuery(
      'select * from t where a = :a or b = :a',
      { a: 7 },
    );
    expect(text).toBe('select * from t where a = $1 or b = $1');
    expect(values).toEqual([7]);
  });

  it('expands an array param into a positional list for IN (...)', () => {
    const { text, values } = compileNamedQuery(
      'select * from t where id in :ids',
      { ids: ['a', 'b', 'c'] },
    );
    expect(text).toBe('select * from t where id in ($1, $2, $3)');
    expect(values).toEqual(['a', 'b', 'c']);
  });

  it('expands an empty array to (null) so it matches nothing', () => {
    const { text, values } = compileNamedQuery('select * from t where id in :ids', { ids: [] });
    expect(text).toBe('select * from t where id in (null)');
    expect(values).toEqual([]);
  });

  it('leaves ::type casts untouched', () => {
    const { text, values } = compileNamedQuery(
      "select :val::jsonb as v",
      { val: '{}' },
    );
    expect(text).toBe('select $1::jsonb as v');
    expect(values).toEqual(['{}']);
  });

  it('does not treat :name inside a string literal as a placeholder', () => {
    const { text, values } = compileNamedQuery(
      "select ':notaparam' as lit, x from t where y = :y",
      { y: 3 },
    );
    expect(text).toBe("select ':notaparam' as lit, x from t where y = $1");
    expect(values).toEqual([3]);
  });

  it('throws on a missing bind parameter', () => {
    expect(() => compileNamedQuery('select :a', {})).toThrow(/Missing bind parameter ":a"/);
  });

  it('throws on an unused bind parameter (likely a typo)', () => {
    expect(() => compileNamedQuery('select :a', { a: 1, b: 2 })).toThrow(/Unused bind parameter ":b"/);
  });
});
