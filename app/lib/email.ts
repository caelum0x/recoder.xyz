/**
 * Email Service
 * Handles all transactional emails using SMTP
 */

import nodemailer from 'nodemailer';
import { logger } from '@/lib/logger';

const DEFAULT_FROM_EMAIL = 'noreply@recoder.xyz';
const RESEND_FROM = process.env.RESEND_FROM || process.env.EMAIL_FROM || DEFAULT_FROM_EMAIL;
const SMTP_FROM = process.env.SMTP_FROM || process.env.EMAIL_FROM || DEFAULT_FROM_EMAIL;
const FROM_NAME = 'Recoder.xyz';
const APP_URL = resolvePublicAppUrl();

export type EmailProviderKind = 'smtp' | 'resend' | 'dev' | 'none';

export interface EmailProviderStatus {
  provider: EmailProviderKind;
  hasSmtp: boolean;
  hasResend: boolean;
  fromEmail: string;
}

export function resolvePublicAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (
    env.NEXT_PUBLIC_APP_URL ||
    env.APP_URL ||
    'https://recoder.xyz'
  ).trim();

  try {
    const parsed = new URL(raw);
    if (env.NODE_ENV === 'production' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      return 'https://recoder.xyz';
    }
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return 'https://recoder.xyz';
  }
}

interface SanitizeEmailLinkOptions {
  appUrl?: string;
  nodeEnv?: string;
}

export function sanitizeEmailLink(url: string, fallbackPath: string, options?: SanitizeEmailLinkOptions): string {
  const appUrl = options?.appUrl || APP_URL;
  const nodeEnv = options?.nodeEnv || process.env.NODE_ENV;
  const fallback = `${appUrl}${fallbackPath.startsWith('/') ? fallbackPath : `/${fallbackPath}`}`;
  if (!url || typeof url !== 'string') return fallback;

  try {
    const parsed = new URL(url);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (nodeEnv === 'production' && isLocalhost) {
      return `${appUrl}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function getSmtpConfig(env: NodeJS.ProcessEnv = process.env) {
  const explicitSmtpHost = (env.SMTP_HOST || '').trim();
  const smtpHost = explicitSmtpHost || 'localhost';
  const smtpPort = parseInt(env.SMTP_PORT || (smtpHost === 'localhost' ? '25' : '587'), 10);
  const smtpUser = (env.SMTP_USER || '').trim();
  const smtpPassword = env.SMTP_PASSWORD || '';
  const hasLocalRelay = explicitSmtpHost === 'localhost' || explicitSmtpHost === '127.0.0.1';
  const hasAuthenticatedSmtp = !!smtpHost && !!smtpUser && !!smtpPassword;

  return {
    host: smtpHost,
    port: smtpPort,
    user: smtpUser,
    password: smtpPassword,
    hasLocalRelay,
    hasAuthenticatedSmtp,
    hasSmtp: hasLocalRelay || hasAuthenticatedSmtp,
    fromEmail: env.SMTP_FROM || env.EMAIL_FROM || DEFAULT_FROM_EMAIL,
  };
}

function createSmtpTransport(env: NodeJS.ProcessEnv = process.env) {
  const smtp = getSmtpConfig(env);
  const smtpAuth = smtp.user
    ? { user: smtp.user, pass: smtp.password }
    : undefined;

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: false,
    auth: smtpAuth,
    ...(smtp.hasLocalRelay ? { tls: { rejectUnauthorized: false } } : {}),
  });
}

export function getEmailProviderStatus(env: NodeJS.ProcessEnv = process.env): EmailProviderStatus {
  const preferred = (env.EMAIL_PROVIDER || 'auto').trim().toLowerCase();
  const hasResend = !!env.RESEND_API_KEY;
  const smtp = getSmtpConfig(env);
  const hasSmtp = smtp.hasSmtp;
  const fromEmail = smtp.fromEmail || RESEND_FROM;

  if (preferred === 'smtp') {
    return { provider: hasSmtp ? 'smtp' : env.NODE_ENV === 'development' ? 'dev' : 'none', hasSmtp, hasResend, fromEmail };
  }

  if (preferred === 'resend') {
    return { provider: hasResend ? 'resend' : env.NODE_ENV === 'development' ? 'dev' : 'none', hasSmtp, hasResend, fromEmail: env.EMAIL_FROM || RESEND_FROM };
  }

  if (hasSmtp) {
    return { provider: 'smtp', hasSmtp, hasResend, fromEmail };
  }

  if (hasResend) {
    return { provider: 'resend', hasSmtp, hasResend, fromEmail: env.EMAIL_FROM || RESEND_FROM };
  }

  return {
    provider: env.NODE_ENV === 'development' ? 'dev' : 'none',
    hasSmtp,
    hasResend,
    fromEmail,
  };
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: EmailOptions) {
  const providerStatus = getEmailProviderStatus();
  if (providerStatus.provider === 'dev') {
      logger.info('[DEV] Email would be sent', { to, subject });
      return { success: true, messageId: 'dev-' + Date.now() };
  }

  if (providerStatus.provider === 'none') {
    return { success: false, error: new Error('No email service configured') };
  }

  if (providerStatus.provider === 'smtp') {
    try {
      const transporter = createSmtpTransport();
      const info = await transporter.sendMail({
        from: `${FROM_NAME} <${SMTP_FROM}>`,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
      });
      logger.info('Email sent via SMTP', { to, subject, messageId: info.messageId });
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('SMTP error', { error: String(error) });
      return { success: false, error };
    }
  }

  if (providerStatus.provider === 'resend') {
    try {

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${RESEND_FROM}>`,
          to: [to],
          subject,
          html,
          text: text || html.replace(/<[^>]*>/g, ''),
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        logger.error('Resend error', { status: String(response.status), response: JSON.stringify(responseData) });
        throw new Error(responseData.message || responseData.error || 'Resend API error');
      }

      logger.info('Email sent via Resend', { to, subject, messageId: responseData.id });
      return { success: true, messageId: responseData.id };
    } catch (error: any) {
      logger.error('Email error', { error: error.message });
      return { success: false, error };
    }
  }

  return { success: false, error: new Error(`Unsupported email provider: ${providerStatus.provider}`) };
}

