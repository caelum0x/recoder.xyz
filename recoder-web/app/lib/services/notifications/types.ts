/**
 * Notification System Types
 *
 * Comprehensive type definitions for the notification system including
 * notification types, actions, preferences, and push notifications.
 */

// ==================== Core Types ====================

/**
 * Notification type categories
 */
export type NotificationType =
  | 'info'           // General information
  | 'success'        // Successful operation
  | 'warning'        // Warning that needs attention
  | 'error'          // Error that occurred
  | 'ai'             // AI-related notification (generation complete, suggestions)
  | 'collaboration'; // Collaboration events (user joined, comments)

/**
 * Priority levels for notifications
 */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Notification action - clickable button/link in notification
 */
export interface NotificationAction {
  /** Unique identifier for the action */
  id: string;
  /** Display label for the action */
  label: string;
  /** Type of action */
  type: 'link' | 'callback' | 'dismiss';
  /** URL for link type actions */
  url?: string;
  /** Callback identifier for callback type actions */
  callbackId?: string;
  /** Whether this is the primary action */
  primary?: boolean;
  /** Icon to display with the action */
  icon?: string;
}

/**
 * Main notification interface
 */
export interface Notification {
  /** Unique identifier */
  id: string;
  /** Notification type/category */
  type: NotificationType;
  /** Short title */
  title: string;
  /** Detailed message */
  message: string;
  /** Creation timestamp */
  timestamp: number;
  /** Whether notification has been read */
  read: boolean;
  /** Priority level */
  priority: NotificationPriority;
  /** Optional actions */
  actions?: NotificationAction[];
  /** Whether to persist after dismissal */
  persistent: boolean;
  /** Optional grouping key */
  groupKey?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Icon override */
  icon?: string;
  /** Source of the notification */
  source?: string;
  /** Auto-dismiss duration in milliseconds (0 = never) */
  autoDismiss?: number;
  /** Whether notification was shown as toast */
  toastShown?: boolean;
}

// ==================== Preferences ====================

/**
 * Notification channel settings
 */
export interface NotificationChannelSettings {
  /** Enable in-app notifications */
  inApp: boolean;
  /** Enable toast notifications */
  toast: boolean;
  /** Enable push notifications */
  push: boolean;
  /** Enable sound */
  sound: boolean;
  /** Enable email notifications */
  email: boolean;
}

/**
 * Per-type notification settings
 */
export type NotificationTypeSettings = {
  [K in NotificationType]: NotificationChannelSettings;
};

/**
 * Sound settings
 */
export interface SoundSettings {
  /** Whether sounds are enabled globally */
  enabled: boolean;
  /** Volume level (0-1) */
  volume: number;
  /** Sound for each notification type */
  sounds: {
    [K in NotificationType]?: string;
  };
  /** Custom sounds (user-uploaded) */
  customSounds: {
    id: string;
    name: string;
    url: string;
  }[];
}

/**
 * Quiet hours settings
 */
export interface QuietHoursSettings {
  /** Whether quiet hours are enabled */
  enabled: boolean;
  /** Start time (HH:MM format) */
  startTime: string;
  /** End time (HH:MM format) */
  endTime: string;
  /** Days of week (0 = Sunday, 6 = Saturday) */
  days: number[];
  /** Allow urgent notifications during quiet hours */
  allowUrgent: boolean;
}

/**
 * Complete notification preferences
 */
export interface NotificationPreferences {
  /** Per-type channel settings */
  typeSettings: NotificationTypeSettings;
  /** Sound settings */
  sound: SoundSettings;
  /** Quiet hours settings */
  quietHours: QuietHoursSettings;
  /** Maximum notifications to keep */
  maxNotifications: number;
  /** Group similar notifications */
  groupSimilar: boolean;
  /** Auto-dismiss read notifications after (ms, 0 = never) */
  autoArchiveRead: number;
  /** Default toast duration (ms) */
  defaultToastDuration: number;
}

// ==================== Push Notifications ====================

/**
 * Push subscription info
 */
