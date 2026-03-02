'use client';

import { useEffect, useRef } from 'react';
import { connectDockerSSE, type DockerSSEConnection } from '@/lib/docker-backend-api';
import { useChannelStore, type ChannelMessage } from '@/stores/channel-store';

/**
 * Subscribe to real-time channel events via SSE.
 * Uses the existing `/api/a2a/channels/:channelId/stream` endpoint.
 */
export function useChannelSSE(channelId: string | null) {
  const connectionRef = useRef<DockerSSEConnection | null>(null);
  const addMessage = useChannelStore((s) => s.addMessage);
  const incrementUnread = useChannelStore((s) => s.incrementUnread);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);

  useEffect(() => {
    if (!channelId) return;

    // Close existing connection
    connectionRef.current?.close();

    const connection = connectDockerSSE(
      `/api/a2a/channels/${channelId}/stream`,
      {
        'message.new': (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            const message: ChannelMessage = {
              id: data.data?.message?.id ?? data.id,
              channelId,
              threadId: data.data?.message?.threadId ?? 'default',
              senderId: data.data?.message?.senderId ?? '',
              senderName: data.data?.message?.senderName ?? 'Agent',
              senderPlatform: data.data?.message?.senderPlatform ?? 'custom',
              text: data.data?.message?.text ?? '',
              mentions: data.data?.message?.mentions ?? [],
              timestamp: data.timestamp ?? new Date().toISOString(),
              type: data.data?.message?.type ?? 'message',
              metadata: data.data?.message?.metadata,
            };
            addMessage(channelId, message);

            // Track unread if not the active channel
            if (activeChannelId !== channelId) {
              incrementUnread(channelId);
            }
          } catch {
            // Ignore parse errors
          }
        },
        'thread.created': (_event: MessageEvent) => {
          // Thread events could be used for thread UI updates
        },
        'member.joined': (_event: MessageEvent) => {
          // Member events could refresh the channel member list
        },
        'member.left': (_event: MessageEvent) => {
          // Member events could refresh the channel member list
        },
      },
    );

    connectionRef.current = connection;

    return () => {
      connection.close();
      connectionRef.current = null;
    };
  }, [channelId, addMessage, incrementUnread, activeChannelId]);
}
