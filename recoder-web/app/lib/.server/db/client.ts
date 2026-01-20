/**
 * Database Client for Neon PostgreSQL
 * Handles connections and queries for subscription management
 */

import { neon } from '@neondatabase/serverless';

let cachedDb: any = null;

/**
 * Get database connection
 */
export function getDatabase(env: Env) {
  if (cachedDb) {
    return cachedDb;
  }

  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL not configured');
  }

  const sql = neon(databaseUrl);

  cachedDb = {
    // Execute raw SQL query
    execute: async (query: string, params: any[] = []) => {
      // Note: Neon's sql function expects template literals, not string + params
      // For raw SQL execution, we need to use the sql function directly
      // This is a workaround for the type system
      const result = await (sql as any)(query, params);
      return result as Record<string, any>[];
    },

    // Get user by email
    getUserByEmail: async (email: string) => {
      const result = await sql`
        SELECT * FROM users WHERE email = ${email} LIMIT 1
      ` as Record<string, any>[];
      return result[0] || null;
    },

    // Create or get user
    createUser: async (email: string, name?: string) => {
      const result = await sql`
        INSERT INTO users (email, name)
        VALUES (${email}, ${name || email.split('@')[0]})
        ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
        RETURNING *
      ` as Record<string, any>[];
      return result[0];
    },

    // Get active subscription for user
    getUserSubscription: async (userId: string) => {
      const result = await sql`
        SELECT * FROM subscriptions
        WHERE user_id = ${userId}
        AND status IN ('active', 'trialing')
        ORDER BY created_at DESC
        LIMIT 1
      ` as Record<string, any>[];
      return result[0] || null;
    },

    // Check if user has active subscription
    hasActiveSubscription: async (userId: string) => {
      const subscription = await cachedDb.getUserSubscription(userId);
      return !!subscription;
    },

    // Get user usage this month
    getUserUsage: async (userId: string) => {
      const subscription = await cachedDb.getUserSubscription(userId);
      if (!subscription) {
        return { used: 0, limit: 100 }; // Free tier default
      }

      return {
        used: subscription.monthly_requests_used || 0,
        limit: subscription.monthly_request_limit || 100
      };
    },

    // Check if user can make request
    canMakeRequest: async (userId: string): Promise<boolean> => {
      const usage = await cachedDb.getUserUsage(userId);
      return usage.used < usage.limit;
    },

    // Increment usage count
    incrementUsage: async (userId: string, modelUsed: string, cost: number) => {
      // Update subscription usage
      await sql`
        UPDATE subscriptions
        SET monthly_requests_used = monthly_requests_used + 1
        WHERE user_id = ${userId}
        AND status IN ('active', 'trialing')
      `;

      // Log usage
      await sql`
        INSERT INTO usage_logs (
          user_id, model_used, tokens_used, cost_estimated
        ) VALUES (
          ${userId}, ${modelUsed}, 0, ${cost}
        )
      `;
    },

    // Reset monthly usage (called by cron)
    resetMonthlyUsage: async () => {
      await sql`
        UPDATE subscriptions
        SET
          monthly_requests_used = 0,
          last_reset_at = NOW()
        WHERE
          status = 'active'
          AND DATE_PART('day', NOW() - last_reset_at) >= 30
      `;
    },

    // Get payment history
    getPaymentHistory: async (userId: string, limit: number = 10) => {
      const result = await sql`
        SELECT * FROM payment_transactions
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return result as Record<string, any>[];
    },

    // Store webhook event
    storeWebhookEvent: async (provider: string, eventType: string, eventId: string, payload: any) => {
      await sql`
        INSERT INTO webhook_events (provider, event_type, event_id, payload)
        VALUES (${provider}, ${eventType}, ${eventId}, ${JSON.stringify(payload)})
      `;
    },

    // Mark webhook as processed
    markWebhookProcessed: async (eventId: string, error?: string) => {
      if (error) {
        await sql`
          UPDATE webhook_events
          SET
            processed = true,
            processed_at = NOW(),
            error_message = ${error},
            retry_count = retry_count + 1
          WHERE event_id = ${eventId}
        `;
      } else {
        await sql`
          UPDATE webhook_events
          SET processed = true, processed_at = NOW()
          WHERE event_id = ${eventId}
        `;
      }
    }
  };

  return cachedDb;
}

/**
 * Initialize database schema
 */
export async function initializeDatabase(env: Env) {
  const db = getDatabase(env);

  console.log('🔧 Initializing database schema...');

  try {
    // Read and execute schema.sql
    // In production, this should be done via migrations
    // For now, we'll just ensure tables exist with basic CREATE IF NOT EXISTS

    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(20) NOT NULL CHECK (provider IN ('paddle', 'dodopay')),
        subscription_id VARCHAR(255) UNIQUE NOT NULL,
        customer_id VARCHAR(255) NOT NULL,
        plan_id VARCHAR(50) NOT NULL CHECK (plan_id IN ('free', 'pro', 'enterprise')),
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        amount DECIMAL(10, 2),
        currency VARCHAR(3) DEFAULT 'USD',
        current_period_start TIMESTAMP NOT NULL,
        current_period_end TIMESTAMP NOT NULL,
        cancel_at_period_end BOOLEAN DEFAULT FALSE,
        cancelled_at TIMESTAMP,
        trial_end TIMESTAMP,
        monthly_request_limit INTEGER NOT NULL DEFAULT 100,
        monthly_requests_used INTEGER NOT NULL DEFAULT 0,
        last_reset_at TIMESTAMP DEFAULT NOW(),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT unique_user_subscription UNIQUE (user_id)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS usage_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
        action_type VARCHAR(50),
        tokens_used INTEGER DEFAULT 0,
        cost_estimated DECIMAL(10, 4) DEFAULT 0,
        model_used VARCHAR(100),
        optimization_strategy VARCHAR(50),
        request_data JSONB,
        response_data JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
        provider VARCHAR(20) NOT NULL,
        transaction_id VARCHAR(255) UNIQUE NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
        payment_method VARCHAR(50),
        receipt_url TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider VARCHAR(20) NOT NULL,
        event_id VARCHAR(255) UNIQUE NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        processed BOOLEAN DEFAULT FALSE,
        processed_at TIMESTAMP,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes if they don't exist
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed, created_at)`);

    console.log(' Database schema initialized successfully');
  } catch (error) {
    console.error('L Database initialization failed:', error);
    throw error;
  }
}
