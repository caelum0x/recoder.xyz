import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getNotificationChannels,
  createNotificationChannel,
  updateNotificationChannel,
  deleteNotificationChannel,
  testNotificationChannel,
  type CreateChannelData,
  type UpdateChannelData,
} from '@/lib/api/notification-channels';

export function useNotificationChannels() {
  return useQuery({
    queryKey: ['notification-channels'],
    queryFn: getNotificationChannels,
    staleTime: 30_000,
  });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateChannelData) => createNotificationChannel(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-channels'] });
    },
  });
}

export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      channelId,
      data,
    }: {
      channelId: string;
      data: UpdateChannelData;
    }) => updateNotificationChannel(channelId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-channels'] });
    },
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => deleteNotificationChannel(channelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-channels'] });
    },
  });
}

export function useTestChannel() {
  return useMutation({
    mutationFn: (channelId: string) => testNotificationChannel(channelId),
  });
}
