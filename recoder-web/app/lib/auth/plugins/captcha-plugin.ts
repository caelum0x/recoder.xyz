/**
 * Captcha Plugin for better-auth
 * Provides Cloudflare Turnstile captcha verification
 */

import { getAuthEnv, isCaptchaConfigured } from '../env';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CaptchaPlugin');

/**
 * Captcha providers
 */
export type CaptchaProvider = 'cloudflare-turnstile' | 'google-recaptcha' | 'hcaptcha';

/**
 * Captcha plugin configuration
 */
export interface CaptchaPluginConfig {
  /**
   * Captcha provider to use
   * @default 'cloudflare-turnstile'
   */
  provider?: CaptchaProvider;

  /**
   * Secret key for the captcha provider
   */
  secretKey?: string;

  /**
   * Site key for the captcha provider (for client-side)
   */
  siteKey?: string;

  /**
   * Endpoints to protect with captcha
   * @default ['/email-otp/send-verification-otp']
   */
  endpoints?: string[];
}

/**
 * Turnstile verification response
 */
interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

/**
 * Verify Cloudflare Turnstile token
 */
export async function verifyTurnstileToken(
  token: string,
  secretKey: string,
  ip?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);

    if (ip) {
      formData.append('remoteip', ip);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data = (await response.json()) as TurnstileResponse;

    if (data.success) {
      return { success: true };
    }

    const errorCodes = data['error-codes'] || [];
    logger.error('[Captcha] Turnstile verification failed:', errorCodes);

    return {
      success: false,
      error: errorCodes.length > 0 ? errorCodes.join(', ') : 'Verification failed',
    };
  } catch (error) {
    logger.error('[Captcha] Error verifying Turnstile token:', error);
    return { success: false, error: 'Verification failed' };
  }
}

/**
 * Verify Google reCAPTCHA token
 */
export async function verifyRecaptchaToken(
  token: string,
  secretKey: string,
  ip?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);

    if (ip) {
      formData.append('remoteip', ip);
    }

    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data = (await response.json()) as { success: boolean; 'error-codes'?: string[] };

    if (data.success) {
      return { success: true };
    }

    const errorCodes = data['error-codes'] || [];
    logger.error('[Captcha] reCAPTCHA verification failed:', errorCodes);

    return {
      success: false,
      error: errorCodes.length > 0 ? errorCodes.join(', ') : 'Verification failed',
    };
  } catch (error) {
    logger.error('[Captcha] Error verifying reCAPTCHA token:', error);
    return { success: false, error: 'Verification failed' };
  }
}

/**
 * Verify hCaptcha token
 */
export async function verifyHcaptchaToken(
  token: string,
  secretKey: string,
  siteKey?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);

    if (siteKey) {
      formData.append('sitekey', siteKey);
    }

    const response = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data = (await response.json()) as { success: boolean; 'error-codes'?: string[] };

    if (data.success) {
      return { success: true };
    }

    const errorCodes = data['error-codes'] || [];
    logger.error('[Captcha] hCaptcha verification failed:', errorCodes);

    return {
      success: false,
      error: errorCodes.length > 0 ? errorCodes.join(', ') : 'Verification failed',
    };
  } catch (error) {
    logger.error('[Captcha] Error verifying hCaptcha token:', error);
    return { success: false, error: 'Verification failed' };
  }
}

/**
 * Verify captcha token based on provider
 */
export async function verifyCaptcha(
  token: string,
  provider: CaptchaProvider,
  secretKey: string,
  options?: { ip?: string; siteKey?: string }
): Promise<{ success: boolean; error?: string }> {
  switch (provider) {
    case 'cloudflare-turnstile':
      return verifyTurnstileToken(token, secretKey, options?.ip);
    case 'google-recaptcha':
      return verifyRecaptchaToken(token, secretKey, options?.ip);
    case 'hcaptcha':
      return verifyHcaptchaToken(token, secretKey, options?.siteKey);
    default:
      return { success: false, error: `Unknown captcha provider: ${provider}` };
  }
}

/**
 * Create the Captcha plugin configuration
 */
export function createCaptchaPlugin(config: CaptchaPluginConfig = {}) {
  const env = getAuthEnv();

  const {
    provider = 'cloudflare-turnstile',
    secretKey = env.TURNSTILE_SECRET_KEY,
    siteKey = env.TURNSTILE_SITE_KEY,
    endpoints = ['/email-otp/send-verification-otp'],
  } = config;

  // If captcha is not configured, return null
  if (!secretKey) {
    logger.warn('[Captcha] Captcha not configured - plugin disabled');
    return null;
  }

  return {
    id: 'captcha',
    provider,
    secretKey,
    siteKey,
    endpoints,

    /**
     * Verify captcha token
     */
    async verify(token: string, ip?: string): Promise<{ success: boolean; error?: string }> {
      return verifyCaptcha(token, provider, secretKey, { ip, siteKey });
    },
  };
}

/**
 * Pre-configured Captcha plugin (returns null if not configured)
 */
export const captchaPlugin = isCaptchaConfigured()
  ? createCaptchaPlugin({
      provider: 'cloudflare-turnstile',
      endpoints: ['/email-otp/send-verification-otp'],
    })
  : null;

/**
 * Extract captcha token from request
 */
export function extractCaptchaToken(request: Request): string | null {
  const url = new URL(request.url);

  // Check query params
  const tokenFromQuery = url.searchParams.get('cf-turnstile-response');
  if (tokenFromQuery) {
    return tokenFromQuery;
  }

  // Check headers
  const tokenFromHeader =
    request.headers.get('cf-turnstile-response') || request.headers.get('x-captcha-token');

  if (tokenFromHeader) {
    return tokenFromHeader;
  }

  return null;
}

/**
 * Middleware to verify captcha
 */
export async function captchaMiddleware(
  request: Request,
  config?: CaptchaPluginConfig
): Promise<{ success: boolean; error?: string }> {
  const env = getAuthEnv();
  const secretKey = config?.secretKey || env.TURNSTILE_SECRET_KEY;
  const provider = config?.provider || 'cloudflare-turnstile';
  const endpoints = config?.endpoints || ['/email-otp/send-verification-otp'];

  // Check if this endpoint requires captcha
  const url = new URL(request.url);
  const requiresCaptcha = endpoints.some(
    (endpoint) => url.pathname.includes(endpoint) || url.pathname.endsWith(endpoint)
  );

  if (!requiresCaptcha) {
    return { success: true };
  }

  // If captcha is not configured, skip verification
  if (!secretKey) {
    logger.warn('[Captcha] Captcha not configured - skipping verification');
    return { success: true };
  }

  // Extract token
  let token = extractCaptchaToken(request);

  // If not in query/headers, try to get from body
  if (!token && request.method === 'POST') {
    try {
      const clonedRequest = request.clone();
      const body = (await clonedRequest.json()) as { 'cf-turnstile-response'?: string };
      token = body['cf-turnstile-response'] || null;
    } catch {
      // Body parsing failed, token stays null
    }
  }

  if (!token) {
    return { success: false, error: 'Captcha token required' };
  }

  // Get client IP
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    undefined;

  return verifyCaptcha(token, provider, secretKey, { ip });
}

/**
 * Client-side helper: Get Turnstile script URL
 */
export function getTurnstileScriptUrl(): string {
  return 'https://challenges.cloudflare.com/turnstile/v0/api.js';
}

/**
 * Client-side helper: Get Turnstile site key from environment
 */
export function getTurnstileSiteKey(): string | undefined {
  const env = getAuthEnv();
  return env.TURNSTILE_SITE_KEY;
}
