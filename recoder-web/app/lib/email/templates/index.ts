// Export all email templates for easier imports
export { CancellationEmailTemplate } from './cancellation-email';
export { ContactTemplate } from './contact';
export { EmailVerificationTemplate } from './email-verification';
export { OrganizationInvitationTemplate } from './organization-invitation';
export { PasswordResetTemplate } from './password-reset';
export { SignInTemplate } from './sign-in';
export { WelcomeEmailTemplate } from './welcome-email';

// Template subject mapping
export const emailSubjects = {
  'sign-in': 'Recoder - Sign-in Verification Code',
  'email-verification': 'Recoder - Email Verification Code',
  'password-reset': 'Recoder - Reset Your Password',
  welcome: 'Welcome to Recoder!',
  cancellation: 'Recoder Subscription Cancelled',
  'organization-invitation': 'Invitation to join a team on Recoder',
  contact: 'Recoder Contact Form Submission',
};

// Re-export components for convenience
export * from '../components';
