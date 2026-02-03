/**
 * Usage-Based Billing
 * Handles metered billing, usage tracking, and overage calculations
 * Reports usage to Polar.sh for billing purposes
 */

import { atom, computed, map } from 'nanostores';
import {
  BillingError,
  BillingErrorCodes,
  type ReportUsageRequest,
  type UsageRecord,
  type UsageSummary,
  type UsageType,
} from './types';
import {
  currentPlan,
  currentSubscription,
  usageSummary,
  updateUsageSummary,
} from './subscription-manager';

// ==================== Configuration ====================

/**
 * Usage tracking configuration
 */
export interface UsageTrackingConfig {
  /** Batch usage reports to reduce API calls */
  batchInterval: number;
  /** Maximum batch size before forced flush */
  maxBatchSize: number;
  /** Enable local tracking even without subscription */
  enableLocalTracking: boolean;
  /** Warning threshold percentage */
  warningThreshold: number;
  /** Critical threshold percentage */
  criticalThreshold: number;
}

export const DEFAULT_USAGE_CONFIG: UsageTrackingConfig = {
  batchInterval: 60000, // 1 minute
  maxBatchSize: 100,
  enableLocalTracking: true,
  warningThreshold: 80,
  criticalThreshold: 95,
};

// ==================== Nanostores State ====================

/**
 * Current usage config
 */
export const usageConfig = atom<UsageTrackingConfig>(DEFAULT_USAGE_CONFIG);

/**
 * Pending usage records to be reported
 */
export const pendingUsage = map<Record<UsageType, number>>({
  sandbox_minutes: 0,
  ai_tokens: 0,
  storage_gb: 0,
  deployments: 0,
  api_requests: 0,
});

/**
 * Local usage tracking (for UI and offline support)
 */
export const localUsage = map<Record<UsageType, number>>({
  sandbox_minutes: 0,
  ai_tokens: 0,
  storage_gb: 0,
  deployments: 0,
  api_requests: 0,
});

/**
 * Usage report in progress
 */
export const isReportingUsage = atom<boolean>(false);

/**
 * Last usage report timestamp
 */
export const lastUsageReport = atom<Date | null>(null);

/**
 * Usage tracking errors
 */
export const usageError = atom<string | null>(null);

/**
 * Get current usage for a specific type
 */
export const getCurrentUsage = (type: UsageType): number => {
  const summary = usageSummary.get()[type];
  return summary?.current ?? localUsage.get()[type] ?? 0;
};

/**
 * Get usage percentage for a specific type
 */
export const getUsagePercentage = (type: UsageType): number => {
  const summary = usageSummary.get()[type];
  return summary?.percentage ?? 0;
};

/**
 * Check if a usage type is at warning level
 */
export const isAtWarningLevel = computed(
  [usageSummary, usageConfig],
  (summary, config): Record<UsageType, boolean> => {
    const result: Record<UsageType, boolean> = {} as Record<UsageType, boolean>;
    for (const [type, data] of Object.entries(summary)) {
      result[type as UsageType] = data.percentage >= config.warningThreshold &&
        data.percentage < config.criticalThreshold;
    }
    return result;
  }
);

/**
 * Check if a usage type is at critical level
 */
export const isAtCriticalLevel = computed(
  [usageSummary, usageConfig],
  (summary, config): Record<UsageType, boolean> => {
    const result: Record<UsageType, boolean> = {} as Record<UsageType, boolean>;
    for (const [type, data] of Object.entries(summary)) {
      result[type as UsageType] = data.percentage >= config.criticalThreshold;
    }
    return result;
  }
);

// ==================== Usage Tracking Functions ====================

let batchTimeoutId: NodeJS.Timeout | null = null;

/**
 * Track usage for a specific type
 * This batches usage locally before reporting to the server
 */
export function trackUsage(type: UsageType, quantity: number = 1): void {
  const config = usageConfig.get();

  // Update local tracking
  const currentLocal = localUsage.get()[type] || 0;
  localUsage.setKey(type, currentLocal + quantity);

  // Update pending batch
  const currentPending = pendingUsage.get()[type] || 0;
  pendingUsage.setKey(type, currentPending + quantity);

  // Check if we need to flush
  const totalPending = Object.values(pendingUsage.get()).reduce((a, b) => a + b, 0);
  if (totalPending >= config.maxBatchSize) {
    flushUsage();
    return;
  }

  // Schedule batch flush
  if (!batchTimeoutId) {
    batchTimeoutId = setTimeout(() => {
      flushUsage();
    }, config.batchInterval);
  }
}

/**
 * Track sandbox usage (minutes)
 */
export function trackSandboxUsage(minutes: number): void {
  trackUsage('sandbox_minutes', minutes);
}

/**
 * Track AI token usage
 */
export function trackAITokenUsage(tokens: number): void {
  trackUsage('ai_tokens', tokens);
}

/**
 * Track storage usage (GB)
 */
