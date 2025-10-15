/**
 * Email Service
 * Handles all transactional emails using SMTP
 */

import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // Use TLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

const FROM_EMAIL = process.env.SMTP_FROM || 'noreply@recoder.xyz';
const FROM_NAME = 'Recoder.xyz';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

async function sendEmail({ to, subject, html, text }: EmailOptions) {
  try {
    const info = await transporter.sendMail({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });

    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
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
            <p>© 2024 Recoder.xyz. All rights reserved.</p>
            <p>Questions? Contact us at support@recoder.xyz</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({ to: email, subject, html });
}

export async function sendVerificationEmail(email: string, verificationToken: string) {
  const verificationUrl = `${process.env.NEXTAUTH_URL || 'https://recoder.xyz'}/api/auth/verify?token=${verificationToken}`;
  const subject = 'Verify Your Email Address';
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #667eea; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .code { background: #e0e0e0; padding: 10px; font-family: monospace; font-size: 16px; letter-spacing: 2px; text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Verify Your Email</h1>
          </div>
          <div class="content">
            <p>Please verify your email address by clicking the button below:</p>
            <a href="${verificationUrl}" class="button">Verify Email</a>
            <p>Or copy and paste this link into your browser:</p>
            <div class="code">${verificationUrl}</div>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create an account with Recoder.xyz, please ignore this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({ to: email, subject, html });
}

export async function sendPasswordResetEmail(email: string, resetToken: string) {
  const resetUrl = `${process.env.NEXTAUTH_URL || 'https://recoder.xyz'}/auth/reset-password?token=${resetToken}`;
  const subject = 'Reset Your Password';
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #667eea; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 30px; background: #dc2626; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Reset Your Password</h1>
          </div>
          <div class="content">
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request a password reset, please ignore this email and your password will remain unchanged.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({ to: email, subject, html });
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

export default {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendSubscriptionConfirmationEmail,
  sendApiKeyCreatedEmail,
};
