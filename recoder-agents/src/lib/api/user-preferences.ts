import { backendApi } from '@/lib/api-client';

export interface UserPreferences {
  user_id: string;
  theme: 'system' | 'light' | 'dark';
  language: string;
  font_size: 'small' | 'medium' | 'large';
  compact_mode: boolean;
  reduced_animations: boolean;
  sidebar_collapsed: boolean;
  notification_email: boolean;
  notification_push: boolean;
  notification_in_app: boolean;
  notification_agent_completed: boolean;
  notification_agent_failed: boolean;
  notification_thread_message: boolean;
  notification_system_alert: boolean;
  dashboard_widget_order: string[];
  timezone: string;
  updated_at: string | null;
}

export type UserPreferencesUpdate = Partial<Omit<UserPreferences, 'user_id' | 'updated_at'>>;

export const getPreferences = async (): Promise<UserPreferences> => {
  const response = await backendApi.get<UserPreferences>(
    '/preferences',
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updatePreferences = async (
  updates: UserPreferencesUpdate
): Promise<UserPreferences> => {
  const response = await backendApi.put<UserPreferences>(
    '/preferences',
    updates,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const resetPreferences = async (): Promise<UserPreferences> => {
  const response = await backendApi.post<UserPreferences>(
    '/preferences/reset',
    {},
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
