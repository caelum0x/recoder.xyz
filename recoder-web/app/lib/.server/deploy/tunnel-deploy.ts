/**
 * One-Click Deployment - Expose localhost to public URL
 * Uses Cloudflare Tunnel (cloudflared) for free, fast public URLs
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('TunnelDeploy');

export interface TunnelDeployment {
  id: string;
  projectId: string;
  publicUrl: string;
  localPort: number;
  status: 'starting' | 'active' | 'stopped' | 'error';
  createdAt: number;
  expiresAt?: number;
}

// In-memory store for active tunnels
const activeTunnels = new Map<string, TunnelDeployment>();

/**
 * Start a tunnel to expose a local port to the internet
 * Uses Cloudflare's free quick tunnel service
 */
export async function startTunnel(
  projectId: string,
  localPort: number,
  dockerBackendUrl: string,
  sessionToken?: string
): Promise<TunnelDeployment> {
  // Check if tunnel already exists
  const existing = activeTunnels.get(projectId);
  if (existing && existing.status === 'active') {
    return existing;
  }

  const tunnelId = `tunnel-${projectId}-${Date.now()}`;

  const deployment: TunnelDeployment = {
    id: tunnelId,
    projectId,
    publicUrl: '', // Will be set after tunnel starts
    localPort,
    status: 'starting',
    createdAt: Date.now(),
  };

  activeTunnels.set(projectId, deployment);

  try {
    // Build headers with optional authentication
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    // Call docker-backend to start the tunnel
    const response = await fetch(`${dockerBackendUrl}/api/tunnel/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId,
        localPort,
        useCloudflared: true,  // Request real cloudflared tunnel
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to start tunnel' })) as { error?: string };
      throw new Error(error.error || 'Failed to start tunnel');
    }

    const result = await response.json() as { url: string; expiresAt?: number; type?: string };

    deployment.publicUrl = result.url;
    deployment.status = 'active';
    deployment.expiresAt = result.expiresAt;

    logger.info(`[Tunnel] Started ${result.type || 'preview'} tunnel for ${projectId}: ${result.url}`);

    return deployment;
  } catch (error) {
    deployment.status = 'error';
    logger.error(`[Tunnel] Failed to start tunnel for ${projectId}:`, error);
    throw error;
  }
}

/**
 * Stop an active tunnel
 */
export async function stopTunnel(
  projectId: string,
  dockerBackendUrl: string,
  sessionToken?: string
): Promise<void> {
  const tunnel = activeTunnels.get(projectId);
  if (!tunnel) return;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    await fetch(`${dockerBackendUrl}/api/tunnel/stop`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId }),
    });

    tunnel.status = 'stopped';
    activeTunnels.delete(projectId);

    logger.info(`[Tunnel] Stopped tunnel for ${projectId}`);
  } catch (error) {
    logger.error(`[Tunnel] Failed to stop tunnel for ${projectId}:`, error);
  }
}

/**
 * Get tunnel status for a project
 */
export function getTunnelStatus(projectId: string): TunnelDeployment | null {
  return activeTunnels.get(projectId) || null;
}

/**
 * Get all active tunnels
 */
export function getAllTunnels(): TunnelDeployment[] {
  return Array.from(activeTunnels.values());
}
