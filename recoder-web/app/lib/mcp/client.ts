import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class MCPClient {
  private clients = new Map<string, Client>();

  async connect(config: MCPServerConfig) {
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
  }

  async listTools(serverId: string) {
    const client = this.clients.get(serverId);
    if (!client) throw new Error('Server not connected');
    const response = await client.request({ method: 'tools/list' }, {} as any);
    return response.tools || [];
  }

  async callTool(serverId: string, name: string, args: any) {
    const client = this.clients.get(serverId);
    if (!client) throw new Error('Server not connected');
    const response = await client.request({
      method: 'tools/call',
      params: { name, arguments: args },
    }, {} as any);
    return response.content;
  }

  async disconnect(serverId: string) {
    const client = this.clients.get(serverId);
    if (client) {
      await client.close();
      this.clients.delete(serverId);
    }
  }
}
