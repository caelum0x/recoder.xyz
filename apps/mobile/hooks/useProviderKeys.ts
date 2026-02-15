import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL, getAuthHeaders } from '@/api/config';
import { parseProviderKeysResponse } from '@/lib/auth/contracts';
import { log } from '@/lib/logger';

export interface ProviderKey {
  provider: string;
  label: string;
  hasKey: boolean;
  maskedKey?: string;
}

const SUPPORTED_PROVIDERS = [
  { provider: 'openrouter', label: 'OpenRouter', prefix: 'sk-or-' },
  { provider: 'openai', label: 'OpenAI', prefix: 'sk-' },
  { provider: 'anthropic', label: 'Anthropic', prefix: 'sk-ant-' },
  { provider: 'google', label: 'Google AI', prefix: 'AI' },
  { provider: 'groq', label: 'Groq', prefix: 'gsk_' },
  { provider: 'deepseek', label: 'DeepSeek', prefix: 'sk-' },
] as const;

export const providerKeyKeys = {
  all: ['provider-keys'] as const,
  list: () => [...providerKeyKeys.all, 'list'] as const,
};

async function fetchProviderKeys(): Promise<ProviderKey[]> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/user/ai-provider-keys`, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch provider keys: ${response.status}`);
  }

  const parsed = parseProviderKeysResponse(await response.json().catch(() => null));
  if (!parsed) {
    throw new Error('Invalid provider keys response payload');
  }
  const keys = parsed.keys;

  return SUPPORTED_PROVIDERS.map(({ provider, label }) => ({
    provider,
    label,
    hasKey: Boolean(keys[provider]),
    maskedKey: keys[provider] ? maskKey(keys[provider]) : undefined,
  }));
}

async function saveProviderKey(args: { provider: string; key: string }): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/user/ai-provider-keys`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ provider: args.provider, key: args.key }),
  });

  if (!response.ok) {
    throw new Error(`Failed to save key: ${response.status}`);
  }
}

async function deleteProviderKey(provider: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/user/ai-provider-keys/${provider}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to delete key: ${response.status}`);
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function useProviderKeys() {
  return useQuery({
    queryKey: providerKeyKeys.list(),
    queryFn: fetchProviderKeys,
    staleTime: 5 * 60_000,
  });
}

export function useSaveProviderKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveProviderKey,
    onSuccess: () => {
      log.log('✅ Provider key saved');
      queryClient.invalidateQueries({ queryKey: providerKeyKeys.all });
    },
    onError: (error) => {
      log.error('❌ Failed to save provider key:', error);
    },
  });
}

export function useDeleteProviderKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProviderKey,
    onSuccess: () => {
      log.log('✅ Provider key deleted');
      queryClient.invalidateQueries({ queryKey: providerKeyKeys.all });
    },
    onError: (error) => {
      log.error('❌ Failed to delete provider key:', error);
    },
  });
}
