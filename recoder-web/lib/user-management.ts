// Unified User Management System for Recoder.xyz
import { userDb, subscriptionDb, usageDb, PlanType } from './database';
import { prisma } from './prisma';
import { apiKeyManager } from './api-auth';
import { hash, compare } from 'bcryptjs';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  username?: string;
  bio?: string;
  location?: string;
  company?: string;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
  is_active: boolean; 
  
  // Subscription info
  plan: PlanType;
  subscription_status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PAUSED';
  subscription_ends_at?: Date;
  
  // Usage stats
  usage_stats: {
    cli: { used: number; limit: number; remaining: number };
    web: { projects: number; storage_mb: number; limit_projects: number; limit_storage: number };
    chat: { messages_today: number; conversations: number; daily_limit: number; conversations_limit: number };
    extension: { suggestions_today: number; daily_limit: number };
    router: { requests_monthly: number; monthly_limit: number };
  };
  
  // API keys
  api_keys: {
    cli?: string;
    extension?: string;
    router?: string;
  };
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  notifications: {
    email: boolean;
    push: boolean;
    marketing: boolean;
  };
  preferences: {
    default_model: string;
    code_style: 'typescript' | 'javascript' | 'python' | 'rust';
    enable_analytics: boolean;
    enable_telemetry: boolean;
  };
  privacy: {
    profile_public: boolean;
    projects_public: boolean;
    show_activity: boolean;
  };
}

export class UserManager {
  // Get complete user profile with all data
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      // Get basic user data
      const user = await userDb.findById(userId);
      if (!user) return null;

      // Get subscription data
      const subscription = await subscriptionDb.getUserSubscription(userId);
      const plan = await subscriptionDb.getUserPlan(userId);

      // Get usage statistics for all products
      const [
        cliUsage,
        webProjects,
        chatConversations,
        cliLimit,
        webProjectsLimit,
        webStorageLimit,
        chatDailyLimit,
        chatConversationsLimit,
        extensionDailyLimit,
        routerMonthlyLimit
      ] = await Promise.all([
        usageDb.getUserUsage(userId, 'cli', 30),
        this.getWebProjects(userId),
        this.getChatConversations(userId),
        usageDb.getUserLimit(userId, 'cli', 'requests_per_month'),
        usageDb.getUserLimit(userId, 'web', 'projects_max'),
        usageDb.getUserLimit(userId, 'web', 'storage_mb'),
        usageDb.getUserLimit(userId, 'chat', 'messages_per_day'),
        usageDb.getUserLimit(userId, 'chat', 'conversations_max'),
        usageDb.getUserLimit(userId, 'extension', 'suggestions_per_day'),
        usageDb.getUserLimit(userId, 'router', 'requests_per_month'),
      ]);

      // Calculate storage usage (TODO: implement actual size calculation)
      const totalStorageMB = webProjects.length * 0.1; // Rough estimate: 0.1MB per project

      // Get today's usage for daily limits
      const [chatToday, extensionToday] = await Promise.all([
        usageDb.getUserUsage(userId, 'chat', 1),
        usageDb.getUserUsage(userId, 'extension', 1),
      ]);

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        username: (user as any).username,
        bio: (user as any).bio,
        location: (user as any).location,
        company: (user as any).company,
        email_verified: user.email_verified,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login_at: user.last_login_at,
        is_active: user.is_active,

        // Subscription
        plan,
        subscription_status: subscription?.status || 'ACTIVE',
        subscription_ends_at: subscription?.ends_at,

        // Usage stats
        usage_stats: {
          cli: {
            used: cliUsage,
            limit: cliLimit,
            remaining: cliLimit === -1 ? Infinity : Math.max(0, cliLimit - cliUsage)
          },
          web: {
            projects: webProjects.length,
            storage_mb: totalStorageMB,
            limit_projects: webProjectsLimit,
            limit_storage: webStorageLimit
          },
          chat: {
            messages_today: chatToday,
            conversations: chatConversations.length,
            daily_limit: chatDailyLimit,
            conversations_limit: chatConversationsLimit
          },
          extension: {
            suggestions_today: extensionToday,
            daily_limit: extensionDailyLimit
          },
          router: {
            requests_monthly: await usageDb.getUserUsage(userId, 'router', 30),
            monthly_limit: routerMonthlyLimit
          }
        },

