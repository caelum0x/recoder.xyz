import path from 'node:path';
import type {
  ProcessNode,
  SymbolCallEdge,
  SymbolNode,
} from './dependency-graph';

export type SymbolEvidenceSource = {
  filePath: string;
  source: string;
};

export type SymbolEvidenceImport = {
  from: string;
  to: string | null;
  specifier: string;
};

export type SymbolEvidence = {
  symbols: SymbolNode[];
  symbolCalls: SymbolCallEdge[];
  processes: ProcessNode[];
};

type DefinitionSpan = SymbolNode & {
  start: number;
  end: number;
  nameOffset: number;
};

type ImportBinding = {
  specifier: string;
  local: string;
  imported?: string;
  namespace: boolean;
};

function maskNoise(source: string, hashComments = false): string {
  const chars = [...source];
  let quote: string | null = null;
  let blockComment = false;
  let lineComment = false;
  let escaped = false;
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] ?? '';
    const next = chars[index + 1] ?? '';
    if (lineComment) {
      if (char === '\n') lineComment = false;
      else chars[index] = ' ';
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        chars[index] = ' ';
        chars[index + 1] = ' ';
        blockComment = false;
        index += 1;
      } else if (char !== '\n') chars[index] = ' ';
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      if (char !== '\n') chars[index] = ' ';
      continue;
    }
    if (char === '/' && next === '/') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      blockComment = true;
      index += 1;
      continue;
    }
    if (hashComments && char === '#') {
      chars[index] = ' ';
      lineComment = true;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      chars[index] = ' ';
    }
  }
  return chars.join('');
}

function stripComments(source: string, hashComments: boolean): string {
  const chars = [...source];
  let quote: string | null = null;
  let blockComment = false;
  let lineComment = false;
  let escaped = false;
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] ?? '';
    const next = chars[index + 1] ?? '';
    if (lineComment) {
      if (char === '\n') lineComment = false;
      else chars[index] = ' ';
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        chars[index] = ' ';
        chars[index + 1] = ' ';
        blockComment = false;
        index += 1;
      } else if (char !== '\n') chars[index] = ' ';
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '/' && next === '/') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      lineComment = true;
      index += 1;
    } else if (char === '/' && next === '*') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      blockComment = true;
      index += 1;
    } else if (hashComments && char === '#') {
      chars[index] = ' ';
      lineComment = true;
    }
  }
  return chars.join('');
}

function matchingBrace(source: string, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return source.length;
}

function bracedDefinitions(
  filePath: string,
  masked: string,
  patterns: readonly { regex: RegExp; kind: SymbolNode['kind'] }[],
): DefinitionSpan[] {
  const spans: DefinitionSpan[] = [];
  for (const { regex, kind } of patterns) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(masked)) !== null) {
      const name = match[1];
      if (!name || match.index === undefined) continue;
      if (kind === 'method' && new Set([
        'if', 'for', 'while', 'switch', 'catch', 'with', 'function', 'constructor',
      ]).has(name)) continue;
      const open = masked.indexOf('{', match.index);
      if (open === -1 || open >= match.index + match[0].length + 1) continue;
      const relativeName = match[0].indexOf(name);
      spans.push({
        filePath,
        name,
        kind,
        start: match.index,
        end: matchingBrace(masked, open),
        nameOffset: match.index + Math.max(0, relativeName),
      });
    }
  }
  return spans;
}

function pythonDefinitions(filePath: string, source: string): DefinitionSpan[] {
  const lines = source.split(/(?<=\n)/);
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length;
  }
  const spans: DefinitionSpan[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const match = line.match(/^(\s*)(?:async\s+)?(def|class)\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (!match?.[2] || !match[3]) continue;
    const indent = match[1]?.replace(/\t/g, '    ').length ?? 0;
    let endLine = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor] ?? '';
      if (!candidate.trim() || /^\s*#/.test(candidate)) continue;
      const candidateIndent = candidate.match(/^\s*/)?.[0].replace(/\t/g, '    ').length ?? 0;
      if (candidateIndent <= indent) {
        endLine = cursor;
        break;
      }
    }
    const start = offsets[index] ?? 0;
    spans.push({
      filePath,
      name: match[3],
      kind: match[2] === 'class' ? 'class' : 'function',
      start,
      end: offsets[endLine] ?? source.length,
      nameOffset: start + line.indexOf(match[3]),
    });
  }
  return spans;
}

