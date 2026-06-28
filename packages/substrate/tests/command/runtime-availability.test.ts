/**
 * runtime-availability tests (design §11): the probe is TRUTHFUL — it reports
 * one entry per known runtime, each with a boolean `available` reflecting actual
 * PATH presence, never an assumed value.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimeAvailability } from '../../src/command/index.js';
import { CONDUCTOR_RUNTIME_IDS } from '../../src/types/index.js';
import { isConductorRuntimeId } from '../../src/command/index.js';

test('reports exactly one entry per known runtime', async () => {
  const results = await runtimeAvailability();
  assert.equal(results.length, CONDUCTOR_RUNTIME_IDS.length);
  const ids = new Set(results.map((r) => r.runtimeId));
  for (const id of CONDUCTOR_RUNTIME_IDS) assert.ok(ids.has(id));
});

test('each entry carries a concrete bin and a boolean available flag', async () => {
  const results = await runtimeAvailability();
  for (const r of results) {
    assert.ok(isConductorRuntimeId(r.runtimeId));
    assert.ok(typeof r.bin === 'string' && r.bin.length > 0);
    assert.equal(typeof r.available, 'boolean');
    // path is present iff available (truthful: no path implies not available).
    assert.equal(Boolean(r.path), r.available);
  }
});

test('isConductorRuntimeId rejects non-runtimes and accepts known ones', () => {
  assert.equal(isConductorRuntimeId('claude_code'), true);
  assert.equal(isConductorRuntimeId('qwen_code'), true);
  assert.equal(isConductorRuntimeId('totally_made_up'), false);
  assert.equal(isConductorRuntimeId(''), false);
});
