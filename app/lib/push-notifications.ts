/**
 * Client-side Web Push Notifications utility
 *
 * Usage:
 *   import { initPushNotifications } from '@/lib/push-notifications';
 *   const result = await initPushNotifications();
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PushStatus =
  | { ok: true; subscription: PushSubscription }
  | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a URL-safe base64 VAPID public key to a Uint8Array
 * required by pushManager.subscribe().
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register the service worker located at /sw.js.
 * Returns the ServiceWorkerRegistration or null on failure.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    // Wait for the SW to be ready if it is not yet active
    if (!registration.active) {
      await navigator.serviceWorker.ready;
    }

    return registration;
  } catch (error) {
    console.error('[push] Service worker registration failed:', error);
    return null;
  }
}

/**
 * Request notification permission from the user.
 * Returns 'granted', 'denied', or 'default'.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  // If already decided, return the current state without prompting
  if (Notification.permission !== 'default') {
    return Notification.permission;
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Subscribe the current browser to push via the PushManager.
 * Requires a VAPID public key from `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
 */
export async function subscribeToPush(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!vapidPublicKey) {
    console.error('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set');
    return null;
  }

  try {
    // Check for an existing subscription first
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      return existing;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });

    return subscription;
  } catch (error) {
    console.error('[push] Push subscription failed:', error);
    return null;
  }
}

/**
 * Send the PushSubscription to the server so it can send pushes later.
 * Posts to `/api/notifications/push-subscribe`.
 */
export async function sendSubscriptionToServer(
  subscription: PushSubscription
): Promise<boolean> {
  try {
    const response = await fetch('/api/notifications/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });

    if (!response.ok) {
      console.error('[push] Server rejected subscription:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[push] Failed to send subscription to server:', error);
    return false;
  }
}

/**
 * Full orchestration: check support -> request permission -> register SW ->
 * subscribe -> send to server.
 */
export async function initPushNotifications(): Promise<PushStatus> {
  // 1. Feature detection
  if (typeof window === 'undefined') {
    return { ok: false, reason: 'not-browser' };
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'push-not-supported' };
  }

  // 2. Permission
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: `permission-${permission}` };
  }

  // 3. Register SW
  const registration = await registerServiceWorker();
  if (!registration) {
    return { ok: false, reason: 'sw-registration-failed' };
  }

  // 4. Subscribe to push
  const subscription = await subscribeToPush(registration);
  if (!subscription) {
    return { ok: false, reason: 'push-subscribe-failed' };
  }

  // 5. Persist on server
  const sent = await sendSubscriptionToServer(subscription);
  if (!sent) {
    return { ok: false, reason: 'server-save-failed' };
  }

  return { ok: true, subscription };
}

/**
 * Returns the current notification permission without prompting.
 */
export function getNotificationPermission(): NotificationPermission | null {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return null;
  }
  return Notification.permission;
}

/**
 * Check whether the browser supports web push.
 */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
