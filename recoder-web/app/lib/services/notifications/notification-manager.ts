/**
 * Notification Manager Service
 *
 * Central service for managing all notifications in the application.
 * Handles adding, reading, clearing notifications, and managing preferences.
 */

import { atom, map } from 'nanostores';
import type {
  Notification,
  NotificationType,
  NotificationPriority,
  NotificationPreferences,
  NotificationFilter,
  NotificationGroup,
  NotificationEvent,
  NotificationEventListener,
  NotificationEventType,
  AddNotificationOptions,
} from './types';
import { DEFAULT_PREFERENCES } from './types';

// ==================== Constants ====================

const STORAGE_KEY = 'recoder_notifications_v2';
const PREFERENCES_KEY = 'recoder_notification_preferences';
const MAX_NOTIFICATIONS = 100;
const NOTIFICATION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// ==================== Stores ====================

/**
 * Notifications list store
 */
export const notificationsStore = atom<Notification[]>([]);

/**
 * Unread count store
 */
export const unreadCountStore = atom<number>(0);

/**
 * Preferences store
 */
export const preferencesStore = map<NotificationPreferences>(DEFAULT_PREFERENCES);

/**
 * Panel visibility store
 */
export const notificationsPanelOpen = atom<boolean>(false);

/**
 * Toast queue store (notifications to show as toasts)
 */
export const toastQueueStore = atom<Notification[]>([]);

// ==================== Internal State ====================

let eventListeners: Map<NotificationEventType, Set<NotificationEventListener>> = new Map();
let isInitialized = false;

// ==================== Helper Functions ====================

/**
 * Generate a unique notification ID
 */
function generateId(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Emit a notification event
 */
function emitEvent(type: NotificationEventType, notification?: Notification, metadata?: Record<string, unknown>): void {
  const event: NotificationEvent = {
    type,
    notification,
    timestamp: Date.now(),
    metadata,
  };

  const listeners = eventListeners.get(type);
  if (listeners) {
    listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[NotificationManager] Error in event listener:', error);
      }
    });
  }
}

/**
 * Save notifications to localStorage
 */
function saveNotifications(notifications: Notification[]): void {
  if (typeof window === 'undefined') return;

  try {
    // Only persist persistent notifications
    const toSave = notifications
      .filter(n => n.persistent)
      .slice(0, MAX_NOTIFICATIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    console.error('[NotificationManager] Failed to save notifications:', error);
  }
}

/**
 * Load notifications from localStorage
 */
function loadNotifications(): Notification[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Notification[];
      // Filter out expired notifications
      const cutoff = Date.now() - NOTIFICATION_TTL;
      return parsed.filter(n => n.timestamp > cutoff);
    }
  } catch (error) {
    console.error('[NotificationManager] Failed to load notifications:', error);
  }

  return [];
}

/**
 * Save preferences to localStorage
 */
function savePreferences(preferences: NotificationPreferences): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('[NotificationManager] Failed to save preferences:', error);
  }
}

/**
 * Load preferences from localStorage
 */
function loadPreferences(): NotificationPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;

  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error('[NotificationManager] Failed to load preferences:', error);
  }

  return DEFAULT_PREFERENCES;
}

/**
 * Calculate unread count from notifications
 */
function calculateUnreadCount(notifications: Notification[]): number {
  return notifications.filter(n => !n.read).length;
}

/**
 * Check if currently in quiet hours
 */
function isInQuietHours(): boolean {
  const prefs = preferencesStore.get();
  if (!prefs.quietHours.enabled) return false;

  const now = new Date();
  const currentDay = now.getDay();

  if (!prefs.quietHours.days.includes(currentDay)) return false;

  const currentTime = now.getHours() * 60 + now.getMinutes();
  const [startHour, startMin] = prefs.quietHours.startTime.split(':').map(Number);
  const [endHour, endMin] = prefs.quietHours.endTime.split(':').map(Number);

  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  if (startTime <= endTime) {
    return currentTime >= startTime && currentTime < endTime;
  } else {
    // Overnight quiet hours (e.g., 22:00 - 08:00)
    return currentTime >= startTime || currentTime < endTime;
  }
}

// ==================== Public API ====================

/**
 * Initialize the notification manager
 */
export function initNotificationManager(): void {
  if (isInitialized) return;

  const notifications = loadNotifications();
  const preferences = loadPreferences();

  notificationsStore.set(notifications);
  unreadCountStore.set(calculateUnreadCount(notifications));
  preferencesStore.set(preferences);

  isInitialized = true;
  console.log('[NotificationManager] Initialized with', notifications.length, 'notifications');
}

