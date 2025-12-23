/**
 * User API Key Service
 * Fetches user's AI provider API keys from main app
 */

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
    console.warn('[getUserApiKey] No session cookie provided');
    return null;
  }

  try {
    const url = `${MAIN_APP_URL}/api/user/ai-provider-keys/decrypt?provider=${provider}`;

    console.log(`[getUserApiKey] Fetching API key for provider: ${provider}`);
    console.log(`[getUserApiKey] Main app URL: ${MAIN_APP_URL}`);
    console.log(`[getUserApiKey] Cookie present: ${sessionCookie.length} chars`);
    console.log(`[getUserApiKey] Cookie preview: ${sessionCookie.substring(0, 100)}...`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    console.log(`[getUserApiKey] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[getUserApiKey] Error response: ${errorText}`);
      
      if (response.status === 404) {
        console.warn(`[getUserApiKey] No API key found for provider: ${provider}`);
        return null;
      }

      console.error(`[getUserApiKey] Failed to fetch API key: ${response.status}`);
      return null;
    }

    const data: UserApiKeyResponse = await response.json();

    if (data.success && data.apiKey) {
      console.log(`[getUserApiKey] Successfully fetched API key for ${provider}`);
      return data.apiKey;
    }

    console.warn(`[getUserApiKey] Response success but no apiKey:`, data);
    return null;
  } catch (error) {
    console.error('[getUserApiKey] Error fetching user API key:', error);
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

    const data = await response.json();

    return data.success && data.keys && data.keys.length > 0;
  } catch (error) {
    console.error('[hasUserApiKey] Error checking API keys:', error);
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
