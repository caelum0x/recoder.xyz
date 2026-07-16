/**
 * GithubStatusPort — the conductor's read-only "GitHub identity" seam.
 *
 * Zero-config onboarding (product F1): the desktop never asks the user to
 * configure GitHub — the backend detects the identity agents will act as, from
 * (in precedence order) a forwarded token env (`GH_TOKEN`/`GITHUB_TOKEN`), the
 * user's `gh` CLI login, and the local `git config` identity. The cockpit shows
 * a calm "GitHub · connected" chip from this; workspaces/branches/PRs are
 * attributed with zero input.
 *
 * TOKEN-FREE BY CONTRACT: the view carries only booleans + display identity —
 * never a token value. Degrade-safe: detection failures report a truthful
 * `connected: false`, never a fabricated link.
 */

/** Display identity detected from `gh`/git — safe to surface in the UI. */
export interface GithubAccountView {
  /** GitHub login from `gh auth status` (e.g. "caelum0x"), when signed in. */
  readonly login?: string;
  /** `git config user.name`, when set. */
  readonly name?: string;
  /** `git config user.email`, when set. */
  readonly email?: string;
}

/** What made the connection true — the env token wins over the gh CLI login. */
export type GithubStatusSource = 'GH_TOKEN' | 'GITHUB_TOKEN' | 'gh_cli' | null;

/** The `GET /api/conductor/github/status` payload. */
export interface GithubStatusView {
  /** True when agents can act against GitHub non-interactively. */
  readonly connected: boolean;
  readonly source: GithubStatusSource;
  /** Detected display identity (login/name/email) — present when any was found. */
  readonly account?: GithubAccountView;
}

export interface GithubStatusPort {
  /** Detect the current GitHub connection + identity. Never throws. */
  status(): Promise<GithubStatusView>;
}
