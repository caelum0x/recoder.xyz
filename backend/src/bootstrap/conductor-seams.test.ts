/**
 * Composition-root seam tests for the bootstrap → conductor wiring
 * (`conductor-seams.ts`): the off-box sandbox gateway, the RunEvent sink bridge,
 * and the CLI `sk_` mint closure. Each must be DEGRADE-TRUTHFUL — an unwired
 * cloud module, a throwing mint, a refusing provisioner each surface truthfully,
 * never a fabricated tenant/sandbox/key.
 */
import { describe, it, expect, vi } from 'vitest';
import type { RunEvent } from '@recoder/agent-os';
import type { CloudModule } from '../domains/cloud/index.js';
import {
  createCloudSandboxGateway,
  createConductorRunSink,
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
