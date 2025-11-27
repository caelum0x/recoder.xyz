import { env } from 'node:process';
import { getUserApiKey, getSessionCookie } from './user-api-key';

/**
 * Get API key for AI requests
 * Priority: User's BYOK > Environment variables
 */
export async function getAPIKey(
  cloudflareEnv: Env,
  request?: Request,
  provider: string = 'openrouter'
): Promise<string | null> {
  // PRIORITY 1: Try to get user's own API key (BYOK)
  if (request) {
    const sessionCookie = getSessionCookie(request);
    const userApiKey = await getUserApiKey(sessionCookie, provider);

    if (userApiKey) {
      console.log(`[getAPIKey] Using user's ${provider} API key`);
      return userApiKey;
    }
  }

  // PRIORITY 2: Fall back to environment variables (for testing/admin)
  const envKey = getEnvApiKey(provider, cloudflareEnv);

  if (envKey) {
    console.log(`[getAPIKey] Using environment ${provider} API key`);
    return envKey;
  }

  console.warn(`[getAPIKey] No API key available for provider: ${provider}`);
  return null;
}

/**
 * Get API key from environment variables
 */
function getEnvApiKey(provider: string, cloudflareEnv: Env): string | null {
  switch (provider.toLowerCase()) {
    case 'openrouter':
      return env.OPENROUTER_API_KEY || cloudflareEnv?.OPENROUTER_API_KEY || null;

    case 'anthropic':
      return env.ANTHROPIC_API_KEY || cloudflareEnv?.ANTHROPIC_API_KEY || null;

    case 'openai':
      return env.OPENAI_API_KEY || cloudflareEnv?.OPENAI_API_KEY || null;

    case 'groq':
      return env.GROQ_API_KEY || cloudflareEnv?.GROQ_API_KEY || null;

    case 'google':
      return env.GOOGLE_API_KEY || cloudflareEnv?.GOOGLE_API_KEY || null;

    default:
      return null;
  }
}
