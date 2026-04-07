/**
 * Enterprise Billing Module
 * Organization billing integration with usage tracking, seat counting, and tier limits
 *
 * Features:
 * - Subscription tier management (Free, Pro, Enterprise)
 * - Seat/member counting and limits
 * - Usage tracking (projects, storage, compute)
 * - Usage limits per tier
 * - Overage tracking and alerts
 * - Billing cycle management
 */
/**
 * Subscription tiers with increasing capabilities
 */
export declare enum SubscriptionTier {
    FREE = "free",
    PRO = "pro",
    ENTERPRISE = "enterprise"
}
/**
 * Billing cycle periods
 */
export declare enum BillingCycle {
    MONTHLY = "monthly",
    ANNUAL = "annual"
}
/**
 * Usage metric types
 */
export declare enum UsageMetric {
    SEATS = "seats",// Number of members
    PROJECTS = "projects",// Number of projects
    STORAGE_GB = "storage_gb",// Storage in GB
    COMPUTE_HOURS = "compute_hours",// Container compute hours
    DEPLOYMENTS = "deployments",// Number of deployments
    API_CALLS = "api_calls",// API calls per month
    BUILD_MINUTES = "build_minutes"
}
/**
 * Tier limits configuration
 */
export interface TierLimits {
    maxSeats: number;
    maxProjects: number;
    maxStorageGB: number;
    maxComputeHours: number;
    maxDeployments: number;
    maxApiCalls: number;
    maxBuildMinutes: number;
    features: {
        customDomains: boolean;
        ssoEnabled: boolean;
        auditLogs: boolean;
        prioritySupport: boolean;
        advancedAnalytics: boolean;
        customBranding: boolean;
        multiRegion: boolean;
        dedicatedSupport: boolean;
        sla: boolean;
    };
}
/**
 * Tier limits definitions
 */
export declare const TIER_LIMITS: Record<SubscriptionTier, TierLimits>;
/**
 * Subscription details
 */
