/**
 * Dependency Resolver
 *
 * Resolves file dependencies by analyzing import statements and building
 * a dependency graph. Supports:
 * - Relative imports (./file, ../file)
 * - Index file resolution (./dir -> ./dir/index)
 * - Extension resolution (.ts, .tsx, .js, .jsx)
 * - Package.json exports/main resolution
 * - Path alias resolution (@ aliases)
 */

import type { DependencyGraph, DependencyNode, ImportInfo, SymbolInfo } from './types';
import { extractImportStatements, extractSymbols } from './symbol-tracker';

/**
 * File extensions to try when resolving imports
 */
const RESOLVE_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
];

/**
 * Build dependency graph from project files
 */
export function buildDependencyGraph(
  files: Map<string, string>,
  entryPoints: string[] = []
): DependencyGraph {
  const startTime = Date.now();
  const nodes = new Map<string, DependencyNode>();

  // First pass: extract imports and exports for each file
  for (const [filePath, content] of files) {
    const language = detectLanguage(filePath);
    const imports = extractImportStatements(content, language);
    const exports = extractSymbols(content, filePath, language).filter(s => s.exported);

    nodes.set(filePath, {
      path: filePath,
      imports,
      exports,
      importedBy: [],
      depth: Infinity,
      isEntryPoint: entryPoints.includes(filePath),
    });
  }

  // Detect entry points if not provided
  const detectedEntryPoints = entryPoints.length > 0
    ? entryPoints
    : detectEntryPoints(Array.from(files.keys()));

  // Second pass: resolve imports and build reverse dependencies
  for (const [filePath, node] of nodes) {
    for (const imp of node.imports) {
      if (!imp.isRelative) continue;

      const resolvedPath = resolveImportPath(imp.source, filePath, files);
      if (resolvedPath && nodes.has(resolvedPath)) {
        nodes.get(resolvedPath)!.importedBy.push(filePath);
      }
    }
  }

  // Third pass: calculate depths from entry points
  for (const entryPoint of detectedEntryPoints) {
    if (nodes.has(entryPoint)) {
      calculateDepths(entryPoint, nodes, 0, new Set());
    }
  }

  return {
    nodes,
    entryPoints: detectedEntryPoints,
    totalFiles: files.size,
    buildTime: Date.now() - startTime,
  };
}

/**
 * Resolve an import path to an actual file path
 */
