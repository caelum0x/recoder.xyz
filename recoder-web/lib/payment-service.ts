/**
 * Unified Payment Service for Recoder.xyz
 * Handles subscriptions, usage tracking, and billing across all platforms
 */

import { create } from 'zustand';

// Payment Service Configuration
const PAYMENT_API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

// Types
export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  price_formatted: string;
  limits: {
    tokens: number;
    requests: number;
  };
  features: string[];
  cost_limit: number;
  profit_margin: number;
}

export interface UserSubscription {
  id: string;
  plan_id: string;
  plan_name: string;
  status: 'active' | 'pending_payment' | 'cancelled' | 'past_due';
  amount: number;
  currency: string;
  created_at: string;
  next_billing_date?: string;
  limits: {
    tokens: number;
    requests: number;
  };
  usage: {
    tokens: number;
    requests: number;
    models_used: string[];
  };
}

export interface UsageStats {
  usage: {
    tokens: number;
    requests: number;
    models_used: string[];
  };
  cost: {
    monthly: number;
    limit: number;
    percentage: number;
  };
  limits: {
    tokens: number;
    requests: number;
  };
  subscription: {
    plan: string;
    status: string;
  } | null;
  warnings: {
    high_usage: boolean;
    high_cost: boolean;
    approaching_limit: boolean;
  };
}

export interface PaymentLink {
  subscription_id: string;
  payment_link_id: string;
  payment_link: string;
  amount: number;
  currency: string;
  plan: {
    id: string;
    name: string;
    price: number;
    limits: {
      tokens: number;
      requests: number;
    };
  };
  expires_at: string;
}

// Payment Store
interface PaymentStore {
  // State
  plans: SubscriptionPlan[];
  subscriptions: UserSubscription[];
  usageStats: UsageStats | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchPlans: () => Promise<void>;
  fetchSubscriptions: () => Promise<void>;
  fetchUsageStats: () => Promise<void>;
  createPaymentLink: (planId: string, billingAddress?: any, returnUrl?: string) => Promise<PaymentLink>;
  trackUsage: (model: string, inputTokens: number, outputTokens: number, feature?: string, metadata?: any) => Promise<void>;
  refreshData: () => Promise<void>;
}

