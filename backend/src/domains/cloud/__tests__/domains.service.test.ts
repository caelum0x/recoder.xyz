/**
 * DomainsService — custom-domain CRUD + truthful DNS/TLS verification.
 *
 * Proves: add mints the TXT (+ optional CNAME) challenge records and persists a
 * `pending` row; hostname validation rejects garbage; the store-down path fails
 * truthfully (never an optimistic success); `verify` with NO verifier NEVER
 * fakes `verified` (stays pending, SERVICE_UNAVAILABLE); `verify` with a verifier
 * persists the real outcome; `remove` maps a missing row to NOT_FOUND.
 */
import { describe, it, expect, vi } from 'vitest';
import { createDomainsService, type DomainVerifierPort } from '../services/domains.service.js';
import type { DomainRepository } from '../ports/cloud-repository.port.js';
import type { DomainInsert, DomainRecord } from '../types.js';
import { ErrorCode } from '../../../shared/errors.js';

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

function record(over: Partial<DomainRecord> = {}): DomainRecord {
  return {
    id: 'dom_1',
    tenantId: 'ten_1',
    hostname: 'app.example.com',
    verificationStatus: 'pending',
    dnsRecords: [],
    tlsStatus: 'none',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function makeRepo(over: Partial<DomainRepository> = {}): DomainRepository & {
  insert: ReturnType<typeof vi.fn>;
  updateVerification: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  const insert = vi.fn(async (input: DomainInsert) => record({ id: input.id, hostname: input.hostname, dnsRecords: [...input.dnsRecords] }));
  const updateVerification = vi.fn(async () => undefined);
  const del = vi.fn(async () => true);
  return {
    isAvailable: () => true,
    insert,
    getById: vi.fn(async () => record()),
    getByHostname: vi.fn(async () => null),
    updateVerification,
    listByTenant: vi.fn(async () => [record()]),
    delete: del,
    ...over,
  } as never;
}

describe('DomainsService.add', () => {
  it('mints the TXT + CNAME challenge records and persists a pending row', async () => {
    const repo = makeRepo();
    const svc = createDomainsService({ repo, logger, cnameTarget: 'preview.recoder.xyz', randomToken: () => 'TOKEN123' });
    const res = await svc.add({ tenantId: 'ten_1', hostname: 'App.Example.com.' });
    expect(res.ok).toBe(true);
    const insertArg = repo.insert.mock.calls[0]![0] as DomainInsert;
    expect(insertArg.hostname).toBe('app.example.com'); // normalized (lowercase, trailing dot stripped)
    expect(insertArg.verificationStatus).toBe('pending');
    expect(insertArg.tlsStatus).toBe('none');
    expect(insertArg.dnsRecords).toEqual([
      { type: 'TXT', name: '_recoder-challenge.app.example.com', value: 'recoder-verify=TOKEN123' },
      { type: 'CNAME', name: 'app.example.com', value: 'preview.recoder.xyz' },
    ]);
  });

  it('omits the CNAME record when no target is configured', async () => {
    const repo = makeRepo();
    const svc = createDomainsService({ repo, logger, cnameTarget: null, randomToken: () => 'T' });
    await svc.add({ tenantId: 'ten_1', hostname: 'x.example.org' });
    const insertArg = repo.insert.mock.calls[0]![0] as DomainInsert;
    expect(insertArg.dnsRecords).toHaveLength(1);
    expect(insertArg.dnsRecords[0]!.type).toBe('TXT');
  });

  it('rejects an invalid hostname with VALIDATION_ERROR and never persists', async () => {
    const repo = makeRepo();
    const svc = createDomainsService({ repo, logger });
    for (const bad of ['not a host', 'http://x.com', 'nodot', 'a..b.com', '']) {
      const res = await svc.add({ tenantId: 'ten_1', hostname: bad });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    }
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('fails truthfully (SERVICE_UNAVAILABLE) when the store is down — no fake success', async () => {
    const repo = makeRepo({ isAvailable: () => false });
    const svc = createDomainsService({ repo, logger });
    const res = await svc.add({ tenantId: 'ten_1', hostname: 'app.example.com' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(repo.insert).not.toHaveBeenCalled();
  });
});

describe('DomainsService.add — cross-tenant hostname hijack (recoder-4780)', () => {
  it('rejects a hostname already owned by ANOTHER tenant (CONFLICT) and never overwrites', async () => {
    const repo = makeRepo({
      getByHostname: vi.fn(async () => record({ tenantId: 'ten_OTHER', hostname: 'app.example.com' })),
    });
    const svc = createDomainsService({ repo, logger, randomToken: () => 'T' });
    const res = await svc.add({ tenantId: 'ten_1', hostname: 'App.Example.com.' });
    expect(res.ok).toBe(false);
    expect((res as { ok: false; error: { code: string } }).error.code).toBe(ErrorCode.CONFLICT);
    // The other tenant's row is NEVER touched — no ON CONFLICT overwrite/hijack.
    expect((repo as unknown as { insert: ReturnType<typeof vi.fn> }).insert).not.toHaveBeenCalled();
  });

  it('lets the SAME tenant re-add their own hostname (idempotent, proceeds to persist)', async () => {
    const repo = makeRepo({
      getByHostname: vi.fn(async () => record({ tenantId: 'ten_1', hostname: 'app.example.com' })),
    });
    const svc = createDomainsService({ repo, logger, randomToken: () => 'T' });
    const res = await svc.add({ tenantId: 'ten_1', hostname: 'app.example.com' });
    expect(res.ok).toBe(true);
    expect((repo as unknown as { insert: ReturnType<typeof vi.fn> }).insert).toHaveBeenCalled();
  });
});

describe('DomainsService.verify', () => {
  it('NEVER fakes verified without a verifier — stays pending, SERVICE_UNAVAILABLE', async () => {
    const repo = makeRepo();
    const svc = createDomainsService({ repo, logger }); // no verifier
    const res = await svc.verify('dom_1', 'ten_1');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
      expect((res.error.details as { verificationStatus?: string }).verificationStatus).toBe('pending');
    }
    expect(repo.updateVerification).not.toHaveBeenCalled();
  });

  it('persists a real verified/tls outcome from the injected verifier', async () => {
    const verifier: DomainVerifierPort = { verify: vi.fn(async () => ({ verified: true, tls: 'active' as const })) };
    const repo = makeRepo({
      getById: vi
        .fn()
        .mockResolvedValueOnce(record({ verificationStatus: 'pending' }))
        .mockResolvedValueOnce(record({ verificationStatus: 'verified', tlsStatus: 'active' })),
    });
    const svc = createDomainsService({ repo, logger, verifier });
    const res = await svc.verify('dom_1', 'ten_1');
    expect(res.ok).toBe(true);
    expect(repo.updateVerification).toHaveBeenCalledWith('dom_1', 'verified', 'active');
    if (res.ok) expect(res.value.verificationStatus).toBe('verified');
  });

  it('records a failed check when the challenge is not observed', async () => {
    const verifier: DomainVerifierPort = { verify: vi.fn(async () => ({ verified: false, tls: 'none' as const, reason: 'txt_missing' })) };
    const repo = makeRepo();
    const svc = createDomainsService({ repo, logger, verifier });
    await svc.verify('dom_1', 'ten_1');
    expect(repo.updateVerification).toHaveBeenCalledWith('dom_1', 'failed', 'none');
  });

  it('returns NOT_FOUND for an unknown domain (before touching the verifier)', async () => {
    const verifier: DomainVerifierPort = { verify: vi.fn() };
    const repo = makeRepo({ getById: vi.fn(async () => null) });
    const svc = createDomainsService({ repo, logger, verifier });
    const res = await svc.verify('nope', 'ten_1');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(ErrorCode.NOT_FOUND);
    expect(verifier.verify).not.toHaveBeenCalled();
  });
});

describe('DomainsService.remove + list', () => {
  it('removes an owned domain', async () => {
    const repo = makeRepo({ delete: vi.fn(async () => true) });
    const svc = createDomainsService({ repo, logger });
    const res = await svc.remove('dom_1', 'ten_1');
    expect(res.ok).toBe(true);
  });

  it('maps a missing row to NOT_FOUND', async () => {
    const repo = makeRepo({ delete: vi.fn(async () => false) });
    const svc = createDomainsService({ repo, logger });
    const res = await svc.remove('dom_x', 'ten_1');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('returns an empty list when the store is unreachable (never throws)', async () => {
    const repo = makeRepo({ isAvailable: () => false });
    const svc = createDomainsService({ repo, logger });
    await expect(svc.list('ten_1')).resolves.toEqual([]);
  });
});
