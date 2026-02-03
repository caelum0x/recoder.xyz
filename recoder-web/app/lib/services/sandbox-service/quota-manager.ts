/**
 * Sandbox Quota Manager
 * Manages user quotas, enforces limits, and handles rate limiting
 * Provides real-time quota checking and alert generation
 */

import { atom, computed } from 'nanostores';
import type {
  SandboxTier,
  SandboxUsage,
  SandboxQuota,
  QuotaAlert,
  RateLimitConfig,
  RateLimitStatus,
  SubscriptionStatus,
} from './types';
import { SANDBOX_PLANS, getResourceLimit } from './plans';

// ==================== Stores ====================

/**
 * Current user's subscription status
 */
export const subscriptionStore = atom<SubscriptionStatus | null>(null);

/**
 * Current user's usage data
 */
export const usageStore = atom<SandboxUsage | null>(null);

/**
 * Generated quota alerts
 */
export const quotaAlertsStore = atom<QuotaAlert[]>([]);

/**
 * Rate limit status per endpoint
 */
export const rateLimitStore = atom<Map<string, RateLimitStatus>>(new Map());

// ==================== Computed Stores ====================

/**
 * Current user's tier
 */
export const currentTier = computed(subscriptionStore, (subscription) => {
  return subscription?.plan.tier ?? 'free';
});

/**
 * Current plan
 */
export const currentPlan = computed(subscriptionStore, (subscription) => {
  return subscription?.plan ?? SANDBOX_PLANS.free;
});

/**
 * Computed quota status
 */
export const quotaStatus = computed(
  [subscriptionStore, usageStore],
  (subscription, usage): SandboxQuota => {
    const plan = subscription?.plan ?? SANDBOX_PLANS.free;
    const limits = plan.limits;

    if (!usage) {
      return {
        canCreateSandbox: true,
        canStartSandbox: true,
        remainingSandboxes: limits.maxSandboxes === -1 ? Infinity : limits.maxSandboxes,
        remainingConcurrent: limits.maxConcurrent,
        remainingApiCalls: limits.apiCallsPerMonth === -1 ? Infinity : limits.apiCallsPerMonth,
        remainingComputeToday: limits.dailyComputeLimit === -1 ? Infinity : limits.dailyComputeLimit,
        remainingStorage: limits.storageLimit,
        usagePercentages: {
          sandboxes: 0,
          storage: 0,
          apiCalls: 0,
          computeTime: 0,
        },
        alerts: [],
      };
    }

    const remainingSandboxes =
      limits.maxSandboxes === -1
        ? Infinity
        : Math.max(0, limits.maxSandboxes - usage.activeSandboxes);

    const remainingConcurrent = Math.max(
      0,
      limits.maxConcurrent - usage.runningSandboxes
    );

    const remainingApiCalls =
      limits.apiCallsPerMonth === -1
        ? Infinity
        : Math.max(0, limits.apiCallsPerMonth - usage.apiCallsUsed);

    const remainingComputeToday =
      limits.dailyComputeLimit === -1
        ? Infinity
        : Math.max(0, limits.dailyComputeLimit - usage.computeTimeToday);

    const remainingStorage = Math.max(0, limits.storageLimit - usage.storageUsed);

    const usagePercentages = {
      sandboxes:
        limits.maxSandboxes === -1
          ? 0
          : Math.round((usage.activeSandboxes / limits.maxSandboxes) * 100),
      storage: Math.round((usage.storageUsed / limits.storageLimit) * 100),
      apiCalls:
        limits.apiCallsPerMonth === -1
          ? 0
          : Math.round((usage.apiCallsUsed / limits.apiCallsPerMonth) * 100),
      computeTime:
        limits.dailyComputeLimit === -1
          ? 0
          : Math.round((usage.computeTimeToday / limits.dailyComputeLimit) * 100),
    };

    const alerts = generateAlerts(usage, plan.limits, plan.tier);

    return {
      canCreateSandbox: remainingSandboxes > 0,
      canStartSandbox: remainingConcurrent > 0 && remainingComputeToday > 0,
      remainingSandboxes,
      remainingConcurrent,
      remainingApiCalls,
      remainingComputeToday,
      remainingStorage,
      usagePercentages,
      alerts,
    };
  }
);

/**
 * Whether any limits are exceeded
 */
