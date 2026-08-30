/**
 * Worktree check runner (recoder-fxee) — proves it maps real exec outcomes to check
 * results via an INJECTED exec: exit 0 ⇒ pass, non-zero exit ⇒ fail, un-spawnable ⇒
 * error; inert when no checks configured / no worktree; never throws.
 */
import { describe, it, expect, vi } from 'vitest';
import { autofixPromptFor, createWorktreeCheckRunner, runOneCheck, detailFrom, parseCheckSpecs, type CheckSpec } from './check-runner.adapter.js';
import type { Workspace } from '@recoder/agent-os';

const logger = { debug() {}, info() {}, warn() {}, error() {} } as never;
const ws = (over: Partial<Workspace> = {}): Workspace => ({ workspaceId: 'ws1', worktreePath: '/wt', state: 'awaiting_review', ...over } as Workspace);
const spec = (name: string, command = 'pnpm', args: string[] = [name]): CheckSpec => ({ name, command, args });

describe('runOneCheck', () => {
  const exec = (impl: () => Promise<never> | Promise<{ stdout: string; stderr: string }>) => ({ execFile: vi.fn(impl) });

  it('exit 0 ⇒ pass with a compact detail', async () => {
    const r = await runOneCheck(spec('tests'), '/wt', exec(async () => ({ stdout: 'All tests passed\n', stderr: '' })), 1000);
    expect(r).toMatchObject({ name: 'tests', status: 'pass', detail: 'All tests passed' });
  });

  it('a non-zero exit (carries exitCode) ⇒ fail with the error line', async () => {
    const r = await runOneCheck(
      spec('typecheck'),
      '/wt',
      exec(async () => {
        throw Object.assign(new Error('cmd failed'), { exitCode: 2, stderr: 'src/a.ts(1,1): error TS2304\n' });
      }),
      1000,
    );
    expect(r).toMatchObject({ name: 'typecheck', status: 'fail' });
    expect(r.detail).toMatch(/TS2304/);
  });

  it('an un-spawnable command (no exit code) ⇒ error', async () => {
    const r = await runOneCheck(spec('lint'), '/wt', exec(async () => { throw new Error('spawn pnpm ENOENT'); }), 1000);
    expect(r.status).toBe('error');
    expect(r.detail).toMatch(/ENOENT/);
  });

  it('carries a bounded agent-remediation prompt only after explicit repo opt-in', async () => {
    const optedIn = spec('types', 'pnpm', ['exec', 'tsc', '--noEmit']);
    const r = await runOneCheck(
      { ...optedIn, autofix: true, fixPrompt: 'Keep public contracts stable.' },
      '/wt',
      exec(async () => { throw Object.assign(new Error('failed'), { exitCode: 2 }); }),
      1000,
    );
    expect(r.autofix?.prompt).toContain('"pnpm" "exec" "tsc" "--noEmit"');
    expect(r.autofix?.prompt).toContain('Keep public contracts stable.');
    expect(autofixPromptFor(optedIn)).toBeUndefined();
  });
});

