'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectTokenizedSSE } from '@/lib/realtime/sse';
import { resolveBrowserBackendApiUrl } from '@/lib/runtime-urls';

export function useVapiCallRealtime(callId?: string, threadId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!callId && !threadId) return;
    const baseUrl = resolveBrowserBackendApiUrl();
    if (!baseUrl) return;

    const connection = connectTokenizedSSE({
      url: `${baseUrl}/realtime/vapi/stream`,
      params: {
        call_id: callId,
        thread_id: threadId,
      },
      events: {
        'vapi.update': (event) => {
          let payload: { call_id?: string; thread_id?: string } = {};
          if (typeof event.data === 'string') {
            try {
              payload = JSON.parse(event.data) as { call_id?: string; thread_id?: string };
            } catch {
            }
          }

          const resolvedCallId = payload.call_id || callId;
          const resolvedThreadId = payload.thread_id || threadId;

          if (resolvedCallId) {
            queryClient.invalidateQueries({
              queryKey: ['vapi-call', resolvedCallId],
              exact: true,
            });
            queryClient.invalidateQueries({
              queryKey: ['vapi-call-monitor', resolvedCallId],
              exact: true,
            });
            queryClient.refetchQueries({
              queryKey: ['vapi-call', resolvedCallId],
              exact: true,
              type: 'active',
            });
          }

          if (resolvedThreadId) {
            queryClient.invalidateQueries({
              queryKey: ['vapi-calls', resolvedThreadId],
              exact: true,
            });
          }
        },
      },
    });

    return () => {
      connection.close();
    };
  }, [callId, threadId, queryClient]);
}
