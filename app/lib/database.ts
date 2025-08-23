/**
 * Database connection and models for recoder.xyz
 * Handles users, subscriptions, CLI sessions, and billing data
 */

export type PlanType = 'free' | 'pro' | 'enterprise';

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash?: string;
  subscription_plan: 'free' | 'pro' | 'enterprise';
  subscription_status: 'active' | 'inactive' | 'canceled' | 'past_due';
  subscription_id?: string; // DODO Pay subscription ID
  quota: {
    requests_remaining: number;
    requests_limit: number;
    reset_date: string;
  };
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
  email_verified: boolean;
  onboarding_completed: boolean;
}

export interface CLISession {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  device_name?: string;
  device_type?: string;
  expires_at: Date;
  created_at: Date;
  last_used: Date;
  is_active: boolean;
  platform_data?: {
    web_session_id?: string;
    router_session_id?: string;
    last_sync: Date;
  };
}

export interface APIKey {
  id: string;
  user_id: string;
  key_hash: string;
  key_prefix: string; // First 8 chars for display (rck_xxxx)
  name: string;
  permissions: string[]; // ['cli:full', 'api:read', etc.]
  last_used?: Date;
  expires_at?: Date;
  created_at: Date;
  is_active: boolean;
  usage_count: number;
}

export interface DeviceFlow {
  id: string;
  device_code: string;
  user_code: string;
  client_id: string;
  scope: string;
  user_id?: string;
  status: 'pending' | 'authorized' | 'denied' | 'expired' | 'completed';
  expires_at: Date;
  created_at: Date;
  authorized_at?: Date;
  denied_at?: Date;
  user_data?: any;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'inactive' | 'canceled' | 'past_due';
  dodo_pay_subscription_id?: string;
  dodo_pay_customer_id?: string;
  current_period_start: Date;
  current_period_end: Date;
  quota_limit: number;
  features: string[]; // ['cli_access', 'router_optimization', 'priority_support']
  billing_amount: number;
  billing_currency: string;
  created_at: Date;
  updated_at: Date;
}

