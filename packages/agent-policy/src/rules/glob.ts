export function globMatch(glob: string, path: string): boolean {
  const doubleStarToken = '___RECODER_DOUBLE_STAR___';
  const pattern = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, doubleStarToken)
    .replace(/\*/g, '[^/]*');
  return new RegExp(`^${pattern.replaceAll(doubleStarToken, '.*')}$`).test(path.replace(/\\/g, '/'));
}