function jsExpressionDefinitions(filePath: string, masked: string): DefinitionSpan[] {
  const spans: DefinitionSpan[] = [];
  const pattern = /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(masked)) !== null) {
    const name = match[1];
    if (!name) continue;
    const bodyStart = match.index + match[0].length;
    const whitespace = masked.slice(bodyStart).match(/^\s*/)?.[0].length ?? 0;
    if (masked[bodyStart + whitespace] === '{') continue;
    const lineEnd = masked.indexOf('\n', bodyStart);
    const semicolon = masked.indexOf(';', bodyStart);
    const endCandidates = [lineEnd, semicolon].filter((value) => value >= bodyStart);
    const end = endCandidates.length > 0 ? Math.min(...endCandidates) + 1 : masked.length;
    spans.push({
      filePath,
      name,
      kind: 'function',
      start: match.index,
      end,
      nameOffset: match.index + match[0].indexOf(name),
    });
  }
  return spans;
}

function definitionsFor(filePath: string, source: string): DefinitionSpan[] {
  if (filePath.endsWith('.py')) return pythonDefinitions(filePath, source);
  const masked = maskNoise(source);
  if (filePath.endsWith('.go')) {
    return bracedDefinitions(filePath, masked, [
      { regex: /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)[^{]*\{/g, kind: 'function' },
    ]);
  }
  if (filePath.endsWith('.rs')) {
    return bracedDefinitions(filePath, masked, [
      { regex: /\b(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>{}]*>)?\s*\([^)]*\)[^{]*\{/g, kind: 'function' },
    ]);
  }
  return [
    ...bracedDefinitions(filePath, masked, [
    { regex: /\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)[^{};]*\{/g, kind: 'function' },
    { regex: /\b(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)[^{};]*\{/g, kind: 'class' },
    { regex: /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:function\b[^{};]*|(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>)\s*\{/g, kind: 'function' },
    { regex: /^[ \t]*(?:(?:public|private|protected|static|async|readonly|override|get|set)\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^;\n{}]*\)\s*(?::[^\n{]+)?\{/gm, kind: 'method' },
    ]),
    ...jsExpressionDefinitions(filePath, masked),
  ];
}

function splitNamedBindings(value: string): Array<{ imported: string; local: string }> {
  return value.split(',').flatMap((raw) => {
    const clean = raw.trim().replace(/^type\s+/, '');
    const match = clean.match(/^([A-Za-z_$][A-Za-z0-9_$]*)(?:\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?$/);
    return match?.[1]
      ? [{ imported: match[1], local: match[2] ?? match[1] }]
      : [];
  });
}

function jsBindings(source: string): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  for (const match of source.matchAll(/\bimport\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g)) {
    const clause = match[1]?.trim() ?? '';
    const specifier = match[2];
    if (!specifier) continue;
    const namespace = clause.match(/\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (namespace?.[1]) bindings.push({ specifier, local: namespace[1], namespace: true });
    const named = clause.match(/\{([\s\S]*?)\}/)?.[1];
    if (named) {
      for (const item of splitNamedBindings(named)) bindings.push({ specifier, ...item, namespace: false });
    }
    const defaultName = clause.split(',')[0]?.trim();
    if (defaultName && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(defaultName)) {
      bindings.push({ specifier, local: defaultName, imported: defaultName, namespace: false });
    }
  }
  for (const match of source.matchAll(/\b(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (!match[1] || !match[2]) continue;
    for (const item of splitNamedBindings(match[1].replace(/:/g, ' as '))) {
      bindings.push({ specifier: match[2], ...item, namespace: false });
    }
  }
  for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (match[1] && match[2]) bindings.push({ specifier: match[2], local: match[1], namespace: true });
  }
  return bindings;
}

function pythonBindings(source: string): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const from = line.match(/^from\s+([A-Za-z_.][A-Za-z0-9_.]*)\s+import\s+(.+)$/);
    if (from?.[1] && from[2]) {
      for (const raw of from[2].replace(/[()]/g, '').split(',')) {
        const item = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/);
        if (item?.[1]) bindings.push({
          specifier: from[1],
          imported: item[1],
          local: item[2] ?? item[1],
          namespace: false,
        });
      }
      continue;
    }
    const direct = line.match(/^import\s+(.+)$/);
    for (const raw of direct?.[1]?.split(',') ?? []) {
      const item = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_.]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/);
      if (item?.[1]) bindings.push({
        specifier: item[1],
        local: item[2] ?? item[1].split('.')[0] ?? item[1],
        namespace: true,
      });
    }
  }
  return bindings;
}

function goBindings(source: string): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  const add = (value: string): void => {
    const match = value.trim().match(/^(?:([A-Za-z_][A-Za-z0-9_]*)\s+)?["`]([^"`]+)["`]$/);
    if (!match?.[2] || match[1] === '_' || match[1] === '.') return;
    bindings.push({
      specifier: match[2],
      local: match[1] ?? path.posix.basename(match[2]),
      namespace: true,
    });
  };
  for (const block of source.matchAll(/\bimport\s*\(([\s\S]*?)\)/g)) {
    for (const line of block[1]?.split(/\r?\n/) ?? []) add(line.replace(/\/\/.*$/, ''));
  }
  const withoutBlocks = source.replace(/\bimport\s*\([\s\S]*?\)/g, '');
  for (const direct of withoutBlocks.matchAll(/\bimport\s+([^\n;]+)/g)) add(direct[1] ?? '');
  return bindings;
}

