/**
 * GitHub repo clone seam (`POST /repos/clone` backing service).
 *
 * Proves:
 *  - gh path: `gh repo clone <url> <dest>` when gh is on PATH (`clonedWith:'gh'`);
 *  - git fallback: `git clone -- <url> <dest>` when gh is absent (the `--`
 *    fence precedes every positional);
 *  - url validation rejects non-GitHub / non-url / flag-shaped inputs BEFORE
 *    any spawn (javascript:, file:, non-github https, leading-dash injections);
 *  - an existing non-empty target dir is a typed `dest_exists` refusal;
 *  - neither tool on PATH is a typed `no_tool` refusal;
 *  - a failed clone surfaces the tool's stderr tail with credentials scrubbed.
 */
import { describe, it, expect } from 'vitest';
import { ExecError } from '@recoder/substrate';
import {
  RepoCloneService,
  parseGithubUrl,
  type ClonePathState,
  type RepoCloneExec,
  type RepoCloneFs,
} from './repo-clone.service.js';
import { makeLogger } from '../__fixtures__/harness.js';

interface Behavior {
  gh?: boolean;
  git?: boolean;
  pathState?: ClonePathState;
  cloneError?: ExecError;
}

function makeService(behavior: Behavior) {
  const calls: { bin: string; args: readonly string[] }[] = [];
  const exec: RepoCloneExec = {
    which: async (bin) => {
      if (bin === 'gh' && behavior.gh) return '/usr/local/bin/gh';
      if (bin === 'git' && behavior.git) return '/usr/bin/git';
      return undefined;
    },
    execFile: async (bin, args) => {
      calls.push({ bin, args });
      if (behavior.cloneError) throw behavior.cloneError;
      return { stdout: '', stderr: '', code: 0 };
    },
  };
  const mkdirs: string[] = [];
  const fs: RepoCloneFs = {
    pathState: async () => behavior.pathState ?? 'missing',
    mkdirp: async (p) => {
      mkdirs.push(p);
    },
  };
  const service = new RepoCloneService({
    logger: makeLogger(),
    exec,
    fs,
    defaultBaseDir: '/base/repos',
  });
  return { service, calls, mkdirs };
}

describe('parseGithubUrl', () => {
  it('accepts the https form, with and without .git / trailing slash', () => {
    expect(parseGithubUrl('https://github.com/acme/widget')).toEqual({
      owner: 'acme',
      repo: 'widget',
      url: 'https://github.com/acme/widget',
    });
    expect(parseGithubUrl('https://github.com/acme/widget.git')?.repo).toBe('widget');
    expect(parseGithubUrl('https://github.com/acme/widget/')?.repo).toBe('widget');
  });

  it('accepts the SSH form', () => {
    expect(parseGithubUrl('git@github.com:acme/widget.git')).toEqual({
      owner: 'acme',
      repo: 'widget',
      url: 'git@github.com:acme/widget.git',
    });
  });

  it('rejects non-GitHub and non-url inputs', () => {
    expect(parseGithubUrl('javascript:alert(1)')).toBeNull();
    expect(parseGithubUrl('file:///etc/passwd')).toBeNull();
    expect(parseGithubUrl('https://gitlab.com/acme/widget')).toBeNull();
    expect(parseGithubUrl('https://github.com.evil.com/acme/widget')).toBeNull();
    expect(parseGithubUrl('acme/widget')).toBeNull();
    expect(parseGithubUrl('')).toBeNull();
  });

  it('rejects flag-shaped / injection-shaped inputs', () => {
    expect(parseGithubUrl('--upload-pack=/bin/sh')).toBeNull();
    expect(parseGithubUrl('-o evil')).toBeNull();
    expect(parseGithubUrl('https://github.com/-owner/repo')).toBeNull();
    expect(parseGithubUrl('git@github.com:acme/-repo')).toBeNull();
    expect(parseGithubUrl('https://github.com/acme/..')).toBeNull();
  });
});

describe('RepoCloneService', () => {
  it('clones with gh when gh is present (dest under the default base dir)', async () => {
    const { service, calls, mkdirs } = makeService({ gh: true, git: true });
    const result = await service.clone({ url: 'https://github.com/acme/widget' });
    expect(result).toEqual({
      ok: true,
      repoPath: '/base/repos/widget',
      clonedWith: 'gh',
    });
    expect(calls).toEqual([
      {
        bin: '/usr/local/bin/gh',
        args: ['repo', 'clone', 'https://github.com/acme/widget', '/base/repos/widget'],
      },
    ]);
    expect(mkdirs).toEqual(['/base/repos']);
  });

  it('falls back to git clone (with the -- fence) when gh is absent', async () => {
    const { service, calls } = makeService({ git: true });
    const result = await service.clone({ url: 'git@github.com:acme/widget.git' });
    expect(result).toEqual({
      ok: true,
      repoPath: '/base/repos/widget',
      clonedWith: 'git',
    });
    expect(calls).toEqual([
      {
        bin: '/usr/bin/git',
        args: ['clone', '--', 'git@github.com:acme/widget.git', '/base/repos/widget'],
      },
    ]);
  });

  it('honors destDir (repo lands at destDir/<repo-name>)', async () => {
    const { service, calls } = makeService({ gh: true });
    const result = await service.clone({
      url: 'https://github.com/acme/widget.git',
      destDir: '/custom/dir',
    });
    expect(result).toEqual({
      ok: true,
      repoPath: '/custom/dir/widget',
      clonedWith: 'gh',
    });
    expect(calls[0]?.args[3]).toBe('/custom/dir/widget');
  });

  it('rejects invalid urls before any spawn', async () => {
    const { service, calls } = makeService({ gh: true, git: true });
    for (const url of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'https://gitlab.com/a/b',
      '--upload-pack=/bin/sh',
    ]) {
      const result = await service.clone({ url });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('invalid_input');
    }
    expect(calls).toEqual([]);
  });

  it('refuses an existing non-empty target dir (409 seam)', async () => {
    const { service, calls } = makeService({
      gh: true,
      pathState: 'nonempty_dir',
    });
    const result = await service.clone({ url: 'https://github.com/acme/widget' });
    expect(result).toEqual({
      ok: false,
      code: 'dest_exists',
      message: 'target directory already exists and is non-empty: /base/repos/widget',
    });
    expect(calls).toEqual([]);
  });

  it('an existing EMPTY dir is clonable (git/gh handle it)', async () => {
    const { service } = makeService({ gh: true, pathState: 'empty_dir' });
    const result = await service.clone({ url: 'https://github.com/acme/widget' });
    expect(result.ok).toBe(true);
  });

  it('refuses truthfully when neither gh nor git is on PATH', async () => {
    const { service, calls } = makeService({});
    const result = await service.clone({ url: 'https://github.com/acme/widget' });
    expect(result).toEqual({
      ok: false,
      code: 'no_tool',
      message: 'neither `gh` nor `git` is available to clone with',
    });
    expect(calls).toEqual([]);
  });

  it('surfaces the tool stderr tail on a failed clone, credentials scrubbed', async () => {
    const stderr =
      'Cloning into widget...\nfatal: could not read from https://x-token-123@github.com/acme/widget: auth failed';
    const { service } = makeService({
      gh: true,
      cloneError: new ExecError('gh', [], { code: 1, stdout: '', stderr }),
    });
    const result = await service.clone({ url: 'https://github.com/acme/widget' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('clone_failed');
      expect(result.message).toContain('auth failed');
      expect(result.message).not.toContain('x-token-123');
    }
  });
});
