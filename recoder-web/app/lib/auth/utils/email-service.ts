/**
 * Email Service
 * Provides email sending functionality for auth operations
 */

import { getAuthEnv, isEmailConfigured } from '../env';
import type { OrganizationInvitationOptions } from '../types';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('EmailService');

/**
 * Send a welcome email to a new subscriber
 */
export async function sendWelcomeEmail(stripeCustomerId: string, planName: string): Promise<void> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/email/welcome`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        stripeCustomerId,
        planName,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`[Email] Failed to send welcome email (${response.status}):`, errorBody);
      throw new Error('Failed to send welcome email');
    }

    logger.info(`[Email] Welcome email sent for customer ${stripeCustomerId}`);
  } catch (error) {
    logger.error(`[Email] Error sending welcome email:`, error);
    throw error;
  }
}

/**
 * Send a subscription cancellation email
 */
export async function sendCancellationEmail(userId: string): Promise<void> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/email/cancellation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`[Email] Failed to send cancellation email (${response.status}):`, errorBody);
      throw new Error('Failed to send cancellation email');
    }

    logger.info(`[Email] Cancellation email sent for user ${userId}`);
  } catch (error) {
    logger.error(`[Email] Error sending cancellation email:`, error);
    throw error;
  }
}

/**
 * Send an organization invitation email
 */
export async function sendOrganizationInvitation(
  options: OrganizationInvitationOptions
): Promise<void> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/email/invitation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`[Email] Failed to send invitation email (${response.status}):`, errorBody);
      throw new Error('Failed to send invitation email');
    }

    logger.info(`[Email] Invitation email sent to ${options.email}`);
  } catch (error) {
    logger.error(`[Email] Error sending invitation email:`, error);
    throw error;
  }
}

/**
 * Send a generic email via the main site API
 */
export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}): Promise<void> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
        from: params.from || env.RESEND_FROM,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`[Email] Failed to send email (${response.status}):`, errorBody);
      throw new Error('Failed to send email');
    }

    logger.info(`[Email] Email sent to ${params.to}`);
  } catch (error) {
    logger.error(`[Email] Error sending email:`, error);
    throw error;
  }
}

/**
 * Email templates
 */
export const emailTemplates = {
  welcome: {
    subject: (planName: string) => `Welcome to Recoder ${planName}!`,
    getHtml: (planName: string) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6366f1;">Welcome to Recoder ${planName}!</h1>
        <p>Thank you for subscribing to Recoder. Your subscription is now active.</p>
        <p>You now have access to:</p>
        <ul>
          <li>AI-powered code generation</li>
          <li>Project management</li>
          <li>Team collaboration</li>
          <li>And much more...</li>
        </ul>
        <p>Get started by visiting your dashboard:</p>
        <a href="https://recoder.xyz/dashboard" style="
          display: inline-block;
          padding: 12px 24px;
          background-color: #6366f1;
          color: white;
          text-decoration: none;
          border-radius: 6px;
        ">Go to Dashboard</a>
        <p style="margin-top: 24px; color: #666;">
          If you have any questions, reply to this email or contact our support team.
        </p>
      </div>
    `,
  },

  cancellation: {
    subject: 'Your Recoder subscription has been cancelled',
    getHtml: () => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6366f1;">Subscription Cancelled</h1>
        <p>We're sorry to see you go. Your Recoder subscription has been cancelled.</p>
        <p>You'll still have access to your account and projects until the end of your current billing period.</p>
        <p>After that, your account will be downgraded to the Free plan with limited features.</p>
        <p>If you change your mind, you can reactivate your subscription at any time:</p>
        <a href="https://recoder.xyz/settings/billing" style="
          display: inline-block;
          padding: 12px 24px;
          background-color: #6366f1;
          color: white;
          text-decoration: none;
          border-radius: 6px;
        ">Reactivate Subscription</a>
        <p style="margin-top: 24px; color: #666;">
          We'd love to hear your feedback on why you cancelled. Reply to this email to let us know.
        </p>
      </div>
    `,
  },

  invitation: {
    subject: (teamName: string) => `You've been invited to join ${teamName} on Recoder`,
    getHtml: (options: OrganizationInvitationOptions) => {
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const safeLink = options.inviteLink.startsWith('https://') ? esc(options.inviteLink) : '#';
      return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6366f1;">You're Invited!</h1>
        <p><strong>${esc(options.invitedByUsername)}</strong> (${esc(options.invitedByEmail)}) has invited you to join <strong>${esc(options.teamName)}</strong> on Recoder.</p>
        <p>Click the button below to accept the invitation:</p>
        <a href="${safeLink}" style="
          display: inline-block;
          padding: 12px 24px;
          background-color: #6366f1;
          color: white;
          text-decoration: none;
          border-radius: 6px;
        ">Accept Invitation</a>
        <p style="margin-top: 24px; color: #666;">
          This invitation will expire in 7 days.
        </p>
        <p style="color: #666;">
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
      </div>
    `;
    },
  },
};