describe('createWorktreeCheckRunner', () => {
  it('is inert (returns []) when no checks are configured and the repo declares none', async () => {
    const runner = createWorktreeCheckRunner({ getWorkspace: async () => ws(), checks: [], logger, readWorktreeChecks: async () => null });
    expect(await runner.run('ws1')).toEqual([]);
  });

  it('runs the PER-REPO .recoder/checks.json when present (winning over the operator default)', async () => {
    const execFile = vi.fn(async () => ({ stdout: 'ok', stderr: '' }));
    const runner = createWorktreeCheckRunner({
      getWorkspace: async () => ws(),
      checks: [spec('operator-default')],
      logger,
      exec: { execFile },
      readWorktreeChecks: async () => JSON.stringify([{ name: 'tests', command: 'pnpm', args: ['test'] }]),
    });
    const runs = await runner.run('ws1');
    expect(runs.map((r) => r.name)).toEqual(['tests']); // repo config won
    expect(execFile).toHaveBeenCalledWith('pnpm', ['test'], expect.objectContaining({ cwd: '/wt' }));
  });

  it('returns [] when the workspace has no worktree', async () => {
    const runner = createWorktreeCheckRunner({ getWorkspace: async () => ws({ worktreePath: undefined }), checks: [spec('tests')], logger });
    expect(await runner.run('ws1')).toEqual([]);
  });

  it('runs each configured check in the worktree and returns the results', async () => {
    const execFile = vi.fn(async () => ({ stdout: 'ok', stderr: '' }));
    const runner = createWorktreeCheckRunner({
      getWorkspace: async () => ws(),
      checks: [spec('tests'), spec('typecheck', 'pnpm', ['check-types'])],
      logger,
      exec: { execFile },
    });
    const runs = await runner.run('ws1');
    expect(runs.map((r) => r.status)).toEqual(['pass', 'pass']);
    expect(execFile).toHaveBeenCalledWith('pnpm', ['check-types'], expect.objectContaining({ cwd: '/wt' }));
  });

  it('routes off-box checks to the remote executor without a silent local fallback', async () => {
    const localExec = vi.fn(async () => ({ stdout: 'local', stderr: '' }));
    const remoteRun = vi.fn(async (_workspace, checks) => checks.map((check: CheckSpec) => ({ name: check.name, status: 'pass' as const, detail: 'remote' })));
    const runner = createWorktreeCheckRunner({
      getWorkspace: async () => ws(), checks: [], logger, exec: { execFile: localExec },
      offbox: { run: remoteRun },
      readWorktreeChecks: async () => JSON.stringify({ checks: [{
        name: 'types', command: 'pnpm', args: ['types'], execution: 'offbox',
        prepare: { command: 'pnpm', args: ['install', '--frozen-lockfile'] },
      }] }),
    });
    await expect(runner.runNamed('ws1', 'types')).resolves.toMatchObject({ status: 'pass', detail: 'remote' });
    expect(remoteRun).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws1' }), [expect.objectContaining({
      execution: 'offbox', prepare: { command: 'pnpm', args: ['install', '--frozen-lockfile'] },
    })], expect.any(Number));
    expect(localExec).not.toHaveBeenCalled();
  });

  it('degrades to [] when the workspace lookup throws (never propagates)', async () => {
    const runner = createWorktreeCheckRunner({ getWorkspace: async () => { throw new Error('db down'); }, checks: [spec('tests')], logger });
    await expect(runner.run('ws1')).resolves.toEqual([]);
  });

  it('shares one live execution across detailed and readiness consumers', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const execFile = vi.fn(async () => {
      await held;
      return { stdout: 'ok', stderr: '' };
    });
    const runner = createWorktreeCheckRunner({
      getWorkspace: async () => ws(),
      checks: [spec('tests')],
      logger,
      exec: { execFile },
      readWorktreeChecks: async () => null,
    });
    const detailed = runner.run('ws1');
    const readiness = runner.run('ws1');
    release();
    await expect(Promise.all([detailed, readiness])).resolves.toEqual([
      [{ name: 'tests', status: 'pass', detail: 'ok' }],
      [{ name: 'tests', status: 'pass', detail: 'ok' }],
    ]);
    expect(execFile).toHaveBeenCalledTimes(1);
  });
});

describe('parseCheckSpecs', () => {
  it('parses a JSON array of {name,command,args}, dropping malformed + capping', () => {
    const specs = parseCheckSpecs(
      JSON.stringify([
        { name: 'tests', command: 'pnpm', args: ['test'] },
        { name: '', command: 'x' }, // dropped (no name)
        { name: 'lint' }, // dropped (no command)
        { name: 'typecheck', command: 'pnpm', args: ['check-types', 42] }, // non-string arg filtered
      ]),
    );
    expect(specs).toEqual([
      { name: 'tests', command: 'pnpm', args: ['test'] },
      { name: 'typecheck', command: 'pnpm', args: ['check-types'] },
    ]);
  });

  it('accepts a { checks: [...] } wrapper and returns [] on junk/null (never throws)', () => {
    expect(parseCheckSpecs(JSON.stringify({ checks: [{ name: 'a', command: 'b', args: [] }] }))).toHaveLength(1);
    expect(parseCheckSpecs('not json')).toEqual([]);
    expect(parseCheckSpecs(null)).toEqual([]);
  });

  it('accepts autofix only as an explicit boolean and ignores fix instructions otherwise', () => {
    expect(parseCheckSpecs(JSON.stringify({ checks: [
      { name: 'agent', command: 'pnpm', args: ['test'], autofix: true, fixPrompt: 'Fix only sources.' },
      { name: 'manual', command: 'pnpm', args: ['lint'], autofix: 'true', fixPrompt: 'Do not expose this.' },
    ] }))).toEqual([
      { name: 'agent', command: 'pnpm', args: ['test'], autofix: true, fixPrompt: 'Fix only sources.' },
      { name: 'manual', command: 'pnpm', args: ['lint'] },
    ]);
  });

  it('accepts only explicit off-box execution and exact preparation argv', () => {
    expect(parseCheckSpecs(JSON.stringify({ checks: [{
      name: 'types', command: 'pnpm', args: ['types'], execution: 'offbox',
      prepare: { command: 'pnpm', args: ['install', 42] },
    }] }))).toEqual([{
      name: 'types', command: 'pnpm', args: ['types'], execution: 'offbox',
      prepare: { command: 'pnpm', args: ['install'] },
    }]);
  });
});

describe('detailFrom', () => {
  it('takes the first non-empty line, truncated', () => {
    expect(detailFrom('\n\n  hello  \nworld')).toBe('hello');
    expect(detailFrom(undefined)).toBe('');
  });
});
