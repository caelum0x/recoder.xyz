'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getActiveSandboxes,
  getSandboxResourceHistory,
  getSandboxResourceSummary,
  type ActiveSandbox,
  type SandboxResourceSnapshot,
  type ResourceSummary,
} from '@/lib/api/sandbox-monitor';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const sandboxMonitorKeys = {
  all: ['sandbox-monitor'] as const,
  activeSandboxes: () => [...sandboxMonitorKeys.all, 'active'] as const,
  history: (sandboxId: string, hours: number) =>
    [...sandboxMonitorKeys.all, 'history', sandboxId, hours] as const,
  summary: () => [...sandboxMonitorKeys.all, 'summary'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Poll active sandboxes every 10 seconds for real-time monitoring.
 */
export function useActiveSandboxes(options?: { enabled?: boolean }) {
  return useQuery<ActiveSandbox[]>({
    queryKey: sandboxMonitorKeys.activeSandboxes(),
    queryFn: getActiveSandboxes,
    refetchInterval: 10_000,
    staleTime: 8_000,
    gcTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}

/**
 * Fetch resource history for a specific sandbox.
 * Polls every 10 seconds while enabled.
 */
export function useSandboxResourceHistory(
  sandboxId: string | null,
  hours: number = 24,
  options?: { enabled?: boolean }
) {
  return useQuery<SandboxResourceSnapshot[]>({
    queryKey: sandboxMonitorKeys.history(sandboxId ?? '', hours),
    queryFn: () => getSandboxResourceHistory(sandboxId!, hours),
    refetchInterval: 10_000,
    staleTime: 8_000,
    gcTime: 30_000,
    enabled: !!sandboxId && options?.enabled !== false,
  });
}

/**
 * Fetch aggregate resource summary across all sandboxes.
 * Polls every 10 seconds.
 */
export function useSandboxResourceSummary(options?: { enabled?: boolean }) {
  return useQuery<ResourceSummary>({
    queryKey: sandboxMonitorKeys.summary(),
    queryFn: getSandboxResourceSummary,
    refetchInterval: 10_000,
    staleTime: 8_000,
    gcTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}
