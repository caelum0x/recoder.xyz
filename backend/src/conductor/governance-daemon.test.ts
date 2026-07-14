/**
 * Tests for the governance daemon spawn seam.
 *
 * These exercise the degrade-safe resolution + spawn contract WITHOUT depending
 * on the Rust binary being built: the resolver is driven with explicit env paths,
 * and the spawn path is verified to no-op safely when no binary exists. A test
 * that wants the real Rust kernel opts in with GOVERNANCE_DAEMON_FORCE=1; that is
 * the one-shot proof, kept out of the default suite so it stays deterministic.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveGovernanceDaemonBin,
  ensureGovernanceDaemon,
  __resetGovernanceDaemonForTest,
  GOVERNANCE_DAEMON_ENV,
  GOVERNANCE_SOCKET_ENV,
} from './governance-daemon.js';

describe('governance-daemon: binary resolution (no build)', () => {
  it('resolves an explicit RECODER_GOVERNANCE_DAEMON path when it exists', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gov-daemon-bin-'));
    const fake = path.join(dir, 'recoder-governance-daemon');
    writeFileSync(fake, '#!/bin/sh\nexit 0\n');
    chmodSync(fake, 0o755);

    const resolved = resolveGovernanceDaemonBin({ [GOVERNANCE_DAEMON_ENV]: fake });
    expect(resolved).toBe(fake);
  });

  it('returns undefined when the explicit path does not exist (degrade-safe)', () => {
    const resolved = resolveGovernanceDaemonBin({
      [GOVERNANCE_DAEMON_ENV]: '/no/such/recoder-governance-daemon',
    });
    expect(resolved).toBeUndefined();
  });

  it('falls back to the crate target/{release,debug} layout (existence-checked)', () => {
    // With no explicit override, the resolver looks under the repo crate target.
    // Whatever it finds (or not) must be either undefined or an existing path —
    // it MUST NOT build anything.
    const resolved = resolveGovernanceDaemonBin({});
    if (resolved !== undefined) {
      expect(resolved).toMatch(/recoder-governance[\\/]target[\\/](release|debug)[\\/]recoder-governance-daemon$/);
    } else {
      expect(resolved).toBeUndefined();
    }
  });
});

describe('governance-daemon: ensure is degrade-safe under the test runner', () => {
  const savedSocket = process.env[GOVERNANCE_SOCKET_ENV];
  const savedForce = process.env.GOVERNANCE_DAEMON_FORCE;

  beforeEach(() => {
    __resetGovernanceDaemonForTest();
  });

  afterEach(() => {
    __resetGovernanceDaemonForTest();
    if (savedSocket === undefined) delete process.env[GOVERNANCE_SOCKET_ENV];
    else process.env[GOVERNANCE_SOCKET_ENV] = savedSocket;
    if (savedForce === undefined) delete process.env.GOVERNANCE_DAEMON_FORCE;
    else process.env.GOVERNANCE_DAEMON_FORCE = savedForce;
  });

  it('does NOT auto-spawn under NODE_ENV=test (keeps the conductor suite deterministic)', async () => {
    // The setup file sets NODE_ENV=test; without the explicit force flag the seam
    // returns undefined so governance stays on the pure-TS path.
    delete process.env.GOVERNANCE_DAEMON_FORCE;
    const handle = await ensureGovernanceDaemon();
    expect(handle).toBeUndefined();
  });

  it('is idempotent — repeated ensure calls return the same memoized result', async () => {
    delete process.env.GOVERNANCE_DAEMON_FORCE;
    const a = await ensureGovernanceDaemon();
    const b = await ensureGovernanceDaemon();
    expect(a).toBe(b);
    expect(a).toBeUndefined();
  });
});
