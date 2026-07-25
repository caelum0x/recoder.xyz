/**
 * RepoCloneService — the "New from GitHub" clone seam (`POST /repos/clone`),
 * built on the SAME injected exec port style as `github-status.adapter.ts` /
 * `pr-status.service.ts` (never shell strings, always argv arrays).
 *
 * Tool preference: `gh repo clone` first — it inherits the user's `gh` keyring
 * auth so private repos clone with zero new credentials — falling back to plain
 * `git clone` when `gh` is absent. Neither binary present ⇒ a truthful
 * `no_tool` refusal (never a fabricated clone).
 *
 * Safety posture:
 *  - only GitHub https (`https://github.com/owner/repo[.git]`) or SSH
 *    (`git@github.com:owner/repo.git`) URLs are accepted — `javascript:`,
 *    `file:`, non-github hosts, bare `owner/repo`, and anything that could be
 *    parsed as a flag (leading `-`) are rejected BEFORE any spawn;
 *  - `git clone` gets the `--` fence before its positionals so the url/dir can
 *    never be read as an option (`gh repo clone` reserves `--` for git
 *    passthrough flags, so there the strict url validation is the fence);
 *  - a clone failure surfaces the tool's stderr TAIL with any `user:pass@` /
 *    token credential fragments scrubbed — never a secret, never a fake success.
 */
import os from 'node:os';
import path from 'node:path';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { execFileSafe, which, ExecError } from '@recoder/substrate';
import type { ExecOptions, ExecResult } from '@recoder/substrate';
import type { Logger } from '../../../shared/logger.js';

/** A network clone can be slow — bounded, but far above the local probes. */
const CLONE_TIMEOUT_MS = 180_000;
const CLONE_MAX_BUFFER = 8 * 1024 * 1024;
/** How much of the tool's stderr tail a failure message may carry. */
const STDERR_TAIL_CHARS = 400;

/**
 * GitHub owner: alphanumeric + hyphens, MUST start alphanumeric (so a crafted
 * "owner" can never begin with `-` and be parsed as a flag). Repo: word chars,
 * dots, hyphens — same leading-alphanumeric rule; a trailing `.git` is allowed
 * and stripped for the directory name.
 */
const GITHUB_HTTPS_RE =
  /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*?)(?:\.git)?\/?$/;
