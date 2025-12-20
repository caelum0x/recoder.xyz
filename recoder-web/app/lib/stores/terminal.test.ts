import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TerminalStore } from './terminal';

// Mock ITerminal interface
class MockTerminal {
  public onDataCallback: ((data: string) => void) | null = null;
  public writtenData: string[] = [];

  write(data: string) {
    this.writtenData.push(data);
  }

  onData(callback: (data: string) => void) {
    this.onDataCallback = callback;
  }

  reset() {
    this.writtenData = [];
    this.onDataCallback = null;
  }
}

describe('TerminalStore', () => {
  let terminalStore: TerminalStore;
  let mockTerminal: MockTerminal;
  let mockWebSocket: any;

  beforeEach(() => {
    terminalStore = new TerminalStore();
    mockTerminal = new MockTerminal();

    // Mock WebSocket
    mockWebSocket = {
      readyState: 1, // OPEN
      send: vi.fn(),
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      binaryType: 'arraybuffer',
    };

    global.WebSocket = vi.fn(() => mockWebSocket) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Terminal Resize JSON Filter', () => {
    it('should filter out resize JSON echoes from terminal output', () => {
      terminalStore.setProjectId('test-project-123');
      terminalStore.setContainerReady();
      terminalStore.attachTerminal(mockTerminal as any);

      // Simulate resize JSON echo coming back from server
      const resizeMessage = '{"type":"resize","cols":84,"rows":9}';
      const messageEvent = { data: resizeMessage };

      // Trigger the onmessage handler
      if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage(messageEvent);
      }

      // Verify resize JSON was NOT written to terminal
      expect(mockTerminal.writtenData).toEqual([]);
    });

    it('should allow normal terminal output through', () => {
      terminalStore.setProjectId('test-project-123');
      terminalStore.setContainerReady();
      terminalStore.attachTerminal(mockTerminal as any);

      // Simulate normal terminal output
      const normalOutput = '$ npm install\ninstalling dependencies...';
      const messageEvent = { data: normalOutput };

      // Trigger the onmessage handler
      if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage(messageEvent);
      }

      // Verify normal output WAS written to terminal
      expect(mockTerminal.writtenData).toContain(normalOutput);
    });

    it('should handle ArrayBuffer messages', () => {
      terminalStore.setProjectId('test-project-123');
      terminalStore.setContainerReady();
      terminalStore.attachTerminal(mockTerminal as any);

      // Simulate binary data (ArrayBuffer)
      const binaryData = new TextEncoder().encode('binary output');
      const messageEvent = { data: binaryData.buffer };

      // Trigger the onmessage handler
      if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage(messageEvent);
      }

      // Verify binary data was decoded and written
      expect(mockTerminal.writtenData).toContain('binary output');
    });

    it('should filter resize JSON mixed with other text', () => {
      terminalStore.setProjectId('test-project-123');
      terminalStore.setContainerReady();
      terminalStore.attachTerminal(mockTerminal as any);

      // Simulate resize JSON embedded in output (edge case)
      const mixedMessage = '$ ls{"type":"resize","cols":84,"rows":9}';
      const messageEvent = { data: mixedMessage };

      // Trigger the onmessage handler
      if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage(messageEvent);
      }

      // Verify mixed message with resize JSON was filtered
      expect(mockTerminal.writtenData).toEqual([]);
    });

    it('should not filter legitimate JSON that is not resize', () => {
      terminalStore.setProjectId('test-project-123');
      terminalStore.setContainerReady();
      terminalStore.attachTerminal(mockTerminal as any);

      // Simulate legitimate JSON output (e.g., from a command)
      const jsonOutput = '{"status":"success","message":"Build complete"}';
      const messageEvent = { data: jsonOutput };

      // Trigger the onmessage handler
      if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage(messageEvent);
      }

      // Verify legitimate JSON WAS written to terminal
      expect(mockTerminal.writtenData).toContain(jsonOutput);
    });
  });

  describe('Terminal Resize Message Sending', () => {
    it('should send resize messages to backend', () => {
      terminalStore.setProjectId('test-project-123');
      terminalStore.setContainerReady();
      terminalStore.attachTerminal(mockTerminal as any);

      // Trigger resize
      terminalStore.onTerminalResize(120, 30);

      // Wait for debounce (100ms)
      vi.advanceTimersByTime(100);

      // Verify resize message was sent to WebSocket
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'resize', cols: 120, rows: 30 })
      );
    });

    it('should debounce rapid resize events', () => {
      vi.useFakeTimers();

      terminalStore.setProjectId('test-project-123');
      terminalStore.setContainerReady();
      terminalStore.attachTerminal(mockTerminal as any);

      // Trigger multiple rapid resizes
      terminalStore.onTerminalResize(80, 24);
      terminalStore.onTerminalResize(100, 30);
      terminalStore.onTerminalResize(120, 40);

      // Before debounce timeout - should not send
      expect(mockWebSocket.send).not.toHaveBeenCalled();

      // After debounce - should only send last resize
      vi.advanceTimersByTime(100);

      expect(mockWebSocket.send).toHaveBeenCalledTimes(1);
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'resize', cols: 120, rows: 40 })
      );

      vi.useRealTimers();
    });
  });

  describe('Container Ready State', () => {
    it('should not connect terminal before container is ready', () => {
      terminalStore.setProjectId('test-project-123');
      // Don't call setContainerReady()
      terminalStore.attachTerminal(mockTerminal as any);

      // WebSocket should not be created
      expect(global.WebSocket).not.toHaveBeenCalled();
    });

    it('should connect terminal when container becomes ready', () => {
      terminalStore.setProjectId('test-project-123');
      terminalStore.attachTerminal(mockTerminal as any);

      // Initially not connected
      expect(global.WebSocket).not.toHaveBeenCalled();

      // Mark container as ready
      terminalStore.setContainerReady();

      // Now WebSocket should be created
      expect(global.WebSocket).toHaveBeenCalled();
    });
  });
});
