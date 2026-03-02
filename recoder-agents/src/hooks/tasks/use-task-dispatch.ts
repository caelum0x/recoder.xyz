'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { dockerBackendApi, connectDockerSSE, type DockerSSEConnection } from '@/lib/docker-backend-api';

interface DispatchTaskInput {
  prompt: string;
  agentId?: string;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}

interface TaskStreamCallbacks {
  onProgress?: (data: Record<string, unknown>) => void;
  onCompleted?: (data: Record<string, unknown>) => void;
  onFailed?: (data: Record<string, unknown>) => void;
  onInputRequired?: (data: Record<string, unknown>) => void;
}

export function useDispatchTask() {
  return useMutation({
    mutationFn: async (input: DispatchTaskInput) => {
      const res = await dockerBackendApi.post<{ task: Record<string, unknown> }>(
        '/api/a2a/tasks',
        input,
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to dispatch task');
    },
  });
}

export function useTaskStream(taskId: string | null, callbacks?: TaskStreamCallbacks) {
  const connectionRef = useRef<DockerSSEConnection | null>(null);

  useEffect(() => {
    if (!taskId) return;

    connectionRef.current?.close();

    const connection = connectDockerSSE(
      `/api/a2a/tasks/${taskId}/stream`,
      {
        'task.progress': (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            callbacks?.onProgress?.(data.data ?? data);
          } catch { /* ignore */ }
        },
        'task.completed': (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            callbacks?.onCompleted?.(data.data ?? data);
          } catch { /* ignore */ }
        },
        'task.failed': (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            callbacks?.onFailed?.(data.data ?? data);
          } catch { /* ignore */ }
        },
        'task.input-required': (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            callbacks?.onInputRequired?.(data.data ?? data);
          } catch { /* ignore */ }
        },
      },
    );

    connectionRef.current = connection;

    return () => {
      connection.close();
      connectionRef.current = null;
    };
  }, [taskId, callbacks]);

  return {
    close: () => connectionRef.current?.close(),
  };
}
