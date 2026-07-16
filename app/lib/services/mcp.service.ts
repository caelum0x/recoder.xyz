import { MCPClient, type MCPServerConfig } from '../mcp/client';
import { validateServerConfig, ALL_SERVERS, buildServerConfig } from '../mcp/registry';
import { assertMcpRuntimeEnabled } from '../mcp/runtime';
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
  assertMcpRuntimeEnabled();
  const serverConfig = buildServerConfig(serverId, config);

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
      name: serverConfig.name,
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
  assertMcpRuntimeEnabled();
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

  const safeConfig = buildServerConfig(server.serverId, server.config as Partial<MCPServerConfig> | null);
  await client.connect(safeConfig);
  return { status: 'connected' };
}

export async function listTools(userId: string, serverId: string) {
  assertMcpRuntimeEnabled();
  const client = getUserClient(userId);
  
  if (!client.isConnected(serverId)) {
    await connectServer(userId, serverId);
  }

  return client.listTools(serverId);
}

export async function callTool(userId: string, serverId: string, toolName: string, args: any) {
  assertMcpRuntimeEnabled();
  const client = getUserClient(userId);
  
  if (!client.isConnected(serverId)) {
    await connectServer(userId, serverId);
  }

  return client.callTool(serverId, toolName, args);
}

export async function getServerHealth(userId: string, serverId: string) {
  assertMcpRuntimeEnabled();
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
  assertMcpRuntimeEnabled();
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
