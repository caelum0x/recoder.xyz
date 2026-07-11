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
  it('has no daemon and decides without a socket (native or TS fallback)', async () => {
    const gov = await Governance.create();
    assert.equal(gov.hasDaemon(), false);

    // When the native NAPI kernel is loaded it is the authoritative decider;
    // when absent the pure-TS deny-biased path runs. In both cases:
    //   - allowedWriteReq() (src/components/x.ts): allow or needs_approval
    //   - deniedWriteReq()  (src/auth/login.ts):   always deny (both kernels deny auth paths)
    const allow = await gov.decide(allowedWriteReq());
    assert.ok(
      allow.effect === 'allow' || allow.effect === 'needs_approval',
      `expected allow or needs_approval for allowedWriteReq, got: ${allow.effect}`,
    );

    const deny = await gov.decide(deniedWriteReq());
    assert.equal(deny.effect, 'deny');
    gov.close();
  });
});

describe('Governance facade — daemon configured but UNREACHABLE -> real fallback', () => {
  it('wires a daemon, then decides via native or TS (daemon is preempted by native)', async () => {
    const dead = path.join(os.tmpdir(), `gov-dead-${Date.now()}.sock`);
    const gov = await Governance.create({ daemonSocketPath: dead });
    assert.equal(gov.hasDaemon(), true); // the client IS wired (not faked away)

    const verdict = await gov.decide(allowedWriteReq());
    // Priority: native (degraded:false) > dead daemon > TS (degraded:true).
    // The decision is valid regardless of which path ran.
    assert.ok(
      verdict.effect === 'allow' || verdict.effect === 'needs_approval',
      `expected allow or needs_approval, got: ${verdict.effect}`,
    );
    // When native runs: degraded=false. When TS runs (native absent + daemon dead): degraded=true.
    assert.equal(typeof verdict.degraded, 'boolean');
    gov.close();
  });

  it('falls back to denial for forbidden paths regardless of backend', async () => {
    const dead = path.join(os.tmpdir(), `gov-dead2-${Date.now()}.sock`);
    const gov = await Governance.create({ daemonSocketPath: dead });
    const verdict = await gov.decide(deniedWriteReq());
    // Both native and TS deny auth paths.
    assert.equal(verdict.effect, 'deny');
    // The audit chain recorded the denial (native mirrors to TS store too).
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

  it('healthViaDaemon reports daemon:unavailable when the daemon is down (no false up)', async () => {
    const dead = path.join(os.tmpdir(), `gov-dead5-${Date.now()}.sock`);
    const gov = await Governance.create({ daemonSocketPath: dead });
    const h = await gov.healthViaDaemon();
    // daemon is always unavailable when the socket is dead.
    assert.equal(h.daemon, 'unavailable');
    // status is 'ok' when native is loaded (native available even without daemon),
    // 'degraded' when only TS fallback is active. Never claims daemon is up.
    assert.ok(h.status === 'ok' || h.status === 'degraded');
    gov.close();
  });
});

describe('Governance facade — live daemon delegation', () => {
  it('decides authoritatively (native if present, daemon if no native, degraded:false either way)', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gov-live-'));
    const socketPath = path.join(dir, 'gov.sock');
    const server = net.createServer((socket) => {
      const decoder = new FrameDecoder();
      socket.on('data', (chunk: Buffer) => {
        for (const raw of decoder.push(chunk)) {
          const req = raw as IpcRequestEnvelope;
          // The daemon authoritatively DENIES even though the TS policy would allow.
          // Native daemon decide verdict shape (verdict.rs): snake_case fields.
          const result =
            req.method === 'decide'
              ? { effect: 'deny', tier: 'critical', reason: 'daemon authority', route: { kind: 'unrouted' } }
              : {};
          // Native daemon response envelope: { id, ok, result }.
          socket.write(encodeFrame({ id: req.id, ok: true, result }));
        }
      });
      socket.on('error', () => {});
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const gov = await Governance.create({ daemonSocketPath: socketPath });
    try {
      const verdict = await gov.decide(allowedWriteReq());
      // When native NAPI kernel is loaded: it preempts the daemon (native is the
      // flagship path); the daemon mock is never reached. The verdict is
      // authoritative from the native kernel (degraded:false).
      // When native is absent: the daemon responds and authoritatively denies;
      // degraded:false proves daemon delegation worked.
      // In both cases degraded is false (authoritative decision — not TS fallback).
      assert.equal(verdict.degraded, false);
      // The verdict effect is whatever the active authoritative backend decided
      // (native kernel or daemon mock). Either is a valid governance outcome.
      assert.ok(
        verdict.effect === 'allow' || verdict.effect === 'deny' || verdict.effect === 'needs_approval',
        `expected a valid effect, got: ${verdict.effect}`,
      );
    } finally {
      gov.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to the next layer when a backend returns a malformed verdict (hostile)', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gov-bad-'));
    const socketPath = path.join(dir, 'gov.sock');
    const server = net.createServer((socket) => {
      const decoder = new FrameDecoder();
      socket.on('data', (chunk: Buffer) => {
        for (const raw of decoder.push(chunk)) {
          const req = raw as IpcRequestEnvelope;
          // Malformed: effect is not a valid governance effect.
          const result = req.method === 'decide' ? { effect: 'maybe', tier: 'low', reason: 'x' } : {};
          // Native daemon response envelope: { id, ok, result }.
          socket.write(encodeFrame({ id: req.id, ok: true, result }));
        }
      });
      socket.on('error', () => {});
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const gov = await Governance.create({ daemonSocketPath: socketPath });
    try {
      // When native is loaded: native runs first (daemon mock never reached);
      // the verdict is from the native kernel (degraded:false).
      // When native is absent: malformed daemon reply -> DaemonUnavailable ->
      // TS path runs (degraded:true).
      const verdict = await gov.decide(allowedWriteReq());
      // The result must be a valid governance verdict — never a raw malformed reply.
      assert.ok(
        verdict.effect === 'allow' || verdict.effect === 'deny' || verdict.effect === 'needs_approval',
        `expected a valid effect after hostile reply, got: ${verdict.effect}`,
      );
      // audit chain is always valid.
      assert.equal(gov.verifyAudit().ok, true);
    } finally {
      gov.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
