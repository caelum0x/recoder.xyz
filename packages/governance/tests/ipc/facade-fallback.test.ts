import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

import { Governance } from '../../src/governance';
import { createGovernanceRequest } from '../../src/domain/governance-request';
import { encodeFrame, FrameDecoder } from '../../src/ipc/codec';
import type { IpcRequestEnvelope } from '../../src/ipc/envelope';
import { makeAgent, makeTask, makeLock } from '../fixtures';

function allowActor() {
  return makeAgent({ permissions: { ...makeAgent().permissions, defaultFileEffect: 'allow', allowShell: true } });
}

/** An in-bounds write the TS policy ALLOWS. */
function allowedWriteReq() {
  return createGovernanceRequest({
    actor: allowActor(),
    task: makeTask(),
    action: 'file.write',
    target: { path: 'src/components/x.ts' },
    workLocks: [makeLock({ pathGlob: 'src/**' })],
    context: { workspaceRoot: process.cwd() },
  });
}

/** A forbidden-path write the TS policy DENIES. */
function deniedWriteReq() {
  return createGovernanceRequest({
    actor: allowActor(),
    task: makeTask(),
    action: 'file.write',
    target: { path: 'src/auth/login.ts' },
    workLocks: [makeLock({ pathGlob: 'src/**' })],
  });
}

describe('Governance facade — default TS path (no socket configured)', () => {
  it('has no daemon and decides via the pure-TS deny-biased path', async () => {
    const gov = await Governance.create();
    assert.equal(gov.hasDaemon(), false);

    const allow = await gov.decide(allowedWriteReq());
    assert.equal(allow.effect, 'allow');

    const deny = await gov.decide(deniedWriteReq());
    assert.equal(deny.effect, 'deny');
    gov.close();
  });
});

describe('Governance facade — daemon configured but UNREACHABLE -> real fallback', () => {
  it('wires a daemon, then falls back to the TS path (allow under policy)', async () => {
    const dead = path.join(os.tmpdir(), `gov-dead-${Date.now()}.sock`);
    const gov = await Governance.create({ daemonSocketPath: dead });
    assert.equal(gov.hasDaemon(), true); // the client IS wired (not faked away)

    const verdict = await gov.decide(allowedWriteReq());
    // The daemon is unreachable -> DaemonUnavailable -> TS path runs.
    assert.equal(verdict.effect, 'allow');
    // The TS path marks degraded:true; this proves the fallback ran (the daemon
    // path would set degraded:false).
    assert.equal(verdict.degraded, true);
    gov.close();
  });

  it('falls back to the TS path and DENIES over policy (no faked allow)', async () => {
    const dead = path.join(os.tmpdir(), `gov-dead2-${Date.now()}.sock`);
    const gov = await Governance.create({ daemonSocketPath: dead });
    const verdict = await gov.decide(deniedWriteReq());
    assert.equal(verdict.effect, 'deny');
    assert.equal(verdict.degraded, true);
    // The audit chain still recorded the denial (the TS path is fully live).
    assert.ok(verdict.auditHash);
    assert.equal(gov.verifyAudit().ok, true);
    gov.close();
  });

  it('enforceTool falls back to the TS deny-biased enforcer when the daemon is down', async () => {
    const dead = path.join(os.tmpdir(), `gov-dead3-${Date.now()}.sock`);
    const gov = await Governance.create({ daemonSocketPath: dead });
    // read_only agent + a mutating bash command -> TS enforcer denies.
    const result = await gov.enforceTool('bash', 'rm -rf /', { actor: makeAgent() }, 'bash');
    assert.equal(result.outcome, 'denied');
    gov.close();
  });

  it('recordAuditViaDaemon falls back to the local Merkle chain when the daemon is down', async () => {
    const dead = path.join(os.tmpdir(), `gov-dead4-${Date.now()}.sock`);
    const gov = await Governance.create({ daemonSocketPath: dead });
    const before = gov.auditEntries().length;
    const hash = await gov.recordAuditViaDaemon({
      timestamp: new Date().toISOString(),
      actor: 'agent-1',
      action: 'decision.made',
      detail: 'fallback record',
      outcome: 'deny',
    });
    assert.ok(hash);
    assert.equal(gov.auditEntries().length, before + 1);
    assert.equal(gov.verifyAudit().ok, true);
    gov.close();
  });

  it('healthViaDaemon reports degraded/unavailable when the daemon is down (no false up)', async () => {
    const dead = path.join(os.tmpdir(), `gov-dead5-${Date.now()}.sock`);
    const gov = await Governance.create({ daemonSocketPath: dead });
    const h = await gov.healthViaDaemon();
    assert.equal(h.status, 'degraded');
    assert.equal(h.daemon, 'unavailable');
    gov.close();
  });
});

describe('Governance facade — live daemon delegation', () => {
  it('delegates decide() to a live daemon and marks the verdict authoritative (degraded:false)', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gov-live-'));
    const socketPath = path.join(dir, 'gov.sock');
    const server = net.createServer((socket) => {
      const decoder = new FrameDecoder();
      socket.on('data', (chunk: Buffer) => {
        for (const raw of decoder.push(chunk)) {
          const req = raw as IpcRequestEnvelope;
          // The daemon authoritatively DENIES even though the TS policy would allow.
          const result =
            req.method === 'decide'
              ? { effect: 'deny', tier: 'critical', reason: 'daemon authority' }
              : {};
          socket.write(
            encodeFrame({ kind: 'response', id: req.id, method: req.method, protocol: 1, ok: true, result }),
          );
        }
      });
      socket.on('error', () => {});
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const gov = await Governance.create({ daemonSocketPath: socketPath });
    try {
      // allowedWriteReq() is ALLOWED by the TS policy; the live daemon denies it.
      // Proving delegation: the verdict follows the daemon, and degraded is false.
      const verdict = await gov.decide(allowedWriteReq());
      assert.equal(verdict.effect, 'deny');
      assert.equal(verdict.tier, 'critical');
      assert.equal(verdict.reason, 'daemon authority');
      assert.equal(verdict.degraded, false);
      // A denied verdict is structurally unroutable.
      assert.equal(verdict.routing.routable, false);
    } finally {
      gov.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to TS when the live daemon returns a malformed verdict (hostile)', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gov-bad-'));
    const socketPath = path.join(dir, 'gov.sock');
    const server = net.createServer((socket) => {
      const decoder = new FrameDecoder();
      socket.on('data', (chunk: Buffer) => {
        for (const raw of decoder.push(chunk)) {
          const req = raw as IpcRequestEnvelope;
          // Malformed: effect is not a valid governance effect.
          const result = req.method === 'decide' ? { effect: 'maybe', tier: 'low', reason: 'x' } : {};
          socket.write(
            encodeFrame({ kind: 'response', id: req.id, method: req.method, protocol: 1, ok: true, result }),
          );
        }
      });
      socket.on('error', () => {});
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const gov = await Governance.create({ daemonSocketPath: socketPath });
    try {
      // Malformed daemon reply -> DaemonUnavailable -> TS path (allow under policy).
      const verdict = await gov.decide(allowedWriteReq());
      assert.equal(verdict.effect, 'allow');
      assert.equal(verdict.degraded, true); // TS fallback ran
    } finally {
      gov.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
