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

import { v4 as uuid } from 'uuid';
import { AppError, ErrorCode } from '../errors/index.js';
import { Permission, requirePermission, organizationStore } from './organization.js';
import { createAuditLog, AuditAction, AuditResourceType } from './audit-log.js';

// ==================== Types & Interfaces ====================

/**
 * Subscription tiers with increasing capabilities
 */
export enum SubscriptionTier {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

/**
 * Billing cycle periods
 */
export enum BillingCycle {
  MONTHLY = 'monthly',
  ANNUAL = 'annual',
}

/**
 * Usage metric types
 */
export enum UsageMetric {
  SEATS = 'seats',                       // Number of members
  PROJECTS = 'projects',                 // Number of projects
  STORAGE_GB = 'storage_gb',             // Storage in GB
  COMPUTE_HOURS = 'compute_hours',       // Container compute hours
  DEPLOYMENTS = 'deployments',           // Number of deployments
  API_CALLS = 'api_calls',               // API calls per month
  BUILD_MINUTES = 'build_minutes',       // Build minutes per month
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
export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  [SubscriptionTier.FREE]: {
    maxSeats: 5,
    maxProjects: 10,
    maxStorageGB: 5,
    maxComputeHours: 100,
    maxDeployments: 50,
    maxApiCalls: 10000,
    maxBuildMinutes: 500,
    features: {
      customDomains: false,
      ssoEnabled: false,
      auditLogs: false,
      prioritySupport: false,
      advancedAnalytics: false,
      customBranding: false,
      multiRegion: false,
      dedicatedSupport: false,
      sla: false,
    },
  },
  [SubscriptionTier.PRO]: {
    maxSeats: 25,
    maxProjects: 50,
    maxStorageGB: 50,
    maxComputeHours: 500,
    maxDeployments: 200,
    maxApiCalls: 100000,
    maxBuildMinutes: 2000,
    features: {
      customDomains: true,
      ssoEnabled: false,
      auditLogs: true,
      prioritySupport: true,
      advancedAnalytics: true,
      customBranding: false,
      multiRegion: false,
      dedicatedSupport: false,
      sla: false,
    },
  },
  [SubscriptionTier.ENTERPRISE]: {
    maxSeats: -1,           // Unlimited
    maxProjects: -1,        // Unlimited
    maxStorageGB: 500,
    maxComputeHours: -1,    // Unlimited
    maxDeployments: -1,     // Unlimited
    maxApiCalls: -1,        // Unlimited
    maxBuildMinutes: -1,    // Unlimited
    features: {
      customDomains: true,
      ssoEnabled: true,
      auditLogs: true,
      prioritySupport: true,
      advancedAnalytics: true,
      customBranding: true,
      multiRegion: true,
      dedicatedSupport: true,
      sla: true,
    },
  },
};

/**
 * Subscription details
 */
export interface Subscription {
  id: string;
  orgId: string;
  tier: SubscriptionTier;
  cycle: BillingCycle;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  seats: number;                          // Purchased seats
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
  customLimits?: Partial<TierLimits>;     // Override default limits
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
  threshold: number;                      // Percentage
  current: number;                        // Current percentage
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
  amount: number;                         // In cents
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
  unitPrice: number;                      // In cents
  amount: number;                         // In cents
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

// ==================== In-Memory Storage ====================

/**
 * In-memory billing storage
 * In production, this should use Stripe or another billing provider
 */
class BillingStore {
  private subscriptions = new Map<string, Subscription>();    // orgId -> subscription
  private usageRecords = new Map<string, UsageRecord[]>();    // orgId -> records
  private currentUsage = new Map<string, Map<UsageMetric, number>>(); // orgId -> metric -> value
  private invoices = new Map<string, Invoice>();              // invoiceId -> invoice
  private invoicesByOrg = new Map<string, string[]>();        // orgId -> invoiceIds

  // Subscription operations
  createSubscription(subscription: Subscription): Subscription {
    this.subscriptions.set(subscription.orgId, subscription);
    this.initializeUsage(subscription.orgId);
    return subscription;
  }

  getSubscription(orgId: string): Subscription | undefined {
    return this.subscriptions.get(orgId);
  }

