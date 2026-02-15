/**
 * User API Key Service
 * Fetches user's AI provider API keys from main app
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('UserAPIKey');

const MAIN_APP_URL = process.env.MAIN_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface UserApiKeyResponse {
  success: boolean;
  provider?: string;
  apiKey?: string;
  error?: string;
}

/**
 * Fetch user's API key for a specific provider
 * @param sessionCookie - User's session cookie from request
 * @param provider - AI provider (openrouter, anthropic, openai, groq)
 * @returns Decrypted API key or null
 */
export async function getUserApiKey(
  sessionCookie: string | null,
  provider: string = 'openrouter'
): Promise<string | null> {
  if (!sessionCookie) {
    return null;
  }

  try {
    const mainAppUrl = process.env.APP_API_URL || MAIN_APP_URL;
    const requestUrl = `${mainAppUrl}/api/user/ai-provider-keys/decrypt?provider=${encodeURIComponent(provider)}`;

    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      cache: 'no-store',
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      logger.error(`[getUserApiKey] Failed to fetch API key for ${provider}: ${response.status}`);
      return null;
    }

    const data = await response.json() as UserApiKeyResponse;

    if (data.success && data.apiKey) {
      return data.apiKey;
    }

    return null;
  } catch (error) {
    logger.error('[getUserApiKey] Error fetching user API key:', error);
    return null;
  }
}

/**
 * Check if user has configured any API key
 * @param sessionCookie - User's session cookie from request
 * @returns true if user has at least one active API key
 */
export async function hasUserApiKey(sessionCookie: string | null): Promise<boolean> {
  if (!sessionCookie) {
    return false;
  }

  try {
    const url = `${MAIN_APP_URL}/api/user/ai-provider-keys`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json() as { success?: boolean; keys?: any[] };

    return !!(data.success && data.keys && data.keys.length > 0);
  } catch (error) {
    logger.error('[hasUserApiKey] Error checking API keys:', error);
    return false;
  }
}

/**
 * Get session cookie from request
 * @param request - Remix request object
 * @returns Session cookie string or null
 */
export function getSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');

  if (!cookieHeader) {
    return null;
  }

  return cookieHeader;
}
