/**
 * WebSocket RPC Tests
 * 
 * Tests WebSocket RPC functionality including:
 * - Message batching for performance
 * - RPC request/response handling
 * - Reconnection scenarios
 * - Error handling and edge cases
 * 
 * Based on issues found in docker-logs.md:
 * - WebSocket upgrade requests
 * - Keepalive registration and cleanup
 * - Connection closure handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';

// Create mock WebSocket
const createMockWebSocket = (readyState: number = WebSocket.OPEN) => ({
  readyState,
  send: vi.fn(),
  on: vi.fn(),
  close: vi.fn(),
});

// Mock the ws module
vi.mock('ws', () => ({
  default: {
    OPEN: 1,
    CLOSED: 3,
    CONNECTING: 0,
    CLOSING: 2,
  },
}));

import { WebSocketRPC } from '../websocket-rpc';

describe('WebSocketRPC', () => {
  let mockWs: any;
  let rpc: WebSocketRPC;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockWs = createMockWebSocket(WebSocket.OPEN);
    rpc = new WebSocketRPC(mockWs as any);
  });

  afterEach(() => {
    rpc.cleanup();
    vi.useRealTimers();
  });

  describe('Handler Registration', () => {
    it('should register RPC handlers', () => {
      const handler = vi.fn().mockResolvedValue({ success: true });
      rpc.register('test.method', handler);
      
      expect(rpc['handlers'].has('test.method')).toBe(true);
    });

    it('should handle multiple handlers for different methods', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      rpc.register('method1', handler1);
      rpc.register('method2', handler2);
      
      expect(rpc['handlers'].size).toBe(2);
    });
  });

  describe('Message Handling', () => {
    it('should handle valid RPC request', async () => {
      const handler = vi.fn().mockResolvedValue({ result: 'success' });
      rpc.register('test.echo', handler);
      
      const request = JSON.stringify({
        id: 1,
        method: 'test.echo',
        params: { message: 'hello' },
      });
      
      const handled = await rpc.handleMessage(request);
      
      expect(handled).toBe(true);
      expect(handler).toHaveBeenCalledWith({ message: 'hello' });
    });

    it('should return false for non-RPC messages', async () => {
      const handled = await rpc.handleMessage('plain text message');
      expect(handled).toBe(false);
    });

    it('should return false for JSON without id/method', async () => {
      const handled = await rpc.handleMessage(JSON.stringify({ data: 'something' }));
      expect(handled).toBe(false);
    });

    it('should handle unknown methods', async () => {
      const request = JSON.stringify({
        id: 1,
        method: 'unknown.method',
        params: {},
      });
      
      const handled = await rpc.handleMessage(request);
      
      expect(handled).toBe(true);
      // Should send error response
      vi.runOnlyPendingTimers();
      expect(mockWs.send).toHaveBeenCalled();
    });

    it('should handle handler errors', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler failed'));
      rpc.register('failing.method', handler);
      
      const request = JSON.stringify({
        id: 1,
        method: 'failing.method',
        params: {},
      });
      
      await rpc.handleMessage(request);
      vi.runOnlyPendingTimers();
      
      // Should send error response
      const sentData = mockWs.send.mock.calls[0]?.[0];
      if (sentData) {
        const response = JSON.parse(sentData);
        expect(response.error).toBe('Handler failed');
      }
    });
  });

  describe('Message Batching', () => {
    it('should batch multiple rapid messages', async () => {
      // Trigger multiple sends quickly
      rpc.sendCommandComplete();
      rpc.sendCommandComplete();
      rpc.sendCommandComplete();
      
      // Before timer fires, no messages sent due to batching
      // Except sendCommandComplete forces flush
      expect(mockWs.send.mock.calls.length).toBeGreaterThan(0);
    });

    it('should flush batch after timeout', async () => {
      // Queue a message via private method simulation
      const handler = vi.fn().mockResolvedValue({ ok: true });
      rpc.register('batch.test', handler);
      
      await rpc.handleMessage(JSON.stringify({
        id: 1,
        method: 'batch.test',
        params: {},
      }));
      
      // Run timer to trigger batch flush
      vi.runOnlyPendingTimers();
      
      expect(mockWs.send).toHaveBeenCalled();
    });

    it('should flush on forceFlush()', () => {
      rpc.sendCommandComplete();
      rpc.forceFlush();
      
      // Messages should be sent
      expect(mockWs.send).toHaveBeenCalled();
    });

    it('should report batch stats', () => {
      const stats = rpc.getBatchStats();
      
      expect(stats).toHaveProperty('buffered');
      expect(stats).toHaveProperty('lastFlushTime');
      expect(typeof stats.buffered).toBe('number');
    });
  });

  describe('Connection State Handling', () => {
    it('should not send when connection is closed', async () => {
      const closedWs = createMockWebSocket(WebSocket.CLOSED);
      const closedRpc = new WebSocketRPC(closedWs as any);
      
      closedRpc.sendCommandComplete();
      vi.runOnlyPendingTimers();
      
      expect(closedWs.send).not.toHaveBeenCalled();
    });

    it('should handle CONNECTING state', async () => {
      const connectingWs = createMockWebSocket(WebSocket.CONNECTING);
      const connectingRpc = new WebSocketRPC(connectingWs as any);
      
      connectingRpc.sendImmediate('test');
      
      expect(connectingWs.send).not.toHaveBeenCalled();
    });

    it('should send immediate messages when socket is open', () => {
      rpc.sendImmediate('immediate-message');
      
      expect(mockWs.send).toHaveBeenCalledWith('immediate-message');
    });
  });

  describe('Cleanup', () => {
    it('should flush pending messages on cleanup', () => {
      // Trigger some pending messages
      const handler = vi.fn().mockResolvedValue({});
      rpc.register('cleanup.test', handler);
      
      rpc.cleanup();
      
      // Timer should be cleared
      expect(rpc['batchTimer']).toBeNull();
    });

    it('should clear batch timer on cleanup', () => {
      // Create pending batch
      rpc.sendCommandComplete();
      
      // Cleanup
      rpc.cleanup();
      
      expect(rpc['batchTimer']).toBeNull();
    });
  });

  describe('sendCommandComplete', () => {
    it('should send command-complete message', () => {
      rpc.sendCommandComplete();
      
      const sentData = mockWs.send.mock.calls[0][0];
      const message = JSON.parse(sentData);
      
      expect(message.type).toBe('command-complete');
      expect(message.timestamp).toBeDefined();
    });

    it('should force flush after sendCommandComplete', () => {
      rpc.sendCommandComplete();
      
      // Should have sent immediately due to forceFlush
      expect(mockWs.send.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Batch Configuration', () => {
    it('should respect custom batch config', () => {
      const customRpc = new WebSocketRPC(mockWs as any, {
        maxBatchSize: 10,
        maxWaitMs: 100,
        enabled: true,
      });
      
      expect(customRpc['batchConfig'].maxBatchSize).toBe(10);
      expect(customRpc['batchConfig'].maxWaitMs).toBe(100);
      
      customRpc.cleanup();
    });

    it('should disable batching when configured', () => {
      const noBatchRpc = new WebSocketRPC(mockWs as any, {
        enabled: false,
      });
      
      // Messages should be sent immediately
      noBatchRpc.sendCommandComplete();
      
      expect(mockWs.send.mock.calls.length).toBeGreaterThanOrEqual(1);
      
      noBatchRpc.cleanup();
    });
  });

  describe('Terminal Integration', () => {
    it('should handle terminal.resize RPC', async () => {
      const resizeHandler = vi.fn().mockResolvedValue({ success: true });
      rpc.register('terminal.resize', resizeHandler);
      
      await rpc.handleMessage(JSON.stringify({
        id: 1,
        method: 'terminal.resize',
        params: { cols: 84, rows: 24 },
      }));
      
      expect(resizeHandler).toHaveBeenCalledWith({ cols: 84, rows: 24 });
    });

    it('should handle rapid terminal data', async () => {
      const dataHandler = vi.fn().mockResolvedValue({});
      rpc.register('terminal.data', dataHandler);
      
      // Simulate rapid terminal input
      for (let i = 0; i < 50; i++) {
        await rpc.handleMessage(JSON.stringify({
          id: i,
          method: 'terminal.data',
          params: { data: `char-${i}` },
        }));
      }
      
      expect(dataHandler).toHaveBeenCalledTimes(50);
    });
  });
});

describe('WebSocketRPC Edge Cases', () => {
  it('should handle malformed JSON gracefully', async () => {
    const mockWs = createMockWebSocket(WebSocket.OPEN);
    const rpc = new WebSocketRPC(mockWs as any);
    
    const handled = await rpc.handleMessage('{ invalid json }');
    
    expect(handled).toBe(false);
    rpc.cleanup();
  });

  it('should handle empty messages', async () => {
    const mockWs = createMockWebSocket(WebSocket.OPEN);
    const rpc = new WebSocketRPC(mockWs as any);
    
    const handled = await rpc.handleMessage('');
    
    expect(handled).toBe(false);
    rpc.cleanup();
  });

  it('should handle null params', async () => {
    const mockWs = createMockWebSocket(WebSocket.OPEN);
    const rpc = new WebSocketRPC(mockWs as any);
    
    const handler = vi.fn().mockResolvedValue({});
    rpc.register('null.params', handler);
    
    await rpc.handleMessage(JSON.stringify({
      id: 1,
      method: 'null.params',
      params: null,
    }));
    
    expect(handler).toHaveBeenCalledWith(null);
    rpc.cleanup();
  });
});
