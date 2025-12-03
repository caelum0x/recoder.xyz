import { MCPClient, type MCPServerConfig } from '../mcp/client';
import { getServerById, validateServerConfig, ALL_SERVERS } from '../mcp/registry';
import { prisma } from '../prisma';

const clients = new Map<string, MCPClient>();

function getUserClient(userId: string): MCPClient {
  if (!clients.has(userId)) {
    clients.set(userId, new MCPClient());
  }
  return clients.get(userId)!;
}

export async function getUserServers(userId: string) {
  return prisma.mCPServer.findMany({
    where: { userId, enabled: true },
    select: {
      id: true,
      serverId: true,
      name: true,
      enabled: true,
      config: true,
      createdAt: true,
    },
  });
}

export async function installServer(userId: string, serverId: string, config?: Partial<MCPServerConfig>) {
  const definition = getServerById(serverId);
  if (!definition) {
    throw new Error(`Server ${serverId} not found in registry`);
  }

  const serverConfig: MCPServerConfig = {
    id: definition.id,
    name: definition.name,
    command: definition.command,
    args: definition.args,
    env: { ...definition.env, ...config?.env },
  };

  const validation = validateServerConfig(serverConfig);
  if (!validation.valid) {
    throw new Error(`Invalid server configuration: ${validation.errors.join(', ')}`);
  }

  const existing = await prisma.mCPServer.findFirst({
    where: { userId, serverId },
  });

  if (existing) {
    return prisma.mCPServer.update({
      where: { id: existing.id },
      data: {
        config: serverConfig as any,
        enabled: true,
      },
    });
  }

  return prisma.mCPServer.create({
    data: {
      userId,
      serverId,
      name: definition.name,
      config: serverConfig as any,
      enabled: true,
    },
  });
}

export async function uninstallServer(userId: string, serverId: string) {
  const client = getUserClient(userId);
  if (client.isConnected(serverId)) {
    await client.disconnect(serverId);
  }

  await prisma.mCPServer.deleteMany({
    where: { userId, serverId },
  });
}

export async function enableServer(userId: string, serverId: string) {
  await prisma.mCPServer.updateMany({
    where: { userId, serverId },
    data: { enabled: true },
  });
}

export async function disableServer(userId: string, serverId: string) {
  const client = getUserClient(userId);
  if (client.isConnected(serverId)) {
    await client.disconnect(serverId);
  }

  await prisma.mCPServer.updateMany({
    where: { userId, serverId },
    data: { enabled: false },
  });
}

export async function connectServer(userId: string, serverId: string) {
  const server = await prisma.mCPServer.findFirst({
    where: { userId, serverId, enabled: true },
  });

  if (!server) {
    throw new Error(`Server ${serverId} not found or not enabled`);
  }

  const client = getUserClient(userId);
  if (client.isConnected(serverId)) {
    return { status: 'already_connected' };
  }

  await client.connect(server.config as unknown as MCPServerConfig);
  return { status: 'connected' };
}

export async function listTools(userId: string, serverId: string) {
  const client = getUserClient(userId);
  
  if (!client.isConnected(serverId)) {
    await connectServer(userId, serverId);
  }

  return client.listTools(serverId);
}

export async function callTool(userId: string, serverId: string, toolName: string, args: any) {
  const client = getUserClient(userId);
  
  if (!client.isConnected(serverId)) {
    await connectServer(userId, serverId);
  }

  return client.callTool(serverId, toolName, args);
}

export async function getServerHealth(userId: string, serverId: string) {
  const client = getUserClient(userId);
  const isConnected = client.isConnected(serverId);

  if (!isConnected) {
    return { status: 'disconnected', healthy: false };
  }

  try {
    await client.listTools(serverId);
    return { status: 'connected', healthy: true };
  } catch (error) {
    return { 
      status: 'error', 
      healthy: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

export async function getAllServersHealth(userId: string) {
  const servers = await getUserServers(userId);
  const healthChecks = await Promise.all(
    servers.map(async (server) => ({
      serverId: server.serverId,
      name: server.name,
      ...(await getServerHealth(userId, server.serverId)),
    }))
  );

  return healthChecks;
}

export function getAvailableServers() {
  return ALL_SERVERS.map((server) => ({
    id: server.id,
    name: server.name,
    description: server.description,
    category: server.category,
    requiresAuth: server.requiresAuth,
    envVars: server.envVars,
  }));
}

export async function disconnectAllServers(userId: string) {
  const client = getUserClient(userId);
  await client.disconnectAll();
  clients.delete(userId);
}
