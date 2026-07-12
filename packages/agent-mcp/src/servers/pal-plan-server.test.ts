import { describe, expect, it } from 'vitest';
import { McpRegistry } from '../registry';
import { McpToolRouter } from '../host/tool-router';
import type { McpToolCallInput } from '../permissions';
import {
  palPlanMcpServer,
  registerPalPlanMcpTools,
  type PalPlanPort,
} from './pal-plan-server';

function makeRouter(port: PalPlanPort): McpToolRouter {
  const router = new McpToolRouter(new McpRegistry());
  registerPalPlanMcpTools(router, port);
  return router;
}

function callInput(args: Record<string, unknown>): McpToolCallInput {
  return {
    server: palPlanMcpServer,
    toolName: 'pal.plan',
    args,
  } as unknown as McpToolCallInput;
}

describe('registerPalPlanMcpTools', () => {
  it('registers the pal.plan tool on the recoder.pal-plan server', () => {
    const registry = new McpRegistry();
    const router = new McpToolRouter(registry);
    registerPalPlanMcpTools(router, { plan: () => ({ status: 'planned' }) });

    const server = registry.get('recoder.pal-plan');
    expect(server?.toolNames).toEqual(['pal.plan']);
    expect(server?.kind).toBe('custom');
  });

  it('forwards args.taskSpec to the port and tags the engine', async () => {
    let received: unknown;
    const router = makeRouter({
      plan: (taskSpec) => {
        received = taskSpec;
        return { status: 'planned', decision: {} };
      },
    });

    const spec = { taskId: 'task-1' };
    const result = await router.call(callInput({ taskSpec: spec }));

    expect(received).toEqual(spec);
    expect(result.metadata).toEqual({ engine: 'pal-plan' });
    expect(result.content).toEqual({ status: 'planned', decision: {} });
  });

  it('falls back to the raw args object when no taskSpec wrapper is present', async () => {
    let received: unknown;
    const router = makeRouter({
      plan: (taskSpec) => {
        received = taskSpec;
        return { ok: true };
      },
    });

    const args = { taskId: 'task-2', intent: 'bugfix' };
    await router.call(callInput(args));

    expect(received).toEqual(args);
  });

  it('does not throw when args are empty; the port decides the degrade path', async () => {
    const router = makeRouter({
      plan: () => ({ status: 'degraded_default' }),
    });

    const result = await router.call(callInput({}));
    expect(result.content).toEqual({ status: 'degraded_default' });
  });
});
