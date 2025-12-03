import { prisma } from '../prisma';
import { getLatestVersion, hasUpdateAvailable, getChangelog } from './versioning';
import type { MCPServerConfig } from './client';

export interface UpdateResult {
  serverId: string;
  success: boolean;
  oldVersion: string;
  newVersion: string;
  changelog: string[];
  error?: string;
}

export async function checkForUpdates(userId: string): Promise<Array<{
  serverId: string;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}>> {
  const servers = await prisma.mCPServer.findMany({
    where: { userId, enabled: true },
  });

  return servers.map((server) => {
    const config = server.config as any;
    const currentVersion = config?.version || '1.0.0';
    const latestVersion = getLatestVersion(server.serverId);

    return {
      serverId: server.serverId,
      currentVersion,
      latestVersion,
      updateAvailable: hasUpdateAvailable(currentVersion, latestVersion),
    };
  });
}

export async function updateServer(
  userId: string,
  serverId: string,
  targetVersion?: string
): Promise<UpdateResult> {
  try {
    const server = await prisma.mCPServer.findFirst({
      where: { userId, serverId },
    });

    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    const config = server.config as unknown as MCPServerConfig & { version?: string };
    const oldVersion = config.version || '1.0.0';
    const newVersion = targetVersion || getLatestVersion(serverId);

    // Update the server configuration
    const updatedConfig = {
      ...config,
      version: newVersion,
    };

    await prisma.mCPServer.update({
      where: { id: server.id },
      data: { config: updatedConfig as any },
    });

    const changelog = getChangelog(serverId, oldVersion, newVersion);

    return {
      serverId,
      success: true,
      oldVersion,
      newVersion,
      changelog,
    };
  } catch (error) {
    return {
      serverId,
      success: false,
      oldVersion: '1.0.0',
      newVersion: targetVersion || 'unknown',
      changelog: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function updateAllServers(userId: string): Promise<UpdateResult[]> {
  const updates = await checkForUpdates(userId);
  const results: UpdateResult[] = [];

  for (const update of updates) {
    if (update.updateAvailable) {
      const result = await updateServer(userId, update.serverId);
      results.push(result);
    }
  }

  return results;
}

export async function enableAutoUpdate(userId: string, serverId: string): Promise<void> {
  await prisma.mCPServer.updateMany({
    where: { userId, serverId },
    data: {
      config: {
        // Add auto-update flag to config
        autoUpdate: true,
      } as any,
    },
  });
}

export async function disableAutoUpdate(userId: string, serverId: string): Promise<void> {
  await prisma.mCPServer.updateMany({
    where: { userId, serverId },
    data: {
      config: {
        autoUpdate: false,
      } as any,
    },
  });
}

// Background job to check and apply updates
export async function runAutoUpdateJob(): Promise<void> {
  console.log('Running auto-update job...');

  const servers = await prisma.mCPServer.findMany({
    where: { enabled: true },
  });

  for (const server of servers) {
    const config = server.config as any;
    if (config.autoUpdate) {
      try {
        const result = await updateServer(server.userId, server.serverId);
        if (result.success) {
          console.log(`Updated ${server.serverId} to ${result.newVersion}`);
        }
      } catch (error) {
        console.error(`Failed to auto-update ${server.serverId}:`, error);
      }
    }
  }
}
