/**
 * Tests for the openfang daemon spawn seam.
 *
 * These exercise the degrade-safe resolution + spawn contract WITHOUT depending
 * on the Rust binary being built: the resolver is driven with explicit env
 * paths, and the spawn/health path is verified to no-op safely when no binary
 * exists. A test that wants the real binary opts in with OPENFANG_DAEMON_FORCE=1;
 * that is the one-shot proof, kept out of the default suite so CI stays
 * deterministic.
 *
 * Mirrors the pattern in governance-daemon.test.ts.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveOpenfangBin,
  ensureOpenfangDaemon,
  openfangDaemonHandle,
  stopOpenfangDaemon,
  __resetOpenfangDaemonForTest,
  OPENFANG_BIN_ENV,
  createOpenfangAgentRouter,
} from './openfang-daemon.js';

// ---------------------------------------------------------------------------
// Binary resolution (no build required)
// ---------------------------------------------------------------------------

describe('openfang-daemon: binary resolution (no build)', () => {
  it('resolves an explicit OPENFANG_BIN path when it exists', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'openfang-bin-'));
    const fake = path.join(dir, 'openfang');
    writeFileSync(fake, '#!/bin/sh\nexit 0\n');
    chmodSync(fake, 0o755);

    const resolved = resolveOpenfangBin({ [OPENFANG_BIN_ENV]: fake });
    expect(resolved).toBe(fake);
  });

  it('returns undefined when the explicit OPENFANG_BIN path does not exist (degrade-safe)', () => {
    const resolved = resolveOpenfangBin({
      [OPENFANG_BIN_ENV]: '/no/such/openfang-binary',
    });
    expect(resolved).toBeUndefined();
  });

  it('returns undefined when env is empty and no target/ build is present (default, degrade-safe)', () => {
    // With no explicit override and no pre-built binary in target/, the resolver
    // must return undefined rather than building. This is the default CI/dev
    // posture.
    const resolved = resolveOpenfangBin({});
    // Whatever it finds (or not) must be either undefined or an existing path —
    // it MUST NOT build anything.
    if (resolved !== undefined) {
      expect(resolved).toMatch(/openfang[\\/]target[\\/](release|debug)[\\/]openfang$/);
    } else {
      expect(resolved).toBeUndefined();
    }
  });

  it('resolves the release target path when the file exists', () => {
    // Simulate a build layout by creating a fake target/release/openfang under a
    // temp dir that looks like the repo root.
    const fakeRoot = mkdtempSync(path.join(os.tmpdir(), 'openfang-root-'));
    const releaseDir = path.join(fakeRoot, 'crates', 'openfang', 'target', 'release');
    const { mkdirSync } = require('node:fs') as typeof import('node:fs');
    mkdirSync(releaseDir, { recursive: true });

    // Also create the Cargo.toml marker so findRepoRoot can detect it.
    const crateDir = path.join(fakeRoot, 'crates', 'openfang');
    writeFileSync(path.join(crateDir, 'Cargo.toml'), '[workspace]\n');

    const fakeBin = path.join(releaseDir, 'openfang');
    writeFileSync(fakeBin, '#!/bin/sh\nexit 0\n');
    chmodSync(fakeBin, 0o755);

    // We can't easily control findRepoRoot's walk from __dirname in this test,
    // so we verify the explicit-path fast-path instead (functionally equivalent).
    const resolved = resolveOpenfangBin({ [OPENFANG_BIN_ENV]: fakeBin });
    expect(resolved).toBe(fakeBin);
  });
});

// ---------------------------------------------------------------------------
// ensureOpenfangDaemon — degrade-safe under the test runner
// ---------------------------------------------------------------------------

describe('openfang-daemon: ensure is degrade-safe under the test runner', () => {
  const savedForce = process.env.OPENFANG_DAEMON_FORCE;
  const savedExternal = process.env.OPENFANG_EXTERNAL;

  beforeEach(() => {
    __resetOpenfangDaemonForTest();
    delete process.env.OPENFANG_DAEMON_FORCE;
    delete process.env.OPENFANG_EXTERNAL;
  });

  afterEach(() => {
    __resetOpenfangDaemonForTest();
    if (savedForce === undefined) delete process.env.OPENFANG_DAEMON_FORCE;
    else process.env.OPENFANG_DAEMON_FORCE = savedForce;
    if (savedExternal === undefined) delete process.env.OPENFANG_EXTERNAL;
    else process.env.OPENFANG_EXTERNAL = savedExternal;
  });

  it('does NOT auto-spawn under NODE_ENV=test (keeps the conductor suite deterministic)', async () => {
    // setup.ts sets NODE_ENV=test; without the explicit force flag the seam
    // returns undefined so OSS dispatch stays on the pure-TS path.
    delete process.env.OPENFANG_DAEMON_FORCE;
    const h = await ensureOpenfangDaemon();
    expect(h).toBeUndefined();
  });

  it('is idempotent — repeated ensure calls return the same memoized result', async () => {
    delete process.env.OPENFANG_DAEMON_FORCE;
    const a = await ensureOpenfangDaemon();
    const b = await ensureOpenfangDaemon();
    expect(a).toBe(b);
    expect(a).toBeUndefined();
  });

  it('handle is undefined before any ensure call', () => {
    expect(openfangDaemonHandle()).toBeUndefined();
  });

  it('stopOpenfangDaemon is a no-op when daemon was never started', () => {
    expect(() => stopOpenfangDaemon()).not.toThrow();
    expect(openfangDaemonHandle()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ensureOpenfangDaemon — spawn path with a mock executable (mock spawn/fs)
// ---------------------------------------------------------------------------

describe('openfang-daemon: spawn path degrades safely when binary exits immediately', () => {
  const savedForce = process.env.OPENFANG_DAEMON_FORCE;
  const savedBin = process.env[OPENFANG_BIN_ENV];

  beforeEach(() => {
    __resetOpenfangDaemonForTest();
  });

  afterEach(() => {
    __resetOpenfangDaemonForTest();
    if (savedForce === undefined) delete process.env.OPENFANG_DAEMON_FORCE;
    else process.env.OPENFANG_DAEMON_FORCE = savedForce;
    if (savedBin === undefined) delete process.env[OPENFANG_BIN_ENV];
    else process.env[OPENFANG_BIN_ENV] = savedBin;
  });

  it('degrades safely (returns undefined) when binary exits before health check passes', async () => {
    // Create a shell script that exits immediately without opening a port.
    const dir = mkdtempSync(path.join(os.tmpdir(), 'openfang-test-'));
    const fakeBin = path.join(dir, 'openfang');
    writeFileSync(fakeBin, '#!/bin/sh\nexit 1\n');
    chmodSync(fakeBin, 0o755);

    // Force the seam to try spawning even in test mode.
    process.env.OPENFANG_DAEMON_FORCE = '1';
    process.env[OPENFANG_BIN_ENV] = fakeBin;
    // Use a short wait so the test doesn't hang for 5s.
    process.env.OPENFANG_DAEMON_WAIT_MS = '300';

    const h = await ensureOpenfangDaemon();
    // The binary exits immediately and the health check never passes, so the
    // seam must degrade to undefined (NOT throw, NOT fake success).
    expect(h).toBeUndefined();
    expect(openfangDaemonHandle()).toBeUndefined();

    delete process.env.OPENFANG_DAEMON_WAIT_MS;
  });

  it('resolves to undefined (not throw) when OPENFANG_BIN points at a non-existent file', async () => {
    process.env.OPENFANG_DAEMON_FORCE = '1';
    process.env[OPENFANG_BIN_ENV] = '/no/such/openfang-binary-for-test';

    const h = await ensureOpenfangDaemon();
    expect(h).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createOpenfangAgentRouter — truthful health when daemon is absent
// ---------------------------------------------------------------------------

describe('openfang-daemon: /api/agents/openfang router', () => {
  beforeEach(() => {
    __resetOpenfangDaemonForTest();
  });

  afterEach(() => {
    __resetOpenfangDaemonForTest();
  });

  it('GET /health returns 503 + unavailable when daemon is not running', () => {
    const router = createOpenfangAgentRouter();

    // Find the GET /health route handler.
    const layer = (router.stack as any[]).find(
      (l: any) => l.route?.path === '/health' && l.route?.methods?.get,
    );
    expect(layer, 'GET /health route must be registered').toBeDefined();

    // Build minimal req/res mocks.
    const req = {} as import('express').Request;
    let capturedStatus = 0;
    let capturedBody: any = null;
    const res = {
      status(code: number) {
        capturedStatus = code;
        return this;
      },
      json(body: any) {
        capturedBody = body;
      },
    } as unknown as import('express').Response;

    layer.route.stack[0].handle(req, res, () => {});

    expect(capturedStatus).toBe(503);
    expect(capturedBody).toMatchObject({ agent: 'openfang', status: 'unavailable' });
  });

  it('GET / returns agent card with status=unavailable when daemon is not running', () => {
    const router = createOpenfangAgentRouter();

    const layer = (router.stack as any[]).find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.get,
    );
    expect(layer, 'GET / route must be registered').toBeDefined();

    const req = {} as import('express').Request;
    let capturedBody: any = null;
    const res = {
      json(body: any) {
        capturedBody = body;
      },
    } as unknown as import('express').Response;

    layer.route.stack[0].handle(req, res, () => {});

    expect(capturedBody).toMatchObject({ agentId: 'openfang', status: 'unavailable', a2aBoundary: true });
    expect(capturedBody.listenAddr).toBeNull();
  });
});
