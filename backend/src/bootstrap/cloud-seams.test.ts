/**
 * Composition-root seam tests for the bootstrap → cloud wiring
 * (`cloud-seams.ts`): the sandbox-lifecycle → agent-os RunEvent bridge
 * (`source:'engine'`, log-only, degrade-truthful on rejection) and the
 * billing → cloud quota bridge (preview-only, tighten-only, null on fault).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../shared/logger.js';
import type { CloudRunEvent, Tenant } from '../domains/cloud/index.js';
import type { EntitlementGate, QuotaDecision } from '../domains/billing/index.js';
import {
  createCloudBillingQuotaBridge,
  createCloudRunEventBridge,
  tenantBillingSubject,
  toAgentOsRunEvent,
} from './cloud-seams.js';

const cloudEvent = (over: Partial<CloudRunEvent> = {}): CloudRunEvent => ({
  type: 'sandbox.running',
  sandboxId: 'sbx_1',
  tenantId: 'ten_1',
  runId: null,
  provider: 'daytona',
  status: 'running',
  at: '2026-01-01T00:00:00.000Z',
  ...over,
});

const tenant = (over: Partial<Tenant> = {}): Tenant =>
  ({
    id: 'ten_1',
    orgId: null,
    ownerUserId: 'user_1',
    tier: 'cloud',
    isolationLevel: 'dedicated',
    region: 'eu',
    quota: { maxSandboxes: 5, maxConcurrent: 2, maxPreview: 3 },
    createdAt: 't',
    updatedAt: 't',
    ...over,
  }) as Tenant;

const noopLogger = { warn: vi.fn() } as unknown as Logger;

describe('toAgentOsRunEvent', () => {
  it('maps a standalone sandbox event to an append-only log keyed by the sandbox', () => {
    const mapped = toAgentOsRunEvent(cloudEvent());
    expect(mapped.type).toBe('log'); // NEVER a run state transition
    expect(mapped.taskId).toBe('sbx_1');
    expect(mapped.runId).toBeUndefined();
    expect(mapped.eventId).toBe(
      'event_cloud_sbx_1_sandbox.running_2026-01-01T00:00:00.000Z'
    );
    expect(mapped.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(mapped.data).toMatchObject({
      source: 'cloud',
      cloudEventType: 'sandbox.running',
      sandboxId: 'sbx_1',
      tenantId: 'ten_1',
      provider: 'daytona',
      status: 'running',
    });
  });

  it('links a conductor-provisioned sandbox onto its run (taskId strips run_)', () => {
    const mapped = toAgentOsRunEvent(cloudEvent({ runId: 'run_abc' }));
    expect(mapped.runId).toBe('run_abc');
    expect(mapped.taskId).toBe('abc');
  });

  it('is deterministic per lifecycle transition (bus idempotency dedupes replays)', () => {
    const a = toAgentOsRunEvent(cloudEvent());
    const b = toAgentOsRunEvent(cloudEvent());
    expect(a.eventId).toBe(b.eventId);
    expect(toAgentOsRunEvent(cloudEvent({ type: 'sandbox.destroyed', status: 'destroyed' })).eventId).not.toBe(
      a.eventId
    );
  });

  it('carries the provider detail payload when present', () => {
    const mapped = toAgentOsRunEvent(cloudEvent({ detail: { reason: 'ttl' } }));
    expect(mapped.data).toMatchObject({ detail: { reason: 'ttl' } });
  });
});

describe('createCloudRunEventBridge', () => {
  it('ingests onto the agent-os bus with source=engine', async () => {
    const ingest = vi.fn(async () => ({ accepted: true }));
    const bridge = createCloudRunEventBridge({ bus: { ingest }, logger: noopLogger });

    await bridge.emit(cloudEvent());

    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'log', taskId: 'sbx_1' }),
      'engine'
    );
  });

  it('warn-logs a returned bus rejection without throwing (truthful, never masked)', async () => {
    const warn = vi.fn();
    const bridge = createCloudRunEventBridge({
      bus: {
        ingest: async () => ({
          accepted: false,
          rejection: { reason: 'unknown_run', message: 'run not found: run_x' },
        }),
      },
      logger: { warn } as unknown as Logger,
    });

    await expect(bridge.emit(cloudEvent({ runId: 'run_x' }))).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'unknown_run', sandboxId: 'sbx_1' }),
      expect.stringContaining('rejected')
    );
  });
});

describe('tenantBillingSubject', () => {
  it('bills an org tenant against the org and a personal tenant against the owner', () => {
    expect(tenantBillingSubject(tenant({ orgId: 'org_9' }))).toEqual({
      subjectId: 'org_9',
      kind: 'org',
    });
    expect(tenantBillingSubject(tenant())).toEqual({
      subjectId: 'user_1',
      kind: 'user',
    });
  });
});

describe('createCloudBillingQuotaBridge', () => {
  const gateWith = (decision: Partial<QuotaDecision>): EntitlementGate =>
    ({ checkQuota: vi.fn(async () => decision) }) as unknown as EntitlementGate;

  it('resolves the plan preview ceiling through the entitlement gate', async () => {
    const gate = gateWith({ limit: 3 });
    const bridge = createCloudBillingQuotaBridge(gate);

    await expect(bridge.entitledLimit(tenant(), 'preview')).resolves.toBe(3);
    expect(gate.checkQuota).toHaveBeenCalledWith(
      { subjectId: 'user_1', kind: 'user' },
      'preview'
    );
  });

  it('passes an unlimited (0) billing ceiling through verbatim', async () => {
    const bridge = createCloudBillingQuotaBridge(gateWith({ limit: 0 }));
    await expect(bridge.entitledLimit(tenant(), 'preview')).resolves.toBe(0);
  });

  it('resolves null for kinds billing has no counterpart for (tenant quota stands alone)', async () => {
    const gate = gateWith({ limit: 3 });
    const bridge = createCloudBillingQuotaBridge(gate);

    await expect(bridge.entitledLimit(tenant(), 'sandbox')).resolves.toBeNull();
    await expect(bridge.entitledLimit(tenant(), 'concurrent')).resolves.toBeNull();
    expect(gate.checkQuota).not.toHaveBeenCalled();
  });

  it('resolves null on a billing fault (truthful degrade — never a fabricated deny)', async () => {
    const gate = {
      checkQuota: vi.fn(async () => {
        throw new Error('billing down');
      }),
    } as unknown as EntitlementGate;
    const bridge = createCloudBillingQuotaBridge(gate);

    await expect(bridge.entitledLimit(tenant(), 'preview')).resolves.toBeNull();
  });
});
