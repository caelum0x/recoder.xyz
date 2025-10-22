/**
 * AI API Service for recoder-code CLI
 * Manages AI requests with cost tracking and budget limits
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();

// OpenRouter API Client (unified access to all AI providers)
const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://recoder.xyz',
    'X-Title': 'Recoder CLI',
  },
});

// Pricing per 1M tokens (input/output) - Based on your usage data
export const PRICING = {
  // Top performers by usage
  'x-ai/grok-code-fast-1': { input: 0.5, output: 1.0 },           // 1.2T tokens, 2% cost
  'anthropic/claude-sonnet-4.5': { input: 3.0, output: 15.0 },    // 498B tokens, 10% cost
  'anthropic/claude-sonnet-4': { input: 3.0, output: 15.0 },      // 179B tokens, 30% cost (primary)
  'google/gemini-2.5-flash': { input: 0.075, output: 0.3 },       // 313B tokens, 10% cost
  'google/gemini-2.5-pro': { input: 1.25, output: 5.0 },          // 151B tokens, 8% cost
  'google/gemini-2.0-flash': { input: 0.0, output: 0.0 },         // 143B tokens, 5% cost (free)
  'x-ai/grok-4-fast': { input: 0.4, output: 0.8 },                // 177B tokens, 8% cost
  'openai/gpt-4.1-mini': { input: 0.15, output: 0.6 },            // 103B tokens, 4.6% cost
  'openai/gpt-5': { input: 5.0, output: 15.0 },                   // 90.9B tokens, 4.1% cost
  'deepseek/deepseek-v3-0324': { input: 0.27, output: 1.10 },     // 115B tokens, 1% cost
  'qwen/qwen3-coder-480b-a35b': { input: 0.8, output: 2.4 },      // 48B tokens, 2.1% cost
  'openrouter/sonoma-sky-alpha': { input: 1.0, output: 3.0 },     // 85.9B tokens, 3.8% cost
  'openai/gpt-oss-20b': { input: 0.10, output: 0.30 },            // 110B tokens, 30% cost
  'z-ai/glm-4.6': { input: 0.5, output: 1.5 },                    // 95.8B tokens, 11% cost
};

// Plan limits
export const PLAN_LIMITS = {
  'pro': {
    monthlyCostLimit: 17.50,  // $20 plan - keep 87.5% for AI costs
    dailyCostLimit: 0.58,     // ~$17.50 / 30 days
    requestsPerDay: 200,
    requestsPerMonth: 5000,
    allowedModels: ['all'],
    defaultModel: 'anthropic/claude-sonnet-4', // Primary model
  },
  'premium': {
    monthlyCostLimit: 93.0,   // $100 plan - keep 93% for AI costs
    dailyCostLimit: 3.10,     // ~$93 / 30 days
    requestsPerDay: 1000,
    requestsPerMonth: 25000,
    allowedModels: ['all'],
    defaultModel: 'anthropic/claude-sonnet-4.5', // Latest Sonnet
  },
  'free': {
    monthlyCostLimit: 0.0,
    dailyCostLimit: 0.0,
    requestsPerDay: 10,
    requestsPerMonth: 100,
    allowedModels: ['google/gemini-2.0-flash'], // Only free model
    defaultModel: 'google/gemini-2.0-flash',
  },
};

interface AIRequest {
  userId: string;
  prompt: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

interface AIResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost: number;
  metadata: {
    requestId: string;
    latency: number;
    cached: boolean;
  };
}

interface CostCheck {
  allowed: boolean;
  reason?: string;
  currentMonthlySpend: number;
  currentDailySpend: number;
  remainingMonthlyBudget: number;
  remainingDailyBudget: number;
  plan: string;
}

/**
 * Check if user can make AI request based on budget limits
 */
