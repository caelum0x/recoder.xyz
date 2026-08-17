import { describe, it, expect, vi } from 'vitest';
import { ApprovalService } from '../services/approval.service.js';
import { AuditChainService } from '../services/audit-chain.service.js';
import { AppError, ErrorCode } from '../../../shared/errors.js';
import type { ApprovalAuditSink } from '../services/approval.service.js';
import type { AuditEntryInput, AuditRecord } from '../types.js';
import { InMemoryApprovalRepository, InMemoryAuditRepository, silentLogger } from './_fakes.js';

const TARGET = 'conductor:workspace:ws-1';

function build(opts: { audit?: ApprovalAuditSink } = {}) {
  const repo = new InMemoryApprovalRepository();
  const service = new ApprovalService({ repo, logger: silentLogger, audit: opts.audit });
  return { repo, service };
}

/** An audit sink backed by the real durable chain. */
function chainSink() {
  const auditRepo = new InMemoryAuditRepository();
  const chain = new AuditChainService(auditRepo);
  const sink: ApprovalAuditSink = { recordAudit: (e: AuditEntryInput): Promise<AuditRecord> => chain.append(e) };
  return { auditRepo, sink };
}

describe('ApprovalService — request → decide lifecycle', () => {
  it('opens a pending request', async () => {
    const { service } = build();
    const rec = await service.request({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1', target: TARGET });
    expect(rec.status).toBe('pending');
    expect(rec.action).toBe('pr.merge');
    expect(rec.requestedBy).toBe('u1');
  });

  it('caps an explicit far-future expiresAt at the 30d MAX_APPROVAL_TTL (recoder-4d8i #5)', async () => {
    const { service } = build();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const farFuture = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(); // ~100 years
    const rec = await service.request({
      action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1', target: TARGET,
      expiresAt: farFuture,
    });
    const ttl = Date.parse(rec.expiresAt) - Date.now();
    // Capped to ~30d (allow a small execution-time slack), NOT the requested ~100y.
    expect(ttl).toBeLessThanOrEqual(thirtyDaysMs);
    expect(ttl).toBeGreaterThan(thirtyDaysMs - 60_000);
  });

  it('honors an explicit near-future expiresAt below the cap unchanged', async () => {
    const { service } = build();
    const oneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const rec = await service.request({
      action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1', target: TARGET,
      expiresAt: oneHour,
    });
    expect(rec.expiresAt).toBe(oneHour);
  });

  it('threads a concrete target through to the stored approval (recoder-adsk create-side)', async () => {
    const { service, repo } = build();
    const rec = await service.request({
      action: 'file.write', riskTier: 'high', requestedBy: 'u1', taskId: 't1', target: '/repo/a.ts',
    });
    expect(rec.target).toBe('/repo/a.ts');
    expect((await repo.findById(rec.id))?.target).toBe('/repo/a.ts');
  });

  it('rejects a targetless request instead of creating task-wide authorization', async () => {
    const { service } = build();
    await expect(service.request({
      action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1', target: '',
    })).rejects.toBeInstanceOf(AppError);
  });

  it('seals a needs_approval entry into the audit chain on request', async () => {
    const { auditRepo, sink } = chainSink();
    const { service } = build({ audit: sink });
    await service.request({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1', target: TARGET });
    expect(auditRepo.rows).toHaveLength(1);
    expect(auditRepo.rows[0]?.effect).toBe('needs_approval');
  });

  it('APPROVE transitions pending → approved and seals an allow', async () => {
    const { auditRepo, sink } = chainSink();
    const { service } = build({ audit: sink });
    const rec = await service.request({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1', target: TARGET });
    const decided = await service.decide(rec.id, { decision: 'approved', decidedBy: 'admin' });

    expect(decided.status).toBe('approved');
    expect(decided.decidedBy).toBe('admin');
    expect(auditRepo.rows.at(-1)?.effect).toBe('allow');
  });

  it('REJECT transitions pending → denied and seals a deny', async () => {
    const { auditRepo, sink } = chainSink();
    const { service } = build({ audit: sink });
    const rec = await service.request({ action: 'branch.push', riskTier: 'high', requestedBy: 'u1', target: TARGET });
    const decided = await service.decide(rec.id, { decision: 'denied', decidedBy: 'admin' });

    expect(decided.status).toBe('denied');
    expect(auditRepo.rows.at(-1)?.effect).toBe('deny');
  });

  it('is idempotent: re-deciding a resolved record throws NOT_FOUND', async () => {
    const { service } = build();
    const rec = await service.request({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', target: TARGET });
    await service.decide(rec.id, { decision: 'approved', decidedBy: 'admin' });

    await expect(service.decide(rec.id, { decision: 'denied', decidedBy: 'admin' })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('deciding an unknown id throws NOT_FOUND', async () => {
    const { service } = build();
    await expect(service.decide('nope', { decision: 'approved', decidedBy: 'admin' })).rejects.toBeInstanceOf(AppError);
  });

  it('hasApproval clears only after an approve (ties to a needs_approval gate)', async () => {
    const { service } = build();
    const rec = await service.request({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1', target: TARGET });
    expect(await service.hasApproval('t1', 'pr.merge')).toBe(false);
    await service.decide(rec.id, { decision: 'approved', decidedBy: 'admin' });
    expect(await service.hasApproval('t1', 'pr.merge')).toBe(true);
  });

  it('best-effort audit: a failing sink does not roll back the human decision', async () => {
    const sink: ApprovalAuditSink = { recordAudit: vi.fn(async () => { throw new Error('audit down'); }) };
    const { service } = build({ audit: sink });
    const rec = await service.request({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', target: TARGET });
    const decided = await service.decide(rec.id, { decision: 'approved', decidedBy: 'admin' });
    expect(decided.status).toBe('approved'); // durable state stands despite audit fault
  });

  it('validates input at the boundary', async () => {
    const { service } = build();
    await expect(service.request({ action: '', riskTier: 'high', requestedBy: 'u1', target: TARGET })).rejects.toBeInstanceOf(AppError);
    await expect(
      service.request({ action: 'x', riskTier: 'nope' as never, requestedBy: 'u1', target: TARGET }),
    ).rejects.toBeInstanceOf(AppError);
    const rec = await service.request({ action: 'x', riskTier: 'low', requestedBy: 'u1', target: TARGET });
    await expect(service.decide(rec.id, { decision: 'maybe' as never, decidedBy: 'a' })).rejects.toBeInstanceOf(AppError);
  });

  it('get + list return stored records', async () => {
    const { service } = build();
    const rec = await service.request({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1', target: TARGET });
    expect((await service.get(rec.id))?.id).toBe(rec.id);
    expect(await service.list({ taskId: 't1' })).toHaveLength(1);
  });
});
