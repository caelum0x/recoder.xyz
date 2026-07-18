/**
 * `buildEnginesMcpTools` — `engine.restart` tool-boundary security.
 *
 * The MCP `engine.restart` tool is the twin of the `requireAdmin`-gated HTTP
 * route. These tests prove the tool boundary matches that gate:
 *  - a non-admin authenticated caller is REFUSED (no restart, no spoofed actor),
 *  - the acting identity is DERIVED from the authorized caller — a spoofed
 *    `requestedBy`/`userId` arg is ignored,
 *  - an admin/internal caller is admitted and attributed to its own userId,
 *  - an ABSENT caller (trusted non-edge in-proc path) resolves to `internal`.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildEnginesMcpTools, type EnginesMcpDeps } from './engines-engine.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { EngineId } from '../types.js';

type RestartResult = Awaited<ReturnType<EnginesMcpDeps['restart']>>;

function makeDeps(overrides?: Partial<EnginesMcpDeps>): {
  deps: EnginesMcpDeps;
  restart: ReturnType<typeof vi.fn>;
} {
  const restart = vi.fn(
    async (): Promise<RestartResult> => ({ outcome: 'restarted' }),
  );
  const deps: EnginesMcpDeps = {
    listDescriptors: () => [],
    listHealth: async () => [],
    engineHealth: async () => null,
    restart: restart as unknown as EnginesMcpDeps['restart'],
    ...overrides,
  };
  return { deps, restart };
}

function restartTool(deps: EnginesMcpDeps): McpToolRegistration {
  const tool = buildEnginesMcpTools(deps).find((t) => t.name === 'engine.restart');
  if (!tool) throw new Error('engine.restart tool missing');
  return tool;
}

// `openfang` is a declared engine id (see constants); the restartability decision
// belongs to `deps.restart`, so any real id exercises the boundary.
const ENGINE: EngineId = 'openfang';

describe('engine.restart tool boundary (admin-gated, caller-derived actor)', () => {
  it('REFUSES a non-admin authenticated caller and does not restart', async () => {
    const { deps, restart } = makeDeps();
    const nonAdmin: McpToolCaller = { userId: 'mallory', scopes: ['read', 'write'] };

    const out = (await restartTool(deps).handler(
      { engineId: ENGINE, requestedBy: 'victim-admin' },
      nonAdmin,
    )) as { error?: string };

    expect(out.error).toMatch(/admin or internal/i);
    expect(restart).not.toHaveBeenCalled();
  });

  it('IGNORES a spoofed requestedBy arg and attributes to the admin caller', async () => {
    const { deps, restart } = makeDeps();
    const admin: McpToolCaller = { userId: 'real-admin', scopes: ['admin'] };

    const out = (await restartTool(deps).handler(
      { engineId: ENGINE, requestedBy: 'some-other-admin' },
      admin,
    )) as { engineId: string; outcome: string };

    expect(out).toMatchObject({ engineId: ENGINE, outcome: 'restarted' });
    expect(restart).toHaveBeenCalledTimes(1);
    // requestedBy is derived from caller.userId, NOT the spoofed arg.
    expect(restart).toHaveBeenCalledWith(ENGINE, 'real-admin', undefined);
  });

  it('admits an internal-scoped caller and threads its userId + reason', async () => {
    const { deps, restart } = makeDeps();
    const svc: McpToolCaller = { userId: 'svc-worker', scopes: ['internal'] };

    await restartTool(deps).handler({ engineId: ENGINE, reason: 'rollout' }, svc);

    expect(restart).toHaveBeenCalledWith(ENGINE, 'svc-worker', 'rollout');
  });

  it('treats an ABSENT caller as a trusted non-edge in-proc path (internal)', async () => {
    const { deps, restart } = makeDeps();

    await restartTool(deps).handler({ engineId: ENGINE }, undefined);

    expect(restart).toHaveBeenCalledWith(ENGINE, 'internal', undefined);
  });

  it('rejects an unknown engine id before any gate/restart', async () => {
    const { deps, restart } = makeDeps();
    const admin: McpToolCaller = { userId: 'real-admin', scopes: ['admin'] };

    const out = (await restartTool(deps).handler(
      { engineId: 'not-an-engine' },
      admin,
    )) as { error?: string };

    expect(out.error).toMatch(/declared engine id/i);
    expect(restart).not.toHaveBeenCalled();
  });
});
