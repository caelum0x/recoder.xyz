// Chat Platform Database Connection and Operations
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { user, chat, message, vote, document, suggestion } from './db/schema';
import { eq, desc, and, count } from 'drizzle-orm';

// Database connection
const connection = postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(connection);

// Types from schema
export type PlanType = 'FREE' | 'PRO' | 'ENTERPRISE';

// Database operations compatible with root database API
export const userDb = {
  async create(userData: {
    email: string;
    name: string;
    avatar_url?: string;
    provider_id?: string;
    provider?: string;
  }) {
    const result = await db.insert(user).values({
      email: userData.email,
      password: null,
    }).returning();
    
    return {
      id: result[0].id,
      email: result[0].email,
      name: userData.name,
      avatar_url: userData.avatar_url,
      email_verified: true,
    };
  },

  async findByEmail(email: string) {
    const result = await db.select().from(user).where(eq(user.email, email)).limit(1);
    if (!result.length) return null;
    
    return {
      id: result[0].id,
      email: result[0].email,
      name: email.split('@')[0], // Simple fallback
      avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(email)}`,
      email_verified: true,
      password_hash: result[0].password,
    };
  },

  async findById(id: string) {
    const result = await db.select().from(user).where(eq(user.id, id)).limit(1);
    if (!result.length) return null;
    
    return {
      id: result[0].id,
      email: result[0].email,
      name: result[0].email.split('@')[0],
      avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(result[0].email)}`,
      email_verified: true,
    };
  },

  async update(id: string, updates: any) {
    const result = await db.update(user)
      .set(updates)
      .where(eq(user.id, id))
      .returning();
    
    return result[0];
  },

  async updateLastLogin(id: string) {
    // Chat platform doesn't track last login in current schema
    // This is a no-op for compatibility
  }
};

export const subscriptionDb = {
  async getUserPlan(userId: string): Promise<PlanType> {
    // For now, all chat users get FREE plan
    // TODO: Integrate with actual subscription system
    return 'FREE';
  },

  async getUserSubscription(userId: string) {
    // Return a mock FREE subscription for compatibility
    return {
      id: 'chat-free-' + userId,
      user_id: userId,
      plan_type: 'FREE' as PlanType,
      status: 'ACTIVE' as const,
      starts_at: new Date(),
      ends_at: null,
      cancelled_at: null,
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    };
  },

  async updatePlan(userId: string, planType: PlanType) {
    // TODO: Implement actual plan updates
    console.log(`Plan update request for user ${userId} to ${planType}`);
  }
};

export const usageDb = {
  async logUsage(data: {
    user_id: string;
    product: string;
    action: string;
    resource_type?: string;
    resource_count?: number;
    metadata?: Record<string, any>;
  }) {
    // TODO: Implement usage tracking
    console.log('Usage logged:', data);
  },

  async getUserUsage(userId: string, product: string, days: number = 30): Promise<number> {
    // Count user's messages in the last N days
    const result = await db.select({ count: count() })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(and(
        eq(chat.userId, userId),
        // Add date filter when we have proper timestamps
      ));
    
    return result[0]?.count || 0;
  },

  async getUserLimit(userId: string, product: string, feature: string): Promise<number> {
    // Basic limits for FREE plan
    const limits = {
      'messages_per_day': 100,
      'conversations_max': 10,
    };
    
    return limits[feature as keyof typeof limits] || 50;
  },

  async checkUsageLimit(userId: string, product: string, feature: string) {
    const usage = await this.getUserUsage(userId, product, 1);
    const limit = await this.getUserLimit(userId, product, feature);
    
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

export const chatDb = {
  async getUserConversations(userId: string) {
    const result = await db.select()
      .from(chat)
      .where(eq(chat.userId, userId))
      .orderBy(desc(chat.createdAt))
      .limit(50);
    
    return result;
  },

  async createConversation(data: {
    user_id: string;
    title?: string;
    model_provider: string;
    model_name: string;
    system_prompt?: string;
    settings?: Record<string, any>;
  }) {
    const result = await db.insert(chat).values({
      userId: data.user_id,
      title: data.title || 'New Chat',
      createdAt: new Date(),
    }).returning();
    
    return result[0];
  },

  async addMessage(data: {
    conversation_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, any>;
    token_count?: number;
  }) {
    await db.insert(message).values({
      chatId: data.conversation_id,
      role: data.role,
      parts: [{ type: 'text', text: data.content }],
      attachments: [],
      createdAt: new Date(),
    });
  }
};

// PlanType is already exported above