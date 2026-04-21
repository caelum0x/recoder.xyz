import { fetchUserByokProviderKeys, type AIProviderKeys } from '../public-api/byok-provider-keys.js';

const APP_API_URL = process.env.APP_API_URL || 'https://recoder.xyz';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY ?? '';

export async function getUserByokKeys(userId?: string): Promise<AIProviderKeys> {
  if (!userId) return {};
  if (!INTERNAL_SERVICE_KEY) {
    throw new Error('INTERNAL_SERVICE_KEY is not configured');
  }
  return fetchUserByokProviderKeys({
    appApiUrl: APP_API_URL,
    userId,
    serviceKey: INTERNAL_SERVICE_KEY,
  });
}

export async function getOpenRouterByokKey(userId?: string): Promise<string | null> {
  const keys = await getUserByokKeys(userId);
  return keys.openrouter ?? null;
}
