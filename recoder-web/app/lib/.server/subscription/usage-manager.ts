/**
 * Subscription Usage Management System
 * Tracks and enforces usage limits for different subscription tiers
 */

interface SubscriptionTier {
  name: string;
  price: number;
  monthlyGenerations: number;
  features: string[];
  maxProjectSize: number; // MB
  maxFileCount: number;
  prioritySupport: boolean;
}

interface UserUsage {
  userId: string;
  tier: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  generationsUsed: number;
  storageUsed: number; // MB
  lastGeneration: Date;
}

class SubscriptionUsageManager {
  private tiers: Record<string, SubscriptionTier> = {
    free: {
      name: 'Free',
      price: 0,
      monthlyGenerations: 5,
      features: ['basic templates', 'community examples'],
      maxProjectSize: 10, // 10MB
      maxFileCount: 20,
      prioritySupport: false
    },
    pro: {
      name: 'Pro',
      price: 20,
      monthlyGenerations: 100,
      features: ['all templates', 'custom components', 'deployment', 'advanced caching'],
      maxProjectSize: 100, // 100MB
      maxFileCount: 200,
      prioritySupport: false
    },
    team: {
      name: 'Team',
      price: 50,
      monthlyGenerations: 500,
      features: ['collaboration', 'private templates', 'priority support', 'advanced models'],
      maxProjectSize: 500, // 500MB
      maxFileCount: 1000,
      prioritySupport: true
    },
    enterprise: {
      name: 'Enterprise',
      price: 200,
      monthlyGenerations: 2000,
      features: ['unlimited everything', 'dedicated support', 'custom models', 'on-premise'],
      maxProjectSize: 5000, // 5GB
      maxFileCount: 10000,
      prioritySupport: true
    }
  };

  async checkUsageLimit(userId: string, requestType: 'generation' | 'storage'): Promise<{
    allowed: boolean;
    remaining: number;
    upgradeRequired?: string;
  }> {
    const usage = await this.getUserUsage(userId);
    const tier = this.tiers[usage.tier];

    if (requestType === 'generation') {
      const remaining = tier.monthlyGenerations - usage.generationsUsed;

      return {
        allowed: remaining > 0,
        remaining,
        upgradeRequired: remaining <= 0 ? this.getNextTier(usage.tier) : undefined
      };
    }

    // Storage check
    const storageRemaining = tier.maxProjectSize - usage.storageUsed;
    return {
      allowed: storageRemaining > 0,
      remaining: storageRemaining,
      upgradeRequired: storageRemaining <= 0 ? this.getNextTier(usage.tier) : undefined
    };
  }

  async recordUsage(userId: string, type: 'generation' | 'storage', amount: number = 1): Promise<void> {
    // Record usage in database
    // Update analytics
    // Trigger alerts if approaching limits
  }

  private getNextTier(currentTier: string): string {
    const tierOrder = ['free', 'pro', 'team', 'enterprise'];
    const currentIndex = tierOrder.indexOf(currentTier);
    return tierOrder[currentIndex + 1] || 'enterprise';
  }

  private async getUserUsage(userId: string): Promise<UserUsage> {
    // Fetch from database
    // Return mock data for now
    return {
      userId,
      tier: 'free',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      generationsUsed: 2,
      storageUsed: 5,
      lastGeneration: new Date()
    };
  }

  calculateCostPerGeneration(
    tier: 'free' | 'pro' | 'team' | 'enterprise',
    complexity: 'simple' | 'medium' | 'complex'
  ): number {
    // Target cost per generation at different tiers
    const baseCosts = {
      free: 0.50,    // Break-even on basic generations
      pro: 0.15,     // $20 / 100 = $0.20, need $0.05 margin
      team: 0.08,    // $50 / 500 = $0.10, need $0.02 margin
      enterprise: 0.05 // $200 / 2000 = $0.10, need $0.05 margin
    };

    const complexityMultiplier = {
      simple: 0.5,   // Templates, UI components
      medium: 1.0,   // Standard features
      complex: 2.0   // Full applications, complex logic
    };

    return baseCosts[tier] * complexityMultiplier[complexity];
  }
}

export const subscriptionUsageManager = new SubscriptionUsageManager();