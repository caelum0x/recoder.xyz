'use client';

import { useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useQueryClient } from '@tanstack/react-query';
import { threadKeys } from '@/hooks/threads/keys';
import { connectTokenizedSSE } from '@/lib/realtime/sse';
import { resolveBrowserBackendApiUrl } from '@/lib/runtime-urls';

const ENABLE_PROJECT_REALTIME_STREAM =
  process.env.NEXT_PUBLIC_ENABLE_PROJECT_REALTIME_STREAM === 'true';

export function useProjectRealtime(projectId?: string) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!ENABLE_PROJECT_REALTIME_STREAM || !projectId || isAuthLoading || !user) return;
    const baseUrl = resolveBrowserBackendApiUrl();
    if (!baseUrl) return;

    const connection = connectTokenizedSSE({
      url: `${baseUrl}/realtime/projects/${projectId}/stream`,
      events: {
        'project.update': () => {
          queryClient.invalidateQueries({
            queryKey: threadKeys.project(projectId),
          });
          queryClient.refetchQueries({
            queryKey: threadKeys.lists(),
            type: 'active',
          });
        },
      },
    });

    return () => {
      connection.close();
    };
  }, [isAuthLoading, projectId, queryClient, user]);
}
