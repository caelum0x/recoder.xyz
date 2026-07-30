/**
 * First-run environment-import probe.
 *
 * Proves: the pure fold collapses git identity to null unless name/email is set
 * and reduces the shell to its basename; the probe gathers git identity via
 * `git config --get`, agent-config presence via existsSync under $HOME, gh auth
 * from `gh auth status` exit code (true / false / null-when-absent), and the
 * shell from $SHELL — every field degrade-truthful and independent (never throws,
 * never fabricates a config).
 */
import { describe, it, expect } from 'vitest';
import { ExecError } from '@recoder/substrate';
import {
  EnvironmentImportService,
  foldEnvironmentImport,
  type EnvironmentImportDeps,
} from './environment-import.js';
import { makeLogger } from '../__fixtures__/harness.js';

describe('foldEnvironmentImport', () => {
  it('collapses git identity to null when neither name nor email is set', () => {
    expect(foldEnvironmentImport({ agentConfigs: [], ghAuthenticated: null }).gitIdentity).toBeNull();
    expect(
      foldEnvironmentImport({ gitName: '  ', gitEmail: '', agentConfigs: [], ghAuthenticated: null }).gitIdentity,
    ).toBeNull();
  });

  it('keeps a git identity when at least one of name/email is present', () => {
    expect(
      foldEnvironmentImport({ gitName: 'Ada', gitEmail: '', agentConfigs: [], ghAuthenticated: null }).gitIdentity,
    ).toEqual({ name: 'Ada', email: '' });
  });

  it('reduces the shell to its basename', () => {
    expect(foldEnvironmentImport({ agentConfigs: [], ghAuthenticated: null, shell: '/bin/zsh' }).shell).toBe('zsh');
    expect(foldEnvironmentImport({ agentConfigs: [], ghAuthenticated: null, shell: '' }).shell).toBe('');
  });
});

interface Behavior {
  git?: boolean;
  gh?: boolean;
  gitName?: string;
  gitEmail?: string;
  ghAuthed?: boolean;
  existingDirs?: string[];
  shell?: string;
}

function makeService(b: Behavior): EnvironmentImportService {
  const exec: NonNullable<EnvironmentImportDeps['exec']> = {
    which: async (bin) => {
      if (bin === 'git' && b.git) return '/usr/bin/git';
      if (bin === 'gh' && b.gh) return '/usr/bin/gh';
      return undefined;
    },
    execFile: async (bin, args) => {
      if (bin.endsWith('git') && args[0] === 'config') {
        const key = args[args.length - 1];
        const val = key === 'user.name' ? b.gitName : b.gitEmail;
        if (val == null) throw new ExecError('git', args, { code: 1, stdout: '', stderr: '' });
        return { stdout: `${val}\n`, stderr: '', code: 0 };
      }
      if (bin.endsWith('gh') && args[0] === 'auth') {
        if (b.ghAuthed) return { stdout: 'Logged in\n', stderr: '', code: 0 };
        throw new ExecError('gh', args, { code: 1, stdout: '', stderr: 'not logged in' });
      }
      throw new Error(`unexpected exec: ${bin} ${args.join(' ')}`);
    },
  };
  return new EnvironmentImportService({
    logger: makeLogger(),
    exec,
    homedir: () => '/home/dev',
    existsSync: (p) => (b.existingDirs ?? []).some((d) => p === `/home/dev/${d}`),
    getShell: () => b.shell,
  });
}

describe('EnvironmentImportService.probe', () => {
  it('gathers a fully-configured environment', async () => {
    const view = await makeService({
      git: true,
      gh: true,
      gitName: 'Ada Lovelace',
      gitEmail: 'ada@x.io',
      ghAuthed: true,
      existingDirs: ['.claude', '.codex'],
      shell: '/bin/zsh',
    }).probe();

    expect(view.gitIdentity).toEqual({ name: 'Ada Lovelace', email: 'ada@x.io' });
    expect(view.ghAuthenticated).toBe(true);
    expect(view.shell).toBe('zsh');
    expect(view.agentConfigs).toEqual([
      { id: 'claude_code', present: true },
      { id: 'codex', present: true },
      { id: 'gemini', present: false },
      { id: 'cursor', present: false },
    ]);
  });

  it('reports gh false when not authenticated, null when gh is absent', async () => {
    expect((await makeService({ git: true, gh: true, ghAuthed: false }).probe()).ghAuthenticated).toBe(false);
    expect((await makeService({ git: true, gh: false }).probe()).ghAuthenticated).toBeNull();
  });

  it('degrades every field when nothing is installed/configured (never throws)', async () => {
    const view = await makeService({ git: false, gh: false }).probe();
    expect(view.gitIdentity).toBeNull();
    expect(view.ghAuthenticated).toBeNull();
    expect(view.shell).toBe('');
    expect(view.agentConfigs.every((a) => !a.present)).toBe(true);
  });
});