export function trackStorageUsage(gb: number): void {
  trackUsage('storage_gb', gb);
}

/**
 * Track deployment
 */
export function trackDeployment(): void {
  trackUsage('deployments', 1);
}

/**
 * Track API request
 */
export function trackApiRequest(): void {
  trackUsage('api_requests', 1);
}

/**
 * Flush pending usage to server
 */
export async function flushUsage(): Promise<void> {
  // Clear the batch timeout
  if (batchTimeoutId) {
    clearTimeout(batchTimeoutId);
    batchTimeoutId = null;
  }

  const pending = pendingUsage.get();
  const hasUsageToReport = Object.values(pending).some(v => v > 0);

  if (!hasUsageToReport) {
    return;
  }

  const subscription = currentSubscription.get();
  if (!subscription) {
    // No subscription - just track locally
    return;
  }

  isReportingUsage.set(true);
  usageError.set(null);

  try {
    // Report each usage type with quantity > 0
    const reports: Promise<void>[] = [];
    for (const [type, quantity] of Object.entries(pending)) {
      if (quantity > 0) {
        reports.push(reportUsageToServer({
          subscriptionId: subscription.id,
          usageType: type as UsageType,
          quantity,
        }));
      }
    }

    await Promise.all(reports);

    // Clear pending usage on success
    pendingUsage.set({
      sandbox_minutes: 0,
      ai_tokens: 0,
      storage_gb: 0,
      deployments: 0,
      api_requests: 0,
    });

    lastUsageReport.set(new Date());

    // Refresh usage summary from server
    await refreshUsageSummary();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to report usage';
    usageError.set(message);
    console.error('Failed to flush usage:', error);
    // Don't clear pending - will retry on next flush
  } finally {
    isReportingUsage.set(false);
  }
}

/**
 * Report usage to the server
 */
async function reportUsageToServer(params: ReportUsageRequest): Promise<void> {
  const response = await fetch('/api/billing/usage', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subscriptionId: params.subscriptionId,
      usageType: params.usageType,
      quantity: params.quantity,
      timestamp: params.timestamp?.toISOString() || new Date().toISOString(),
      metadata: params.metadata,
    }),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as Record<string, any>;
    throw new BillingError(
      error.message || `Failed to report usage: ${response.status}`,
      BillingErrorCodes.API_ERROR
    );
  }
}

/**
 * Refresh usage summary from server
 */
