function normalizeSecret(raw: string): string {
  // Handle copied placeholders like:
  // "your_live_api_key_here # obtained from ...".
  const withoutInlineComment = raw.split('#')[0] || '';
  return withoutInlineComment.trim();
}

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.startsWith('your_') ||
    lower.startsWith('your-') ||
    lower.includes('your_live_api_key_here') ||
    lower.includes('your_test_api_key_here') ||
    lower.includes('obtained from') ||
    lower.includes('replace_me') ||
    lower.includes('example')
  );
}

function firstSet(keys: string[]): string | null {
  for (const key of keys) {
    const raw = process.env[key];
    if (typeof raw !== 'string') continue;
    const value = normalizeSecret(raw);
    if (value.length > 0 && !isPlaceholder(value)) {
      return value;
    }
  }
  return null;
}

export function resolvePaddleVendorId(): string | null {
  return firstSet(['PADDLE_VENDOR_ID', 'NEXT_PUBLIC_PADDLE_VENDOR_ID']);
}

export function resolvePaddleAuthCode(): string | null {
  return firstSet(['PADDLE_AUTH_CODE', 'PADDLE_API_KEY']);
}

export function resolveDodoApiKey(): string | null {
  const preferred = firstSet(['DODO_PAYMENTS_API_KEY', 'DODO_API_KEY']);
  if (preferred) return preferred;

  if (process.env.NODE_ENV === 'production') {
    return firstSet(['DODO_API_KEY_LIVE', 'DODO_API_KEY_TEST', 'DODO_PAY_API_KEY']);
  }

  return firstSet(['DODO_API_KEY_TEST', 'DODO_API_KEY_LIVE', 'DODO_PAY_API_KEY']);
}

export function resolvePolarApiKey(): string | null {
  return firstSet(['POLAR_API_KEY', 'POLAR_ACCESS_TOKEN']);
}

export function resolvePolarWebhookSecret(): string | null {
  return firstSet(['POLAR_WEBHOOK_SECRET']);
}
