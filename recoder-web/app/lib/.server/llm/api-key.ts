import { getUserApiKey, getSessionCookie } from './user-api-key';

export interface APIKeyResult {
  key: string;
  source: 'user' | 'platform';
}

/**
 * Get API key for AI requests
 * Priority: user's BYOK key > platform OPENROUTER_API_KEY env var
 */
export async function getAPIKey(
  _cloudflareEnv: Env,
  request?: Request,
  provider: string = 'openrouter'
): Promise<string | null> {
  const result = await getAPIKeyWithSource(_cloudflareEnv, request, provider);
  return result?.key ?? null;
}

/**
 * Get API key with source info (user BYOK vs platform).
 * Platform key is restricted to free models only.
 */
export async function getAPIKeyWithSource(
  _cloudflareEnv: Env,
  request?: Request,
  provider: string = 'openrouter'
): Promise<APIKeyResult | null> {
  // Priority 1: User's own BYOK key
  if (request) {
    const sessionCookie = getSessionCookie(request);
    const userApiKey = await getUserApiKey(sessionCookie, provider);

    if (userApiKey) {
      return { key: userApiKey, source: 'user' };
    }
  }

  // Priority 2: Platform key from environment (free models only)
  if (provider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
    return { key: process.env.OPENROUTER_API_KEY, source: 'platform' };
  }

  return null;
}
