/**
 * AcpAgentDriver — lifecycle orchestration over a fake ACP process.
 *
 * Proves: start() completes the initialize handshake; newSession/prompt resolve
 * the agent's sessionId/stopReason; cancel sends a session/cancel notification;
 * a process exit rejects in-flight requests; start-twice and use-before-start
 * fail truthfully; and agent-initiated requests/notifications reach the bridges.
 */
import { describe, it, expect, vi } from 'vitest';
import { AcpAgentDriver, type AcpProcess } from './acp-driver.js';
import {
  decodeAcpStream,
  encodeAcpMessage,
  isAcpRequest,
  makeResponse,
  makeRequest,
  makeNotification,
  type AcpRequest,
} from './acp-codec.js';

/** A fake agent process that auto-responds to requests via a `responder`. */
function fakeAgent(responder: (method: string) => unknown) {
  let dataCb: ((chunk: string) => void) | null = null;
  let exitCb: ((code: number | null) => void) | null = null;
  const writes: string[] = [];
  const proc: AcpProcess = {
    write(line) {
      writes.push(line);
      const msg = decodeAcpStream(line).messages[0];
      if (msg && isAcpRequest(msg)) {
        const result = responder(msg.method);
        if (result !== undefined) {
          queueMicrotask(() =>
            dataCb?.(
              encodeAcpMessage(makeResponse((msg as AcpRequest).id, result))
            )
          );
        }
      }
    },
    onData(cb) {
      dataCb = cb;
    },
    onExit(cb) {
      exitCb = cb;
    },
    kill() {
      exitCb?.(0);
    },
  };
  return {
    spawn: () => proc,
    writes,
    emit: (line: string) => dataCb?.(line),
    exit: (code: number | null) => exitCb?.(code),
    /** Parse the Nth request the driver wrote. */
    sentMethods: () =>
      writes.map(
        w => (decodeAcpStream(w).messages[0] as { method?: string }).method
      ),
  };
}

const defaultResponder = (method: string): unknown => {
  if (method === 'initialize') return { protocolVersion: 1 };
  if (method === 'session/new') return { sessionId: 's1' };
  if (method === 'session/prompt') return { stopReason: 'end_turn' };
  return {};
};

describe('AcpAgentDriver lifecycle', () => {
  it('start → newSession → prompt drives the ACP handshake and returns results', async () => {
    const agent = fakeAgent(defaultResponder);
    const driver = new AcpAgentDriver({ spawn: agent.spawn });
    // start() surfaces the negotiated version AND the loadSession capability so a
    // caller can gate session/load; the default responder advertises none → false.
    await expect(driver.start()).resolves.toEqual({
      protocolVersion: 1,
      loadSession: false,
    });
    await expect(driver.newSession('/wt/ws1')).resolves.toBe('s1');
    await expect(driver.prompt('s1', 'fix the bug')).resolves.toBe('end_turn');
    expect(agent.sentMethods()).toEqual([
      'initialize',
      'session/new',
      'session/prompt',
    ]);
  });

  it('start() reports loadSession:true when the agent advertises the capability', async () => {
    const agent = fakeAgent(m =>
      m === 'initialize'
        ? { protocolVersion: 1, agentCapabilities: { loadSession: true } }
        : defaultResponder(m)
    );
    const driver = new AcpAgentDriver({ spawn: agent.spawn });
    await expect(driver.start()).resolves.toEqual({
      protocolVersion: 1,
      loadSession: true,
    });
  });

  it('loadSession sends session/load with the sessionId + cwd (v1 resume)', async () => {
    const agent = fakeAgent(m =>
      m === 'session/load' ? {} : defaultResponder(m)
    );
    const driver = new AcpAgentDriver({ spawn: agent.spawn });
    await driver.start();
    await expect(driver.loadSession('s1', '/wt/ws1')).resolves.toBeUndefined();
    const load = agent.writes
      .map(
        w =>
          decodeAcpStream(w).messages[0] as {
            method?: string;
            params?: unknown;
          }
      )
      .find(m => m.method === 'session/load');
    expect(load?.params).toEqual({
      sessionId: 's1',
      cwd: '/wt/ws1',
      mcpServers: [],
    });
  });

  it('cancel sends a session/cancel notification', async () => {
    const agent = fakeAgent(defaultResponder);
    const driver = new AcpAgentDriver({ spawn: agent.spawn });
    await driver.start();
    driver.cancel('s1');
    expect(agent.sentMethods()).toContain('session/cancel');
  });

  it('a process exit rejects an in-flight prompt', async () => {
    const agent = fakeAgent(m =>
      m === 'initialize' ? { protocolVersion: 1 } : undefined
    ); // never answers prompt
    const driver = new AcpAgentDriver({ spawn: agent.spawn });
    await driver.start();
    const p = driver.prompt('s1', 'hang');
    agent.exit(1);
    await expect(p).rejects.toThrow(/exited/);
  });

  it('throws on double start and on use-before-start', async () => {
    const agent = fakeAgent(defaultResponder);
    const driver = new AcpAgentDriver({ spawn: agent.spawn });
    await expect(driver.newSession('/wt')).rejects.toThrow(/not started/);
    await driver.start();
    await expect(driver.start()).rejects.toThrow(/already started/);
  });

  it('throws truthfully when session/new returns no sessionId', async () => {
    const agent = fakeAgent(m =>
      m === 'initialize' ? { protocolVersion: 1 } : {}
    ); // session/new → {}
    const driver = new AcpAgentDriver({ spawn: agent.spawn });
    await driver.start();
    await expect(driver.newSession('/wt')).rejects.toThrow(/no sessionId/);
  });
});

describe('AcpAgentDriver bridges', () => {
  it('routes an agent permission request to onRequest and answers it', async () => {
    const onRequest = vi.fn(async () => ({ outcome: 'allow' }));
    const agent = fakeAgent(defaultResponder);
    const driver = new AcpAgentDriver({ spawn: agent.spawn, onRequest });
    await driver.start();
    agent.emit(
      encodeAcpMessage(
        makeRequest(42, 'session/request_permission', { tool: 'bash' })
      )
    );
    await vi.waitFor(() => expect(onRequest).toHaveBeenCalledTimes(1));
    // The driver wrote a response for id 42.
    const answered = agent.writes.some(w => {
      const m = decodeAcpStream(w).messages[0] as {
        id?: number;
        result?: unknown;
      };
      return m?.id === 42 && m.result != null;
    });
    expect(answered).toBe(true);
  });

  it('forwards session/update notifications to onNotification', async () => {
    const notes: unknown[] = [];
    const agent = fakeAgent(defaultResponder);
    const driver = new AcpAgentDriver({
      spawn: agent.spawn,
      onNotification: n => notes.push(n),
    });
    await driver.start();
    agent.emit(
      encodeAcpMessage(
        makeNotification('session/update', { chunk: 'working…' })
      )
    );
    expect(notes).toHaveLength(1);
  });
});
