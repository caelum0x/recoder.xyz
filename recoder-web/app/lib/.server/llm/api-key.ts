import { getUserApiKey, getSessionCookie } from './user-api-key';

/**
 * Get API key for AI requests
 * BYOK Only - Users must provide their own API keys
 */
export async function getAPIKey(
  _cloudflareEnv: Env,
  request?: Request,
  provider: string = 'openrouter'
): Promise<string | null> {
  // BYOK: Only use user's API key
  if (request) {
    const sessionCookie = getSessionCookie(request);
    const userApiKey = await getUserApiKey(sessionCookie, provider);

    if (userApiKey) {
      return userApiKey;
    }
  }

  return null;
}