  updateSubscription(orgId: string, updates: Partial<Subscription>): Subscription | undefined {
    const subscription = this.subscriptions.get(orgId);
    if (!subscription) return undefined;

    const updated = { ...subscription, ...updates, updatedAt: new Date() };
    this.subscriptions.set(orgId, updated);
    return updated;
  }

  // Usage operations
  private initializeUsage(orgId: string): void {
    if (!this.currentUsage.has(orgId)) {
      const metrics = new Map<UsageMetric, number>();
      for (const metric of Object.values(UsageMetric)) {
        metrics.set(metric, 0);
      }
      this.currentUsage.set(orgId, metrics);
    }
    if (!this.usageRecords.has(orgId)) {
      this.usageRecords.set(orgId, []);
    }
  }

  recordUsage(record: UsageRecord): UsageRecord {
    const records = this.usageRecords.get(record.orgId) || [];
    records.push(record);
    this.usageRecords.set(record.orgId, records);

    // Update current usage
    const current = this.currentUsage.get(record.orgId);
    if (current) {
      current.set(record.metric, (current.get(record.metric) || 0) + record.value);
    }

    return record;
  }

  getCurrentUsage(orgId: string): Map<UsageMetric, number> {
    this.initializeUsage(orgId);
    return this.currentUsage.get(orgId)!;
  }

  setUsage(orgId: string, metric: UsageMetric, value: number): void {
    this.initializeUsage(orgId);
    this.currentUsage.get(orgId)!.set(metric, value);
  }

  getUsageRecords(orgId: string, metric?: UsageMetric, startDate?: Date, endDate?: Date): UsageRecord[] {
    let records = this.usageRecords.get(orgId) || [];

    if (metric) {
      records = records.filter(r => r.metric === metric);
    }
    if (startDate) {
      records = records.filter(r => r.timestamp >= startDate);
    }
    if (endDate) {
      records = records.filter(r => r.timestamp <= endDate);
    }

    return records;
  }

  resetPeriodUsage(orgId: string): void {
    const current = this.currentUsage.get(orgId);
    if (current) {
      // Reset metrics that are per-period
      current.set(UsageMetric.COMPUTE_HOURS, 0);
      current.set(UsageMetric.DEPLOYMENTS, 0);
      current.set(UsageMetric.API_CALLS, 0);
      current.set(UsageMetric.BUILD_MINUTES, 0);
    }
  }

  // Invoice operations
  createInvoice(invoice: Invoice): Invoice {
    this.invoices.set(invoice.id, invoice);

    const orgInvoices = this.invoicesByOrg.get(invoice.orgId) || [];
    orgInvoices.push(invoice.id);
    this.invoicesByOrg.set(invoice.orgId, orgInvoices);

    return invoice;
  }

  getInvoice(invoiceId: string): Invoice | undefined {
    return this.invoices.get(invoiceId);
  }

  updateInvoice(invoiceId: string, updates: Partial<Invoice>): Invoice | undefined {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return undefined;

    const updated = { ...invoice, ...updates };
    this.invoices.set(invoiceId, updated);
    return updated;
  }

