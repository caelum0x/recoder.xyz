/**
 * Composition-root seam tests for the bootstrap → conductor wiring
 * (`conductor-seams.ts`): the off-box sandbox gateway, the RunEvent sink bridge,
 * and the CLI `sk_` mint closure. Each must be DEGRADE-TRUTHFUL — an unwired
 * cloud module, a throwing mint, a refusing provisioner each surface truthfully,
 * never a fabricated tenant/sandbox/key.
 */
import { describe, it, expect, vi } from 'vitest';
import type { RunEvent } from '@recoder/agent-os';
import type { Logger } from '../shared/logger.js';
import type { CloudModule } from '../domains/cloud/index.js';
import {
  createCloudSandboxGateway,
  createConductorRunSink,
  createEngineRunSink,
  createEngineRunEventStreamFanout,
  createCliMintClosure,
} from './conductor-seams.js';

/** A minimal fake cloud module recording tenancy + provisioner calls. */
function fakeCloud(overrides: {
  ensureCalls?: () => void;
  health?: () => Promise<{ status: string }>;
} = {}): CloudModule {
  return {
    tenancy: () => ({
      ensure: async () => {
        overrides.ensureCalls?.();
        return { ok: true as const, value: { id: 'tenant-1' } };
      },
    }),
    provisioner: () => ({
      health: overrides.health ?? (async () => ({ status: 'up' })),
      provision: async () => ({ ok: true as const, value: { id: 'sandbox-9' } }),
      execInSandbox: async (_id: string, _tenantId: string, req: { command: string }) => ({
        ok: true as const,
        value: {
          stdout: req.command === 'pwd' ? '/work\n' : 'out',
          stderr: '',
          exitCode: 0,
        },
      }),
      destroy: vi.fn(async () => ({ ok: true as const })),
    }),
  } as unknown as CloudModule;
}

describe('createCloudSandboxGateway (off-box daytona substrate)', () => {
  it('is disabled + unavailable + refuses provision when the cloud module is unwired', async () => {
    const gw = createCloudSandboxGateway({
      cloudRef: () => null,
      tenantOwner: 'conductor',
      substrateId: 'daytona',
    });

    expect(gw.substrateId).toBe('daytona');
    expect(gw.isEnabled()).toBe(false);
    expect(await gw.isAvailable()).toBe(false);
    // getWorkDir/destroy degrade truthfully (root / no-op); provision/exec throw.
    expect(await gw.getWorkDir('s1')).toBe('/');
    await expect(gw.destroy('s1')).resolves.toBeUndefined();
    await expect(gw.provision()).rejects.toThrow('cloud module not wired');
    await expect(gw.exec('s1', 'echo hi')).rejects.toThrow('cloud module not wired');
  });

  it('provisions + execs + caches the tenant once the cloud module is wired', async () => {
    const ensureCalls = vi.fn();
    const cloud = fakeCloud({ ensureCalls });
    const gw = createCloudSandboxGateway({
      cloudRef: () => cloud,
      tenantOwner: 'conductor',
      substrateId: 'daytona',
    });

    expect(gw.isEnabled()).toBe(true);
    expect(await gw.isAvailable()).toBe(true);
    expect(await gw.provision()).toEqual({ id: 'sandbox-9' });
    expect(await gw.getWorkDir('sandbox-9')).toBe('/work');
    expect(await gw.exec('sandbox-9', 'ls', { cwd: '/x', timeoutSecs: 5 })).toEqual({
      output: 'out',
      exitCode: 0,
    });
    // The resolved tenant is CACHED across provision/getWorkDir/exec (ensured once).
    expect(ensureCalls).toHaveBeenCalledTimes(1);
  });

  it('observes the Phase-10 late-bind through the lazy cloudRef getter', async () => {
    let cloud: CloudModule | null = null;
    const gw = createCloudSandboxGateway({
      cloudRef: () => cloud,
      tenantOwner: 'conductor',
      substrateId: 'daytona',
    });

    expect(gw.isEnabled()).toBe(false);
    cloud = fakeCloud(); // the late-bind (`cloudRef = cloud`)
    expect(gw.isEnabled()).toBe(true);
    expect(await gw.provision()).toEqual({ id: 'sandbox-9' });
  });

  it('reports unavailable (never throws) when the provisioner health is down', async () => {
    const gw = createCloudSandboxGateway({
      cloudRef: () => fakeCloud({ health: async () => ({ status: 'down' }) }),
      tenantOwner: 'conductor',
      substrateId: 'daytona',
    });
    expect(await gw.isAvailable()).toBe(false);
  });
});

describe('createConductorRunSink (RunEvent bus bridge)', () => {
  it('bridges an appended RunEvent onto the agent-os bus with source=conductor', async () => {
    const ingest = vi.fn(async () => ({ accepted: true }));
    const sink = createConductorRunSink({ ingest });
    const event = { eventId: 'e1', taskId: 't1' } as unknown as RunEvent;

    await sink.append(event);

    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest).toHaveBeenCalledWith(event, 'conductor');
  });
});

