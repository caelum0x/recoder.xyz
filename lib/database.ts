// Unified database connection and utilities for Recoder.xyz
import { Pool, PoolClient } from 'pg';
import { z } from 'zod';

// Database configuration
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Global connection pool
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(dbConfig);
    
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });
    
    pool.on('connect', () => {
      console.log('Connected to PostgreSQL database');
    });
  }
  
  return pool;
}

// Database client wrapper with error handling
export async function withDatabase<T>(
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  
  try {
    return await operation(client);
  } catch (error) {
    console.error('Database operation failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Transaction wrapper
export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withDatabase(async (client) => {
    await client.query('BEGIN');
    
    try {
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

// Type definitions
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

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  project_type: string;
  template_id?: string;
  settings: Record<string, any>;
  file_count: number;
  storage_used_mb: number;
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ChatConversation {
  id: string;
  user_id: string;
  title?: string;
  model_provider: string;
  model_name: string;
  system_prompt?: string;
  settings: Record<string, any>;
  message_count: number;
  created_at: Date;
  updated_at: Date;
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
    return withTransaction(async (client) => {
      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, name, avatar_url, email_verified)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userData.email, userData.name, userData.avatar_url, true]
      );
      
      const user = userResult.rows[0];
      
      // Create default FREE subscription
      await client.query(
        `INSERT INTO subscriptions (user_id, plan_type, status)
         VALUES ($1, 'FREE', 'ACTIVE')`,
        [user.id]
      );
      
      return user;
    });
  },

  async findByEmail(email: string): Promise<User | null> {
    return withDatabase(async (client) => {
      const result = await client.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      return result.rows[0] || null;
    });
  },

  async findById(id: string): Promise<User | null> {
    return withDatabase(async (client) => {
      const result = await client.query(
        'SELECT * FROM users WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    });
  },

  async update(id: string, updates: Partial<User>): Promise<User> {
    return withDatabase(async (client) => {
      const setClause = Object.keys(updates)
        .map((key, index) => `${key} = $${index + 2}`)
        .join(', ');
      
      const values = [id, ...Object.values(updates)];
      
      const result = await client.query(
        `UPDATE users SET ${setClause}, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        values
      );
      
      return result.rows[0];
    });
  },

  async updateLastLogin(id: string): Promise<void> {
    await withDatabase(async (client) => {
      await client.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [id]
      );
    });
  }
};

// Subscription management functions
export const subscriptionDb = {
  async getUserPlan(userId: string): Promise<PlanType> {
    return withDatabase(async (client) => {
      const result = await client.query(
        'SELECT get_user_plan($1) as plan_type',
        [userId]
      );
      return result.rows[0]?.plan_type || 'FREE';
    });
  },

  async getUserSubscription(userId: string): Promise<Subscription | null> {
    return withDatabase(async (client) => {
      const result = await client.query(
        `SELECT * FROM subscriptions 
         WHERE user_id = $1 AND status = 'ACTIVE'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      return result.rows[0] || null;
    });
  },

  async updatePlan(userId: string, planType: PlanType): Promise<void> {
    await withTransaction(async (client) => {
      // Deactivate current subscription
      await client.query(
        `UPDATE subscriptions 
         SET status = 'CANCELLED', cancelled_at = NOW()
         WHERE user_id = $1 AND status = 'ACTIVE'`,
        [userId]
      );
      
      // Create new subscription
      await client.query(
        `INSERT INTO subscriptions (user_id, plan_type, status)
         VALUES ($1, $2, 'ACTIVE')`,
        [userId, planType]
      );
    });
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
    await withDatabase(async (client) => {
      await client.query(
        `INSERT INTO usage_logs (user_id, product, action, resource_type, resource_count, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          data.user_id,
          data.product,
          data.action,
          data.resource_type || null,
          data.resource_count || 1,
          JSON.stringify(data.metadata || {})
        ]
      );
    });
  },

  async getUserUsage(userId: string, product: string, days: number = 30): Promise<number> {
    return withDatabase(async (client) => {
      const result = await client.query(
        `SELECT get_user_usage($1, $2, $3::interval) as usage_count`,
        [userId, product, `${days} days`]
      );
      return result.rows[0]?.usage_count || 0;
    });
  },

  async getUserLimit(userId: string, product: string, feature: string): Promise<number> {
    return withDatabase(async (client) => {
      const result = await client.query(
        'SELECT get_user_limit($1, $2, $3) as limit_value',
        [userId, product, feature]
      );
      return result.rows[0]?.limit_value || 0;
    });
  },

  async checkUsageLimit(userId: string, product: string, feature: string): Promise<{
    canUse: boolean;
    usage: number;
    limit: number;
    remaining: number;
  }> {
    const [usage, limit] = await Promise.all([
      this.getUserUsage(userId, product, 30),
      this.getUserLimit(userId, product, feature)
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

// Project management functions
export const projectDb = {
  async create(data: {
    user_id: string;
    name: string;
    description?: string;
    project_type: string;
    template_id?: string;
    settings?: Record<string, any>;
  }): Promise<Project> {
    return withDatabase(async (client) => {
      const result = await client.query(
        `INSERT INTO projects (user_id, name, description, project_type, template_id, settings)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          data.user_id,
          data.name,
          data.description || null,
          data.project_type,
          data.template_id || null,
          JSON.stringify(data.settings || {})
        ]
      );
      return result.rows[0];
    });
  },

  async getUserProjects(userId: string, limit: number = 50): Promise<Project[]> {
    return withDatabase(async (client) => {
      const result = await client.query(
        `SELECT * FROM projects 
         WHERE user_id = $1 
         ORDER BY updated_at DESC 
         LIMIT $2`,
        [userId, limit]
      );
      return result.rows;
    });
  },

  async findById(id: string, userId: string): Promise<Project | null> {
    return withDatabase(async (client) => {
      const result = await client.query(
        'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      return result.rows[0] || null;
    });
  },

  async update(id: string, userId: string, updates: Partial<Project>): Promise<Project> {
    return withDatabase(async (client) => {
      const setClause = Object.keys(updates)
        .map((key, index) => `${key} = $${index + 3}`)
        .join(', ');
      
      const values = [id, userId, ...Object.values(updates)];
      
      const result = await client.query(
        `UPDATE projects SET ${setClause}, updated_at = NOW()
         WHERE id = $1 AND user_id = $2 RETURNING *`,
        values
      );
      
      return result.rows[0];
    });
  },

  async delete(id: string, userId: string): Promise<boolean> {
    return withDatabase(async (client) => {
      const result = await client.query(
        'DELETE FROM projects WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      return result.rowCount > 0;
    });
  }
};

// Chat conversation functions
export const chatDb = {
  async createConversation(data: {
    user_id: string;
    title?: string;
    model_provider: string;
    model_name: string;
    system_prompt?: string;
    settings?: Record<string, any>;
  }): Promise<ChatConversation> {
    return withDatabase(async (client) => {
      const result = await client.query(
        `INSERT INTO chat_conversations (user_id, title, model_provider, model_name, system_prompt, settings)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          data.user_id,
          data.title || null,
          data.model_provider,
          data.model_name,
          data.system_prompt || null,
          JSON.stringify(data.settings || {})
        ]
      );
      return result.rows[0];
    });
  },

  async getUserConversations(userId: string, limit: number = 50): Promise<ChatConversation[]> {
    return withDatabase(async (client) => {
      const result = await client.query(
        `SELECT * FROM chat_conversations 
         WHERE user_id = $1 
         ORDER BY updated_at DESC 
         LIMIT $2`,
        [userId, limit]
      );
      return result.rows;
    });
  },

  async addMessage(data: {
    conversation_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, any>;
    token_count?: number;
  }): Promise<void> {
    await withTransaction(async (client) => {
      // Add message
      await client.query(
        `INSERT INTO chat_messages (conversation_id, role, content, metadata, token_count)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          data.conversation_id,
          data.role,
          data.content,
          JSON.stringify(data.metadata || {}),
          data.token_count || null
        ]
      );
      
      // Update conversation message count
      await client.query(
        `UPDATE chat_conversations 
         SET message_count = message_count + 1, updated_at = NOW()
         WHERE id = $1`,
        [data.conversation_id]
      );
    });
  }
};

// System configuration functions
export const configDb = {
  async get(key: string): Promise<any> {
    return withDatabase(async (client) => {
      const result = await client.query(
        'SELECT value FROM system_config WHERE key = $1',
        [key]
      );
      return result.rows[0]?.value || null;
    });
  },

  async set(key: string, value: any): Promise<void> {
    await withDatabase(async (client) => {
      await client.query(
        `INSERT INTO system_config (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, JSON.stringify(value)]
      );
    });
  }
};

// Health check function
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await withDatabase(async (client) => {
      await client.query('SELECT 1');
    });
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// Cleanup function for graceful shutdown
export async function closeDatabaseConnections(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}