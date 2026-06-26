/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createRecoderMcpBridgeFactory,
  type BridgedMcpConnection,
  type PiBridgedTool,
} from './mcp-bridge.js';

/** A fake pi tool registrar capturing registered tools. */
function fakeRegistrar() {
  const tools: PiBridgedTool[] = [];
  return {
    tools,
    registerTool(tool: PiBridgedTool) {
      tools.push(tool);
    },
  };
}

function fakeConnection(
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>,
  callResult: unknown,
): BridgedMcpConnection {
  return {
    listTools: async () => ({ tools }),
    callTool: async () => ({ content: callResult }),
    close: async () => {},
  };
}

describe('createRecoderMcpBridgeFactory', () => {
  it('registers every tool from each MCP server, namespaced by server', async () => {
    const connect = vi.fn(async (name: string) => {
      if (name === 'recodergit') {
        return fakeConnection(
          [{ name: 'impact' }, { name: 'context' }],
          [{ type: 'text', text: 'graph' }],
        );
      }
      return fakeConnection([{ name: 'recall' }], [{ type: 'text', text: 'mem' }]);
    });

    const factory = createRecoderMcpBridgeFactory(
      {
        recodergit: { command: 'recodergit', args: ['mcp'] } as never,
        brain: { command: 'recoder-brain', args: [] } as never,
      },
      { connect },
    );

    const pi = fakeRegistrar();
    await factory(pi);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(pi.tools.map((t) => t.name).sort()).toEqual([
      'brain__recall',
      'recodergit__context',
      'recodergit__impact',
    ]);
  });

  it('proxies execute() to the live MCP server and returns text content', async () => {
    const callTool = vi.fn(async () => ({
      content: [{ type: 'text', text: 'hello from mcp' }],
    }));
    const connect = vi.fn(async () => ({
      listTools: async () => ({ tools: [{ name: 'query' }] }),
      callTool,
      close: async () => {},
    }));

    const factory = createRecoderMcpBridgeFactory(
      { recodergit: { command: 'recodergit' } as never },
      { connect },
    );
    const pi = fakeRegistrar();
    await factory(pi);

    const result = await pi.tools[0].execute('call-1', { q: 'x' });
    expect(callTool).toHaveBeenCalledWith({
      name: 'query',
      arguments: { q: 'x' },
    });
    expect(result.content).toEqual([{ type: 'text', text: 'hello from mcp' }]);
  });

  it('is fail-safe: a broken server is skipped with a warning, others still load', async () => {
    const warnings: string[] = [];
    const connect = vi.fn(async (name: string) => {
      if (name === 'recodergit') {
        throw new Error('spawn failed');
      }
      return fakeConnection([{ name: 'recall' }], [{ type: 'text', text: 'ok' }]);
    });

    const factory = createRecoderMcpBridgeFactory(
      {
        recodergit: { command: 'recodergit' } as never,
        brain: { command: 'recoder-brain' } as never,
      },
      { connect, onWarn: (m) => warnings.push(m) },
    );

    const pi = fakeRegistrar();
    await expect(factory(pi)).resolves.toBeUndefined();

    expect(pi.tools.map((t) => t.name)).toEqual(['brain__recall']);
    expect(warnings.some((w) => w.includes('recodergit'))).toBe(true);
  });

  it('skips servers without a command', async () => {
    const connect = vi.fn();
    const factory = createRecoderMcpBridgeFactory(
      { recodergit: { args: [] } as never },
      { connect },
    );
    await factory(fakeRegistrar());
    expect(connect).not.toHaveBeenCalled();
  });
});
