import { useQuery } from '@tanstack/react-query';
import { TriggerProvider } from '@/components/agents/triggers/types';
import { requireSessionAccessToken } from '@/lib/auth/session-token';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

const fetchTriggerProviders = async (): Promise<TriggerProvider[]> => {
  const accessToken = await requireSessionAccessToken();
  const response = await fetch(`${API_URL}/triggers/providers`, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch trigger providers');
  }
  return response.json();
};

export const useTriggerProviders = () => {
  return useQuery({
    queryKey: ['trigger-providers'],
    queryFn: fetchTriggerProviders,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}; 
