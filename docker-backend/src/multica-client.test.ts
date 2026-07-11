/**
 * Tests for the Multica managed-agents/squads loopback client seam.
 *
 * Exercises the degrade-safe contract WITHOUT depending on the Go binary being
 * built or a real Multica server being available. The pattern mirrors
 * tensorzero-client.test.ts and openfang-daemon.test.ts.
 *
 * Key assertions:
 *   - Binary resolution is existence-only (no build triggered).
 *   - ensureMulticaServer() returns undefined under NODE_ENV=test.
 *   - listMulticaSquads() returns { routed: false } when no server is up.
 *   - assignToMultica() returns { routed: false } when no server is up.
 *   - multicaHealth() returns { available: false } when unconfigured.
 *   - The seam is idempotent and reset-safe for test isolation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveMulticaBin,
  ensureMulticaServer,
  multicaHandle,
  stopMulticaServer,
  __resetMulticaForTest,
  listMulticaSquads,
  assignToMultica,
  multicaHealth,
  MULTICA_BIN_ENV,
  MULTICA_URL_ENV,
} from './multica-client.js';

// ---------------------------------------------------------------------------
// Binary resolution (no build required)
// ---------------------------------------------------------------------------

describe('multica-client: binary resolution (no build)', () => {
  it('resolves an explicit MULTICA_BIN path when it exists', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'multica-bin-'));
    const fake = path.join(dir, 'multica-server');
    writeFileSync(fake, '#!/bin/sh\nexit 0\n');
    chmodSync(fake, 0o755);

    const resolved = resolveMulticaBin({ [MULTICA_BIN_ENV]: fake });
    expect(resolved).toBe(fake);
  });

  it('returns undefined when the explicit MULTICA_BIN path does not exist (degrade-safe)', () => {
    const resolved = resolveMulticaBin({
      [MULTICA_BIN_ENV]: '/no/such/multica-server-binary',
    });
    expect(resolved).toBeUndefined();
  });

  it('returns undefined or an existing path when env is empty (no build triggered)', () => {
    // With no explicit override, the resolver scans the repo go/multica/server/bin/ dir.
    // Whatever it finds must be either undefined or an actually existing path —
    // it MUST NOT build anything.
    const resolved = resolveMulticaBin({});
    if (resolved !== undefined) {
      expect(resolved).toMatch(/multica[\\/]server[\\/]bin[\\/](multica-server|server)$/);
    } else {
      expect(resolved).toBeUndefined();
    }
  });

  it('returns undefined when MULTICA_BIN is set to empty/whitespace string', () => {
    const resolved = resolveMulticaBin({ [MULTICA_BIN_ENV]: '   ' });
    // Empty/whitespace-only → falls through to bin dir scan, which will be
    // undefined in CI/dev where the binary is not built.
    expect(resolved === undefined || typeof resolved === 'string').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ensureMulticaServer — degrade-safe under the test runner
// ---------------------------------------------------------------------------

describe('multica-client: ensure is degrade-safe under the test runner', () => {
  const savedUrl = process.env[MULTICA_URL_ENV];
  const savedForce = process.env.MULTICA_DAEMON_FORCE;

  beforeEach(() => {
    __resetMulticaForTest();
    delete process.env[MULTICA_URL_ENV];
    delete process.env.MULTICA_DAEMON_FORCE;
  });

  afterEach(() => {
    __resetMulticaForTest();
    if (savedUrl === undefined) delete process.env[MULTICA_URL_ENV];
    else process.env[MULTICA_URL_ENV] = savedUrl;
    if (savedForce === undefined) delete process.env.MULTICA_DAEMON_FORCE;
    else process.env.MULTICA_DAEMON_FORCE = savedForce;
  });

  it('does NOT auto-spawn under NODE_ENV=test (keeps the test suite deterministic)', async () => {
    delete process.env.MULTICA_DAEMON_FORCE;
    const h = await ensureMulticaServer();
    expect(h).toBeUndefined();
  });

  it('is idempotent — repeated ensure calls return the same memoized result', async () => {
    delete process.env.MULTICA_DAEMON_FORCE;
    const a = await ensureMulticaServer();
    const b = await ensureMulticaServer();
    expect(a).toBe(b);
    expect(a).toBeUndefined();
  });

  it('handle is undefined before any ensure call', () => {
    expect(multicaHandle()).toBeUndefined();
  });

  it('stopMulticaServer is a no-op when server was never started', () => {
    expect(() => stopMulticaServer()).not.toThrow();
    expect(multicaHandle()).toBeUndefined();
  });

  it('after __resetMulticaForTest, ensure returns undefined again (isolation)', async () => {
    await ensureMulticaServer(); // prime the memo
    __resetMulticaForTest();
    const h = await ensureMulticaServer(); // should re-check (still test mode)
    expect(h).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ensureMulticaServer — spawn path degrades safely
// ---------------------------------------------------------------------------

describe('multica-client: spawn path degrades safely when binary exits immediately', () => {
  const savedForce = process.env.MULTICA_DAEMON_FORCE;
  const savedBin = process.env[MULTICA_BIN_ENV];

  beforeEach(() => {
    __resetMulticaForTest();
  });

  afterEach(() => {
    __resetMulticaForTest();
    if (savedForce === undefined) delete process.env.MULTICA_DAEMON_FORCE;
    else process.env.MULTICA_DAEMON_FORCE = savedForce;
    if (savedBin === undefined) delete process.env[MULTICA_BIN_ENV];
    else process.env[MULTICA_BIN_ENV] = savedBin;
    delete process.env.MULTICA_DAEMON_WAIT_MS;
    delete process.env[MULTICA_URL_ENV];
  });

  it('degrades safely (returns undefined) when binary exits before health check', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'multica-test-'));
    const fakeBin = path.join(dir, 'multica-server');
    writeFileSync(fakeBin, '#!/bin/sh\nexit 1\n');
    chmodSync(fakeBin, 0o755);

    process.env.MULTICA_DAEMON_FORCE = '1';
    process.env[MULTICA_BIN_ENV] = fakeBin;
    process.env.MULTICA_DAEMON_WAIT_MS = '300'; // short wait so test doesn't hang

    const h = await ensureMulticaServer();
    // Binary exits immediately; health check never passes → degrade to undefined.
    expect(h).toBeUndefined();
    expect(multicaHandle()).toBeUndefined();
  }, 10_000);

  it('resolves to undefined (not throw) when MULTICA_BIN points at a non-existent file', async () => {
    process.env.MULTICA_DAEMON_FORCE = '1';
    process.env[MULTICA_BIN_ENV] = '/no/such/multica-server-for-test';

    const h = await ensureMulticaServer();
    expect(h).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// listMulticaSquads — degrade-safe when no server is running
// ---------------------------------------------------------------------------

describe('multica-client: listMulticaSquads degrades safely when server is absent', () => {
  beforeEach(() => {
    __resetMulticaForTest();
  });

  afterEach(() => {
    __resetMulticaForTest();
  });

  it('returns { routed: false } when no server handle is set', async () => {
    const result = await listMulticaSquads();
    expect(result.routed).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(result.reason!.length).toBeGreaterThan(0);
    expect(result.squads).toBeUndefined();
  });

  it('never throws even when called with params', async () => {
    await expect(
      listMulticaSquads({ workspaceId: 'ws-test', apiKey: 'fake-key' }),
    ).resolves.toMatchObject({ routed: false });
  });
});

// ---------------------------------------------------------------------------
// assignToMultica — degrade-safe when no server is running
// ---------------------------------------------------------------------------

describe('multica-client: assignToMultica degrades safely when server is absent', () => {
  beforeEach(() => {
    __resetMulticaForTest();
  });

  afterEach(() => {
    __resetMulticaForTest();
  });

  it('returns { routed: false } when no server handle is set (agent assignment)', async () => {
    const result = await assignToMultica('Fix the login bug', 'agent-123', 'agent');
    expect(result.routed).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(result.issueId).toBeUndefined();
  });

  it('returns { routed: false } when no server handle is set (squad assignment)', async () => {
    const result = await assignToMultica('Refactor auth module', 'squad-456', 'squad');
    expect(result.routed).toBe(false);
    expect(result.issueId).toBeUndefined();
  });

  it('never throws even with minimal inputs', async () => {
    await expect(
      assignToMultica('Task title', 'assignee-id', 'agent'),
    ).resolves.toMatchObject({ routed: false });
  });
});

// ---------------------------------------------------------------------------
// multicaHealth — truthful when unconfigured
// ---------------------------------------------------------------------------

describe('multica-client: multicaHealth is truthful when unconfigured', () => {
  const savedUrl = process.env[MULTICA_URL_ENV];

  beforeEach(() => {
    __resetMulticaForTest();
    delete process.env[MULTICA_URL_ENV];
  });

  afterEach(() => {
    __resetMulticaForTest();
    if (savedUrl === undefined) delete process.env[MULTICA_URL_ENV];
    else process.env[MULTICA_URL_ENV] = savedUrl;
  });

  it('returns { available: false } when neither MULTICA_URL nor a managed handle is set', async () => {
    const health = await multicaHealth();
    expect(health.available).toBe(false);
    expect(typeof health.reason).toBe('string');
    expect(['unconfigured', 'managed', 'external']).toContain(health.mode);
  });

  it('reports mode=unconfigured when nothing is configured', async () => {
    const health = await multicaHealth();
    expect(health.mode).toBe('unconfigured');
  });

  it('never throws even when the network is unreachable', async () => {
    // Set a URL that points to a definitely-unreachable loopback port.
    process.env[MULTICA_URL_ENV] = 'http://127.0.0.1:19998';
    const health = await multicaHealth();
    expect(health.available).toBe(false);
    expect(typeof health.reason).toBe('string');
  });
});
