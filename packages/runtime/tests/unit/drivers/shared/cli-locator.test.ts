import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter, dirname } from 'node:path';
import { locateCli } from '../../../../src/drivers/shared/cli-locator';

/**
 * Real command-resolution tests: the locator must find the user's CLI on disk
 * via override / node_modules/.bin / PATH — and must report `found: false`
 * truthfully when the binary is absent (never green-washing availability).
 */

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'recoder-cli-'));
}

function touchExecutable(path: string): void {
  writeFileSync(path, '#!/bin/sh\necho hi\n', 'utf-8');
  chmodSync(path, 0o755);
}

test('override path wins when it exists on disk', () => {
  const dir = freshDir();
  const override = join(dir, 'my-claude');
  touchExecutable(override);

  const result = locateCli({ binary: 'claude', override, pathEnv: '' });
  assert.equal(result.found, true);
  assert.equal(result.source, 'override');
  assert.equal(result.resolvedPath, override);
});

test('non-existent override is ignored and falls through', () => {
  const result = locateCli({
    binary: 'claude',
    override: join(freshDir(), 'does-not-exist'),
    pathEnv: '',
  });
  assert.equal(result.found, false);
});

test('node_modules/.bin local install is resolved (and binName override honored)', () => {
  const cwd = freshDir();
  const binDir = join(cwd, 'node_modules', '.bin');
  mkdirSync(binDir, { recursive: true });
  touchExecutable(join(binDir, 'opencode'));

  const result = locateCli({ binary: 'opencode', binName: 'opencode', cwd, pathEnv: '' });
  assert.equal(result.found, true);
  assert.equal(result.source, 'local_bin');
  assert.equal(result.resolvedPath, join(binDir, 'opencode'));
});

test('PATH search resolves a binary in one of the PATH entries', () => {
  const dirA = freshDir();
  const dirB = freshDir();
  touchExecutable(join(dirB, 'codex'));

  // Opt out of repo-engine preference to isolate the PATH tier: `codex` maps to a
  // repo-built ts/* engine, which would otherwise (correctly) win over PATH.
  const result = locateCli({
    binary: 'codex',
    pathEnv: [dirA, dirB].join(delimiter),
    preferRepoEngine: false,
  });
  assert.equal(result.found, true);
  assert.equal(result.source, 'path');
  assert.equal(result.resolvedPath, join(dirB, 'codex'));
});

test('search order: override beats local_bin beats PATH', () => {
  const cwd = freshDir();
  const binDir = join(cwd, 'node_modules', '.bin');
  mkdirSync(binDir, { recursive: true });
  touchExecutable(join(binDir, 'claude'));

  const pathDir = freshDir();
  touchExecutable(join(pathDir, 'claude'));

  const override = join(freshDir(), 'claude');
  touchExecutable(override);

  // All three present -> override wins.
  assert.equal(
    locateCli({ binary: 'claude', override, cwd, pathEnv: pathDir }).source,
    'override',
  );
  // No override -> local_bin wins over PATH.
  assert.equal(
    locateCli({ binary: 'claude', cwd, pathEnv: pathDir }).source,
    'local_bin',
  );
});

test('absent binary reports found:false truthfully (no faked availability)', () => {
  const result = locateCli({
    binary: 'totally-absent-binary-xyz',
    cwd: freshDir(),
    pathEnv: freshDir(),
  });
  assert.equal(result.found, false);
  assert.equal(result.resolvedPath, undefined);
  assert.equal(result.source, undefined);
});

/** Build a fake repo root with the marker + a repo-built ts/* engine on disk. */
function fakeRepoRoot(relEngine: string): { root: string; engine: string } {
  const root = freshDir();
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n', 'utf-8');
  const engine = join(root, ...relEngine.split('/'));
  mkdirSync(dirname(engine), { recursive: true });
  touchExecutable(engine);
  return { root, engine };
}

test('repo-built ts/* engine is preferred over a global PATH binary', () => {
  const { root, engine } = fakeRepoRoot('ts/oh-my-codex/dist/cli/omx.js');
  const pathDir = freshDir();
  touchExecutable(join(pathDir, 'codex')); // global PATH codex also present

  const result = locateCli({
    binary: 'codex',
    repoRoot: root,
    pathEnv: pathDir,
  });
  assert.equal(result.found, true);
  assert.equal(result.source, 'repo_engine');
  assert.equal(result.resolvedPath, engine);
});

test('repo engine still loses to override and node_modules/.bin', () => {
  const { root } = fakeRepoRoot('ts/oh-my-codex/dist/cli/omx.js');

  // override wins over repo engine.
  const override = join(freshDir(), 'codex');
  touchExecutable(override);
  assert.equal(
    locateCli({ binary: 'codex', override, repoRoot: root }).source,
    'override',
  );

  // node_modules/.bin wins over repo engine.
  const cwd = freshDir();
  const binDir = join(cwd, 'node_modules', '.bin');
  mkdirSync(binDir, { recursive: true });
  touchExecutable(join(binDir, 'codex'));
  assert.equal(
    locateCli({ binary: 'codex', cwd, repoRoot: root }).source,
    'local_bin',
  );
});

test('repo engine degrades to PATH when the build is absent (degrade-safe)', () => {
  // Repo root with marker + ts/ dir but no built engine artifact.
  const root = freshDir();
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n', 'utf-8');
  mkdirSync(join(root, 'ts'), { recursive: true });

  const pathDir = freshDir();
  touchExecutable(join(pathDir, 'codex'));

  const result = locateCli({ binary: 'codex', repoRoot: root, pathEnv: pathDir });
  assert.equal(result.found, true);
  assert.equal(result.source, 'path');
  assert.equal(result.resolvedPath, join(pathDir, 'codex'));
});

test('preferRepoEngine:false fully opts out of repo-engine preference', () => {
  const { root } = fakeRepoRoot('ts/oh-my-codex/dist/cli/omx.js');
  const pathDir = freshDir();
  touchExecutable(join(pathDir, 'codex'));

  const result = locateCli({
    binary: 'codex',
    repoRoot: root,
    pathEnv: pathDir,
    preferRepoEngine: false,
  });
  assert.equal(result.source, 'path');
});

test('binaries with no repo-engine mapping are unaffected', () => {
  const { root } = fakeRepoRoot('ts/oh-my-codex/dist/cli/omx.js');
  const pathDir = freshDir();
  touchExecutable(join(pathDir, 'claude')); // `claude` has no ts/* engine

  const result = locateCli({ binary: 'claude', repoRoot: root, pathEnv: pathDir });
  assert.equal(result.source, 'path');
  assert.equal(result.resolvedPath, join(pathDir, 'claude'));
});
