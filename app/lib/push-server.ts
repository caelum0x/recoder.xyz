interface StoredPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PushPayload {
  title: string;
  body: string;
  url: string;
  timestamp: string;
  type: string;
}

interface SendPushResult {
  ok: boolean;
  endpoint: string;
  statusCode?: number;
  error?: string;
}

const VAPID_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function normalizePublicVapidKey(key: string): string {
  // Allow passing either URL-safe base64 or standard base64.
  return key.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function vapidConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function isWebPushEnabled(): boolean {
  const value = (process.env.WEB_PUSH_ENABLED || 'true').toLowerCase().trim();
  return VAPID_TRUE_VALUES.has(value);
}

let vapidInitialized = false;

async function ensureVapidConfigured() {
  if (vapidInitialized) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || 'mailto:security@recoder.xyz';

  if (!publicKey || !privateKey) {
    throw new Error('Missing VAPID keys. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.');
  }

  const webPush = await import('web-push');
  webPush.setVapidDetails(subject, normalizePublicVapidKey(publicKey), privateKey);
  vapidInitialized = true;
}

export async function sendWebPush(
  subscription: StoredPushSubscription,
  payload: PushPayload
): Promise<SendPushResult> {
  try {
    if (!isWebPushEnabled()) {
      return {
        ok: false,
        endpoint: subscription.endpoint,
        error: 'WEB_PUSH_ENABLED is false',
      };
    }

    if (!vapidConfigured()) {
      return {
        ok: false,
        endpoint: subscription.endpoint,
        error: 'VAPID keys are not configured',
      };
    }

    await ensureVapidConfigured();
    const webPush = await import('web-push');

    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload)
    );

    return { ok: true, endpoint: subscription.endpoint };
  } catch (error: any) {
    return {
      ok: false,
      endpoint: subscription.endpoint,
      statusCode: error?.statusCode,
      error: error?.message || String(error),
    };
  }
}

export function isStaleSubscription(result: SendPushResult): boolean {
  return result.statusCode === 404 || result.statusCode === 410;
}
