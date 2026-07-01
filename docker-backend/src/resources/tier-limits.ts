/**
 * Tier-based Resource Limits
 * Defines resource limits for each subscription tier
 */

import {
  SubscriptionTier,
  ResourceLimits,
  TierLimits,
} from './types.js';

// ==================== Constants ====================

/** Bytes per MB */
const MB = 1024 * 1024;
/** Bytes per GB */
const GB = 1024 * 1024 * 1024;

// ==================== Tier Limit Definitions ====================

/**
 * Resource limits by subscription tier
 *
 * Free Tier: Limited resources for exploration
 * - 0.5 CPU core
 * - 512MB RAM
 * - 1GB storage
 * - 10Mbps network
 * - 60 minutes daily execution
 * - 20 hours monthly execution
 * - 1 concurrent sandbox
 *
 * Pro Tier: Professional development
 * - 2 CPU cores
 * - 2GB RAM
 * - 10GB storage
 * - 100Mbps network
 * - 240 minutes daily execution
 * - 100 hours monthly execution
 * - 3 concurrent sandboxes
 *
 * Enterprise Tier: Team/organization use
 * - 4 CPU cores
 * - 8GB RAM
 * - 100GB storage
 * - 1Gbps network
 * - Unlimited daily execution
 * - Unlimited monthly execution
 * - 10 concurrent sandboxes
 */
export const TIER_RESOURCE_LIMITS: TierLimits = {
  [SubscriptionTier.FREE]: {
    cpu: 0.5,
    memory: 512 * MB,
    memoryMB: 512,
    storage: 1 * GB,
    storageGB: 1,
    networkBandwidth: 10,           // 10 Mbps
    pidsLimit: 64,                  // Limited processes
    dailyExecutionMinutes: 60,      // 1 hour per day
    monthlyExecutionHours: 20,      // 20 hours per month
    maxConcurrentSandboxes: 1,      // Single sandbox at a time
    allowBackgroundDevServer: false, // No background dev servers
  },

  [SubscriptionTier.PRO]: {
    cpu: 2,
    memory: 2 * GB,
    memoryMB: 2048,
    storage: 10 * GB,
    storageGB: 10,
    networkBandwidth: 100,          // 100 Mbps
    pidsLimit: 256,                 // More processes
    dailyExecutionMinutes: 240,     // 4 hours per day
    monthlyExecutionHours: 100,     // 100 hours per month
    maxConcurrentSandboxes: 3,      // 3 concurrent sandboxes
    allowBackgroundDevServer: true, // Allow background dev servers
  },

  // Team Tier: Pro capabilities plus collaboration headroom (more sandboxes,
  // storage, and execution budget), but still bounded below Enterprise. This
  // keeps `Record<SubscriptionTier, ResourceLimits>` exhaustive and gives the
  // 'team' plan real, non-inflated limits.
  [SubscriptionTier.TEAM]: {
    cpu: 3,
    memory: 4 * GB,
    memoryMB: 4096,
    storage: 50 * GB,
    storageGB: 50,
    networkBandwidth: 500,          // 500 Mbps
    pidsLimit: 384,                 // More processes than Pro, fewer than Enterprise
    dailyExecutionMinutes: 480,     // 8 hours per day
    monthlyExecutionHours: 300,     // 300 hours per month
    maxConcurrentSandboxes: 5,      // 5 concurrent sandboxes
    allowBackgroundDevServer: true, // Allow background dev servers
  },

  [SubscriptionTier.ENTERPRISE]: {
    cpu: 4,
    memory: 8 * GB,
    memoryMB: 8192,
    storage: 100 * GB,
    storageGB: 100,
    networkBandwidth: 1000,         // 1 Gbps
    pidsLimit: 512,                 // Many processes
    dailyExecutionMinutes: 0,       // Unlimited (0 = no limit)
    monthlyExecutionHours: 0,       // Unlimited (0 = no limit)
    maxConcurrentSandboxes: 10,     // 10 concurrent sandboxes
    allowBackgroundDevServer: true, // Allow background dev servers
  },
};

// ==================== Helper Functions ====================

/**
 * Get resource limits for a subscription tier
 */
export function getTierResourceLimits(tier: SubscriptionTier): ResourceLimits {
  return TIER_RESOURCE_LIMITS[tier];
}

/**
 * Get resource limits for a tier by string name
 */
export function getTierResourceLimitsByName(tierName: string): ResourceLimits {
  const tier = tierName.toLowerCase() as SubscriptionTier;
  if (tier in TIER_RESOURCE_LIMITS) {
    return TIER_RESOURCE_LIMITS[tier];
  }
  // Default to free tier for unknown tiers
  console.warn(`[TierLimits] Unknown tier "${tierName}", defaulting to FREE`);
  return TIER_RESOURCE_LIMITS[SubscriptionTier.FREE];
}

