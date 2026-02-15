/**
 * Trigger API Hooks
 *
 * React Query hooks for trigger CRUD operations
 * Following patterns from useApiQueries.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/contexts/AuthContext';
import { requireSessionAccessToken } from '@/lib/auth/session-token';
import type {
  TriggerConfiguration,
  TriggerProvider,
  TriggerWithAgent,
  TriggerCreateRequest,
  TriggerUpdateRequest,
  TriggerResponse,
  ProviderResponse,
  TriggerAppsResponse,
} from '@/api/types';

const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000/v1';

export const triggerKeys = {
  all: ['triggers', 'all'] as const,
  agent: (agentId: string) => ['triggers', 'agent', agentId] as const,
  providers: ['triggers', 'providers'] as const,
  detail: (triggerId: string) => ['triggers', 'detail', triggerId] as const,
  apps: ['triggers', 'apps'] as const,
};

// ===== QUERY FUNCTIONS =====

const fetchAllTriggers = async (token: string): Promise<TriggerWithAgent[]> => {
  const response = await fetch(`${API_BASE_URL}/triggers/all`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch triggers: ${response.statusText}`);
  }

  return response.json();
};

const fetchAgentTriggers = async (
  agentId: string,
  token: string
): Promise<TriggerConfiguration[]> => {
  const response = await fetch(`${API_BASE_URL}/triggers/agents/${agentId}/triggers`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch agent triggers: ${response.statusText}`);
  }

  return response.json();
};

const fetchTriggerProviders = async (token: string): Promise<TriggerProvider[]> => {
  const response = await fetch(`${API_BASE_URL}/triggers/providers`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch trigger providers: ${response.statusText}`);
  }

  return response.json();
};

const fetchTrigger = async (triggerId: string, token: string): Promise<TriggerResponse> => {
  const response = await fetch(`${API_BASE_URL}/triggers/${triggerId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch trigger: ${response.statusText}`);
  }

  return response.json();
};

const fetchTriggerApps = async (token: string): Promise<TriggerAppsResponse> => {
  const response = await fetch(`${API_BASE_URL}/composio/triggers/apps`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch trigger apps: ${response.statusText}`);
  }

  return response.json();
};

// ===== MUTATION FUNCTIONS =====

const createTrigger = async ({
  agentId,
  data,
  token,
}: {
  agentId: string;
  data: TriggerCreateRequest;
  token: string;
}): Promise<TriggerResponse> => {
  const response = await fetch(`${API_BASE_URL}/triggers/agents/${agentId}/triggers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to create trigger: ${response.statusText}`);
  }

  return response.json();
};

const updateTrigger = async ({
  triggerId,
  data,
  token,
}: {
  triggerId: string;
  data: TriggerUpdateRequest;
  token: string;
}): Promise<TriggerResponse> => {
  const response = await fetch(`${API_BASE_URL}/triggers/${triggerId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to update trigger: ${response.statusText}`);
  }

  return response.json();
};

const deleteTrigger = async ({
  triggerId,
  agentId,
  token,
}: {
  triggerId: string;
  agentId: string;
  token: string;
}): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/triggers/${triggerId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to delete trigger: ${response.statusText}`);
  }
};

const toggleTrigger = async ({
  triggerId,
  isActive,
  token,
}: {
  triggerId: string;
  isActive: boolean;
  token: string;
}): Promise<TriggerResponse> => {
  return updateTrigger({
    triggerId,
    data: { is_active: isActive },
    token,
  });
};

// ===== REACT QUERY HOOKS =====

export const useAllTriggers = () => {
  const { isAuthenticated } = useAuthContext();

  return useQuery({
    queryKey: ['triggers', 'all'],
    queryFn: async () => fetchAllTriggers(await requireSessionAccessToken()),
    enabled: isAuthenticated,
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: false,
  });
};

export const useAgentTriggers = (agentId: string) => {
  const { isAuthenticated } = useAuthContext();

  return useQuery({
    queryKey: ['triggers', 'agent', agentId],
    queryFn: async () => fetchAgentTriggers(agentId, await requireSessionAccessToken()),
    enabled: isAuthenticated && !!agentId,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
};

export const useTriggerProviders = () => {
  const { isAuthenticated } = useAuthContext();

  return useQuery({
    queryKey: ['triggers', 'providers'],
    queryFn: async () => fetchTriggerProviders(await requireSessionAccessToken()),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
};

export const useTrigger = (triggerId: string) => {
  const { isAuthenticated } = useAuthContext();

  return useQuery({
    queryKey: ['triggers', triggerId],
    queryFn: async () => fetchTrigger(triggerId, await requireSessionAccessToken()),
    enabled: isAuthenticated && !!triggerId,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
};

export const useCreateTrigger = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, data }: { agentId: string; data: TriggerCreateRequest }) =>
      createTrigger({ agentId, data, token: await requireSessionAccessToken() }),
    onSuccess: (data, variables) => {
      // Invalidate and refetch triggers
      queryClient.invalidateQueries({ queryKey: ['triggers', 'all'], refetchType: 'active' });
      queryClient.invalidateQueries({
        queryKey: ['triggers', 'agent', variables.agentId],
        refetchType: 'active',
      });

      // Add the new trigger to the cache
      queryClient.setQueryData(['triggers', data.trigger_id], data);
    },
  });
};

export const useUpdateTrigger = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ triggerId, data }: { triggerId: string; data: TriggerUpdateRequest }) =>
      updateTrigger({ triggerId, data, token: await requireSessionAccessToken() }),
    onSuccess: (data) => {
      // Update the specific trigger in cache
      queryClient.setQueryData(['triggers', data.trigger_id], data);

      // Invalidate lists to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['triggers', 'all'], refetchType: 'active' });
      queryClient.invalidateQueries({
        queryKey: ['triggers', 'agent', data.agent_id],
        refetchType: 'active',
      });
    },
  });
};

export const useDeleteTrigger = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ triggerId, agentId }: { triggerId: string; agentId: string }) =>
      deleteTrigger({ triggerId, agentId, token: await requireSessionAccessToken() }),
    onSuccess: (_, variables) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: ['triggers', variables.triggerId] });

      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: ['triggers', 'all'], refetchType: 'active' });
      queryClient.invalidateQueries({
        queryKey: ['triggers', 'agent', variables.agentId],
        refetchType: 'active',
      });
    },
  });
};

export const useToggleTrigger = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ triggerId, isActive }: { triggerId: string; isActive: boolean }) =>
      toggleTrigger({ triggerId, isActive, token: await requireSessionAccessToken() }),
    onSuccess: (data) => {
      // Update the specific trigger in cache
      queryClient.setQueryData(['triggers', data.trigger_id], data);

      // Invalidate lists to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['triggers', 'all'], refetchType: 'active' });
      queryClient.invalidateQueries({
        queryKey: ['triggers', 'agent', data.agent_id],
        refetchType: 'active',
      });
    },
  });
};

export const useTriggerApps = () => {
  const { isAuthenticated } = useAuthContext();

  return useQuery({
    queryKey: ['triggers', 'apps'],
    queryFn: async () => fetchTriggerApps(await requireSessionAccessToken()),
    enabled: isAuthenticated,
  });
};

// ===== COMPOSIO EVENT TRIGGER HOOKS =====

import { log } from '@/lib/logger';
import type {
  ComposioAppsWithTriggersResponse,
  ComposioAppTriggersResponse,
  CreateComposioEventTriggerRequest,
  CreateComposioEventTriggerResponse,
} from '@/api/types';

const fetchComposioAppsWithTriggers = async (
  token: string
): Promise<ComposioAppsWithTriggersResponse> => {
  const response = await fetch(`${API_BASE_URL}/composio/triggers/apps`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Composio apps with triggers: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};

const fetchComposioAppTriggers = async (
  toolkitSlug: string,
  token: string
): Promise<ComposioAppTriggersResponse> => {
  const response = await fetch(`${API_BASE_URL}/composio/triggers/apps/${toolkitSlug}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch triggers for app ${toolkitSlug}: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};

const createComposioEventTrigger = async ({
  data,
  token,
}: {
  data: CreateComposioEventTriggerRequest;
  token: string;
}): Promise<CreateComposioEventTriggerResponse> => {
  const response = await fetch(`${API_BASE_URL}/composio/triggers/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    let errorMessage = `Failed to create event trigger: ${response.statusText}`;
    try {
      const errorData = await response.json();
      // Handle different error response formats (matching frontend error handling)
      // Check for nested error structure: { error: { message: ... } }
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else if (errorData.detail) {
        // detail can be a string or an object
        if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (errorData.detail.message) {
          errorMessage = errorData.detail.message;
        } else {
          // If detail is an object without message, try to extract meaningful info
          errorMessage = errorData.detail.message || JSON.stringify(errorData.detail);
        }
      }
    } catch (parseError) {
      // If JSON parsing fails, use default error message
      log.error('Failed to parse error response:', parseError);
    }

    // Create error with clean message (not JSON stringified)
    throw new Error(errorMessage);
  }

  return response.json();
};

export const useComposioAppsWithTriggers = () => {
  const { isAuthenticated } = useAuthContext();

  return useQuery({
    queryKey: ['composio', 'apps-with-triggers'],
    queryFn: async () => fetchComposioAppsWithTriggers(await requireSessionAccessToken()),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useComposioAppTriggers = (toolkitSlug?: string, enabled: boolean = true) => {
  const { isAuthenticated } = useAuthContext();

  return useQuery({
    queryKey: ['composio', 'app-triggers', toolkitSlug],
    queryFn: async () =>
      fetchComposioAppTriggers(toolkitSlug!, await requireSessionAccessToken()),
    enabled: enabled && !!toolkitSlug && isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useCreateComposioEventTrigger = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateComposioEventTriggerRequest) =>
      createComposioEventTrigger({ data, token: await requireSessionAccessToken() }),
    onSuccess: (data) => {
      // Invalidate trigger queries
      queryClient.invalidateQueries({ queryKey: ['triggers', 'all'], refetchType: 'active' });
      queryClient.invalidateQueries({
        queryKey: ['triggers', 'agent', data.agent_id],
        refetchType: 'active',
      });
      queryClient.invalidateQueries({
        queryKey: ['composio', 'app-triggers'],
        refetchType: 'active',
      });
    },
  });
};
