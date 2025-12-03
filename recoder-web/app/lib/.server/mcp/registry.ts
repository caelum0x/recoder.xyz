/**
 * MCP Server Registry
 * Manages registration and lifecycle of MCP servers
 */

import type { MCPServer, MCPTool, MCPServerStatus } from './types';

export class MCPRegistry {
  private servers: Map<string, MCPServer> = new Map();
  private tools: Map<string, {tool: MCPTool, serverId: string}> = new Map();

  /**
   * Register a new MCP server (or update if already registered)
   */
  register(server: MCPServer): void {
    // Allow re-registration (for hot reload)
    if (this.servers.has(server.id)) {
      console.log(`🔄 Re-registering MCP server: ${server.name} (${server.id})`);
      // Remove old tools
      for (const tool of this.servers.get(server.id)!.tools) {
        const toolKey = `${server.id}:${tool.name}`;
        this.tools.delete(toolKey);
      }
    } else {
      console.log(`✅ Registered MCP server: ${server.name} (${server.id})`);
    }

    this.servers.set(server.id, server);

    // Register all tools from this server
    for (const tool of server.tools) {
      const toolKey = `${server.id}:${tool.name}`;
      this.tools.set(toolKey, { tool, serverId: server.id });
    }
  }

  /**
   * Unregister a server
   */
  unregister(serverId: string): void {
    const server = this.servers.get(serverId);
    
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    // Remove all tools from this server
    for (const tool of server.tools) {
      const toolKey = `${serverId}:${tool.name}`;
      this.tools.delete(toolKey);
    }

    this.servers.delete(serverId);
    console.log(`🗑️ Unregistered MCP server: ${server.name}`);
  }

  /**
   * Get a server by ID
   */
  get(serverId: string): MCPServer | undefined {
    return this.servers.get(serverId);
  }

  /**
   * Get all registered servers
   */
  getAll(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get only enabled servers
   */
  getEnabled(): MCPServer[] {
    return this.getAll().filter(server => server.enabled);
  }

  /**
   * Get a tool by name (searches all servers)
   */
  getTool(toolName: string): {tool: MCPTool, serverId: string} | undefined {
    // Try to find tool in any enabled server
    for (const [key, value] of this.tools.entries()) {
      const server = this.servers.get(value.serverId);
      if (server?.enabled && value.tool.name === toolName) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Get all tools from all enabled servers
   */
  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    
    for (const server of this.getEnabled()) {
      tools.push(...server.tools);
    }
    
    return tools;
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): MCPTool[] {
    return this.getAllTools().filter(tool => tool.category === category);
  }

  /**
   * Update server status
   */
  updateStatus(serverId: string, status: MCPServerStatus): void {
    const server = this.servers.get(serverId);
    
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    server.status = status;
    server.updatedAt = new Date();
  }

  /**
   * Enable/disable a server
   */
  toggleServer(serverId: string, enabled: boolean): void {
    const server = this.servers.get(serverId);
    
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    server.enabled = enabled;
    server.updatedAt = new Date();
    
    console.log(`${enabled ? '✅' : '❌'} Server ${server.name} ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      totalServers: this.servers.size,
      enabledServers: this.getEnabled().length,
      totalTools: this.tools.size,
      serversByCategory: this.getServersByCategory(),
    };
  }

  private getServersByCategory() {
    const categories: Record<string, number> = {};
    
    for (const tool of this.getAllTools()) {
      categories[tool.category] = (categories[tool.category] || 0) + 1;
    }
    
    return categories;
  }
}

// Global registry instance
export const mcpRegistry = new MCPRegistry();
