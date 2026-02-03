/**
 * Sandbox Usage Tracker
 * Tracks real-time sandbox usage including compute time, storage, and API calls
 * Provides real-time updates via nanostores and persists usage data
 */

import { atom, computed, map } from 'nanostores';
import type {
  SandboxUsage,
  UsageEvent,
  UsageEventType,
  SandboxInstance,
  BillingSummary,
  OverageCharge,
} from './types';
import {
  usageStore,
  subscriptionStore,
  currentTier,
  incrementApiCalls,
  addComputeTime,
  updateStorageUsed,
  updateSandboxCounts,
} from './quota-manager';
import { SANDBOX_PLANS, calculateOverageCost, formatLimit } from './plans';

// ==================== Stores ====================

/**
 * Map of active sandbox instances
 */
export const sandboxInstancesStore = map<Record<string, SandboxInstance>>({});

/**
 * Current compute session tracking (sandbox ID -> start time)
 */
export const activeSessionsStore = map<Record<string, Date>>({});

/**
 * Usage events history (recent events for debugging/display)
 */
export const usageEventsStore = atom<UsageEvent[]>([]);

/**
 * Real-time compute time accumulator (updated every tick)
 */
export const realtimeComputeStore = atom<number>(0);

/**
 * Tracking interval reference
 */
let computeTrackingInterval: NodeJS.Timeout | null = null;

/**
 * Compute tick interval in milliseconds
 */
const COMPUTE_TICK_INTERVAL = 1000; // 1 second

/**
 * Maximum events to keep in history
 */
const MAX_EVENTS_HISTORY = 100;

// ==================== Computed Stores ====================

/**
 * List of all sandbox instances
 */
export const sandboxList = computed(sandboxInstancesStore, (instances) => {
  return Object.values(instances);
});

/**
 * Running sandboxes
 */
export const runningSandboxes = computed(sandboxInstancesStore, (instances) => {
  return Object.values(instances).filter((s) => s.status === 'running');
});

/**
 * Number of running sandboxes
 */
export const runningSandboxCount = computed(runningSandboxes, (sandboxes) => {
  return sandboxes.length;
});

/**
 * Total storage used across all sandboxes
 */
export const totalStorageUsed = computed(sandboxInstancesStore, (instances) => {
  return Object.values(instances).reduce((sum, s) => sum + s.storageUsed, 0);
});

/**
 * Compute time being used this session
 */
export const currentSessionComputeTime = computed(
  [activeSessionsStore, realtimeComputeStore],
  (sessions, _tick) => {
    const now = Date.now();
    let total = 0;

    for (const startTime of Object.values(sessions) as Date[]) {
      total += Math.floor((now - startTime.getTime()) / 1000);
    }

    return total;
  }
);

/**
 * Billing summary for current period
 */
export const billingSummary = computed(
  [subscriptionStore, usageStore],
  (subscription, usage): BillingSummary | null => {
    if (!subscription || !usage) return null;

    const plan = subscription.plan;
    const limits = plan.limits;

    const usageBreakdown: BillingSummary['usageBreakdown'] = [];

    // Sandboxes
    if (limits.maxSandboxes !== -1) {
      usageBreakdown.push({
        label: 'Sandboxes',
        used: usage.activeSandboxes,
        limit: limits.maxSandboxes,
        unit: '',
        percentage: Math.round((usage.activeSandboxes / limits.maxSandboxes) * 100),
      });
    }

    // Storage
    usageBreakdown.push({
      label: 'Storage',
      used: usage.storageUsed,
      limit: limits.storageLimit,
      unit: 'MB',
      percentage: Math.round((usage.storageUsed / limits.storageLimit) * 100),
    });

    // API Calls
    if (limits.apiCallsPerMonth !== -1) {
      usageBreakdown.push({
        label: 'API Calls',
        used: usage.apiCallsUsed,
        limit: limits.apiCallsPerMonth,
        unit: '',
        percentage: Math.round((usage.apiCallsUsed / limits.apiCallsPerMonth) * 100),
      });
    }

    // Compute Time (daily)
    if (limits.dailyComputeLimit !== -1) {
      usageBreakdown.push({
        label: 'Daily Compute',
        used: usage.computeTimeToday,
        limit: limits.dailyComputeLimit,
        unit: 'sec',
        percentage: Math.round((usage.computeTimeToday / limits.dailyComputeLimit) * 100),
      });
    }

    // Calculate projected overage
    let projectedOverageCents = 0;
    if (plan.tier !== 'free') {
      // API call overage
      if (limits.apiCallsPerMonth !== -1 && usage.apiCallsUsed > limits.apiCallsPerMonth) {
        projectedOverageCents += calculateOverageCost(
          'apiCalls',
          usage.apiCallsUsed - limits.apiCallsPerMonth
        );
      }

      // Storage overage
      if (usage.storageUsed > limits.storageLimit) {
        projectedOverageCents += calculateOverageCost(
          'storage',
          (usage.storageUsed - limits.storageLimit) / 1024 // Convert to GB
        );
      }
    }

    return {
      planName: plan.name,
      monthlyCostCents: plan.pricing.monthlyPriceCents,
      projectedOverageCents,
      usageBreakdown,
      nextBillingDate: subscription.currentPeriodEnd,
    };
  }
);

