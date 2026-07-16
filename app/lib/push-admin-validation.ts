export interface NormalizedPushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface NormalizePushMessageInput {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

export function normalizePushMessage(input: NormalizePushMessageInput): NormalizedPushMessage {
  const title = (input.title || '').trim().slice(0, 120);
  const body = (input.body || '').trim().slice(0, 500);
  const url = (input.url || '/').trim().slice(0, 256);
  const tag = input.tag?.trim().slice(0, 64);

  return {
    title,
    body,
    url,
    ...(tag ? { tag } : {}),
  };
}

export function validatePushMessage(input: NormalizedPushMessage): string | null {
  if (!input.title || !input.body || !input.url) {
    return 'title, body, and url are required';
  }

  if (!input.url.startsWith('/')) {
    return 'url must start with "/"';
  }

  return null;
}

export function clampMaxTargets(rawValue: unknown, fallback = 200, max = 500): number {
  if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) return fallback;
  const rounded = Math.floor(rawValue);
  if (rounded < 1) return 1;
  if (rounded > max) return max;
  return rounded;
}
