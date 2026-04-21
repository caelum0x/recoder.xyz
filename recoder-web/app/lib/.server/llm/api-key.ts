import { getUserApiKey, getSessionCookie } from './user-api-key';

export interface APIKeyResult {
  key: string;
  source: 'user';
}

/**
 * Get API key for AI requests
 * BYOK-only: requests must use the user's configured provider key.
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
 * Get API key with source info (user BYOK only).
 */
export async function getAPIKeyWithSource(
  _cloudflareEnv: Env,
  request?: Request,
  provider: string = 'openrouter'
): Promise<APIKeyResult | null> {
  if (request) {
    try {
      const sessionCookie = getSessionCookie(request);
      const userApiKey = await getUserApiKey(sessionCookie, provider);

      if (userApiKey) {
        return { key: userApiKey, source: 'user' };
      }
    } catch {
      return null;
    }
  }

  return null;
}
