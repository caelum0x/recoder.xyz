/**
 * Worktree check runner (recoder-fxee) — proves it maps real exec outcomes to check
 * results via an INJECTED exec: exit 0 ⇒ pass, non-zero exit ⇒ fail, un-spawnable ⇒
 * error; inert when no checks configured / no worktree; never throws.
 */
import { describe, it, expect, vi } from 'vitest';
import { createWorktreeCheckRunner, runOneCheck, detailFrom, parseCheckSpecs, type CheckSpec } from './check-runner.adapter.js';
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

  it('degrades to [] when the workspace lookup throws (never propagates)', async () => {
    const runner = createWorktreeCheckRunner({ getWorkspace: async () => { throw new Error('db down'); }, checks: [spec('tests')], logger });
    await expect(runner.run('ws1')).resolves.toEqual([]);
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
});

describe('detailFrom', () => {
  it('takes the first non-empty line, truncated', () => {
    expect(detailFrom('\n\n  hello  \nworld')).toBe('hello');
    expect(detailFrom(undefined)).toBe('');
  });
});
