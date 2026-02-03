import { atom, map } from 'nanostores';

// Storage key for persisting notifications
const NOTIFICATIONS_KEY = 'recoder_notifications';
const MAX_NOTIFICATIONS = 50;

// Notification types
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  persistent: boolean; // Whether to persist even after user dismisses toasts
}

export interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
}

// Generate unique ID
function generateId(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Load notifications from localStorage
function loadNotifications(): Notification[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(NOTIFICATIONS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Filter out old notifications (older than 7 days)
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return parsed.filter((n: Notification) => n.timestamp > sevenDaysAgo);
    }
  } catch (e) {
    console.error('[Notifications] Failed to load notifications:', e);
  }

  return [];
}

// Save notifications to localStorage
function saveNotifications(notifications: Notification[]): void {
  if (typeof window === 'undefined') return;

  try {
    // Only persist important (persistent) notifications
    const toSave = notifications
      .filter(n => n.persistent)
      .slice(0, MAX_NOTIFICATIONS);
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error('[Notifications] Failed to save notifications:', e);
  }
}

// Calculate unread count
function getUnreadCount(notifications: Notification[]): number {
  return notifications.filter(n => !n.read).length;
}

// Initialize notifications store
const initialNotifications = loadNotifications();

export const notificationsStore = map<NotificationsState>({
  notifications: initialNotifications,
  unreadCount: getUnreadCount(initialNotifications),
});

// Panel visibility
export const notificationsPanelOpen = atom<boolean>(false);

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
 * Add a new notification
 * @param type The notification type
 * @param title The notification title
 * @param message The notification message
 * @param persistent Whether to persist to localStorage (default: false for info, true for errors)
 */
export function addNotification(
  type: NotificationType,
  title: string,
  message: string,
  persistent?: boolean
): Notification {
  const notification: Notification = {
    id: generateId(),
    type,
    title,
    message,
    timestamp: Date.now(),
    read: false,
    // By default, errors and warnings are persistent
    persistent: persistent ?? (type === 'error' || type === 'warning'),
  };

  const state = notificationsStore.get();
  const newNotifications = [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS);

  notificationsStore.set({
    notifications: newNotifications,
    unreadCount: getUnreadCount(newNotifications),
  });

  saveNotifications(newNotifications);

  return notification;
}

/**
 * Mark a notification as read
 * @param id The notification ID
 */
export function markAsRead(id: string): void {
  const state = notificationsStore.get();
  const newNotifications = state.notifications.map(n =>
    n.id === id ? { ...n, read: true } : n
  );

  notificationsStore.set({
    notifications: newNotifications,
    unreadCount: getUnreadCount(newNotifications),
  });

  saveNotifications(newNotifications);
}

/**
 * Mark all notifications as read
 */
export function markAllAsRead(): void {
  const state = notificationsStore.get();
  const newNotifications = state.notifications.map(n => ({ ...n, read: true }));

  notificationsStore.set({
    notifications: newNotifications,
    unreadCount: 0,
  });

  saveNotifications(newNotifications);
}

/**
 * Remove a single notification
 * @param id The notification ID
 */
export function removeNotification(id: string): void {
  const state = notificationsStore.get();
  const newNotifications = state.notifications.filter(n => n.id !== id);

  notificationsStore.set({
    notifications: newNotifications,
    unreadCount: getUnreadCount(newNotifications),
  });

  saveNotifications(newNotifications);
}

/**
 * Clear all notifications
 */
export function clearAll(): void {
  notificationsStore.set({
    notifications: [],
    unreadCount: 0,
  });

  if (typeof window !== 'undefined') {
    localStorage.removeItem(NOTIFICATIONS_KEY);
  }
}

/**
 * Get notifications by type
 * @param type The notification type to filter by
 */
export function getNotificationsByType(type: NotificationType): Notification[] {
  return notificationsStore.get().notifications.filter(n => n.type === type);
}

/**
 * Get unread notifications
 */
export function getUnreadNotifications(): Notification[] {
  return notificationsStore.get().notifications.filter(n => !n.read);
}

// Helper to format relative time
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
