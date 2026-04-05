'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { threadKeys } from '@/hooks/threads/keys';
import { connectTokenizedSSE } from '@/lib/realtime/sse';
import { resolveBrowserBackendApiUrl } from '@/lib/runtime-urls';

export function useProjectRealtime(projectId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId) return;
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
  }, [projectId, queryClient]);
}
