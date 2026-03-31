/**
 * useErrors - Hook for on-demand error fetching from Docker backend
 * NO POLLING - fetches only when explicitly triggered (after builds, commands, etc.)
 */

import { useCallback, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  setErrors,
  clearErrors,
  errorsAtom,
  hasBlockingErrorsAtom,
  devServerStatusAtom,
  errorCountAtom,
  type ErrorsResponse,
} from '~/lib/stores/errors';
import { dockerGet } from '~/lib/services/docker-api';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('ErrorsHook');

interface UseErrorsResult {
  /** Current errors from store */
  errors: ErrorsResponse['errors'];
  /** Whether there are blocking errors */
  hasBlockingErrors: boolean;
  /** Dev server status */
  devServerStatus: 'running' | 'crashed' | 'idle';
  /** Total error count */
  errorCount: number;
  /** Whether currently fetching */
  isLoading: boolean;
  /** Fetch error if any */
  fetchError: string | null;
  /** Fetch errors from backend (call after builds/commands) */
  fetchErrors: () => Promise<ErrorsResponse | null>;
  /** Clear all errors */
  clear: () => void;
}

/**
 * Fetch errors for a project - standalone function for use outside React
 */
export async function fetchProjectErrors(projectId: string): Promise<ErrorsResponse | null> {
  if (!projectId) return null;

  try {
    const data = await dockerGet<ErrorsResponse>(`/api/errors/${projectId}?tail=200`);
    setErrors(data);
    return data;
  } catch (err: any) {
    if (err?.statusCode === 404) {
      clearErrors();
      return null;
    }

    logger.error('[fetchProjectErrors] Error:', err?.message || err);
    return null;
  }
}

/**
 * Hook for accessing and fetching errors on-demand
 * Call fetchErrors() after shell commands complete or when user requests
 */
export function useErrors(projectId: string | null): UseErrorsResult {
  const errors = useStore(errorsAtom);
  const hasBlockingErrors = useStore(hasBlockingErrorsAtom);
  const devServerStatus = useStore(devServerStatusAtom);
  const errorCount = useStore(errorCountAtom);

  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchErrors = useCallback(async (): Promise<ErrorsResponse | null> => {
    if (!projectId) return null;

    setIsLoading(true);
    setFetchError(null);

    try {
      const data = await fetchProjectErrors(projectId);
      return data;
    } catch (err: any) {
      setFetchError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const clear = useCallback(() => {
    clearErrors();
    setFetchError(null);
  }, []);

  return {
    errors,
    hasBlockingErrors,
    devServerStatus,
    errorCount,
    isLoading,
    fetchError,
    fetchErrors,
    clear,
  };
}

/**
 * Hook to get errors for a specific file (from store, no fetching)
 */
export function useFileErrors(filePath: string | undefined): {
  errors: ErrorsResponse['errors'];
  errorCount: number;
  hasErrors: boolean;
} {
  const allErrors = useStore(errorsAtom);

  const fileErrors = filePath
    ? allErrors.filter((e) => {
        if (!e.filePath) return false;
        // Match with or without /workspace prefix
        const normalizedPath = filePath.replace(/^\/workspace\//, '');
        const errorPath = e.filePath.replace(/^\/workspace\//, '');
        return normalizedPath === errorPath;
      })
    : [];

  return {
    errors: fileErrors,
    errorCount: fileErrors.length,
    hasErrors: fileErrors.length > 0,
  };
}
