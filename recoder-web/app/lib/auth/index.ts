/**
 * Auth Module Index
 * Main entry point for all auth-related functionality
 *
 * This module provides:
 * - Authentication plugins (organization, stripe, email-otp, captcha)
 * - Subscription limit management
 * - Utility functions for email, subscriptions, organizations, and admin
 * - Type definitions for auth-related data structures
 */

// Types
export * from './types';

// Environment configuration
export * from './env';

// Plugins - export individually to avoid conflicts
export {
  // Organization plugin
  createOrganizationPlugin,
  organizationPlugin,
  getOrganizationById as getOrganizationByIdFromPlugin,
  getUserOrganizations as getUserOrganizationsFromPlugin,
  type OrganizationPluginConfig,
  type InvitationEmailData,
  type BeforeCreateParams,
  type BeforeCreateResult,
  type AfterCreateParams,
} from './plugins/organization-plugin';

export {
  // Stripe plugin
  createStripePlugin,
  stripePlugin,
  verifyStripeWebhook,
  createCheckoutSession,
  createPortalSession,
  parseBillingInterval as parseStripeBillingInterval,
  parseCustomLimits,
  type StripePluginConfig,
  type StripePlan,
  type CheckoutSessionParams,
  type CheckoutSessionData,
  type CheckoutSessionResult,
  type StripeEvent,
} from './plugins/stripe-plugin';

export {
  // Email OTP plugin
  createEmailOTPPlugin,
  emailOTPPlugin,
  generateOTP,
  verifyOTP,
  requestSignInOTP,
  requestVerificationOTP,
  emailTemplates as otpEmailTemplates,
  type EmailOTPPluginConfig,
  type SendOTPParams,
  type OTPType,
} from './plugins/email-otp-plugin';

export {
  // Captcha plugin
  createCaptchaPlugin,
  captchaPlugin,
  verifyCaptcha,
  verifyTurnstileToken,
  verifyRecaptchaToken,
  verifyHcaptchaToken,
  extractCaptchaToken,
  captchaMiddleware,
  getTurnstileScriptUrl,
  getTurnstileSiteKey,
  type CaptchaPluginConfig,
  type CaptchaProvider,
} from './plugins/captcha-plugin';

// Subscription limits
export * from './subscription-limits';

// Utilities - export individually to avoid conflicts
export {
  // Email service
  sendWelcomeEmail,
  sendCancellationEmail,
  sendOrganizationInvitation,
  sendEmail,
  emailTemplates,
} from './utils/email-service';

export {
  // Subscription utils
  getSubscription,
  getOrganizationSubscription,
  hasPaidSubscription,
  hasMinimumPlan,
  getActiveOrganization as getActiveOrganizationForUser,
  getOrganizationOwnerUserId,
  hasOrganizationRole,
  getSubscriptionPlanDisplayName,
  getSubscriptionStatusDisplay,
  isSubscriptionActive,
  subscriptionNeedsAttention,
} from './utils/subscription-utils';

export {
  // Organization utils
  getActiveOrganization,
  createDefaultOrganization,
  getOrganizationById,
  getOrganizationMembers,
  getOrganizationOwner,
  isOrganizationMember,
  isOrganizationOwner,
  addOrganizationMember,
  removeOrganizationMember,
  updateMemberRole,
  getUserOrganizations,
  generateOrganizationSlug,
} from './utils/organization-utils';

export {
  // Admin utils
  isAdmin,
  requireAdmin,
  checkAdminAccess,
  adminAction,
  logAdminAction,
  logUserAction,
  logSubscriptionAction,
  logOrganizationAction,
  ADMIN_ACTIONS,
  type AdminLogEntry,
} from './utils/admin-utils';

// Re-export session utilities from existing file
export {
  verifySession,
  getCurrentUser,
  isAuthenticated,
  hasSubscription,
  getLoginUrl,
  getSignupUrl,
  type User,
  type Session,
} from './session.server';
