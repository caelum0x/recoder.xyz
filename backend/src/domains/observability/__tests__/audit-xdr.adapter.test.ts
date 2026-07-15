/**
 * T5 — Merkle re-verify: a valid chain returns records; a tampered proof returns
 * `verified:false` with NO rows (never a silent pass); an unavailable verify seam
 * throws `AuditUnavailableError` (→ 503) rather than returning unverified rows.
 */
import { describe, it, expect, vi } from 'vitest';
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type { AuditVerification } from '../../governance/types.js';
import { AuditXdrProjection, AuditUnavailableError, type AuditReader } from '../adapters/audit-xdr.adapter.js';
import type { XdrRecord } from '../types.js';

const row: XdrRecord = {
  seq: 1,
  actorId: 'u1',
  action: 'pr.create',
  resource: 'repo/x',
  effect: 'allow',
  riskTier: 'low',
  degraded: false,
  entryHash: 'abc',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function gateWith(verification: AuditVerification | Error): GovernanceGate {
  return {
    verifyAudit:
      verification instanceof Error
        ? vi.fn().mockRejectedValue(verification)
        : vi.fn().mockResolvedValue(verification),
  } as unknown as GovernanceGate;
}

function reader(available: boolean, rows: readonly XdrRecord[] = [row]): AuditReader {
  return { isAvailable: () => available, readAudit: vi.fn().mockResolvedValue(rows) };
}

describe('AuditXdrProjection.verifyAndProject', () => {
  it('valid chain → verified records returned', async () => {
    const p = new AuditXdrProjection({
      gate: gateWith({ ok: true, entries: 1, tipHash: 't' }),
      reader: reader(true),
    });
    const result = await p.verifyAndProject({ limit: 10 });
    expect(result.verified).toBe(true);
    expect(result.records).toHaveLength(1);
  });

  it('TAMPERED chain → verified:false, ZERO rows, brokenAtSeq surfaced (no silent pass)', async () => {
    const rd = reader(true);
    const p = new AuditXdrProjection({
      gate: gateWith({ ok: false, brokenAtSeq: 3, entries: 5 }),
      reader: rd,
    });
    const result = await p.verifyAndProject({ limit: 10 });
    expect(result.verified).toBe(false);
    expect(result.records).toEqual([]);
    expect(result.brokenAtSeq).toBe(3);
    // rows are NEVER read when the chain is broken.
    expect(rd.readAudit).not.toHaveBeenCalled();
  });

  it('store unavailable → throws (maps to 503), never returns unverified rows', async () => {
    const p = new AuditXdrProjection({
      gate: gateWith({ ok: true, entries: 0 }),
      reader: reader(false),
    });
    await expect(p.verifyAndProject({})).rejects.toBeInstanceOf(AuditUnavailableError);
  });

  it('verify seam faulting → throws AuditUnavailableError, never unverified rows', async () => {
    const p = new AuditXdrProjection({
      gate: gateWith(new Error('governance down')),
      reader: reader(true),
    });
    await expect(p.verifyAndProject({})).rejects.toBeInstanceOf(AuditUnavailableError);
  });
});