/**
 * Add a new notification
 */
export function addNotification(options: AddNotificationOptions): Notification {
  const prefs = preferencesStore.get();
  const typeSettings = prefs.typeSettings[options.type];

  const notification: Notification = {
    id: generateId(),
    type: options.type,
    title: options.title,
    message: options.message,
    timestamp: Date.now(),
    read: false,
    priority: options.priority || 'normal',
    actions: options.actions,
    persistent: options.persistent ?? (options.type === 'error' || options.type === 'warning'),
    groupKey: options.groupKey,
    metadata: options.metadata,
    icon: options.icon,
    source: options.source,
    autoDismiss: options.autoDismiss ?? prefs.defaultToastDuration,
    toastShown: false,
  };

  // Add to store
  const currentNotifications = notificationsStore.get();
  const newNotifications = [notification, ...currentNotifications].slice(0, prefs.maxNotifications);

  notificationsStore.set(newNotifications);
  unreadCountStore.set(calculateUnreadCount(newNotifications));
  saveNotifications(newNotifications);

  // Emit event
  emitEvent('notification:added', notification);

  // Check if should show toast (respecting quiet hours and preferences)
  const showToast = options.showToast ?? typeSettings.toast;
  const inQuietHours = isInQuietHours();
  const allowDuringQuiet = prefs.quietHours.allowUrgent && notification.priority === 'urgent';

  if (showToast && (!inQuietHours || allowDuringQuiet)) {
    const queue = toastQueueStore.get();
    toastQueueStore.set([...queue, { ...notification, toastShown: true }]);
    emitEvent('toast:show', notification);
  }

  // Play sound (handled by sound-notifications service)
  const playSound = options.playSound ?? typeSettings.sound;
  if (playSound && (!inQuietHours || allowDuringQuiet)) {
    emitEvent('sound:played', notification);
  }

  return notification;
}

/**
 * Mark a notification as read
 */
export function markAsRead(id: string): void {
  const notifications = notificationsStore.get();
  const index = notifications.findIndex(n => n.id === id);

  if (index === -1) return;

  const notification = notifications[index];
  if (notification.read) return;

  const newNotifications = [...notifications];
  newNotifications[index] = { ...notification, read: true };

  notificationsStore.set(newNotifications);
  unreadCountStore.set(calculateUnreadCount(newNotifications));
  saveNotifications(newNotifications);

  emitEvent('notification:read', newNotifications[index]);
}

/**
 * Mark all notifications as read
 */
export function markAllAsRead(): void {
  const notifications = notificationsStore.get();
  const newNotifications = notifications.map(n => ({ ...n, read: true }));

  notificationsStore.set(newNotifications);
  unreadCountStore.set(0);
  saveNotifications(newNotifications);

  emitEvent('notification:read');
}

/**
 * Remove a single notification
 */
export function removeNotification(id: string): void {
  const notifications = notificationsStore.get();
  const notification = notifications.find(n => n.id === id);
  const newNotifications = notifications.filter(n => n.id !== id);

  notificationsStore.set(newNotifications);
  unreadCountStore.set(calculateUnreadCount(newNotifications));
  saveNotifications(newNotifications);

  emitEvent('notification:removed', notification);
}

/**
 * Clear all notifications
 */
export function clearAllNotifications(): void {
  notificationsStore.set([]);
  unreadCountStore.set(0);

  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }

  emitEvent('notification:cleared');
}

/**
 * Get notifications by filter
 */
export function getNotifications(filter?: NotificationFilter): Notification[] {
  let notifications = notificationsStore.get();

  if (!filter) return notifications;

  if (filter.types) {
    notifications = notifications.filter(n => filter.types!.includes(n.type));
  }

  if (filter.read !== undefined) {
    notifications = notifications.filter(n => n.read === filter.read);
  }

  if (filter.priority) {
    notifications = notifications.filter(n => filter.priority!.includes(n.priority));
  }

  if (filter.fromTimestamp) {
    notifications = notifications.filter(n => n.timestamp >= filter.fromTimestamp!);
  }

  if (filter.toTimestamp) {
    notifications = notifications.filter(n => n.timestamp <= filter.toTimestamp!);
  }

  if (filter.groupKey) {
    notifications = notifications.filter(n => n.groupKey === filter.groupKey);
  }

  if (filter.source) {
    notifications = notifications.filter(n => n.source === filter.source);
  }

  return notifications;
}

/**
 * Get unread notifications
 */
export function getUnreadNotifications(): Notification[] {
  return notificationsStore.get().filter(n => !n.read);
}

