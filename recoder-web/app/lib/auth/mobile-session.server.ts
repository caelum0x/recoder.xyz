/**
 * Mobile Session Verifier
 *
 * Verifies mobile Bearer tokens against docker-backend's
 * mobile session validation endpoint.
 *
 * Used as a fallback when cookie-based verifySession() returns null,
 * allowing mobile clients to authenticate with the public API proxy routes.
 */

import { getDockerBackendUrl } from '~/lib/http/docker-server';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('MobileSession');

export interface MobileSessionUser {
  id: string;
}

export interface MobileSessionResult {
  user: MobileSessionUser;
  deviceId: string;
}

/**
 * Extract a Bearer token from the Authorization header.
 */
function extractBearerToken(request: Request): string | null {
  const authHeader = request?.headers?.get?.('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/**
 * Verify a mobile session by calling docker-backend's
 * POST /api/mobile/session/validate endpoint.
 *
 * Returns the user info and deviceId if the token is valid, or null otherwise.
 */
export async function verifyMobileSession(
  request: Request,
  context?: unknown,
): Promise<MobileSessionResult | null> {
  const token = extractBearerToken(request);
  if (!token) {
    return null;
  }

  try {
    const backendUrl = getDockerBackendUrl(context);
    const response = await fetch(`${backendUrl}/api/mobile/session/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as {
      valid?: boolean;
      userId?: string;
      deviceId?: string;
    };

    if (!data.valid || !data.userId) {
      return null;
    }

    return {
      user: { id: data.userId },
      deviceId: data.deviceId || '',
    };
  } catch (error) {
    logger.error('[MobileSession] Error verifying mobile session:', error);
    return null;
  }
}
