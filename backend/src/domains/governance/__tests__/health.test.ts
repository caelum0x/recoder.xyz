import { describe, it, expect } from 'vitest';
import { buildGovernanceHealth } from '../health.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { GovernanceKernelPort } from '../ports/kernel.port.js';
import type { KernelStatus } from '../types.js';
import { fakeKernel, fakeVault } from './_fakes.js';

function executor(available: boolean): QueryExecutor {
  return { isAvailable: () => available } as unknown as QueryExecutor;
}

function kernelWith(status: KernelStatus): GovernanceKernelPort {
  return fakeKernel({ status });
}

const NAPI_UP: KernelStatus = { engine: 'napi', status: 'up', degraded: false };
const TS_DEGRADED: KernelStatus = { engine: 'ts', status: 'up', degraded: true };
const SYNTHETIC_DOWN: KernelStatus = { engine: 'synthetic', status: 'down', degraded: true, reason: 'no rung' };

describe('buildGovernanceHealth — truthful moat health', () => {
  it('is up only with a native kernel, an available audit DB, and a working vault', () => {
    const h = buildGovernanceHealth({
      kernel: kernelWith(NAPI_UP),
      executor: executor(true),
      vault: fakeVault({ available: true }),
      auditEnabled: true,
    });
    expect(h.status).toBe('up');
    expect(h.degraded).toBe(false);
  });

  it('DEGRADES (never faked up) when the kernel is the non-native ts floor', () => {
    const h = buildGovernanceHealth({
      kernel: kernelWith(TS_DEGRADED),
      executor: executor(true),
      vault: fakeVault({ available: true }),
      auditEnabled: true,
    });
    expect(h.status).toBe('degraded');
    // A serving-but-non-native kernel reports status 'up' with degraded:true, so
    // the aggregated reason is empty; the truthful signal is detail.kernelEngine.
    expect(h.degraded).toBe(true);
    expect((h.detail as { kernelEngine?: string }).kernelEngine).toBe('ts');
  });

  it('DEGRADES when the audit DB pool is unavailable', () => {
    const h = buildGovernanceHealth({
      kernel: kernelWith(NAPI_UP),
      executor: executor(false),
      vault: fakeVault({ available: true }),
      auditEnabled: true,
    });
    expect(h.status).toBe('degraded');
    expect(h.reason).toMatch(/audit-db/);
  });

  it('DEGRADES when the vault has no master key', () => {
    const h = buildGovernanceHealth({
      kernel: kernelWith(NAPI_UP),
      executor: executor(true),
      vault: fakeVault({ available: false }),
      auditEnabled: true,
    });
    expect(h.status).toBe('degraded');
    expect(h.reason).toMatch(/vault/);
  });

  it('is DOWN only when the kernel is not serving (synthetic)', () => {
    const h = buildGovernanceHealth({
      kernel: kernelWith(SYNTHETIC_DOWN),
      executor: executor(true),
      vault: fakeVault({ available: true }),
      auditEnabled: true,
    });
    expect(h.status).toBe('down');
  });
});
