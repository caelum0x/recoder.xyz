/**
 * Sandbox Service Types
 * Type definitions for the commercial sandbox-as-a-service architecture
 * Supports tiered pricing with usage tracking and quota management
 */

/**
 * Subscription tiers available for sandbox service
 */
export type SandboxTier = 'free' | 'pro' | 'enterprise';

/**
 * Resource limits for a sandbox plan
 */
export interface SandboxResourceLimits {
  /** Maximum number of sandboxes a user can create */
  maxSandboxes: number;
  /** Maximum concurrent running sandboxes */
  maxConcurrent: number;
  /** CPU limit in millicores (1000 = 1 CPU) */
  cpuLimit: number;
  /** Memory limit in MB */
  memoryLimit: number;
  /** Storage limit in MB */
  storageLimit: number;
  /** Maximum execution time per session in seconds (-1 for unlimited) */
  executionTimeLimit: number;
  /** Maximum API calls per month (-1 for unlimited) */
  apiCallsPerMonth: number;
  /** Maximum compute time per day in seconds (-1 for unlimited) */
  dailyComputeLimit: number;
}

/**
 * Plan pricing information
 */
export interface PlanPricing {
  /** Monthly price in cents (USD) */
  monthlyPriceCents: number;
  /** Annual price in cents (USD), typically discounted */
  annualPriceCents: number;
  /** Stripe price ID for monthly billing */
  stripePriceIdMonthly?: string;
  /** Stripe price ID for annual billing */
  stripePriceIdAnnual?: string;
}

/**
 * Features included in a plan
 */
export interface PlanFeatures {
  /** Priority support access */
  prioritySupport: boolean;
  /** Custom domain support */
  customDomains: boolean;
  /** Team collaboration features */
  teamCollaboration: boolean;
  /** Advanced analytics access */
  advancedAnalytics: boolean;
  /** SSH access to sandboxes */
  sshAccess: boolean;
  /** Persistent storage between sessions */
  persistentStorage: boolean;
  /** GPU access for ML workloads */
  gpuAccess: boolean;
  /** Private networking between sandboxes */
  privateNetworking: boolean;
  /** Snapshot and restore capability */
  snapshotRestore: boolean;
  /** CI/CD integration */
  cicdIntegration: boolean;
}

/**
 * Complete sandbox plan definition
 */
export interface SandboxPlan {
  /** Unique plan identifier */
  id: string;
  /** Display name for the plan */
  name: string;
  /** Plan tier */
  tier: SandboxTier;
  /** Plan description */
  description: string;
  /** Resource limits */
  limits: SandboxResourceLimits;
  /** Pricing information */
  pricing: PlanPricing;
  /** Features included */
  features: PlanFeatures;
  /** Whether this plan is currently available */
  isActive: boolean;
  /** Badge text for marketing (e.g., "Most Popular") */
  badge?: string;
}

/**
 * Current usage metrics for a user
 */
export interface SandboxUsage {
  /** User ID */
  userId: string;
  /** Current billing period start */
  periodStart: Date;
  /** Current billing period end */
  periodEnd: Date;
  /** Number of sandboxes created this period */
  sandboxesCreated: number;
  /** Number of currently active sandboxes */
  activeSandboxes: number;
  /** Number of currently running sandboxes */
  runningSandboxes: number;
  /** Total compute time used this period in seconds */
  computeTimeUsed: number;
  /** Compute time used today in seconds */
  computeTimeToday: number;
  /** Storage used in MB */
  storageUsed: number;
  /** API calls made this period */
  apiCallsUsed: number;
  /** API calls made today */
  apiCallsToday: number;
  /** Last updated timestamp */
  lastUpdated: Date;
}

/**
 * Quota status for limit checking
 */
export interface SandboxQuota {
  /** Whether user can create a new sandbox */
  canCreateSandbox: boolean;
  /** Whether user can start another sandbox */
  canStartSandbox: boolean;
  /** Remaining sandboxes that can be created */
  remainingSandboxes: number;
  /** Remaining concurrent slots */
  remainingConcurrent: number;
  /** Remaining API calls this month */
  remainingApiCalls: number;
  /** Remaining compute time today in seconds */
  remainingComputeToday: number;
  /** Remaining storage in MB */
  remainingStorage: number;
  /** Usage percentage for display (0-100) */
  usagePercentages: {
    sandboxes: number;
    storage: number;
    apiCalls: number;
    computeTime: number;
  };
  /** Alerts for approaching limits */
  alerts: QuotaAlert[];
}

/**
 * Alert for approaching quota limits
 */