function rustBindings(source: string): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  for (const match of source.matchAll(/\buse\s+([^;]+);/g)) {
    const specifier = match[1]?.trim();
    if (!specifier) continue;
    const open = specifier.indexOf('{');
    const close = specifier.lastIndexOf('}');
    if (open !== -1 && close > open) {
      for (const raw of specifier.slice(open + 1, close).split(',')) {
        const item = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/);
        if (item?.[1] && item[1] !== 'self') bindings.push({
          specifier,
          imported: item[1],
          local: item[2] ?? item[1],
          namespace: false,
        });
      }
      continue;
    }
    const segments = specifier.replace(/\s+as\s+\w+$/, '').split('::').filter(Boolean);
    const imported = segments.at(-1);
    const alias = specifier.match(/\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/)?.[1];
    if (imported) bindings.push({ specifier, imported, local: alias ?? imported, namespace: false });
  }
  return bindings;
}

function bindingsFor(filePath: string, source: string): ImportBinding[] {
  if (filePath.endsWith('.py')) return pythonBindings(source);
  if (filePath.endsWith('.go')) return goBindings(source);
  if (filePath.endsWith('.rs')) return rustBindings(source);
  return jsBindings(source);
}

function enclosingCaller(spans: readonly DefinitionSpan[], offset: number): string {
  return spans
    .filter((span) => span.start <= offset && span.end >= offset)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0]?.name ?? '<module>';
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addCall(
  calls: Map<string, SymbolCallEdge>,
  spans: readonly DefinitionSpan[],
  from: string,
  to: string,
  callee: string,
  offset: number,
): void {
  const caller = enclosingCaller(spans, offset);
  const edge: SymbolCallEdge = { from, to, caller, callee, confidence: 1 };
  calls.set(`${from}\0${caller}\0${to}\0${callee}`, edge);
}