// ==================== Event Tracking ====================

/**
 * Generate unique event ID
 */
function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Record a usage event
 */
export function recordUsageEvent(
  type: UsageEventType,
  userId: string,
  options: {
    sandboxId?: string;
    projectId?: string;
    metadata?: Record<string, unknown>;
    value?: number;
  } = {}
): UsageEvent {
  const event: UsageEvent = {
    id: generateEventId(),
    userId,
    type,
    sandboxId: options.sandboxId,
    projectId: options.projectId,
    metadata: options.metadata ?? {},
    timestamp: new Date(),
    value: options.value,
  };

  // Add to history (keep last N events)
  const events = usageEventsStore.get();
  const newEvents = [event, ...events].slice(0, MAX_EVENTS_HISTORY);
  usageEventsStore.set(newEvents);

  // Trigger appropriate quota updates based on event type
  handleUsageEvent(event);

  return event;
}

/**
 * Handle usage event side effects
 */
function handleUsageEvent(event: UsageEvent): void {
  switch (event.type) {
    case 'api_call':
      incrementApiCalls(event.value ?? 1);
      break;

    case 'compute_tick':
      if (event.value) {
        addComputeTime(event.value);
      }
      break;

    case 'storage_updated':
      if (event.value !== undefined) {
        updateStorageUsed(event.value);
      }
      break;

    case 'sandbox_created':
    case 'sandbox_deleted':
    case 'sandbox_started':
    case 'sandbox_stopped':
      recalculateSandboxCounts();
      break;
  }
}

/**
 * Recalculate sandbox counts from instances
 */
function recalculateSandboxCounts(): void {
  const instances = sandboxInstancesStore.get();
  const allSandboxes = Object.values(instances);
  const active = allSandboxes.filter(
    (s) => s.status !== 'terminated' && s.status !== 'error'
  ).length;
  const running = allSandboxes.filter((s) => s.status === 'running').length;

  updateSandboxCounts(active, running);
}

// ==================== Sandbox Instance Management ====================

/**
 * Register a new sandbox instance
 */
export function registerSandbox(
  instance: Omit<SandboxInstance, 'createdAt' | 'totalComputeTime' | 'storageUsed'>
): SandboxInstance {
  const fullInstance: SandboxInstance = {
    ...instance,
    createdAt: new Date(),
    totalComputeTime: 0,
    storageUsed: 0,
  };

  sandboxInstancesStore.setKey(instance.id, fullInstance);

  recordUsageEvent('sandbox_created', instance.userId, {
    sandboxId: instance.id,
    projectId: instance.projectId,
    metadata: { resources: instance.resources },
  });

  return fullInstance;
}

/**
 * Update sandbox instance
 */
export function updateSandbox(
  sandboxId: string,
  updates: Partial<SandboxInstance>
): void {
  const current = sandboxInstancesStore.get()[sandboxId];
  if (!current) return;

  const previousStatus = current.status;
  const newInstance = { ...current, ...updates };
  sandboxInstancesStore.setKey(sandboxId, newInstance);

  // Handle status changes
  if (updates.status && updates.status !== previousStatus) {
    if (updates.status === 'running') {
      startComputeTracking(sandboxId);
      recordUsageEvent('sandbox_started', current.userId, {
        sandboxId,
        projectId: current.projectId,
      });
    } else if (previousStatus === 'running') {
      stopComputeTracking(sandboxId);
      recordUsageEvent('sandbox_stopped', current.userId, {
        sandboxId,
        projectId: current.projectId,
      });
    }
  }

  // Handle storage updates
  if (updates.storageUsed !== undefined && updates.storageUsed !== current.storageUsed) {
    recordUsageEvent('storage_updated', current.userId, {
      sandboxId,
      projectId: current.projectId,
      value: calculateTotalStorage(),
    });
  }
}

/**
 * Remove a sandbox instance
 */
