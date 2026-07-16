/**
 * GithubStatusAdapter — concrete {@link GithubStatusPort} over the local
 * environment: forwarded token envs, the `gh` CLI login, and `git config`.
 *
 * Detection precedence for `connected`/`source`:
 *  1. `GH_TOKEN` / `GITHUB_TOKEN` in the (injected) env — the backend can hand
 *     the token to agent sessions, so agents run `gh` non-interactively.
 *  2. `gh auth status` exits 0 — the user's own gh login covers agent sessions
 *     on this machine. The login is parsed from the status output.
 * The `git config user.name/email` identity is detected independently so the
 * account view is useful even when no token/login exists (attribution only).
 *
 * Degrade-safe + token-free: every probe failure is a truthful `connected:
 * false` / absent field; token VALUES never leave this adapter. Probes are
 * bounded (short timeout) so a hung `gh` can never stall the status edge.
 */
import { execFileSafe, which } from '@recoder/substrate';
import type { Logger } from '../../../shared/logger.js';
import type {
  GithubAccountView,
  GithubStatusPort,
  GithubStatusView,
} from '../ports/github-status.port.js';

const PROBE_TIMEOUT_MS = 3_000;

/** The exec surface the adapter probes with — injectable for tests. */
export interface GithubProbeExec {
  execFile(bin: string, args: readonly string[], opts: { timeoutMs: number }): Promise<{
    stdout: string;
    stderr: string;
  }>;
  which(bin: string): Promise<string | undefined>;
}

export interface GithubStatusAdapterDeps {
  readonly logger: Logger;
  /** Injected env snapshot (bootstrap passes process.env) — never read globally. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Test seam; defaults to the real substrate exec helpers. */
  readonly exec?: GithubProbeExec;
}

const defaultExec: GithubProbeExec = {
  execFile: (bin, args, opts) => execFileSafe(bin, args, { timeoutMs: opts.timeoutMs }),
  which,
};

/** Parse the signed-in login out of `gh auth status` output (any recent gh). */
export function parseGhLogin(output: string): string | undefined {
  // gh >= 2.40: "✓ Logged in to github.com account caelum0x (keyring)"
  // older gh:   "✓ Logged in to github.com as caelum0x (oauth_token)"
  const match = /Logged in to [^\s]+ (?:account|as) ([^\s(]+)/.exec(output);
  return match?.[1];
}

export function createGithubStatusAdapter(deps: GithubStatusAdapterDeps): GithubStatusPort {
  const { logger, env } = deps;
  const exec = deps.exec ?? defaultExec;

  async function ghLogin(): Promise<string | undefined> {
    const ghBin = await exec.which('gh');
    if (!ghBin) return undefined;
    try {
      // `gh auth status` exits non-zero when not logged in; output historically
      // lands on stderr, so both streams are parsed.
      const { stdout, stderr } = await exec.execFile(ghBin, ['auth', 'status'], {
        timeoutMs: PROBE_TIMEOUT_MS,
      });
      return parseGhLogin(`${stdout}\n${stderr}`) ?? '';
    } catch {
      return undefined;
    }
  }

  async function gitConfig(key: string): Promise<string | undefined> {
    try {
      const { stdout } = await exec.execFile('git', ['config', '--get', key], {
        timeoutMs: PROBE_TIMEOUT_MS,
      });
      const value = stdout.trim();
      return value || undefined;
    } catch {
      return undefined;
    }
  }

  return {
    async status(): Promise<GithubStatusView> {
      try {
        const [login, name, email] = await Promise.all([
          ghLogin(),
          gitConfig('user.name'),
          gitConfig('user.email'),
        ]);

        const account: GithubAccountView = {
          ...(login ? { login } : {}),
          ...(name ? { name } : {}),
          ...(email ? { email } : {}),
        };
        const hasAccount = Object.keys(account).length > 0;

        if (env.GH_TOKEN) {
          return { connected: true, source: 'GH_TOKEN', ...(hasAccount ? { account } : {}) };
        }
        if (env.GITHUB_TOKEN) {
          return { connected: true, source: 'GITHUB_TOKEN', ...(hasAccount ? { account } : {}) };
        }
        // login === '' means `gh auth status` succeeded but the login line was
        // unparseable — still a truthful "connected via gh".
        if (login !== undefined) {
          return { connected: true, source: 'gh_cli', ...(hasAccount ? { account } : {}) };
        }
        return { connected: false, source: null, ...(hasAccount ? { account } : {}) };
      } catch (err) {
        logger.warn({ err }, 'github status detection failed — reporting not connected');
        return { connected: false, source: null };
      }
    },
  };
}
