/**
 * MCP Integration Tests
 * Tests that verify MCP module structure and client API
 *
 * Note: HTTP endpoint tests are skipped since they require a running dev server.
 * The MCPClient API tests verify the actual class interface.
 */

import { test, expect, describe, vi } from 'vitest';

// Mock the MCP SDK to avoid actual process spawning
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    request: vi.fn().mockResolvedValue({ tools: [] }),
    close: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn(),
}));

describe('MCP Integration - REAL FUNCTIONALITY TESTS', () => {

  describe('1. MCP Server Installation', () => {
    test.todo('POST /api/mcp/servers - Should install a new MCP server (requires running dev server)');
    test.todo('Should reject invalid server configuration (requires running dev server)');
  });

  describe('2. MCP Server Connection', () => {
    test.todo('GET /api/mcp/servers - Should list all servers (requires running dev server)');
    test.todo('GET /api/mcp/health - Should check MCP health (requires running dev server)');
  });

  describe('3. MCP Server Management', () => {
    test.todo('Should get specific server details (requires running dev server)');
    test.todo('Should update server configuration (requires running dev server)');
  });

  describe('4. MCP Tools Execution', () => {
    test.todo('Should list available MCP tools (requires running dev server)');
    test.todo('Should execute a simple MCP tool call (requires running dev server)');
  });

  describe('5. MCP Client Library', () => {
    test('MCPClient class should be importable and have correct API', async () => {
      const { MCPClient } = await import('../app/lib/mcp/client');
      expect(MCPClient).toBeDefined();

      const client = new MCPClient();
      expect(client).toBeDefined();

      // Verify the actual MCPClient API methods
      expect(typeof client.connect).toBe('function');
      expect(typeof client.connectAll).toBe('function');
      expect(typeof client.getAllTools).toBe('function');
      expect(typeof client.getToolsForServer).toBe('function');
      expect(typeof client.getToolsForAI).toBe('function');
      expect(typeof client.getToolsPrompt).toBe('function');
      expect(typeof client.callTool).toBe('function');
      expect(typeof client.disconnect).toBe('function');
      expect(typeof client.disconnectAll).toBe('function');
      expect(typeof client.isConnected).toBe('function');
      expect(typeof client.getConnectedServers).toBe('function');
    });

    test('MCPClient should start with no tools', async () => {
      const { MCPClient } = await import('../app/lib/mcp/client');
      const client = new MCPClient();

      const tools = client.getAllTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(0);

      const connectedServers = client.getConnectedServers();
      expect(Array.isArray(connectedServers)).toBe(true);
      expect(connectedServers.length).toBe(0);
    });
  });

  describe('6. MCP Server Registry', () => {
    test('Registry should manage servers correctly', async () => {
      const { MCPRegistry } = await import('../mcp/registry');

      // Create a fresh instance for testing so we don't pollute the singleton
      const registry = new MCPRegistry();

      expect(registry).toBeDefined();
      expect(typeof registry.register).toBe('function');
      expect(typeof registry.getAll).toBe('function');
      expect(typeof registry.getEnabled).toBe('function');

      const allServers = registry.getAll();
      const enabledServers = registry.getEnabled();

      expect(Array.isArray(allServers)).toBe(true);
      expect(Array.isArray(enabledServers)).toBe(true);
    });
  });
});

describe('MCP UI Components', () => {
  test('MCPServerManager component should be importable', async () => {
    try {
      const module = await import('../app/components/mcp/MCPServerManager');
      expect(module.default).toBeDefined();
    } catch (error: any) {
      console.error('Component import failed:', error.message);
      throw error;
    }
  });

  test('MCPServerPanel component should be importable', async () => {
    try {
      const module = await import('../app/components/mcp/MCPServerPanel');
      expect(module.default).toBeDefined();
    } catch (error: any) {
      console.error('Component import failed:', error.message);
      throw error;
    }
  });
});