export interface Subscription {
    id: string;
    orgId: string;
    tier: SubscriptionTier;
    cycle: BillingCycle;
    status: 'active' | 'past_due' | 'canceled' | 'trialing';
    seats: number;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    trialEnd?: Date;
    customLimits?: Partial<TierLimits>;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Usage record for tracking consumption
 */
export interface UsageRecord {
    id: string;
    orgId: string;
    metric: UsageMetric;
    value: number;
    timestamp: Date;
    periodStart: Date;
    periodEnd: Date;
    metadata?: Record<string, unknown>;
}
/**
 * Current usage snapshot
 */
export interface UsageSnapshot {
    orgId: string;
    period: {
        start: Date;
        end: Date;
    };
    usage: Record<UsageMetric, number>;
    limits: Record<UsageMetric, number>;
    percentages: Record<UsageMetric, number>;
    overages: Record<UsageMetric, number>;
    alerts: UsageAlert[];
}
/**
 * Usage alert
 */
export interface UsageAlert {
    metric: UsageMetric;
    type: 'approaching' | 'exceeded' | 'critical';
    threshold: number;
    current: number;
    message: string;
}
/**
 * Invoice model
 */
export interface Invoice {
    id: string;
    orgId: string;
    subscriptionId: string;
    periodStart: Date;
    periodEnd: Date;
    amount: number;
    currency: string;
    status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
    lineItems: InvoiceLineItem[];
    stripeInvoiceId?: string;
    paidAt?: Date;
    createdAt: Date;
}
/**
 * Invoice line item
 */
export interface InvoiceLineItem {
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    type: 'subscription' | 'overage' | 'addon';
}
/**
 * Seat change request
 */
export interface SeatChangeRequest {
    type: 'add' | 'remove';
    count: number;
    effectiveDate?: Date;
    prorate: boolean;
}
/**
 * In-memory billing storage
 * In production, this should use Stripe or another billing provider
 */
declare class BillingStore {
    private subscriptions;
    private usageRecords;
    private currentUsage;
    private invoices;
    private invoicesByOrg;
    createSubscription(subscription: Subscription): Subscription;
    getSubscription(orgId: string): Subscription | undefined;
    updateSubscription(orgId: string, updates: Partial<Subscription>): Subscription | undefined;
    private initializeUsage;
    recordUsage(record: UsageRecord): UsageRecord;
    getCurrentUsage(orgId: string): Map<UsageMetric, number>;
    setUsage(orgId: string, metric: UsageMetric, value: number): void;
    getUsageRecords(orgId: string, metric?: UsageMetric, startDate?: Date, endDate?: Date): UsageRecord[];
    resetPeriodUsage(orgId: string): void;
    createInvoice(invoice: Invoice): Invoice;
    getInvoice(invoiceId: string): Invoice | undefined;
    updateInvoice(invoiceId: string, updates: Partial<Invoice>): Invoice | undefined;
    listInvoices(orgId: string, status?: Invoice['status']): Invoice[];
}
export declare const billingStore: BillingStore;
/**
 * Get or create subscription for organization
 */
export declare function getOrCreateSubscription(orgId: string): Subscription;
/**
 * Get subscription details
 */
export declare function getSubscription(orgId: string, userId: string): Subscription;
/**
 * Get tier limits for organization
 */
export declare function getTierLimits(orgId: string): TierLimits;
/**
 * Check if organization has a specific feature
 */
export declare function hasFeature(orgId: string, feature: keyof TierLimits['features']): boolean;
/**
 * Get limit for a specific metric
 */
export declare function getLimit(orgId: string, metric: UsageMetric): number;
/**
 * Check if organization is within limits for a metric
 */
export declare function isWithinLimit(orgId: string, metric: UsageMetric, additionalUsage?: number): boolean;
/**
 * Enforce usage limit - throws if exceeded
 */
export declare function enforceLimit(orgId: string, metric: UsageMetric, additionalUsage?: number): void;
/**
 * Enforce feature availability
 */
export declare function enforceFeature(orgId: string, feature: keyof TierLimits['features']): void;
/**
 * Record usage for a metric
 */
export declare function recordUsage(orgId: string, metric: UsageMetric, value: number, metadata?: Record<string, unknown>): UsageRecord;
/**
 * Increment usage for a metric
 */
export declare function incrementUsage(orgId: string, metric: UsageMetric, amount?: number): void;
/**
 * Decrement usage for a metric
 */
export declare function decrementUsage(orgId: string, metric: UsageMetric, amount?: number): void;
/**
 * Set absolute usage for a metric
 */
export declare function setUsage(orgId: string, metric: UsageMetric, value: number): void;
/**
 * Get current usage snapshot
 */
export declare function getUsageSnapshot(orgId: string, userId: string): UsageSnapshot;
/**
 * Update seat count for organization
 */
export declare function updateSeats(orgId: string, userId: string, seatChange: SeatChangeRequest): Subscription;
/**
 * Upgrade subscription tier
 */
export declare function upgradeTier(orgId: string, userId: string, newTier: SubscriptionTier, cycle?: BillingCycle): Subscription;
/**
 * Downgrade subscription tier (effective at period end)
 */
export declare function downgradeTier(orgId: string, userId: string, newTier: SubscriptionTier): Subscription;
/**
 * Cancel subscription
 */
export declare function cancelSubscription(orgId: string, userId: string, immediate?: boolean): Subscription;
/**
 * Reactivate canceled subscription
 */
export declare function reactivateSubscription(orgId: string, userId: string): Subscription;
/**
 * Get invoices for organization
 */
export declare function getInvoices(orgId: string, userId: string, status?: Invoice['status']): Invoice[];
/**
 * Get specific invoice
 */
export declare function getInvoice(orgId: string, userId: string, invoiceId: string): Invoice;
/**
 * Get usage history for a metric
 */
export declare function getUsageHistory(orgId: string, userId: string, metric: UsageMetric, startDate?: Date, endDate?: Date): UsageRecord[];
/**
 * Sync member count with actual members
 */
export declare function syncMemberCount(orgId: string): void;
/**
 * Check if organization can add more members
 */
export declare function canAddMembers(orgId: string, count?: number): boolean;
/**
 * Enforce member limit before adding
 */
export declare function enforceMemberLimit(orgId: string, count?: number): void;
export {};
