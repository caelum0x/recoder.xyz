import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyInput } from '@recoder/agent-policy';
import { evaluateForbiddenPath, makeForbiddenPathRule } from '../../../src/policy/rules/forbidden-path';
import { makeAgent, makeTask } from '../../fixtures';

function writeInput(path: string): PolicyInput {
  return { actor: makeAgent(), task: makeTask(), action: 'file.write', target: { path } };
}

describe('forbidden-path rule', () => {
  it('denies writes to an auth directory', () => {
    const d = evaluateForbiddenPath(writeInput('packages/web/app/auth/session.ts'));
    assert.ok(d);
    assert.equal(d?.effect, 'deny');
  });

  it('denies writes to a billing path', () => {
    const d = evaluateForbiddenPath(writeInput('docker-backend/src/billing/stripe.ts'));
    assert.equal(d?.effect, 'deny');
  });

  it('denies writes to a security directory', () => {
    const d = evaluateForbiddenPath(writeInput('docker-backend/src/security/index.ts'));
    assert.equal(d?.effect, 'deny');
  });

  it('denies a credentials file regardless of directory', () => {
    const d = evaluateForbiddenPath(writeInput('config/app-credentials.json'));
    assert.equal(d?.effect, 'deny');
  });

  it('is case-insensitive on the path', () => {
    const d = evaluateForbiddenPath(writeInput('App/AUTH/Login.ts'));
    assert.equal(d?.effect, 'deny');
  });

  it('allows writes to ordinary source paths', () => {
    const d = evaluateForbiddenPath(writeInput('packages/web/app/components/Button.tsx'));
    assert.equal(d, null);
  });

  it('does NOT apply to reads (reads are allowed)', () => {
    const d = evaluateForbiddenPath({ actor: makeAgent(), task: makeTask(), action: 'file.read', target: { path: 'src/auth/x.ts' } } as PolicyInput);
    assert.equal(d, null);
  });

  it('honors extra config globs', () => {
    const rule = makeForbiddenPathRule({ extraGlobs: ['**/migrations/**'] });
    const d = rule(writeInput('db/migrations/001.sql'));
    assert.equal(d?.effect, 'deny');
  });
});