/**
 * Get notifications by type
 */
export function getNotificationsByType(type: NotificationType): Notification[] {
  return notificationsStore.get().filter(n => n.type === type);
}

/**
 * Get grouped notifications
 */
export function getGroupedNotifications(): NotificationGroup[] {
  const notifications = notificationsStore.get();
  const prefs = preferencesStore.get();

  if (!prefs.groupSimilar) {
    // Return each notification as its own group
    return notifications.map(n => ({
      key: n.id,
      notifications: [n],
      count: 1,
      latestTimestamp: n.timestamp,
      unreadCount: n.read ? 0 : 1,
    }));
  }

  const groups = new Map<string, Notification[]>();

  for (const notification of notifications) {
    const key = notification.groupKey || notification.id;
    const group = groups.get(key) || [];
    group.push(notification);
    groups.set(key, group);
  }

  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    notifications: items,
    count: items.length,
    latestTimestamp: Math.max(...items.map(n => n.timestamp)),
    unreadCount: items.filter(n => !n.read).length,
  })).sort((a, b) => b.latestTimestamp - a.latestTimestamp);
}

/**
 * Update notification preferences
 */
export function updatePreferences(updates: Partial<NotificationPreferences>): void {
  const current = preferencesStore.get();
  const newPreferences = { ...current, ...updates };

  preferencesStore.set(newPreferences);
  savePreferences(newPreferences);

  emitEvent('preferences:changed');
}

/**
 * Reset preferences to defaults
 */
export function resetPreferences(): void {
  preferencesStore.set(DEFAULT_PREFERENCES);
  savePreferences(DEFAULT_PREFERENCES);

  emitEvent('preferences:changed');
}

/**
 * Open/close notification panel
 */
export function openNotificationsPanel(): void {
  notificationsPanelOpen.set(true);
}

export function closeNotificationsPanel(): void {
  notificationsPanelOpen.set(false);
}

export function toggleNotificationsPanel(): void {
  notificationsPanelOpen.set(!notificationsPanelOpen.get());
}

/**
 * Remove a toast from the queue
 */
export function dismissToast(id: string): void {
  const queue = toastQueueStore.get();
  const notification = queue.find(n => n.id === id);
  toastQueueStore.set(queue.filter(n => n.id !== id));

  emitEvent('toast:dismiss', notification);
}

/**
 * Add an event listener
 */
export function addEventListener(type: NotificationEventType, listener: NotificationEventListener): () => void {
  if (!eventListeners.has(type)) {
    eventListeners.set(type, new Set());
  }

  eventListeners.get(type)!.add(listener);

  // Return unsubscribe function
  return () => {
    eventListeners.get(type)?.delete(listener);
  };
}

/**
 * Remove an event listener
 */
export function removeEventListener(type: NotificationEventType, listener: NotificationEventListener): void {
  eventListeners.get(type)?.delete(listener);
}

// ==================== Convenience Functions ====================

/**
 * Show an info notification
 */
export function notifyInfo(title: string, message: string, options?: Partial<AddNotificationOptions>): Notification {
  return addNotification({ type: 'info', title, message, ...options });
}

/**
 * Show a success notification
 */
export function notifySuccess(title: string, message: string, options?: Partial<AddNotificationOptions>): Notification {
  return addNotification({ type: 'success', title, message, ...options });
}

/**
 * Show a warning notification
 */
export function notifyWarning(title: string, message: string, options?: Partial<AddNotificationOptions>): Notification {
  return addNotification({ type: 'warning', title, message, persistent: true, ...options });
}

/**
 * Show an error notification
 */
export function notifyError(title: string, message: string, options?: Partial<AddNotificationOptions>): Notification {
  return addNotification({ type: 'error', title, message, persistent: true, priority: 'high', ...options });
}

/**
 * Show an AI notification
 */
export function notifyAI(title: string, message: string, options?: Partial<AddNotificationOptions>): Notification {
  return addNotification({ type: 'ai', title, message, ...options });
}

/**
 * Show a collaboration notification
 */
export function notifyCollaboration(title: string, message: string, options?: Partial<AddNotificationOptions>): Notification {
  return addNotification({ type: 'collaboration', title, message, ...options });
}

// ==================== Format Helpers ====================

/**
 * Format relative time from timestamp
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return 'just now';
  } else if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else if (days < 7) {
    return `${days}d ago`;
  } else {
    return new Date(timestamp).toLocaleDateString();
  }
}

// Initialize on module load if in browser
if (typeof window !== 'undefined') {
  initNotificationManager();
}
