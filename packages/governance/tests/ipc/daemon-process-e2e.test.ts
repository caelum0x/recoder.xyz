import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';

import { GovernanceDaemonClient } from '../../src/ipc/daemon-client';

/**
 * Cross-PROCESS round-trip proof: the REAL compiled `recoder-governance-daemon`
 * binary, spawned as a child process, answering REAL governance decisions over a
 * REAL Unix-domain socket, reached through the REAL `@recoder/governance`
 * `GovernanceDaemonClient` + the REAL `codec.ts` length-prefixed-JSON framing —
 * with NO protocol-translation shim.
 *
 * This closes the honest gap in docs/subsystems/governance.md §13 #1 — the
 * facade↔daemon round-trip was integration-tested *in Rust* only; here it is
 * exercised at the OS-process boundary from the TypeScript side, NATIVELY.
 *
 * NO STUB / NO MOCK / NO SHIM:
 *  - The verdict is computed entirely by the spawned Rust `GovernanceKernel`.
 *  - The wire is ONE real UDS connection framed by the real `codec.ts`.
 *  - The `GovernanceDaemonClient` connects DIRECTLY to the daemon's socket and
 *    frames the daemon's REAL envelope: string id, snake_case method, params +
 *    the shared `INTERNAL_SERVICE_KEY` inside `payload`, and parses the daemon's
 *    real `{ id, ok, result?, error? }` reply. No field-rename proxy exists.
 *
 * The earlier revision of this test used a translating UDS proxy because the TS
 * client and the Rust daemon pinned DIFFERENT outer envelopes. That mismatch is
 * now reconciled on the TS side (`envelope.ts` + `daemon-client.ts` mirror the
 * daemon's serde structs), so the proxy is deleted: the client speaks the
 * daemon's native wire end to end.
 *
 * If the platform cannot build the binary the suite skips with a clear message;
 * on this darwin box it builds, so it does not silently skip.
 */

const CRATE_DIR = path.resolve(__dirname, '../../../../crates/recoder-governance');
const DAEMON_BIN = path.join(CRATE_DIR, 'target/release/recoder-governance-daemon');

/** Poll until the daemon's socket file exists (it binds asynchronously). */
async function waitForSocket(socketPath: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(socketPath)) return;
    await delay(50);
  }
  throw new Error(`daemon socket did not appear at ${socketPath} within ${timeoutMs}ms`);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Poll until `predicate` holds (e.g. a stderr line has been captured). */
async function waitForStderr(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(25);
  }
  throw new Error(`daemon did not emit the expected stderr line within ${timeoutMs}ms`);
}

/** Ensure the release binary exists; build it once if missing. */
function ensureBinary(): boolean {
  if (existsSync(DAEMON_BIN)) return true;
  const build = spawnSync(
    'cargo',
    ['build', '--release', '-p', 'recoder-governance-daemon'],
    { cwd: CRATE_DIR, stdio: 'inherit' },
  );
  return build.status === 0 && existsSync(DAEMON_BIN);
}

