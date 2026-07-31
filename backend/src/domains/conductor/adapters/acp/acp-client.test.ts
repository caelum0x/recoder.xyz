/**
 * AcpClient — JSON-RPC correlation + agent-initiated-request routing.
 *
 * Proves: request() resolves when the matching response is fed and rejects on a
 * JSON-RPC error; an agent-initiated request routes to onRequest and its result
 * is written back as a response (a thrown handler → a JSON-RPC error, never an
 * unhandled rejection); notifications reach onNotification; a response for an
 * unknown id is ignored; and rejectAll fails every in-flight request.
 */
import { describe, it, expect, vi } from 'vitest';
import { AcpClient } from './acp-client.js';
import { AcpErrorCode, encodeAcpMessage, makeResponse, makeError, makeRequest, makeNotification, decodeAcpStream } from './acp-codec.js';

function harness(onRequest?: (req: { method: string; params?: unknown; id: number | string }) => unknown) {
  const sent: string[] = [];
  const notes: unknown[] = [];
  const client = new AcpClient({
    send: (line) => sent.push(line),
    onNotification: (n) => notes.push(n),
    ...(onRequest ? { onRequest: onRequest as never } : {}),
  });
  // Parse the last framed line the client sent.
  const lastSent = () => decodeAcpStream(sent[sent.length - 1]!).messages[0] as never;
  return { client, sent, notes, lastSent };
}

describe('AcpClient.request correlation', () => {
  it('resolves when the matching response arrives (ids assigned in order)', async () => {
    const { client, lastSent } = harness();
    const p = client.request('session/prompt', { text: 'hi' });
    const req = lastSent() as { id: number; method: string };
    expect(req.method).toBe('session/prompt');
    client.feed(encodeAcpMessage(makeResponse(req.id, { stopReason: 'end_turn' })));
    await expect(p).resolves.toEqual({ stopReason: 'end_turn' });
  });

  it('rejects on a JSON-RPC error response', async () => {
    const { client, lastSent } = harness();
    const p = client.request('session/new');
    const req = lastSent() as { id: number };
    client.feed(encodeAcpMessage(makeError(req.id, -32000, 'boom')));
    await expect(p).rejects.toThrow(/boom/);
  });

  it('ignores a response for an unknown id (late/dup) without throwing', () => {
    const { client } = harness();
    expect(() => client.feed(encodeAcpMessage(makeResponse(999, {})))).not.toThrow();
  });

  it('rejectAll fails every in-flight request', async () => {
    const { client } = harness();
    const p = client.request('session/prompt');
    client.rejectAll('process exited');
    await expect(p).rejects.toThrow(/process exited/);
  });
});

describe('AcpClient agent-initiated requests', () => {
  it('routes an agent request to onRequest and writes back the result', async () => {
    const onRequest = vi.fn(async () => ({ outcome: 'allow' }));
    const { client, lastSent } = harness(onRequest);
    // The agent asks us for permission (a request WITH an id, from the agent side).
    client.feed(encodeAcpMessage(makeRequest(7, 'session/request_permission', { toolCall: 'bash' })));
    await vi.waitFor(() => expect(onRequest).toHaveBeenCalledTimes(1));
    const resp = lastSent() as { id: number; result: unknown };
    expect(resp.id).toBe(7);
    expect(resp.result).toEqual({ outcome: 'allow' });
  });

  it('turns a throwing handler into a JSON-RPC error (never an unhandled rejection)', async () => {
    const { client, lastSent } = harness(() => {
      throw new Error('gate denied');
    });
    client.feed(encodeAcpMessage(makeRequest(8, 'fs/read_text_file', {})));
    await vi.waitFor(() => {
      const resp = lastSent() as { id: number; error?: { message: string } };
      expect(resp.error?.message).toBe('gate denied');
    });
  });

  it('replies MethodNotFound when no onRequest handler is wired', () => {
    const { client, lastSent } = harness();
    client.feed(encodeAcpMessage(makeRequest(9, 'terminal/create', {})));
    const resp = lastSent() as { id: number; error?: { code: number } };
    expect(resp.error?.code).toBe(-32601);
  });

  it('preserves a MethodNotFound (-32601) code thrown by the handler', async () => {
    const { client, lastSent } = harness(() => {
      throw Object.assign(new Error('unknown method: session/mystery'), {
        code: AcpErrorCode.MethodNotFound,
      });
    });
    client.feed(encodeAcpMessage(makeRequest(10, 'session/mystery', {})));
    await vi.waitFor(() => {
      const resp = lastSent() as { id: number; error?: { code: number; message: string } };
      expect(resp.id).toBe(10);
      expect(resp.error?.code).toBe(-32601);
      expect(resp.error?.message).toBe('unknown method: session/mystery');
    });
  });

  it('preserves an InvalidParams (-32602) code thrown by an fs path-escape refusal', async () => {
    const { client, lastSent } = harness(() => {
      throw Object.assign(new Error('path escapes workspace'), {
        code: AcpErrorCode.InvalidParams,
      });
    });
    client.feed(encodeAcpMessage(makeRequest(11, 'fs/read_text_file', { path: '../../etc/passwd' })));
    await vi.waitFor(() => {
      const resp = lastSent() as { id: number; error?: { code: number; message: string } };
      expect(resp.id).toBe(11);
      expect(resp.error?.code).toBe(-32602);
      expect(resp.error?.message).toBe('path escapes workspace');
    });
  });

  it('falls back to InternalError (-32603) for a plain Error with no numeric code', async () => {
    const { client, lastSent } = harness(() => {
      throw new Error('gate denied');
    });
    client.feed(encodeAcpMessage(makeRequest(12, 'fs/read_text_file', {})));
    await vi.waitFor(() => {
      const resp = lastSent() as { id: number; error?: { code: number; message: string } };
      expect(resp.id).toBe(12);
      expect(resp.error?.code).toBe(-32603);
      expect(resp.error?.message).toBe('gate denied');
    });
  });
});

describe('AcpClient notifications + streaming', () => {
  it('forwards notifications to onNotification', () => {
    const { client, notes } = harness();
    client.feed(encodeAcpMessage(makeNotification('session/update', { chunk: 'thinking…' })));
    expect(notes).toEqual([{ jsonrpc: '2.0', method: 'session/update', params: { chunk: 'thinking…' } }]);
  });

  it('reassembles a message split across two feed chunks', async () => {
    const { client, lastSent } = harness();
    const p = client.request('session/prompt');
    const req = lastSent() as { id: number };
    const line = encodeAcpMessage(makeResponse(req.id, { ok: true }));
    const mid = Math.floor(line.length / 2);
    client.feed(line.slice(0, mid));
    client.feed(line.slice(mid));
    await expect(p).resolves.toEqual({ ok: true });
  });
});
