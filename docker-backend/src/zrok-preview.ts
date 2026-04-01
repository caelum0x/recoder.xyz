/**
 * @module zrok-preview
 *
 * Manages Zrok tunnel shares for instant sandbox preview URLs.
 *
 * Replaces the 30-second health check polling loop with instant tunnel URLs.
 * Each sandbox gets a Zrok share that tunnels directly to the Vite dev server.
 *
 * Lifecycle:
 *   Container create → createPreviewShare() → Zrok public share on port 5173
 *   Container delete → destroyPreviewShare() → Zrok share unregistered
 *   Publish          → reservePreviewShare() → permanent {projectId}.preview.recoder.xyz
 *
 * Configuration:
 *   ZROK_API_URL    — Zrok controller URL (default: http://zrok-controller:18080)
 *   ZROK_TOKEN      — Zrok environment token for the docker-backend identity
 *   ZROK_FRONTEND   — Public frontend URL base (default: preview.recoder.xyz)
 *
 * Falls back gracefully to Daytona preview URLs if Zrok is not configured.
 */

import { logger } from './logger.js';

const ZROK_API_URL = process.env.ZROK_API_URL ?? 'http://zrok-controller:18080';
const ZROK_TOKEN = process.env.ZROK_TOKEN ?? '';
const ZROK_FRONTEND = process.env.ZROK_FRONTEND ?? 'preview.recoder.xyz';

interface ZrokShare {
  shareToken: string;
  frontendEndpoint: string;
  backendTarget: string;
  reserved: boolean;
  createdAt: string;
}

// Active shares: projectId → share info
const activeShares = new Map<string, ZrokShare>();

function isZrokConfigured(): boolean {
  return Boolean(ZROK_TOKEN);
}