export interface PushSubscription {
  /** Subscription endpoint URL */
  endpoint: string;
  /** Subscription keys */
  keys: {
    p256dh: string;
    auth: string;
  };
  /** Expiration time */
  expirationTime: number | null;
}

/**
 * Push notification permission status
 */
export type PushPermissionStatus = 'default' | 'granted' | 'denied';

/**
 * Push notification state
 */
export interface PushNotificationState {
  /** Whether push is supported */
  supported: boolean;
  /** Current permission status */
  permission: PushPermissionStatus;
  /** Current subscription */
  subscription: PushSubscription | null;
  /** Whether currently subscribed */
  subscribed: boolean;
}

// ==================== Event Types ====================

/**
 * Notification event types
 */
export type NotificationEventType =
  | 'notification:added'
  | 'notification:removed'
  | 'notification:read'
  | 'notification:cleared'
  | 'toast:show'
  | 'toast:dismiss'
  | 'push:received'
  | 'push:clicked'
  | 'sound:played'
  | 'preferences:changed';

/**
 * Notification event payload
 */
export interface NotificationEvent {
  type: NotificationEventType;
  notification?: Notification;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Notification event listener
 */
export type NotificationEventListener = (event: NotificationEvent) => void;

// ==================== API Types ====================

/**
 * Options for adding a notification
 */
export interface AddNotificationOptions {
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  actions?: NotificationAction[];
  persistent?: boolean;
  groupKey?: string;
  metadata?: Record<string, unknown>;
  icon?: string;
  source?: string;
  autoDismiss?: number;
  /** Show as toast */
  showToast?: boolean;
  /** Play sound */
  playSound?: boolean;
  /** Send push notification */
  sendPush?: boolean;
}

/**
 * Notification filter options
 */
export interface NotificationFilter {
  types?: NotificationType[];
  read?: boolean;
  priority?: NotificationPriority[];
  fromTimestamp?: number;
  toTimestamp?: number;
  groupKey?: string;
  source?: string;
}

/**
 * Notification group
 */
export interface NotificationGroup {
  key: string;
  notifications: Notification[];
  count: number;
  latestTimestamp: number;
  unreadCount: number;
}

// ==================== Default Values ====================

/**
 * Default channel settings
 */
export const DEFAULT_CHANNEL_SETTINGS: NotificationChannelSettings = {
  inApp: true,
  toast: true,
  push: false,
  sound: true,
  email: false,
};

/**
 * Default type settings
 */
export const DEFAULT_TYPE_SETTINGS: NotificationTypeSettings = {
  info: { ...DEFAULT_CHANNEL_SETTINGS, sound: false },
  success: { ...DEFAULT_CHANNEL_SETTINGS },
  warning: { ...DEFAULT_CHANNEL_SETTINGS },
  error: { ...DEFAULT_CHANNEL_SETTINGS, push: true },
  ai: { ...DEFAULT_CHANNEL_SETTINGS },
  collaboration: { ...DEFAULT_CHANNEL_SETTINGS, push: true },
};

/**
 * Default sound settings
 */
export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 0.5,
  sounds: {
    info: 'pop',
    success: 'success',
    warning: 'warning',
    error: 'error',
    ai: 'chime',
    collaboration: 'notification',
  },
  customSounds: [],
};

/**
 * Default quiet hours settings
 */
export const DEFAULT_QUIET_HOURS: QuietHoursSettings = {
  enabled: false,
  startTime: '22:00',
  endTime: '08:00',
  days: [0, 1, 2, 3, 4, 5, 6],
  allowUrgent: true,
};

/**
 * Default notification preferences
 */
export const DEFAULT_PREFERENCES: NotificationPreferences = {
  typeSettings: DEFAULT_TYPE_SETTINGS,
  sound: DEFAULT_SOUND_SETTINGS,
  quietHours: DEFAULT_QUIET_HOURS,
  maxNotifications: 100,
  groupSimilar: true,
  autoArchiveRead: 0,
  defaultToastDuration: 5000,
};
