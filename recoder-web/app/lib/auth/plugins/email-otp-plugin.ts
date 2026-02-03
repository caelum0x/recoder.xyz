/**
 * Email OTP Plugin for better-auth
 * Provides email-based one-time password authentication
 */

import { getAuthEnv, isEmailConfigured } from '../env';

/**
 * OTP types
 */
export type OTPType = 'sign-in' | 'email-verification' | 'password-reset';

/**
 * Email OTP plugin configuration
 */
export interface EmailOTPPluginConfig {
  /**
   * Length of the OTP code
   * @default 6
   */
  otpLength?: number;

  /**
   * OTP expiration time in seconds
   * @default 600 (10 minutes)
   */
  expiresIn?: number;

  /**
   * Custom function to send verification OTP
   */
  sendVerificationOTP?: (params: SendOTPParams) => Promise<void>;
}

export interface SendOTPParams {
  email: string;
  otp: string;
  type: OTPType;
  request?: Request;
}

/**
 * Default OTP sender using Resend
 */
async function defaultSendVerificationOTP(params: SendOTPParams): Promise<void> {
  const { email, otp, type } = params;
  const env = getAuthEnv();

  if (!isEmailConfigured()) {
    console.warn('[EmailOTP] Email not configured - OTP not sent');
    console.log(`[EmailOTP] OTP for ${email}: ${otp} (type: ${type})`);
    return;
  }

  // Send via main site API
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/email/send-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        otp,
        type,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[EmailOTP] Failed to send OTP:', error);
      throw new Error(`Failed to send OTP: ${error}`);
    }

    console.log(`[EmailOTP] OTP sent successfully to ${email}`);
  } catch (error) {
    console.error('[EmailOTP] Error sending OTP:', error);
    throw error;
  }
}

/**
 * Generate a random OTP code
 */
export function generateOTP(length: number = 6): string {
  const digits = '0123456789';
  let otp = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * digits.length);
    otp += digits[randomIndex];
  }

  return otp;
}

/**
 * Create the Email OTP plugin configuration
 */
export function createEmailOTPPlugin(config: EmailOTPPluginConfig = {}) {
  const { otpLength = 6, expiresIn = 600, sendVerificationOTP = defaultSendVerificationOTP } = config;

  return {
    id: 'emailOTP',
    otpLength,
    expiresIn,

    /**
     * Send verification OTP to user
     */
    async sendVerificationOTP(params: SendOTPParams): Promise<void> {
      try {
        await sendVerificationOTP(params);
      } catch (error) {
        console.error('[EmailOTP] Failed to send verification OTP:', error);
        throw error;
      }
    },
  };
}

/**
 * Pre-configured Email OTP plugin with default settings
 */
export const emailOTPPlugin = createEmailOTPPlugin({
  otpLength: 6,
  expiresIn: 600, // 10 minutes
});

/**
 * Verify OTP code (client-side helper)
 * This calls the main site API to verify
 */
export async function verifyOTP(params: {
  email: string;
  otp: string;
  type: OTPType;
}): Promise<{ success: boolean; error?: string }> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      return { success: false, error: data.error || 'Verification failed' };
    }

    return { success: true };
  } catch (error) {
    console.error('[EmailOTP] Error verifying OTP:', error);
    return { success: false, error: 'Verification failed' };
  }
}

/**
 * Request OTP for sign-in (client-side helper)
 */
export async function requestSignInOTP(email: string): Promise<{ success: boolean; error?: string }> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/auth/email-otp/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        type: 'sign-in',
      }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      return { success: false, error: data.error || 'Failed to send OTP' };
    }

    return { success: true };
  } catch (error) {
    console.error('[EmailOTP] Error requesting sign-in OTP:', error);
    return { success: false, error: 'Failed to send OTP' };
  }
}

/**
 * Request OTP for email verification (client-side helper)
 */
export async function requestVerificationOTP(
  email: string
): Promise<{ success: boolean; error?: string }> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/auth/email-otp/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        type: 'email-verification',
      }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      return { success: false, error: data.error || 'Failed to send OTP' };
    }

    return { success: true };
  } catch (error) {
    console.error('[EmailOTP] Error requesting verification OTP:', error);
    return { success: false, error: 'Failed to send OTP' };
  }
}

/**
 * Email templates
 */
export const emailTemplates = {
  signIn: {
    subject: 'Your sign-in code',
    getBody: (otp: string) => `
      <h2>Your sign-in code</h2>
      <p>Use the following code to sign in to your account:</p>
      <h1 style="font-size: 32px; letter-spacing: 4px; font-weight: bold;">${otp}</h1>
      <p>This code will expire in 10 minutes.</p>
      <p>If you didn't request this code, you can safely ignore this email.</p>
    `,
  },
  emailVerification: {
    subject: 'Verify your email',
    getBody: (otp: string) => `
      <h2>Verify your email</h2>
      <p>Use the following code to verify your email address:</p>
      <h1 style="font-size: 32px; letter-spacing: 4px; font-weight: bold;">${otp}</h1>
      <p>This code will expire in 10 minutes.</p>
      <p>If you didn't create an account, you can safely ignore this email.</p>
    `,
  },
  passwordReset: {
    subject: 'Reset your password',
    getBody: (otp: string) => `
      <h2>Reset your password</h2>
      <p>Use the following code to reset your password:</p>
      <h1 style="font-size: 32px; letter-spacing: 4px; font-weight: bold;">${otp}</h1>
      <p>This code will expire in 10 minutes.</p>
      <p>If you didn't request a password reset, you can safely ignore this email.</p>
    `,
  },
};
