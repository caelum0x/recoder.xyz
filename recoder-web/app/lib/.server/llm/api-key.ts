import { getUserApiKey, getSessionCookie } from './user-api-key';

// CRITICAL: Use globalThis.process.env to get real Node.js env vars.
// Vite replaces `import from 'node:process'` with its polyfill shim,
// which has an empty env object and breaks platform key fallback.
const env = globalThis.process?.env || {};

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
    try {
      const sessionCookie = getSessionCookie(request);
      const userApiKey = await getUserApiKey(sessionCookie, provider);

      if (userApiKey) {
        return { key: userApiKey, source: 'user' };
      }
    } catch {
      // Non-fatal: user key fetch failed, fall through to platform key
    }
  }

  // Priority 2: Platform key from environment
  if (env.OPENROUTER_API_KEY) {
    return { key: env.OPENROUTER_API_KEY, source: 'platform' };
  }

  // Priority 3: Any provider-specific key from environment
  const envKeyMap: Record<string, string> = {
    openrouter: 'OPENROUTER_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    groq: 'GROQ_API_KEY',
  };
  const envKey = envKeyMap[provider];
  if (envKey && env[envKey]) {
    return { key: env[envKey]!, source: 'platform' };
  }

  return null;
}
