import { useQuery } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';

export interface TriggerWithAgent {
  trigger_id: string;
  agent_id: string;
  trigger_type: string;
  provider_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  webhook_url?: string;
  created_at: string;
  updated_at: string;
  config?: Record<string, any>;
  agent_name?: string;
  agent_description?: string;
  icon_name?: string;
  icon_color?: string;
  icon_background?: string;
}

const fetchAllTriggers = async (): Promise<TriggerWithAgent[]> => {
  try {
    const response = await backendApi.get<TriggerWithAgent[]>(`/triggers/all`);
    if (!response.success) {
      console.warn('Failed to fetch triggers:', response.error?.message);
      return [];
    }
    return response.data ?? [];
  } catch (error) {
    console.warn('Failed to fetch triggers:', error);
    return [];
  }
};

export const useAllTriggers = () => {
  return useQuery({
    queryKey: ['all-triggers'],
    queryFn: fetchAllTriggers,
    staleTime: 1 * 60 * 1000,
    refetchInterval: 30 * 1000,
  });
}; 
