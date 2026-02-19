/**
 * Email Service
 * Handles all transactional emails using SMTP
 */

import nodemailer from 'nodemailer';

const FROM_EMAIL = process.env.EMAIL_FROM || process.env.SMTP_FROM || 'noreply@recoder.xyz';
const FROM_NAME = 'Recoder.xyz';

// Initialize SMTP transporter (fallback if Resend is not configured)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // Use TLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: EmailOptions) {
  // Check if no email service is configured
  if (!process.env.RESEND_API_KEY && !process.env.SMTP_USER) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`📧 [DEV] Email to ${to}: ${subject}`);
      return { success: true, messageId: 'dev-' + Date.now() };
    }
    return { success: false, error: new Error('No email service configured') };
  }

  // Use Resend
  if (process.env.RESEND_API_KEY) {
    try {

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: [to],
          subject,
          html,
          text: text || html.replace(/<[^>]*>/g, ''),
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('Resend error:', response.status, responseData);
        throw new Error(responseData.message || responseData.error || 'Resend API error');
      }

      return { success: true, messageId: responseData.id };
    } catch (error: any) {
      console.error('Email error:', error.message);
      return { success: false, error };
    }
  }

  // SMTP fallback
  try {
    const info = await transporter.sendMail({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('SMTP error:', error);
    return { success: false, error };
  }
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
            
            <a href="${process.env.NEXTAUTH_URL || 'https://recoder.xyz'}/dashboard" class="button">Go to Dashboard</a>
            
            <p>Need help? Check out our <a href="${process.env.NEXTAUTH_URL || 'https://recoder.xyz'}/docs">documentation</a> or reach out to our support team.</p>
            
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
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </div>

            <div class="divider"></div>

            <p style="color: #888; font-size: 14px;">If the button doesn't work, copy and paste this link:</p>
            <div class="link-box">${verificationUrl}</div>

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
    console.error(`Failed to send verification email to ${email}:`, result.error);
  }

  return result;
}

/**
 * Send verification email with link only (legacy/fallback)
 */
export async function sendVerificationEmail(email: string, verificationUrl: string) {
  // Note: better-auth passes the full verification URL, not just the token
  const subject = 'Verify Your Email - Recoder.xyz';
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
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </div>

            <p style="color: #888; font-size: 14px;">Or copy and paste this link into your browser:</p>
            <div class="link-box">${verificationUrl}</div>

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
    console.error(`Failed to send verification email to ${email}:`, result.error);
  }

  return result;
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  // Note: better-auth passes the full reset URL, not just the token
  const subject = 'Reset Your Password - Recoder.xyz';
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
              <a href="${resetUrl}" class="button">Reset Password</a>
            </div>

            <p style="color: #888; font-size: 14px;">Or copy and paste this link into your browser:</p>
            <div class="link-box">${resetUrl}</div>

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
    console.error(`Failed to send password reset email to ${email}:`, result.error);
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
            
            <a href="${process.env.NEXTAUTH_URL || 'https://recoder.xyz'}/dashboard" class="button">Go to Dashboard</a>
            
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

            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/signin" class="button">Sign In Now</a>

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

Sign in at: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/signin

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
  const dashboardUrl = process.env.NEXTAUTH_URL || 'https://recoder.xyz';
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
  const dashboardUrl = process.env.NEXTAUTH_URL || 'https://recoder.xyz';
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
  const dashboardUrl = process.env.NEXTAUTH_URL || 'https://recoder.xyz';
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
  const dashboardUrl = process.env.NEXTAUTH_URL || 'https://recoder.xyz';
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
};
