/**
 * FileTree — renders a workspace's worktree as a real, nested "All files" tree
 * (the conductor.build right-panel view), built from the flat path list the
 * `/workspaces/:id/tree` endpoint returns. Changed files (modified/untracked)
 * are marked with a dot so the tree doubles as a light change indicator.
 *
 * Presentation-only + degrade-safe: an empty list shows a calm empty state;
 * folders collapse/expand locally. No file contents are fetched here.
 */
import { useState } from 'preact/hooks';

export interface TreeNode {
  name: string;
  /** Full repo-relative path (files only; dirs use their prefix). */
  path: string;
  dir: boolean;
  changed: boolean;
  children: TreeNode[];
}

/**
 * Build a nested tree from a flat, sorted path list. Directories sort before
 * files, each alphabetically. A directory is marked `changed` when any file
 * under it changed. Pure — unit-tested.
 */
export function buildFileTree(files: readonly string[], changed: readonly string[] = []): TreeNode[] {
  const changedSet = new Set(changed);
  const roots: TreeNode[] = [];
  const dirIndex = new Map<string, TreeNode>();

  for (const file of files) {
    const parts = file.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    let level = roots;
    let prefix = '';
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLeaf = i === parts.length - 1;
      prefix = prefix ? `${prefix}/${name}` : name;
      if (isLeaf) {
        level.push({ name, path: file, dir: false, changed: changedSet.has(file), children: [] });
      } else {
        let node = dirIndex.get(prefix);
        if (!node) {
          node = { name, path: prefix, dir: true, changed: false, children: [] };
          dirIndex.set(prefix, node);
          level.push(node);
        }
        level = node.children;
      }
    }
  }

  // Mark a directory changed when any descendant changed; sort dirs-first.
  const finalize = (nodes: TreeNode[]): boolean => {
    let anyChanged = false;
    for (const node of nodes) {
      if (node.dir) node.changed = finalize(node.children);
      anyChanged = anyChanged || node.changed;
    }
    nodes.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    return anyChanged;
  };
  finalize(roots);
  return roots;
}

function TreeRow({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1); // top level expanded by default
  const pad = { paddingLeft: `${depth * 14 + 8}px` };
  if (!node.dir) {
    return (
      <div class={`filetree-file ${node.changed ? 'filetree-changed' : ''}`} style={pad} title={node.path}>
        {node.changed && <span class="filetree-dot" aria-hidden="true" />}
        {node.name}
      </div>
    );
  }
  return (
    <div class="filetree-dir-wrap">
      <button class="filetree-dir" style={pad} onClick={() => setOpen((v) => !v)} title={node.path}>
        <span class="filetree-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        {node.name}
        {node.changed && <span class="filetree-dot" aria-hidden="true" />}
      </button>
      {open && node.children.map((child) => <TreeRow key={child.path} node={child} depth={depth + 1} />)}
    </div>
  );
}

interface FileTreeProps {
  files: readonly string[];
  changed?: readonly string[];
  truncated?: boolean;
  loading?: boolean;
}

export function FileTree({ files, changed, truncated, loading }: FileTreeProps) {
  const tree = buildFileTree(files, changed);
  if (loading && files.length === 0) {
    return <div class="filetree-empty">Loading files…</div>;
  }
  if (tree.length === 0) {
    return <div class="filetree-empty">No files in this workspace yet.</div>;
  }
  return (
    <div class="filetree">
      {tree.map((node) => (
        <TreeRow key={node.path} node={node} depth={0} />
      ))}
      {truncated && <div class="filetree-truncated">…list truncated (very large repo)</div>}
    </div>
  );
}
