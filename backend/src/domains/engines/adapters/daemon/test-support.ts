/**
 * Test-only fakes for the daemon adapter suite: a scripted `DaemonSupervisorPort`
 * (no real spawn) and a silent logger. Kept out of the adapters themselves so the
 * production seam carries no test scaffolding.
 */
import { vi } from 'vitest';
import type { Logger } from '../../../../shared/logger.js';
import type {
  DaemonHandle,
  DaemonSpec,
  DaemonSupervisorPort,
} from '../../ports/daemon-supervisor.port.js';
import { down, type EngineHealth, type EngineId } from '../../types.js';

export const silentLog = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

/** A scripted supervisor: returns a fixed handle + health, records stop() calls. */
export class FakeSupervisor implements DaemonSupervisorPort {
  readonly stopped: string[] = [];
  ensureStartedCalls = 0;

  constructor(
    private readonly opts: { handle?: DaemonHandle | null; health?: EngineHealth } = {},
  ) {}

  async ensureStarted(_spec: DaemonSpec): Promise<DaemonHandle | null> {
    this.ensureStartedCalls += 1;
    return this.opts.handle ?? null;
  }

  handle(_engineId: string): DaemonHandle | null {
    return this.opts.handle ?? null;
  }

  async stop(engineId: string): Promise<void> {
    this.stopped.push(engineId);
  }

  async health(spec: DaemonSpec): Promise<EngineHealth> {
    return this.opts.health ?? down(spec.engineId as EngineId, 'daemon', 'fake down');
  }

  async stopAll(): Promise<void> {
    /* no-op */
  }
}

/** Stub `globalThis.fetch` to return a JSON body with a given status, once installed. */
export function stubFetch(status: number, body: unknown): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}
