/**
 * Polar.sh Billing Integration
 * Complete billing system for sandbox-as-a-service
 *
 * @module billing
 */

// ==================== Types ====================
export {
  // Subscription & Status
  type SubscriptionStatus,
  type BillingInterval,

  // Payment
  type PaymentMethod,
  type Invoice,
  type InvoiceStatus,
  type InvoiceLineItem,

  // Usage
  type UsageType,
  type UsageRecord,
  type UsageSummary,

  // Polar.sh Types
  type PolarCustomer,
  type PolarPrice,
  type PolarProduct,
  type PolarBenefit,
  type PolarSubscription,
  type PolarCheckout,
  type CheckoutStatus,

  // Webhook
  type PolarWebhookEvent,
  type PolarWebhookPayload,

  // Plans
  type PlanTier,
  type PlanFeature,
  type SubscriptionPlan,

  // State
  type BillingState,

  // API Types
  type CreateCheckoutRequest,
  type CreateCheckoutResponse,
  type ReportUsageRequest,
  type CancelSubscriptionRequest,

  // Errors
  BillingError,
  BillingErrorCodes,

  // Utility Types
  type PaginatedResponse,
  type DateRange,
} from './types';

// ==================== Polar.sh API Client ====================
export {
  // Customer API
  createCustomer,
  getCustomer,
  getCustomerByEmail,
  updateCustomer,

  // Product API
  listProducts,
  getProduct,

  // Subscription API
  getSubscription,
  listSubscriptions,
  cancelSubscription,
  updateSubscription,

  // Checkout API
  createCheckout,
  getCheckout,

  // Invoice API
  listInvoices,
  getInvoice,

  // Usage API
  reportUsage,
  getUsageSummary,

  // Webhook
  verifyWebhookSignature,

  // Client class
  PolarClient,
  polarClient,
} from './polar-client';

// ==================== Subscription Manager ====================
export {
  // Plans configuration
  SUBSCRIPTION_PLANS,

  // Nanostores
  currentCustomer,
  currentSubscription,
  subscriptionStatus,
  currentPlanTier,
  currentPlan,
  isSubscriptionActive,
  isTrialing,
  trialDaysRemaining,
  isSubscriptionLoading,
  subscriptionError,
  usageSummary,
  isApproachingLimits,
  hasExceededLimits,

  // Actions
  setCustomer,
  setSubscription,
  updateUsageSummary,
  clearSubscriptionState,

  // API Integration
  fetchSubscription,
  createSubscriptionCheckout,
  cancelCurrentSubscription,
  reactivateSubscription,
  changePlan,
  fetchUsageSummary,

  // Helpers
  getPlanByTier,
  getPlanById,
  canAccessFeature,
  getUsageLimit,
  isApproachingLimit,
  hasExceededLimit,
  formatPrice,
  getDaysUntilRenewal,

  // Initialization
  initializeSubscription,
} from './subscription-manager';

// ==================== Usage-Based Billing ====================
export {
  // Configuration
  type UsageTrackingConfig,
  DEFAULT_USAGE_CONFIG,

  // Nanostores
  usageConfig,
  pendingUsage,
  localUsage,
  isReportingUsage,
  lastUsageReport,
  usageError,
  isAtWarningLevel,
  isAtCriticalLevel,

  // Usage getters
  getCurrentUsage,
  getUsagePercentage,

  // Tracking functions
  trackUsage,
  trackSandboxUsage,
  trackAITokenUsage,
  trackStorageUsage,
  trackDeployment,
  trackApiRequest,
  flushUsage,
  refreshUsageSummary,

  // Overage calculation
  type OverageInfo,
  OVERAGE_RATES,
  calculateOverages,
  getTotalOverageCost,

  // Usage alerts
  type UsageAlert,
  usageAlerts,
  checkUsageAlerts,
  dismissAlert,
  clearAlerts,

  // Billable events
  type BillableEvent,
  recentEvents,
  createBillableEvent,
  markEventReported,

  // Utility functions
  formatUsageType,
  formatUsageValue,
  formatOverageCost,
  getUsageColor,

  // Initialization
  initializeUsageTracking,
  cleanupUsageTracking,
} from './usage-billing';