export async function refreshUsageSummary(): Promise<UsageSummary[]> {
  try {
    const response = await fetch('/api/billing/usage', {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch usage: ${response.status}`);
    }

    const data = (await response.json()) as Record<string, any>;
    const summary = data.usage as UsageSummary[];
    updateUsageSummary(summary);
    return summary;
  } catch (error) {
    console.error('Failed to refresh usage summary:', error);
    return [];
  }
}

// ==================== Overage Calculation ====================

export interface OverageInfo {
  usageType: UsageType;
  quantity: number;
  overageRate: number; // cents per unit
  estimatedCost: number; // cents
}

/**
 * Overage rates per usage type (in cents per unit)
 */
export const OVERAGE_RATES: Record<UsageType, number> = {
  sandbox_minutes: 1, // $0.01 per minute
  ai_tokens: 0.001, // $0.001 per 1000 tokens = $0.000001 per token
  storage_gb: 10, // $0.10 per GB
  deployments: 50, // $0.50 per deployment
  api_requests: 0.1, // $0.001 per 10 requests
};

/**
 * Calculate overage for all usage types
 */
export function calculateOverages(): OverageInfo[] {
  const summary = usageSummary.get();
  const plan = currentPlan.get();
  const overages: OverageInfo[] = [];

  for (const [type, data] of Object.entries(summary)) {
    const usageType = type as UsageType;
    const limit = getLimitForType(usageType, plan);

    if (limit !== -1 && data.current > limit) {
      const overage = data.current - limit;
      const rate = OVERAGE_RATES[usageType];
      overages.push({
        usageType,
        quantity: overage,
        overageRate: rate,
        estimatedCost: Math.ceil(overage * rate),
      });
    }
  }

  return overages;
}

/**
 * Get total estimated overage cost
 */
export function getTotalOverageCost(): number {
  const overages = calculateOverages();
  return overages.reduce((total, o) => total + o.estimatedCost, 0);
}

/**
 * Get limit for a usage type from plan
 */
function getLimitForType(type: UsageType, plan: typeof currentPlan extends { get(): infer T } ? T : never): number {
  switch (type) {
    case 'sandbox_minutes':
      return plan.limits.sandboxMinutes;
    case 'ai_tokens':
      return plan.limits.aiTokens;
    case 'storage_gb':
      return plan.limits.storageGb;
    case 'deployments':
      return plan.limits.deployments;
    case 'api_requests':
      return plan.limits.apiRequests;
    default:
      return 0;
  }
}

// ==================== Usage Alerts ====================

export interface UsageAlert {
  type: 'warning' | 'critical' | 'exceeded';
  usageType: UsageType;
  percentage: number;
  message: string;
  timestamp: Date;
}

/**
 * Active usage alerts
 */
export const usageAlerts = atom<UsageAlert[]>([]);

/**
 * Check and update usage alerts
 */
export function checkUsageAlerts(): UsageAlert[] {
  const summary = usageSummary.get();
  const config = usageConfig.get();
  const alerts: UsageAlert[] = [];
  const now = new Date();

  for (const [type, data] of Object.entries(summary)) {
    const usageType = type as UsageType;

    if (data.percentage >= 100) {
      alerts.push({
        type: 'exceeded',
        usageType,
        percentage: data.percentage,
        message: `${formatUsageType(usageType)} limit exceeded. Overage charges may apply.`,
        timestamp: now,
      });
    } else if (data.percentage >= config.criticalThreshold) {
      alerts.push({
        type: 'critical',
        usageType,
        percentage: data.percentage,
        message: `${formatUsageType(usageType)} usage is at ${Math.round(data.percentage)}%. Consider upgrading your plan.`,
        timestamp: now,
      });
    } else if (data.percentage >= config.warningThreshold) {
      alerts.push({
        type: 'warning',
        usageType,
        percentage: data.percentage,
        message: `${formatUsageType(usageType)} usage is approaching the limit (${Math.round(data.percentage)}%).`,
        timestamp: now,
      });
    }
  }

  usageAlerts.set(alerts);
  return alerts;
}

/**
 * Dismiss an alert
 */
export function dismissAlert(usageType: UsageType): void {
  const current = usageAlerts.get();
  usageAlerts.set(current.filter(a => a.usageType !== usageType));
}

/**
 * Clear all alerts
 */
export function clearAlerts(): void {
  usageAlerts.set([]);
}

// ==================== Billable Events ====================

export interface BillableEvent {
  id: string;
  type: UsageType;
  quantity: number;
  description: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
  reported: boolean;
}

/**
 * Recent billable events (for UI display)
 */
export const recentEvents = atom<BillableEvent[]>([]);

/**
 * Create a billable event
 */
export function createBillableEvent(params: {
  type: UsageType;
  quantity: number;
  description: string;
  metadata?: Record<string, unknown>;
}): BillableEvent {
  const event: BillableEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: params.type,
    quantity: params.quantity,
    description: params.description,
    metadata: params.metadata,
    timestamp: new Date(),
    reported: false,
  };

  // Add to recent events (keep last 100)
  const current = recentEvents.get();
  recentEvents.set([event, ...current].slice(0, 100));

  // Track the usage
  trackUsage(params.type, params.quantity);

  return event;
}

/**
 * Mark event as reported
 */
export function markEventReported(eventId: string): void {
  const current = recentEvents.get();
  recentEvents.set(
    current.map(e => e.id === eventId ? { ...e, reported: true } : e)
  );
}

// ==================== Utility Functions ====================

/**
 * Format usage type for display
 */
export function formatUsageType(type: UsageType): string {
  switch (type) {
    case 'sandbox_minutes':
      return 'Sandbox Minutes';
    case 'ai_tokens':
      return 'AI Tokens';
    case 'storage_gb':
      return 'Storage';
    case 'deployments':
      return 'Deployments';
    case 'api_requests':
      return 'API Requests';
    default:
      return type;
  }
}

/**
 * Format usage value for display
 */
export function formatUsageValue(type: UsageType, value: number): string {
  switch (type) {
    case 'sandbox_minutes':
      return value >= 60 ? `${Math.round(value / 60)}h` : `${value}m`;
    case 'ai_tokens':
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
      return value.toString();
    case 'storage_gb':
      return `${value.toFixed(2)} GB`;
    case 'deployments':
    case 'api_requests':
      return value.toLocaleString();
    default:
      return value.toString();
  }
}

/**
 * Format overage cost for display
 */
export function formatOverageCost(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/**
 * Get color for usage percentage
 */
export function getUsageColor(percentage: number): string {
  const config = usageConfig.get();
  if (percentage >= 100) return 'red';
  if (percentage >= config.criticalThreshold) return 'orange';
  if (percentage >= config.warningThreshold) return 'yellow';
  return 'green';
}

// ==================== Initialization ====================

/**
 * Initialize usage tracking
 */
export function initializeUsageTracking(config?: Partial<UsageTrackingConfig>): void {
  if (config) {
    usageConfig.set({ ...DEFAULT_USAGE_CONFIG, ...config });
  }

  // Start periodic usage checks
  setInterval(() => {
    checkUsageAlerts();
  }, 60000); // Check every minute

  // Flush usage on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      flushUsage();
    });

    // Also flush on visibility change (tab hidden)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushUsage();
      }
    });
  }
}

/**
 * Clean up usage tracking
 */
export function cleanupUsageTracking(): void {
  if (batchTimeoutId) {
    clearTimeout(batchTimeoutId);
    batchTimeoutId = null;
  }
  flushUsage();
}
