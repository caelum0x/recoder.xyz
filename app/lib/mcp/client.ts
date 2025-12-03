import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: any;
}

export interface MCPToolResult {
  result?: any;
  error?: string;
  isError?: boolean;
}

export class MCPClient {
  private clients = new Map<string, Client>();
  private transports = new Map<string, Transport>();

  async connect(config: MCPServerConfig): Promise<void> {
    try {
      // Create stdio transport for the MCP server
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...process.env, ...config.env },
      });

      // Create MCP client
      const client = new Client(
        {
          name: 'recoder-app',
          version: '1.0.0',
        },
        {
          capabilities: {}
        }
      );

      // Connect the client
      await client.connect(transport);

      // Store client and transport
      this.clients.set(config.id, client);
      this.transports.set(config.id, transport);
    } catch (error) {
      console.error(`Failed to connect to MCP server ${config.id}:`, error);
      throw new Error(`Failed to connect to MCP server: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async listTools(serverId: string): Promise<MCPTool[]> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`No client found for server: ${serverId}`);
    }

    try {
      const response = await client.listTools();
      return response.tools?.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })) || [];
    } catch (error) {
      console.error(`Failed to list tools for server ${serverId}:`, error);
      throw new Error(`Failed to list tools: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async callTool(serverId: string, name: string, args: any): Promise<MCPToolResult> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`No client found for server: ${serverId}`);
    }

    try {
      const response = await client.callTool({
        name,
        arguments: args || {},
      });

      return {
        result: response.content,
        isError: false,
      };
    } catch (error) {
      console.error(`Failed to call tool ${name} on server ${serverId}:`, error);
      return {
        error: error instanceof Error ? error.message : String(error),
        isError: true,
      };
    }
  }

  async listPrompts(serverId: string) {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`No client found for server: ${serverId}`);
    }

    try {
      const response = await client.listPrompts();
      return response.prompts || [];
    } catch (error) {
      console.error(`Failed to list prompts for server ${serverId}:`, error);
      throw new Error(`Failed to list prompts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getPrompt(serverId: string, name: string, args?: any) {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`No client found for server: ${serverId}`);
    }

    try {
      const response = await client.getPrompt({
        name,
        arguments: args || {},
      });
      return response;
    } catch (error) {
      console.error(`Failed to get prompt ${name} from server ${serverId}:`, error);
      throw new Error(`Failed to get prompt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    const transport = this.transports.get(serverId);

    if (client) {
      try {
        await client.close();
      } catch (error) {
        console.error(`Error closing client for server ${serverId}:`, error);
      }
      this.clients.delete(serverId);
    }

    if (transport) {
      try {
        await transport.close();
      } catch (error) {
        console.error(`Error closing transport for server ${serverId}:`, error);
      }
      this.transports.delete(serverId);
    }
  }

  async disconnectAll(): Promise<void> {
    const serverIds = Array.from(this.clients.keys());
    const disconnectPromises: Promise<void>[] = [];
    
    for (const serverId of serverIds) {
      disconnectPromises.push(this.disconnect(serverId));
    }

    await Promise.allSettled(disconnectPromises);
  }

  isConnected(serverId: string): boolean {
    return this.clients.has(serverId);
  }

  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }
}
