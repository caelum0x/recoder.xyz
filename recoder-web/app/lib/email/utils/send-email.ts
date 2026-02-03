// @ts-nocheck
import { Resend } from 'resend';
import * as React from 'react';
import {
  CancellationEmailTemplate,
  ContactTemplate,
  EmailVerificationTemplate,
  OrganizationInvitationTemplate,
  PasswordResetTemplate,
  SignInTemplate,
  WelcomeEmailTemplate,
} from '../templates';

// Initialize Resend client
// In production, set RESEND_API_KEY environment variable
const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY not set. Email sending will be disabled.');
    return null;
  }
  return new Resend(apiKey);
};

// Get the sender email from environment or use default
const getFromEmail = () => {
  return process.env.RESEND_FROM || 'noreply@recoder.xyz';
};

/**
 * Email send result type
 */
export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a welcome email to a specific email address.
 */
export async function sendWelcomeEmail(userEmail: string, planName: string): Promise<EmailSendResult> {
  const resend = getResendClient();
  if (!resend) {
    console.log(`[Email] Would send welcome email to ${userEmail} for plan: ${planName}`);
    return { success: true, messageId: 'mock-id' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: [userEmail],
      subject: `Welcome to the Recoder ${planName} Plan`,
      react: React.createElement(WelcomeEmailTemplate, { planName }) as React.ReactElement,
    });

    if (error) {
      console.error(`[Email] Failed to send welcome email to ${userEmail}:`, error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Email] Failed to send welcome email to ${userEmail}:`, error);
    return { success: false, error: message };
  }
}

/**
 * Send a cancellation email to a specific email address.
 */
export async function sendCancellationEmail(userEmail: string): Promise<EmailSendResult> {
  const resend = getResendClient();
  if (!resend) {
    console.log(`[Email] Would send cancellation email to ${userEmail}`);
    return { success: true, messageId: 'mock-id' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: [userEmail],
      subject: 'Recoder Subscription Cancelled',
      react: React.createElement(CancellationEmailTemplate, {}) as React.ReactElement,
    });

    if (error) {
      console.error(`[Email] Failed to send cancellation email to ${userEmail}:`, error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Email] Failed to send cancellation email to ${userEmail}:`, error);
    return { success: false, error: message };
  }
}

/**
 * Send an organization invitation email.
 */
export async function sendOrganizationInvitation(options: {
  email: string;
  invitedByUsername: string;
  invitedByEmail: string;
  teamName: string;
  inviteLink: string;
}): Promise<EmailSendResult> {
  const { email, invitedByUsername, invitedByEmail, teamName, inviteLink } = options;
  const resend = getResendClient();

  if (!resend) {
    console.log(`[Email] Would send organization invitation to ${email} for team: ${teamName}`);
    return { success: true, messageId: 'mock-id' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: [email],
      subject: 'Invitation to join a team on Recoder',
      react: React.createElement(OrganizationInvitationTemplate, {
        invitedByUsername,
        invitedByEmail,
        teamName,
        inviteLink,
      }) as React.ReactElement,
    });

    if (error) {
      console.error(`[Email] Failed to send organization invitation to ${email}:`, error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Email] Failed to send organization invitation to ${email}:`, error);
    return { success: false, error: message };
  }
}

/**
 * Send a sign-in verification email with OTP code.
 */
export async function sendSignInEmail(userEmail: string, otp: string): Promise<EmailSendResult> {
  const resend = getResendClient();
  if (!resend) {
    console.log(`[Email] Would send sign-in email to ${userEmail} with OTP: ${otp}`);
    return { success: true, messageId: 'mock-id' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: [userEmail],
      subject: 'Recoder - Sign-in Verification Code',
      react: React.createElement(SignInTemplate, { otp }) as React.ReactElement,
    });

    if (error) {
      console.error(`[Email] Failed to send sign-in email to ${userEmail}:`, error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Email] Failed to send sign-in email to ${userEmail}:`, error);
    return { success: false, error: message };
  }
}

/**
 * Send an email verification code.
 */
export async function sendEmailVerification(userEmail: string, otp: string): Promise<EmailSendResult> {
  const resend = getResendClient();
  if (!resend) {
    console.log(`[Email] Would send email verification to ${userEmail} with OTP: ${otp}`);
    return { success: true, messageId: 'mock-id' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: [userEmail],
      subject: 'Recoder - Email Verification Code',
      react: React.createElement(EmailVerificationTemplate, { otp }) as React.ReactElement,
    });

    if (error) {
      console.error(`[Email] Failed to send email verification to ${userEmail}:`, error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Email] Failed to send email verification to ${userEmail}:`, error);
    return { success: false, error: message };
  }
}

/**
 * Send a password reset email.
 */
export async function sendPasswordResetEmail(
  userEmail: string,
  resetLink: string,
  expiresIn?: string
): Promise<EmailSendResult> {
  const resend = getResendClient();
  if (!resend) {
    console.log(`[Email] Would send password reset to ${userEmail}`);
    return { success: true, messageId: 'mock-id' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: [userEmail],
      subject: 'Recoder - Reset Your Password',
      react: React.createElement(PasswordResetTemplate, { resetLink, expiresIn }) as React.ReactElement,
    });

    if (error) {
      console.error(`[Email] Failed to send password reset to ${userEmail}:`, error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Email] Failed to send password reset to ${userEmail}:`, error);
    return { success: false, error: message };
  }
}

/**
 * Send a contact form submission notification.
 */
export async function sendContactFormNotification(options: {
  name: string;
  email: string;
  message: string;
  recipientEmail: string;
}): Promise<EmailSendResult> {
  const { name, email, message, recipientEmail } = options;
  const resend = getResendClient();

  if (!resend) {
    console.log(`[Email] Would send contact form notification to ${recipientEmail}`);
    return { success: true, messageId: 'mock-id' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: [recipientEmail],
      subject: 'Recoder Contact Form Submission',
      react: React.createElement(ContactTemplate, { name, email, message }) as React.ReactElement,
    });

    if (error) {
      console.error(`[Email] Failed to send contact form notification to ${recipientEmail}:`, error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Email] Failed to send contact form notification to ${recipientEmail}:`, error);
    return { success: false, error: message };
  }
}

/**
 * Generic email sending function for custom emails
 */
export async function sendEmail(options: {
  to: string | string[];
  subject: string;
  react: React.ReactElement;
  replyTo?: string;
}): Promise<EmailSendResult> {
  const { to, subject, react, replyTo } = options;
  const resend = getResendClient();

  if (!resend) {
    console.log(`[Email] Would send email "${subject}" to ${Array.isArray(to) ? to.join(', ') : to}`);
    return { success: true, messageId: 'mock-id' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: Array.isArray(to) ? to : [to],
      subject,
      react,
      replyTo,
    });

    if (error) {
      console.error(`[Email] Failed to send email:`, error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Email] Failed to send email:`, error);
    return { success: false, error: errorMessage };
  }
}