describe('governance daemon — REAL cross-process round-trip over UDS (native wire, no shim)', () => {
  const binaryAvailable = ensureBinary();
  const skip = binaryAvailable ? undefined : 'recoder-governance-daemon binary unavailable (build failed on this platform)';

  const serviceKey = `e2e-${Math.random().toString(16).slice(2)}-${process.pid}`;
  const daemonSocketPath = path.join(
    mkdtempSync(path.join(os.tmpdir(), 'gov-daemon-')),
    'governance.sock',
  );

  let daemon: ChildProcessWithoutNullStreams | undefined;
  let daemonStderr = '';
  let client: GovernanceDaemonClient | undefined;
  let exitInfo: { code: number | null; signal: NodeJS.Signals | null } | undefined;

  before(async () => {
    if (!binaryAvailable) return;

    daemon = spawn(DAEMON_BIN, [], {
      env: { ...process.env, GOVERNANCE_SOCKET: daemonSocketPath, INTERNAL_SERVICE_KEY: serviceKey },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    daemon.stderr.on('data', (d: Buffer) => {
      daemonStderr += d.toString();
    });
    daemon.on('exit', (code, signal) => {
      exitInfo = { code, signal };
    });

    await waitForSocket(daemonSocketPath, 5_000);
    // The socket binds before the "listening on" line is necessarily flushed to
    // our captured stderr buffer; wait for that line too so the first assertion
    // (which matches the announcement) does not race the async stderr pipe.
    await waitForStderr(() => /listening on/.test(daemonStderr), 5_000);

    // The REAL client, connecting DIRECTLY to the daemon's socket with the same
    // INTERNAL_SERVICE_KEY the daemon requires (carried natively at payload.key).
    client = new GovernanceDaemonClient({
      socketPath: daemonSocketPath,
      serviceKey,
      requestTimeoutMs: 2_000,
    });
  });

  after(async () => {
    client?.close();
    if (daemon && exitInfo === undefined) {
      daemon.kill('SIGTERM');
      // Give the daemon a moment to run its SIGTERM handler + socket cleanup.
      for (let i = 0; i < 60 && exitInfo === undefined; i++) await delay(50);
    }
    try {
      rmSync(path.dirname(daemonSocketPath), { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it('spawned the real daemon binary and bound the socket', { skip }, () => {
    assert.ok(daemon, 'daemon child process should be spawned');
    assert.equal(daemon?.killed, false, 'daemon should still be running at probe time');
    assert.ok(existsSync(daemonSocketPath), 'daemon should have bound its UDS');
    assert.match(daemonStderr, /listening on/, 'daemon should announce it is listening');
    assert.match(daemonStderr, /key required/, 'daemon should require INTERNAL_SERVICE_KEY (fail-closed)');
  });

  it('health: real client -> real daemon kernel returns a healthy probe', { skip }, async () => {
    const result = (await client!.health()) as Record<string, unknown>;
    // Shape produced by the Rust dispatcher's Health arm (dispatch.rs).
    assert.equal(result.status, 'ok', 'daemon should report status ok');
    assert.equal(result.audit_verified, true, 'daemon audit chain should verify intact');
  });

  it('decide (allow): real kernel returns a real verdict with audit hash', { skip }, async () => {
    // A read of a benign path: the real kernel decides allow at the low tier.
    const verdict = (await client!.decide({
      actor: 'agent-e2e',
      task: 'task-e2e',
      action: 'file_read',
      target: 'README.md',
    })) as Record<string, unknown>;

    assert.equal(verdict.effect, 'allow', 'a benign read should be allowed by the real kernel');
    assert.equal(verdict.tier, 'low', 'a benign read classifies to the low tier');
    assert.equal(
      typeof verdict.audit_hash,
      'string',
      'the real kernel returns a SHA-256 audit chain tip hash',
    );
    assert.match(
      verdict.audit_hash as string,
      /^[0-9a-f]{64}$/,
      'audit hash is a 32-byte SHA-256 hex digest',
    );

    const route = verdict.route as Record<string, unknown>;
    assert.equal(route.kind, 'routed', 'an allowed action is routable');
    assert.equal(typeof route.tier, 'string', 'route carries a tier');
  });

  it('deny-wins: a destructive command is hard-denied (and unrouted) by the real kernel', { skip }, async () => {
    const verdict = (await client!.decide({
      actor: 'agent-e2e',
      task: 'task-e2e',
      // The kernel's permission enforcer hard-denies `rm -rf /`-class commands;
      // this is a genuine deny-wins outcome computed by the spawned Rust kernel
      // (not a tier gate -> not `needs_approval`).
      action: 'command',
      target: 'rm -rf /',
    })) as Record<string, unknown>;

    assert.equal(verdict.effect, 'deny', 'a destructive command must be hard-denied (deny-wins)');
    assert.equal(verdict.tier, 'high', 'the destructive command classifies high');
    const route = verdict.route as Record<string, unknown>;
    assert.equal(route.kind, 'unrouted', 'a denied action is structurally unroutable');
  });

  it('deny-wins: a secret-file write is denied at the critical tier by the real kernel', { skip }, async () => {
    const verdict = (await client!.decide({
      actor: 'agent-e2e',
      task: 'task-e2e',
      // Writing `.env` (a secret file) trips the forbidden-path / secret rule:
      // the real kernel returns a hard deny at the critical tier.
      action: 'file_write',
      target: '.env',
    })) as Record<string, unknown>;

    assert.equal(verdict.effect, 'deny', 'a write to .env must be denied (forbidden-path / secret rule)');
    assert.equal(verdict.tier, 'critical', 'a secret-file write classifies critical');
    const route = verdict.route as Record<string, unknown>;
    assert.equal(route.kind, 'unrouted', 'a denied action is structurally unroutable');
  });

  it('teardown: SIGTERM stops the real daemon cleanly and unlinks the socket', { skip }, async () => {
    assert.ok(daemon, 'daemon should exist');
    daemon!.kill('SIGTERM');
    for (let i = 0; i < 60 && exitInfo === undefined; i++) await delay(50);
    assert.ok(exitInfo, 'daemon should have exited after SIGTERM');
    // Clean shutdown: either a 0 exit code or termination by our SIGTERM.
    const clean = exitInfo!.code === 0 || exitInfo!.signal === 'SIGTERM';
    assert.ok(clean, `daemon should exit cleanly, got ${JSON.stringify(exitInfo)}`);
    assert.match(daemonStderr, /shut down cleanly/, 'daemon should log a clean shutdown');
    // The daemon unlinks its socket on graceful shutdown so a restart binds clean.
    assert.equal(existsSync(daemonSocketPath), false, 'daemon should unlink its socket on shutdown');
  });
});