export function resolveImportPath(
  importPath: string,
  fromFile: string,
  files: Map<string, string>,
  pathAliases?: Record<string, string>
): string | null {
  // Handle path aliases (like @ -> src)
  if (pathAliases) {
    for (const [alias, target] of Object.entries(pathAliases)) {
      if (importPath.startsWith(alias)) {
        importPath = importPath.replace(alias, target);
        break;
      }
    }
  }

  // Handle non-relative imports
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null; // npm package, not a local file
  }

  // Get the directory of the importing file
  const fromDir = fromFile.split('/').slice(0, -1).join('/');

  // Resolve relative path
  const parts = importPath.split('/');
  const resolvedParts = fromDir.split('/').filter(Boolean);

  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      resolvedParts.pop();
    } else {
      resolvedParts.push(part);
    }
  }

  const basePath = resolvedParts.join('/');

  // Try different extensions
  for (const ext of RESOLVE_EXTENSIONS) {
    const fullPath = basePath + ext;
    if (files.has(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Calculate depths using BFS from entry points
 */
function calculateDepths(
  startPath: string,
  nodes: Map<string, DependencyNode>,
  startDepth: number,
  visited: Set<string>
): void {
  const queue: Array<{ path: string; depth: number }> = [
    { path: startPath, depth: startDepth },
  ];

  while (queue.length > 0) {
    const { path, depth } = queue.shift()!;

    if (visited.has(path)) continue;
    visited.add(path);

    const node = nodes.get(path);
    if (!node) continue;

    // Update depth if this path is shorter
    if (depth < node.depth) {
      node.depth = depth;
    }

    // Add imported files to queue
    for (const imp of node.imports) {
      if (!imp.isRelative) continue;

      // Find the resolved path
      for (const [otherPath, otherNode] of nodes) {
        if (otherNode.importedBy.includes(path) || path === otherPath) continue;

        const resolvedImport = resolveImportPathSimple(imp.source, path);
        if (otherPath.includes(resolvedImport) || resolvedImport.includes(otherPath.replace(/\.[^.]+$/, ''))) {
          queue.push({ path: otherPath, depth: depth + 1 });
        }
      }
    }
  }
}

/**
 * Simple path resolution without file system check
 */
function resolveImportPathSimple(importPath: string, fromFile: string): string {
  if (!importPath.startsWith('.')) return importPath;

  const fromDir = fromFile.split('/').slice(0, -1).join('/');
  const parts = importPath.split('/');
  const resolvedParts = fromDir.split('/').filter(Boolean);

  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      resolvedParts.pop();
    } else {
      resolvedParts.push(part);
    }
  }

  return resolvedParts.join('/');
}

/**
 * Detect entry points from file list
 */
export function detectEntryPoints(filePaths: string[]): string[] {
  const entryPoints: string[] = [];
  const patterns = [
    /^(?:src\/)?(?:main|index|app|App)\.(tsx?|jsx?|mjs)$/,
    /^(?:src\/)?pages\/index\.(tsx?|jsx?)$/,
    /^(?:app\/)?page\.(tsx?|jsx?)$/,
    /^(?:src\/)?routes\/index\.(tsx?|jsx?)$/,
  ];

  for (const path of filePaths) {
    for (const pattern of patterns) {
      if (pattern.test(path)) {
        entryPoints.push(path);
        break;
      }
    }
  }

  // If no patterns matched, look for common entry point names
  if (entryPoints.length === 0) {
    for (const path of filePaths) {
      const fileName = path.split('/').pop() || '';
      if (['App.tsx', 'App.jsx', 'index.tsx', 'index.jsx', 'main.tsx', 'main.ts'].includes(fileName)) {
        entryPoints.push(path);
      }
    }
  }

  return entryPoints;
}

/**
 * Get all dependencies of a file (files it imports)
 */
export function getDependencies(
  filePath: string,
  graph: DependencyGraph,
  maxDepth: number = 3
): string[] {
  const dependencies = new Set<string>();
  const queue: Array<{ path: string; depth: number }> = [{ path: filePath, depth: 0 }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { path, depth } = queue.shift()!;

    if (visited.has(path) || depth > maxDepth) continue;
    visited.add(path);

    const node = graph.nodes.get(path);
    if (!node) continue;

    for (const imp of node.imports) {
      if (!imp.isRelative) continue;

      // Find resolved file
      for (const [otherPath] of graph.nodes) {
        if (otherPath === path) continue;

        const resolved = resolveImportPathSimple(imp.source, path);
        if (otherPath.includes(resolved) || resolved.includes(otherPath.replace(/\.[^.]+$/, ''))) {
          if (!visited.has(otherPath)) {
            dependencies.add(otherPath);
            queue.push({ path: otherPath, depth: depth + 1 });
          }
        }
      }
    }
  }

  return Array.from(dependencies);
}

/**
 * Get all dependents of a file (files that import it)
 */
export function getDependents(
  filePath: string,
  graph: DependencyGraph,
  maxDepth: number = 3
): string[] {
  const dependents = new Set<string>();
  const queue: Array<{ path: string; depth: number }> = [{ path: filePath, depth: 0 }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { path, depth } = queue.shift()!;

    if (visited.has(path) || depth > maxDepth) continue;
    visited.add(path);

    const node = graph.nodes.get(path);
    if (!node) continue;

    for (const dependent of node.importedBy) {
      if (!visited.has(dependent)) {
        dependents.add(dependent);
        queue.push({ path: dependent, depth: depth + 1 });
      }
    }
  }

  return Array.from(dependents);
}

/**
 * Get the full dependency chain for a file (both directions)
 */
export function getDependencyChain(
  filePath: string,
  graph: DependencyGraph,
  maxDepth: number = 2
): {
  dependencies: string[];
  dependents: string[];
  all: string[];
} {
  const dependencies = getDependencies(filePath, graph, maxDepth);
  const dependents = getDependents(filePath, graph, maxDepth);
  const all = [...new Set([...dependencies, ...dependents])];

  return { dependencies, dependents, all };
}

/**
 * Find circular dependencies
 */
export function findCircularDependencies(
  graph: DependencyGraph
): Array<string[]> {
  const cycles: Array<string[]> = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(path: string, currentPath: string[]): void {
    if (recursionStack.has(path)) {
      // Found a cycle
      const cycleStart = currentPath.indexOf(path);
      if (cycleStart !== -1) {
        cycles.push(currentPath.slice(cycleStart));
      }
      return;
    }

    if (visited.has(path)) return;

    visited.add(path);
    recursionStack.add(path);
    currentPath.push(path);

    const node = graph.nodes.get(path);
    if (node) {
      for (const imp of node.imports) {
        if (!imp.isRelative) continue;

        for (const [otherPath] of graph.nodes) {
          const resolved = resolveImportPathSimple(imp.source, path);
          if (otherPath.includes(resolved) || resolved.includes(otherPath.replace(/\.[^.]+$/, ''))) {
            dfs(otherPath, [...currentPath]);
          }
        }
      }
    }

    recursionStack.delete(path);
  }

  for (const [path] of graph.nodes) {
    dfs(path, []);
  }

  return cycles;
}

/**
 * Get files ordered by dependency (files with no dependencies first)
 */
export function topologicalSort(graph: DependencyGraph): string[] {
  const sorted: string[] = [];
  const visited = new Set<string>();
  const temp = new Set<string>();

  function visit(path: string): void {
    if (visited.has(path)) return;
    if (temp.has(path)) return; // Cycle detected, skip

    temp.add(path);

    const node = graph.nodes.get(path);
    if (node) {
      for (const imp of node.imports) {
        if (!imp.isRelative) continue;

        for (const [otherPath] of graph.nodes) {
          const resolved = resolveImportPathSimple(imp.source, path);
          if (otherPath.includes(resolved) || resolved.includes(otherPath.replace(/\.[^.]+$/, ''))) {
            visit(otherPath);
          }
        }
      }
    }

    temp.delete(path);
    visited.add(path);
    sorted.push(path);
  }

  for (const [path] of graph.nodes) {
    visit(path);
  }

  return sorted;
}

/**
 * Get dependency statistics
 */
export function getDependencyStats(graph: DependencyGraph): {
  totalFiles: number;
  totalImports: number;
  avgImportsPerFile: number;
  maxImports: { file: string; count: number };
  mostImported: { file: string; count: number };
  orphanFiles: string[];
  cycles: number;
} {
  let totalImports = 0;
  let maxImports = { file: '', count: 0 };
  let mostImported = { file: '', count: 0 };
  const orphanFiles: string[] = [];

  for (const [path, node] of graph.nodes) {
    const importCount = node.imports.filter(i => i.isRelative).length;
    totalImports += importCount;

    if (importCount > maxImports.count) {
      maxImports = { file: path, count: importCount };
    }

    if (node.importedBy.length > mostImported.count) {
      mostImported = { file: path, count: node.importedBy.length };
    }

    if (importCount === 0 && node.importedBy.length === 0 && !node.isEntryPoint) {
      orphanFiles.push(path);
    }
  }

  return {
    totalFiles: graph.totalFiles,
    totalImports,
    avgImportsPerFile: totalImports / graph.totalFiles,
    maxImports,
    mostImported,
    orphanFiles,
    cycles: findCircularDependencies(graph).length,
  };
}

/**
 * Detect language from file path
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
  };
  return languageMap[ext] || 'text';
}