        // API keys (generate if needed)
        api_keys: {
          cli: await this.getOrCreateApiKey(userId, 'cli'),
          extension: await this.getOrCreateApiKey(userId, 'extension'),
          router: await this.getOrCreateApiKey(userId, 'router'),
        }
      };
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  // Update user profile
  async updateUserProfile(userId: string, updates: {
    name?: string;
    username?: string;
    bio?: string;
    location?: string;
    company?: string;
    avatar_url?: string;
  }): Promise<boolean> {
    try {
      await userDb.update(userId, updates);
      return true;
    } catch (error) {
      console.error('Error updating user profile:', error);
      return false;
    }
  }

  // Change user password
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    try {
      const user = await userDb.findById(userId);
      if (!user) return false;

      // Verify current password
      const isValid = await compare(currentPassword, (user as any).password_hash || '');
      if (!isValid) return false;

      // Hash new password
      const hashedPassword = await hash(newPassword, 12);
      await userDb.update(userId, { password_hash: hashedPassword } as any);

      return true;
    } catch (error) {
      console.error('Error changing password:', error);
      return false;
    }
  }

  // Get web projects for user
  async getWebProjects(userId: string) {
    try {
      const projects = await prisma.generatedApp.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
      return projects;
    } catch (error) {
      console.error('Error getting web projects:', error);
      return [];
    }
  }

  // Get chat conversations for user
  async getChatConversations(userId: string) {
    try {
      const conversations = await prisma.chat.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
      return conversations;
    } catch (error) {
      console.error('Error getting chat conversations:', error);
      return [];
    }
  }

  // Get or create API key for product
  async getOrCreateApiKey(userId: string, productType: 'cli' | 'extension' | 'router'): Promise<string> {
    try {
      return apiKeyManager.generateApiKey(userId, productType);
    } catch (error) {
      console.error('Error generating API key:', error);
      throw error;
    }
  }

  // Regenerate API key
  async regenerateApiKey(userId: string, productType: 'cli' | 'extension' | 'router'): Promise<string> {
    try {
      return apiKeyManager.generateApiKey(userId, productType);
    } catch (error) {
      console.error('Error regenerating API key:', error);
      throw error;
    }
  }

  // Upgrade/downgrade user plan
  async changePlan(userId: string, newPlan: PlanType): Promise<boolean> {
    try {
      await subscriptionDb.updatePlan(userId, newPlan);
      
      // Log the plan change
      await usageDb.logUsage({
        user_id: userId,
        product: 'platform',
        action: 'plan_change',
        metadata: { new_plan: newPlan }
      });

      return true;
    } catch (error) {
      console.error('Error changing plan:', error);
      return false;
    }
  }

  // Get user settings
  async getUserSettings(userId: string): Promise<UserSettings> {
    // For now, return default settings
    // TODO: Store in database
    return {
      theme: 'light',
      language: 'en',
      timezone: 'UTC',
      notifications: {
        email: true,
        push: false,
        marketing: false,
      },
      preferences: {
        default_model: 'claude-3-sonnet',
        code_style: 'typescript',
        enable_analytics: true,
        enable_telemetry: true,
      },
      privacy: {
        profile_public: false,
        projects_public: false,
        show_activity: false,
      }
    };
  }

  // Update user settings
  async updateUserSettings(userId: string, settings: Partial<UserSettings>): Promise<boolean> {
    try {
      // TODO: Store in database
      console.log('Updated settings for user:', userId, settings);
      return true;
    } catch (error) {
      console.error('Error updating settings:', error);
      return false;
    }
  }

  // Delete user account
  async deleteAccount(userId: string, password: string): Promise<boolean> {
    try {
      const user = await userDb.findById(userId);
      if (!user) return false;

      // Verify password for security
      const isValid = await compare(password, (user as any).password_hash || '');
      if (!isValid) return false;

      // Soft delete by deactivating account
      await userDb.update(userId, { is_active: false });

      // Log account deletion
      await usageDb.logUsage({
        user_id: userId,
        product: 'platform',
        action: 'account_deleted',
        metadata: { deleted_at: new Date().toISOString() }
      });

      return true;
    } catch (error) {
      console.error('Error deleting account:', error);
      return false;
    }
  }

  // Get user activity log
  async getUserActivity(userId: string, limit: number = 50): Promise<any[]> {
    try {
      // Get recent usage logs
      const logs = await usageDb.getUserUsage(userId, 'all', 7); // Last 7 days
      // TODO: Format and return activity data
      return [];
    } catch (error) {
      console.error('Error getting user activity:', error);
      return [];
    }
  }

  // Check if user can perform action
  async canPerformAction(userId: string, action: {
    product: string;
    action: string;
    resourceCount?: number;
  }): Promise<{ allowed: boolean; reason?: string; usage?: any }> {
    try {
      const featureMap = {
        'cli.generate': 'requests_per_month',
        'web.create_project': 'projects_max',
        'web.upload_file': 'storage_mb',
        'chat.send_message': 'messages_per_day',
        'chat.create_conversation': 'conversations_max',
        'extension.suggestion': 'suggestions_per_day',
        'router.route_request': 'requests_per_month',
      };

      const feature = featureMap[`${action.product}.${action.action}` as keyof typeof featureMap];
      if (!feature) {
        return { allowed: true }; // Unknown action, allow by default
      }

      const usage = await usageDb.checkUsageLimit(userId, action.product, feature);
      
      if (!usage.canUse) {
        return {
          allowed: false,
          reason: `${feature} limit exceeded`,
          usage
        };
      }

      return { allowed: true, usage };
    } catch (error) {
      console.error('Error checking user permissions:', error);
      return { allowed: false, reason: 'Error checking permissions' };
    }
  }

  // Get user dashboard data
  async getDashboardData(userId: string): Promise<any> {
    try {
      const profile = await this.getUserProfile(userId);
      if (!profile) return null;

      // Get recent projects
      const recentProjects = await this.getWebProjects(userId);
      
      // Get recent conversations
      const recentConversations = await this.getChatConversations(userId);

      // Calculate usage trends (simplified)
      const usageTrend = {
        cli: await usageDb.getUserUsage(userId, 'cli', 7),
        web: await usageDb.getUserUsage(userId, 'web', 7),
        chat: await usageDb.getUserUsage(userId, 'chat', 7),
        extension: await usageDb.getUserUsage(userId, 'extension', 7),
      };

      return {
        profile,
        recentProjects,
        recentConversations,
        usageTrend,
        notifications: [], // TODO: Implement notifications
        announcements: [], // TODO: Implement announcements
      };
    } catch (error) {
      console.error('Error getting dashboard data:', error);
      return null;
    }
  }
}

// Export singleton instance
export const userManager = new UserManager();

// Helper functions for common operations
export const userHelpers = {
  // Validate email format
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Validate username format
  isValidUsername(username: string): boolean {
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    return usernameRegex.test(username);
  },

  // Generate avatar URL
  generateAvatarUrl(name: string): string {
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
  },

  // Format plan display name
  formatPlanName(plan: PlanType): string {
    return {
      FREE: 'Free',
      PRO: 'Pro',
      ENTERPRISE: 'Enterprise'
    }[plan];
  },

  // Get plan color for UI
  getPlanColor(plan: PlanType): string {
    return {
      FREE: 'gray',
      PRO: 'blue',
      ENTERPRISE: 'purple'
    }[plan];
  },

  // Format usage percentage
  formatUsagePercentage(used: number, limit: number): number {
    if (limit === -1) return 0; // Unlimited
    return Math.min(100, Math.round((used / limit) * 100));
  },

  // Check if usage is near limit
  isNearLimit(used: number, limit: number, threshold: number = 0.8): boolean {
    if (limit === -1) return false; // Unlimited
    return used >= (limit * threshold);
  }
};