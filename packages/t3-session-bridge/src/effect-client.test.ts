import { describe, expect, it } from 'vitest';
import { defaultRecoderSessionSocketUrl } from './effect-client.js';

// The heavier paths in effect-client.ts (connect/listThreads/subscribeThread/
// sendMessage/getFullThreadDiff) need a live `recoder` server's WebSocket —
// deliberately not exercised here (or in CI). The Wave block's own tests
// (apps/desktop/app/frontend/app/view/recoder-session/recoder-session-model.test.ts)
// cover the session-open/message-stream/diff-render *behavior* against the
// `RecoderSessionRpcClient` interface using `FakeRecoderSessionRpcClient`
// instead. This file only covers the one pure, socket-free helper.
describe('defaultRecoderSessionSocketUrl', () => {
  it('builds a ws:// URL at the recoder server default port and RPC path', () => {
    expect(defaultRecoderSessionSocketUrl()).toBe(
      'ws://127.0.0.1:3773/ws?orchestrationProtocol=2',
    );
  });

  it('accepts a custom host and port', () => {
    expect(defaultRecoderSessionSocketUrl('localhost', 9999)).toBe(
      'ws://localhost:9999/ws?orchestrationProtocol=2',
    );
  });
});