// Email Templates

export async function sendWelcomeEmail(email: string, name: string) {
  const subject = 'Welcome to Recoder.xyz! 🚀';
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Recoder.xyz!</h1>
          </div>
          <div class="content">
            <h2>Hi ${name}! 👋</h2>
            <p>Thank you for joining Recoder.xyz - the AI-powered development platform that generates <strong>real, production-ready code</strong>.</p>
            
            <h3>Get Started:</h3>
            <ul>
              <li><strong>Dashboard:</strong> Access your personal dashboard to manage projects</li>
              <li><strong>CLI Tools:</strong> Install our CLI for terminal-based development</li>
              <li><strong>AI Models:</strong> Choose from Claude, GPT-4, Gemini, and more</li>
              <li><strong>Web Platform:</strong> Use our browser-based development environment</li>
            </ul>
            
            <a href="${APP_URL}/dashboard" class="button">Go to Dashboard</a>
            
            <p>Need help? Check out our <a href="${APP_URL}/docs">documentation</a> or reach out to our support team.</p>
            
            <p>Happy coding! 🎉</p>
          </div>
          <div class="footer">
            <p>© 2024–2026 Recoder.xyz. All rights reserved.</p>
            <p>Questions? Contact us at support@recoder.xyz</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({ to: email, subject, html });
}

/**
 * Send verification email with 6-digit code (primary method)
 */
