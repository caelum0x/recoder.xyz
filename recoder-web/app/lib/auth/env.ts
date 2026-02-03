/**
 * Environment configuration for auth
 * Provides typed access to environment variables
 */

export interface AuthEnv {
  // GitHub OAuth
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;

  // Stripe
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PUBLISHABLE_KEY?: string;

  // Cloudflare Turnstile (captcha)
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;

  // Email (Resend)
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;

  // App URLs
  APP_URL?: string;
  MAIN_SITE_URL?: string;

  // Admin
  ADMIN_USER_IDS?: string;
}

/**
 * Get environment variable with fallback
 */
function getEnvVar(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

/**
 * Get auth environment configuration
 */
export function getAuthEnv(): AuthEnv {
  return {
    // GitHub OAuth
    GITHUB_CLIENT_ID: getEnvVar('GITHUB_CLIENT_ID') || getEnvVar('BETTER_GITHUB_CLIENT_ID'),
    GITHUB_CLIENT_SECRET: getEnvVar('GITHUB_CLIENT_SECRET') || getEnvVar('BETTER_GITHUB_CLIENT_SECRET'),

    // Stripe
    STRIPE_SECRET_KEY: getEnvVar('STRIPE_SECRET_KEY'),
    STRIPE_WEBHOOK_SECRET: getEnvVar('STRIPE_WEBHOOK_SECRET'),
    STRIPE_PUBLISHABLE_KEY: getEnvVar('STRIPE_PUBLISHABLE_KEY'),

    // Cloudflare Turnstile
    TURNSTILE_SECRET_KEY: getEnvVar('TURNSTILE_SECRET_KEY'),
    TURNSTILE_SITE_KEY: getEnvVar('TURNSTILE_SITE_KEY'),

    // Email
    RESEND_API_KEY: getEnvVar('RESEND_API_KEY'),
    RESEND_FROM: getEnvVar('RESEND_FROM') || 'noreply@recoder.xyz',

    // App URLs
    APP_URL: getEnvVar('APP_URL') || getEnvVar('NEXT_PUBLIC_APP_URL'),
    MAIN_SITE_URL: getEnvVar('MAIN_SITE_URL') || 'https://recoder.xyz',

    // Admin
    ADMIN_USER_IDS: getEnvVar('ADMIN_USER_IDS'),
  };
}

/**
 * Parse comma-separated admin user IDs from environment variable
 */
export function getAdminUserIds(): string[] {
  const env = getAuthEnv();
  if (!env.ADMIN_USER_IDS) {
    return [];
  }

  return env.ADMIN_USER_IDS.split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  const env = getAuthEnv();
  return !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

/**
 * Check if captcha is configured
 */
export function isCaptchaConfigured(): boolean {
  const env = getAuthEnv();
  return !!env.TURNSTILE_SECRET_KEY;
}

/**
 * Check if email is configured
 */
export function isEmailConfigured(): boolean {
  const env = getAuthEnv();
  return !!(env.RESEND_API_KEY && env.RESEND_FROM);
}
