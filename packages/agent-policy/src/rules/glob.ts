export function globMatch(glob: string, path: string): boolean {
  const globstarSlashToken = '___RECODER_GLOBSTAR_SLASH___';
  const doubleStarToken = '___RECODER_DOUBLE_STAR___';
  const pattern = glob
    // `**/` matches zero or more path segments (standard gitignore semantics),
    // so `**/x` matches BOTH root-level `x` and nested `a/x`. Tokenize before
    // escaping so the replacement text is not itself regex-escaped.
    .replace(/\*\*\//g, globstarSlashToken)
    .replace(/\*\*/g, doubleStarToken)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replaceAll(globstarSlashToken, '(?:.*/)?')
    .replaceAll(doubleStarToken, '.*');
  return new RegExp(`^${pattern}$`).test(path.replace(/\\/g, '/'));
}
