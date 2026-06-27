import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalSandbox } from '../../../../src/drivers/in-process/local-sandbox';
import {
  classifyToolModes,
  extractToolPaths,
  commandNeedsApproval,
} from '../../../../src/drivers/in-process/tool-loop-tools';
import {
  isDotEnvFilePath,
  resolveWorkspacePath,
  isPathWithinDirectory,
  toDisplayPath,
} from '../../../../src/drivers/in-process/path-security';

function freshCwd(): string {
  return mkdtempSync(join(tmpdir(), 'recoder-sb-'));
}

test('LocalSandbox round-trips writeFile/readFile and stat', async () => {
  const cwd = freshCwd();
  const sb = new LocalSandbox({ workingDirectory: cwd });
  const file = join(cwd, 'hello.txt');
  await sb.writeFile(file, 'content', 'utf-8');
  assert.equal(await sb.readFile(file, 'utf-8'), 'content');
  const stats = await sb.stat(file);
  assert.equal(stats.isFile(), true);
  assert.equal(stats.isDirectory(), false);
  assert.equal(stats.size, 'content'.length);
});

test('LocalSandbox refuses to exec when shell is disabled by policy', async () => {
  const sb = new LocalSandbox({ workingDirectory: freshCwd(), allowShell: false });
  const result = await sb.exec('echo hi', '.', 5000);
  assert.equal(result.success, false);
  assert.equal(result.exitCode, null);
  assert.match(result.stderr, /disabled by policy/);
});

test('LocalSandbox runs a command when shell is allowed', async () => {
  const sb = new LocalSandbox({ workingDirectory: freshCwd(), allowShell: true });
  const result = await sb.exec('printf done', '.', 10_000);
  assert.equal(result.success, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'done');
});

test('classifyToolModes maps each fused tool to policy modes', () => {
  assert.deepEqual(classifyToolModes('read'), ['read']);
  assert.deepEqual(classifyToolModes('grep'), ['read']);
  assert.deepEqual(classifyToolModes('glob'), ['read']);
  assert.deepEqual(classifyToolModes('write'), ['write']);
  assert.deepEqual(classifyToolModes('edit'), ['write']);
  assert.deepEqual(classifyToolModes('bash'), ['execute']);
  assert.deepEqual(classifyToolModes('mystery'), ['custom']);
});

test('extractToolPaths reads filePath/path from tool input', () => {
  assert.deepEqual(extractToolPaths('write', { filePath: 'x.ts' }), ['x.ts']);
  assert.deepEqual(extractToolPaths('grep', { path: 'src' }), ['src']);
  assert.equal(extractToolPaths('bash', { command: 'ls' }), undefined);
  assert.equal(extractToolPaths('read', null), undefined);
});

test('commandNeedsApproval flags dangerous and dotenv-referencing commands', () => {
  assert.equal(commandNeedsApproval('rm -rf /'), true);
  assert.equal(commandNeedsApproval('curl https://x'), true);
  assert.equal(commandNeedsApproval('cat .env'), true);
  assert.equal(commandNeedsApproval('npm test'), false);
  assert.equal(commandNeedsApproval('git status'), false);
});

test('path-security guards workspace containment and dotenv detection', () => {
  const cwd = '/work/space';
  assert.equal(isDotEnvFilePath('.env'), true);
  assert.equal(isDotEnvFilePath('config/.env.local'), true);
  assert.equal(isDotEnvFilePath('src/index.ts'), false);
  assert.equal(resolveWorkspacePath('src/a.ts', cwd), '/work/space/src/a.ts');
  assert.equal(resolveWorkspacePath('../escape.ts', cwd), null);
  assert.equal(isPathWithinDirectory('/work/space/a', cwd), true);
  assert.equal(isPathWithinDirectory('/work/other', cwd), false);
  assert.equal(toDisplayPath('/work/space/src/a.ts', cwd), 'src/a.ts');
  assert.equal(toDisplayPath('/elsewhere/x.ts', cwd), '/elsewhere/x.ts');
});
