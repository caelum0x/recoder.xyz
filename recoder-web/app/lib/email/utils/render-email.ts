// @ts-nocheck
import { render } from '@react-email/components';
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

/**
 * Render options for email templates
 */
export interface RenderOptions {
  /** Whether to render as plain text instead of HTML */
  plainText?: boolean;
  /** Whether to pretty print the HTML output */
  pretty?: boolean;
}

/**
 * Render an email verification template to HTML/text
 */
export async function renderEmailVerification(otp: string, options?: RenderOptions): Promise<string> {
  const element = React.createElement(EmailVerificationTemplate, { otp });
  return render(element, {
    plainText: options?.plainText,
    pretty: options?.pretty,
  });
}

/**
 * Render a sign-in template to HTML/text
 */
export async function renderSignIn(otp: string, options?: RenderOptions): Promise<string> {
  const element = React.createElement(SignInTemplate, { otp });
  return render(element, {
    plainText: options?.plainText,
    pretty: options?.pretty,
  });
}

/**
 * Render an organization invitation template to HTML/text
 */
export async function renderOrganizationInvitation(
  props: {
    invitedByUsername: string;
    invitedByEmail: string;
    teamName: string;
    inviteLink: string;
  },
  options?: RenderOptions
): Promise<string> {
  const element = React.createElement(OrganizationInvitationTemplate, props);
  return render(element, {
    plainText: options?.plainText,
    pretty: options?.pretty,
  });
}

/**
 * Render a welcome email template to HTML/text
 */
export async function renderWelcomeEmail(planName: string, options?: RenderOptions): Promise<string> {
  const element = React.createElement(WelcomeEmailTemplate, { planName });
  return render(element, {
    plainText: options?.plainText,
    pretty: options?.pretty,
  });
}

/**
 * Render a cancellation email template to HTML/text
 */
export async function renderCancellationEmail(options?: RenderOptions): Promise<string> {
  const element = React.createElement(CancellationEmailTemplate, {});
  return render(element, {
    plainText: options?.plainText,
    pretty: options?.pretty,
  });
}

/**
 * Render a contact form template to HTML/text
 */
export async function renderContactForm(
  props: {
    name: string;
    email: string;
    message: string;
  },
  options?: RenderOptions
): Promise<string> {
  const element = React.createElement(ContactTemplate, props);
  return render(element, {
    plainText: options?.plainText,
    pretty: options?.pretty,
  });
}

/**
 * Render a password reset template to HTML/text
 */
export async function renderPasswordReset(
  props: {
    resetLink: string;
    expiresIn?: string;
  },
  options?: RenderOptions
): Promise<string> {
  const element = React.createElement(PasswordResetTemplate, props);
  return render(element, {
    plainText: options?.plainText,
    pretty: options?.pretty,
  });
}

/**
 * Generic render function for any React Email component
 */
export async function renderEmailTemplate(
  element: React.ReactElement,
  options?: RenderOptions
): Promise<string> {
  return render(element, {
    plainText: options?.plainText,
    pretty: options?.pretty,
  });
}

/**
 * Render both HTML and plain text versions of an email
 */
export async function renderEmailBoth(element: React.ReactElement): Promise<{
  html: string;
  text: string;
}> {
  const [html, text] = await Promise.all([
    render(element, { plainText: false }),
    render(element, { plainText: true }),
  ]);
  return { html, text };
}
