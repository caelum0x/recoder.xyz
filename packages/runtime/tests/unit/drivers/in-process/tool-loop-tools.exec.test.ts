import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalSandbox } from '../../../../src/drivers/in-process/local-sandbox';
import type { ToolLoopExperimentalContext } from '../../../../src/drivers/in-process/tool-loop-context';
import { buildToolLoopTools } from '../../../../src/drivers/in-process/tool-loop-tools';

/**
 * End-to-end exercise of the REAL fused in-process tools (read/write/edit/grep)
 * against a real LocalSandbox + temp workspace. This proves the tool objects the
 * driver hands to the model actually execute, enforce workspace containment, and
 * gate sensitive paths/commands via `needsApproval` — not just the extracted helpers.
 */

function freshWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'recoder-tools-'));
}

/** Build the experimental_context the driver passes to every tool's execute/needsApproval. */
function makeContext(cwd: string, allowShell: boolean): { experimental_context: ToolLoopExperimentalContext } {
  const sandbox = new LocalSandbox({ workingDirectory: cwd, allowShell });
  // The model is only consulted by the loop, never by these tools' execute paths.
  const context: ToolLoopExperimentalContext = {
    sandbox: { sandbox, workingDirectory: cwd },
    model: {} as ToolLoopExperimentalContext['model'],
  };
  return { experimental_context: context };
}

type AnyTool = {
  execute: (input: unknown, opts: unknown) => Promise<unknown>;
  needsApproval?: (input: unknown) => boolean | Promise<boolean>;
};

const tools = () => buildToolLoopTools() as unknown as Record<string, AnyTool>;

test('write then read round-trips a real file inside the workspace', async () => {
  const cwd = freshWorkspace();
  const ctx = makeContext(cwd, false);
  const t = tools();

  const wrote = (await t.write.execute({ filePath: 'src/a.ts', content: 'export const a = 1;\n' }, ctx)) as {
    success: boolean;
    path: string;
    bytesWritten: number;
  };
  assert.equal(wrote.success, true);
  assert.equal(wrote.path, 'src/a.ts');
  assert.ok(wrote.bytesWritten > 0);

  const read = (await t.read.execute({ filePath: 'src/a.ts' }, ctx)) as {
    success: boolean;
    content: string;
    totalLines: number;
  };
  assert.equal(read.success, true);
  assert.match(read.content, /1: export const a = 1;/);
});

test('edit performs an exact unique replacement and reports the start line', async () => {
  const cwd = freshWorkspace();
  const ctx = makeContext(cwd, false);
  const t = tools();
  await t.write.execute({ filePath: 'm.ts', content: 'const x = 1;\nconst y = 2;\n' }, ctx);

  const edited = (await t.edit.execute(
    { filePath: 'm.ts', oldString: 'const y = 2;', newString: 'const y = 3;' },
    ctx,
  )) as { success: boolean; replacements: number; startLine: number };
  assert.equal(edited.success, true);
  assert.equal(edited.replacements, 1);
  assert.equal(edited.startLine, 2);

  const read = (await t.read.execute({ filePath: 'm.ts' }, ctx)) as { content: string };
  assert.match(read.content, /const y = 3;/);
});

test('edit refuses an ambiguous (non-unique) oldString without replaceAll', async () => {
  const cwd = freshWorkspace();
  const ctx = makeContext(cwd, false);
  const t = tools();
  await t.write.execute({ filePath: 'dup.ts', content: 'a\na\n' }, ctx);

  const res = (await t.edit.execute({ filePath: 'dup.ts', oldString: 'a', newString: 'b' }, ctx)) as {
    success: boolean;
    error?: string;
  };
  assert.equal(res.success, false);
  assert.match(res.error ?? '', /2 times/);
});

test('read refuses to escape the workspace (path traversal blocked)', async () => {
  const cwd = freshWorkspace();
  const ctx = makeContext(cwd, false);
  const t = tools();

  const res = (await t.read.execute({ filePath: '../../../etc/passwd' }, ctx)) as {
    success: boolean;
    error?: string;
  };
  assert.equal(res.success, false);
  assert.match(res.error ?? '', /within the workspace/);
});

test('grep finds real matches via the shell when shell is allowed', async () => {
  const cwd = freshWorkspace();
  writeFileSync(join(cwd, 'hit.ts'), 'const NEEDLE = 42;\nconst other = 1;\n', 'utf-8');
  const ctx = makeContext(cwd, true);
  const t = tools();

  const res = (await t.grep.execute({ pattern: 'NEEDLE', path: '.' }, ctx)) as {
    success: boolean;
    matchCount: number;
    matches: Array<{ file: string; line: number }>;
  };
  assert.equal(res.success, true);
  assert.ok(res.matchCount >= 1, 'expected at least one match');
  assert.ok(res.matches.some((m) => m.file.endsWith('hit.ts') && m.line === 1));
});

test('needsApproval gates dotenv reads/writes and dangerous bash commands', async () => {
  const t = tools();
  assert.equal(await t.read.needsApproval!({ filePath: '.env' }), true);
  assert.equal(await t.read.needsApproval!({ filePath: 'src/index.ts' }), false);
  assert.equal(await t.write.needsApproval!({ filePath: 'config/.env.local' }), true);
  assert.equal(await t.bash.needsApproval!({ command: 'rm -rf /' }), true);
  assert.equal(await t.bash.needsApproval!({ command: 'pnpm test' }), false);
});

test('bash fails truthfully when shell is denied by policy (never fakes success)', async () => {
  const cwd = freshWorkspace();
  const ctx = makeContext(cwd, false);
  const t = tools();

  const res = (await t.bash.execute({ command: 'echo hi' }, ctx)) as {
    success: boolean;
    exitCode: number | null;
    stderr: string;
  };
  assert.equal(res.success, false);
  assert.equal(res.exitCode, null);
  assert.match(res.stderr, /disabled by policy/);
});