  listInvoices(orgId: string, status?: Invoice['status']): Invoice[] {
    const invoiceIds = this.invoicesByOrg.get(orgId) || [];
    let invoices = invoiceIds
      .map(id => this.invoices.get(id))
      .filter((i): i is Invoice => i !== undefined);

    if (status) {
      invoices = invoices.filter(i => i.status === status);
    }

    return invoices.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

// Singleton store instance
export const billingStore = new BillingStore();

// ==================== Billing Service ====================

/**
 * Get or create subscription for organization
 */
export function getOrCreateSubscription(orgId: string): Subscription {
  let subscription = billingStore.getSubscription(orgId);

  if (!subscription) {
    // Create default free subscription
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    subscription = {
      id: uuid(),
      orgId,
      tier: SubscriptionTier.FREE,
      cycle: BillingCycle.MONTHLY,
      status: 'active',
      seats: 5,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    };

    billingStore.createSubscription(subscription);
  }

  return subscription;
}

/**
 * Get subscription details
 */
export function getSubscription(orgId: string, userId: string): Subscription {
  requirePermission(userId, orgId, [Permission.ORG_VIEW]);
  return getOrCreateSubscription(orgId);
}

/**
 * Get tier limits for organization
 */
export function getTierLimits(orgId: string): TierLimits {
  const subscription = getOrCreateSubscription(orgId);
  const baseLimits = TIER_LIMITS[subscription.tier];

  // Apply custom limits if any
  if (subscription.customLimits) {
    return {
      ...baseLimits,
      ...subscription.customLimits,
      features: {
        ...baseLimits.features,
        ...subscription.customLimits.features,
      },
    };
  }

  return baseLimits;
}

/**
 * Check if organization has a specific feature
 */
export function hasFeature(orgId: string, feature: keyof TierLimits['features']): boolean {
  const limits = getTierLimits(orgId);
  return limits.features[feature];
}

/**
 * Get limit for a specific metric
 */
export function getLimit(orgId: string, metric: UsageMetric): number {
  const limits = getTierLimits(orgId);
  const subscription = getOrCreateSubscription(orgId);

  switch (metric) {
    case UsageMetric.SEATS:
      // Use purchased seats or default
      return subscription.seats || limits.maxSeats;
    case UsageMetric.PROJECTS:
      return limits.maxProjects;
    case UsageMetric.STORAGE_GB:
      return limits.maxStorageGB;
    case UsageMetric.COMPUTE_HOURS:
      return limits.maxComputeHours;
    case UsageMetric.DEPLOYMENTS:
      return limits.maxDeployments;
    case UsageMetric.API_CALLS:
      return limits.maxApiCalls;
    case UsageMetric.BUILD_MINUTES:
      return limits.maxBuildMinutes;
    default:
      return -1;
  }
}

/**
 * Check if organization is within limits for a metric
 */
export function isWithinLimit(orgId: string, metric: UsageMetric, additionalUsage: number = 0): boolean {
  const limit = getLimit(orgId, metric);
  if (limit === -1) return true; // Unlimited

  const current = billingStore.getCurrentUsage(orgId).get(metric) || 0;
  return (current + additionalUsage) <= limit;
}

/**
 * Enforce usage limit - throws if exceeded
 */
export function enforceLimit(orgId: string, metric: UsageMetric, additionalUsage: number = 0): void {
  if (!isWithinLimit(orgId, metric, additionalUsage)) {
    const limit = getLimit(orgId, metric);
    const current = billingStore.getCurrentUsage(orgId).get(metric) || 0;

    throw new AppError(
      ErrorCode.QUOTA_EXCEEDED,
      `${metric} limit exceeded. Current: ${current}, Limit: ${limit}`,
      {
        details: {
          metric,
          current,
          limit,
          requested: additionalUsage,
        },
      }
    );
  }
}

/**
 * Enforce feature availability
 */
export function enforceFeature(orgId: string, feature: keyof TierLimits['features']): void {
  if (!hasFeature(orgId, feature)) {
    const subscription = getOrCreateSubscription(orgId);
    throw new AppError(
      ErrorCode.QUOTA_EXCEEDED,
      `Feature '${feature}' is not available on the ${subscription.tier} plan`,
      {
        details: {
          feature,
          currentTier: subscription.tier,
        },
      }
    );
  }
}

/**
 * Record usage for a metric
 */
export function recordUsage(
  orgId: string,
  metric: UsageMetric,
  value: number,
  metadata?: Record<string, unknown>
): UsageRecord {
  const subscription = getOrCreateSubscription(orgId);

  const record: UsageRecord = {
    id: uuid(),
    orgId,
    metric,
    value,
    timestamp: new Date(),
    periodStart: subscription.currentPeriodStart,
    periodEnd: subscription.currentPeriodEnd,
    metadata,
  };

  return billingStore.recordUsage(record);
}

/**
 * Increment usage for a metric
 */
export function incrementUsage(orgId: string, metric: UsageMetric, amount: number = 1): void {
  const current = billingStore.getCurrentUsage(orgId).get(metric) || 0;
  billingStore.setUsage(orgId, metric, current + amount);
  recordUsage(orgId, metric, amount);
}

/**
 * Decrement usage for a metric
 */
export function decrementUsage(orgId: string, metric: UsageMetric, amount: number = 1): void {
  const current = billingStore.getCurrentUsage(orgId).get(metric) || 0;
  billingStore.setUsage(orgId, metric, Math.max(0, current - amount));
}

/**
 * Set absolute usage for a metric
 */
export function setUsage(orgId: string, metric: UsageMetric, value: number): void {
  billingStore.setUsage(orgId, metric, value);
}

/**
 * Get current usage snapshot
 */
export function getUsageSnapshot(orgId: string, userId: string): UsageSnapshot {
  requirePermission(userId, orgId, [Permission.ORG_VIEW]);

  const subscription = getOrCreateSubscription(orgId);
  const currentUsage = billingStore.getCurrentUsage(orgId);
  const limits = getTierLimits(orgId);

  const usage: Record<UsageMetric, number> = {} as Record<UsageMetric, number>;
  const limitValues: Record<UsageMetric, number> = {} as Record<UsageMetric, number>;
  const percentages: Record<UsageMetric, number> = {} as Record<UsageMetric, number>;
  const overages: Record<UsageMetric, number> = {} as Record<UsageMetric, number>;
  const alerts: UsageAlert[] = [];

  for (const metric of Object.values(UsageMetric)) {
    const value = currentUsage.get(metric) || 0;
    const limit = getLimit(orgId, metric);

    usage[metric] = value;
    limitValues[metric] = limit;

    if (limit === -1) {
      percentages[metric] = 0;
      overages[metric] = 0;
    } else {
      const percentage = (value / limit) * 100;
      percentages[metric] = Math.round(percentage * 100) / 100;
      overages[metric] = Math.max(0, value - limit);

      // Generate alerts
      if (percentage >= 100) {
        alerts.push({
          metric,
          type: 'exceeded',
          threshold: 100,
          current: percentage,
          message: `${formatMetricName(metric)} limit exceeded (${value}/${limit})`,
        });
      } else if (percentage >= 90) {
        alerts.push({
          metric,
          type: 'critical',
          threshold: 90,
          current: percentage,
          message: `${formatMetricName(metric)} usage at ${Math.round(percentage)}% (${value}/${limit})`,
        });
      } else if (percentage >= 75) {
        alerts.push({
          metric,
          type: 'approaching',
          threshold: 75,
          current: percentage,
          message: `${formatMetricName(metric)} usage at ${Math.round(percentage)}% (${value}/${limit})`,
        });
      }
    }
  }

  return {
    orgId,
    period: {
      start: subscription.currentPeriodStart,
      end: subscription.currentPeriodEnd,
    },
    usage,
    limits: limitValues,
    percentages,
    overages,
    alerts,
  };
}

/**
 * Format metric name for display
 */
function formatMetricName(metric: UsageMetric): string {
  const names: Record<UsageMetric, string> = {
    [UsageMetric.SEATS]: 'Seats',
    [UsageMetric.PROJECTS]: 'Projects',
    [UsageMetric.STORAGE_GB]: 'Storage',
    [UsageMetric.COMPUTE_HOURS]: 'Compute Hours',
    [UsageMetric.DEPLOYMENTS]: 'Deployments',
    [UsageMetric.API_CALLS]: 'API Calls',
    [UsageMetric.BUILD_MINUTES]: 'Build Minutes',
  };
  return names[metric] || metric;
}

/**
 * Update seat count for organization
 */
export function updateSeats(
  orgId: string,
  userId: string,
  seatChange: SeatChangeRequest
): Subscription {
  requirePermission(userId, orgId, [Permission.ORG_MANAGE_BILLING]);

  const subscription = getOrCreateSubscription(orgId);
  const limits = getTierLimits(orgId);

  const newSeatCount = seatChange.type === 'add'
    ? subscription.seats + seatChange.count
    : subscription.seats - seatChange.count;

  // Validate seat count
  if (newSeatCount < 1) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Organization must have at least 1 seat',
      { details: { requested: newSeatCount } }
    );
  }

