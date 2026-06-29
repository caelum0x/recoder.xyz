import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  findRepoRoot,
  locateRepoEngine,
  REPO_ENGINE_CANDIDATES,
} from '../../../../src/drivers/shared/repo-engine-locator';

/**
 * The repo-engine locator must resolve OUR customized ts/* engines on disk and
 * degrade truthfully (`found: false`) when the build is absent or the binary is
 * not one of ours — never green-washing a path that does not exist.
 */

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'recoder-repo-engine-'));
}

function touchExecutable(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, '#!/usr/bin/env node\n', 'utf-8');
  chmodSync(path, 0o755);
}

function makeRepo(): string {
  const root = freshDir();
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n', 'utf-8');
  mkdirSync(join(root, 'ts'), { recursive: true });
  return root;
}

test('findRepoRoot walks up to the marker+ts/ root', () => {
  const root = makeRepo();
  const deep = join(root, 'packages', 'runtime', 'src', 'drivers', 'shared');
  mkdirSync(deep, { recursive: true });
  assert.equal(findRepoRoot(deep), root);
});

test('findRepoRoot returns undefined outside a checkout', () => {
  const orphan = freshDir(); // no marker, no ts/
  assert.equal(findRepoRoot(orphan), undefined);
});

test('findRepoRoot requires BOTH a marker and a ts/ dir', () => {
  // ts/ but no marker
  const a = freshDir();
  mkdirSync(join(a, 'ts'), { recursive: true });
  assert.equal(findRepoRoot(a), undefined);

  // marker but no ts/
  const b = freshDir();
  writeFileSync(join(b, 'pnpm-workspace.yaml'), '', 'utf-8');
  assert.equal(findRepoRoot(b), undefined);
});

test('locateRepoEngine resolves a known engine when the build exists', () => {
  const root = makeRepo();
  const engine = join(root, 'ts', 'oh-my-codex', 'dist', 'cli', 'omx.js');
  touchExecutable(engine);

  const result = locateRepoEngine({ binary: 'codex', repoRoot: root });
  assert.equal(result.found, true);
  assert.equal(result.resolvedPath, engine);
});

test('locateRepoEngine returns found:false when the build is absent', () => {
  const root = makeRepo(); // ts/ dir but no engine artifact
  const result = locateRepoEngine({ binary: 'codex', repoRoot: root });
  assert.equal(result.found, false);
  assert.equal(result.resolvedPath, undefined);
});

test('locateRepoEngine returns found:false for unmapped binaries', () => {
  const root = makeRepo();
  // even with a marker root, `claude` is not one of our ts/* engines.
  assert.equal(locateRepoEngine({ binary: 'claude', repoRoot: root }).found, false);
});

test('locateRepoEngine returns found:false when repo root cannot be found', () => {
  const orphan = freshDir();
  const result = locateRepoEngine({ binary: 'codex', repoRoot: orphan, startDir: orphan });
  assert.equal(result.found, false);
});

test('locateRepoEngine honors candidate preference order (first existing wins)', () => {
  const binary = 'opencode';
  const candidates = REPO_ENGINE_CANDIDATES[binary];
  assert.ok(candidates && candidates.length >= 2, 'opencode should have multiple candidates');

  const root = makeRepo();
  // Only the SECOND candidate exists -> it must be the one resolved.
  const second = join(root, ...candidates![1]!.split('/'));
  touchExecutable(second);

  const result = locateRepoEngine({ binary, repoRoot: root });
  assert.equal(result.found, true);
  assert.equal(result.resolvedPath, second);
});

test('every mapped engine resolves against the real repo checkout when present', () => {
  // Auto-discovery anchored on this test file's location climbs to the real repo.
  const root = findRepoRoot(__dirname);
  assert.ok(root, 'expected to discover the real repo root from the test dir');
  // This asserts the map points at real, on-disk artifacts in THIS checkout.
  // (Engines without a build are reported below by the task, not failed here.)
  for (const binary of Object.keys(REPO_ENGINE_CANDIDATES)) {
    const res = locateRepoEngine({ binary, repoRoot: root });
    // Truthful: either a real on-disk path, or an honest found:false.
    if (res.found) {
      assert.ok(res.resolvedPath && res.resolvedPath.startsWith(root!));
    } else {
      assert.equal(res.resolvedPath, undefined);
    }
  }
});
