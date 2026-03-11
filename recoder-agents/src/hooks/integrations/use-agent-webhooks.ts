'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  listDeliveries,
  retryDelivery,
  type CreateWebhookRequest,
  type UpdateWebhookRequest,
  type DeliveryFilters,
} from '@/lib/api/agent-webhooks';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const webhookKeys = {
  all: ['agent-webhooks'] as const,
  list: (agentId?: string) => [...webhookKeys.all, 'list', { agentId }] as const,
  deliveries: (webhookId: string, filters?: DeliveryFilters) =>
    [...webhookKeys.all, 'deliveries', webhookId, filters] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useWebhooks(agentId?: string) {
  return useQuery({
    queryKey: webhookKeys.list(agentId),
    queryFn: () => listWebhooks(agentId),
    staleTime: 30_000,
    retry: 2,
  });
}

export function useWebhookDeliveries(
  webhookId: string,
  filters?: DeliveryFilters
) {
  return useQuery({
    queryKey: webhookKeys.deliveries(webhookId, filters),
    queryFn: () => listDeliveries(webhookId, filters),
    enabled: !!webhookId,
    staleTime: 15_000,
    retry: 2,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWebhookRequest) => createWebhook(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.all });
      toast.success('Webhook created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create webhook');
    },
  });
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ webhookId, data }: { webhookId: string; data: UpdateWebhookRequest }) =>
      updateWebhook(webhookId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.all });
      toast.success('Webhook updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update webhook');
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (webhookId: string) => deleteWebhook(webhookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.all });
      toast.success('Webhook deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete webhook');
    },
  });
}

export function useTestWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (webhookId: string) => testWebhook(webhookId),
    onSuccess: (_data, webhookId) => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.deliveries(webhookId) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send test delivery');
    },
  });
}

export function useRetryDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) => retryDelivery(deliveryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.all });
      toast.success('Delivery retried');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to retry delivery');
    },
  });
}