  // Check against tier maximum (if not unlimited)
  if (limits.maxSeats !== -1 && newSeatCount > limits.maxSeats) {
    throw new AppError(
      ErrorCode.QUOTA_EXCEEDED,
      `Cannot exceed ${limits.maxSeats} seats on ${subscription.tier} plan`,
      { details: { requested: newSeatCount, max: limits.maxSeats } }
    );
  }

  // Check current member count when removing seats
  if (seatChange.type === 'remove') {
    const memberCount = organizationStore.getMemberCount(orgId);
    if (memberCount > newSeatCount) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Cannot reduce seats below current member count (${memberCount})`,
        { details: { currentMembers: memberCount, requestedSeats: newSeatCount } }
      );
    }
  }

  const updated = billingStore.updateSubscription(orgId, { seats: newSeatCount });
  if (!updated) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to update seat count');
  }

  // Log the action
  createAuditLog({
    orgId,
    action: AuditAction.BILLING_SEATS_UPDATED,
    actor: { id: userId, type: 'user' },
    resource: {
      type: AuditResourceType.BILLING,
      id: subscription.id,
      name: 'Seats',
    },
    changes: [{
      field: 'seats',
      oldValue: subscription.seats,
      newValue: newSeatCount,
    }],
    metadata: {
      changeType: seatChange.type,
      count: seatChange.count,
    },
  });

  return updated;
}

/**
 * Upgrade subscription tier
 */
export function upgradeTier(
  orgId: string,
  userId: string,
  newTier: SubscriptionTier,
  cycle?: BillingCycle
): Subscription {
  requirePermission(userId, orgId, [Permission.ORG_MANAGE_BILLING]);

  const subscription = getOrCreateSubscription(orgId);

  // Validate upgrade path
  const tierOrder = [SubscriptionTier.FREE, SubscriptionTier.PRO, SubscriptionTier.ENTERPRISE];
  const currentIndex = tierOrder.indexOf(subscription.tier);
  const newIndex = tierOrder.indexOf(newTier);

  if (newIndex <= currentIndex) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Can only upgrade to a higher tier. Use downgradeTier for downgrades.',
      { details: { currentTier: subscription.tier, requestedTier: newTier } }
    );
  }

  const updated = billingStore.updateSubscription(orgId, {
    tier: newTier,
    cycle: cycle || subscription.cycle,
  });

  if (!updated) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to upgrade tier');
  }

  // Log the action
  createAuditLog({
    orgId,
    action: AuditAction.BILLING_PLAN_CHANGED,
    actor: { id: userId, type: 'user' },
    resource: {
      type: AuditResourceType.BILLING,
      id: subscription.id,
      name: 'Subscription',
    },
    changes: [{
      field: 'tier',
      oldValue: subscription.tier,
      newValue: newTier,
    }],
    metadata: {
      type: 'upgrade',
    },
  });

  return updated;
}

/**
 * Downgrade subscription tier (effective at period end)
 */
export function downgradeTier(
  orgId: string,
  userId: string,
  newTier: SubscriptionTier
): Subscription {
  requirePermission(userId, orgId, [Permission.ORG_MANAGE_BILLING]);

  const subscription = getOrCreateSubscription(orgId);
  const newLimits = TIER_LIMITS[newTier];

  // Check if current usage allows downgrade
  const memberCount = organizationStore.getMemberCount(orgId);
  if (newLimits.maxSeats !== -1 && memberCount > newLimits.maxSeats) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Cannot downgrade: current member count (${memberCount}) exceeds ${newTier} plan limit (${newLimits.maxSeats})`,
      { details: { currentMembers: memberCount, newLimit: newLimits.maxSeats } }
    );
  }

