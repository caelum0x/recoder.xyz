"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.billingStore = exports.TIER_LIMITS = exports.UsageMetric = exports.BillingCycle = exports.SubscriptionTier = void 0;
exports.getOrCreateSubscription = getOrCreateSubscription;
exports.getSubscription = getSubscription;
exports.getTierLimits = getTierLimits;
exports.hasFeature = hasFeature;
exports.getLimit = getLimit;
exports.isWithinLimit = isWithinLimit;
exports.enforceLimit = enforceLimit;
exports.enforceFeature = enforceFeature;
exports.recordUsage = recordUsage;
exports.incrementUsage = incrementUsage;
exports.decrementUsage = decrementUsage;
exports.setUsage = setUsage;
exports.getUsageSnapshot = getUsageSnapshot;
exports.updateSeats = updateSeats;
exports.upgradeTier = upgradeTier;
exports.downgradeTier = downgradeTier;
exports.cancelSubscription = cancelSubscription;
exports.reactivateSubscription = reactivateSubscription;
exports.getInvoices = getInvoices;
exports.getInvoice = getInvoice;
exports.getUsageHistory = getUsageHistory;
exports.syncMemberCount = syncMemberCount;
exports.canAddMembers = canAddMembers;
exports.enforceMemberLimit = enforceMemberLimit;
const uuid_1 = require("uuid");
const index_js_1 = require("../errors/index.js");
const organization_js_1 = require("./organization.js");
const audit_log_js_1 = require("./audit-log.js");
// ==================== Types & Interfaces ====================
/**
 * Subscription tiers with increasing capabilities
 */
var SubscriptionTier;
(function (SubscriptionTier) {
    SubscriptionTier["FREE"] = "free";
    SubscriptionTier["PRO"] = "pro";
    SubscriptionTier["ENTERPRISE"] = "enterprise";
})(SubscriptionTier || (exports.SubscriptionTier = SubscriptionTier = {}));
/**
 * Billing cycle periods
 */
var BillingCycle;
(function (BillingCycle) {
    BillingCycle["MONTHLY"] = "monthly";
    BillingCycle["ANNUAL"] = "annual";
})(BillingCycle || (exports.BillingCycle = BillingCycle = {}));
/**
 * Usage metric types
 */
var UsageMetric;
(function (UsageMetric) {
    UsageMetric["SEATS"] = "seats";
    UsageMetric["PROJECTS"] = "projects";
    UsageMetric["STORAGE_GB"] = "storage_gb";
    UsageMetric["COMPUTE_HOURS"] = "compute_hours";
    UsageMetric["DEPLOYMENTS"] = "deployments";
    UsageMetric["API_CALLS"] = "api_calls";
    UsageMetric["BUILD_MINUTES"] = "build_minutes";
})(UsageMetric || (exports.UsageMetric = UsageMetric = {}));
/**
 * Tier limits definitions
 */
