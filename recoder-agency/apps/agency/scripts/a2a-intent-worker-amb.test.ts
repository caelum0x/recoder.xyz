import { describe, expect, it, vi } from 'vitest';
import { createAmbEmitter } from './a2a-intent-worker-amb.mjs';

function mockJson(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  };
}

describe('a2a-intent-worker AMB emitter', () => {
  it('creates channel/thread once per workflow and sends messages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockJson({ data: { id: 'chan_1' } }))
      .mockResolvedValueOnce(mockJson({ data: { id: 'thr_1' } }))
      .mockResolvedValueOnce(mockJson({ data: { id: 'msg_1' } }))
      .mockResolvedValueOnce(mockJson({ data: { id: 'msg_2' } }));

    const emitter = createAmbEmitter({
      baseUrl: 'http://localhost:7777',
      serviceId: 'recoder_agency',
      fetchImpl: fetchMock as typeof fetch,
    });

    await emitter.emit('wf_1', 'execute', 'first');
    await emitter.emit('wf_1', 'execute', 'second');

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:7777/api/a2a/channels');
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:7777/api/a2a/channels/chan_1/threads');
    expect(fetchMock.mock.calls[2][0]).toBe('http://localhost:7777/api/a2a/channels/chan_1/threads/thr_1/messages');
    expect(fetchMock.mock.calls[3][0]).toBe('http://localhost:7777/api/a2a/channels/chan_1/threads/thr_1/messages');
  });

  it('does nothing when emitter is disabled', async () => {
    const fetchMock = vi.fn();
    const emitter = createAmbEmitter({
      baseUrl: 'http://localhost:7777',
      serviceId: 'recoder_agency',
      disabled: true,
      fetchImpl: fetchMock as typeof fetch,
    });

    const emitted = await emitter.emit('wf_disabled', 'plan', 'hello');
    expect(emitted).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when AMB endpoint returns non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const emitter = createAmbEmitter({
      baseUrl: 'http://localhost:7777',
      serviceId: 'recoder_agency',
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(emitter.emit('wf_error', 'execute', 'boom')).rejects.toThrow(
      'AMB request failed: 500 /api/a2a/channels',
    );
  });

  it('creates separate channel/thread contexts per workflow', async () => {
    const fetchMock = vi.fn()
      // wf_1 bootstrap + msg
      .mockResolvedValueOnce(mockJson({ data: { id: 'chan_1' } }))
      .mockResolvedValueOnce(mockJson({ data: { id: 'thr_1' } }))
      .mockResolvedValueOnce(mockJson({ data: { id: 'msg_1' } }))
      // wf_2 bootstrap + msg
      .mockResolvedValueOnce(mockJson({ data: { id: 'chan_2' } }))
      .mockResolvedValueOnce(mockJson({ data: { id: 'thr_2' } }))
      .mockResolvedValueOnce(mockJson({ data: { id: 'msg_2' } }));

    const emitter = createAmbEmitter({
      baseUrl: 'http://localhost:7777',
      serviceId: 'recoder_agency',
      fetchImpl: fetchMock as typeof fetch,
    });

    await emitter.emit('wf_1', 'plan', 'first');
    await emitter.emit('wf_2', 'plan', 'second');

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:7777/api/a2a/channels');
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:7777/api/a2a/channels/chan_1/threads');
    expect(fetchMock.mock.calls[2][0]).toBe('http://localhost:7777/api/a2a/channels/chan_1/threads/thr_1/messages');
    expect(fetchMock.mock.calls[3][0]).toBe('http://localhost:7777/api/a2a/channels');
    expect(fetchMock.mock.calls[4][0]).toBe('http://localhost:7777/api/a2a/channels/chan_2/threads');
    expect(fetchMock.mock.calls[5][0]).toBe('http://localhost:7777/api/a2a/channels/chan_2/threads/thr_2/messages');
  });

  it('returns false without network calls when base url is empty', async () => {
    const fetchMock = vi.fn();
    const emitter = createAmbEmitter({
      baseUrl: '',
      serviceId: 'recoder_agency',
      fetchImpl: fetchMock as typeof fetch,
    });

    const emitted = await emitter.emit('wf_empty_base', 'execute', 'noop');
    expect(emitted).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