export interface UsageRecord {
  id: string;
  user_id: string;
  session_id?: string;
  request_type: 'cli' | 'api' | 'web' | 'router';
  endpoint: string;
  tokens_used?: number;
  cost?: number;
  model_used?: string;
  provider_used?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface BillingEvent {
  id: string;
  user_id: string;
  subscription_id: string;
  event_type: 'payment_success' | 'payment_failed' | 'subscription_created' | 'subscription_canceled' | 'quota_exceeded';
  amount?: number;
  currency?: string;
  dodo_pay_event_id?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface RouterSession {
  id: string;
  user_id: string;
  router_instance_id: string;
  api_key_pool: string[];
  cost_savings: {
    total_saved: number;
    percentage_saved: number;
    period_start: Date;
    period_end: Date;
  };
  optimization_settings: {
    enable_consensus: boolean;
    enable_cost_optimization: boolean;
    max_retries: number;
    preferred_providers: string[];
  };
  created_at: Date;
  last_active: Date;
  is_active: boolean;
}

// Database connection and CRUD operations
export class DatabaseService {
  private users: Map<string, User> = new Map();
  private cliSessions: Map<string, CLISession> = new Map();
  private apiKeys: Map<string, APIKey> = new Map();
  private deviceFlows: Map<string, DeviceFlow> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private usageRecords: UsageRecord[] = [];
  private billingEvents: BillingEvent[] = [];
  private routerSessions: Map<string, RouterSession> = new Map();

  constructor() {
    this.initializeDemoData();
  }

  private initializeDemoData() {
    // Demo user with pro subscription
    const demoUser: User = {
      id: 'demo_user_1',
      email: 'demo@recoder.xyz',
      name: 'Demo User',
      subscription_plan: 'pro',
      subscription_status: 'active',
      quota: {
        requests_remaining: 5000,
        requests_limit: 5000,
        reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      created_at: new Date(),
      updated_at: new Date(),
      email_verified: true,
      onboarding_completed: true
    };

    // Demo subscription
    const demoSubscription: Subscription = {
      id: 'sub_demo_1',
      user_id: 'demo_user_1',
      plan: 'pro',
      status: 'active',
      current_period_start: new Date(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      quota_limit: 5000,
      features: ['cli_access', 'router_optimization', 'priority_support'],
      billing_amount: 29.99,
      billing_currency: 'USD',
      created_at: new Date(),
      updated_at: new Date()
    };

    // Demo API key
    const demoApiKey: APIKey = {
      id: 'api_key_demo_1',
      user_id: 'demo_user_1',
      key_hash: 'hashed_demo_key',
      key_prefix: 'rck_demo',
      name: 'Demo CLI Key',
      permissions: ['cli:full', 'api:read'],
      created_at: new Date(),
      is_active: true,
      usage_count: 0
    };

    this.users.set(demoUser.id, demoUser);
    this.subscriptions.set(demoSubscription.id, demoSubscription);
    this.apiKeys.set('rck_demo_key_12345678', demoApiKey);
  }

  // User operations
  async createUser(userData: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    const user: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date(),
      updated_at: new Date(),
      ...userData
    };
    
    this.users.set(user.id, user);
    return user;
  }

  async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;

    const updatedUser = { ...user, ...updates, updated_at: new Date() };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // CLI Session operations
  async createCLISession(sessionData: Omit<CLISession, 'id' | 'created_at' | 'last_used'>): Promise<CLISession> {
    const session: CLISession = {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date(),
      last_used: new Date(),
      ...sessionData
    };
    
    this.cliSessions.set(session.access_token, session);
    return session;
  }

  async getCLISessionByToken(token: string): Promise<CLISession | null> {
    return this.cliSessions.get(token) || null;
  }

  async updateCLISession(token: string, updates: Partial<CLISession>): Promise<CLISession | null> {
    const session = this.cliSessions.get(token);
    if (!session) return null;

    const updatedSession = { ...session, ...updates, last_used: new Date() };
    this.cliSessions.set(token, updatedSession);
    return updatedSession;
  }

  async deleteCLISession(token: string): Promise<boolean> {
    return this.cliSessions.delete(token);
  }

  // API Key operations
  async createAPIKey(keyData: Omit<APIKey, 'id' | 'created_at'>): Promise<APIKey> {
    const apiKey: APIKey = {
      id: `api_key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date(),
      ...keyData
    };
    
    this.apiKeys.set(apiKey.key_hash, apiKey);
    return apiKey;
  }

  async getAPIKey(keyHash: string): Promise<APIKey | null> {
    return this.apiKeys.get(keyHash) || null;
  }

  async updateAPIKey(keyHash: string, updates: Partial<APIKey>): Promise<APIKey | null> {
    const apiKey = this.apiKeys.get(keyHash);
    if (!apiKey) return null;

    const updatedKey = { ...apiKey, ...updates };
    this.apiKeys.set(keyHash, updatedKey);
    return updatedKey;
  }

  // Device Flow operations
  async createDeviceFlow(flowData: Omit<DeviceFlow, 'id' | 'created_at'>): Promise<DeviceFlow> {
    const deviceFlow: DeviceFlow = {
      id: `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date(),
      ...flowData
    };
    
    this.deviceFlows.set(deviceFlow.device_code, deviceFlow);
    return deviceFlow;
  }

  async getDeviceFlow(deviceCode: string): Promise<DeviceFlow | null> {
    return this.deviceFlows.get(deviceCode) || null;
  }

  async getDeviceFlowByUserCode(userCode: string): Promise<DeviceFlow | null> {
    for (const flow of this.deviceFlows.values()) {
      if (flow.user_code === userCode) {
        return flow;
      }
    }
    return null;
  }

  async updateDeviceFlow(deviceCode: string, updates: Partial<DeviceFlow>): Promise<DeviceFlow | null> {
    const flow = this.deviceFlows.get(deviceCode);
    if (!flow) return null;

    const updatedFlow = { ...flow, ...updates };
    this.deviceFlows.set(deviceCode, updatedFlow);
    return updatedFlow;
  }

  async deleteDeviceFlow(deviceCode: string): Promise<boolean> {
    return this.deviceFlows.delete(deviceCode);
  }

  // Subscription operations
  async createSubscription(subData: Omit<Subscription, 'id' | 'created_at' | 'updated_at'>): Promise<Subscription> {
    const subscription: Subscription = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date(),
      updated_at: new Date(),
      ...subData
    };
    
    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  async getSubscriptionByUserId(userId: string): Promise<Subscription | null> {
    for (const sub of this.subscriptions.values()) {
      if (sub.user_id === userId) {
        return sub;
      }
    }
    return null;
  }

  async updateSubscription(id: string, updates: Partial<Subscription>): Promise<Subscription | null> {
    const subscription = this.subscriptions.get(id);
    if (!subscription) return null;

    const updatedSub = { ...subscription, ...updates, updated_at: new Date() };
    this.subscriptions.set(id, updatedSub);
    return updatedSub;
  }

  // Usage tracking
  async recordUsage(usageData: Omit<UsageRecord, 'id' | 'timestamp'>): Promise<UsageRecord> {
    const record: UsageRecord = {
      id: `usage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...usageData
    };
    
    this.usageRecords.push(record);
    return record;
  }

  async getUsageByUser(userId: string, startDate?: Date, endDate?: Date): Promise<UsageRecord[]> {
    return this.usageRecords.filter(record => {
      if (record.user_id !== userId) return false;
      if (startDate && record.timestamp < startDate) return false;
      if (endDate && record.timestamp > endDate) return false;
      return true;
    });
  }

  // Billing events
  async recordBillingEvent(eventData: Omit<BillingEvent, 'id' | 'timestamp'>): Promise<BillingEvent> {
    const event: BillingEvent = {
      id: `billing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...eventData
    };
    
    this.billingEvents.push(event);
    return event;
  }

  // Router session operations
  async createRouterSession(sessionData: Omit<RouterSession, 'id' | 'created_at' | 'last_active'>): Promise<RouterSession> {
    const session: RouterSession = {
      id: `router_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date(),
      last_active: new Date(),
      ...sessionData
    };
    
    this.routerSessions.set(session.id, session);
    return session;
  }

  async getRouterSessionsByUser(userId: string): Promise<RouterSession[]> {
    return Array.from(this.routerSessions.values()).filter(session => session.user_id === userId);
  }

  // Analytics and reporting
  async getUserStats(userId: string): Promise<any> {
    const user = await this.getUserById(userId);
    const subscription = await this.getSubscriptionByUserId(userId);
    const usageRecords = await this.getUsageByUser(userId);
    const routerSessions = await this.getRouterSessionsByUser(userId);

    const totalRequests = usageRecords.length;
    const totalCost = usageRecords.reduce((sum, record) => sum + (record.cost || 0), 0);
    const totalSavings = routerSessions.reduce((sum, session) => sum + session.cost_savings.total_saved, 0);

    return {
      user,
      subscription,
      usage: {
        total_requests: totalRequests,
        total_cost: totalCost,
        cost_savings: totalSavings,
        requests_this_month: usageRecords.filter(r => 
          r.timestamp > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        ).length
      },
      router_stats: {
        active_sessions: routerSessions.filter(s => s.is_active).length,
        total_savings: totalSavings
      }
    };
  }
}

// Singleton database instance
export const db = new DatabaseService();

// Export userDb for compatibility with session-sync
export const userDb = {
  findByEmail: (email: string) => db.getUserByEmail(email),
  findById: (id: string) => db.getUserById(id),
  create: (userData: any) => db.createUser(userData),
  update: (id: string, userData: any) => db.updateUser(id, userData),
  delete: async (id: string) => {
    // Mock delete function
    return false;
  }
};