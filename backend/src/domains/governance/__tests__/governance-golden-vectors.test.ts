/**
 * Governance GOLDEN BYTE-INTEROP VECTORS.
 *
 * These pin the EXACT bytes the tamper-evident audit chain hashes and the shape of
 * the `decide()` verdict envelope. The Rust kernel (`recoder-governance-types`) and
 * any external verifier must reproduce identical `entry_hash` values from identical
 * inputs, so these vectors are a cross-language contract: if the canonical
 * serialization (`sha256(prev_hash | key-sorted-JSON(digest))`) or the audited
 * field set drifts, a pinned hash breaks here BEFORE it silently forks the chain.
 *
 * The hashes below were derived once from the documented formula and are frozen.
 * Do not "fix" a failing vector by editing the constant — a changed hash means the
 * wire format changed and every consumer must be migrated deliberately.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { GovernanceGateService } from '../services/governance-gate.service.js';
import { AuditChainService } from '../services/audit-chain.service.js';
import type { Principal } from '../../identity/types.js';
import { AUDIT_GENESIS_HASH, type AuditEntryInput, type KernelVerdict } from '../types.js';
import { InMemoryAuditRepository, fakeKernel, silentLogger } from './_fakes.js';

// --- frozen vectors ----------------------------------------------------------

/** V1 — a `recordAudit` secret.set seal, chained from genesis. */
const V1_ENTRY: AuditEntryInput = {
  actorId: 'u1',
  action: 'secret.set',
  resource: 'secret:byok/openai',
  effect: 'allow',
  riskTier: 'high',
  degraded: false,
  payload: { ref: 'byok/openai', ownerUserId: 'u1', keyVersion: 1 },
};
const V1_CANONICAL =
  '{"action":"secret.set","actorId":"u1","degraded":false,"effect":"allow",' +
  '"payload":{"keyVersion":1,"ownerUserId":"u1","ref":"byok/openai"},' +
  '"resource":"secret:byok/openai","riskTier":"high"}';
const V1_HASH = 'cc3892bb12709dab0886e67c64eb214b12f5f868a728b31ab91bd3d8bfeb84cb';

/** V2 — a `decide()` ALLOW seal (session principal, file.write, /repo/a.ts), from genesis. */
const V2_CANONICAL =
  '{"action":"file.write","actorId":"u1","degraded":false,"effect":"allow",' +
  '"payload":{"autonomous":false,"engine":"ts","metadata":{},"principalKind":"session",' +
  '"reason":"ok","target":{"path":"/repo/a.ts"}},"resource":"/repo/a.ts","riskTier":"low"}';
const V2_HASH = 'ed2890e560ca45e4d115f7bab49d859561d7e8e33b91efa2a7b9ebf865b2c8f4';

/** V3 — V1's entry chained from V2's tip (chain-continuity vector). */
const V3_HASH = '38616badbd70c81926b7729d0ef80fd187e7fe6dbdb8849539e4f84d41c720fc';

/** The documented sealer, re-implemented in-test to pin the formula independently. */
function referenceSeal(prevHash: string, canonical: string): string {
  return createHash('sha256').update(`${prevHash}|${canonical}`).digest('hex');
}

function principal(): Principal {
  return { userId: 'u1', scopes: ['write'], kind: 'session', isAnonymous: false, raw: null };
}

const ALLOW: KernelVerdict = { effect: 'allow', tier: 'low', reason: 'ok', degraded: false, engine: 'ts' };

describe('governance golden vectors — the canonical seal formula', () => {
  it('V1 canonical bytes hash to the frozen entry_hash', () => {
    expect(referenceSeal(AUDIT_GENESIS_HASH, V1_CANONICAL)).toBe(V1_HASH);
  });

  it('V2 canonical bytes hash to the frozen entry_hash', () => {
    expect(referenceSeal(AUDIT_GENESIS_HASH, V2_CANONICAL)).toBe(V2_HASH);
  });

  it('genesis is 64 hex zeros (the chain root every implementer starts from)', () => {
    expect(AUDIT_GENESIS_HASH).toBe('0'.repeat(64));
  });
});

describe('governance golden vectors — the live audit chain reproduces them', () => {
  it('V1: recordAudit seals the exact frozen hash from genesis', async () => {
    const audit = new AuditChainService(new InMemoryAuditRepository());
    const record = await audit.append(V1_ENTRY);
    expect(record.prevHash).toBe(AUDIT_GENESIS_HASH);
    expect(record.entryHash).toBe(V1_HASH);
    expect(record.seq).toBe(1);
  });

  it('V2: decide() ALLOW seals the exact frozen hash from genesis', async () => {
    const repo = new InMemoryAuditRepository();
    const gate = new GovernanceGateService({
      kernel: fakeKernel({ verdict: ALLOW }),
      audit: new AuditChainService(repo),
      logger: silentLogger,
    });
    const verdict = await gate.decide('file.write', principal(), { target: { path: '/repo/a.ts' } });

    expect(verdict.effect).toBe('allow');
    expect(verdict.auditHash).toBe(V2_HASH);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]?.entryHash).toBe(V2_HASH);
  });

  it('V3: a second entry chains deterministically onto the V2 tip', async () => {
    const repo = new InMemoryAuditRepository();
    const audit = new AuditChainService(repo);
    const gate = new GovernanceGateService({ kernel: fakeKernel({ verdict: ALLOW }), audit, logger: silentLogger });

    await gate.decide('file.write', principal(), { target: { path: '/repo/a.ts' } }); // seals V2
    const second = await audit.append(V1_ENTRY); // chains from V2's tip

    expect(second.prevHash).toBe(V2_HASH);
    expect(second.entryHash).toBe(V3_HASH);
    expect(second.seq).toBe(2);

    const verified = await audit.verify();
    expect(verified.ok).toBe(true);
    expect(verified.tipHash).toBe(V3_HASH);
    expect(verified.entries).toBe(2);
  });
});

describe('governance golden vectors — the decide() verdict envelope shape', () => {
  it('pins the stable verdict fields and the id/timestamp formats', async () => {
    const gate = new GovernanceGateService({
      kernel: fakeKernel({ verdict: ALLOW }),
      audit: new AuditChainService(new InMemoryAuditRepository()),
      logger: silentLogger,
    });
    const v = await gate.decide('file.write', principal(), { target: { path: '/repo/a.ts' } });

    // The frozen key set of the write-seam output every domain compiles against.
    expect(Object.keys(v).sort()).toEqual([
      'approvalId',
      'auditHash',
      'createdAt',
      'degraded',
      'effect',
      'engine',
      'reason',
      'requestId',
      'tier',
      'verdictId',
    ]);

    // Stable, byte-pinned fields.
    expect(v.effect).toBe('allow');
    expect(v.tier).toBe('low');
    expect(v.reason).toBe('ok');
    expect(v.degraded).toBe(false);
    expect(v.engine).toBe('ts');
    expect(v.auditHash).toBe(V2_HASH);

    // Volatile fields carry a pinned FORMAT (ids + ISO-8601 timestamp).
    expect(v.verdictId).toMatch(/^gov_verdict_/);
    expect(v.requestId).toMatch(/^gov_req_/);
    expect(v.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