export const hasExceededLimits = computed(quotaStatus, (quota) => {
  return quota.alerts.some((alert) => alert.type === 'exceeded');
});

/**
 * Whether approaching any limits (80%+)
 */
export const isApproachingLimits = computed(quotaStatus, (quota) => {
  return quota.alerts.some((alert) => alert.type === 'warning' || alert.type === 'critical');
});

// ==================== Alert Generation ====================

/**
 * Alert thresholds
 */
const ALERT_THRESHOLDS = {
  warning: 80,
  critical: 90,
  exceeded: 100,
};

/**
 * Generate alerts based on current usage
 */
function generateAlerts(
  usage: SandboxUsage,
  limits: typeof SANDBOX_PLANS.free.limits,
  _tier: SandboxTier
): QuotaAlert[] {
  const alerts: QuotaAlert[] = [];
  const now = new Date();

  // Check sandboxes
  if (limits.maxSandboxes !== -1) {
    const percentage = (usage.activeSandboxes / limits.maxSandboxes) * 100;
    const alert = createAlertIfNeeded('sandboxes', percentage, now);
    if (alert) alerts.push(alert);
  }

  // Check storage
  const storagePercentage = (usage.storageUsed / limits.storageLimit) * 100;
  const storageAlert = createAlertIfNeeded('storage', storagePercentage, now);
  if (storageAlert) alerts.push(storageAlert);

  // Check API calls
  if (limits.apiCallsPerMonth !== -1) {
    const apiPercentage = (usage.apiCallsUsed / limits.apiCallsPerMonth) * 100;
    const apiAlert = createAlertIfNeeded('apiCalls', apiPercentage, now);
    if (apiAlert) alerts.push(apiAlert);
  }

  // Check compute time
  if (limits.dailyComputeLimit !== -1) {
    const computePercentage = (usage.computeTimeToday / limits.dailyComputeLimit) * 100;
    const computeAlert = createAlertIfNeeded('computeTime', computePercentage, now);
    if (computeAlert) alerts.push(computeAlert);
  }

  // Check concurrent sandboxes
  const concurrentPercentage = (usage.runningSandboxes / limits.maxConcurrent) * 100;
  const concurrentAlert = createAlertIfNeeded('concurrent', concurrentPercentage, now);
  if (concurrentAlert) alerts.push(concurrentAlert);

  return alerts;
}

/**
 * Create an alert if the threshold is met
 */
function createAlertIfNeeded(
  resource: QuotaAlert['resource'],
  percentage: number,
  timestamp: Date
): QuotaAlert | null {
  const messages: Record<QuotaAlert['resource'], Record<QuotaAlert['type'], string>> = {
    sandboxes: {
      warning: 'You are using 80% of your sandbox limit',
      critical: 'You are using 90% of your sandbox limit',
      exceeded: 'You have reached your sandbox limit',
    },
    storage: {
      warning: 'You are using 80% of your storage',
      critical: 'You are using 90% of your storage',
      exceeded: 'You have reached your storage limit',
    },
    apiCalls: {
      warning: 'You have used 80% of your monthly API calls',
      critical: 'You have used 90% of your monthly API calls',
      exceeded: 'You have reached your monthly API call limit',
    },
    computeTime: {
      warning: 'You have used 80% of your daily compute time',
      critical: 'You have used 90% of your daily compute time',
      exceeded: 'You have reached your daily compute time limit',
    },
    concurrent: {
      warning: 'You are using 80% of your concurrent sandbox limit',
      critical: 'You are using 90% of your concurrent sandbox limit',
      exceeded: 'You have reached your concurrent sandbox limit',
    },
  };

  let type: QuotaAlert['type'] | null = null;

  if (percentage >= ALERT_THRESHOLDS.exceeded) {
    type = 'exceeded';
  } else if (percentage >= ALERT_THRESHOLDS.critical) {
    type = 'critical';
  } else if (percentage >= ALERT_THRESHOLDS.warning) {
    type = 'warning';
  }

  if (type === null) return null;

  return {
    type,
    resource,
    message: messages[resource][type],
    percentage: Math.round(percentage),
    timestamp,
  };
}

// ==================== Quota Checking Functions ====================

/**
 * Check if user can create a new sandbox
 */