function processNodes(filePath: string, source: string, definitions: readonly DefinitionSpan[]): ProcessNode[] {
  const nodes: ProcessNode[] = [];
  const basename = path.posix.basename(filePath);
  const code = stripComments(source, filePath.endsWith('.py'));
  const add = (node: ProcessNode): void => {
    if (!nodes.some((existing) => existing.id === node.id)) nodes.push(node);
  };
  const hasMain = definitions.some((item) => item.name === 'main');
  if ((filePath.endsWith('.go') && /\bpackage\s+main\b/.test(code) && hasMain) ||
      (filePath.endsWith('.rs') && hasMain && (basename === 'main.rs' || filePath.includes('/bin/'))) ||
      (filePath.endsWith('.py') && /if\s+__name__\s*==\s*['"]__main__['"]\s*:/.test(code))) {
    add({ id: `entrypoint:${filePath}`, label: `Entrypoint ${filePath}`, processType: 'entrypoint', filePath, ...(hasMain ? { symbol: 'main' } : {}) });
  }
  if (/^#!/.test(source)) {
    add({ id: `entrypoint:${filePath}`, label: `CLI ${filePath}`, processType: 'entrypoint', filePath });
  }
  if (/\.listen\s*\(/.test(maskNoise(source))) {
    add({ id: `server:${filePath}`, label: `Server ${filePath}`, processType: 'server', filePath });
  }
  if (/addEventListener\s*\(\s*['"]fetch['"]|\bfetch\s*\([^)]*\)\s*\{/.test(code)) {
    add({ id: `worker:${filePath}`, label: `Worker ${filePath}`, processType: 'worker', filePath, symbol: 'fetch' });
  }
  const routePatterns = [
    /\b(?:app|router|server)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /\bHandleFunc\s*\(\s*"([^"]+)"/g,
    /^\s*@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/gm,
  ];
  for (const [index, pattern] of routePatterns.entries()) {
    for (const match of code.matchAll(pattern)) {
      const method = index === 1 ? 'ANY' : (match[1] ?? 'ANY').toUpperCase();
      const route = index === 1 ? match[1] : match[2];
      if (!route) continue;
      add({
        id: `route:${method}:${route}:${filePath}`,
        label: `${method} ${route}`,
        processType: 'route',
        filePath,
      });
    }
  }
  return nodes;
}

/**
 * Extract declaration-backed static calls plus exact executable and route
 * entrypoints. A cross-file call is emitted only when its imported target
 * resolves to a scanned file that declares the callee.
 */
export function extractSymbolEvidence(
  sourceFiles: readonly SymbolEvidenceSource[],
  imports: readonly SymbolEvidenceImport[],
): SymbolEvidence {
  const spansByFile = new Map<string, DefinitionSpan[]>();
  const definitionsByFile = new Map<string, Map<string, DefinitionSpan>>();
  const symbols: SymbolNode[] = [];
  const processes: ProcessNode[] = [];
  for (const file of sourceFiles) {
    const spans = definitionsFor(file.filePath, file.source);
    spansByFile.set(file.filePath, spans);
    const byName = new Map<string, DefinitionSpan>();
    for (const span of spans) {
      if (!byName.has(span.name)) {
        byName.set(span.name, span);
        symbols.push({ filePath: span.filePath, name: span.name, kind: span.kind });
      }
    }
    definitionsByFile.set(file.filePath, byName);
    processes.push(...processNodes(file.filePath, file.source, spans));
  }

  const targets = new Map<string, string[]>();
  for (const edge of imports) {
    if (!edge.to) continue;
    const key = `${edge.from}\0${edge.specifier}`;
    targets.set(key, [...new Set([...(targets.get(key) ?? []), edge.to])]);
  }

  const calls = new Map<string, SymbolCallEdge>();
  for (const file of sourceFiles) {
    const masked = maskNoise(file.source, file.filePath.endsWith('.py'));
    const spans = spansByFile.get(file.filePath) ?? [];
    const localDefinitions = definitionsByFile.get(file.filePath) ?? new Map();
    for (const definition of localDefinitions.values()) {
      const pattern = new RegExp(`\\b${escaped(definition.name)}\\s*\\(`, 'g');
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(masked)) !== null) {
        if (match.index === definition.nameOffset) continue;
        addCall(calls, spans, file.filePath, file.filePath, definition.name, match.index);
      }
    }

    for (const binding of bindingsFor(file.filePath, file.source)) {
      const candidateFiles = targets.get(`${file.filePath}\0${binding.specifier}`) ?? [];
      if (candidateFiles.length === 0) continue;
      if (binding.namespace) {
        const pattern = new RegExp(`\\b${escaped(binding.local)}\\s*(?:\\.|::)\\s*([A-Za-z_$][A-Za-z0-9_$]*)\\s*\\(`, 'g');
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(masked)) !== null) {
          const callee = match[1];
          const target = callee
            ? candidateFiles.find((candidate) => definitionsByFile.get(candidate)?.has(callee))
            : undefined;
          if (callee && target) addCall(calls, spans, file.filePath, target, callee, match.index);
        }
      } else {
        const callee = binding.imported;
        if (!callee) continue;
        const target = candidateFiles.find((candidate) => definitionsByFile.get(candidate)?.has(callee));
        if (!target) continue;
        const pattern = new RegExp(`\\b${escaped(binding.local)}\\s*\\(`, 'g');
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(masked)) !== null) {
          addCall(calls, spans, file.filePath, target, callee, match.index);
        }
      }
    }
  }

  return {
    symbols: symbols.sort((a, b) => a.filePath === b.filePath ? a.name.localeCompare(b.name) : a.filePath.localeCompare(b.filePath)),
    symbolCalls: [...calls.values()],
    processes: [...new Map(processes.map((item) => [item.id, item])).values()],
  };
}
