/** Identifiers declaration matching can capture but which are never symbols. */
const SYMBOL_STOPWORDS = new Set([
  'if', 'for', 'while', 'switch', 'return', 'function', 'class', 'const', 'let',
  'var', 'async', 'await', 'new', 'typeof', 'interface', 'type', 'enum', 'def',
  'func', 'fn', 'public', 'private', 'protected', 'static', 'export', 'default',
  'import', 'from', 'catch', 'else', 'try', 'do', 'in', 'of', 'as',
]);

/** Declaration patterns across the languages RecoderGit indexes. */
const DECL_PATTERNS: readonly RegExp[] = [
  /\bfunction\s+([A-Za-z_$][\w$]*)/,
  /\bclass\s+([A-Za-z_$][\w$]*)/,
  /\b(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
  /\bdef\s+([A-Za-z_][\w]*)/,
  /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)/,
  /\bfn\s+([A-Za-z_][\w]*)/,
  /^\s*(?:public|private|protected|static|async|readonly|override|\s)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^={]+)?[{]/,
];

/**
 * Extract declaration names touched by a unified diff. Hunk-header declaration
 * context plus changed declaration lines provide a bounded, language-aware
 * structural signal that both RecoderGit review and convergence consume.
 */
export function extractChangedSymbols(diff: string, max = 32): string[] {
  const seen = new Set<string>();
  return extractChangedSymbolLocations(diff, max * 2).flatMap(({ symbol }) => {
    if (seen.has(symbol) || seen.size >= max) return [];
    seen.add(symbol);
    return [symbol];
  });
}

export interface ChangedSymbolLocation {
  readonly symbol: string;
  /** Repo-relative destination path from the unified diff, when available. */
  readonly filePath?: string;
}

/** Extract changed declarations together with their destination file. */
export function extractChangedSymbolLocations(diff: string, max = 32): ChangedSymbolLocation[] {
  const seen = new Set<string>();
  const out: ChangedSymbolLocation[] = [];
  let filePath: string | undefined;
  const consider = (text: string): void => {
    for (const pattern of DECL_PATTERNS) {
      const match = pattern.exec(text);
      const name = match?.[1];
      const key = `${filePath ?? ''}\0${name ?? ''}`;
      if (!name || name.length < 2 || SYMBOL_STOPWORDS.has(name) || seen.has(key)) continue;
      seen.add(key);
      out.push({ symbol: name, ...(filePath ? { filePath } : {}) });
      if (out.length >= max) return;
    }
  };

  for (const raw of diff.split('\n')) {
    if (out.length >= max) break;
    if (raw.startsWith('diff --git ')) {
      const match = raw.match(/^diff --git (?:"?a\/.*?"?) (?:"?b\/(.+?)"?)$/);
      filePath = normalizeDiffPath(match?.[1]);
      continue;
    }
    if (raw.startsWith('+++ ')) {
      const destination = raw.slice(4).trim().replace(/^"|"$/g, '');
      filePath = destination === '/dev/null'
        ? undefined
        : normalizeDiffPath(destination.startsWith('b/') ? destination.slice(2) : destination);
      continue;
    }
    if (raw.startsWith('@@')) {
      const context = raw.slice(raw.indexOf('@@', 2) + 2);
      if (context.trim()) consider(context);
      continue;
    }
    if (raw.startsWith('+++') || raw.startsWith('---')) continue;
    if (raw.startsWith('+') || raw.startsWith('-')) consider(raw.slice(1));
  }
  return out;
}

function normalizeDiffPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some((part) => part === '..')) {
    return undefined;
  }
  return normalized.slice(0, 500);
}