const GITHUB_SSH_RE =
  /^git@github\.com:([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*?)(?:\.git)?$/;

/** A validated GitHub clone target. */
export interface ParsedGithubUrl {
  readonly owner: string;
  readonly repo: string;
  /** The trimmed original url — what the clone tool is handed. */
  readonly url: string;
}

/**
 * Validate + parse a GitHub clone url (https or SSH form). Anything else —
 * other schemes/hosts, bare `owner/repo`, flag-shaped strings — is `null`.
 */
export function parseGithubUrl(raw: string): ParsedGithubUrl | null {
  const url = raw.trim();
  const match = GITHUB_HTTPS_RE.exec(url) ?? GITHUB_SSH_RE.exec(url);
  if (!match) return null;
  const owner = match[1]!;
  const repo = match[2]!;
  // Defense in depth: the regexes already force a leading alphanumeric, but a
  // path-traversal name must never become the clone directory.
  if (repo === '.' || repo === '..') return null;
  return { owner, repo, url };
}

export interface CloneRepoInput {
  readonly url: string;
  /** Optional parent dir; the repo lands at `<destDir>/<repo-name>`. */
  readonly destDir?: string;
}

export type CloneRepoErrorCode =
  | 'invalid_input'
  | 'dest_exists'
  | 'no_tool'
  | 'clone_failed';

export type CloneRepoOutcome =
  | { readonly ok: true; readonly repoPath: string; readonly clonedWith: 'gh' | 'git' }
  | { readonly ok: false; readonly code: CloneRepoErrorCode; readonly message: string };

/** The exec surface the service clones with — injectable for tests. */
export interface RepoCloneExec {
  execFile: (
    bin: string,
    args: readonly string[],
    options: ExecOptions
  ) => Promise<ExecResult>;
  which: (bin: string) => Promise<string | undefined>;
}

/** What is on disk at a path (the pre-clone target check). */
export type ClonePathState = 'missing' | 'empty_dir' | 'nonempty_dir' | 'file';

/** The filesystem surface — injectable for tests. */
export interface RepoCloneFs {
  pathState: (p: string) => Promise<ClonePathState>;
  mkdirp: (p: string) => Promise<void>;
}

export interface RepoCloneServiceDeps {
  readonly logger: Logger;
  /** Test seam; defaults to the real substrate exec helpers. */
  readonly exec?: RepoCloneExec;
  /** Test seam; defaults to real `node:fs/promises` operations. */
  readonly fs?: RepoCloneFs;
  /** Default parent dir when the caller supplies none (`~/recoder/repos`). */
  readonly defaultBaseDir?: string;
}

const defaultExec: RepoCloneExec = {
  execFile: (bin, args, options) => execFileSafe(bin, args, options),
  which,
};

const defaultFs: RepoCloneFs = {
  pathState: async (p) => {
    try {
      const s = await stat(p);
      if (!s.isDirectory()) return 'file';
      const entries = await readdir(p);
      return entries.length === 0 ? 'empty_dir' : 'nonempty_dir';
    } catch {
      return 'missing';
    }
  },
  mkdirp: async (p) => {
    await mkdir(p, { recursive: true });
  },
};

/** Expand a leading `~` and resolve to an absolute path. */
function resolveBaseDir(raw: string): string {
  if (raw === '~') return os.homedir();
  const expanded = raw.startsWith('~/')
    ? path.join(os.homedir(), raw.slice(2))
    : raw;
  return path.resolve(expanded);
}

/**
 * A failure message built from the tool's stderr tail, with `user:pass@` /
 * token fragments embedded in urls scrubbed so a credentialed remote can never
 * leak through the error envelope.
 */
function failureMessage(err: unknown): string {
  const raw =
    err instanceof ExecError && err.stderr.trim()
      ? err.stderr.trim()
      : err instanceof Error
        ? err.message
        : 'clone failed';
  const scrubbed = raw.replace(/\/\/[^\s/@]+@/g, '//');
  return scrubbed.length > STDERR_TAIL_CHARS
    ? scrubbed.slice(-STDERR_TAIL_CHARS)
    : scrubbed;
}

export class RepoCloneService {
  private readonly log: Logger;
  private readonly exec: RepoCloneExec;
  private readonly fs: RepoCloneFs;
  private readonly baseDir: string;

  constructor(deps: RepoCloneServiceDeps) {
    this.log = deps.logger;
    this.exec = deps.exec ?? defaultExec;
    this.fs = deps.fs ?? defaultFs;
    this.baseDir =
      deps.defaultBaseDir ?? path.join(os.homedir(), 'recoder', 'repos');
  }

  /** Clone a GitHub repo. Never throws — every failure is a typed outcome. */
  async clone(input: CloneRepoInput): Promise<CloneRepoOutcome> {
    const parsed = parseGithubUrl(input.url);
    if (!parsed) {
      return {
        ok: false,
        code: 'invalid_input',
        message:
          '`url` must be a GitHub repository URL (https://github.com/owner/repo or git@github.com:owner/repo.git)',
      };
    }

    const baseDir =
      typeof input.destDir === 'string' && input.destDir.trim()
        ? resolveBaseDir(input.destDir.trim())
        : this.baseDir;
    const repoPath = path.join(baseDir, parsed.repo);

    const state = await this.fs.pathState(repoPath);
    if (state === 'nonempty_dir' || state === 'file') {
      return {
        ok: false,
        code: 'dest_exists',
        message: `target directory already exists and is non-empty: ${repoPath}`,
      };
    }

    const tool = await this.pickTool();
    if (!tool) {
      return {
        ok: false,
        code: 'no_tool',
        message: 'neither `gh` nor `git` is available to clone with',
      };
    }

    try {
      await this.fs.mkdirp(baseDir);
      const args =
        tool.kind === 'gh'
          ? // gh reserves `--` for git passthrough flags; the strict url
            // validation above is the injection fence on this path.
            ['repo', 'clone', parsed.url, repoPath]
          : // git: fence positionals so neither can ever be read as a flag.
            ['clone', '--', parsed.url, repoPath];
      await this.exec.execFile(tool.bin, args, {
        timeoutMs: CLONE_TIMEOUT_MS,
        maxBuffer: CLONE_MAX_BUFFER,
      });
      return { ok: true, repoPath, clonedWith: tool.kind };
    } catch (err) {
      this.log.warn(
        { err, url: parsed.url, tool: tool.kind },
        'conductor repo clone failed'
      );
      return { ok: false, code: 'clone_failed', message: failureMessage(err) };
    }
  }

  /** Prefer `gh` (inherits gh auth for private repos); fall back to `git`. */
  private async pickTool(): Promise<{ kind: 'gh' | 'git'; bin: string } | null> {
    const ghBin = await this.exec.which('gh').catch(() => undefined);
    if (ghBin) return { kind: 'gh', bin: ghBin };
    const gitBin = await this.exec.which('git').catch(() => undefined);
    if (gitBin) return { kind: 'git', bin: gitBin };
    return null;
  }
}
