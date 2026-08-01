/**
 * Local-container sandbox adapter tests — the self-host fallback substrate.
 * Locks in the honesty invariant: the adapter NEVER fabricates a running
 * container. Covers the full lifecycle (availability / provision / get /
 * destroy / exec) across three postures:
 *   - disabled (config off)          ⇒ truthful `down` + Err(SERVICE_UNAVAILABLE)
 *   - enabled but no runtime wired    ⇒ truthful `down` + Err(SERVICE_UNAVAILABLE)
 *   - enabled with a real runtime seam ⇒ maps runtime state faithfully
 * plus the intentional NOT_IMPLEMENTED exec gap (runtime present, no exec verb)
 * and the never-throw / degrade-safe contract on every mutating call.
 */
import { describe, it, expect } from 'vitest';
import {
  createLocalContainerAdapter,
  type LocalContainerRuntime,
} from '../adapters/local-container.adapter.js';
import { ErrorCode } from '../../../shared/errors.js';
import type {
  ProvisionSpec,
  ProviderExecInput,
  ProviderExecResult,
} from '../ports/sandbox-provider.port.js';

const silentLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  child: () => silentLogger,
} as unknown as Parameters<typeof createLocalContainerAdapter>[0]['logger'];

function spec(over: Partial<ProvisionSpec> = {}): ProvisionSpec {
  return {
    tenantId: 'tnt_1',
    userId: 'user_1',
    region: 'us-east',
    resources: { cpuMillis: 1000, memMb: 512 },
    ...over,
  };
}

/** A settable fake runtime seam — every method is overridable per test. */
function fakeRuntime(over: Partial<LocalContainerRuntime> = {}): LocalContainerRuntime {
  return {
    ping: async () => true,
    run: async () => ({ containerId: 'ctr_abc', workspaceUrl: 'http://localhost:9000' }),
    inspect: async () => ({ running: true }),
    remove: async () => undefined,
    ...over,
  };
}

describe('createLocalContainerAdapter — identity', () => {
  it('reports the local provider id', () => {
    const adapter = createLocalContainerAdapter({ enabled: true, logger: silentLogger, runtime: fakeRuntime() });
    expect(adapter.id).toBe('local');
  });
});

describe('availability — truthful, never fakes up', () => {
  it('is down with a named reason when disabled', async () => {
    const adapter = createLocalContainerAdapter({ enabled: false, logger: silentLogger, runtime: fakeRuntime() });
    const a = await adapter.availability();
    expect(a).toEqual({ provider: 'local', status: 'down', reason: 'local provider disabled' });
  });

  it('is down with a named reason when no runtime is wired', async () => {
    const adapter = createLocalContainerAdapter({ enabled: true, logger: silentLogger });
    const a = await adapter.availability();
    expect(a).toEqual({ provider: 'local', status: 'down', reason: 'no local container runtime wired' });
  });

  it('is up only when a real runtime pings reachable', async () => {
    const adapter = createLocalContainerAdapter({
      enabled: true,
      logger: silentLogger,
      runtime: fakeRuntime({ ping: async () => true }),
    });
    expect(await adapter.availability()).toEqual({ provider: 'local', status: 'up' });
  });

  it('is down when the runtime daemon is unreachable', async () => {
    const adapter = createLocalContainerAdapter({
      enabled: true,
      logger: silentLogger,
      runtime: fakeRuntime({ ping: async () => false }),
    });
    expect(await adapter.availability()).toEqual({
      provider: 'local',
      status: 'down',
      reason: 'local container runtime unreachable',
    });
  });

  it('is unknown (not down/up) when the ping probe throws — surfaces the fault message', async () => {
    const adapter = createLocalContainerAdapter({
      enabled: true,
      logger: silentLogger,
      runtime: fakeRuntime({
        ping: async () => {
          throw new Error('dial unix /var/run/docker.sock: connect: EACCES');
        },
      }),
    });
    const a = await adapter.availability();
    expect(a.status).toBe('unknown');
    expect(a.reason).toContain('EACCES');
  });
});

describe('provision — fail-safe, never fabricates a sandbox', () => {
  it('errors SERVICE_UNAVAILABLE when disabled (disabled message)', async () => {
    const adapter = createLocalContainerAdapter({ enabled: false, logger: silentLogger, runtime: fakeRuntime() });
    const r = await adapter.provision(spec());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
      expect(r.error.message).toContain('disabled');
    }
  });

  it('errors SERVICE_UNAVAILABLE when no runtime is wired (distinct "not wired" message)', async () => {
    const adapter = createLocalContainerAdapter({ enabled: true, logger: silentLogger });
    const r = await adapter.provision(spec());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
      expect(r.error.message).toContain('not wired');
    }
  });

  it('maps a real runtime launch into a running ProviderSandbox', async () => {
    const adapter = createLocalContainerAdapter({
      enabled: true,
      logger: silentLogger,
      runtime: fakeRuntime({ run: async () => ({ containerId: 'ctr_xyz', workspaceUrl: 'http://localhost:1234' }) }),
    });
    const r = await adapter.provision(spec());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        provider: 'local',
        externalId: 'ctr_xyz',
        status: 'running',
        workspaceUrl: 'http://localhost:1234',
      });
    }
  });

  it('normalizes an absent workspaceUrl to null (no fabricated URL)', async () => {
    const adapter = createLocalContainerAdapter({
      enabled: true,
      logger: silentLogger,
      runtime: fakeRuntime({ run: async () => ({ containerId: 'ctr_1' }) }),
    });
    const r = await adapter.provision(spec());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.workspaceUrl).toBeNull();
  });

  it('returns Err (never throws) when the runtime launch fails', async () => {
    const adapter = createLocalContainerAdapter({
      enabled: true,
      logger: silentLogger,
      runtime: fakeRuntime({
        run: async () => {
          throw new Error('image pull backoff');
        },
      }),
    });
    const r = await adapter.provision(spec());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
      expect(r.error.message).toContain('launch failed');
    }
  });
});

