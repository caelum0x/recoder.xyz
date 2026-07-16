/**
 * Services Index
 * Export all services from a single entry point
 */

export { authService, AuthService } from './auth.service';
export { userService, UserService } from './user.service';
export { billingService, BillingService } from './billing.service';
export { analyticsService, AnalyticsService } from './analytics.service';
export { apiKeyService, ApiKeyService } from './apikey.service';
// Re-export email functions
export {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendSubscriptionConfirmationEmail,
  sendApiKeyCreatedEmail,
} from '../email';

// Re-export crypto functions
export {
  hashPassword,
  verifyPassword,
  encryptApiKey,
  decryptApiKey,
  generateSecureToken,
} from '../crypto';