export function canCreateSandbox(usage?: SandboxUsage | null): {
  allowed: boolean;
  reason?: string;
} {
  const subscription = subscriptionStore.get();
  const currentUsage = usage ?? usageStore.get();
  const plan = subscription?.plan ?? SANDBOX_PLANS.free;

  if (!currentUsage) {
    return { allowed: true };
  }

  // Check subscription status
  if (subscription?.status === 'past_due') {
    return {
      allowed: false,
      reason: 'Your subscription payment is past due. Please update your payment method.',
    };
  }

  if (subscription?.status === 'canceled') {
    return {
      allowed: false,
      reason: 'Your subscription has been canceled.',
    };
  }

  // Check sandbox limit
  if (
    plan.limits.maxSandboxes !== -1 &&
    currentUsage.activeSandboxes >= plan.limits.maxSandboxes
  ) {
    return {
      allowed: false,
      reason: `You have reached your limit of ${plan.limits.maxSandboxes} sandbox${
        plan.limits.maxSandboxes === 1 ? '' : 'es'
      }. Upgrade your plan to create more.`,
    };
  }

  // Check storage limit (minimum 100MB needed for a new sandbox)
  const minStorageNeeded = 100; // MB
  if (currentUsage.storageUsed + minStorageNeeded > plan.limits.storageLimit) {
    return {
      allowed: false,
      reason: 'Not enough storage space. Delete some sandboxes or upgrade your plan.',
    };
  }

  return { allowed: true };
}

/**
 * Check if user can start a sandbox
 */
export function canStartSandbox(usage?: SandboxUsage | null): {
  allowed: boolean;
  reason?: string;
} {
  const subscription = subscriptionStore.get();
  const currentUsage = usage ?? usageStore.get();
  const plan = subscription?.plan ?? SANDBOX_PLANS.free;

  if (!currentUsage) {
    return { allowed: true };
  }

  // Check subscription status
  if (subscription?.status === 'past_due' || subscription?.status === 'canceled') {
    return {
      allowed: false,
      reason: 'Your subscription is not active. Please update your payment method.',
    };
  }

  // Check concurrent limit
  if (currentUsage.runningSandboxes >= plan.limits.maxConcurrent) {
    return {
      allowed: false,
      reason: `You can only run ${plan.limits.maxConcurrent} sandbox${
        plan.limits.maxConcurrent === 1 ? '' : 'es'
      } at a time. Stop a running sandbox or upgrade your plan.`,
    };
  }

  // Check daily compute limit
  if (
    plan.limits.dailyComputeLimit !== -1 &&
    currentUsage.computeTimeToday >= plan.limits.dailyComputeLimit
  ) {
    return {
      allowed: false,
      reason: 'You have reached your daily compute time limit. Try again tomorrow or upgrade your plan.',
    };
  }

  return { allowed: true };
}

/**
 * Check if user can make an API call
 */
export function canMakeApiCall(usage?: SandboxUsage | null): {
  allowed: boolean;
  reason?: string;
} {
  const subscription = subscriptionStore.get();
  const currentUsage = usage ?? usageStore.get();
  const plan = subscription?.plan ?? SANDBOX_PLANS.free;

  if (!currentUsage) {
    return { allowed: true };
  }

  // Unlimited API calls
  if (plan.limits.apiCallsPerMonth === -1) {
    return { allowed: true };
  }

  if (currentUsage.apiCallsUsed >= plan.limits.apiCallsPerMonth) {
    return {
      allowed: false,
      reason: 'You have reached your monthly API call limit. Upgrade your plan for more calls.',
    };
  }

  return { allowed: true };
}

/**
 * Check if user has enough storage
 */
export function hasEnoughStorage(requiredMB: number, usage?: SandboxUsage | null): {
  allowed: boolean;
  reason?: string;
  availableMB: number;
} {
  const subscription = subscriptionStore.get();
  const currentUsage = usage ?? usageStore.get();
  const plan = subscription?.plan ?? SANDBOX_PLANS.free;

  const availableMB = currentUsage
    ? plan.limits.storageLimit - currentUsage.storageUsed
    : plan.limits.storageLimit;

  if (requiredMB > availableMB) {
    return {
      allowed: false,
      reason: `Not enough storage. You need ${requiredMB}MB but only have ${availableMB.toFixed(0)}MB available.`,
      availableMB,
    };
  }

  return { allowed: true, availableMB };
}

// ==================== Rate Limiting ====================

/**
 * Default rate limit configurations by tier
 */
