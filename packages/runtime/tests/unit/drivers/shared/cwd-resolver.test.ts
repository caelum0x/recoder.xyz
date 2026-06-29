import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import type { CwdPolicy } from '@recoder/agent-os';
import { resolveCwd } from '../../../../src/drivers/shared/cwd-resolver';
import { RuntimeAdapterError } from '../../../../src/errors/runtime-error';

/**
 * Real command-resolution tests for the policy-bounded working directory.
 * The resolver chooses a concrete cwd per `CwdPolicy.mode` and MUST fail-safe
 * (`policy_denied`) when the resolved cwd escapes the allowed roots, rather than
 * silently running somewhere unauthorized.
 */

test('repo_root mode prefers repoRoot, then workspaceRoot, then fallback', () => {
  const policy: CwdPolicy = { mode: 'repo_root', allowedRoots: [] };
  assert.equal(
    resolveCwd({ policy, repoRoot: '/repo', workspaceRoot: '/ws', fallback: '/fb' }),
    resolve('/repo'),
  );
  assert.equal(
    resolveCwd({ policy, workspaceRoot: '/ws', fallback: '/fb' }),
    resolve('/ws'),
  );
  assert.equal(resolveCwd({ policy, fallback: '/fb' }), resolve('/fb'));
});

test('workspace_root mode prefers workspaceRoot, then repoRoot', () => {
  const policy: CwdPolicy = { mode: 'workspace_root', allowedRoots: [] };
  assert.equal(
    resolveCwd({ policy, repoRoot: '/repo', workspaceRoot: '/ws', fallback: '/fb' }),
    resolve('/ws'),
  );
  assert.equal(
    resolveCwd({ policy, repoRoot: '/repo', fallback: '/fb' }),
    resolve('/repo'),
  );
});

test('task_path mode prefers taskPath', () => {
  const policy: CwdPolicy = { mode: 'task_path', allowedRoots: [] };
  assert.equal(
    resolveCwd({ policy, taskPath: '/repo/pkg', workspaceRoot: '/ws', fallback: '/fb' }),
    resolve('/repo/pkg'),
  );
});

test('custom mode uses policy.preferredRoot, else fallback', () => {
  assert.equal(
    resolveCwd({
      policy: { mode: 'custom', allowedRoots: [], preferredRoot: '/custom' },
      fallback: '/fb',
    }),
    resolve('/custom'),
  );
  assert.equal(
    resolveCwd({ policy: { mode: 'custom', allowedRoots: [] }, fallback: '/fb' }),
    resolve('/fb'),
  );
});

test('defaults to workspace_root when no policy is supplied', () => {
  assert.equal(
    resolveCwd({ workspaceRoot: '/ws', repoRoot: '/repo', fallback: '/fb' }),
    resolve('/ws'),
  );
});

test('allowedRoots are enforced: a cwd inside an allowed root is accepted', () => {
  const policy: CwdPolicy = {
    mode: 'repo_root',
    allowedRoots: ['/safe'],
  };
  assert.equal(
    resolveCwd({ policy, repoRoot: '/safe/project', fallback: '/safe' }),
    resolve('/safe/project'),
  );
  // The allowed root itself is within bounds.
  assert.equal(
    resolveCwd({ policy, repoRoot: '/safe', fallback: '/safe' }),
    resolve('/safe'),
  );
});

test('fail-safe: a cwd outside allowedRoots throws policy_denied (never runs unauthorized)', () => {
  const policy: CwdPolicy = {
    mode: 'repo_root',
    allowedRoots: ['/safe'],
  };
  assert.throws(
    () => resolveCwd({ policy, repoRoot: '/etc', fallback: '/etc' }),
    (err: unknown) => {
      assert.ok(err instanceof RuntimeAdapterError, 'expected a RuntimeAdapterError');
      assert.equal(err.code, 'policy_denied');
      return true;
    },
  );
});

test('fail-safe: a sibling prefix is NOT treated as within an allowed root', () => {
  // '/safe-other' must not pass as within '/safe' (prefix-only containment bug guard).
  const policy: CwdPolicy = { mode: 'custom', allowedRoots: ['/safe'], preferredRoot: '/safe-other' };
  assert.throws(
    () => resolveCwd({ policy, fallback: '/safe-other' }),
    (err: unknown) => err instanceof RuntimeAdapterError && err.code === 'policy_denied',
  );
});
