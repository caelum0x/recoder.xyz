/**
 * Shared glob escaping / normalization / overlap. Single owner so both `locks/`
 * and `dispatch/space-policy-filter` reuse the same matching instead of the
 * duplicate logic that lived in `work-lock.ts` and `task-routing-service.ts`.
 *
 * MERGED + hardened from:
 *  - `lockCoversPath` (packages/agent-os/src/domain/work-lock.ts)
 *  - `globsOverlap`/`normalizeGlob`/`globRoot`/`rootContains`
 *    (packages/agent-os/src/services/work-lock-service.ts)
 *  - `pathMatchesRule` (packages/agent-os/src/services/task-routing-service.ts)
 */

const DOUBLE_STAR_TOKEN = '___RECODER_DOUBLE_STAR___';

/** Normalize a glob: backslashes → slashes, strip a leading `./`. */
export function normalizeGlob(glob: string): string {
  return glob.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** Compile a glob into an anchored RegExp where `**` spans `/` and `*` does not. */
export function globToRegExp(glob: string): RegExp {
  const escaped = normalizeGlob(glob)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, DOUBLE_STAR_TOKEN)
    .replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped.split(DOUBLE_STAR_TOKEN).join('.*')}$`);
}

/** True if `glob` matches `path` (path is normalized to forward slashes first). */
export function globMatchesPath(glob: string, path: string): boolean {
  return globToRegExp(glob).test(normalizeGlob(path));
}

/** The static directory root of a glob (everything before the first wildcard). */
export function globRoot(glob: string): string {
  return normalizeGlob(glob)
    .replace(/\/\*\*.*$/, '')
    .replace(/\/\*.*$/, '')
    .replace(/\*.*$/, '')
    .replace(/\/$/, '');
}

/** True if `parent` root contains (or equals) `child` root. Empty parent = root. */
export function rootContains(parent: string, child: string): boolean {
  if (!parent) {
    return true;
  }
  return child === parent || child.startsWith(`${parent}/`);
}

/** True if two globs could ever cover an overlapping path. */
export function globsOverlap(left: string, right: string): boolean {
  const normalizedLeft = normalizeGlob(left);
  const normalizedRight = normalizeGlob(right);
  const leftRoot = globRoot(normalizedLeft);
  const rightRoot = globRoot(normalizedRight);

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft === '**/*' ||
    normalizedRight === '**/*' ||
    rootContains(leftRoot, rightRoot) ||
    rootContains(rightRoot, leftRoot)
  );
}

/**
 * Path-vs-rule match used by forbidden-path policy. Treats a bare directory
 * rule (no wildcard) as a prefix match. MERGED from `pathMatchesRule`.
 */
export function pathMatchesRule(path: string, rule: string): boolean {
  if (rule.length === 0) {
    return false;
  }
  if (rule.endsWith('/**')) {
    return path === rule.slice(0, -3) || path.startsWith(rule.slice(0, -2));
  }
  if (rule.includes('*')) {
    return globToRegExp(rule).test(path);
  }
  return path === rule || path.startsWith(`${rule}/`);
}