export function removeSandbox(sandboxId: string): void {
  const instance = sandboxInstancesStore.get()[sandboxId];
  if (!instance) return;

  // Stop tracking if running
  stopComputeTracking(sandboxId);

  // Remove from store
  const instances = { ...sandboxInstancesStore.get() };
  delete instances[sandboxId];
  sandboxInstancesStore.set(instances);

  recordUsageEvent('sandbox_deleted', instance.userId, {
    sandboxId,
    projectId: instance.projectId,
    metadata: {
      totalComputeTime: instance.totalComputeTime,
      storageUsed: instance.storageUsed,
    },
  });

  // Update storage total
  updateStorageUsed(calculateTotalStorage());
}

/**
 * Get sandbox by ID
 */
export function getSandbox(sandboxId: string): SandboxInstance | undefined {
  return sandboxInstancesStore.get()[sandboxId];
}

/**
 * Get all sandboxes for a user
 */
export function getUserSandboxes(userId: string): SandboxInstance[] {
  return Object.values(sandboxInstancesStore.get()).filter(
    (s) => s.userId === userId
  );
}

/**
 * Calculate total storage across all sandboxes
 */
function calculateTotalStorage(): number {
  return Object.values(sandboxInstancesStore.get()).reduce(
    (sum, s) => sum + s.storageUsed,
    0
  );
}

// ==================== Compute Time Tracking ====================

/**
 * Start tracking compute time for a sandbox
 */
export function startComputeTracking(sandboxId: string): void {
  activeSessionsStore.setKey(sandboxId, new Date());

  // Start the global tracking interval if not running
  if (!computeTrackingInterval) {
    startGlobalComputeTracking();
  }
}

/**
 * Stop tracking compute time for a sandbox
 */
export function stopComputeTracking(sandboxId: string): void {
  const startTime = activeSessionsStore.get()[sandboxId];
  if (!startTime) return;

  // Calculate and record final compute time
  const now = new Date();
  const durationSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);

  // Update sandbox total compute time
  const instance = sandboxInstancesStore.get()[sandboxId];
  if (instance) {
    sandboxInstancesStore.setKey(sandboxId, {
      ...instance,
      totalComputeTime: instance.totalComputeTime + durationSeconds,
      lastStoppedAt: now,
    });
  }

  // Remove from active sessions
  const sessions = { ...activeSessionsStore.get() };
  delete sessions[sandboxId];
  activeSessionsStore.set(sessions);

  // Stop global tracking if no more active sessions
  if (Object.keys(sessions).length === 0) {
    stopGlobalComputeTracking();
  }
}

/**
 * Start global compute tracking interval
 */
function startGlobalComputeTracking(): void {
  if (computeTrackingInterval) return;

  computeTrackingInterval = setInterval(() => {
    const sessions = activeSessionsStore.get();
    const activeSandboxCount = Object.keys(sessions).length;

    if (activeSandboxCount > 0) {
      // Update realtime counter to trigger reactivity
      realtimeComputeStore.set(Date.now());

      // Record compute tick for quota tracking (1 second per sandbox)
      const usage = usageStore.get();
      if (usage) {
        // Only record if we're tracking for a user
        recordUsageEvent('compute_tick', usage.userId, {
          value: activeSandboxCount, // seconds of compute used this tick
          metadata: { sandboxCount: activeSandboxCount },
        });
      }
    }
  }, COMPUTE_TICK_INTERVAL);
}

/**
 * Stop global compute tracking interval
 */
function stopGlobalComputeTracking(): void {
  if (computeTrackingInterval) {
    clearInterval(computeTrackingInterval);
    computeTrackingInterval = null;
  }
}

// ==================== API Call Tracking ====================

/**
 * Track an API call
 */
export function trackApiCall(
  userId: string,
  options: {
    sandboxId?: string;
    endpoint?: string;
    method?: string;
    statusCode?: number;
    durationMs?: number;
  } = {}
): void {
  recordUsageEvent('api_call', userId, {
    sandboxId: options.sandboxId,
    metadata: {
      endpoint: options.endpoint,
      method: options.method,
      statusCode: options.statusCode,
      durationMs: options.durationMs,
    },
    value: 1,
  });
}

/**
 * Track file upload
 */
export function trackFileUpload(
  userId: string,
  sandboxId: string,
  sizeBytes: number
): void {
  recordUsageEvent('file_uploaded', userId, {
    sandboxId,
    value: sizeBytes,
    metadata: { sizeBytes },
  });
}

/**
 * Track file download
 */
export function trackFileDownload(
  userId: string,
  sandboxId: string,
  sizeBytes: number
): void {
  recordUsageEvent('file_downloaded', userId, {
    sandboxId,
    value: sizeBytes,
    metadata: { sizeBytes },
  });
}

// ==================== Usage Initialization ====================

/**
 * Initialize usage tracking for a user
 */
export function initializeUsageTracking(userId: string): void {
  // Clear existing state
  sandboxInstancesStore.set({});
  activeSessionsStore.set({});
  usageEventsStore.set([]);
  realtimeComputeStore.set(0);

  // Stop any existing tracking
  stopGlobalComputeTracking();
}

