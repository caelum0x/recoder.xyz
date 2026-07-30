/**
 * EnvironmentImportService — first-run "we found your setup" probe.
 *
 * Cursor's onboarding centerpiece is "Import VS Code settings"; the Recoder
 * equivalent is meeting a dev where they already live: their git identity, the
 * agent CLIs they've already configured (`~/.claude`, `~/.codex`, …), whether
 * `gh` is authenticated, and their shell. This read-only probe gathers those
 * signals so the Workspaces hub can show "already set up" instead of an empty
 * first run.
 *
 * Degrade-truthful throughout — it NEVER throws and NEVER fabricates:
 *  - git identity is `null` when neither name nor email is configured;
 *  - an agent config is `present:false` when its dir is absent (never guessed);
 *  - gh auth is `null` when `gh` isn't installed / couldn't be probed (we could
 *    not judge), `true`/`false` only on a real `gh auth status` exit code;
 *  - shell is the `$SHELL` basename, `''` when unset.
 *
 * Every probe is INDEPENDENT: one failing (git, gh, fs, env) degrades only its
 * own field. Bounded exec so a hung git/gh can never stall the edge.
 */
import { execFileSafe, which, ExecError } from '@recoder/substrate';
import type { ExecOptions, ExecResult } from '@recoder/substrate';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import type { Logger } from '../../../shared/logger.js';

const PROBE_TIMEOUT_MS = 6_000;
const PROBE_MAX_BUFFER = 1 * 1024 * 1024;

/** The agent CLIs whose home config dir we look for — curated + truthful. */
const AGENT_CONFIG_DIRS: readonly { readonly id: string; readonly dir: string }[] = [
  { id: 'claude_code', dir: '.claude' },
  { id: 'codex', dir: '.codex' },
  { id: 'gemini', dir: '.gemini' },
  { id: 'cursor', dir: '.cursor' },
];

export interface GitIdentity {
  readonly name: string;
  readonly email: string;
}

export interface AgentConfigPresence {
  readonly id: string;
  readonly present: boolean;
}

/** The `GET /api/conductor/environment` read-model. */
export interface EnvironmentImportView {
  /** Configured git identity, or null when neither name nor email is set. */
  readonly gitIdentity: GitIdentity | null;
  /** Per-agent config-dir presence (never guessed). */
  readonly agentConfigs: readonly AgentConfigPresence[];
  /** `gh auth status` result; null when gh is absent / unprobed (could not judge). */
  readonly ghAuthenticated: boolean | null;
  /** Basename of the user's `$SHELL` (e.g. "zsh"); '' when unknown. */
  readonly shell: string;
}

/** The already-probed raw signals the pure fold projects. */
export interface EnvironmentImportRaw {
  readonly gitName?: string;
  readonly gitEmail?: string;
  readonly agentConfigs: readonly AgentConfigPresence[];
  readonly ghAuthenticated: boolean | null;
  readonly shell?: string;
}

/**
 * Pure: project raw probed signals into the truthful view. Git identity collapses
 * to `null` unless at least one of name/email is a non-empty string; the shell is
 * reduced to its basename. No I/O.
 */
export function foldEnvironmentImport(raw: EnvironmentImportRaw): EnvironmentImportView {
  const name = (raw.gitName ?? '').trim();
  const email = (raw.gitEmail ?? '').trim();
  const shell = (raw.shell ?? '').trim();
  return {
    gitIdentity: name !== '' || email !== '' ? { name, email } : null,
    agentConfigs: raw.agentConfigs,
    ghAuthenticated: raw.ghAuthenticated,
    shell: shell !== '' ? basename(shell) : '',
  };
}

/** Injectable seams (tests pass fakes; defaults = the real host). */
export interface EnvironmentImportDeps {
  readonly logger: Logger;
  readonly exec?: {
    execFile: (bin: string, args: readonly string[], options: ExecOptions) => Promise<ExecResult>;
    which: (bin: string) => Promise<string | undefined>;
  };
  readonly existsSync?: (path: string) => boolean;
  readonly homedir?: () => string;
  readonly getShell?: () => string | undefined;
}

export class EnvironmentImportService {
  private readonly log: Logger;
  private readonly exec: NonNullable<EnvironmentImportDeps['exec']>;
  private readonly exists: (path: string) => boolean;
  private readonly home: () => string;
  private readonly getShell: () => string | undefined;

  constructor(deps: EnvironmentImportDeps) {
    this.log = deps.logger;
    this.exec = deps.exec ?? { execFile: (b, a, o) => execFileSafe(b, a, o), which };
    this.exists = deps.existsSync ?? existsSync;
    this.home = deps.homedir ?? homedir;
    this.getShell = deps.getShell ?? (() => process.env.SHELL);
  }

  /** Gather the environment-import signals. Never throws. */
  async probe(): Promise<EnvironmentImportView> {
    const [gitName, gitEmail] = await Promise.all([
      this.gitConfig('user.name'),
      this.gitConfig('user.email'),
    ]);
    const home = this.safeHome();
    const agentConfigs: AgentConfigPresence[] = AGENT_CONFIG_DIRS.map(({ id, dir }) => ({
      id,
      present: home !== '' && this.safeExists(join(home, dir)),
    }));
    const ghAuthenticated = await this.ghAuthStatus();
    return foldEnvironmentImport({
      gitName,
      gitEmail,
      agentConfigs,
      ghAuthenticated,
      shell: this.getShellSafe(),
    });
  }

  private async gitConfig(key: string): Promise<string> {
    let gitBin: string | undefined;
    try {
      gitBin = await this.exec.which('git');
    } catch {
      gitBin = undefined;
    }
    if (!gitBin) return '';
    try {
      const { stdout } = await this.exec.execFile(gitBin, ['config', '--get', key], {
        timeoutMs: PROBE_TIMEOUT_MS,
        maxBuffer: PROBE_MAX_BUFFER,
      });
      return stdout.trim();
    } catch {
      // Exit 1 = key unset (a normal "not configured"), any other = probe fault.
      return '';
    }
  }

  private async ghAuthStatus(): Promise<boolean | null> {
    let ghBin: string | undefined;
    try {
      ghBin = await this.exec.which('gh');
    } catch {
      ghBin = undefined;
    }
    if (!ghBin) return null;
    try {
      await this.exec.execFile(ghBin, ['auth', 'status'], {
        timeoutMs: PROBE_TIMEOUT_MS,
        maxBuffer: PROBE_MAX_BUFFER,
      });
      return true;
    } catch (err) {
      // gh exits non-zero when NOT logged in — a truthful `false`, not an error.
      if (err instanceof ExecError) return false;
      this.log.warn({ err }, 'conductor environment-import gh probe faulted — reporting unknown');
      return null;
    }
  }

  private safeHome(): string {
    try {
      return this.home() || '';
    } catch {
      return '';
    }
  }

  private safeExists(path: string): boolean {
    try {
      return this.exists(path);
    } catch {
      return false;
    }
  }

  private getShellSafe(): string {
    try {
      return this.getShell() ?? '';
    } catch {
      return '';
    }
  }
}
