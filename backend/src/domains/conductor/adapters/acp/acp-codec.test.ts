/**
 * ACP wire codec (JSON-RPC 2.0 over ndjson).
 *
 * Proves: constructors emit valid JSON-RPC; the type guards + asAcpMessage narrow
 * requests / notifications / responses and reject non-2.0 or shapeless payloads;
 * encode appends a newline; decodeAcpStream splits complete lines, returns the
 * partial trailing line as `rest`, and skips blank/malformed lines without
 * throwing (a noisy agent log line never breaks the stream).
 */
import { describe, it, expect } from 'vitest';
import {
  ACP_JSONRPC_VERSION,
  AcpErrorCode,
  asAcpMessage,
  decodeAcpStream,
  encodeAcpMessage,
  isAcpNotification,
  isAcpRequest,
  isAcpResponse,
  makeError,
  makeNotification,
  makeRequest,
  makeResponse,
} from './acp-codec.js';

describe('ACP constructors + guards', () => {
  it('builds a request and narrows it', () => {
    const req = makeRequest(1, 'session/prompt', { text: 'hi' });
    expect(req).toEqual({ jsonrpc: '2.0', id: 1, method: 'session/prompt', params: { text: 'hi' } });
    expect(isAcpRequest(req)).toBe(true);
    expect(isAcpNotification(req)).toBe(false);
    expect(isAcpResponse(req)).toBe(false);
  });

  it('builds a notification (no id) and narrows it', () => {
    const note = makeNotification('session/update', { chunk: 'x' });
    expect('id' in note).toBe(false);
    expect(isAcpNotification(note)).toBe(true);
  });

  it('builds result and error responses and narrows them', () => {
    const ok = makeResponse('a', { sessionId: 's1' });
    expect(isAcpResponse(ok)).toBe(true);
    expect(ok.result).toEqual({ sessionId: 's1' });
    const err = makeError('a', AcpErrorCode.MethodNotFound, 'nope');
    expect(err.error).toEqual({ code: -32601, message: 'nope' });
  });
});

describe('asAcpMessage', () => {
  it('rejects non-object / wrong-version / shapeless payloads', () => {
    expect(asAcpMessage(null)).toBeNull();
    expect(asAcpMessage('x')).toBeNull();
    expect(asAcpMessage({ jsonrpc: '1.0', id: 1, method: 'm' })).toBeNull();
    expect(asAcpMessage({ jsonrpc: ACP_JSONRPC_VERSION })).toBeNull(); // no method, no id+result
  });

  it('narrows a request, a notification, and a response', () => {
    expect(asAcpMessage({ jsonrpc: '2.0', id: 2, method: 'm', params: { a: 1 } })).toEqual({
      jsonrpc: '2.0',
      id: 2,
      method: 'm',
      params: { a: 1 },
    });
    expect(asAcpMessage({ jsonrpc: '2.0', method: 'n' })).toEqual({ jsonrpc: '2.0', method: 'n', params: undefined });
    const resp = asAcpMessage({ jsonrpc: '2.0', id: 3, result: { ok: true } });
    expect(resp && isAcpResponse(resp)).toBe(true);
  });

  it('coerces an error object, defaulting a missing code', () => {
    const resp = asAcpMessage({ jsonrpc: '2.0', id: 4, error: { message: 'boom' } });
    expect(resp).toEqual({ jsonrpc: '2.0', id: 4, error: { code: AcpErrorCode.InternalError, message: 'boom', data: undefined } });
  });
});

describe('framing', () => {
  it('encodes one message as a newline-terminated JSON line', () => {
    const line = encodeAcpMessage(makeRequest(1, 'm'));
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line.trim())).toEqual({ jsonrpc: '2.0', id: 1, method: 'm' });
  });

  it('splits complete lines and returns the partial trailing line as rest', () => {
    const a = encodeAcpMessage(makeRequest(1, 'a'));
    const b = encodeAcpMessage(makeNotification('b'));
    const { messages, rest } = decodeAcpStream(`${a}${b}{"jsonrpc":"2.0","id":2,"method":"c"`);
    expect(messages.map((m) => (m as { method?: string }).method)).toEqual(['a', 'b']);
    expect(rest).toBe('{"jsonrpc":"2.0","id":2,"method":"c"');
    // the partial completes on the next chunk
    const next = decodeAcpStream(`${rest}}\n`);
    expect(next.messages).toHaveLength(1);
    expect(next.rest).toBe('');
  });

  it('skips blank lines and malformed / non-JSON-RPC lines without throwing', () => {
    const good = encodeAcpMessage(makeRequest(1, 'a')); // ends with '\n'
    const partial = JSON.stringify(makeRequest(2, 'b')); // NO trailing newline → becomes rest
    const chunk = `\n${good}not json at all\n{"hello":"world"}\n${partial}`;
    const { messages, rest } = decodeAcpStream(chunk);
    expect(messages).toHaveLength(1); // only the complete `good` line; junk lines skipped
    expect(messages[0]).toMatchObject({ method: 'a' });
    expect(rest).toBe(partial);
  });
});
