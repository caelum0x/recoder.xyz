/**
 * runtime-availability tests (design §11): the probe is TRUTHFUL — it reports
 * one entry per known runtime, each with a boolean `available` reflecting actual
 * PATH presence, never an assumed value.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runtimeAvailability } from '../../src/command/index.js';
import { CONDUCTOR_RUNTIME_IDS } from '../../src/types/index.js';
import { isConductorRuntimeId, isInProcessRuntimeId } from '../../src/command/index.js';

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
  assert.equal(isConductorRuntimeId('cursor'), true);
  assert.equal(isConductorRuntimeId('totally_made_up'), false);
  assert.equal(isConductorRuntimeId(''), false);
});

test('cursor is TRUTHFULLY available iff cursor-agent is on PATH', async (t) => {
  const fakeBinDir = mkdtempSync(join(tmpdir(), 'substrate-cursor-'));
  const originalPath = process.env.PATH;
  t.after(() => {
    process.env.PATH = originalPath;
    rmSync(fakeBinDir, { recursive: true, force: true });
  });

  // PATH without cursor-agent → cursor is listed but honestly unavailable.
  process.env.PATH = fakeBinDir;
  const absent = (await runtimeAvailability()).find((r) => r.runtimeId === 'cursor');
  assert.ok(absent, 'cursor missing from availability listing');
  assert.equal(absent.bin, 'cursor-agent');
  assert.equal(absent.available, false);
  assert.equal(absent.path, undefined);

  // PATH with an executable cursor-agent → cursor is available with its real path.
  const fakeBin = join(fakeBinDir, 'cursor-agent');
  writeFileSync(fakeBin, '#!/bin/sh\nexit 0\n');
  chmodSync(fakeBin, 0o755);
  const present = (await runtimeAvailability()).find((r) => r.runtimeId === 'cursor');
  assert.ok(present, 'cursor missing from availability listing');
  assert.equal(present.available, true);
  assert.equal(present.path, fakeBin);
});

test('opencode is TRUTHFULLY available iff the opencode binary is on PATH', async (t) => {
  const fakeBinDir = mkdtempSync(join(tmpdir(), 'substrate-opencode-'));
  const originalPath = process.env.PATH;
  t.after(() => {
    process.env.PATH = originalPath;
    rmSync(fakeBinDir, { recursive: true, force: true });
  });

  // PATH without opencode → listed but honestly unavailable, with the reason.
  process.env.PATH = fakeBinDir;
  const absent = (await runtimeAvailability()).find((r) => r.runtimeId === 'opencode');
  assert.ok(absent, 'opencode missing from availability listing');
  assert.equal(absent.bin, 'opencode');
  assert.equal(absent.available, false);
  assert.equal(absent.path, undefined);
  assert.match(absent.reason ?? '', /'opencode' not found on PATH/);

  // PATH with an executable opencode → available with its real path, no reason.
  const fakeBin = join(fakeBinDir, 'opencode');
  writeFileSync(fakeBin, '#!/bin/sh\nexit 0\n');
  chmodSync(fakeBin, 0o755);
  const present = (await runtimeAvailability()).find((r) => r.runtimeId === 'opencode');
  assert.ok(present, 'opencode missing from availability listing');
  assert.equal(present.available, true);
  assert.equal(present.path, fakeBin);
  assert.equal(present.reason, undefined);
});

test('cursor with ONLY the editor binary stays unavailable with an attach-only reason (never faked launchable)', async (t) => {
  const fakeBinDir = mkdtempSync(join(tmpdir(), 'substrate-cursor-editor-'));
  const originalPath = process.env.PATH;
  t.after(() => {
    process.env.PATH = originalPath;
    rmSync(fakeBinDir, { recursive: true, force: true });
  });

  // Only the `cursor` EDITOR on PATH (no cursor-agent) → present-but-attach-only.
  const editorBin = join(fakeBinDir, 'cursor');
  writeFileSync(editorBin, '#!/bin/sh\nexit 0\n');
  chmodSync(editorBin, 0o755);
  process.env.PATH = fakeBinDir;
  const editorOnly = (await runtimeAvailability()).find((r) => r.runtimeId === 'cursor');
  assert.ok(editorOnly, 'cursor missing from availability listing');
  assert.equal(editorOnly.available, false);
  assert.equal(editorOnly.path, undefined);
  assert.match(editorOnly.reason ?? '', /attach-only/);
  assert.match(editorOnly.reason ?? '', /cursor-agent/);

  // Nothing cursor-ish on PATH at all → the plain absent-binary reason.
  rmSync(editorBin, { force: true });
  const absent = (await runtimeAvailability()).find((r) => r.runtimeId === 'cursor');
  assert.ok(absent, 'cursor missing from availability listing');
  assert.equal(absent.available, false);
  assert.match(absent.reason ?? '', /'cursor-agent' not found on PATH/);
});

test('isInProcessRuntimeId accepts only in-process runtimes (never CLIs)', () => {
  assert.equal(isInProcessRuntimeId('openfang'), true);
  assert.equal(isInProcessRuntimeId('cursor'), false);
  assert.equal(isInProcessRuntimeId('claude_code'), false);
});
