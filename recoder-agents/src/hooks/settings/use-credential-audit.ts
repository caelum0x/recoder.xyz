'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getCredentialAuditLog,
  getCredentialAuditSummary,
  getCredentialAnomalies,
  type AuditLogEntry,
  type AuditSummary,
  type AnomalyEntry,
  type AuditLogFilters,
} from '@/lib/api/credential-audit';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const credentialAuditKeys = {
  all: ['credential-audit'] as const,
  log: (filters: AuditLogFilters) =>
    [...credentialAuditKeys.all, 'log', filters] as const,
  summary: () => [...credentialAuditKeys.all, 'summary'] as const,
  anomalies: () => [...credentialAuditKeys.all, 'anomalies'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch the credential access audit log with optional filters.
 */
export function useCredentialAuditLog(filters: AuditLogFilters = {}) {
  return useQuery<AuditLogEntry[]>({
    queryKey: credentialAuditKeys.log(filters),
    queryFn: () => getCredentialAuditLog(filters),
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetch summary statistics for credential access (last 30 days).
 */
export function useCredentialAuditSummary() {
  return useQuery<AuditSummary>({
    queryKey: credentialAuditKeys.summary(),
    queryFn: getCredentialAuditSummary,
    staleTime: 30_000,
    gcTime: 120_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetch detected anomalies in credential access patterns.
 */
export function useCredentialAnomalies() {
  return useQuery<AnomalyEntry[]>({
    queryKey: credentialAuditKeys.anomalies(),
    queryFn: getCredentialAnomalies,
    staleTime: 30_000,
    gcTime: 120_000,
    refetchOnWindowFocus: true,
  });
}
