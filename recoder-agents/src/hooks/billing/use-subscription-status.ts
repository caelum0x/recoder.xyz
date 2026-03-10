'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getSubscription,
  type SubscriptionStatus,
} from '@/lib/api/subscription';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const subscriptionStatusKeys = {
  all: ['subscription-status'] as const,
  status: () => [...subscriptionStatusKeys.all, 'status'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetch the user's subscription status from the central recoder.xyz service.
 *
 * - 5-minute staleTime so we don't hammer the API on every render.
 * - refetchOnWindowFocus ensures data stays fresh when the user returns.
 */
export function useSubscriptionStatus(options?: { enabled?: boolean }) {
  return useQuery<SubscriptionStatus>({
    queryKey: subscriptionStatusKeys.status(),
    queryFn: getSubscription,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}
