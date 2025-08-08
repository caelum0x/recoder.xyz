// Web Platform Database Connection using Prisma
import { prisma } from './prisma';

// Types
export type PlanType = 'FREE' | 'PRO' | 'ENTERPRISE';
export type PlanStatus = 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PAUSED';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  email_verified: boolean;
  email_verified_at?: Date;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
  is_active: boolean;
  metadata: Record<string, any>;
} 

export interface Subscription {
  id: string;
  user_id: string;
  plan_type: PlanType;
  status: PlanStatus;
  starts_at: Date;
  ends_at?: Date;
  cancelled_at?: Date;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface UsageLog {
  id: string;
  user_id: string;
  product: string;
  action: string;
  resource_type?: string;
  resource_count: number;
  metadata: Record<string, any>;
  created_at: Date;
}

// User management functions
export const userDb = {
  async create(userData: {
    email: string;
    name: string;
    avatar_url?: string;
    provider_id?: string;
    provider?: string;
  }): Promise<User> {
    const user = await prisma.user.create({
      data: {
        email: userData.email,
        name: userData.name,
        image: userData.avatar_url,
        emailVerified: new Date(),
      }
    });

    // TODO: Create default FREE subscription when subscription model is implemented

    return {
      id: user.id,
      email: user.email!,
      name: user.name!,
      avatar_url: user.image ?? undefined,
      email_verified: !!user.emailVerified,
      email_verified_at: user.emailVerified ?? undefined,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      last_login_at: user.lastLoginAt ?? undefined,
      is_active: true,
      metadata: {},
    };
  },

  async findByEmail(email: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { email }
    });
    
    if (!user) return null;
    
    return {
      id: user.id,
      email: user.email!,
      name: user.name!,
      avatar_url: user.image ?? undefined,
      email_verified: !!user.emailVerified,
      email_verified_at: user.emailVerified ?? undefined,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      last_login_at: user.lastLoginAt ?? undefined,
      is_active: true,
      metadata: {},
    };
  },

  async findById(id: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { id }
    });
    
    if (!user) return null;
    
    return {
      id: user.id,
      email: user.email!,
      name: user.name!,
      avatar_url: user.image ?? undefined,
      email_verified: !!user.emailVerified,
      email_verified_at: user.emailVerified ?? undefined,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      last_login_at: user.lastLoginAt ?? undefined,
      is_active: true,
      metadata: {},
    };
  },

  async update(id: string, updates: Partial<User>): Promise<User> {
    const user = await prisma.user.update({
      where: { id },
      data: {
        name: updates.name,
        image: updates.avatar_url,
        emailVerified: updates.email_verified ? new Date() : undefined,
        lastLoginAt: updates.last_login_at,
        updatedAt: new Date(),
      }
    });
    
    return {
      id: user.id,
      email: user.email!,
      name: user.name!,
      avatar_url: user.image ?? undefined,
      email_verified: !!user.emailVerified,
      email_verified_at: user.emailVerified ?? undefined,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      last_login_at: user.lastLoginAt ?? undefined,
      is_active: true,
      metadata: {},
    };
  },

  async updateLastLogin(id: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() }
    });
  }
};

// Subscription management functions
export const subscriptionDb = {
  async getUserPlan(userId: string): Promise<PlanType> {
    // TODO: Implement subscription model or use user settings
    return 'FREE';
  },

  async getUserSubscription(userId: string): Promise<Subscription | null> {
    // TODO: Implement subscription model or use user settings
    return null;
  },

  async updatePlan(userId: string, planType: PlanType): Promise<void> {
    // TODO: Implement subscription model or use user settings
    // For now, this is a no-op
  }
};

// Usage tracking functions
export const usageDb = {
  async logUsage(data: {
    user_id: string;
    product: string;
    action: string;
    resource_type?: string;
    resource_count?: number;
    metadata?: Record<string, any>;
  }): Promise<void> {
    // TODO: Use UsageStats model instead of usageLog
    // For now, this is a no-op
  },

  async getUserUsage(userId: string, product: string, days: number = 30): Promise<number> {
    // TODO: Use UsageStats model to calculate usage
    // For now, return 0
    return 0;
  },

  async getUserLimit(userId: string, product: string, feature: string): Promise<number> {
    const plan = await subscriptionDb.getUserPlan(userId);
    
    // Basic limits by plan
    const limits = {
      FREE: {
        'requests_per_month': 100,
        'projects_max': 3,
        'storage_mb': 100,
        'messages_per_day': 50,
        'conversations_max': 5,
        'suggestions_per_day': 20,
      },
      PRO: {
        'requests_per_month': 1000,
        'projects_max': 25,
        'storage_mb': 1000,
        'messages_per_day': 500,
        'conversations_max': 50,
        'suggestions_per_day': 200,
      },
      ENTERPRISE: {
        'requests_per_month': -1, // Unlimited
        'projects_max': -1,
        'storage_mb': -1,
        'messages_per_day': -1,
        'conversations_max': -1,
        'suggestions_per_day': -1,
      }
    };
    
    const planLimits = limits[plan as keyof typeof limits];
    return (planLimits?.[feature as keyof typeof planLimits] as number) || 0;
  },

  async checkUsageLimit(userId: string, product: string, feature: string): Promise<{
    canUse: boolean;
    usage: number;
    limit: number;
    remaining: number;
  }> {
    const [usage, limit] = await Promise.all([
      usageDb.getUserUsage(userId, product, feature.includes('day') ? 1 : 30),
      usageDb.getUserLimit(userId, product, feature)
    ]);

    const remaining = limit === -1 ? Infinity : Math.max(0, limit - usage);
    const canUse = limit === -1 || usage < limit;

    return {
      canUse,
      usage,
      limit,
      remaining
    };
  }
};

// Health check function
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// Cleanup function for graceful shutdown
export async function closeDatabaseConnections(): Promise<void> {
  await prisma.$disconnect();
}