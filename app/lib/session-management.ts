/**
 * Session Management for Recoder.xyz
 * Track user sessions (6/day for Free & PRO, 20/day for Enterprise)
 */
import crypto from 'crypto';

import { prisma } from './prisma';
import { getPlanLimits, canStartSession, canUseModel, isPremiumModel } from './plan-config';

export interface Session {
  id: string;
  userId: string;
  platform: string;
  deviceId?: string;
  startTime: Date;
  endTime?: Date;
  tokensUsed: number;
  premiumTokensUsed: number;
  modelsUsed: string[];
  costEstimate: number;
  status: 'active' | 'completed' | 'abandoned';
}

export interface SessionUsage {
  model: string;
  tokens: number;
  cost: number;
  provider?: string;
}

/**
 * Get count of sessions for today
 */
export async function getSessionsToday(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  const count = await prisma.usage_records.count({
    where: {
      userId,
      requestType: 'session_start',
      timestamp: {
        gte: startOfDay
      }
    }
  });
  
  return count;
}

/**
 * Get premium model tokens used today
 */
export async function getPremiumTokensToday(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  const records = await prisma.usage_records.findMany({
    where: {
      userId,
      timestamp: {
        gte: startOfDay
      },
      model: {
        not: null
      }
    },
    select: {
      model: true,
      tokensUsed: true
    }
  });
  
  const premiumTokens = records
    .filter(r => r.model && isPremiumModel(r.model))
    .reduce((sum, r) => sum + (r.tokensUsed || 0), 0);
  
  return premiumTokens;
}

/**
 * Start a new session
 */
export async function startSession(
  userId: string,
  platform: string = 'recoder-code',
  deviceId?: string
): Promise<{
  success: boolean;
  session?: Session;
  error?: string;
  upgradeRequired?: boolean;
}> {
  // Get user plan
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { subscriptionPlan: true }
  });
  
  if (!user) {
    return {
      success: false,
      error: 'User not found'
    };
  }
  
  // Check if user can start a new session
  const sessionsToday = await getSessionsToday(userId);
  const sessionCheck = canStartSession(user.subscriptionPlan, sessionsToday);
  
  if (!sessionCheck.allowed) {
    return {
      success: false,
      error: sessionCheck.reason,
      upgradeRequired: sessionCheck.upgradeRequired
    };
  }
  
  // Create session marker in usage records
  const sessionId = `sess_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`;
  
  await prisma.usage_records.create({
    data: {
      id: sessionId,
      userId,
      requestType: 'session_start',
      type: 'session',
      tokens: 0,
      tokensUsed: 0,
      cost: 0,
      model: null,
      provider: platform,
      duration: 0,
      success: true,
      platform,
      metadata: {
        platform,
        deviceId,
        sessionId
      }
    }
  });
  
  const session: Session = {
    id: sessionId,
    userId,
    platform,
    deviceId,
    startTime: new Date(),
    tokensUsed: 0,
    premiumTokensUsed: 0,
    modelsUsed: [],
    costEstimate: 0,
    status: 'active'
  };
  
  return {
    success: true,
    session
  };
}

/**
 * Track usage within a session
 */
export async function trackSessionUsage(
  sessionId: string,
  userId: string,
  usage: SessionUsage
): Promise<{
  success: boolean;
  tokensUsed?: number;
  premiumTokensUsed?: number;
  remainingPremiumTokens?: number;
  error?: string;
  shouldFallbackToFreeModels?: boolean;
}> {
  // Get user plan
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { subscriptionPlan: true }
  });
  
  if (!user) {
    return {
      success: false,
      error: 'User not found'
    };
  }
  
  const limits = getPlanLimits(user.subscriptionPlan);
  const isPremium = isPremiumModel(usage.model);
  
  // Get premium tokens used today
  const premiumTokensToday = await getPremiumTokensToday(userId);
  
  // Check if user can use this model
  const modelCheck = canUseModel(user.subscriptionPlan, usage.model, premiumTokensToday);
  
  if (!modelCheck.allowed) {
    return {
      success: false,
      error: modelCheck.reason,
      shouldFallbackToFreeModels: !modelCheck.upgradeRequired
    };
  }
  
  // Record usage
  await prisma.usage_records.create({
    data: {
      id: `usage_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`,
      userId,
      requestType: 'session_usage',
      type: 'usage',
      tokensUsed: usage.tokens,
      tokens: usage.tokens,
      cost: usage.cost,
      model: usage.model,
      provider: usage.provider,
      success: true,
      isPriceyModel: isPremium,
      metadata: {
        sessionId,
        isPremiumModel: isPremium
      }
    }
  });
  
  // Calculate totals
  const newPremiumTokens = isPremium ? premiumTokensToday + usage.tokens : premiumTokensToday;
  const remaining = limits.premiumModelsTokenLimit > 0 
    ? limits.premiumModelsTokenLimit - newPremiumTokens 
    : -1;
  
  return {
    success: true,
    tokensUsed: usage.tokens,
    premiumTokensUsed: isPremium ? usage.tokens : 0,
    remainingPremiumTokens: remaining
  };
}

/**
 * End a session
 */