export const RATE_LIMITS: Record<SandboxTier, RateLimitConfig> = {
  free: {
    requestsPerWindow: 60,
    windowSizeSeconds: 60, // 1 request per second average
    burstLimit: 10,
  },
  pro: {
    requestsPerWindow: 600,
    windowSizeSeconds: 60, // 10 requests per second average
    burstLimit: 50,
  },
  enterprise: {
    requestsPerWindow: 3000,
    windowSizeSeconds: 60, // 50 requests per second average
    burstLimit: 200,
  },
};

/**
 * Rate limit tracking state (in-memory, should be Redis in production)
 */
const rateLimitState = new Map<
  string,
  {
    requests: number[];
    lastReset: number;
  }
>();

/**
 * Check rate limit for an endpoint
 */
export function checkRateLimit(
  userId: string,
  endpoint: string,
  tier?: SandboxTier
): RateLimitStatus {
  const currentTierValue = tier ?? currentTier.get();
  const config = RATE_LIMITS[currentTierValue];
  const key = `${userId}:${endpoint}`;
  const now = Date.now();
  const windowStart = now - config.windowSizeSeconds * 1000;

  // Get or create state
  let state = rateLimitState.get(key);
  if (!state) {
    state = { requests: [], lastReset: now };
    rateLimitState.set(key, state);
  }

  // Remove old requests outside the window
  state.requests = state.requests.filter((timestamp) => timestamp > windowStart);

  // Check if rate limited
  const isLimited = state.requests.length >= config.requestsPerWindow;
  const remaining = Math.max(0, config.requestsPerWindow - state.requests.length);

  // Calculate reset time
  const oldestRequest = state.requests[0];
  const resetAt = oldestRequest
    ? new Date(oldestRequest + config.windowSizeSeconds * 1000)
    : new Date(now + config.windowSizeSeconds * 1000);

  // Calculate retry after if limited
  const retryAfterMs = isLimited && oldestRequest
    ? Math.max(0, oldestRequest + config.windowSizeSeconds * 1000 - now)
    : undefined;

  const status: RateLimitStatus = {
    isLimited,
    remaining,
    resetAt,
    retryAfterMs,
  };

  // Update store
  const currentMap = rateLimitStore.get();
  const newMap = new Map(currentMap);
  newMap.set(key, status);
  rateLimitStore.set(newMap);

  return status;
}

/**
 * Record a request for rate limiting
 */
export function recordRequest(userId: string, endpoint: string): void {
  const key = `${userId}:${endpoint}`;
  const now = Date.now();

  let state = rateLimitState.get(key);
  if (!state) {
    state = { requests: [], lastReset: now };
    rateLimitState.set(key, state);
  }

  state.requests.push(now);
}

/**
 * Get rate limit status for an endpoint
 */
export function getRateLimitStatus(
  userId: string,
  endpoint: string
): RateLimitStatus | undefined {
  const key = `${userId}:${endpoint}`;
  return rateLimitStore.get().get(key);
}

// ==================== Subscription Management ====================

/**
 * Set user subscription
 */
export function setSubscription(subscription: SubscriptionStatus): void {
  subscriptionStore.set(subscription);
}

/**
 * Clear subscription (logout)
 */
export function clearSubscription(): void {
  subscriptionStore.set(null);
}

/**
 * Check if user is on free tier
 */
export function isFreeTier(): boolean {
  return currentTier.get() === 'free';
}

/**
 * Check if user has an active paid subscription
 */
export function hasPaidSubscription(): boolean {
  const subscription = subscriptionStore.get();
  if (!subscription) return false;
  return (
    subscription.plan.tier !== 'free' &&
    (subscription.status === 'active' || subscription.status === 'trialing')
  );
}

/**
 * Check if subscription is in trial
 */
export function isInTrial(): boolean {
  const subscription = subscriptionStore.get();
  return subscription?.status === 'trialing';
}

/**
 * Get days remaining in trial
 */
