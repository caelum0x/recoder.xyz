'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dockerBackendApi } from '@/lib/docker-backend-api';
import { useChannelStore, type Channel, type ChannelMessage } from '@/stores/channel-store';

const channelKeys = {
  all: ['channels'] as const,
  list: (wsId: string) => [...channelKeys.all, 'list', wsId] as const,
  messages: (channelId: string, threadId?: string) =>
    [...channelKeys.all, 'messages', channelId, threadId ?? 'default'] as const,
};

export function useChannels(wsId: string | null) {
  const setChannels = useChannelStore((s) => s.setChannels);

  return useQuery({
    queryKey: channelKeys.list(wsId ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<{ channels: Channel[]; total: number }>(
        `/api/a2a/workspaces/${wsId}/channels`,
      );
      if (res.success && res.data) {
        setChannels(res.data.channels);
        return res.data;
      }
      throw new Error(res.error?.message || 'Failed to fetch channels');
    },
    enabled: !!wsId,
    staleTime: 30_000,
  });
}

export function useChannelMessages(channelId: string | null, threadId?: string) {
  const setMessages = useChannelStore((s) => s.setMessages);

  return useQuery({
    queryKey: channelKeys.messages(channelId ?? '', threadId),
    queryFn: async () => {
      const path = threadId
        ? `/api/a2a/channels/${channelId}/threads/${threadId}/messages`
        : `/api/a2a/channels/${channelId}/threads/default/messages`;

      const res = await dockerBackendApi.get<{ messages: ChannelMessage[] }>(path);
      if (res.success && res.data) {
        if (channelId) {
          setMessages(channelId, res.data.messages);
        }
        return res.data;
      }
      throw new Error(res.error?.message || 'Failed to fetch messages');
    },
    enabled: !!channelId,
    staleTime: 10_000,
  });
}

export function useCreateChannel() {
  const queryClient = useQueryClient();
  const addChannel = useChannelStore((s) => s.addChannel);

  return useMutation({
    mutationFn: async (input: {
      name: string;
      scope: 'public' | 'agent-to-agent' | 'direct';
      memberAgentIds?: string[];
      workspaceId: string;
    }) => {
      const res = await dockerBackendApi.post<Channel>('/api/a2a/channels', input);
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to create channel');
    },
    onSuccess: (channel, variables) => {
      addChannel(channel);
      queryClient.invalidateQueries({ queryKey: channelKeys.list(variables.workspaceId) });
    },
  });
}

export function useSendMessage() {
  return useMutation({
    mutationFn: async (input: {
      channelId: string;
      threadId: string;
      senderId: string;
      text: string;
    }) => {
      const { channelId, threadId, ...body } = input;
      const res = await dockerBackendApi.post<ChannelMessage>(
        `/api/a2a/channels/${channelId}/threads/${threadId}/messages`,
        body,
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to send message');
    },
  });
}

export function useDeleteChannel() {
  const queryClient = useQueryClient();
  const removeChannel = useChannelStore((s) => s.removeChannel);

  return useMutation({
    mutationFn: async (input: { channelId: string; workspaceId: string }) => {
      const res = await dockerBackendApi.delete(`/api/a2a/channels/${input.channelId}`);
      if (res.success) return input;
      throw new Error(res.error?.message || 'Failed to delete channel');
    },
    onSuccess: ({ channelId, workspaceId }) => {
      removeChannel(channelId);
      queryClient.invalidateQueries({ queryKey: channelKeys.list(workspaceId) });
    },
  });
}

export { channelKeys };
