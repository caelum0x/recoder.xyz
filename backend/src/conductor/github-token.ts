/**
 * GitHub token resolution for agent sessions.
 *
 * Agents run `gh` (and authenticated git) non-interactively inside their tmux
 * worktrees. Today that needs a LOCAL `gh auth login`; nothing forwards a token
 * into the session env. This module resolves a GitHub token from the backend's
 * environment (GH_TOKEN / GITHUB_TOKEN — the two names `gh` itself honors) and
 * produces the env fragment to inject so agents can use `gh` with zero setup.
 *
 * Degrade-safe by contract: when no token is resolvable, {@link githubSessionEnv}
 * returns an empty object (inject NOTHING) and {@link githubConnected} is false,
 * so the cockpit badge reads "not connected" instead of faking a link. The token
 * value is never logged here; callers only merge it into the spawned session env.
 *
 * Pure functions over an injected env source — no process.env access, no I/O — so
 * the resolution logic is unit-testable in isolation.
 */

/** Minimal env shape this module reads. Values may be undefined (unset var). */
export type GithubTokenEnv = {
  GH_TOKEN?: string;
  GITHUB_TOKEN?: string;
  // Index signature so `process.env` (NodeJS.ProcessEnv) is directly assignable.
  [key: string]: string | undefined;
};

/** Env var name the agent session receives (the canonical name `gh` reads). */
export const GITHUB_SESSION_TOKEN_VAR = 'GH_TOKEN';

/**
 * Resolve a usable GitHub token from an env-like source. Prefers GH_TOKEN, then
 * GITHUB_TOKEN. Whitespace-only or empty values are treated as absent. Returns
 * `null` when no token is resolvable (degrade-safe — the caller injects nothing).
 */
export function resolveGithubToken(env: GithubTokenEnv = {}): string | null {
  for (const candidate of [env.GH_TOKEN, env.GITHUB_TOKEN]) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

/**
 * Env fragment to merge into an agent's session so `gh` works non-interactively.
 * `{ GH_TOKEN: <token> }` when a token is resolvable, otherwise an EMPTY object —
 * never a blank/placeholder token, so absence degrades to "not connected".
 */
export function githubSessionEnv(env: GithubTokenEnv = {}): Record<string, string> {
  const token = resolveGithubToken(env);
  return token ? { [GITHUB_SESSION_TOKEN_VAR]: token } : {};
}

/** Truthful GitHub connection state (a token is resolvable) — for the cockpit badge. */
export function githubConnected(env: GithubTokenEnv = {}): boolean {
  return resolveGithubToken(env) !== null;
}

/** Which env var name the token was found under (for a truthful, token-free status). */
export function githubTokenSource(env: GithubTokenEnv = {}): 'GH_TOKEN' | 'GITHUB_TOKEN' | null {
  if (typeof env.GH_TOKEN === 'string' && env.GH_TOKEN.trim().length > 0) return 'GH_TOKEN';
  if (typeof env.GITHUB_TOKEN === 'string' && env.GITHUB_TOKEN.trim().length > 0) return 'GITHUB_TOKEN';
  return null;
}

/** Public, token-free GitHub connection status for the /github/status route + cockpit badge. */
export interface GithubStatus {
  connected: boolean;
  /** Which env var supplied the token (never the token value). Null when absent. */
  source: 'GH_TOKEN' | 'GITHUB_TOKEN' | null;
}

/** Build the token-free status snapshot from an env source. */
export function githubStatus(env: GithubTokenEnv = {}): GithubStatus {
  return { connected: githubConnected(env), source: githubTokenSource(env) };
}
