import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserPreferences, UserPreferencesUpdate } from '@/lib/api/user-preferences';
import {
  getPreferences as fetchPreferences,
  updatePreferences as patchPreferences,
} from '@/lib/api/user-preferences';

interface PreferencesState {
  // Preference values (mirrors DB schema defaults)
  theme: 'system' | 'light' | 'dark';
  language: string;
  fontSize: 'small' | 'medium' | 'large';
  compactMode: boolean;
  reducedAnimations: boolean;
  sidebarCollapsed: boolean;
  notificationEmail: boolean;
  notificationPush: boolean;
  notificationInApp: boolean;
  notificationAgentCompleted: boolean;
  notificationAgentFailed: boolean;
  notificationThreadMessage: boolean;
  notificationSystemAlert: boolean;
  dashboardWidgetOrder: string[];
  timezone: string;

  // Sync state
  isSynced: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;

  // Actions
  syncFromBackend: () => Promise<void>;
  updatePreference: <K extends keyof UserPreferencesUpdate>(
    key: K,
    value: NonNullable<UserPreferencesUpdate[K]>
  ) => Promise<void>;
  resetAll: () => Promise<void>;
  _applyFromBackend: (prefs: UserPreferences) => void;
}

function mapBackendToStore(prefs: UserPreferences): Partial<PreferencesState> {
  return {
    theme: prefs.theme,
    language: prefs.language,
    fontSize: prefs.font_size,
    compactMode: prefs.compact_mode,
    reducedAnimations: prefs.reduced_animations,
    sidebarCollapsed: prefs.sidebar_collapsed,
    notificationEmail: prefs.notification_email,
    notificationPush: prefs.notification_push,
    notificationInApp: prefs.notification_in_app,
    notificationAgentCompleted: prefs.notification_agent_completed,
    notificationAgentFailed: prefs.notification_agent_failed,
    notificationThreadMessage: prefs.notification_thread_message,
    notificationSystemAlert: prefs.notification_system_alert,
    dashboardWidgetOrder: prefs.dashboard_widget_order,
    timezone: prefs.timezone,
  };
}

// Map from camelCase store keys to snake_case API keys
const KEY_MAP: Record<string, string> = {
  theme: 'theme',
  language: 'language',
  fontSize: 'font_size',
  compactMode: 'compact_mode',
  reducedAnimations: 'reduced_animations',
  sidebarCollapsed: 'sidebar_collapsed',
  notificationEmail: 'notification_email',
  notificationPush: 'notification_push',
  notificationInApp: 'notification_in_app',
  notificationAgentCompleted: 'notification_agent_completed',
  notificationAgentFailed: 'notification_agent_failed',
  notificationThreadMessage: 'notification_thread_message',
  notificationSystemAlert: 'notification_system_alert',
  dashboardWidgetOrder: 'dashboard_widget_order',
  timezone: 'timezone',
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      // Defaults
      theme: 'system',
      language: 'en',
      fontSize: 'medium',
      compactMode: false,
      reducedAnimations: false,
      sidebarCollapsed: false,
      notificationEmail: true,
      notificationPush: true,
      notificationInApp: true,
      notificationAgentCompleted: true,
      notificationAgentFailed: true,
      notificationThreadMessage: true,
      notificationSystemAlert: true,
      dashboardWidgetOrder: [],
      timezone: 'UTC',

      isSynced: false,
      isSyncing: false,
      lastSyncedAt: null,

      syncFromBackend: async () => {
        set({ isSyncing: true });
        try {
          const prefs = await fetchPreferences();
          const mapped = mapBackendToStore(prefs);
          set({
            ...mapped,
            isSynced: true,
            isSyncing: false,
            lastSyncedAt: new Date().toISOString(),
          });
        } catch {
          // Offline or error — keep localStorage values
          set({ isSyncing: false });
        }
      },

      updatePreference: async (key, value) => {
        // Optimistic local update
        set({ [key]: value } as any);

        // Map to backend key
        const apiKey = KEY_MAP[key as string];
        if (!apiKey) return;

        try {
          const result = await patchPreferences({ [apiKey]: value } as UserPreferencesUpdate);
          const mapped = mapBackendToStore(result);
          set({
            ...mapped,
            isSynced: true,
            lastSyncedAt: new Date().toISOString(),
          });
        } catch {
          // Failed to sync — local value persists via localStorage
          set({ isSynced: false });
        }
      },

      resetAll: async () => {
        try {
          const { resetPreferences } = await import('@/lib/api/user-preferences');
          const result = await resetPreferences();
          const mapped = mapBackendToStore(result);
          set({
            ...mapped,
            isSynced: true,
            lastSyncedAt: new Date().toISOString(),
          });
        } catch {
          set({ isSynced: false });
        }
      },

      _applyFromBackend: (prefs: UserPreferences) => {
        const mapped = mapBackendToStore(prefs);
        set({
          ...mapped,
          isSynced: true,
          lastSyncedAt: new Date().toISOString(),
        });
      },
    }),
    {
      name: 'recoder-user-preferences-v1',
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        fontSize: state.fontSize,
        compactMode: state.compactMode,
        reducedAnimations: state.reducedAnimations,
        sidebarCollapsed: state.sidebarCollapsed,
        notificationEmail: state.notificationEmail,
        notificationPush: state.notificationPush,
        notificationInApp: state.notificationInApp,
        notificationAgentCompleted: state.notificationAgentCompleted,
        notificationAgentFailed: state.notificationAgentFailed,
        notificationThreadMessage: state.notificationThreadMessage,
        notificationSystemAlert: state.notificationSystemAlert,
        dashboardWidgetOrder: state.dashboardWidgetOrder,
        timezone: state.timezone,
        lastSyncedAt: state.lastSyncedAt,
      }),
    }
  )
);
