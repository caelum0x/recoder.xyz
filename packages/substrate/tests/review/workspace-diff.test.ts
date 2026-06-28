/**
 * review/workspace-diff tests (design §11) — REAL temp git repo.
 *
 * Proves the promoted parsing produces the identical SubstrateDiff the proven
 * substrate.diff() produced: tracked changes counted from `git diff --stat`,
 * untracked files counted from `git status --porcelain` (?? lines), and
 * changedFiles = tracked + untracked. No mocks: we run real `git` over a real
 * throwaway repo and feed its output through buildSubstrateDiff.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildSubstrateDiff,
  parseUntracked,
  countChangedFiles,
} from '../../src/review/index.js';

const exec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', cwd, ...args], { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'substrate-diff-'));
  await git(dir, ['init', '-q']);
  await git(dir, ['config', 'user.email', 'test@recoder.xyz']);
  await git(dir, ['config', 'user.name', 'substrate-test']);
  await git(dir, ['config', 'commit.gpgsign', 'false']);
  return dir;
}

async function collectRaw(dir: string, base: string) {
  const [stat, patch, status] = await Promise.all([
    git(dir, ['--no-pager', 'diff', '--stat', base]),
    git(dir, ['--no-pager', 'diff', base]),
    git(dir, ['status', '--porcelain']),
  ]);
  return { stat, patch, status };
}

test('counts tracked modifications + untracked files against the base commit', async () => {
  const dir = await makeRepo();
  try {
    // Base commit: one tracked file.
    await writeFile(join(dir, 'a.txt'), 'one\n');
    await git(dir, ['add', 'a.txt']);
    await git(dir, ['commit', '-q', '-m', 'base']);
    const base = (await git(dir, ['rev-parse', 'HEAD'])).trim();

    // Modify the tracked file, and add two untracked files.
    await writeFile(join(dir, 'a.txt'), 'one\ntwo\n');
    await writeFile(join(dir, 'b.txt'), 'new file\n');
    await writeFile(join(dir, 'c.txt'), 'another new\n');

    const raw = await collectRaw(dir, base);
    const diff = buildSubstrateDiff(raw);

    // 1 tracked change (a.txt) + 2 untracked (b.txt, c.txt) = 3.
    assert.equal(diff.changedFiles, 3);
    assert.deepEqual([...diff.untracked].sort(), ['b.txt', 'c.txt']);
    assert.ok(diff.stat.includes('a.txt'), 'stat mentions the modified file');
    assert.ok(diff.patch.includes('+two'), 'patch contains the added line');
    // stat is trimmed (no leading/trailing whitespace).
    assert.equal(diff.stat, diff.stat.trim());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a clean worktree against HEAD yields an empty, well-formed diff', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(join(dir, 'a.txt'), 'one\n');
    await git(dir, ['add', 'a.txt']);
    await git(dir, ['commit', '-q', '-m', 'base']);

    const raw = await collectRaw(dir, 'HEAD');
    const diff = buildSubstrateDiff(raw);

    assert.equal(diff.changedFiles, 0);
    assert.deepEqual(diff.untracked, []);
    assert.equal(diff.stat, '');
    assert.equal(diff.patch, '');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('untracked-only changes are counted with no tracked stat lines', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(join(dir, 'a.txt'), 'one\n');
    await git(dir, ['add', 'a.txt']);
    await git(dir, ['commit', '-q', '-m', 'base']);

    await writeFile(join(dir, 'untracked-only.txt'), 'x\n');

    const raw = await collectRaw(dir, 'HEAD');
    const diff = buildSubstrateDiff(raw);

    assert.equal(diff.stat, '', 'no tracked changes → empty stat');
    assert.deepEqual(diff.untracked, ['untracked-only.txt']);
    assert.equal(diff.changedFiles, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('parseUntracked extracts only ?? porcelain lines, trimmed', () => {
  const porcelain = ' M tracked.txt\n?? new-a.txt\n?? path/to/new-b.txt\nA  staged.txt\n';
  assert.deepEqual(parseUntracked(porcelain), ['new-a.txt', 'path/to/new-b.txt']);
});

test('parseUntracked on empty input returns an empty list', () => {
  assert.deepEqual(parseUntracked(''), []);
});

test('countChangedFiles = stat `|` lines + untracked count', () => {
  const stat = ' a.txt | 2 +-\n b.txt | 1 +\n 2 files changed, 3 insertions(+)';
  assert.equal(countChangedFiles(stat, []), 2);
  assert.equal(countChangedFiles(stat, ['c.txt', 'd.txt']), 4);
  assert.equal(countChangedFiles('', ['only-untracked.txt']), 1);
});
