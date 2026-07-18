// @vitest-environment jsdom
/**
 * FileTree — buildFileTree turns the flat /tree path list into a nested tree,
 * dirs-first, marking changed files (and their ancestor dirs).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { buildFileTree, FileTree } from './FileTree';

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

/**
 * Cross-workspace state-bleed: TreeRow's per-folder `open` state (useState) is
 * keyed by node.path. Two different worktrees usually share identical top-level
 * paths (e.g. 'src'), so collapsing a folder in workspace A would otherwise
 * carry that collapsed state into workspace B when the tree is re-rendered.
 *
 * App.tsx closes this by keying <WorkspaceDetail> (hence <FileTree/>) on
 * `workspace.workspaceId`, remounting the whole tree per workspace. This test
 * reproduces that keying: it collapses 'src' in workspace A, switches to B
 * (same files, new key), and asserts B shows the DEFAULT expanded state — A's
 * collapsed state does not bleed across the switch.
 */
describe('FileTree per-workspace state isolation (keyed remount)', () => {
  // @vitest-environment jsdom
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (container) {
      act(() => {
        render(null, container as HTMLDivElement);
      });
      container.remove();
      container = null;
    }
  });

  // Both worktrees expose the same top-level folder path ('src'), which is the
  // condition under which the bleed occurs.
  const FILES = ['src/app.ts', 'README.md'] as const;

  /** Render <FileTree> keyed by workspace id, exactly like App.tsx does. */
  function renderForWorkspace(c: HTMLDivElement, wsId: string): void {
    act(() => {
      render(<FileTree key={wsId} files={FILES} />, c);
    });
  }

  function srcDirButton(c: HTMLDivElement): HTMLButtonElement {
    const btn = Array.from(c.querySelectorAll<HTMLButtonElement>('.filetree-dir')).find((b) =>
      (b.textContent ?? '').includes('src'),
    );
    if (!btn) throw new Error("'src' folder row not found");
    return btn;
  }

  function isChildVisible(c: HTMLDivElement, name: string): boolean {
    return Array.from(c.querySelectorAll('.filetree-file')).some((f) =>
      (f.textContent ?? '').includes(name),
    );
  }

  it('does not carry a folder collapsed in workspace A into workspace B', () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    container = c;

    // Workspace A: top-level 'src' is expanded by default (depth < 1).
    renderForWorkspace(c, 'ws-A');
    expect(srcDirButton(c).textContent).toContain('▾');
    expect(isChildVisible(c, 'app.ts')).toBe(true);

    // Operator collapses 'src' in workspace A.
    act(() => {
      srcDirButton(c).click();
    });
    expect(srcDirButton(c).textContent).toContain('▸');
    expect(isChildVisible(c, 'app.ts')).toBe(false);

    // Switch to workspace B: new key remounts the tree (App.tsx keys on
    // workspaceId). B must show the DEFAULT expanded state, NOT A's collapse.
    renderForWorkspace(c, 'ws-B');
    expect(srcDirButton(c).textContent).toContain('▾');
    expect(isChildVisible(c, 'app.ts')).toBe(true);
  });
});