export const usePaymentStore = create<PaymentStore>((set, get) => ({
  // Initial state
  plans: [],
  subscriptions: [],
  usageStats: null,
  isLoading: false,
  error: null,

  // Fetch subscription plans
  fetchPlans: async () => {
    try {
      set({ isLoading: true, error: null });
      const response = await fetch(`${PAYMENT_API_BASE}/api/payments/plans`);
      const result = await response.json();
      
      if (result.success) {
        // Transform plans to match our interface
        const transformedPlans = result.data.map((plan: any) => ({
          id: plan.id,
          name: plan.name,
          price: plan.price,
          price_formatted: plan.price === 0 ? 'Free' : `$${plan.price}`,
          limits: plan.limits,
          features: plan.features,
          cost_limit: plan.limits.monthlyRequests * 0.01, // rough estimate
          profit_margin: 0.3
        }));
        set({ plans: transformedPlans });
      } else {
        throw new Error(result.error || 'Failed to fetch plans');
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      set({ isLoading: false });
    }
  },

  // Fetch user subscriptions
  fetchSubscriptions: async () => {
    try {
      const token = localStorage.getItem('recoder_access_token');
      if (!token) throw new Error('Not authenticated');

      set({ isLoading: true, error: null });
      const response = await fetch(`${PAYMENT_API_BASE}/api/payments/subscription`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const result = await response.json();
      
      if (result.success) {
        // Transform subscription to match our interface
        const subscription = result.data;
        if (subscription) {
          const transformedSubscription = {
            id: subscription.id,
            plan_id: subscription.planId,
            plan_name: subscription.planName,
            status: subscription.status,
            amount: subscription.amount * 100, // Convert to cents
            currency: subscription.currency,
            created_at: subscription.currentPeriodStart || new Date().toISOString(),
            next_billing_date: subscription.nextBillingDate,
            limits: subscription.limits || {
              tokens: 0,
              requests: 0
            },
            usage: subscription.usage || {
              tokens: 0,
              requests: 0,
              models_used: []
            }
          };
          set({ subscriptions: [transformedSubscription] });
        } else {
          set({ subscriptions: [] });
        }
      } else {
        throw new Error(result.error || 'Failed to fetch subscriptions');
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      set({ isLoading: false });
    }
  },

  // Fetch usage statistics from real-time usage tracker
  fetchUsageStats: async () => {
    try {
      set({ isLoading: true, error: null });
      
      // Use the local API route that proxies to backend
      const response = await fetch('/api/usage/stats');
      const result = await response.json();
      
      if (result.success) {
        const stats = result.data;
        const transformedUsage = {
          usage: {
            tokens: stats.monthlyUsage.tokens,
            requests: stats.dailyUsage.tokens / 10, // Estimate requests from tokens
            models_used: stats.modelsUsed || []
          },
          cost: {
            monthly: stats.monthlyUsage.cost * 100, // Convert to cents
            limit: stats.monthlyUsage.costLimit * 100,
            percentage: stats.monthlyUsage.costPercentage
          },
          limits: {
            tokens: stats.monthlyUsage.tokensLimit,
            requests: stats.monthlyUsage.tokensLimit / 10 // Estimate
          },
          subscription: {
            plan: stats.planId.charAt(0).toUpperCase() + stats.planId.slice(1),
            status: stats.quotaStatus === 'OK' ? 'active' : 'warning'
          },
          warnings: {
            high_usage: stats.monthlyUsage.tokensPercentage > 75,
            high_cost: stats.monthlyUsage.costPercentage > 75,
            approaching_limit: stats.monthlyUsage.tokensPercentage > 90 || stats.monthlyUsage.costPercentage > 90
          }
        };
        set({ usageStats: transformedUsage });
      } else {
        throw new Error(result.error || 'Failed to fetch usage stats');
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      set({ isLoading: false });
    }
  },

  // Create payment link
  createPaymentLink: async (planId: string, billingAddress?: any, returnUrl?: string) => {
    try {
      const token = localStorage.getItem('recoder_access_token');
      if (!token) throw new Error('Not authenticated');

      set({ isLoading: true, error: null });
      
      // Get the plan details
      const plans = get().plans;
      const plan = plans.find(p => p.id === planId);
      if (!plan) throw new Error('Plan not found');
      
      const response = await fetch(`${PAYMENT_API_BASE}/api/payments/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          planId,
          planName: plan.name,
          amount: plan.price,
          currency: 'USD',
          paymentType: 'subscription',
          frontend: 'web',
          successUrl: returnUrl || `${window.location.origin}/subscription/success`,
          cancelUrl: `${window.location.origin}/pricing`,
          metadata: {
            platform: 'recoder-web',
            billingAddress
          }
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Refresh subscriptions after creating payment link
        await get().fetchSubscriptions();
        return {
          subscription_id: result.data.paymentId,
          payment_link_id: result.data.paymentId,
          payment_link: result.data.checkoutUrl,
          amount: plan.price,
          currency: 'USD',
          plan: {
            id: plan.id,
            name: plan.name,
            price: plan.price,
            limits: plan.limits
          },
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
        };
      } else {
        throw new Error(result.error || 'Failed to create payment link');
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // Track AI usage with real-time monitoring
  trackUsage: async (model: string, inputTokens: number, outputTokens: number, feature?: string, metadata?: any) => {
    try {
      const response = await fetch('/api/usage/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: model.includes('claude') ? 'anthropic' : 
                   model.includes('gpt') ? 'openai' : 
                   model.includes('gemini') ? 'google' : 'unknown',
          model,
          inputTokens,
          outputTokens,
          feature: feature || 'web_platform',
          platform: 'recoder-web',
          metadata: {
            timestamp: new Date().toISOString(),
            ...metadata
          }
        })
      });
      
      const result = await response.json();
      
      if (!result.success) {
        // Handle usage limit errors
        if (result.code === 'USAGE_LIMIT_EXCEEDED' || result.code === 'COST_LIMIT_EXCEEDED') {
          // Show upgrade prompt
          set({ error: result.error });
          throw new Error(result.error);
        } else {
          throw new Error(result.error || 'Failed to track usage');
        }
      }

      // Refresh usage stats after tracking to show updated numbers
      await get().fetchUsageStats();
      
      // No return value to match Promise<void>
    } catch (error) {
      console.error('Usage tracking failed:', error);
      throw error;
    }
  },

  // Refresh all data
  refreshData: async () => {
    const { fetchPlans, fetchSubscriptions, fetchUsageStats } = get();
    await Promise.all([
      fetchPlans(),
      fetchSubscriptions(),
      fetchUsageStats()
    ]);
  }
}));

// Auth Service Integration
export class AuthService {
  private static instance: AuthService;

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async login(email: string, password: string, platform: string = 'web'): Promise<any> {
    try {
      const response = await fetch(`${PAYMENT_API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password,
          platform,
          deviceInfo: {
            userAgent: navigator.userAgent,
            platform: 'web'
          }
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // Store tokens
        localStorage.setItem('recoder_access_token', result.data.tokens.accessToken);
        localStorage.setItem('recoder_refresh_token', result.data.tokens.refreshToken);
        localStorage.setItem('recoder_user', JSON.stringify(result.data.user));
        
        // Initialize payment data
        const paymentStore = usePaymentStore.getState();
        await paymentStore.refreshData();
        
        return result.data;
      } else {
        throw new Error(result.error || 'Login failed');
      }
    } catch (error) {
      throw error instanceof Error ? error : new Error('Login failed');
    }
  }

  async logout(): Promise<void> {
    localStorage.removeItem('recoder_access_token');
    localStorage.removeItem('recoder_refresh_token');
    localStorage.removeItem('recoder_user');
    
    // Clear payment store
    usePaymentStore.setState({
      plans: [],
      subscriptions: [],
      usageStats: null,
      error: null
    });
  }

  getUser(): any {
    const userStr = localStorage.getItem('recoder_user');
    return userStr ? JSON.parse(userStr) : null;
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('recoder_access_token');
  }

  getToken(): string | null {
    return localStorage.getItem('recoder_access_token');
  }
}

// Utility functions
export const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  } else {
    return tokens.toString();
  }
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

export const calculateUsagePercentage = (used: number, limit: number): number => {
  return Math.min((used / limit) * 100, 100);
};

// Export payment service instance
export const paymentService = {
  store: usePaymentStore,
  auth: AuthService.getInstance(),
  utils: {
    formatTokenCount,
    formatCurrency,
    calculateUsagePercentage
  }
};