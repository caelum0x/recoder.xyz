/**
 * Email Templates Service
 * Provides email template generation and sending capabilities
 * Adapted from Libra's email system for Recoder
 */

import type { ReactElement } from 'react';

// ==================== Types ====================

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface EmailOptions {
  from: string;
  to: EmailRecipient[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  tags?: string[];
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  name: string;
  send(options: EmailOptions): Promise<EmailResult>;
}

// ==================== Email Template Data ====================

export interface WelcomeEmailData {
  userName: string;
  planName: string;
  features: string[];
  dashboardUrl: string;
}

export interface VerificationEmailData {
  otp: string;
  expiresInMinutes: number;
}

export interface InvitationEmailData {
  inviterName: string;
  inviterEmail: string;
  teamName: string;
  inviteLink: string;
  expiresInDays: number;
}

export interface PasswordResetEmailData {
  resetLink: string;
  expiresInMinutes: number;
}

export interface DeploymentNotificationData {
  projectName: string;
  deploymentUrl: string;
  status: 'success' | 'failed';
  environment: string;
  deployedAt: Date;
  errorMessage?: string;
}

// ==================== Plan Benefits Configuration ====================

const PLAN_BENEFITS: Record<string, {
  welcomeMessage: string;
  features: string[];
  ctaText: string;
}> = {
  free: {
    welcomeMessage: 'Welcome to Recoder! You now have access to our powerful AI-assisted development platform.',
    features: [
      'AI-powered code generation',
      'Real-time preview',
      'Basic project templates',
      'Community support',
    ],
    ctaText: 'Start Building',
  },
  pro: {
    welcomeMessage: 'Thank you for upgrading to Recoder Pro! You now have access to advanced features.',
    features: [
      'Everything in Free',
      'Unlimited projects',
      'Priority AI processing',
      'Custom domains',
      'Team collaboration',
      'Priority support',
    ],
    ctaText: 'Explore Pro Features',
  },
  enterprise: {
    welcomeMessage: 'Welcome to Recoder Enterprise! Your team now has access to our complete platform.',
    features: [
      'Everything in Pro',
      'Unlimited team members',
      'SSO & SAML authentication',
      'Audit logs',
      'Custom branding',
      'Dedicated support',
      'SLA guarantees',
    ],
    ctaText: 'Set Up Your Workspace',
  },
};

// ==================== Email Template Generators ====================

/**
 * Generate welcome email HTML
 */
export function generateWelcomeEmailHtml(data: WelcomeEmailData): string {
  const benefits = PLAN_BENEFITS[data.planName.toLowerCase()] || PLAN_BENEFITS.free;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Recoder</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <tr>
      <td style="background-color: #e9680c; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">Recoder</h1>
      </td>
    </tr>

    <!-- Content -->
    <tr>
      <td style="padding: 32px;">
        <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 20px;">
          Welcome to the ${data.planName} Plan, ${data.userName}!
        </h2>

        <p style="color: #6b7280; line-height: 1.6; margin: 0 0 24px 0;">
          ${benefits.welcomeMessage}
        </p>

        <!-- Plan Benefits -->
        <div style="background-color: #fef3e2; border-left: 4px solid #e9680c; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
          <h3 style="color: #1f2937; margin: 0 0 12px 0; font-size: 16px;">
            Your ${data.planName} Plan Benefits
          </h3>
          <ul style="color: #6b7280; margin: 0; padding-left: 20px;">
            ${data.features.map(f => `<li style="margin-bottom: 8px;">${f}</li>`).join('')}
          </ul>
        </div>

        <!-- CTA Button -->
        <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
          <tr>
            <td style="background-color: #e9680c; border-radius: 6px;">
              <a href="${data.dashboardUrl}" style="display: inline-block; padding: 12px 28px; color: #ffffff; text-decoration: none; font-weight: 600;">
                ${benefits.ctaText}
              </a>
            </td>
          </tr>
        </table>

        <p style="color: #6b7280; line-height: 1.6; margin: 24px 0 0 0; font-size: 14px;">
          Need help? Visit our documentation or contact support.
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background-color: #f3f4f6; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 12px; margin: 0;">
          &copy; ${new Date().getFullYear()} Recoder. All rights reserved.
        </p>
        <p style="color: #6b7280; font-size: 12px; margin: 8px 0 0 0;">
          <a href="#" style="color: #e9680c; text-decoration: none;">Privacy Policy</a> |
          <a href="#" style="color: #e9680c; text-decoration: none;">Terms of Service</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generate verification email HTML
 */
export function generateVerificationEmailHtml(data: VerificationEmailData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <tr>
      <td style="background-color: #e9680c; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">Recoder</h1>
      </td>
    </tr>

    <!-- Content -->
    <tr>
      <td style="padding: 32px;">
        <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 20px;">
          Verify Your Email Address
        </h2>

        <p style="color: #6b7280; line-height: 1.6; margin: 0 0 24px 0;">
          Please use the following verification code to confirm your email address:
        </p>

        <!-- OTP Code -->
        <div style="background-color: #fef3e2; border-left: 4px solid #e9680c; padding: 16px; margin-bottom: 24px; border-radius: 4px; text-align: center;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1f2937; font-family: monospace;">
            ${data.otp}
          </span>
        </div>

        <p style="color: #6b7280; line-height: 1.6; margin: 0 0 8px 0;">
          This code will expire in <strong>${data.expiresInMinutes} minutes</strong>.
        </p>

        <p style="color: #6b7280; line-height: 1.6; margin: 0; font-size: 14px;">
          If you didn't create an account with us, please ignore this email.
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background-color: #f3f4f6; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 12px; margin: 0;">
          &copy; ${new Date().getFullYear()} Recoder. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generate invitation email HTML
 */
export function generateInvitationEmailHtml(data: InvitationEmailData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <tr>
      <td style="background-color: #e9680c; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">Recoder</h1>
      </td>
    </tr>

    <!-- Content -->
    <tr>
      <td style="padding: 32px;">
        <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 20px;">
          You've Been Invited to Join a Team
        </h2>

        <p style="color: #6b7280; line-height: 1.6; margin: 0 0 24px 0;">
          ${data.inviterName} (${data.inviterEmail}) has invited you to join the <strong>"${data.teamName}"</strong> team on Recoder.
        </p>

        <!-- Invitation Details -->
        <div style="background-color: #fef3e2; border-left: 4px solid #e9680c; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
          <h3 style="color: #1f2937; margin: 0 0 12px 0; font-size: 16px;">
            Invitation Details
          </h3>
          <p style="color: #6b7280; margin: 0 0 8px 0;"><strong>Team:</strong> ${data.teamName}</p>
          <p style="color: #6b7280; margin: 0 0 8px 0;"><strong>Invited By:</strong> ${data.inviterName}</p>
          <p style="color: #6b7280; margin: 0;"><strong>Expires In:</strong> ${data.expiresInDays} days</p>
        </div>

        <p style="color: #6b7280; line-height: 1.6; margin: 0 0 24px 0;">
          Once you join, you'll have access to shared projects, resources, and collaboration features.
        </p>

        <!-- CTA Button -->
        <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
          <tr>
            <td style="background-color: #e9680c; border-radius: 6px;">
              <a href="${data.inviteLink}" style="display: inline-block; padding: 12px 28px; color: #ffffff; text-decoration: none; font-weight: 600;">
                Accept Invitation
              </a>
            </td>
          </tr>
        </table>

        <p style="color: #6b7280; line-height: 1.6; margin: 24px 0 0 0; font-size: 14px;">
          If you don't recognize the inviter, you can safely ignore this email.
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background-color: #f3f4f6; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 12px; margin: 0;">
          &copy; ${new Date().getFullYear()} Recoder. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generate deployment notification email HTML
 */
export function generateDeploymentNotificationHtml(data: DeploymentNotificationData): string {
  const isSuccess = data.status === 'success';
  const statusColor = isSuccess ? '#22c55e' : '#ef4444';
  const statusBgColor = isSuccess ? '#f0fdf4' : '#fef2f2';
  const statusText = isSuccess ? 'Deployment Successful' : 'Deployment Failed';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deployment ${data.status === 'success' ? 'Successful' : 'Failed'}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <tr>
      <td style="background-color: #e9680c; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">Recoder</h1>
      </td>
    </tr>

    <!-- Content -->
    <tr>
      <td style="padding: 32px;">
        <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 20px;">
          ${statusText}
        </h2>

        <!-- Status Box -->
        <div style="background-color: ${statusBgColor}; border-left: 4px solid ${statusColor}; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
          <p style="color: #1f2937; margin: 0 0 8px 0;"><strong>Project:</strong> ${data.projectName}</p>
          <p style="color: #1f2937; margin: 0 0 8px 0;"><strong>Environment:</strong> ${data.environment}</p>
          <p style="color: #1f2937; margin: 0;"><strong>Time:</strong> ${data.deployedAt.toLocaleString()}</p>
          ${data.errorMessage ? `<p style="color: #ef4444; margin: 12px 0 0 0;"><strong>Error:</strong> ${data.errorMessage}</p>` : ''}
        </div>

        ${isSuccess ? `
        <!-- CTA Button for Success -->
        <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
          <tr>
            <td style="background-color: #e9680c; border-radius: 6px;">
              <a href="${data.deploymentUrl}" style="display: inline-block; padding: 12px 28px; color: #ffffff; text-decoration: none; font-weight: 600;">
                View Deployment
              </a>
            </td>
          </tr>
        </table>
        ` : `
        <p style="color: #6b7280; line-height: 1.6; margin: 0;">
          Please check your project configuration and try again. If the issue persists, contact support.
        </p>
        `}
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background-color: #f3f4f6; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 12px; margin: 0;">
          &copy; ${new Date().getFullYear()} Recoder. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ==================== Email Service Class ====================

export class EmailService {
  private provider?: EmailProvider;
  private fromAddress: string;

  constructor(fromAddress: string = 'noreply@recoder.xyz') {
    this.fromAddress = fromAddress;
  }

  setProvider(provider: EmailProvider): void {
    this.provider = provider;
  }

  async sendWelcomeEmail(to: string, data: WelcomeEmailData): Promise<EmailResult> {
    return this.send({
      from: this.fromAddress,
      to: [{ email: to, name: data.userName }],
      subject: `Welcome to Recoder ${data.planName} Plan`,
      html: generateWelcomeEmailHtml(data),
    });
  }

  async sendVerificationEmail(to: string, data: VerificationEmailData): Promise<EmailResult> {
    return this.send({
      from: this.fromAddress,
      to: [{ email: to }],
      subject: 'Recoder - Email Verification Code',
      html: generateVerificationEmailHtml(data),
    });
  }

  async sendInvitationEmail(to: string, data: InvitationEmailData): Promise<EmailResult> {
    return this.send({
      from: this.fromAddress,
      to: [{ email: to }],
      subject: `Invitation to join ${data.teamName} on Recoder`,
      html: generateInvitationEmailHtml(data),
    });
  }

  async sendDeploymentNotification(to: string, data: DeploymentNotificationData): Promise<EmailResult> {
    const statusText = data.status === 'success' ? 'Successful' : 'Failed';
    return this.send({
      from: this.fromAddress,
      to: [{ email: to }],
      subject: `Deployment ${statusText}: ${data.projectName}`,
      html: generateDeploymentNotificationHtml(data),
    });
  }

  private async send(options: EmailOptions): Promise<EmailResult> {
    if (!this.provider) {
      console.warn('[EmailService] No provider configured, email not sent:', options.subject);
      return { success: false, error: 'No email provider configured' };
    }

    try {
      return await this.provider.send(options);
    } catch (error) {
      console.error('[EmailService] Failed to send email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// ==================== Singleton Instance ====================

export const emailService = new EmailService();

export default emailService;
