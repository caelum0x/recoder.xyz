import { getUserApiKey, getSessionCookie } from './user-api-key';

// CRITICAL: Access real Node.js env vars at runtime, not build time.
// Vite's node-polyfills plugin replaces ALL `process` references with a shim
// that has empty env. We use a dynamic property access on globalThis to bypass.
function getEnv(): Record<string, string | undefined> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  return g['process']?.env || {};
}

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
  const env = getEnv();
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
