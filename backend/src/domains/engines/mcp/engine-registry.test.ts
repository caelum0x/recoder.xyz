/**
 * The wiring-checklist GUARD (`assertWiringComplete`) — the guard that catches
 * the recurring "new MCP engine 404" bug at boot:
 *  - passes when every engine server is in the catalog + every tool has a handler,
 *  - throws naming the server when an ENGINE_SERVERS server is missing from
 *    IN_PROC_SERVERS,
 *  - throws naming the tool when a handler is missing.
 */
import { describe, it, expect } from 'vitest';
import { assertWiringComplete, EngineWiringError } from './engine-registry.js';
import type { McpServerRegistration } from '@recoder/interop';

function server(id: string, tools: string[]): McpServerRegistration {
  return {
    serverId: id,
    kind: 'test',
    displayName: id,
    transport: 'in-proc',
    enabled: true,
    toolNames: tools,
    metadata: { external: false },
  } as McpServerRegistration;
}

describe('assertWiringComplete', () => {
  const alpha = server('alpha', ['a.one', 'a.two']);

  it('passes when catalog + handlers cover every engine tool', () => {
    expect(() =>
      assertWiringComplete({
        inProcServers: [alpha],
        engineServers: [alpha],
        handlerKeys: new Set(['alpha:a.one', 'alpha:a.two']),
      }),
    ).not.toThrow();
  });

  it('throws when an engine server is not in the registry catalog', () => {
    expect(() =>
      assertWiringComplete({
        inProcServers: [],
        engineServers: [alpha],
        handlerKeys: new Set(['alpha:a.one', 'alpha:a.two']),
      }),
    ).toThrowError(/alpha.*IN_PROC_SERVERS/s);
  });

  it('throws (EngineWiringError) naming the tool when a handler is missing', () => {
    try {
      assertWiringComplete({
        inProcServers: [alpha],
        engineServers: [alpha],
        handlerKeys: new Set(['alpha:a.one']), // a.two missing
      });
      throw new Error('expected assertWiringComplete to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(EngineWiringError);
      expect((err as Error).message).toContain('alpha:a.two');
    }
  });
});
