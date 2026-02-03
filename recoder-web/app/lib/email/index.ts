/**
 * Recoder Email Package
 *
 * Provides email templates and utilities for sending transactional emails.
 * Uses React Email for template rendering and Resend for email delivery.
 *
 * Usage:
 *
 * ```typescript
 * import {
 *   sendEmailVerification,
 *   sendSignInEmail,
 *   sendOrganizationInvitation,
 *   sendWelcomeEmail,
 *   sendPasswordResetEmail,
 * } from '~/lib/email';
 *
 * // Send email verification
 * await sendEmailVerification('user@example.com', '123456');
 *
 * // Send organization invitation
 * await sendOrganizationInvitation({
 *   email: 'invitee@example.com',
 *   invitedByUsername: 'John Doe',
 *   invitedByEmail: 'john@example.com',
 *   teamName: 'My Team',
 *   inviteLink: 'https://recoder.xyz/invite/abc123',
 * });
 * ```
 *
 * Environment Variables:
 * - RESEND_API_KEY: Required for sending emails (optional in development)
 * - RESEND_FROM: Sender email address (defaults to noreply@recoder.xyz)
 */

// Export email sending utilities
export {
  sendCancellationEmail,
  sendContactFormNotification,
  sendEmail,
  sendEmailVerification,
  sendOrganizationInvitation,
  sendPasswordResetEmail,
  sendSignInEmail,
  sendWelcomeEmail,
  type EmailSendResult,
} from './utils/send-email';

// Export email rendering utilities
export {
  renderCancellationEmail,
  renderContactForm,
  renderEmailBoth,
  renderEmailTemplate,
  renderEmailVerification,
  renderOrganizationInvitation,
  renderPasswordReset,
  renderSignIn,
  renderWelcomeEmail,
  type RenderOptions,
} from './utils/render-email';

// Export plan utilities
export {
  getPlanBenefits,
  getPlanConfig,
  getPlanLimits,
  getPlanPricing,
  isFreePlan,
  isMaxPlan,
  isProPlan,
  normalizePlanName,
} from './utils/plan-utils';

// Export email templates (for custom usage)
export {
  CancellationEmailTemplate,
  ContactTemplate,
  EmailVerificationTemplate,
  emailSubjects,
  OrganizationInvitationTemplate,
  PasswordResetTemplate,
  SignInTemplate,
  WelcomeEmailTemplate,
} from './templates';

// Export email components (for building custom templates)
export {
  Button,
  ContentSection,
  EmailContainer,
  EmailFooter,
  EmailHeader,
  InfoBox,
  OtpCode,
} from './components';

// Export types
export type { ButtonProps } from './components/button';
export type { ContentSectionProps } from './components/content-section';
export type { EmailContainerProps } from './components/email-container';
export type { EmailFooterProps } from './components/email-footer';
export type { EmailHeaderProps } from './components/email-header';
export type { InfoBoxProps } from './components/info-box';
export type { OtpCodeProps } from './components/otp-code';
export type { PlanBenefits, PlanConfig, PlanConfigMap, PlanType } from './types/plan-types';
export { PLAN_TYPES } from './types/plan-types';

// Export config
export { PLAN_EMAIL_CONFIG } from './config/plan-config';