export async function endSession(
  sessionId: string,
  userId: string
): Promise<{
  success: boolean;
  session?: {
    duration: number;
    tokensUsed: number;
    premiumTokensUsed: number;
    costEstimate: number;
  };
  error?: string;
}> {
  // Get session start time using the session ID as record ID
  const startRecord = await prisma.usage_records.findFirst({
    where: {
      id: sessionId,
      userId,
      requestType: 'session_start'
    },
    select: {
      timestamp: true
    }
  });
  
  if (!startRecord) {
    return {
      success: false,
      error: 'Session not found'
    };
  }
  
  // Get all usage records for this session using metadata
  const usageRecords = await prisma.usage_records.findMany({
    where: {
      userId,
      requestType: 'session_usage',
      metadata: {
        path: ['sessionId'],
        equals: sessionId
      }
    },
    select: {
      tokensUsed: true,
      cost: true,
      model: true
    }
  });
  
  const totalTokens = usageRecords.reduce((sum, r) => sum + (r.tokensUsed || 0), 0);
  const totalCost = usageRecords.reduce((sum, r) => sum + (r.cost || 0), 0);
  const premiumTokens = usageRecords
    .filter(r => r.model && isPremiumModel(r.model))
    .reduce((sum, r) => sum + (r.tokensUsed || 0), 0);
  
  const duration = Math.floor((Date.now() - startRecord.timestamp.getTime()) / 1000);
  
  // Record session end
  await prisma.usage_records.create({
    data: {
      id: `end_${sessionId}`,
      userId,
      requestType: 'session_end',
      type: 'session',
      tokensUsed: totalTokens,
      tokens: totalTokens,
      cost: totalCost,
      duration,
      success: true,
      metadata: {
        sessionId,
        totalTokens,
        premiumTokens,
        totalCost,
        duration
      }
    }
  });
  
  return {
    success: true,
    session: {
      duration,
      tokensUsed: totalTokens,
      premiumTokensUsed: premiumTokens,
      costEstimate: totalCost
    }
  };
}

/**
 * Get active session for a user
 */
export async function getActiveSession(userId: string): Promise<Session | null> {
  // Get most recent session start that doesn't have a corresponding end
  const recentSession = await prisma.usage_records.findFirst({
    where: {
      userId,
      requestType: 'session_start'
    },
    orderBy: {
      timestamp: 'desc'
    },
    select: {
      id: true,
      timestamp: true,
      metadata: true
    }
  });
  
  if (!recentSession || !recentSession.id) {
    return null;
  }

  const sessionId = recentSession.id;
  
  // Check if session has ended
  const endRecord = await prisma.usage_records.findFirst({
    where: {
      id: `end_${sessionId}`,
      userId,
      requestType: 'session_end'
    }
  });
  
  if (endRecord) {
    return null; // Session has ended
  }
  
  // Get session usage
  const usageRecords = await prisma.usage_records.findMany({
    where: {
      userId,
      requestType: 'session_usage',
      metadata: {
        path: ['sessionId'],
        equals: sessionId
      }
    },
    select: {
      tokensUsed: true,
      cost: true,
      model: true
    }
  });
  
  const totalTokens = usageRecords.reduce((sum, r) => sum + (r.tokensUsed || 0), 0);
  const totalCost = usageRecords.reduce((sum, r) => sum + (r.cost || 0), 0);
  const premiumTokens = usageRecords
    .filter(r => r.model && isPremiumModel(r.model))
    .reduce((sum, r) => sum + (r.tokensUsed || 0), 0);
  const modelsUsed = [...new Set(usageRecords.map(r => r.model).filter(Boolean))] as string[];
  
  const metadata = recentSession.metadata as any;
  
  return {
    id: sessionId,
    userId,
    platform: metadata?.platform || 'unknown',
    deviceId: metadata?.deviceId,
    startTime: recentSession.timestamp,
    tokensUsed: totalTokens,
    premiumTokensUsed: premiumTokens,
    modelsUsed,
    costEstimate: totalCost,
    status: 'active'
  };
}

/**
 * Get user session stats for today
 */
export async function getSessionStats(userId: string): Promise<{
  sessionsToday: number;
  sessionsLimit: number;
  remainingSessions: number;
  premiumTokensToday: number;
  premiumTokensLimit: number;
  remainingPremiumTokens: number;
  activeSession: Session | null;
}> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { subscriptionPlan: true }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const limits = getPlanLimits(user.subscriptionPlan);
  const sessionsToday = await getSessionsToday(userId);
  const premiumTokensToday = await getPremiumTokensToday(userId);
  const activeSession = await getActiveSession(userId);
  
  return {
    sessionsToday,
    sessionsLimit: limits.sessionsPerDay,
    remainingSessions: Math.max(0, limits.sessionsPerDay - sessionsToday),
    premiumTokensToday,
    premiumTokensLimit: limits.premiumModelsTokenLimit,
    remainingPremiumTokens: limits.premiumModelsTokenLimit > 0 
      ? Math.max(0, limits.premiumModelsTokenLimit - premiumTokensToday)
      : -1,
    activeSession
  };
}

export default {
  startSession,
  trackSessionUsage,
  endSession,
  getActiveSession,
  getSessionStats,
  getSessionsToday,
  getPremiumTokensToday
};