export interface QuotaAlert {
  /** Alert type */
  type: 'warning' | 'critical' | 'exceeded';
  /** Resource that triggered the alert */
  resource: 'sandboxes' | 'storage' | 'apiCalls' | 'computeTime' | 'concurrent';
  /** Alert message */
  message: string;
  /** Current usage percentage */
  percentage: number;
  /** Timestamp when alert was generated */
  timestamp: Date;
}

/**
 * Subscription status for a user
 */
export interface SubscriptionStatus {
  /** User ID */
  userId: string;
  /** Current plan */
  plan: SandboxPlan;
  /** Subscription status */
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';
  /** Current period start */
  currentPeriodStart: Date;
  /** Current period end */
  currentPeriodEnd: Date;
  /** Whether subscription will cancel at period end */
  cancelAtPeriodEnd: boolean;
  /** Trial end date if applicable */
  trialEnd?: Date;
  /** Stripe subscription ID */
  stripeSubscriptionId?: string;
  /** Stripe customer ID */
  stripeCustomerId?: string;
}

/**
 * Event types for usage tracking
 */
export type UsageEventType =
  | 'sandbox_created'
  | 'sandbox_started'
  | 'sandbox_stopped'
  | 'sandbox_deleted'
  | 'api_call'
  | 'compute_tick'
  | 'storage_updated'
  | 'file_uploaded'
  | 'file_downloaded';

/**
 * Usage event for tracking
 */
export interface UsageEvent {
  /** Event ID */
  id: string;
  /** User ID */
  userId: string;
  /** Event type */
  type: UsageEventType;
  /** Sandbox ID if applicable */
  sandboxId?: string;
  /** Project ID if applicable */
  projectId?: string;
  /** Event metadata */
  metadata: Record<string, unknown>;
  /** Event timestamp */
  timestamp: Date;
  /** Resource consumption (e.g., bytes, seconds) */
  value?: number;
}

/**
 * Overage charge for exceeding limits
 */
export interface OverageCharge {
  /** User ID */
  userId: string;
  /** Resource that was exceeded */
  resource: 'apiCalls' | 'computeTime' | 'storage';
  /** Amount exceeded */
  amount: number;
  /** Unit of measurement */
  unit: string;
  /** Charge amount in cents */
  chargeCents: number;
  /** Billing period */
  billingPeriod: string;
  /** Whether this has been invoiced */
  invoiced: boolean;
  /** Stripe invoice item ID if invoiced */
  stripeInvoiceItemId?: string;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Requests per window */
  requestsPerWindow: number;
  /** Window size in seconds */
  windowSizeSeconds: number;
  /** Burst limit (max requests in short burst) */
  burstLimit: number;
}

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  /** Whether rate limited */
  isLimited: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** When the limit resets */
  resetAt: Date;
  /** Time to wait in milliseconds if limited */
  retryAfterMs?: number;
}

/**
 * Sandbox instance metadata
 */
export interface SandboxInstance {
  /** Sandbox ID */
  id: string;
  /** User ID who owns the sandbox */
  userId: string;
  /** Project ID associated with sandbox */
  projectId: string;
  /** Current status */
  status: 'creating' | 'running' | 'stopped' | 'error' | 'terminated';
  /** When the sandbox was created */
  createdAt: Date;
  /** When the sandbox was last started */
  lastStartedAt?: Date;
  /** When the sandbox was last stopped */
  lastStoppedAt?: Date;
  /** Total compute time accumulated in seconds */
  totalComputeTime: number;
  /** Storage used in MB */
  storageUsed: number;
  /** Allocated resources */
  resources: {
    cpu: number;
    memory: number;
    storage: number;
  };
  /** Container/VM provider metadata */
  providerMetadata?: Record<string, unknown>;
}

/**
 * Billing summary for display
 */
export interface BillingSummary {
  /** Current plan name */
  planName: string;
  /** Monthly cost in cents */
  monthlyCostCents: number;
  /** Projected overage charges in cents */
  projectedOverageCents: number;
  /** Usage breakdown */
  usageBreakdown: {
    label: string;
    used: number;
    limit: number;
    unit: string;
    percentage: number;
  }[];
  /** Next billing date */
  nextBillingDate: Date;
  /** Payment method last 4 digits */
  paymentMethodLast4?: string;
}

/**
 * Plan comparison for upgrade/downgrade
 */
export interface PlanComparison {
  /** Current plan */
  currentPlan: SandboxPlan;
  /** Target plan */
  targetPlan: SandboxPlan;
  /** Features gained */
  featuresGained: string[];
  /** Features lost */
  featuresLost: string[];
  /** Limit changes */
  limitChanges: {
    resource: string;
    currentLimit: number | string;
    newLimit: number | string;
    unit: string;
  }[];
  /** Price difference (positive = upgrade, negative = downgrade) */
  priceDifferenceCents: number;
  /** Prorated amount for immediate change */
  proratedAmountCents: number;
}
