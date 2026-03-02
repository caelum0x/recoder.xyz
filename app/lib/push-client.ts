function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  // Build from a plain number[] so TS infers an ArrayBuffer-backed Uint8Array
  // that satisfies PushManager's BufferSource requirement.
  const bytes = new Array<number>(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    bytes[i] = rawData.charCodeAt(i);
  }
  return Uint8Array.from(bytes);
}

export async function registerPushNotifications(): Promise<{ ok: boolean; message: string }> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, message: 'Push notifications are not supported in this browser' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, message: 'Notification permission denied' };
  }

  const keyRes = await fetch('/api/push/public-key');
  const keyJson = await keyRes.json();
  const publicKey = keyJson?.publicKey;
  if (!publicKey) {
    return { ok: false, message: 'VAPID public key is not configured' };
  }

  const registration = await navigator.serviceWorker.register('/service-worker.js');
  const existing = await registration.pushManager.getSubscription();

  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
    }));

  const saveRes = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  });

  if (!saveRes.ok) {
    return { ok: false, message: 'Failed to save push subscription' };
  }

  return { ok: true, message: 'Push notifications enabled' };
}

export async function unregisterPushNotifications(): Promise<{ ok: boolean; message: string }> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { ok: false, message: 'Service workers unsupported' };
  }

  const registration = await navigator.serviceWorker.getRegistration('/service-worker.js');
  if (!registration) return { ok: true, message: 'No active push registration' };

  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  }

  return { ok: true, message: 'Push notifications disabled' };
}
