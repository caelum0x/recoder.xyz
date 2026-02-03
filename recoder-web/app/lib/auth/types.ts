/**
 * Auth types for recoder-web
 * Shared type definitions for authentication and subscription management
 */

// Plan type constants
export const PLAN_TYPES = {
  FREE: 'recoder free',
  PRO: 'recoder pro',
  MAX: 'recoder max',
} as const;

export type PlanType = (typeof PLAN_TYPES)[keyof typeof PLAN_TYPES];

// Plan limits interface
export interface PlanLimits {
  aiNums: number;
  seats: number;
  projectNums: number;
  uploadLimit?: number;
  deployLimit?: number;
}

// Subscription limit record interface
export interface SubscriptionLimitRecord {
  id: string;
  organizationId: string;
  planName: string;
  planId: string;
  aiNums: number;
  enhanceNums: number;
  uploadLimit: number;
  deployLimit: number;
  seats: number;
  projectNums: number;
  isActive: boolean;
  periodStart: string;
  periodEnd: string;
  stripeCustomerId: string | null;
  billingInterval?: 'month' | 'year';
  lastQuotaRefresh?: string | null;
  createdAt: string | null;
  updatedAt: string;
}

// Plan details interface
export interface PlanDetails {
  aiNums: number;
  aiNumsLimit: number;
  seats: number;
  seatsLimit: number;
  projectNums: number;
  projectNumsLimit: number;
  plan: string;
  periodEnd: string;
  source: 'DB' | 'CONST';
}

// Usage return interface
export interface SubscriptionUsage {
  aiNums: number;
  aiNumsLimit: number;
  seats: number;
  seatsLimit: number;
  projectNums: number;
  projectNumsLimit: number;
  plan: string;
  periodEnd?: string;
  planDetails: {
    free: PlanDetails | null;
    paid: PlanDetails | null;
  };
}

// User interface
export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  stripeCustomerId?: string | null;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
}

// Session interface
export interface AuthSession {
  user: AuthUser;
  sessionId: string;
  expiresAt: Date;
}

// Organization interface
export interface Organization {
  id: string;
  name: string;
  slug: string;
  stripeCustomerId?: string | null;
  createdAt?: Date;
}

// Member interface
export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  createdAt?: Date;
}

// Subscription interface
export interface Subscription {
  id: string;
  plan: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'trialing';
  referenceId: string;
  stripeCustomerId?: string | null;
  periodStart?: Date;
  periodEnd?: Date;
}

// Quota deduction result
export interface QuotaDeductionResult {
  success: boolean;
  remaining?: number;
  planName?: string;
  reason?: 'insufficient' | 'concurrency' | 'not_found' | 'expired' | 'invalid';
  source?: 'annual' | 'fallback' | 'free' | 'paid';
}

// Email template types
export interface OrganizationInvitationOptions {
  email: string;
  invitedByUsername: string;
  invitedByEmail: string;
  teamName: string;
  inviteLink: string;
}