  // In real implementation, this would schedule the downgrade for period end
  const updated = billingStore.updateSubscription(orgId, {
    // Mark for downgrade at period end
    cancelAtPeriodEnd: true,
  });

  if (!updated) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to schedule downgrade');
  }

  // Log the action
  createAuditLog({
    orgId,
    action: AuditAction.BILLING_PLAN_CHANGED,
    actor: { id: userId, type: 'user' },
    resource: {
      type: AuditResourceType.BILLING,
      id: subscription.id,
      name: 'Subscription',
    },
    metadata: {
      type: 'downgrade_scheduled',
      newTier,
      effectiveDate: subscription.currentPeriodEnd.toISOString(),
    },
  });

  return updated;
}

/**
 * Cancel subscription
 */
export function cancelSubscription(
  orgId: string,
  userId: string,
  immediate: boolean = false
): Subscription {
  requirePermission(userId, orgId, [Permission.ORG_MANAGE_BILLING]);

  const subscription = getOrCreateSubscription(orgId);

  if (subscription.status === 'canceled') {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Subscription is already canceled',
      { details: { orgId } }
    );
  }

  let updated: Subscription | undefined;

  if (immediate) {
    updated = billingStore.updateSubscription(orgId, {
      status: 'canceled',
      tier: SubscriptionTier.FREE,
      seats: 5,
    });
  } else {
    updated = billingStore.updateSubscription(orgId, {
      cancelAtPeriodEnd: true,
    });
  }

  if (!updated) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to cancel subscription');
  }

  createAuditLog({
    orgId,
    action: AuditAction.BILLING_PLAN_CHANGED,
    actor: { id: userId, type: 'user' },
    resource: {
      type: AuditResourceType.BILLING,
      id: subscription.id,
      name: 'Subscription',
    },
    metadata: {
      type: 'canceled',
      immediate,
      effectiveDate: immediate ? new Date().toISOString() : subscription.currentPeriodEnd.toISOString(),
    },
  });

  return updated;
}