export async function sendVerificationEmailWithCode(email: string, code: string, verificationUrl: string) {
  const subject = `${code} is your Recoder.xyz verification code`;
  const safeVerificationUrl = sanitizeEmailLink(verificationUrl, '/auth/signin?error=invalid_verification_link');
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #ffffff; background: #000000; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f97316 0%, #9333ea 100%); color: white; padding: 30px; text-align: center; border-radius: 16px 16px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { background: #111111; padding: 40px 30px; border-radius: 0 0 16px 16px; border: 1px solid #333; border-top: none; }
          .code-box { background: #1a1a1a; padding: 24px; border-radius: 12px; margin: 24px 0; text-align: center; border: 2px solid #333; }
          .code { font-size: 40px; font-weight: bold; color: #f97316; letter-spacing: 8px; font-family: 'Courier New', monospace; }
          .button { display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #f97316 0%, #9333ea 100%); color: white !important; text-decoration: none; border-radius: 8px; margin: 24px 0; font-weight: 600; font-size: 16px; }
          .link-box { background: #1a1a1a; padding: 16px; border-radius: 8px; margin: 20px 0; word-break: break-all; font-family: monospace; font-size: 12px; color: #f97316; border: 1px solid #333; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          p { color: #cccccc; margin: 16px 0; }
          .divider { border-top: 1px solid #333; margin: 24px 0; }
        </style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header">
            <h1>🚀 Verify Your Email</h1>
          </div>
          <div class="content">
            <p style="font-size: 18px; color: #ffffff;">Welcome to Recoder.xyz!</p>
            <p>Use this verification code to complete your registration:</p>

            <div class="code-box">
              <div style="font-size: 12px; color: #888; margin-bottom: 8px;">YOUR VERIFICATION CODE</div>
              <div class="code">${code}</div>
              <div style="font-size: 12px; color: #888; margin-top: 8px;">Expires in 24 hours</div>
            </div>

            <p style="text-align: center;">Or click the button below to verify automatically:</p>

            <div style="text-align: center;">
              <a href="${safeVerificationUrl}" class="button">Verify Email Address</a>
            </div>

            <div class="divider"></div>

            <p style="color: #888; font-size: 14px;">If the button doesn't work, copy and paste this link:</p>
            <div class="link-box">${safeVerificationUrl}</div>

            <p style="color: #666; font-size: 12px;">If you didn't create an account with Recoder.xyz, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>© 2025 Recoder.xyz - AI-Powered Development Platform</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const result = await sendEmail({ to: email, subject, html });

  if (!result.success) {
    logger.error('Failed to send verification email', { email, error: String(result.error) });
  }

  return result;
}

/**
 * Send verification email with link only (legacy/fallback)
 */
export async function sendVerificationEmail(email: string, verificationUrl: string) {
  // Note: better-auth passes the full verification URL, not just the token
  const subject = 'Verify Your Email - Recoder.xyz';
  const safeVerificationUrl = sanitizeEmailLink(verificationUrl, '/auth/signin?error=invalid_verification_link');
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #ffffff; background: #000000; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f97316 0%, #9333ea 100%); color: white; padding: 30px; text-align: center; border-radius: 16px 16px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { background: #111111; padding: 40px 30px; border-radius: 0 0 16px 16px; border: 1px solid #333; border-top: none; }
          .button { display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #f97316 0%, #9333ea 100%); color: white !important; text-decoration: none; border-radius: 8px; margin: 24px 0; font-weight: 600; font-size: 16px; }
          .link-box { background: #1a1a1a; padding: 16px; border-radius: 8px; margin: 20px 0; word-break: break-all; font-family: monospace; font-size: 12px; color: #f97316; border: 1px solid #333; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          p { color: #cccccc; margin: 16px 0; }
        </style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header">
            <h1>🚀 Verify Your Email</h1>
          </div>
          <div class="content">
            <p style="font-size: 18px; color: #ffffff;">Welcome to Recoder.xyz!</p>
            <p>Please verify your email address to complete your registration and access all features.</p>

            <div style="text-align: center;">
              <a href="${safeVerificationUrl}" class="button">Verify Email Address</a>
            </div>

            <p style="color: #888; font-size: 14px;">Or copy and paste this link into your browser:</p>
            <div class="link-box">${safeVerificationUrl}</div>

            <p style="color: #888; font-size: 14px;">This link will expire in 24 hours for security reasons.</p>
            <p style="color: #666; font-size: 12px;">If you didn't create an account with Recoder.xyz, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>© 2025 Recoder.xyz - AI-Powered Development Platform</p>
          </div>
        </div>
      </body>
    </html>
  `;


  const result = await sendEmail({ to: email, subject, html });

  if (!result.success) {
    logger.error('Failed to send verification email', { email, error: String(result.error) });
  }

  return result;
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  // Note: better-auth passes the full reset URL, not just the token
  const subject = 'Reset Your Password - Recoder.xyz';
  const safeResetUrl = sanitizeEmailLink(resetUrl, '/auth/forgot-password');
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #ffffff; background: #000000; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #dc2626 0%, #9333ea 100%); color: white; padding: 30px; text-align: center; border-radius: 16px 16px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { background: #111111; padding: 40px 30px; border-radius: 0 0 16px 16px; border: 1px solid #333; border-top: none; }
          .button { display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #dc2626 0%, #9333ea 100%); color: white !important; text-decoration: none; border-radius: 8px; margin: 24px 0; font-weight: 600; font-size: 16px; }
          .link-box { background: #1a1a1a; padding: 16px; border-radius: 8px; margin: 20px 0; word-break: break-all; font-family: monospace; font-size: 12px; color: #dc2626; border: 1px solid #333; }
          .warning { background: rgba(220, 38, 38, 0.1); border: 1px solid rgba(220, 38, 38, 0.3); border-radius: 8px; padding: 16px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          p { color: #cccccc; margin: 16px 0; }
        </style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header">
            <h1>🔐 Reset Your Password</h1>
          </div>
          <div class="content">
            <p style="font-size: 18px; color: #ffffff;">Password Reset Request</p>
            <p>We received a request to reset your password for your Recoder.xyz account. Click the button below to create a new password:</p>

            <div style="text-align: center;">
              <a href="${safeResetUrl}" class="button">Reset Password</a>
            </div>

            <p style="color: #888; font-size: 14px;">Or copy and paste this link into your browser:</p>
            <div class="link-box">${safeResetUrl}</div>

            <div class="warning">
              <p style="color: #dc2626; margin: 0; font-size: 14px;">⚠️ This link will expire in 1 hour for security reasons.</p>
            </div>

            <p style="color: #666; font-size: 12px;">If you didn't request a password reset, please ignore this email and your password will remain unchanged.</p>
          </div>
          <div class="footer">
            <p>© 2025 Recoder.xyz - AI-Powered Development Platform</p>
          </div>
        </div>
      </body>
    </html>
  `;


  const result = await sendEmail({ to: email, subject, html });

  if (!result.success) {
    logger.error('Failed to send password reset email', { email, error: String(result.error) });
  }

  return result;
}

export async function sendSubscriptionConfirmationEmail(
  email: string,
  name: string,
  plan: string,
  amount: number
) {
  const subject = `Subscription Confirmed: ${plan} Plan`;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Subscription Confirmed!</h1>
          </div>
          <div class="content">
            <h2>Thank you, ${name}!</h2>
            <p>Your subscription to Recoder.xyz has been confirmed. Here are your subscription details:</p>
            
            <div class="details">
              <h3>Subscription Details:</h3>
              <p><strong>Plan:</strong> ${plan}</p>
              <p><strong>Amount:</strong> $${amount}</p>
              <p><strong>Status:</strong> Active</p>
            </div>
            
            <p>You now have access to all premium features. Start building amazing projects today!</p>
            
            <a href="${APP_URL}/dashboard" class="button">Go to Dashboard</a>
            
            <p>Manage your subscription anytime from your dashboard billing section.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({ to: email, subject, html });
}

export async function sendApiKeyCreatedEmail(email: string, name: string) {
  const subject = 'API Key Created Successfully';
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #667eea; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>API Key Created</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>A new API key has been created for your Recoder.xyz account.</p>

            <div class="warning">
              <strong>Security Notice:</strong> Keep your API key secure. Never share it publicly or commit it to version control.
            </div>

            <p>You can manage your API keys from your dashboard settings.</p>
            <p>If you didn't create this key, please contact support immediately at support@recoder.xyz</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({ to: email, subject, html });
}

export async function sendTemporaryPasswordEmail(email: string, tempPassword: string) {
  const subject = 'Your Temporary Password - Recoder.xyz';
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f97316 0%, #9333ea 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .password-box { background: #1a1a1a; color: #f97316; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; border: 2px solid #333; }
          .password { font-size: 32px; font-weight: bold; letter-spacing: 3px; font-family: 'Courier New', monospace; }
          .button { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f97316 0%, #9333ea 100%); color: white; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
          .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚀 Welcome to Recoder.xyz!</h1>
          </div>
          <div class="content">
            <h2>Your Account is Ready</h2>
            <p>Your account has been created successfully. Here's your temporary password:</p>

            <div class="password-box">
              <div style="font-size: 12px; color: #999; margin-bottom: 10px;">TEMPORARY PASSWORD</div>
              <div class="password">${tempPassword}</div>
            </div>

            <div class="warning">
              <strong>⚠️ Important Security Notice:</strong><br>
              Please change this password immediately after your first login. This temporary password should not be shared with anyone.
            </div>

            <a href="${APP_URL}/auth/signin" class="button">Sign In Now</a>

            <h3>Getting Started:</h3>
            <ul>
              <li>Sign in with your email and temporary password</li>
              <li>Change your password in settings</li>
              <li>Explore our AI-powered code generation</li>
              <li>Access all platforms with one account</li>
            </ul>

            <p>If you didn't create an account, please contact support at support@recoder.xyz</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
Welcome to Recoder.xyz!

Your account has been created successfully.

TEMPORARY PASSWORD: ${tempPassword}

⚠️ Important: Please change this password immediately after your first login.

Sign in at: ${APP_URL}/auth/signin

Getting Started:
- Sign in with your email and temporary password
- Change your password in settings
- Explore our AI-powered code generation
- Access all platforms with one account

If you didn't create an account, please contact support at support@recoder.xyz
  `;

  return sendEmail({ to: email, subject, html, text });
}

/**
 * Onboarding Email: Getting Started Tips (Day 1)
 */
export async function sendGettingStartedEmail(email: string, name: string) {
  const subject = '🚀 Getting Started with Recoder - Quick Tips';
  const dashboardUrl = APP_URL;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #ffffff; background: #000000; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f97316 0%, #9333ea 100%); color: white; padding: 30px; text-align: center; border-radius: 16px 16px 0 0; }
          .content { background: #111111; padding: 40px 30px; border-radius: 0 0 16px 16px; border: 1px solid #333; border-top: none; }
          .tip-card { background: #1a1a1a; padding: 20px; border-radius: 12px; margin: 16px 0; border: 1px solid #333; }
          .tip-number { display: inline-block; width: 28px; height: 28px; background: linear-gradient(135deg, #f97316, #9333ea); color: white; border-radius: 50%; text-align: center; line-height: 28px; font-weight: bold; margin-right: 12px; }
          .button { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f97316 0%, #9333ea 100%); color: white !important; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          h2 { color: #ffffff; }
          p { color: #cccccc; }
          .highlight { color: #f97316; }
        </style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header">
            <h1>Quick Tips to Get Started</h1>
          </div>
          <div class="content">
            <h2>Hey ${name}! 👋</h2>
            <p>Here are some quick tips to help you get the most out of Recoder:</p>

            <div class="tip-card">
              <span class="tip-number">1</span>
              <strong style="color: #fff;">Be Specific with Prompts</strong>
              <p style="margin: 8px 0 0 40px;">Instead of "make a website", try "create a React landing page with a hero section, features grid, and contact form using Tailwind CSS"</p>
            </div>

            <div class="tip-card">
              <span class="tip-number">2</span>
              <strong style="color: #fff;">Use the Debug Mode</strong>
              <p style="margin: 8px 0 0 40px;">When you encounter errors, click "Fix with AI" in the Problems panel. The AI will diagnose and fix issues automatically.</p>
            </div>

            <div class="tip-card">
              <span class="tip-number">3</span>
              <strong style="color: #fff;">Try Different AI Models</strong>
              <p style="margin: 8px 0 0 40px;">Switch between Claude, GPT-4, and Gemini in settings. Different models excel at different tasks.</p>
            </div>

            <div class="tip-card">
              <span class="tip-number">4</span>
              <strong style="color: #fff;">Use Keyboard Shortcuts</strong>
              <p style="margin: 8px 0 0 40px;"><code style="background: #333; padding: 2px 6px; border-radius: 4px;">Ctrl+K</code> opens the command palette, <code style="background: #333; padding: 2px 6px; border-radius: 4px;">Ctrl+/</code> triggers inline completions.</p>
            </div>

            <div style="text-align: center;">
              <a href="${dashboardUrl}/dashboard" class="button">Open Dashboard</a>
            </div>

            <p>Need help? Reply to this email or check our <a href="${dashboardUrl}/docs" style="color: #f97316;">documentation</a>.</p>
          </div>
          <div class="footer">
            <p>© 2025 Recoder.xyz - AI-Powered Development Platform</p>
            <p><a href="${dashboardUrl}/unsubscribe?email=${encodeURIComponent(email)}" style="color: #666;">Unsubscribe</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({ to: email, subject, html });
}

/**
 * Onboarding Email: Feature Deep Dive (Day 3)
 */
export async function sendFeatureDeepDiveEmail(email: string, name: string) {
  const subject = '💡 Unlock Recoder\'s Most Powerful Features';
  const dashboardUrl = APP_URL;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #ffffff; background: #000000; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%); color: white; padding: 30px; text-align: center; border-radius: 16px 16px 0 0; }
          .content { background: #111111; padding: 40px 30px; border-radius: 0 0 16px 16px; border: 1px solid #333; border-top: none; }
          .feature { background: #1a1a1a; padding: 24px; border-radius: 12px; margin: 20px 0; border: 1px solid #333; }
          .feature-icon { font-size: 32px; margin-bottom: 12px; }
          .feature h3 { color: #ffffff; margin: 0 0 8px 0; }
          .button { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%); color: white !important; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          p { color: #cccccc; }
        </style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header">
            <h1>Pro Features You Should Try</h1>
          </div>
          <div class="content">
            <h2 style="color: #fff;">Hi ${name}!</h2>
            <p>You've been using Recoder for a few days now. Here are some powerful features you might not have discovered yet:</p>

            <div class="feature">
              <div class="feature-icon">🔄</div>
              <h3>Git Integration</h3>
              <p>Push your projects directly to GitHub. Version control built right in - no terminal needed.</p>
            </div>

            <div class="feature">
              <div class="feature-icon">⚡</div>
              <h3>Inline Autocomplete</h3>
              <p>Ghost text suggestions as you type, just like Copilot. Accept with Tab, dismiss with Escape.</p>
            </div>

            <div class="feature">
              <div class="feature-icon">🎨</div>
              <h3>Starter Templates</h3>
              <p>Start faster with React, Next.js, Vue, or Astro templates. No setup required.</p>
            </div>

            <div class="feature">
              <div class="feature-icon">🚀</div>
              <h3>One-Click Deploy</h3>
              <p>Deploy to Vercel or Railway instantly. Get a live URL in seconds.</p>
            </div>

            <div style="text-align: center;">
              <a href="${dashboardUrl}/dashboard" class="button">Try These Features</a>
            </div>
          </div>
          <div class="footer">
            <p>© 2025 Recoder.xyz - AI-Powered Development Platform</p>
            <p><a href="${dashboardUrl}/unsubscribe?email=${encodeURIComponent(email)}" style="color: #666;">Unsubscribe</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({ to: email, subject, html });
}

/**
 * Onboarding Email: Engagement/Re-engagement (Day 7 or if inactive)
 */
export async function sendEngagementEmail(email: string, name: string) {
  const subject = '👋 We miss you! Here\'s what\'s new in Recoder';
  const dashboardUrl = APP_URL;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #ffffff; background: #000000; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%); color: white; padding: 30px; text-align: center; border-radius: 16px 16px 0 0; }
          .content { background: #111111; padding: 40px 30px; border-radius: 0 0 16px 16px; border: 1px solid #333; border-top: none; }
          .update { background: #1a1a1a; padding: 16px 20px; border-radius: 8px; margin: 12px 0; border-left: 4px solid #8b5cf6; }
          .button { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%); color: white !important; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          p { color: #cccccc; }
        </style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header">
            <h1>What's New in Recoder</h1>
          </div>
          <div class="content">
            <h2 style="color: #fff;">Hey ${name}!</h2>
            <p>It's been a while since we've seen you. Here's what you've been missing:</p>

            <div class="update">
              <strong style="color: #fff;">✨ Improved AI Quality</strong>
              <p style="margin: 8px 0 0 0;">Better code generation with enhanced agentic workflow. The AI now reads your code before making changes.</p>
            </div>

            <div class="update">
              <strong style="color: #fff;">🐛 Smart Debug Mode</strong>
              <p style="margin: 8px 0 0 0;">Click "Fix with AI" and let the AI diagnose and fix errors automatically with confirmation before changes.</p>
            </div>

            <div class="update">
              <strong style="color: #fff;">⚡ Faster Performance</strong>
              <p style="margin: 8px 0 0 0;">Pre-warmed containers for instant project startup. No more waiting.</p>
            </div>

            <div style="text-align: center;">
              <a href="${dashboardUrl}/dashboard" class="button">Start Building Again</a>
            </div>

            <p style="color: #888; font-size: 14px;">Have feedback? We'd love to hear from you - just reply to this email.</p>
          </div>
          <div class="footer">
            <p>© 2025 Recoder.xyz - AI-Powered Development Platform</p>
            <p><a href="${dashboardUrl}/unsubscribe?email=${encodeURIComponent(email)}" style="color: #666;">Unsubscribe</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({ to: email, subject, html });
}

/**
 * Weekly tips email (for active users)
 */
export async function sendWeeklyTipsEmail(email: string, name: string, tipNumber: number = 1) {
  const tips = [
    {
      title: 'Use Mode Switching',
      tip: 'Switch to Architect mode for planning, Debug mode for fixing errors, or Ask mode for questions. Each mode optimizes the AI for specific tasks.',
    },
    {
      title: 'Leverage Web Search',
      tip: 'The AI can search the web for documentation, APIs, and solutions. Just ask it to "search for" or "look up" something.',
    },
    {
      title: 'Snapshot Your Progress',
      tip: 'Use snapshots to save your project state before major changes. Easy to restore if something goes wrong.',
    },
    {
      title: 'Multi-file Edits',
      tip: 'The AI can edit multiple files at once atomically. Just describe the change and it will update all relevant files together.',
    },
  ];

  const currentTip = tips[(tipNumber - 1) % tips.length];
  const subject = `💡 Weekly Tip: ${currentTip.title}`;
  const dashboardUrl = APP_URL;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #ffffff; background: #000000; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f97316 0%, #9333ea 100%); color: white; padding: 30px; text-align: center; border-radius: 16px 16px 0 0; }
          .content { background: #111111; padding: 40px 30px; border-radius: 0 0 16px 16px; border: 1px solid #333; border-top: none; }
          .tip-box { background: linear-gradient(135deg, rgba(249, 115, 22, 0.1), rgba(147, 51, 234, 0.1)); border: 1px solid #333; padding: 24px; border-radius: 12px; margin: 20px 0; }
          .button { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f97316 0%, #9333ea 100%); color: white !important; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          p { color: #cccccc; }
        </style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header">
            <h1>💡 Tip of the Week</h1>
          </div>
          <div class="content">
            <h2 style="color: #fff;">Hi ${name}!</h2>

            <div class="tip-box">
              <h3 style="color: #f97316; margin-top: 0;">${currentTip.title}</h3>
              <p style="margin-bottom: 0; font-size: 16px;">${currentTip.tip}</p>
            </div>

            <div style="text-align: center;">
              <a href="${dashboardUrl}/dashboard" class="button">Try It Now</a>
            </div>

            <p style="color: #888; font-size: 14px;">Got a tip to share? Reply to this email!</p>
          </div>
          <div class="footer">
            <p>© 2025 Recoder.xyz - AI-Powered Development Platform</p>
            <p><a href="${dashboardUrl}/unsubscribe?email=${encodeURIComponent(email)}" style="color: #666;">Unsubscribe</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({ to: email, subject, html });
}

/**
 * Churn Prevention: Payment Failed Email
 * Sent when a subscription payment fails (from webhook handlers)
 */
export async function sendPaymentFailedEmail(
  to: string,
  name: string,
  planName: string,
  retryDate?: string
) {
  const subject = 'Action Required: Payment Failed - Recoder.xyz';
  const dashboardUrl = APP_URL;
  const retryInfo = retryDate
    ? `<p>We'll automatically retry your payment on <strong style="color: #ffffff;">${retryDate}</strong>. To avoid any interruption, please update your payment method before then.</p>`
    : `<p>Please update your payment method as soon as possible to avoid losing access to your <strong style="color: #f97316;">${planName}</strong> plan features.</p>`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #ffffff; background: #000000; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f97316 0%, #9333ea 100%); color: white; padding: 30px; text-align: center; border-radius: 16px 16px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { background: #111111; padding: 40px 30px; border-radius: 0 0 16px 16px; border: 1px solid #333; border-top: none; }
          .alert-box { background: rgba(249, 115, 22, 0.1); border: 1px solid rgba(249, 115, 22, 0.3); border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center; }
          .button { display: inline-block; padding: 16px 40px; background: #ffffff; color: #000000 !important; text-decoration: none; border-radius: 8px; margin: 24px 0; font-weight: 600; font-size: 16px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          p { color: #cccccc; margin: 16px 0; }
          .divider { border-top: 1px solid #333; margin: 24px 0; }
        </style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header">
            <h1>Payment Issue</h1>
          </div>
          <div class="content">
            <h2 style="color: #ffffff;">Hi ${name},</h2>
            <p>We couldn't process your payment for your <strong style="color: #f97316;">${planName}</strong> plan. This can happen for a number of reasons, such as an expired card or insufficient funds.</p>

            <div class="alert-box">
              <p style="color: #f97316; font-size: 18px; font-weight: 600; margin: 0 0 8px 0;">Please update your payment method</p>
              <p style="margin: 0; color: #cccccc;">to continue your subscription without interruption.</p>
            </div>

            ${retryInfo}

            <div style="text-align: center;">
              <a href="${dashboardUrl}/settings/billing" class="button">Update Payment Method</a>
            </div>

            <div class="divider"></div>

            <p style="color: #888; font-size: 14px;">If you believe this is an error or need assistance, please contact us at <a href="mailto:support@recoder.xyz" style="color: #f97316;">support@recoder.xyz</a>.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Recoder.xyz - AI-Powered Development Platform</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const result = await sendEmail({ to, subject, html });

  if (!result.success) {
    logger.error('Failed to send payment failed email', { to, error: String(result.error) });
  }

  return result;
}

/**
 * Churn Prevention: Trial Expiring Email
 * Sent when a user's trial is about to expire
 */
export async function sendTrialExpiringEmail(
  to: string,
  name: string,
  daysLeft: number,
  planName: string
) {
  const subject = `Your trial expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} - Recoder.xyz`;
  const dashboardUrl = APP_URL;
  const urgencyColor = daysLeft <= 1 ? '#ef4444' : '#f97316';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #ffffff; background: #000000; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f97316 0%, #9333ea 100%); color: white; padding: 30px; text-align: center; border-radius: 16px 16px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { background: #111111; padding: 40px 30px; border-radius: 0 0 16px 16px; border: 1px solid #333; border-top: none; }
          .countdown-box { background: #1a1a1a; padding: 24px; border-radius: 12px; margin: 24px 0; text-align: center; border: 2px solid ${urgencyColor}; }
          .countdown { font-size: 48px; font-weight: bold; color: ${urgencyColor}; }
          .feature-list { background: #1a1a1a; padding: 20px 24px; border-radius: 12px; margin: 20px 0; border: 1px solid #333; }
          .button { display: inline-block; padding: 16px 40px; background: #ffffff; color: #000000 !important; text-decoration: none; border-radius: 8px; margin: 24px 0; font-weight: 600; font-size: 16px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          p { color: #cccccc; margin: 16px 0; }
          .divider { border-top: 1px solid #333; margin: 24px 0; }
        </style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header">
            <h1>Your Trial is Ending Soon</h1>
          </div>
          <div class="content">
            <h2 style="color: #ffffff;">Hi ${name},</h2>
            <p>Your <strong style="color: #f97316;">${planName}</strong> trial is coming to an end. Upgrade now to keep all your features.</p>

            <div class="countdown-box">
              <div style="font-size: 12px; color: #888; margin-bottom: 8px;">TIME REMAINING</div>
              <div class="countdown">${daysLeft} day${daysLeft === 1 ? '' : 's'}</div>
              <div style="font-size: 14px; color: #888; margin-top: 8px;">until your trial expires</div>
            </div>

            <p>Here's what you'll lose access to if you don't upgrade:</p>

            <div class="feature-list">
              <ul style="color: #cccccc; margin: 0; padding-left: 20px;">
                <li style="margin: 10px 0;">Unlimited AI-powered code generation</li>
                <li style="margin: 10px 0;">Access to all AI models (Claude, GPT-4, Gemini)</li>
                <li style="margin: 10px 0;">Priority support and faster response times</li>
                <li style="margin: 10px 0;">Advanced deployment and collaboration features</li>
              </ul>
            </div>

            <div style="text-align: center;">
              <a href="${dashboardUrl}/settings/billing" class="button">Upgrade Now</a>
            </div>

            <div class="divider"></div>

            <p style="color: #888; font-size: 14px;">Questions about our plans? Reply to this email or visit our <a href="${dashboardUrl}/pricing" style="color: #f97316;">pricing page</a>.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Recoder.xyz - AI-Powered Development Platform</p>
            <p><a href="${dashboardUrl}/unsubscribe?email=${encodeURIComponent(to)}" style="color: #666;">Unsubscribe</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  const result = await sendEmail({ to, subject, html });

  if (!result.success) {
    logger.error('Failed to send trial expiring email', { to, error: String(result.error) });
  }

  return result;
}

/**
 * Churn Prevention: Subscription Cancelled Email
 * Sent when a user cancels their subscription (from webhook handlers)
 */
export async function sendSubscriptionCancelledEmail(
  to: string,
  name: string,
  endDate: string,
  planName: string
) {
  const subject = 'Your subscription has been cancelled - Recoder.xyz';
  const dashboardUrl = APP_URL;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #ffffff; background: #000000; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f97316 0%, #9333ea 100%); color: white; padding: 30px; text-align: center; border-radius: 16px 16px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { background: #111111; padding: 40px 30px; border-radius: 0 0 16px 16px; border: 1px solid #333; border-top: none; }
          .info-box { background: #1a1a1a; padding: 24px; border-radius: 12px; margin: 24px 0; border: 1px solid #333; }
          .button { display: inline-block; padding: 16px 40px; background: #ffffff; color: #000000 !important; text-decoration: none; border-radius: 8px; margin: 24px 0; font-weight: 600; font-size: 16px; }
          .button-secondary { display: inline-block; padding: 14px 32px; background: transparent; color: #f97316 !important; text-decoration: none; border-radius: 8px; margin: 8px 0; font-weight: 600; font-size: 14px; border: 1px solid #f97316; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          p { color: #cccccc; margin: 16px 0; }
          .divider { border-top: 1px solid #333; margin: 24px 0; }
        </style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header">
            <h1>Sorry to See You Go</h1>
          </div>
          <div class="content">
            <h2 style="color: #ffffff;">Hi ${name},</h2>
            <p>We've received your cancellation request for the <strong style="color: #f97316;">${planName}</strong> plan. We're sorry to see you go.</p>

            <div class="info-box">
              <p style="color: #ffffff; font-weight: 600; margin: 0 0 12px 0;">What happens next:</p>
              <ul style="color: #cccccc; margin: 0; padding-left: 20px;">
                <li style="margin: 8px 0;">Your subscription will remain <strong style="color: #10b981;">active until ${endDate}</strong></li>
                <li style="margin: 8px 0;">You'll keep full access to all ${planName} features until then</li>
                <li style="margin: 8px 0;">After that, your account will revert to the free tier</li>
                <li style="margin: 8px 0;">Your projects and data will be preserved</li>
              </ul>
            </div>

            <p>Changed your mind? You can reactivate your subscription at any time before ${endDate} and keep all your features.</p>

            <div style="text-align: center;">
              <a href="${dashboardUrl}/settings/billing" class="button">Reactivate Subscription</a>
              <br>
              <a href="mailto:support@recoder.xyz" class="button-secondary">Share Feedback</a>
            </div>

            <div class="divider"></div>

            <p style="color: #888; font-size: 14px;">We'd love to know what we could do better. Reply to this email with any feedback - we read every message.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Recoder.xyz - AI-Powered Development Platform</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const result = await sendEmail({ to, subject, html });

  if (!result.success) {
    logger.error('Failed to send subscription cancelled email', { to, error: String(result.error) });
  }

  return result;
}

/**
 * Churn Prevention: Win-Back Email
 * Sent to users who have churned, to bring them back
 */
export async function sendWinBackEmail(to: string, name: string) {
  const subject = 'We miss you! See what\'s new at Recoder.xyz';
  const dashboardUrl = APP_URL;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #ffffff; background: #000000; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f97316 0%, #9333ea 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 16px 16px 0 0; }
          .header h1 { margin: 0; font-size: 32px; font-weight: 700; }
          .content { background: #111111; padding: 40px 30px; border-radius: 0 0 16px 16px; border: 1px solid #333; border-top: none; }
          .update-card { background: #1a1a1a; padding: 20px 24px; border-radius: 12px; margin: 16px 0; border: 1px solid #333; border-left: 4px solid #f97316; }
          .button { display: inline-block; padding: 16px 40px; background: #ffffff; color: #000000 !important; text-decoration: none; border-radius: 8px; margin: 24px 0; font-weight: 600; font-size: 16px; }
          .offer-box { background: linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(147, 51, 234, 0.15)); border: 2px solid #f97316; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          p { color: #cccccc; margin: 16px 0; }
          .divider { border-top: 1px solid #333; margin: 24px 0; }
        </style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header">
            <h1>We Miss You!</h1>
          </div>
          <div class="content">
            <h2 style="color: #ffffff;">Hey ${name},</h2>
            <p>It's been a while since we've seen you on Recoder.xyz. We've been busy shipping new features, and we think you'll love what's changed.</p>

            <p style="color: #ffffff; font-weight: 600; font-size: 18px;">Here's what we've shipped since you left:</p>

            <div class="update-card">
              <strong style="color: #ffffff;">Faster AI Responses</strong>
              <p style="margin: 8px 0 0 0;">We've optimized our infrastructure for significantly faster code generation and iteration cycles.</p>
            </div>

            <div class="update-card">
              <strong style="color: #ffffff;">New AI Models</strong>
              <p style="margin: 8px 0 0 0;">Access to the latest models including Claude Sonnet 4, GPT-4.1, and Gemini 2.5 Pro for even better results.</p>
            </div>

            <div class="update-card">
              <strong style="color: #ffffff;">Improved Agents</strong>
              <p style="margin: 8px 0 0 0;">Custom AI agents that run tasks autonomously in the background. Schedule triggers, connect integrations, and automate your workflow.</p>
            </div>

            <div class="update-card">
              <strong style="color: #ffffff;">Enhanced Collaboration</strong>
              <p style="margin: 8px 0 0 0;">Real-time collaboration, shared projects, and team workspaces to build together.</p>
            </div>

            <div class="offer-box">
              <p style="color: #f97316; font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">Come back and try it out</p>
              <p style="margin: 0; color: #cccccc;">Your account and all your projects are still here, exactly as you left them.</p>
            </div>

            <div style="text-align: center;">
              <a href="${dashboardUrl}/dashboard" class="button">Return to Recoder</a>
            </div>

            <div class="divider"></div>

            <p style="color: #888; font-size: 14px;">Have questions or feedback? Reply to this email - we'd love to hear from you.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Recoder.xyz - AI-Powered Development Platform</p>
            <p><a href="${dashboardUrl}/unsubscribe?email=${encodeURIComponent(to)}" style="color: #666;">Unsubscribe</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  const result = await sendEmail({ to, subject, html });

  if (!result.success) {
    logger.error('Failed to send win-back email', { to, error: String(result.error) });
  }

  return result;
}

/**
 * Billing Lifecycle: Renewal Reminder Email
 * Sent before a subscription auto-renews
 */
export async function sendRenewalReminderEmail(
  to: string,
  name: string,
  renewalDate: string,
  amount: string,
  planName: string
) {
  const subject = `Your ${planName} plan renews on ${renewalDate} - Recoder.xyz`;
  const dashboardUrl = APP_URL;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #ffffff; background: #000000; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f97316 0%, #9333ea 100%); color: white; padding: 30px; text-align: center; border-radius: 16px 16px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { background: #111111; padding: 40px 30px; border-radius: 0 0 16px 16px; border: 1px solid #333; border-top: none; }
          .renewal-box { background: #1a1a1a; padding: 24px; border-radius: 12px; margin: 24px 0; border: 1px solid #333; }
          .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #333; }
          .detail-row:last-child { border-bottom: none; }
          .detail-label { color: #888; }
          .detail-value { color: #ffffff; font-weight: 600; }
          .button { display: inline-block; padding: 16px 40px; background: #ffffff; color: #000000 !important; text-decoration: none; border-radius: 8px; margin: 24px 0; font-weight: 600; font-size: 16px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          p { color: #cccccc; margin: 16px 0; }
          .divider { border-top: 1px solid #333; margin: 24px 0; }
        </style>
      </head>
      <body style="background: #000000;">
        <div class="container">
          <div class="header">
            <h1>Renewal Reminder</h1>
          </div>
          <div class="content">
            <h2 style="color: #ffffff;">Hi ${name},</h2>
            <p>This is a friendly reminder that your Recoder.xyz subscription will automatically renew soon. Here are the details:</p>

            <div class="renewal-box">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #333; color: #888;">Plan</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #333; color: #ffffff; font-weight: 600; text-align: right;">${planName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #333; color: #888;">Renewal Date</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #333; color: #ffffff; font-weight: 600; text-align: right;">${renewalDate}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; color: #888;">Amount</td>
                  <td style="padding: 12px 0; color: #f97316; font-weight: 700; font-size: 18px; text-align: right;">${amount}</td>
                </tr>
              </table>
            </div>

            <p>Your payment method on file will be charged automatically. If you need to update your payment details or make changes to your plan, you can do so from your billing settings.</p>

            <div style="text-align: center;">
              <a href="${dashboardUrl}/settings/billing" class="button">Manage Subscription</a>
            </div>

            <div class="divider"></div>

            <p style="color: #888; font-size: 14px;">If you have any questions about your subscription, contact us at <a href="mailto:support@recoder.xyz" style="color: #f97316;">support@recoder.xyz</a>.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Recoder.xyz - AI-Powered Development Platform</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const result = await sendEmail({ to, subject, html });

  if (!result.success) {
    logger.error('Failed to send renewal reminder email', { to, error: String(result.error) });
  }

  return result;
}

export default {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendVerificationEmailWithCode,
  sendPasswordResetEmail,
  sendSubscriptionConfirmationEmail,
  sendApiKeyCreatedEmail,
  sendTemporaryPasswordEmail,
  // Onboarding sequence
  sendGettingStartedEmail,
  sendFeatureDeepDiveEmail,
  sendEngagementEmail,
  sendWeeklyTipsEmail,
  // Churn prevention & billing lifecycle
  sendPaymentFailedEmail,
  sendTrialExpiringEmail,
  sendSubscriptionCancelledEmail,
  sendWinBackEmail,
  sendRenewalReminderEmail,
};
