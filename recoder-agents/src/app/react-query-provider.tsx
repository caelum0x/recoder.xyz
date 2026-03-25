'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { handleApiError } from '@/lib/error-handler';
import { isLocalMode } from '@/lib/config';
import {
  AgentRunLimitError,
  BillingError,
  ProjectLimitError,
  ThreadLimitError,
  AgentCountLimitError,
  TriggerLimitError,
  CustomWorkerLimitError,
  ModelAccessDeniedError
} from '@/lib/api/errors';

/**
 * Extract HTTP status from various error shapes:
 * - ApiRequestError (thrown by throwIfError): has .status directly
 * - Old-style errors with .status or .response.status
 * - Error message pattern "HTTP 404: ..."
 */
function getErrorStatus(error: any): number | undefined {
  if (error?.status && typeof error.status === 'number') return error.status;
  if (error?.response?.status && typeof error.response.status === 'number') return error.response.status;
  // Check error message for HTTP status pattern (e.g. "HTTP 404: Not Found")
  if (error?.message) {
    const match = error.message.match(/^HTTP (\d{3}):/);
    if (match) return parseInt(match[1], 10);
  }
  return undefined;
}

/**
 * Determine if a failed query/mutation should be retried.
 * Never retry 4xx errors (client errors like 404, 401, 403, 422).
 * Only retry 5xx (server errors) and network errors, up to the limit.
 */
function shouldRetry(failureCount: number, error: any, maxRetries: number): boolean {
  const status = getErrorStatus(error);

  // Never retry client errors (4xx) — these won't self-resolve
  if (status && status >= 400 && status < 500) return false;

  // Never retry billing/limit errors — they require user action
  if (
    error instanceof BillingError ||
    error instanceof AgentRunLimitError ||
    error instanceof ProjectLimitError ||
    error instanceof ThreadLimitError ||
    error instanceof AgentCountLimitError ||
    error instanceof TriggerLimitError ||
    error instanceof CustomWorkerLimitError ||
    error instanceof ModelAccessDeniedError
  ) {
    return false;
  }

  // Retry server errors (5xx) and network errors up to the limit
  return failureCount < maxRetries;
}

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20 * 1000,
            gcTime: 2 * 60 * 1000,
            // Enable request deduplication - React Query will batch simultaneous requests
            structuralSharing: true,
            retry: (failureCount, error: any) => shouldRetry(failureCount, error, 3),
            retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 15000),
            refetchOnMount: true,
            refetchOnWindowFocus: false,
            refetchOnReconnect: 'always',
          },
          mutations: {
            retry: (failureCount, error: any) => shouldRetry(failureCount, error, 1),
            onError: (error: any) => {
              if (error instanceof BillingError ||
                  error instanceof AgentRunLimitError ||
                  error instanceof ProjectLimitError ||
                  error instanceof ThreadLimitError ||
                  error instanceof AgentCountLimitError ||
                  error instanceof TriggerLimitError ||
                  error instanceof CustomWorkerLimitError ||
                  error instanceof ModelAccessDeniedError) {
                return;
              }
              handleApiError(error, {
                operation: 'perform action',
                silent: false,
              });
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {isLocalMode() && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}

