import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  resolveCodexModel,
  resolveReasoningEffort,
  DEFAULT_FRONTIER_MODEL,
} from '../../../../src/drivers/codex/codex-profile';

test('explicit override wins over everything', () => {
  assert.equal(resolveCodexModel({ override: 'my-model', env: {} }), 'my-model');
});

test('falls back to DEFAULT_FRONTIER_MODEL with no config/env', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'codex-home-'));
  assert.equal(resolveCodexModel({ env: {}, codexHome: dir }), DEFAULT_FRONTIER_MODEL);
});

test('reads OMX_DEFAULT_FRONTIER_MODEL from env when no config file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'codex-home-'));
  assert.equal(
    resolveCodexModel({ env: { OMX_DEFAULT_FRONTIER_MODEL: 'env-model' }, codexHome: dir }),
    'env-model',
  );
});

test('reads models.default from .omx-config.json', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'codex-home-'));
  writeFileSync(path.join(dir, '.omx-config.json'), JSON.stringify({ models: { default: 'cfg-model' } }));
  assert.equal(resolveCodexModel({ env: {}, codexHome: dir }), 'cfg-model');
});

test('mode-specific override beats default key', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'codex-home-'));
  writeFileSync(
    path.join(dir, '.omx-config.json'),
    JSON.stringify({ models: { default: 'd', team: 'team-model' } }),
  );
  assert.equal(resolveCodexModel({ env: {}, codexHome: dir, mode: 'team' }), 'team-model');
});

test('resolveReasoningEffort normalizes to high by default', () => {
  assert.equal(resolveReasoningEffort(undefined), 'high');
  assert.equal(resolveReasoningEffort('bogus'), 'high');
  assert.equal(resolveReasoningEffort('low'), 'low');
  assert.equal(resolveReasoningEffort('minimal'), 'minimal');
});
