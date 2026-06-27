import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spacePolicyFindings } from '../../../src/dispatch/space-policy-filter';
import { makeTask, makeSpace } from '../../fixtures/dispatch';

test('no space yields no findings', () => {
  assert.deepEqual(spacePolicyFindings(makeTask()), []);
});

test('directory rule blocks a target path under it', () => {
  const findings = spacePolicyFindings(
    makeTask({ targetPaths: ['infra/db/migrate.ts'] }),
    makeSpace({ forbiddenPaths: ['infra'] }),
  );
  assert.equal(findings.length, 1);
  assert.ok(findings[0].includes('infra'));
});

test('glob rule (/**) blocks matching paths', () => {
  const findings = spacePolicyFindings(
    makeTask({ targetPaths: ['secret/keys.ts', 'src/ok.ts'] }),
    makeSpace({ forbiddenPaths: ['secret/**'] }),
  );
  assert.equal(findings.length, 1);
  assert.ok(findings[0].includes('secret/keys.ts'));
});

test('task-level forbidden paths merge with space forbidden paths', () => {
  const findings = spacePolicyFindings(
    makeTask({ targetPaths: ['vendor/lib.ts'], forbiddenPaths: ['vendor'] }),
    makeSpace({ forbiddenPaths: [] }),
  );
  assert.equal(findings.length, 1);
});

test('non-matching paths produce no findings', () => {
  const findings = spacePolicyFindings(
    makeTask({ targetPaths: ['src/app/page.ts'] }),
    makeSpace({ forbiddenPaths: ['infra/**'] }),
  );
  assert.deepEqual(findings, []);
});
