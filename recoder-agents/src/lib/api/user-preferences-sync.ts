import { backendApi } from '@/lib/api-client';
import { handleApiError } from '@/lib/error-handler';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PreferenceCategory =
  | 'general'
  | 'appearance'
  | 'editor'
  | 'notifications'
  | 'shortcuts'
  | 'layout'
  | 'privacy';

export interface UserPreference {
  id: string;
  user_id: string;
  preference_key: string;
  preference_value: unknown;
  category: PreferenceCategory;
  updated_at: string;
}

export interface SetPreferencePayload {
  preference_key: string;
  preference_value: unknown;
  category?: PreferenceCategory;
}

export interface BatchSetPayload {
  preferences: SetPreferencePayload[];
}

export interface SyncPushPayload {
  device_id: string;
  preferences: SetPreferencePayload[];
}

export interface SyncLogEntry {
  id: string;
  user_id: string;
  device_id: string;
  sync_type: 'push' | 'pull' | 'conflict_resolved';
  preferences_synced: number;
  synced_at: string;
}

export interface BatchSetResponse {
  status: string;
  updated: number;
  preferences: UserPreference[];
}

export interface SyncPushResponse {
  status: string;
  synced: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS: Record<PreferenceCategory, string> = {
  general: 'General',
  appearance: 'Appearance',
  editor: 'Editor',
  notifications: 'Notifications',
  shortcuts: 'Shortcuts',
  layout: 'Layout',
  privacy: 'Privacy',
};

export const ALL_CATEGORIES: PreferenceCategory[] = [
  'general',
  'appearance',
  'editor',
  'notifications',
  'shortcuts',
  'layout',
  'privacy',
];

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Get all user preferences, optionally filtered by category. */
export async function getPreferences(
  category?: PreferenceCategory,
): Promise<UserPreference[]> {
  try {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    const qs = params.toString();

    const response = await backendApi.get<UserPreference[]>(
      `/preferences${qs ? `?${qs}` : ''}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data ?? [];
  } catch (error) {
    handleApiError(error, { operation: 'list preferences', resource: 'user-preferences-sync' });
    throw error;
  }
}

/** Set a single preference (upsert). */
export async function setPreference(
  payload: SetPreferencePayload,
): Promise<UserPreference> {
  try {
    const response = await backendApi.put<UserPreference>(
      '/preferences',
      payload,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'set preference', resource: 'user-preferences-sync' });
    throw error;
  }
}

/** Batch set multiple preferences. */
export async function batchSetPreferences(
  payload: BatchSetPayload,
): Promise<BatchSetResponse> {
  try {
    const response = await backendApi.put<BatchSetResponse>(
      '/preferences/batch',
      payload,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'batch set preferences', resource: 'user-preferences-sync' });
    throw error;
  }
}

/** Delete a preference by key. */
export async function deletePreference(
  preferenceKey: string,
): Promise<void> {
  try {
    const response = await backendApi.delete(
      `/preferences/${encodeURIComponent(preferenceKey)}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
  } catch (error) {
    handleApiError(error, { operation: 'delete preference', resource: 'user-preferences-sync' });
    throw error;
  }
}

/** Push preferences to sync across devices. */
export async function syncPush(
  payload: SyncPushPayload,
): Promise<SyncPushResponse> {
  try {
    const response = await backendApi.post<SyncPushResponse>(
      '/preferences/sync',
      payload,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'sync push', resource: 'user-preferences-sync' });
    throw error;
  }
}

/** Pull preferences updated after a given timestamp. */
export async function syncPull(
  since?: string,
): Promise<UserPreference[]> {
  try {
    const params = new URLSearchParams();
    if (since) params.set('since', since);
    const qs = params.toString();

    const response = await backendApi.get<UserPreference[]>(
      `/preferences/sync/pull${qs ? `?${qs}` : ''}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data ?? [];
  } catch (error) {
    handleApiError(error, { operation: 'sync pull', resource: 'user-preferences-sync' });
    throw error;
  }
}

/** Get sync log history. */
export async function getSyncLog(
  limit?: number,
): Promise<SyncLogEntry[]> {
  try {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();

    const response = await backendApi.get<SyncLogEntry[]>(
      `/preferences/sync/log${qs ? `?${qs}` : ''}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data ?? [];
  } catch (error) {
    handleApiError(error, { operation: 'get sync log', resource: 'user-preferences-sync' });
    throw error;
  }
}