async function zrokApi<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${ZROK_API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(ZROK_TOKEN ? { 'x-token': ZROK_TOKEN } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zrok ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a public Zrok share for a sandbox's dev server port.
 * Returns the public URL that can be used in iframes immediately.
 *
 * The share tunnels traffic from {token}.{ZROK_FRONTEND} → sandbox:targetPort.
 * Vite HMR WebSockets work natively through the tunnel.
 *
 * @param sandboxId   Daytona sandbox ID
 * @param projectId   Project identifier (used as share token for permanent URLs)
 * @param targetPort  Port to tunnel (default: 5173 for Vite)
 * @param sandboxHost Internal hostname/IP of the sandbox (for Docker network routing)
 */
export async function createPreviewShare(params: {
  sandboxId: string;
  projectId: string;
  targetPort?: number;
  sandboxHost?: string;
}): Promise<{ previewUrl: string; shareToken: string } | null> {
  if (!isZrokConfigured()) {
    logger.debug('[zrok] Not configured — skipping share creation');
    return null;
  }

  const { sandboxId, projectId, targetPort = 5173, sandboxHost } = params;
  // Prefer sandbox hostname on Docker network, fall back to sandbox ID
  const backendTarget = sandboxHost
    ? `http://${sandboxHost}:${targetPort}`
    : `http://${sandboxId}:${targetPort}`;

  // Use project ID as the share token for human-readable URLs
  const sanitizedToken = projectId
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .slice(0, 32)
    .toLowerCase();

  try {
    const shareResult = await zrokApi<{ token: string; frontendEndpoint?: string }>('POST', '/api/v1/share', {
      envZId: ZROK_TOKEN,
      shareMode: 'public',
      backendMode: 'proxy',
      frontendSelection: [ZROK_FRONTEND],
      backendProxyEndpoint: backendTarget,
      reserved: false,
      uniqueName: sanitizedToken,
    });

    const shareToken = shareResult.token;
    const frontendEndpoint = shareResult.frontendEndpoint
      ?? `https://${shareToken}.${ZROK_FRONTEND}`;

    const share: ZrokShare = {
      shareToken,
      frontendEndpoint,
      backendTarget,
      reserved: false,
      createdAt: new Date().toISOString(),
    };

    activeShares.set(projectId, share);

    logger.info({ projectId, shareToken, frontendEndpoint, backendTarget }, '[zrok] Preview share created');

    return { previewUrl: frontendEndpoint, shareToken };
  } catch (err) {
    logger.warn({ err, projectId }, '[zrok] Failed to create share — falling back to Daytona preview');
    return null;
  }
}

/**
 * Promote a share to reserved (permanent) for publishing.
 * The URL {projectId}.preview.recoder.xyz survives sandbox stop/start.
 *
 * This is the Zrok "Frontdoor" equivalent — the share stays alive
 * even when the backend sandbox is stopped, and reconnects automatically.
 */
export async function reservePreviewShare(projectId: string): Promise<{ previewUrl: string } | null> {
  if (!isZrokConfigured()) return null;

  const existing = activeShares.get(projectId);
  if (!existing) {
    logger.warn({ projectId }, '[zrok] No active share to reserve');
    return null;
  }

  if (existing.reserved) {
    return { previewUrl: existing.frontendEndpoint };
  }

  try {
    await zrokApi('POST', '/api/v1/share/reserve', {
      envZId: ZROK_TOKEN,
      token: existing.shareToken,
    });

    existing.reserved = true;
    activeShares.set(projectId, existing);

    logger.info({ projectId, shareToken: existing.shareToken }, '[zrok] Share reserved (permanent)');
    return { previewUrl: existing.frontendEndpoint };
  } catch (err) {
    logger.warn({ err, projectId }, '[zrok] Failed to reserve share');
    return null;
  }
}

/**
 * Destroy a Zrok share (call on container delete).
 * Reserved shares are unshared via the release API.
 */
export async function destroyPreviewShare(projectId: string): Promise<void> {
  const existing = activeShares.get(projectId);
  if (!existing) return;

  try {
    if (existing.reserved) {
      await zrokApi('DELETE', `/api/v1/share/reserved/${existing.shareToken}`, {
        envZId: ZROK_TOKEN,
      });
    } else {
      await zrokApi('DELETE', `/api/v1/share/${existing.shareToken}`, {
        envZId: ZROK_TOKEN,
      });
    }

    logger.info({ projectId, shareToken: existing.shareToken }, '[zrok] Preview share destroyed');
  } catch (err) {
    logger.warn({ err, projectId }, '[zrok] Failed to destroy share (may already be gone)');
  }

  activeShares.delete(projectId);
}

/**
 * Get the current Zrok preview URL for a project (if one exists).
 */
export function getPreviewUrl(projectId: string): string | null {
  return activeShares.get(projectId)?.frontendEndpoint ?? null;
}

/**
 * Update the backend target port for an existing share.
 * Call this when dev server starts on a different port than default 5173.
 */
export async function updateShareTarget(projectId: string, newPort: number): Promise<boolean> {
  const existing = activeShares.get(projectId);
  if (!existing || !isZrokConfigured()) return false;

  const newTarget = existing.backendTarget.replace(/:\d+$/, `:${newPort}`);

  try {
    await zrokApi('PATCH', `/api/v1/share/${existing.shareToken}`, {
      backendProxyEndpoint: newTarget,
    });
    existing.backendTarget = newTarget;
    activeShares.set(projectId, existing);
    logger.info({ projectId, newPort }, '[zrok] Share target updated');
    return true;
  } catch (err) {
    logger.warn({ err, projectId, newPort }, '[zrok] Failed to update share target');
    return false;
  }
}

/**
 * Stats for health/debug endpoints.
 */
export function zrokStats(): { configured: boolean; activeShares: number; reservedShares: number } {
  let reserved = 0;
  for (const s of activeShares.values()) {
    if (s.reserved) reserved++;
  }
  return { configured: isZrokConfigured(), activeShares: activeShares.size, reservedShares: reserved };
}
