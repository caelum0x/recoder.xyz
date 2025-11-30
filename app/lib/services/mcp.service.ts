import { prisma } from '../prisma';
import { MCPClient, type MCPServerConfig } from '../mcp/client';

const clients = new Map<string, MCPClient>();

export async function getUserServers(userId: string) {
  return prisma.mCPServer.findMany({
    where: { userId, enabled: true },
  });
}

export async function addServer(userId: string, config: MCPServerConfig) {
  return prisma.mCPServer.create({
    data: {
      userId,
      serverId: config.id,
      name: config.name,
      command: config.command,
      args: config.args,
      env: config.env || {},
      enabled: true,
    },
  });
}

export async function removeServer(userId: string, serverId: string) {
  const client = clients.get(`${userId}:${serverId}`);
  if (client) {
    await client.disconnect(serverId);
    clients.delete(`${userId}:${serverId}`);
  }
  return prisma.mCPServer.delete({
    where: { userId_serverId: { userId, serverId } },
  });
}

export async function getClient(userId: string, serverId: string) {
  const key = `${userId}:${serverId}`;
  let client = clients.get(key);
  
  if (!client) {
    const server = await prisma.mCPServer.findUnique({
      where: { userId_serverId: { userId, serverId } },
    });
    
    if (!server || !server.enabled) {
      throw new Error('Server not found or disabled');
    }
    
    client = new MCPClient();
    await client.connect({
      id: server.serverId,
      name: server.name,
      command: server.command,
      args: server.args as string[],
      env: server.env as Record<string, string>,
    });
    
    clients.set(key, client);
  }
  
  return client;
}

export async function listTools(userId: string, serverId: string) {
  const client = await getClient(userId, serverId);
  return client.listTools(serverId);
}

export async function callTool(userId: string, serverId: string, toolName: string, args: any) {
  const client = await getClient(userId, serverId);
  const result = await client.callTool(serverId, toolName, args);
  
  await prisma.mCPToolCall.create({
    data: {
      userId,
      serverId,
      toolName,
      params: args,
      result: result as any, // Cast to any for JSON storage
    },
  });
  
  return result;
}
