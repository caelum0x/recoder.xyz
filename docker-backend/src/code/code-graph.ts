/**
 * @module code-graph
 *
 * Lightweight code knowledge graph — the "code intelligence" pillar, inspired
 * by RecoderGit (abhigyanpatwari/RecoderGit). Given a set of source files it builds
 * a queryable graph of files + symbols (nodes) and imports + definitions
 * (edges), so agents can navigate a codebase: find a symbol, list a file's
 * exports, see who imports a module, or trace dependencies.
 *
 * Storage-decoupled by design: callers pass `{ path, content }[]` (from a
 * sandbox, container, upload, or disk), keeping this pure and testable. A
 * heuristic parser handles TS/JS and Python without pulling a tree-sitter/WASM
 * toolchain — good enough for navigation, cheap enough to run on every project.
 */

export type SymbolKind = 'function' | 'class' | 'const' | 'interface' | 'type' | 'enum' | 'default';
export type CodeLang = 'ts' | 'js' | 'python' | 'other';

export interface SourceFile {
  path: string;
  content: string;
}

export interface CodeGraphNode {
  id: string;
  type: 'file' | 'symbol' | 'module';
  name: string;
  path?: string;
  symbolKind?: SymbolKind;
  lang?: CodeLang;
  line?: number;
}

export interface CodeGraphEdge {
  from: string;
  to: string;
  type: 'imports' | 'defines';
  raw?: string;
  resolved?: boolean;
}

export interface CodeGraph {
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
  stats: {
    files: number;
    symbols: number;
    imports: number;
    externalModules: number;
    byLang: Record<string, number>;
  };
}

export interface BuildOptions {
  maxFiles?: number;
  maxFileBytes?: number;
}

const DEFAULT_MAX_FILES = 5000;
const DEFAULT_MAX_FILE_BYTES = 1_000_000;

const TS_EXT = new Set(['ts', 'tsx', 'mts', 'cts']);
const JS_EXT = new Set(['js', 'jsx', 'mjs', 'cjs']);

