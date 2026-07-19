/**
 * Tests for the `recoder.tensorzero` MCP binder: the two deep tools are
 * registered on the router, their handlers parse args and call the injected port,
 * the `InvokeResult` is unwrapped onto the MCP envelope (a failure throws the real
 * reason), audit `requestedBy` is threaded from the authorized caller for the
 * side-effecting `batch_inference`, boundary validation throws, and an unbound
 * port (null) still registers callable handlers that report unavailability instead
 * of 404-ing.
 */
import { describe, it, expect } from 'vitest';
import { McpRegistry, McpToolRouter } from '@recoder/agent-mcp';
import { ok, fail, type InvokeResult } from '../types.js';
import type { TensorzeroInferencePort } from '../adapters/napi/tensorzero-napi.adapter.js';
import {
  tensorzeroInferenceMcpServer,
  tensorzeroInferenceEngineBinder,
  TENSORZERO_SERVER_ID,
} from './tensorzero-inference-engine.js';

/** A spy port recording the last input per method, answering with a fixed result. */
function spyPort(
  catalog: InvokeResult<unknown> = ok({ gatewayVersion: '2.0.0', models: [], functions: [], defaultFunction: null, skipped: [] }),
  batch: InvokeResult<unknown> = ok({ total: 0, succeeded: 0, failed: 0, skipped: 0, concurrency: 4, results: [] }),
) {
  const seen: Record<string, unknown> = {};
  const port: TensorzeroInferencePort = {
    async modelCatalog() {
      seen.modelCatalog = true;
      return catalog as never;
    },
    async batchInference(input) {
      seen.batchInference = input;
      return batch as never;
    },
  };
  return { port, seen };
}

function router(port: TensorzeroInferencePort | null): McpToolRouter {
  const r = new McpToolRouter(new McpRegistry());
  tensorzeroInferenceEngineBinder(port)(r);
  return r;
}

function call(
  r: McpToolRouter,
  toolName: string,
  args: Record<string, unknown>,
  caller?: { userId: string },
) {
  return r.call({
    server: tensorzeroInferenceMcpServer,
    toolName,
    actor: { agentId: 'agent-1' } as never,
    args,
    ...(caller ? { caller } : {}),
  } as never);
}

describe('tensorzeroInferenceMcpServer descriptor', () => {
  it('advertises the two deep tools under the recoder.tensorzero server id', () => {
    expect(tensorzeroInferenceMcpServer.serverId).toBe(TENSORZERO_SERVER_ID);
    expect(tensorzeroInferenceMcpServer.toolNames).toEqual([
      'tensorzero.model_catalog',
      'tensorzero.batch_inference',
    ]);
  });
});

describe('tensorzero.model_catalog', () => {
  it('returns the catalog on the MCP envelope with the tensorzero engine tag', async () => {
    const { port, seen } = spyPort();
    const result = await call(router(port), 'tensorzero.model_catalog', {});
    expect(seen.modelCatalog).toBe(true);
    expect(result.content).toMatchObject({ gatewayVersion: '2.0.0' });
    expect(result.metadata).toMatchObject({ engine: 'tensorzero', tool: 'tensorzero.model_catalog' });
  });

  it('throws the real reason when the port fails (truthful degrade)', async () => {
    const { port } = spyPort(fail('tensorzero engine disabled by config', 'DISABLED'));
    await expect(call(router(port), 'tensorzero.model_catalog', {})).rejects.toThrow(/disabled by config/);
  });

  it('reports unavailability (not 404) when the adapter is unbound', async () => {
    await expect(call(router(null), 'tensorzero.model_catalog', {})).rejects.toThrow(/not bound/);
  });
});

describe('tensorzero.batch_inference', () => {
  it('parses requests + concurrency and threads the authorized caller into audit metadata', async () => {
    const { port, seen } = spyPort();
    const result = await call(
      router(port),
      'tensorzero.batch_inference',
      {
        requests: [{ function_name: 'recoder_default', input: {} }, { function_name: 'f2', input: {} }],
        concurrency: 2,
        stopOnError: true,
      },
      { userId: 'user-42' },
    );
    expect(seen.batchInference).toMatchObject({ concurrency: 2, stopOnError: true });
    expect((seen.batchInference as { requests: unknown[] }).requests).toHaveLength(2);
    expect(result.metadata).toMatchObject({ engine: 'tensorzero', tool: 'tensorzero.batch_inference', requestedBy: 'user-42' });
  });

  it('falls back to the agent id for audit when there is no edge caller', async () => {
    const { port } = spyPort();
    const result = await call(router(port), 'tensorzero.batch_inference', {
      requests: [{ function_name: 'f', input: {} }],
    });
    expect(result.metadata).toMatchObject({ requestedBy: 'agent-1' });
  });

  it('throws on an empty requests array (boundary validation)', async () => {
    const { port } = spyPort();
    await expect(call(router(port), 'tensorzero.batch_inference', { requests: [] })).rejects.toThrow(/non-empty/);
  });

  it('throws when a request entry is not a JSON object', async () => {
    const { port } = spyPort();
    await expect(
      call(router(port), 'tensorzero.batch_inference', { requests: ['not-an-object'] }),
    ).rejects.toThrow(/must be a JSON object/);
  });

  it('accepts the snake_case stop_on_error alias', async () => {
    const { port, seen } = spyPort();
    await call(router(port), 'tensorzero.batch_inference', {
      requests: [{ function_name: 'f', input: {} }],
      stop_on_error: true,
    });
    expect(seen.batchInference).toMatchObject({ stopOnError: true });
  });

  it('throws the real reason when the batch op fails at the seam (gateway down)', async () => {
    const { port } = spyPort(undefined, fail('tensorzero embedded gateway unavailable', 'ENGINE_DOWN'));
    await expect(
      call(router(port), 'tensorzero.batch_inference', { requests: [{ function_name: 'f', input: {} }] }),
    ).rejects.toThrow(/gateway unavailable/);
  });
});
