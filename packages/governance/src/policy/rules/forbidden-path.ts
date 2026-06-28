import type { PolicyDecision } from '@recoder/agent-os';
import { decision, globMatch, type PolicyInput } from '@recoder/agent-policy';

/**
 * forbidden-path rule (NEW, governance-only).
 *
 * Hard-denies WRITES (and deletes-via-write) to security-sensitive areas of the
 * monorepo: authentication, billing, and security configuration. These paths
 * carry production + compliance risk per the Recoder production rules, so they
 * are denied below the model regardless of agent permission grants — an agent
 * cannot self-authorize an auth/billing/security edit.
 *
 * The patterns are intentionally broad double-star globs matched against a
 * forward-slashed, lower-cased path so nested auth/billing/security files are
 * caught. Reads are allowed (the agent may need to understand the code); only
 * writes are blocked. The default patterns can be extended via GovernanceConfig.
 */

export const DEFAULT_FORBIDDEN_WRITE_GLOBS: readonly string[] = [
  '**/auth/**',
  '**/better-auth/**',
  '**/auth.ts',
  '**/auth.config.*',
  '**/billing/**',
  '**/payments/**',
  '**/stripe/**',
  '**/security/**',
  '**/.well-known/**',
  '**/secrets/**',
  '**/*credentials*',
  '**/middleware/auth*',
] as const;

export type ForbiddenPathOptions = {
  /** Additional globs to forbid, merged with the defaults. */
  readonly extraGlobs?: readonly string[];
  /** Replace the defaults entirely (advanced). */
  readonly globs?: readonly string[];
};

function resolveGlobs(options?: ForbiddenPathOptions): readonly string[] {
  if (options?.globs) return options.globs;
  return [...DEFAULT_FORBIDDEN_WRITE_GLOBS, ...(options?.extraGlobs ?? [])];
}

/** Curried so the engine can bind config-provided globs once. */
export function makeForbiddenPathRule(options?: ForbiddenPathOptions) {
  const globs = resolveGlobs(options);
  return function evaluateForbiddenPath(input: PolicyInput): PolicyDecision | null {
    if (input.action !== 'file.write') return null;
    const path = input.target.path;
    if (!path) return null;

    const normalized = path.replace(/\\/g, '/').toLowerCase();
    // Match against both the raw path and a '/'-prefixed form so a leading-dir
    // glob like '**/auth/**' also catches a top-level 'auth/...' path (where the
    // `**` would otherwise need a preceding segment to match).
    const prefixed = `/${normalized}`;
    const matched = globs.find((glob) => {
      const g = glob.toLowerCase();
      return globMatch(g, normalized) || globMatch(g, prefixed);
    });
    if (!matched) return null;

    return decision(
      input,
      'deny',
      `Writes to auth/billing/security paths are forbidden below the model: '${path}' matched '${matched}'.`,
      [{ path, matchedGlob: matched }],
    );
  };
}

/** Default-config convenience binding. */
export const evaluateForbiddenPath = makeForbiddenPathRule();