describe('createEngineRunSink (late-bound openfang default sink — recoder-a094)', () => {
  const event = {
    eventId: 'e1',
    type: 'completed',
    runId: 'r1',
    taskId: 't1',
  } as unknown as RunEvent;

  it('forwards appended RunEvents onto the agent-os bus with source=engine once attached', async () => {
    const warn = vi.fn();
    const ingest = vi.fn(async () => ({ accepted: true }));
    const late = createEngineRunSink({ warn } as unknown as Logger);

    late.attach({ ingest });
    await late.sink.append(event);

    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest).toHaveBeenCalledWith(event, 'engine');
    expect(warn).not.toHaveBeenCalled();
  });

  it('warn-logs and drops (never throws) when appended BEFORE the bus attaches', async () => {
    const warn = vi.fn();
    const late = createEngineRunSink({ warn } as unknown as Logger);

    await expect(Promise.resolve(late.sink.append(event))).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[1]).toContain('before the agent-os bus attached');
  });

  it('surfaces a returned bus rejection as a truthful warn (never a masked drop)', async () => {
    const warn = vi.fn();
    const ingest = vi.fn(async () => ({
      accepted: false,
      rejection: { reason: 'unknown_run', message: 'run r1 not found' },
    }));
    const late = createEngineRunSink({ warn } as unknown as Logger);

    late.attach({ ingest });
    await late.sink.append(event);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({ eventId: 'e1', reason: 'unknown_run' });
    expect(warn.mock.calls[0]?.[1]).toContain('rejected by the agent-os bus');
  });
});

describe('createEngineRunEventStreamFanout (bus → live /stream — recoder-uivh)', () => {
  const logger = { warn: vi.fn() } as unknown as Logger;
  const cloudEvent = (overrides: Partial<RunEvent> = {}): RunEvent =>
    ({
      eventId: 'evt_cloud_1',
      type: 'log',
      taskId: 't1',
      runId: 'run_1',
      message: 'sandbox.provisioning: sandbox sb-1 (daytona) → provisioning',
      createdAt: '2026-08-02T00:00:00.000Z',
      data: { source: 'cloud', cloudEventType: 'sandbox.provisioning' },
      ...overrides,
    }) as unknown as RunEvent;

  it('republishes an engine-source envelope onto the resolved workspace stream', async () => {
    const publishRun = vi.fn();
    const resolveWorkspaceId = vi.fn(async () => 'ws_1');
    const fanout = createEngineRunEventStreamFanout({ resolveWorkspaceId, publishRun, logger });

    const event = cloudEvent();
    await fanout({ event, source: 'engine' });

    expect(resolveWorkspaceId).toHaveBeenCalledWith('run_1');
    expect(publishRun).toHaveBeenCalledTimes(1);
    expect(publishRun).toHaveBeenCalledWith('ws_1', event);
  });

  it('skips conductor-sourced envelopes (the local sink already fans them out)', async () => {
    const publishRun = vi.fn();
    const resolveWorkspaceId = vi.fn(async () => 'ws_1');
    const fanout = createEngineRunEventStreamFanout({ resolveWorkspaceId, publishRun, logger });

    await fanout({ event: cloudEvent(), source: 'conductor' });

    expect(resolveWorkspaceId).not.toHaveBeenCalled();
    expect(publishRun).not.toHaveBeenCalled();
  });

  it('skips truthfully when the event carries no runId or the run binds no workspace', async () => {
    const publishRun = vi.fn();
    const fanout = createEngineRunEventStreamFanout({
      resolveWorkspaceId: async () => null,
      publishRun,
      logger,
    });

    await fanout({ event: cloudEvent({ runId: undefined }), source: 'engine' });
    await fanout({ event: cloudEvent(), source: 'engine' }); // resolver → null

    expect(publishRun).not.toHaveBeenCalled();
  });

  it('prefers a tailer-stamped data.workspaceId over the resolver', async () => {
    const publishRun = vi.fn();
    const resolveWorkspaceId = vi.fn(async () => 'ws_other');
    const fanout = createEngineRunEventStreamFanout({ resolveWorkspaceId, publishRun, logger });

    const event = cloudEvent({
      data: { source: 'cloud', workspaceId: 'ws_stamped' },
    } as unknown as Partial<RunEvent>);
    await fanout({ event, source: 'engine' });

    expect(resolveWorkspaceId).not.toHaveBeenCalled();
    expect(publishRun).toHaveBeenCalledWith('ws_stamped', event);
  });

  it('memoizes the runId → workspaceId binding (one state-of-record lookup per run)', async () => {
    const publishRun = vi.fn();
    const resolveWorkspaceId = vi.fn(async () => 'ws_1');
    const fanout = createEngineRunEventStreamFanout({ resolveWorkspaceId, publishRun, logger });

    await fanout({ event: cloudEvent({ eventId: 'e1' } as Partial<RunEvent>), source: 'engine' });
    await fanout({ event: cloudEvent({ eventId: 'e2' } as Partial<RunEvent>), source: 'engine' });

    expect(resolveWorkspaceId).toHaveBeenCalledTimes(1);
    expect(publishRun).toHaveBeenCalledTimes(2);
  });

  it('warn-logs (never throws) when the resolver or publisher faults', async () => {
    const warn = vi.fn();
    const fanout = createEngineRunEventStreamFanout({
      resolveWorkspaceId: async () => {
        throw new Error('repo down');
      },
      publishRun: vi.fn(),
      logger: { warn } as unknown as Logger,
    });

    await expect(fanout({ event: cloudEvent(), source: 'engine' })).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[1]).toContain('fan-out failed');
  });
});

describe('createCliMintClosure (sk_ gateway credential)', () => {
  it('mints a stable conductor inference-scoped key and returns the raw key', async () => {
    const mint = vi.fn(async () => ({ rawKey: 'sk_conductor_live' }));
    const mintKey = createCliMintClosure({ mint });

    expect(await mintKey()).toBe('sk_conductor_live');
    expect(mint).toHaveBeenCalledWith({
      userId: 'conductor',
      name: 'conductor-cli-inference-gateway',
      scopes: ['inference'],
    });
  });

  it('degrades to null (never throws) when the key store is down', async () => {
    const mintKey = createCliMintClosure({
      mint: async () => {
        throw new Error('key store down');
      },
    });
    await expect(mintKey()).resolves.toBeNull();
  });
});