function detectLang(path: string): CodeLang {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (TS_EXT.has(ext)) return 'ts';
  if (JS_EXT.has(ext)) return 'js';
  if (ext === 'py') return 'python';
  return 'other';
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function dirname(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx === -1 ? '' : p.slice(0, idx);
}

function joinPath(base: string, rel: string): string {
  const parts = base ? base.split('/') : [];
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

const JS_RESOLVE_EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

/** Resolve a relative JS/TS import to a known file path, if one exists. */
function resolveRelativeImport(importerPath: string, spec: string, fileSet: Set<string>): string | null {
  if (!spec.startsWith('.')) return null;
  const base = joinPath(dirname(importerPath), spec);
  for (const ext of JS_RESOLVE_EXTS) {
    const candidate = base + ext;
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

interface ParsedFile {
  imports: string[];
  symbols: Array<{ name: string; kind: SymbolKind; line: number }>;
}

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

function parseJsTs(content: string): ParsedFile {
  const imports = new Set<string>();
  const symbols: ParsedFile['symbols'] = [];

  const importRe = /\bimport\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const requireRe = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
  const exportFromRe = /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g;
  const dynImportRe = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [importRe, requireRe, exportFromRe, dynImportRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) imports.add(m[1]);
  }

  const symbolPatterns: Array<{ re: RegExp; kind: SymbolKind }> = [
    { re: /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, kind: 'function' },
    { re: /\bexport\s+class\s+([A-Za-z_$][\w$]*)/g, kind: 'class' },
    { re: /\bexport\s+interface\s+([A-Za-z_$][\w$]*)/g, kind: 'interface' },
    { re: /\bexport\s+type\s+([A-Za-z_$][\w$]*)/g, kind: 'type' },
    { re: /\bexport\s+enum\s+([A-Za-z_$][\w$]*)/g, kind: 'enum' },
    { re: /\bexport\s+const\s+([A-Za-z_$][\w$]*)/g, kind: 'const' },
    { re: /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm, kind: 'function' },
    { re: /^class\s+([A-Za-z_$][\w$]*)/gm, kind: 'class' },
  ];
  const seen = new Set<string>();
  for (const { re, kind } of symbolPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const key = `${kind}:${m[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      symbols.push({ name: m[1], kind, line: lineOf(content, m.index) });
    }
  }
  if (/\bexport\s+default\b/.test(content)) {
    symbols.push({ name: 'default', kind: 'default', line: lineOf(content, content.indexOf('export default')) });
  }

  return { imports: Array.from(imports), symbols };
}

function parsePython(content: string): ParsedFile {
  const imports = new Set<string>();
  const symbols: ParsedFile['symbols'] = [];

  const importRe = /^\s*import\s+([A-Za-z_][\w.]*)/gm;
  const fromRe = /^\s*from\s+([A-Za-z_.][\w.]*)\s+import\b/gm;
  for (const re of [importRe, fromRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) imports.add(m[1]);
  }

  const defRe = /^\s*def\s+([A-Za-z_]\w*)/gm;
  const classRe = /^\s*class\s+([A-Za-z_]\w*)/gm;
  let m: RegExpExecArray | null;
  while ((m = defRe.exec(content)) !== null) symbols.push({ name: m[1], kind: 'function', line: lineOf(content, m.index) });
  while ((m = classRe.exec(content)) !== null) symbols.push({ name: m[1], kind: 'class', line: lineOf(content, m.index) });

  return { imports: Array.from(imports), symbols };
}

export function buildCodeGraph(files: SourceFile[], options: BuildOptions = {}): CodeGraph {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;

  const selected = files
    .filter((f) => f && typeof f.path === 'string' && typeof f.content === 'string')
    .map((f) => ({ path: normalizePath(f.path), content: f.content }))
    .filter((f) => detectLang(f.path) !== 'other' && f.content.length <= maxFileBytes)
    .slice(0, maxFiles);

  const fileSet = new Set(selected.map((f) => f.path));
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  const moduleNodes = new Set<string>();
  const byLang: Record<string, number> = {};
  let symbolCount = 0;
  let importCount = 0;

  for (const file of selected) {
    const lang = detectLang(file.path);
    byLang[lang] = (byLang[lang] ?? 0) + 1;
    const fileId = `file:${file.path}`;
    nodes.push({ id: fileId, type: 'file', name: file.path.split('/').pop() ?? file.path, path: file.path, lang });

    const parsed = lang === 'python' ? parsePython(file.content) : parseJsTs(file.content);

    for (const spec of parsed.imports) {
      const resolved = resolveRelativeImport(file.path, spec, fileSet);
      if (resolved) {
        edges.push({ from: fileId, to: `file:${resolved}`, type: 'imports', raw: spec, resolved: true });
      } else {
        const moduleId = `module:${spec}`;
        if (!moduleNodes.has(moduleId)) {
          moduleNodes.add(moduleId);
          nodes.push({ id: moduleId, type: 'module', name: spec });
        }
        edges.push({ from: fileId, to: moduleId, type: 'imports', raw: spec, resolved: false });
      }
      importCount++;
    }

    for (const sym of parsed.symbols) {
      const symbolId = `symbol:${file.path}#${sym.kind}:${sym.name}`;
      nodes.push({
        id: symbolId,
        type: 'symbol',
        name: sym.name,
        path: file.path,
        symbolKind: sym.kind,
        lang,
        line: sym.line,
      });
      edges.push({ from: fileId, to: symbolId, type: 'defines' });
      symbolCount++;
    }
  }

  return {
    nodes,
    edges,
    stats: {
      files: selected.length,
      symbols: symbolCount,
      imports: importCount,
      externalModules: moduleNodes.size,
      byLang,
    },
  };
}

// ---------------------------------------------------------------------------
// Navigation queries over a built graph
// ---------------------------------------------------------------------------

export function findSymbol(graph: CodeGraph, name: string): CodeGraphNode[] {
  const q = name.toLowerCase();
  return graph.nodes.filter((n) => n.type === 'symbol' && n.name.toLowerCase() === q);
}

export function searchSymbols(graph: CodeGraph, query: string, limit = 50): CodeGraphNode[] {
  const q = query.toLowerCase();
  return graph.nodes
    .filter((n) => n.type === 'symbol' && n.name.toLowerCase().includes(q))
    .slice(0, limit);
}

export function fileSymbols(graph: CodeGraph, path: string): CodeGraphNode[] {
  const p = normalizePath(path);
  return graph.nodes.filter((n) => n.type === 'symbol' && n.path === p);
}

export function whoImports(graph: CodeGraph, path: string): string[] {
  const target = `file:${normalizePath(path)}`;
  return graph.edges
    .filter((e) => e.type === 'imports' && e.to === target)
    .map((e) => e.from.replace(/^file:/, ''));
}

export function dependenciesOf(graph: CodeGraph, path: string): Array<{ target: string; external: boolean; raw?: string }> {
  const from = `file:${normalizePath(path)}`;
  return graph.edges
    .filter((e) => e.type === 'imports' && e.from === from)
    .map((e) => ({
      target: e.resolved ? e.to.replace(/^file:/, '') : e.to.replace(/^module:/, ''),
      external: !e.resolved,
      raw: e.raw,
    }));
}

/**
 * Produce a compact, token-bounded text summary of the graph for injecting into
 * an agent's prompt: file count + language breakdown, then a per-file list of
 * its exported/defined symbols. Capped so it stays prompt-friendly.
 */
export function summarizeGraph(
  graph: CodeGraph,
  opts: { maxFiles?: number; maxSymbolsPerFile?: number } = {},
): string {
  const maxFiles = opts.maxFiles ?? 80;
  const maxSymbolsPerFile = opts.maxSymbolsPerFile ?? 8;

  const symbolsByFile = new Map<string, CodeGraphNode[]>();
  for (const node of graph.nodes) {
    if (node.type === 'symbol' && node.path) {
      const list = symbolsByFile.get(node.path) ?? [];
      list.push(node);
      symbolsByFile.set(node.path, list);
    }
  }

  const files = graph.nodes
    .filter((n) => n.type === 'file' && n.path)
    .sort((a, b) => (symbolsByFile.get(b.path!)?.length ?? 0) - (symbolsByFile.get(a.path!)?.length ?? 0))
    .slice(0, maxFiles);

  const langSummary = Object.entries(graph.stats.byLang)
    .map(([lang, count]) => `${count} ${lang}`)
    .join(', ');

  const lines: string[] = [
    `${graph.stats.files} files (${langSummary}), ${graph.stats.symbols} symbols, ${graph.stats.imports} imports.`,
    '',
  ];

  for (const file of files) {
    const syms = (symbolsByFile.get(file.path!) ?? []).slice(0, maxSymbolsPerFile);
    if (syms.length === 0) {
      lines.push(file.path!);
    } else {
      const names = syms.map((s) => `${s.name}${s.symbolKind ? `:${s.symbolKind}` : ''}`).join(', ');
      lines.push(`${file.path!} — ${names}`);
    }
  }

  if (graph.nodes.filter((n) => n.type === 'file').length > maxFiles) {
    lines.push(`… and ${graph.nodes.filter((n) => n.type === 'file').length - maxFiles} more files`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// In-memory graph store (build once, query many)
// ---------------------------------------------------------------------------

interface StoredGraph {
  graph: CodeGraph;
  builtAt: number;
}

const graphStore = new Map<string, StoredGraph>();
const GRAPH_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_STORED_GRAPHS = 100;

export function storeGraph(id: string, graph: CodeGraph): void {
  if (graphStore.size >= MAX_STORED_GRAPHS) {
    // Evict the oldest entry.
    let oldestId: string | undefined;
    let oldest = Infinity;
    for (const [key, value] of graphStore.entries()) {
      if (value.builtAt < oldest) {
        oldest = value.builtAt;
        oldestId = key;
      }
    }
    if (oldestId) graphStore.delete(oldestId);
  }
  graphStore.set(id, { graph, builtAt: Date.now() });
}

export function getStoredGraph(id: string): CodeGraph | undefined {
  const entry = graphStore.get(id);
  if (!entry) return undefined;
  if (Date.now() - entry.builtAt > GRAPH_TTL_MS) {
    graphStore.delete(id);
    return undefined;
  }
  return entry.graph;
}

export function deleteStoredGraph(id: string): boolean {
  return graphStore.delete(id);
}