/**
 * Check if a tier has unlimited execution time
 */
export function hasUnlimitedExecution(tier: SubscriptionTier): boolean {
  const limits = TIER_RESOURCE_LIMITS[tier];
  return limits.dailyExecutionMinutes === 0 && limits.monthlyExecutionHours === 0;
}

/**
 * Check if a tier allows background dev servers
 */
export function allowsBackgroundDevServer(tier: SubscriptionTier): boolean {
  return TIER_RESOURCE_LIMITS[tier].allowBackgroundDevServer;
}

/**
 * Get maximum concurrent sandboxes for a tier
 */
export function getMaxConcurrentSandboxes(tier: SubscriptionTier): number {
  return TIER_RESOURCE_LIMITS[tier].maxConcurrentSandboxes;
}

/**
 * Get storage limit in human-readable format
 */
export function getStorageLimitFormatted(tier: SubscriptionTier): string {
  const limits = TIER_RESOURCE_LIMITS[tier];
  return `${limits.storageGB} GB`;
}

/**
 * Get memory limit in human-readable format
 */
export function getMemoryLimitFormatted(tier: SubscriptionTier): string {
  const limits = TIER_RESOURCE_LIMITS[tier];
  if (limits.memoryMB >= 1024) {
    return `${limits.memoryMB / 1024} GB`;
  }
  return `${limits.memoryMB} MB`;
}

/**
 * Compare two tiers and return which has more resources
 * Returns: -1 if tier1 < tier2, 0 if equal, 1 if tier1 > tier2
 */
export function compareTiers(tier1: SubscriptionTier, tier2: SubscriptionTier): number {
  const tierOrder = {
    [SubscriptionTier.FREE]: 0,
    [SubscriptionTier.PRO]: 1,
    [SubscriptionTier.TEAM]: 2,
    [SubscriptionTier.ENTERPRISE]: 3,
  };

  const order1 = tierOrder[tier1];
  const order2 = tierOrder[tier2];

  if (order1 < order2) return -1;
  if (order1 > order2) return 1;
  return 0;
}

/**
 * Get upgrade suggestion based on exceeded limit
 */
export function getUpgradeSuggestion(
  currentTier: SubscriptionTier,
  limitType: 'cpu' | 'memory' | 'storage' | 'execution' | 'concurrent'
): { suggestedTier: SubscriptionTier; benefit: string } | null {
  if (currentTier === SubscriptionTier.ENTERPRISE) {
    return null; // Already at highest tier
  }

  const nextTier = currentTier === SubscriptionTier.FREE
    ? SubscriptionTier.PRO
    : SubscriptionTier.ENTERPRISE;

  const nextLimits = TIER_RESOURCE_LIMITS[nextTier];
  const currentLimits = TIER_RESOURCE_LIMITS[currentTier];

  const benefits: Record<string, string> = {
    cpu: `${nextLimits.cpu}x CPU (vs ${currentLimits.cpu}x)`,
    memory: `${nextLimits.memoryMB}MB RAM (vs ${currentLimits.memoryMB}MB)`,
    storage: `${nextLimits.storageGB}GB storage (vs ${currentLimits.storageGB}GB)`,
    execution: nextLimits.dailyExecutionMinutes === 0
      ? 'Unlimited execution time'
      : `${nextLimits.dailyExecutionMinutes} min/day (vs ${currentLimits.dailyExecutionMinutes} min)`,
    concurrent: `${nextLimits.maxConcurrentSandboxes} sandboxes (vs ${currentLimits.maxConcurrentSandboxes})`,
  };

  return {
    suggestedTier: nextTier,
    benefit: benefits[limitType] || `Upgrade to ${nextTier} for increased limits`,
  };
}

/**
 * Log tier limits for debugging
 */
export function logTierLimits(): void {
  console.log('[TierLimits] Resource limits by tier:');
  for (const [tier, limits] of Object.entries(TIER_RESOURCE_LIMITS)) {
    console.log(`  ${tier}:`);
    console.log(`    CPU: ${limits.cpu} cores`);
    console.log(`    Memory: ${limits.memoryMB} MB`);
    console.log(`    Storage: ${limits.storageGB} GB`);
    console.log(`    Network: ${limits.networkBandwidth} Mbps`);
    console.log(`    PIDs: ${limits.pidsLimit}`);
    console.log(`    Daily Execution: ${limits.dailyExecutionMinutes === 0 ? 'Unlimited' : `${limits.dailyExecutionMinutes} min`}`);
    console.log(`    Monthly Execution: ${limits.monthlyExecutionHours === 0 ? 'Unlimited' : `${limits.monthlyExecutionHours} hours`}`);
    console.log(`    Max Sandboxes: ${limits.maxConcurrentSandboxes}`);
    console.log(`    Background Dev: ${limits.allowBackgroundDevServer}`);
  }
}
