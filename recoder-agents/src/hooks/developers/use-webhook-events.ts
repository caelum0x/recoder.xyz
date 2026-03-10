'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listWebhookEvents,
  listRecentWebhookEvents,
  retryWebhookEvent,
  getWebhookEventStats,
  type WebhookEventListResponse,
  type WebhookEventStats,
  type RetryEventResponse,
  type WebhookEventStatus,
} from '@/lib/api/webhook-events';

const WEBHOOK_EVENTS_KEY = ['webhook-events'] as const;

function eventsKey(webhookId: string, status?: WebhookEventStatus) {
  return [...WEBHOOK_EVENTS_KEY, webhookId, status ?? 'all'] as const;
}

function recentEventsKey(status?: WebhookEventStatus) {
  return [...WEBHOOK_EVENTS_KEY, 'recent', status ?? 'all'] as const;
}

function statsKey(webhookId?: string) {
  return [...WEBHOOK_EVENTS_KEY, 'stats', webhookId ?? 'all'] as const;
}

export function useWebhookEvents(
  webhookId: string | undefined,
  options?: {
    status?: WebhookEventStatus;
    event_type?: string;
    limit?: number;
    offset?: number;
  },
) {
  return useQuery<WebhookEventListResponse>({
    queryKey: eventsKey(webhookId!, options?.status),
    queryFn: () => listWebhookEvents(webhookId!, options),
    enabled: !!webhookId,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useRecentWebhookEvents(options?: {
  status?: WebhookEventStatus;
  limit?: number;
}) {
  return useQuery<WebhookEventListResponse>({
    queryKey: recentEventsKey(options?.status),
    queryFn: () => listRecentWebhookEvents(options),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useWebhookEventStats(webhookId?: string) {
  return useQuery<WebhookEventStats>({
    queryKey: statsKey(webhookId),
    queryFn: () => getWebhookEventStats(webhookId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useRetryWebhookEvent() {
  const queryClient = useQueryClient();

  return useMutation<RetryEventResponse, Error, string>({
    mutationFn: (eventId: string) => retryWebhookEvent(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WEBHOOK_EVENTS_KEY });
    },
  });
}
