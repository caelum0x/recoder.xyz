// Simplified user management for Chat Platform
import { getUser } from '@/lib/db/queries';

type PlanType = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
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
}

export class UserManager {
  // Get complete user profile with all data
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      // Get basic user data from Chat Platform's database
      const users = await getUser(userId);
      if (!users || users.length === 0) return null;
      
      const user = users[0];

      return {
        id: user.id,
        email: user.email,
        name: user.email.split('@')[0], // Simple fallback
        avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.email)}`,
        username: user.email.split('@')[0],
        bio: undefined,
        location: undefined,
        company: undefined,
        email_verified: true,
        created_at: new Date(),
        updated_at: new Date(),
        last_login_at: undefined,
        is_active: true,

        // Subscription (all FREE for chat platform)
        plan: 'FREE',
        subscription_status: 'ACTIVE',
        subscription_ends_at: undefined,

        // Usage stats (simplified for chat platform)
        usage_stats: {
          cli: { used: 0, limit: 0, remaining: 0 },
          web: { projects: 0, storage_mb: 0, limit_projects: 0, limit_storage: 0 },
          chat: {
            messages_today: 0,
            conversations: 0,
            daily_limit: 100,
            conversations_limit: 10
          },
          extension: { suggestions_today: 0, daily_limit: 0 },
          router: { requests_monthly: 0, monthly_limit: 0 }
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
      // Chat platform doesn't support profile updates in current schema
      console.log('Profile update requested for user:', userId, updates);
      return true;
    } catch (error) {
      console.error('Error updating user profile:', error);
      return false;
    }
  }
}

// Export singleton instance
export const userManager = new UserManager();