/**
 * Reactivate canceled subscription
 */
export function reactivateSubscription(orgId: string, userId: string): Subscription {
  requirePermission(userId, orgId, [Permission.ORG_MANAGE_BILLING]);

  const subscription = getOrCreateSubscription(orgId);

  if (subscription.status !== 'canceled' && !subscription.cancelAtPeriodEnd) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Subscription is not canceled',
      { details: { orgId } }
    );
  }

  const updated = billingStore.updateSubscription(orgId, {
    status: 'active',
    cancelAtPeriodEnd: false,
  });

  if (!updated) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to reactivate subscription');
  }

  return updated;
}

/**
 * Get invoices for organization
 */
export function getInvoices(
  orgId: string,
  userId: string,
  status?: Invoice['status']
): Invoice[] {
  requirePermission(userId, orgId, [Permission.ORG_MANAGE_BILLING]);
  return billingStore.listInvoices(orgId, status);
}

/**
 * Get specific invoice
 */
export function getInvoice(orgId: string, userId: string, invoiceId: string): Invoice {
  requirePermission(userId, orgId, [Permission.ORG_MANAGE_BILLING]);

  const invoice = billingStore.getInvoice(invoiceId);
  if (!invoice || invoice.orgId !== orgId) {
    throw new AppError(
      ErrorCode.CONTAINER_NOT_FOUND,
      'Invoice not found',
      { details: { invoiceId } }
    );
  }

  return invoice;
}

/**
 * Get usage history for a metric
 */
export function getUsageHistory(
  orgId: string,
  userId: string,
  metric: UsageMetric,
  startDate?: Date,
  endDate?: Date
): UsageRecord[] {
  requirePermission(userId, orgId, [Permission.ORG_VIEW]);
  return billingStore.getUsageRecords(orgId, metric, startDate, endDate);
}

/**
 * Sync member count with actual members
 */
export function syncMemberCount(orgId: string): void {
  const memberCount = organizationStore.getMemberCount(orgId);
  setUsage(orgId, UsageMetric.SEATS, memberCount);
}

/**
 * Check if organization can add more members
 */
export function canAddMembers(orgId: string, count: number = 1): boolean {
  syncMemberCount(orgId);
  return isWithinLimit(orgId, UsageMetric.SEATS, count);
}

/**
 * Enforce member limit before adding
 */
export function enforceMemberLimit(orgId: string, count: number = 1): void {
  syncMemberCount(orgId);
  enforceLimit(orgId, UsageMetric.SEATS, count);
}

// ==================== Helper Exports ====================

// billingStore is already exported above
