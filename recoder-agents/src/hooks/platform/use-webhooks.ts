'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listWebhooks,
  getWebhook,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  getDeliveries,
  retryDelivery,
  getSigningSecret,
  rotateSigningSecret,
  type WebhookEndpointListItem,
  type WebhookEndpoint,
  type DeliveryListResponse,
  type CreateWebhookPayload,
  type UpdateWebhookPayload,
  type SigningSecretResponse,
} from '@/lib/api/webhooks';

const WEBHOOKS_KEY = ['webhooks'] as const;

function webhookKey(id: string) {
  return [...WEBHOOKS_KEY, id] as const;
}

function deliveriesKey(id: string) {
  return [...WEBHOOKS_KEY, id, 'deliveries'] as const;
}

export function useWebhooks() {
  return useQuery<WebhookEndpointListItem[]>({
    queryKey: WEBHOOKS_KEY,
    queryFn: listWebhooks,
    staleTime: 30_000,
  });
}

export function useWebhook(id: string | undefined) {
  return useQuery<WebhookEndpoint>({
    queryKey: webhookKey(id!),
    queryFn: () => getWebhook(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateWebhookPayload) => createWebhook(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WEBHOOKS_KEY });
    },
  });
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateWebhookPayload }) =>
      updateWebhook(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: WEBHOOKS_KEY });
      queryClient.invalidateQueries({ queryKey: webhookKey(variables.id) });
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WEBHOOKS_KEY });
    },
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: (id: string) => testWebhook(id),
  });
}

export function useWebhookDeliveries(webhookId: string | undefined) {
  return useQuery<DeliveryListResponse>({
    queryKey: deliveriesKey(webhookId!),
    queryFn: () => getDeliveries(webhookId!),
    enabled: !!webhookId,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useRetryDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (deliveryId: string) => retryDelivery(deliveryId),
    onSuccess: () => {
      // Invalidate all deliveries queries since we don't know which webhook it belongs to
      queryClient.invalidateQueries({ queryKey: WEBHOOKS_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Signing secret hooks
// ---------------------------------------------------------------------------

export function useRevealSigningSecret() {
  return useMutation<SigningSecretResponse, Error, string>({
    mutationFn: (webhookId: string) => getSigningSecret(webhookId),
  });
}

export function useRotateSigningSecret() {
  const queryClient = useQueryClient();

  return useMutation<SigningSecretResponse, Error, string>({
    mutationFn: (webhookId: string) => rotateSigningSecret(webhookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WEBHOOKS_KEY });
    },
  });
}