export async function checkUserBudget(userId: string): Promise<CostCheck> {
  // Get user's subscription plan
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscription: true,
      subscriptions: {
        where: { status: 'active' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!user) {
    return {
      allowed: false,
      reason: 'User not found',
      currentMonthlySpend: 0,
      currentDailySpend: 0,
      remainingMonthlyBudget: 0,
      remainingDailyBudget: 0,
      plan: 'free',
    };
  }

  const plan = user.subscription || 'free';
  const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;

  // Calculate current period spending
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Get monthly spending
  const monthlyUsage = await prisma.cLIUsage.aggregate({
    where: {
      userId,
      timestamp: { gte: monthStart },
    },
    _sum: {
      cost: true,
    },
  });

  const currentMonthlySpend = monthlyUsage._sum.cost || 0;

  // Get daily spending
  const dailyUsage = await prisma.cLIUsage.aggregate({
    where: {
      userId,
      timestamp: { gte: dayStart },
    },
    _sum: {
      cost: true,
    },
  });

  const currentDailySpend = dailyUsage._sum.cost || 0;

  // Get request counts
  const monthlyRequests = await prisma.cLIUsage.count({
    where: {
      userId,
      timestamp: { gte: monthStart },
    },
  });

  const dailyRequests = await prisma.cLIUsage.count({
    where: {
      userId,
      timestamp: { gte: dayStart },
    },
  });

  const remainingMonthlyBudget = limits.monthlyCostLimit - currentMonthlySpend;
  const remainingDailyBudget = limits.dailyCostLimit - currentDailySpend;

  // Check if user exceeded limits
  if (currentMonthlySpend >= limits.monthlyCostLimit) {
    return {
      allowed: false,
      reason: `Monthly budget limit of $${limits.monthlyCostLimit} exceeded. Current spend: $${currentMonthlySpend.toFixed(2)}`,
      currentMonthlySpend,
      currentDailySpend,
      remainingMonthlyBudget,
      remainingDailyBudget,
      plan,
    };
  }

  if (currentDailySpend >= limits.dailyCostLimit) {
    return {
      allowed: false,
      reason: `Daily budget limit of $${limits.dailyCostLimit} exceeded. Current spend: $${currentDailySpend.toFixed(2)}`,
      currentMonthlySpend,
      currentDailySpend,
      remainingMonthlyBudget,
      remainingDailyBudget,
      plan,
    };
  }

  if (monthlyRequests >= limits.requestsPerMonth) {
    return {
      allowed: false,
      reason: `Monthly request limit of ${limits.requestsPerMonth} exceeded`,
      currentMonthlySpend,
      currentDailySpend,
      remainingMonthlyBudget,
      remainingDailyBudget,
      plan,
    };
  }

  if (dailyRequests >= limits.requestsPerDay) {
    return {
      allowed: false,
      reason: `Daily request limit of ${limits.requestsPerDay} exceeded`,
      currentMonthlySpend,
      currentDailySpend,
      remainingMonthlyBudget,
      remainingDailyBudget,
      plan,
    };
  }

  return {
    allowed: true,
    currentMonthlySpend,
    currentDailySpend,
    remainingMonthlyBudget,
    remainingDailyBudget,
    plan,
  };
}

/**
 * Select best AI model based on task type, plan, and budget
 */
function selectModel(
  plan: string,
  taskType: 'code' | 'text' | 'reasoning' | 'chat',
  budgetRemaining: number
): string {
  const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;
  
  // Free plan - only free model
  if (plan === 'free') {
    return limits.defaultModel;
  }

  // For code generation - prefer fast code models
  if (taskType === 'code') {
    if (budgetRemaining > 5.0) {
      return 'anthropic/claude-sonnet-4.5'; // Best quality
    } else if (budgetRemaining > 1.0) {
      return 'anthropic/claude-sonnet-4'; // Good quality, lower cost
    } else if (budgetRemaining > 0.5) {
      return 'x-ai/grok-code-fast-1'; // Fast and cheap
    } else {
      return 'google/gemini-2.5-flash'; // Most economical
    }
  }

  // For reasoning tasks - prefer Claude
  if (taskType === 'reasoning') {
    if (budgetRemaining > 5.0 && plan === 'premium') {
      return 'anthropic/claude-sonnet-4.5'; // Latest model
    } else if (budgetRemaining > 2.0) {
      return 'anthropic/claude-sonnet-4'; // Primary model
    } else if (budgetRemaining > 0.5) {
      return 'google/gemini-2.5-pro'; // Good reasoning
    } else {
      return 'google/gemini-2.5-flash'; // Budget option
    }
  }

  // For general chat/text - use cost-effective models
  if (budgetRemaining > 1.0) {
    return 'x-ai/grok-4-fast'; // Fast responses
  } else if (budgetRemaining > 0.5) {
    return 'google/gemini-2.5-flash'; // Good value
  } else {
    return 'deepseek/deepseek-v3-0324'; // Very cheap
  }
}

/**
 * Calculate cost for a request
 */
function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = PRICING[model];
  if (!pricing) {
    console.warn(`No pricing found for ${model}, using default`);
    return 0.001; // Default small cost
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Make AI request with automatic model selection and cost tracking
 */
export async function makeAIRequest(request: AIRequest): Promise<AIResponse> {
  const startTime = Date.now();

  // Check budget first
  const budgetCheck = await checkUserBudget(request.userId);
  if (!budgetCheck.allowed) {
    throw new Error(budgetCheck.reason || 'Budget limit exceeded');
  }

  // Auto-select model if not specified
  let model = request.model;

  if (!model) {
    model = selectModel(
      budgetCheck.plan,
      'code', // Default task type
      budgetCheck.remainingMonthlyBudget
    );
  }

  // Validate model is allowed for plan
  const limits = PLAN_LIMITS[budgetCheck.plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;
  if (limits.allowedModels[0] !== 'all' && !limits.allowedModels.includes(model)) {
    model = limits.defaultModel;
  }

  try {
    // Make request through OpenRouter (unified API)
    const completion = await openrouter.chat.completions.create({
      model,
      messages: [
        ...(request.systemPrompt
          ? [{ role: 'system' as const, content: request.systemPrompt }]
          : []),
        { role: 'user' as const, content: request.prompt },
      ],
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature || 0.7,
    });

    const content = completion.choices[0]?.message?.content || '';
    const inputTokens = completion.usage?.prompt_tokens || 0;
    const outputTokens = completion.usage?.completion_tokens || 0;
    const cost = calculateCost(model, inputTokens, outputTokens);

    const response: AIResponse = {
      content,
      model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      cost,
      metadata: {
        requestId: completion.id,
        latency: Date.now() - startTime,
        cached: false,
      },
    };

    // Track usage in database
    await trackUsage(request.userId, response);

    return response;
  } catch (error: any) {
    console.error('AI request failed:', error);
    throw new Error(`AI request failed: ${error.message}`);
  }
}

/**
 * Track usage in database
 */
async function trackUsage(userId: string, response: AIResponse): Promise<void> {
  try {
    // Find an active CLI session for this user
    const session = await prisma.cLISession.findFirst({
      where: {
        userId,
        status: 'authorized',
      },
      orderBy: {
        lastUsedAt: 'desc',
      },
    });

    if (!session) {
      console.warn(`No active CLI session found for user ${userId}`);
      return;
    }

    // Extract provider from model name (e.g., "anthropic/claude-sonnet-4" -> "anthropic")
    const provider = response.model.split('/')[0];

    await prisma.cLIUsage.create({
      data: {
        userId,
        sessionId: session.id,
        requestType: 'ai-completion',
        provider,
        model: response.model,
        tokens: response.usage.totalTokens,
        cost: response.cost,
        duration: response.metadata.latency,
        success: true,
        metadata: {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          requestId: response.metadata.requestId,
        },
      },
    });

    // Update session last used time
    await prisma.cLISession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });
  } catch (error) {
    console.error('Failed to track usage:', error);
    // Don't throw - tracking failures shouldn't block the response
  }
}

/**
 * Get usage statistics for a user
 */
export async function getUserUsageStats(userId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [monthlyStats, dailyStats, user] = await Promise.all([
    prisma.cLIUsage.aggregate({
      where: {
        userId,
        timestamp: { gte: monthStart },
      },
      _sum: {
        cost: true,
        tokens: true,
      },
      _count: true,
    }),
    prisma.cLIUsage.aggregate({
      where: {
        userId,
        timestamp: { gte: dayStart },
      },
      _sum: {
        cost: true,
        tokens: true,
      },
      _count: true,
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { subscription: true },
    }),
  ]);

  const plan = user?.subscription || 'free';
  const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;

  return {
    plan,
    limits,
    monthly: {
      requests: monthlyStats._count,
      tokens: monthlyStats._sum.tokens || 0,
      cost: monthlyStats._sum.cost || 0,
      remaining: limits.monthlyCostLimit - (monthlyStats._sum.cost || 0),
    },
    daily: {
      requests: dailyStats._count,
      tokens: dailyStats._sum.tokens || 0,
      cost: dailyStats._sum.cost || 0,
      remaining: limits.dailyCostLimit - (dailyStats._sum.cost || 0),
    },
  };
}