/**
 * Load existing sandboxes for a user
 */
export function loadUserSandboxes(sandboxes: SandboxInstance[]): void {
  const instances: Record<string, SandboxInstance> = {};

  for (const sandbox of sandboxes) {
    instances[sandbox.id] = sandbox;

    // Resume compute tracking for running sandboxes
    if (sandbox.status === 'running' && sandbox.lastStartedAt) {
      activeSessionsStore.setKey(sandbox.id, new Date(sandbox.lastStartedAt));
    }
  }

  sandboxInstancesStore.set(instances);

  // Start global tracking if there are active sessions
  if (Object.keys(activeSessionsStore.get()).length > 0) {
    startGlobalComputeTracking();
  }

  // Update quota manager with current counts
  recalculateSandboxCounts();
  updateStorageUsed(calculateTotalStorage());
}

/**
 * Cleanup usage tracking (logout/cleanup)
 */
export function cleanupUsageTracking(): void {
  // Stop all compute tracking
  stopGlobalComputeTracking();

  // Clear all stores
  sandboxInstancesStore.set({});
  activeSessionsStore.set({});
  usageEventsStore.set([]);
  realtimeComputeStore.set(0);
}

// ==================== Usage Statistics ====================

/**
 * Get usage statistics for a time period
 */
export function getUsageStats(
  events: UsageEvent[],
  periodStart: Date,
  periodEnd: Date
): {
  totalApiCalls: number;
  totalComputeSeconds: number;
  totalFileUploads: number;
  totalFileDownloads: number;
  uniqueSandboxes: Set<string>;
  eventsByType: Record<UsageEventType, number>;
} {
  const filteredEvents = events.filter(
    (e) => e.timestamp >= periodStart && e.timestamp <= periodEnd
  );

  const stats = {
    totalApiCalls: 0,
    totalComputeSeconds: 0,
    totalFileUploads: 0,
    totalFileDownloads: 0,
    uniqueSandboxes: new Set<string>(),
    eventsByType: {} as Record<UsageEventType, number>,
  };

  for (const event of filteredEvents) {
    // Count by type
    stats.eventsByType[event.type] = (stats.eventsByType[event.type] || 0) + 1;

    // Track sandbox
    if (event.sandboxId) {
      stats.uniqueSandboxes.add(event.sandboxId);
    }

    // Aggregate values
    switch (event.type) {
      case 'api_call':
        stats.totalApiCalls += event.value ?? 1;
        break;
      case 'compute_tick':
        stats.totalComputeSeconds += event.value ?? 0;
        break;
      case 'file_uploaded':
        stats.totalFileUploads += 1;
        break;
      case 'file_downloaded':
        stats.totalFileDownloads += 1;
        break;
    }
  }

  return stats;
}

/**
 * Get formatted usage summary
 */
export function getUsageSummaryText(): string {
  const usage = usageStore.get();
  const tier = currentTier.get();
  const plan = SANDBOX_PLANS[tier];

  if (!usage) {
    return 'No usage data available';
  }

  const lines = [
    `Usage Summary (${plan.name} Plan)`,
    '---',
    `Sandboxes: ${usage.activeSandboxes}/${formatLimit(plan.limits.maxSandboxes, '')}`,
    `Running: ${usage.runningSandboxes}/${plan.limits.maxConcurrent}`,
    `Storage: ${formatLimit(usage.storageUsed, 'MB')}/${formatLimit(plan.limits.storageLimit, 'MB')}`,
    `API Calls: ${usage.apiCallsUsed.toLocaleString()}/${formatLimit(plan.limits.apiCallsPerMonth, '')}`,
  ];

  if (plan.limits.dailyComputeLimit !== -1) {
    lines.push(
      `Today's Compute: ${formatLimit(usage.computeTimeToday, 'seconds')}/${formatLimit(plan.limits.dailyComputeLimit, 'seconds')}`
    );
  }

  lines.push(`Total Compute: ${formatLimit(usage.computeTimeUsed, 'seconds')}`);
  lines.push(`Last Updated: ${usage.lastUpdated.toLocaleString()}`);

  return lines.join('\n');
}

/**
 * Export usage data for debugging
 */
export function exportUsageData(): {
  instances: Record<string, SandboxInstance>;
  activeSessions: Record<string, Date>;
  recentEvents: UsageEvent[];
  currentComputeTime: number;
} {
  return {
    instances: sandboxInstancesStore.get(),
    activeSessions: activeSessionsStore.get(),
    recentEvents: usageEventsStore.get(),
    currentComputeTime: currentSessionComputeTime.get(),
  };
}
