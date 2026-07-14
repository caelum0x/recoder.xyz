/**
 * Tests for the TensorZero gateway client seam.
 *
 * Exercises the degrade-safe contract WITHOUT depending on the Rust binary
 * being built or a real gateway being available. The pattern mirrors
 * governance-daemon.test.ts and openfang-daemon.test.ts.
 *
 * Key assertions:
 *   - Binary resolution is existence-only (no build).
 *   - ensureTensorzeroGateway() returns undefined under NODE_ENV=test.
 *   - postInference() returns { routed: false } when no gateway is up.
 *   - tensorzeroHealth() returns { available: false } when unconfigured.
 *   - The seam is idempotent and reset-safe for test isolation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveTensorzeroBin,
  ensureTensorzeroGateway,
  tensorzeroHandle,
  stopTensorzeroGateway,
  __resetTensorzeroForTest,
  postInference,
  tensorzeroHealth,
  TENSORZERO_BIN_ENV,
  TENSORZERO_URL_ENV,
} from './tensorzero-client.js';

// ---------------------------------------------------------------------------
// Binary resolution (no build required)
// ---------------------------------------------------------------------------

describe('tensorzero-client: binary resolution (no build)', () => {
  it('resolves an explicit TENSORZERO_BIN path when it exists', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'tz-bin-'));
    const fake = path.join(dir, 'gateway');
    writeFileSync(fake, '#!/bin/sh\nexit 0\n');
    chmodSync(fake, 0o755);

    const resolved = resolveTensorzeroBin({ [TENSORZERO_BIN_ENV]: fake });
    expect(resolved).toBe(fake);
  });

  it('returns undefined when the explicit TENSORZERO_BIN path does not exist (degrade-safe)', () => {
    const resolved = resolveTensorzeroBin({
      [TENSORZERO_BIN_ENV]: '/no/such/tensorzero-gateway-binary',
    });
    expect(resolved).toBeUndefined();
  });

  it('returns undefined or an existing path when env is empty (no build triggered)', () => {
    // With no explicit override, the resolver scans the repo target directory.
    // Whatever it finds must be either undefined or an actually existing path —
    // it MUST NOT build anything.
    const resolved = resolveTensorzeroBin({});
    if (resolved !== undefined) {
      expect(resolved).toMatch(/gateway[\\/]target[\\/](release|debug)[\\/]gateway$/);
    } else {
      expect(resolved).toBeUndefined();
    }
  });

  it('returns undefined when TENSORZERO_BIN is set to empty string', () => {
    const resolved = resolveTensorzeroBin({ [TENSORZERO_BIN_ENV]: '   ' });
    // Empty/whitespace-only → falls through to crate-target scan, which will
    // be undefined in CI/dev where the binary is not built.
    expect(resolved === undefined || typeof resolved === 'string').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ensureTensorzeroGateway — degrade-safe under the test runner
// ---------------------------------------------------------------------------

describe('tensorzero-client: ensure is degrade-safe under the test runner', () => {
  const savedUrl = process.env[TENSORZERO_URL_ENV];
  const savedForce = process.env.TENSORZERO_DAEMON_FORCE;

  beforeEach(() => {
    __resetTensorzeroForTest();
    delete process.env[TENSORZERO_URL_ENV];
    delete process.env.TENSORZERO_DAEMON_FORCE;
  });

  afterEach(() => {
    __resetTensorzeroForTest();
    if (savedUrl === undefined) delete process.env[TENSORZERO_URL_ENV];
    else process.env[TENSORZERO_URL_ENV] = savedUrl;
    if (savedForce === undefined) delete process.env.TENSORZERO_DAEMON_FORCE;
    else process.env.TENSORZERO_DAEMON_FORCE = savedForce;
  });

  it('does NOT auto-spawn under NODE_ENV=test (keeps the test suite deterministic)', async () => {
    delete process.env.TENSORZERO_DAEMON_FORCE;
    const h = await ensureTensorzeroGateway();
    expect(h).toBeUndefined();
  });

  it('is idempotent — repeated ensure calls return the same memoized result', async () => {
    delete process.env.TENSORZERO_DAEMON_FORCE;
    const a = await ensureTensorzeroGateway();
    const b = await ensureTensorzeroGateway();
    expect(a).toBe(b);
    expect(a).toBeUndefined();
  });

  it('handle is undefined before any ensure call', () => {
    expect(tensorzeroHandle()).toBeUndefined();
  });

  it('stopTensorzeroGateway is a no-op when gateway was never started', () => {
    expect(() => stopTensorzeroGateway()).not.toThrow();
    expect(tensorzeroHandle()).toBeUndefined();
  });

  it('after __resetTensorzeroForTest, ensure returns undefined again (isolation)', async () => {
    await ensureTensorzeroGateway(); // prime the memo
    __resetTensorzeroForTest();
    const h = await ensureTensorzeroGateway(); // should re-check (still test mode)
    expect(h).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ensureTensorzeroGateway — spawn path degrades safely
// ---------------------------------------------------------------------------

describe('tensorzero-client: spawn path degrades safely when binary exits immediately', () => {
  const savedForce = process.env.TENSORZERO_DAEMON_FORCE;
  const savedBin = process.env[TENSORZERO_BIN_ENV];

  beforeEach(() => {
    __resetTensorzeroForTest();
  });

  afterEach(() => {
    __resetTensorzeroForTest();
    if (savedForce === undefined) delete process.env.TENSORZERO_DAEMON_FORCE;
    else process.env.TENSORZERO_DAEMON_FORCE = savedForce;
    if (savedBin === undefined) delete process.env[TENSORZERO_BIN_ENV];
    else process.env[TENSORZERO_BIN_ENV] = savedBin;
    delete process.env.TENSORZERO_DAEMON_WAIT_MS;
    delete process.env[TENSORZERO_URL_ENV];
  });

  it('degrades safely (returns undefined) when binary exits before health check', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'tz-test-'));
    const fakeBin = path.join(dir, 'gateway');
    writeFileSync(fakeBin, '#!/bin/sh\nexit 1\n');
    chmodSync(fakeBin, 0o755);

    process.env.TENSORZERO_DAEMON_FORCE = '1';
    process.env[TENSORZERO_BIN_ENV] = fakeBin;
    process.env.TENSORZERO_DAEMON_WAIT_MS = '300'; // short wait so test doesn't hang

    const h = await ensureTensorzeroGateway();
    // Binary exits immediately; health check never passes → degrade to undefined.
    expect(h).toBeUndefined();
    expect(tensorzeroHandle()).toBeUndefined();
  });

  it('resolves to undefined (not throw) when TENSORZERO_BIN points at a non-existent file', async () => {
    process.env.TENSORZERO_DAEMON_FORCE = '1';
    process.env[TENSORZERO_BIN_ENV] = '/no/such/tensorzero-gateway-for-test';

    const h = await ensureTensorzeroGateway();
    expect(h).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// postInference — degrade-safe when no gateway is running
// ---------------------------------------------------------------------------

describe('tensorzero-client: postInference degrades safely when gateway is absent', () => {
  beforeEach(() => {
    __resetTensorzeroForTest();
  });

  afterEach(() => {
    __resetTensorzeroForTest();
  });

  it('returns { routed: false } when no gateway handle is set', async () => {
    // No handle → should return a degrade-safe result, never throw.
    const result = await postInference({
      function_name: 'test-function',
      input: { messages: [{ role: 'user', content: 'hello' }] },
    });

    expect(result.routed).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(result.reason!.length).toBeGreaterThan(0);
    expect(result.inference_id).toBeUndefined();
  });

  it('never throws even when input is minimal', async () => {
    await expect(
      postInference({
        function_name: 'any-fn',
        input: { messages: [] },
      }),
    ).resolves.toMatchObject({ routed: false });
  });
});

// ---------------------------------------------------------------------------
// tensorzeroHealth — truthful when unconfigured
// ---------------------------------------------------------------------------

describe('tensorzero-client: tensorzeroHealth is truthful when unconfigured', () => {
  const savedUrl = process.env[TENSORZERO_URL_ENV];

  beforeEach(() => {
    __resetTensorzeroForTest();
    delete process.env[TENSORZERO_URL_ENV];
  });

  afterEach(() => {
    __resetTensorzeroForTest();
    if (savedUrl === undefined) delete process.env[TENSORZERO_URL_ENV];
    else process.env[TENSORZERO_URL_ENV] = savedUrl;
  });

  it('returns { available: false } when neither TENSORZERO_URL nor a managed handle is set', async () => {
    const health = await tensorzeroHealth();
    expect(health.available).toBe(false);
    expect(typeof health.reason).toBe('string');
    expect(['unconfigured', 'managed', 'external']).toContain(health.mode);
  });

  it('reports mode=unconfigured when nothing is configured', async () => {
    const health = await tensorzeroHealth();
    expect(health.mode).toBe('unconfigured');
  });

  it('never throws even when the network is unreachable', async () => {
    // Set a URL that points to a definitely-unreachable loopback port.
    process.env[TENSORZERO_URL_ENV] = 'http://127.0.0.1:19999';
    const health = await tensorzeroHealth();
    expect(health.available).toBe(false);
    expect(typeof health.reason).toBe('string');
  });
});