export function getTrialDaysRemaining(): number | null {
  const subscription = subscriptionStore.get();
  if (!subscription?.trialEnd) return null;

  const now = new Date();
  const trialEnd = new Date(subscription.trialEnd);
  const diffMs = trialEnd.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

// ==================== Usage Management ====================

/**
 * Set usage data
 */
export function setUsage(usage: SandboxUsage): void {
  usageStore.set(usage);

  // Generate and store alerts
  const subscription = subscriptionStore.get();
  const plan = subscription?.plan ?? SANDBOX_PLANS.free;
  const alerts = generateAlerts(usage, plan.limits, plan.tier);
  quotaAlertsStore.set(alerts);
}

/**
 * Clear usage data (logout)
 */
export function clearUsage(): void {
  usageStore.set(null);
  quotaAlertsStore.set([]);
}

/**
 * Increment API call count (optimistic update)
 */
export function incrementApiCalls(count: number = 1): void {
  const usage = usageStore.get();
  if (!usage) return;

  usageStore.set({
    ...usage,
    apiCallsUsed: usage.apiCallsUsed + count,
    apiCallsToday: usage.apiCallsToday + count,
    lastUpdated: new Date(),
  });
}

/**
 * Update compute time (optimistic update)
 */
export function addComputeTime(seconds: number): void {
  const usage = usageStore.get();
  if (!usage) return;

  usageStore.set({
    ...usage,
    computeTimeUsed: usage.computeTimeUsed + seconds,
    computeTimeToday: usage.computeTimeToday + seconds,
    lastUpdated: new Date(),
  });
}

/**
 * Update storage used (optimistic update)
 */
export function updateStorageUsed(totalMB: number): void {
  const usage = usageStore.get();
  if (!usage) return;

  usageStore.set({
    ...usage,
    storageUsed: totalMB,
    lastUpdated: new Date(),
  });
}

/**
 * Update sandbox counts (optimistic update)
 */
export function updateSandboxCounts(active: number, running: number): void {
  const usage = usageStore.get();
  if (!usage) return;

  usageStore.set({
    ...usage,
    activeSandboxes: active,
    runningSandboxes: running,
    lastUpdated: new Date(),
  });
}

// ==================== Utility Functions ====================

/**
 * Get upgrade recommendation based on current usage
 */
export function getUpgradeRecommendation(): {
  shouldUpgrade: boolean;
  reason?: string;
  recommendedTier?: SandboxTier;
} {
  const quota = quotaStatus.get();
  const tier = currentTier.get();

  // Don't recommend upgrade for enterprise
  if (tier === 'enterprise') {
    return { shouldUpgrade: false };
  }

  // Check for exceeded limits
  const exceededAlert = quota.alerts.find((a) => a.type === 'exceeded');
  if (exceededAlert) {
    return {
      shouldUpgrade: true,
      reason: exceededAlert.message,
      recommendedTier: tier === 'free' ? 'pro' : 'enterprise',
    };
  }

  // Check for critical usage (90%+)
  const criticalAlert = quota.alerts.find((a) => a.type === 'critical');
  if (criticalAlert) {
    return {
      shouldUpgrade: true,
      reason: `${criticalAlert.message}. Consider upgrading for more resources.`,
      recommendedTier: tier === 'free' ? 'pro' : 'enterprise',
    };
  }

  return { shouldUpgrade: false };
}

/**
 * Get formatted quota summary
 */
export function getQuotaSummary(): string {
  const quota = quotaStatus.get();
  const tier = currentTier.get();
  const plan = SANDBOX_PLANS[tier];

  const lines = [
    `Plan: ${plan.name}`,
    `Sandboxes: ${quota.usagePercentages.sandboxes}% used`,
    `Storage: ${quota.usagePercentages.storage}% used`,
  ];

  if (plan.limits.apiCallsPerMonth !== -1) {
    lines.push(`API Calls: ${quota.usagePercentages.apiCalls}% used`);
  }

  if (plan.limits.dailyComputeLimit !== -1) {
    lines.push(`Daily Compute: ${quota.usagePercentages.computeTime}% used`);
  }

  if (quota.alerts.length > 0) {
    lines.push('');
    lines.push('Alerts:');
    quota.alerts.forEach((alert) => {
      const icon = alert.type === 'exceeded' ? '[!]' : alert.type === 'critical' ? '[!!]' : '[i]';
      lines.push(`  ${icon} ${alert.message}`);
    });
  }

  return lines.join('\n');
}

/**
 * Export quota manager state for debugging
 */
export function exportQuotaState(): {
  subscription: SubscriptionStatus | null;
  usage: SandboxUsage | null;
  quota: SandboxQuota;
  alerts: QuotaAlert[];
} {
  return {
    subscription: subscriptionStore.get(),
    usage: usageStore.get(),
    quota: quotaStatus.get(),
    alerts: quotaAlertsStore.get(),
  };
}
