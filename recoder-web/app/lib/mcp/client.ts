import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  serverId: string;
}

export class MCPClient {
  private clients = new Map<string, Client>();
  private tools = new Map<string, MCPTool>();
  private serverTools = new Map<string, MCPTool[]>();

  async connect(config: MCPServerConfig): Promise<MCPTool[]> {
    if (!config.enabled) return [];
    
    try {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env,
      });

      const client = new Client({
        name: 'recoder-web',
        version: '1.0.0',
      }, {
        capabilities: {},
      });

      await client.connect(transport);
      this.clients.set(config.id, client);

      // Discover tools
      const response = await client.request({ method: 'tools/list' }, {} as any);
      const serverTools: MCPTool[] = (response.tools || []).map((tool: any) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema,
        serverId: config.id,
      }));

      // Register tools
      serverTools.forEach(tool => {
        this.tools.set(`${config.id}:${tool.name}`, tool);
      });
      this.serverTools.set(config.id, serverTools);

      console.log(`✅ MCP: Connected to ${config.name} with ${serverTools.length} tools`);
      return serverTools;
    } catch (err: any) {
      console.error(`❌ MCP: Failed to connect to ${config.name}:`, err.message);
      return [];
    }
  }

  async connectAll(configs: MCPServerConfig[]): Promise<MCPTool[]> {
    const results = await Promise.all(configs.map(c => this.connect(c)));
    return results.flat();
  }

  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  getToolsForServer(serverId: string): MCPTool[] {
    return this.serverTools.get(serverId) || [];
  }

  // Format tools for AI (OpenAI/Anthropic format)
  getToolsForAI(): any[] {
    return this.getAllTools().map(tool => ({
      type: 'function',
      function: {
        name: `${tool.serverId}__${tool.name}`,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  // Get tools description for system prompt
  getToolsPrompt(): string {
    const tools = this.getAllTools();
    if (tools.length === 0) return '';

    return `
## Available MCP Tools
You have access to these tools via MCP servers:

${tools.map(t => `- **${t.name}** (${t.serverId}): ${t.description}`).join('\n')}

To use a tool, respond with a tool_use block specifying the tool name and arguments.
`;
  }

  async callTool(toolName: string, args: any): Promise<any> {
    // Parse serverId__toolName format
    const [serverId, name] = toolName.includes('__') 
      ? toolName.split('__', 2) 
      : [null, toolName];

    // Find the tool
    let tool: MCPTool | undefined;
    if (serverId) {
      tool = this.tools.get(`${serverId}:${name}`);
    } else {
      // Search all servers
      tool = Array.from(this.tools.values()).find(t => t.name === name);
    }

    if (!tool) throw new Error(`Tool not found: ${toolName}`);

    const client = this.clients.get(tool.serverId);
    if (!client) throw new Error(`Server not connected: ${tool.serverId}`);

    const response = await client.request({
      method: 'tools/call',
      params: { name: tool.name, arguments: args },
    }, {} as any);

    return response.content;
  }

  async disconnect(serverId: string) {
    const client = this.clients.get(serverId);
    if (client) {
      await client.close();
      this.clients.delete(serverId);
      
      // Remove tools
      const tools = this.serverTools.get(serverId) || [];
      tools.forEach(t => this.tools.delete(`${serverId}:${t.name}`));
      this.serverTools.delete(serverId);
    }
  }

  async disconnectAll() {
    const serverIds = Array.from(this.clients.keys());
    await Promise.all(serverIds.map(id => this.disconnect(id)));
  }

  isConnected(serverId: string): boolean {
    return this.clients.has(serverId);
  }

  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }
}

// Singleton instance
export const mcpClient = new MCPClient();
