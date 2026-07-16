export interface BillingProviderHealth {
  configured: boolean;
  webhookConfigured: boolean;
  checkoutConfigured: boolean;
}

export interface BillingHealth {
  configured: boolean;
  activeProvider: string;
  paddle: BillingProviderHealth;
  dodo: BillingProviderHealth;
  polar: BillingProviderHealth;
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

function normalizeSecret(raw: string): string {
  const withoutInlineComment = raw.split('#')[0] || '';
  return withoutInlineComment.trim();
}

function hasAny(env: NodeJS.ProcessEnv, keys: string[]): boolean {
  return keys.some((key) => {
    const raw = env[key];
    if (typeof raw !== 'string') return false;
    const value = normalizeSecret(raw);
    return value.length > 0 && !isPlaceholder(value);
  });
}

export function detectBillingHealth(env: NodeJS.ProcessEnv = process.env): BillingHealth {
  const paddleWebhook = hasAny(env, ['PADDLE_PUBLIC_KEY', 'PADDLE_WEBHOOK_SECRET']);
  const paddleCheckout = hasAny(env, [
    'PADDLE_API_KEY',
    'PADDLE_AUTH_CODE',
    'PADDLE_VENDOR_ID',
    'NEXT_PUBLIC_PADDLE_VENDOR_ID',
  ]);

  const dodoWebhook = hasAny(env, ['DODO_WEBHOOK_SECRET', 'DODO_PAY_WEBHOOK_SECRET']);
  const dodoCheckout = hasAny(env, [
    'DODO_API_KEY',
    'DODO_PAYMENTS_API_KEY',
    'DODO_API_KEY_LIVE',
    'DODO_API_KEY_TEST',
    'DODO_PAY_API_KEY',
  ]);

  const polarWebhook = hasAny(env, ['POLAR_WEBHOOK_SECRET']);
  const polarCheckout = hasAny(env, ['POLAR_API_KEY', 'POLAR_ACCESS_TOKEN']);

  const paddleConfigured = paddleCheckout || paddleWebhook;
  const dodoConfigured = dodoCheckout || dodoWebhook;
  const polarConfigured = polarCheckout || polarWebhook;

  // Determine active provider based on PAYMENT_PROVIDER env or auto-detect
  const explicit = (env.PAYMENT_PROVIDER || '').toLowerCase().trim();
  let activeProvider = 'none';
  if (explicit === 'polar' && polarConfigured) {
    activeProvider = 'polar';
  } else if (explicit === 'dodo' && dodoConfigured) {
    activeProvider = 'dodo';
  } else if (explicit === 'none' || explicit === 'disabled' || explicit === 'off') {
    activeProvider = 'none';
  } else if (polarConfigured) {
    activeProvider = 'polar';
  } else if (dodoConfigured) {
    activeProvider = 'dodo';
  } else if (paddleConfigured) {
    activeProvider = 'paddle';
  }

  return {
    configured: paddleConfigured || dodoConfigured || polarConfigured,
    activeProvider,
    paddle: {
      configured: paddleConfigured,
      webhookConfigured: paddleWebhook,
      checkoutConfigured: paddleCheckout,
    },
    dodo: {
      configured: dodoConfigured,
      webhookConfigured: dodoWebhook,
      checkoutConfigured: dodoCheckout,
    },
    polar: {
      configured: polarConfigured,
      webhookConfigured: polarWebhook,
      checkoutConfigured: polarCheckout,
    },
  };
}
