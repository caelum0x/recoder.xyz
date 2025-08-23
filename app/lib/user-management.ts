// Production user management connected to database
import { db, User } from './database';

export async function getUserByEmail(email: string): Promise<User | null> {
  return await db.getUserByEmail(email);
}

export async function createUser(userData: Partial<User>): Promise<User> {
  return await db.createUser(userData as Omit<User, 'id' | 'created_at' | 'updated_at'>);
}

export async function updateUser(id: string, userData: Partial<User>): Promise<User | null> {
  return await db.updateUser(id, userData);
}

export async function getUserSubscription(userId: string): Promise<string | null> {
  const subscription = await db.getSubscriptionByUserId(userId);
  return subscription?.plan || null;
}

export async function getDashboardData(userId: string): Promise<any> {
  const stats = await db.getUserStats(userId);
  
  if (!stats.user) {
    throw new Error('User not found');
  }

  return {
    user: {
      id: stats.user.id,
      email: stats.user.email,
      name: stats.user.name,
      subscription: stats.user.subscription_plan
    },
    usage: {
      totalRequests: stats.usage.total_requests,
      usedRequests: stats.usage.total_requests - stats.user.quota.requests_remaining,
      remainingRequests: stats.user.quota.requests_remaining,
      resetDate: stats.user.quota.reset_date
    },
    subscription: stats.subscription,
    router_stats: stats.router_stats,
    cost_savings: stats.usage.cost_savings
  };
}

export async function getUserProfile(userId: string): Promise<User | null> {
  return await db.getUserById(userId);
}

export async function updateUserProfile(userId: string, updates: Partial<User>): Promise<boolean> {
  const result = await db.updateUser(userId, updates);
  return result !== null;
}

export async function changePlan(userId: string, planType: 'free' | 'pro' | 'enterprise'): Promise<boolean> {
  const result = await db.updateUser(userId, {
    subscription_plan: planType,
    subscription_status: 'active'
  });
  return result !== null;
}

// Export userManager for compatibility
export const userManager = {
  getUserByEmail,
  createUser,
  updateUser,
  getUserSubscription,
  getDashboardData,
  getUserProfile,
  updateUserProfile,
  changePlan
};