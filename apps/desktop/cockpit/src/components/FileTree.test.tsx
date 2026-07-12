// @vitest-environment jsdom
/**
 * FileTree — buildFileTree turns the flat /tree path list into a nested tree,
 * dirs-first, marking changed files (and their ancestor dirs).
 */
import { describe, expect, it } from 'vitest';
import { buildFileTree } from './FileTree';

describe('buildFileTree', () => {
  it('nests paths into a directory tree', () => {
    const tree = buildFileTree(['src/app.ts', 'src/lib/util.ts', 'README.md']);
    const names = tree.map((n) => n.name);
    // dirs before files, each alphabetical → [src, README.md]
    expect(names).toEqual(['src', 'README.md']);
    const src = tree.find((n) => n.name === 'src')!;
    expect(src.dir).toBe(true);
    expect(src.children.map((c) => c.name)).toEqual(['lib', 'app.ts']);
  });

  it('marks changed files and propagates to ancestor directories', () => {
    const tree = buildFileTree(['src/app.ts', 'src/lib/util.ts', 'README.md'], ['src/lib/util.ts']);
    const src = tree.find((n) => n.name === 'src')!;
    const lib = src.children.find((n) => n.name === 'lib')!;
    const util = lib.children[0];
    expect(util.changed).toBe(true);
    expect(lib.changed).toBe(true); // ancestor marked
    expect(src.changed).toBe(true);
    // an unrelated file stays unchanged
    expect(tree.find((n) => n.name === 'README.md')!.changed).toBe(false);
  });

  it('handles an empty file list', () => {
    expect(buildFileTree([])).toEqual([]);
  });

  it('carries the full path on file nodes for tooltips', () => {
    const tree = buildFileTree(['a/b/c.ts']);
    const leaf = tree[0].children[0].children[0];
    expect(leaf.path).toBe('a/b/c.ts');
    expect(leaf.dir).toBe(false);
  });
});
