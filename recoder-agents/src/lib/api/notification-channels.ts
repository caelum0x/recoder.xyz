import { backendApi } from '@/lib/api-client';

export interface NotificationChannel {
  id: string;
  user_id: string;
  channel_type: 'slack' | 'discord' | 'email';
  name: string;
  webhook_url: string;
  is_active: boolean;
  events: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateChannelData {
  channel_type: 'slack' | 'discord' | 'email';
  name: string;
  webhook_url: string;
  events?: string[];
}

export interface UpdateChannelData {
  name?: string;
  webhook_url?: string;
  is_active?: boolean;
  events?: string[];
}

export const CHANNEL_EVENTS = [
  { value: 'agent.completed', label: 'Agent Completed' },
  { value: 'agent.failed', label: 'Agent Failed' },
  { value: 'thread.message', label: 'Thread Message' },
  { value: 'system.alert', label: 'System Alert' },
  { value: 'schedule.triggered', label: 'Schedule Triggered' },
  { value: 'quota.warning', label: 'Quota Warning' },
] as const;

export const getNotificationChannels = async (): Promise<NotificationChannel[]> => {
  const response = await backendApi.get<NotificationChannel[]>(
    '/notification-channels',
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createNotificationChannel = async (
  data: CreateChannelData
): Promise<NotificationChannel> => {
  const response = await backendApi.post<NotificationChannel>(
    '/notification-channels',
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateNotificationChannel = async (
  channelId: string,
  data: UpdateChannelData
): Promise<NotificationChannel> => {
  const response = await backendApi.patch<NotificationChannel>(
    `/notification-channels/${channelId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteNotificationChannel = async (channelId: string) => {
  const response = await backendApi.delete(`/notification-channels/${channelId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const testNotificationChannel = async (channelId: string) => {
  const response = await backendApi.post(
    `/notification-channels/${channelId}/test`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data;
};
