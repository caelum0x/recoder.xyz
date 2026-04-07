/**
 * Tier-based Resource Limits
 * Defines resource limits for each subscription tier
 */
import { SubscriptionTier, ResourceLimits, TierLimits } from './types.js';
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
export declare const TIER_RESOURCE_LIMITS: TierLimits;
/**
 * Get resource limits for a subscription tier
 */
export declare function getTierResourceLimits(tier: SubscriptionTier): ResourceLimits;
/**
 * Get resource limits for a tier by string name
 */
export declare function getTierResourceLimitsByName(tierName: string): ResourceLimits;
/**
 * Check if a tier has unlimited execution time
 */
export declare function hasUnlimitedExecution(tier: SubscriptionTier): boolean;
/**
 * Check if a tier allows background dev servers
 */
export declare function allowsBackgroundDevServer(tier: SubscriptionTier): boolean;
/**
 * Get maximum concurrent sandboxes for a tier
 */
export declare function getMaxConcurrentSandboxes(tier: SubscriptionTier): number;
/**
 * Get storage limit in human-readable format
 */
export declare function getStorageLimitFormatted(tier: SubscriptionTier): string;
/**
 * Get memory limit in human-readable format
 */
export declare function getMemoryLimitFormatted(tier: SubscriptionTier): string;
/**
 * Compare two tiers and return which has more resources
 * Returns: -1 if tier1 < tier2, 0 if equal, 1 if tier1 > tier2
 */
export declare function compareTiers(tier1: SubscriptionTier, tier2: SubscriptionTier): number;
/**
 * Get upgrade suggestion based on exceeded limit
 */
export declare function getUpgradeSuggestion(currentTier: SubscriptionTier, limitType: 'cpu' | 'memory' | 'storage' | 'execution' | 'concurrent'): {
    suggestedTier: SubscriptionTier;
    benefit: string;
} | null;
/**
 * Log tier limits for debugging
 */
export declare function logTierLimits(): void;
