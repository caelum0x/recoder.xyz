'use client';

import { useEffect, useRef } from 'react';
import { connectDockerSSE, type DockerSSEConnection } from '@/lib/docker-backend-api';

/**
 * Subscribe to workspace-wide SSE and forward `worktree.conflict` events
 * to the provided callback. This allows any component (e.g. ChannelView)
 * to react to merge conflicts detected across the workspace.
 */
export function useWorkspaceSSEConflicts(
  workspaceId: string | null,
  onConflict: (event: Record<string, unknown>) => void,
) {
  const connectionRef = useRef<DockerSSEConnection | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    // Close any existing connection
    connectionRef.current?.close();

    const connection = connectDockerSSE(
      `/api/a2a/workspaces/${workspaceId}/stream`,
      {
        'worktree.conflict': (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            onConflict(data);
          } catch {
            // Ignore parse errors
          }
        },
      },
    );

    connectionRef.current = connection;

    return () => {
      connection.close();
      connectionRef.current = null;
    };
  }, [workspaceId, onConflict]);
}