exports.TIER_LIMITS = {
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
        maxSeats: -1, // Unlimited
        maxProjects: -1, // Unlimited
        maxStorageGB: 500,
        maxComputeHours: -1, // Unlimited
        maxDeployments: -1, // Unlimited
        maxApiCalls: -1, // Unlimited
        maxBuildMinutes: -1, // Unlimited
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
// ==================== In-Memory Storage ====================
/**
 * In-memory billing storage
 * In production, this should use Stripe or another billing provider
 */
class BillingStore {
    subscriptions = new Map(); // orgId -> subscription
    usageRecords = new Map(); // orgId -> records
    currentUsage = new Map(); // orgId -> metric -> value
    invoices = new Map(); // invoiceId -> invoice
    invoicesByOrg = new Map(); // orgId -> invoiceIds
    // Subscription operations
    createSubscription(subscription) {
        this.subscriptions.set(subscription.orgId, subscription);
        this.initializeUsage(subscription.orgId);
        return subscription;
    }
    getSubscription(orgId) {
        return this.subscriptions.get(orgId);
    }
    updateSubscription(orgId, updates) {
        const subscription = this.subscriptions.get(orgId);
        if (!subscription)
            return undefined;
        const updated = { ...subscription, ...updates, updatedAt: new Date() };
        this.subscriptions.set(orgId, updated);
        return updated;
    }
    // Usage operations
    initializeUsage(orgId) {
        if (!this.currentUsage.has(orgId)) {
            const metrics = new Map();
            for (const metric of Object.values(UsageMetric)) {
                metrics.set(metric, 0);
            }
            this.currentUsage.set(orgId, metrics);
        }
        if (!this.usageRecords.has(orgId)) {
            this.usageRecords.set(orgId, []);
        }
    }
    recordUsage(record) {
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
    getCurrentUsage(orgId) {
        this.initializeUsage(orgId);
        return this.currentUsage.get(orgId);
    }
    setUsage(orgId, metric, value) {
        this.initializeUsage(orgId);
        this.currentUsage.get(orgId).set(metric, value);
    }
    getUsageRecords(orgId, metric, startDate, endDate) {
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
    resetPeriodUsage(orgId) {
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
    createInvoice(invoice) {
        this.invoices.set(invoice.id, invoice);
        const orgInvoices = this.invoicesByOrg.get(invoice.orgId) || [];
        orgInvoices.push(invoice.id);
        this.invoicesByOrg.set(invoice.orgId, orgInvoices);
        return invoice;
    }
    getInvoice(invoiceId) {
        return this.invoices.get(invoiceId);
    }
    updateInvoice(invoiceId, updates) {
        const invoice = this.invoices.get(invoiceId);
        if (!invoice)
            return undefined;
        const updated = { ...invoice, ...updates };
        this.invoices.set(invoiceId, updated);
        return updated;
    }
    listInvoices(orgId, status) {
        const invoiceIds = this.invoicesByOrg.get(orgId) || [];
        let invoices = invoiceIds
            .map(id => this.invoices.get(id))
            .filter((i) => i !== undefined);
        if (status) {
            invoices = invoices.filter(i => i.status === status);
        }
        return invoices.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
}
// Singleton store instance
exports.billingStore = new BillingStore();
// ==================== Billing Service ====================
/**
 * Get or create subscription for organization
 */
function getOrCreateSubscription(orgId) {
    let subscription = exports.billingStore.getSubscription(orgId);
    if (!subscription) {
        // Create default free subscription
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        subscription = {
            id: (0, uuid_1.v4)(),
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
        exports.billingStore.createSubscription(subscription);
    }
    return subscription;
}
/**
 * Get subscription details
 */
function getSubscription(orgId, userId) {
    (0, organization_js_1.requirePermission)(userId, orgId, [organization_js_1.Permission.ORG_VIEW]);
    return getOrCreateSubscription(orgId);
}
/**
 * Get tier limits for organization
 */
function getTierLimits(orgId) {
    const subscription = getOrCreateSubscription(orgId);
    const baseLimits = exports.TIER_LIMITS[subscription.tier];
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
function hasFeature(orgId, feature) {
    const limits = getTierLimits(orgId);
    return limits.features[feature];
}
/**
 * Get limit for a specific metric
 */
function getLimit(orgId, metric) {
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
function isWithinLimit(orgId, metric, additionalUsage = 0) {
    const limit = getLimit(orgId, metric);
    if (limit === -1)
        return true; // Unlimited
    const current = exports.billingStore.getCurrentUsage(orgId).get(metric) || 0;
    return (current + additionalUsage) <= limit;
}
/**
 * Enforce usage limit - throws if exceeded
 */
function enforceLimit(orgId, metric, additionalUsage = 0) {
    if (!isWithinLimit(orgId, metric, additionalUsage)) {
        const limit = getLimit(orgId, metric);
        const current = exports.billingStore.getCurrentUsage(orgId).get(metric) || 0;
        throw new index_js_1.AppError(index_js_1.ErrorCode.QUOTA_EXCEEDED, `${metric} limit exceeded. Current: ${current}, Limit: ${limit}`, {
            details: {
                metric,
                current,
                limit,
                requested: additionalUsage,
            },
        });
    }
}
/**
 * Enforce feature availability
 */
function enforceFeature(orgId, feature) {
    if (!hasFeature(orgId, feature)) {
        const subscription = getOrCreateSubscription(orgId);
        throw new index_js_1.AppError(index_js_1.ErrorCode.QUOTA_EXCEEDED, `Feature '${feature}' is not available on the ${subscription.tier} plan`, {
            details: {
                feature,
                currentTier: subscription.tier,
            },
        });
    }
}
/**
 * Record usage for a metric
 */
function recordUsage(orgId, metric, value, metadata) {
    const subscription = getOrCreateSubscription(orgId);
    const record = {
        id: (0, uuid_1.v4)(),
        orgId,
        metric,
        value,
        timestamp: new Date(),
        periodStart: subscription.currentPeriodStart,
        periodEnd: subscription.currentPeriodEnd,
        metadata,
    };
    return exports.billingStore.recordUsage(record);
}
/**
 * Increment usage for a metric
 */
function incrementUsage(orgId, metric, amount = 1) {
    const current = exports.billingStore.getCurrentUsage(orgId).get(metric) || 0;
    exports.billingStore.setUsage(orgId, metric, current + amount);
    recordUsage(orgId, metric, amount);
}
/**
 * Decrement usage for a metric
 */
function decrementUsage(orgId, metric, amount = 1) {
    const current = exports.billingStore.getCurrentUsage(orgId).get(metric) || 0;
    exports.billingStore.setUsage(orgId, metric, Math.max(0, current - amount));
}
/**
 * Set absolute usage for a metric
 */
function setUsage(orgId, metric, value) {
    exports.billingStore.setUsage(orgId, metric, value);
}
/**
 * Get current usage snapshot
 */
function getUsageSnapshot(orgId, userId) {
    (0, organization_js_1.requirePermission)(userId, orgId, [organization_js_1.Permission.ORG_VIEW]);
    const subscription = getOrCreateSubscription(orgId);
    const currentUsage = exports.billingStore.getCurrentUsage(orgId);
    const limits = getTierLimits(orgId);
    const usage = {};
    const limitValues = {};
    const percentages = {};
    const overages = {};
    const alerts = [];
    for (const metric of Object.values(UsageMetric)) {
        const value = currentUsage.get(metric) || 0;
        const limit = getLimit(orgId, metric);
        usage[metric] = value;
        limitValues[metric] = limit;
        if (limit === -1) {
            percentages[metric] = 0;
            overages[metric] = 0;
        }
        else {
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
            }
            else if (percentage >= 90) {
                alerts.push({
                    metric,
                    type: 'critical',
                    threshold: 90,
                    current: percentage,
                    message: `${formatMetricName(metric)} usage at ${Math.round(percentage)}% (${value}/${limit})`,
                });
            }
            else if (percentage >= 75) {
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
function formatMetricName(metric) {
    const names = {
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
function updateSeats(orgId, userId, seatChange) {
    (0, organization_js_1.requirePermission)(userId, orgId, [organization_js_1.Permission.ORG_MANAGE_BILLING]);
    const subscription = getOrCreateSubscription(orgId);
    const limits = getTierLimits(orgId);
    const newSeatCount = seatChange.type === 'add'
        ? subscription.seats + seatChange.count
        : subscription.seats - seatChange.count;
    // Validate seat count
    if (newSeatCount < 1) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'Organization must have at least 1 seat', { details: { requested: newSeatCount } });
    }
    // Check against tier maximum (if not unlimited)
    if (limits.maxSeats !== -1 && newSeatCount > limits.maxSeats) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.QUOTA_EXCEEDED, `Cannot exceed ${limits.maxSeats} seats on ${subscription.tier} plan`, { details: { requested: newSeatCount, max: limits.maxSeats } });
    }
    // Check current member count when removing seats
    if (seatChange.type === 'remove') {
        const memberCount = organization_js_1.organizationStore.getMemberCount(orgId);
        if (memberCount > newSeatCount) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, `Cannot reduce seats below current member count (${memberCount})`, { details: { currentMembers: memberCount, requestedSeats: newSeatCount } });
        }
    }
    const updated = exports.billingStore.updateSubscription(orgId, { seats: newSeatCount });
    if (!updated) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.INTERNAL_ERROR, 'Failed to update seat count');
    }
    // Log the action
    (0, audit_log_js_1.createAuditLog)({
        orgId,
        action: audit_log_js_1.AuditAction.BILLING_SEATS_UPDATED,
        actor: { id: userId, type: 'user' },
        resource: {
            type: audit_log_js_1.AuditResourceType.BILLING,
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
function upgradeTier(orgId, userId, newTier, cycle) {
    (0, organization_js_1.requirePermission)(userId, orgId, [organization_js_1.Permission.ORG_MANAGE_BILLING]);
    const subscription = getOrCreateSubscription(orgId);
    // Validate upgrade path
    const tierOrder = [SubscriptionTier.FREE, SubscriptionTier.PRO, SubscriptionTier.ENTERPRISE];
    const currentIndex = tierOrder.indexOf(subscription.tier);
    const newIndex = tierOrder.indexOf(newTier);
    if (newIndex <= currentIndex) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'Can only upgrade to a higher tier. Use downgradeTier for downgrades.', { details: { currentTier: subscription.tier, requestedTier: newTier } });
    }
    const updated = exports.billingStore.updateSubscription(orgId, {
        tier: newTier,
        cycle: cycle || subscription.cycle,
    });
    if (!updated) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.INTERNAL_ERROR, 'Failed to upgrade tier');
    }
    // Log the action
    (0, audit_log_js_1.createAuditLog)({
        orgId,
        action: audit_log_js_1.AuditAction.BILLING_PLAN_CHANGED,
        actor: { id: userId, type: 'user' },
        resource: {
            type: audit_log_js_1.AuditResourceType.BILLING,
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
function downgradeTier(orgId, userId, newTier) {
    (0, organization_js_1.requirePermission)(userId, orgId, [organization_js_1.Permission.ORG_MANAGE_BILLING]);
    const subscription = getOrCreateSubscription(orgId);
    const newLimits = exports.TIER_LIMITS[newTier];
    // Check if current usage allows downgrade
    const memberCount = organization_js_1.organizationStore.getMemberCount(orgId);
    if (newLimits.maxSeats !== -1 && memberCount > newLimits.maxSeats) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, `Cannot downgrade: current member count (${memberCount}) exceeds ${newTier} plan limit (${newLimits.maxSeats})`, { details: { currentMembers: memberCount, newLimit: newLimits.maxSeats } });
    }
    // In real implementation, this would schedule the downgrade for period end
    const updated = exports.billingStore.updateSubscription(orgId, {
        // Mark for downgrade at period end
        cancelAtPeriodEnd: true,
    });
    if (!updated) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.INTERNAL_ERROR, 'Failed to schedule downgrade');
    }
    // Log the action
    (0, audit_log_js_1.createAuditLog)({
        orgId,
        action: audit_log_js_1.AuditAction.BILLING_PLAN_CHANGED,
        actor: { id: userId, type: 'user' },
        resource: {
            type: audit_log_js_1.AuditResourceType.BILLING,
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
function cancelSubscription(orgId, userId, immediate = false) {
    (0, organization_js_1.requirePermission)(userId, orgId, [organization_js_1.Permission.ORG_MANAGE_BILLING]);
    const subscription = getOrCreateSubscription(orgId);
    if (subscription.status === 'canceled') {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'Subscription is already canceled', { details: { orgId } });
    }
    let updated;
    if (immediate) {
        updated = exports.billingStore.updateSubscription(orgId, {
            status: 'canceled',
            tier: SubscriptionTier.FREE,
            seats: 5,
        });
    }
    else {
        updated = exports.billingStore.updateSubscription(orgId, {
            cancelAtPeriodEnd: true,
        });
    }
    if (!updated) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.INTERNAL_ERROR, 'Failed to cancel subscription');
    }
    (0, audit_log_js_1.createAuditLog)({
        orgId,
        action: audit_log_js_1.AuditAction.BILLING_PLAN_CHANGED,
        actor: { id: userId, type: 'user' },
        resource: {
            type: audit_log_js_1.AuditResourceType.BILLING,
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
function reactivateSubscription(orgId, userId) {
    (0, organization_js_1.requirePermission)(userId, orgId, [organization_js_1.Permission.ORG_MANAGE_BILLING]);
    const subscription = getOrCreateSubscription(orgId);
    if (subscription.status !== 'canceled' && !subscription.cancelAtPeriodEnd) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'Subscription is not canceled', { details: { orgId } });
    }
    const updated = exports.billingStore.updateSubscription(orgId, {
        status: 'active',
        cancelAtPeriodEnd: false,
    });
    if (!updated) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.INTERNAL_ERROR, 'Failed to reactivate subscription');
    }
    return updated;
}
/**
 * Get invoices for organization
 */
function getInvoices(orgId, userId, status) {
    (0, organization_js_1.requirePermission)(userId, orgId, [organization_js_1.Permission.ORG_MANAGE_BILLING]);
    return exports.billingStore.listInvoices(orgId, status);
}
/**
 * Get specific invoice
 */
function getInvoice(orgId, userId, invoiceId) {
    (0, organization_js_1.requirePermission)(userId, orgId, [organization_js_1.Permission.ORG_MANAGE_BILLING]);
    const invoice = exports.billingStore.getInvoice(invoiceId);
    if (!invoice || invoice.orgId !== orgId) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.CONTAINER_NOT_FOUND, 'Invoice not found', { details: { invoiceId } });
    }
    return invoice;
}
/**
 * Get usage history for a metric
 */
function getUsageHistory(orgId, userId, metric, startDate, endDate) {
    (0, organization_js_1.requirePermission)(userId, orgId, [organization_js_1.Permission.ORG_VIEW]);
    return exports.billingStore.getUsageRecords(orgId, metric, startDate, endDate);
}
/**
 * Sync member count with actual members
 */
function syncMemberCount(orgId) {
    const memberCount = organization_js_1.organizationStore.getMemberCount(orgId);
    setUsage(orgId, UsageMetric.SEATS, memberCount);
}
/**
 * Check if organization can add more members
 */
function canAddMembers(orgId, count = 1) {
    syncMemberCount(orgId);
    return isWithinLimit(orgId, UsageMetric.SEATS, count);
}
/**
 * Enforce member limit before adding
 */
function enforceMemberLimit(orgId, count = 1) {
    syncMemberCount(orgId);
    enforceLimit(orgId, UsageMetric.SEATS, count);
}
// ==================== Helper Exports ====================
// billingStore is already exported above