describe('get — reconcile source of truth', () => {
  it('errors when disabled/unwired', async () => {
    const adapter = createLocalContainerAdapter({ enabled: true, logger: silentLogger });
    const r = await adapter.get('ctr_1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });

  it('maps a running container to status running', async () => {
    const adapter = createLocalContainerAdapter({
      enabled: true,
      logger: silentLogger,
      runtime: fakeRuntime({ inspect: async () => ({ running: true }) }),
    });
    const r = await adapter.get('ctr_1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ provider: 'local', externalId: 'ctr_1', status: 'running' });
  });

  it('maps a stopped container to status stopped', async () => {
    const adapter = createLocalContainerAdapter({
      enabled: true,
      logger: silentLogger,
      runtime: fakeRuntime({ inspect: async () => ({ running: false }) }),
    });
    const r = await adapter.get('ctr_1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe('stopped');
  });

  it('returns NOT_FOUND when the container no longer exists', async () => {
    const adapter = createLocalContainerAdapter({
      enabled: true,
      logger: silentLogger,
      runtime: fakeRuntime({ inspect: async () => null }),
    });
    const r = await adapter.get('ctr_gone');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('returns Err (never throws) when inspect faults', async () => {
    const adapter = createLocalContainerAdapter({
      enabled: true,
      logger: silentLogger,
      runtime: fakeRuntime({
        inspect: async () => {
          throw new Error('daemon gone');
        },
      }),
    });
    const r = await adapter.get('ctr_1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });
});

describe('destroy — idempotent teardown', () => {
  it('errors when disabled/unwired', async () => {
    const adapter = createLocalContainerAdapter({ enabled: false, logger: silentLogger, runtime: fakeRuntime() });
    const r = await adapter.destroy('ctr_1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });

  it('succeeds when the runtime removes the container', async () => {
    let removed: string | undefined;
    const adapter = createLocalContainerAdapter({
      enabled: true,
      logger: silentLogger,
      runtime: fakeRuntime({
        remove: async (id) => {
          removed = id;
        },
      }),
    });
    const r = await adapter.destroy('ctr_1');
    expect(r.ok).toBe(true);
    expect(removed).toBe('ctr_1');
  });

  it('returns Err (never throws) when remove faults', async () => {
    const adapter = createLocalContainerAdapter({
      enabled: true,
      logger: silentLogger,
      runtime: fakeRuntime({
        remove: async () => {
          throw new Error('remove failed');
        },
      }),
    });
    const r = await adapter.destroy('ctr_1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });
});

describe('exec — the intentional NOT_IMPLEMENTED gap', () => {
  const input: ProviderExecInput = { externalId: 'ctr_1', command: 'echo hi' };

  it('exec verb exists on the adapter', () => {
    const adapter = createLocalContainerAdapter({ enabled: true, logger: silentLogger, runtime: fakeRuntime() });
    expect(typeof adapter.exec).toBe('function');
  });

  it('degrades to SERVICE_UNAVAILABLE (not NOT_IMPLEMENTED) when no runtime is wired', async () => {
    const adapter = createLocalContainerAdapter({ enabled: true, logger: silentLogger });
    const r = await adapter.exec!(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });

  it('returns NOT_IMPLEMENTED — truthfully — when the runtime has no exec verb', async () => {
    // fakeRuntime intentionally omits `exec`; this is the local-runtime exec gap.
    const adapter = createLocalContainerAdapter({ enabled: true, logger: silentLogger, runtime: fakeRuntime() });
    const r = await adapter.exec!(input);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(ErrorCode.NOT_IMPLEMENTED);
      expect(r.error.message).toContain('does not support exec');
    }
  });

  it('delegates to a runtime that DOES support exec and returns its result', async () => {
    const execResult: ProviderExecResult = { exitCode: 0, stdout: 'hi\n', stderr: '', timedOut: false };
    const adapter = createLocalContainerAdapter({
      enabled: true,
      logger: silentLogger,
      runtime: fakeRuntime({ exec: async () => execResult }),
    });
    const r = await adapter.exec!(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(execResult);
  });

  it('returns Err (never throws) when the runtime exec faults', async () => {
    const adapter = createLocalContainerAdapter({
      enabled: true,
      logger: silentLogger,
      runtime: fakeRuntime({
        exec: async () => {
          throw new Error('exec boom');
        },
      }),
    });
    const r = await adapter.exec!(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });
});
