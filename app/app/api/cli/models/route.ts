import { NextRequest, NextResponse } from 'next/server';
import { withCLIAuth } from '@/lib/middleware/cli-auth-middleware';

/**
 * GET /api/cli/models
 * Get available AI models for user's plan
 * Premium users get access to all models
 */
export const GET = withCLIAuth(async (request: NextRequest, context) => {
  const allModels = [
    // Free Models
    {
      id: 'gemini-2.0-flash-exp',
      name: 'Gemini 2.0 Flash',
      provider: 'google',
      tier: 'free',
      description: 'Fast and efficient for most tasks',
      contextWindow: 32000,
      costPer1kTokens: 0.0001,
    },
    {
      id: 'llama-3.3-70b',
      name: 'Llama 3.3 70B',
      provider: 'meta',
      tier: 'free',
      description: 'Open-source powerhouse',
      contextWindow: 8192,
      costPer1kTokens: 0.0002,
    },
    // Premium Models
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      provider: 'anthropic',
      tier: 'premium',
      description: 'Best for coding and complex reasoning',
      contextWindow: 200000,
      costPer1kTokens: 0.003,
      requiresPremium: true,
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      tier: 'premium',
      description: 'Multimodal intelligence',
      contextWindow: 128000,
      costPer1kTokens: 0.005,
      requiresPremium: true,
    },
    {
      id: 'claude-opus-4-20250514',
      name: 'Claude Opus 4',
      provider: 'anthropic',
      tier: 'premium',
      description: 'Most powerful model for complex tasks',
      contextWindow: 200000,
      costPer1kTokens: 0.015,
      requiresPremium: true,
    },
    // Pro/Enterprise Only
    {
      id: 'o1-preview',
      name: 'OpenAI o1 Preview',
      provider: 'openai',
      tier: 'pro',
      description: 'Advanced reasoning model',
      contextWindow: 128000,
      costPer1kTokens: 0.020,
      requiresPremium: true,
      requiresPro: true,
    },
  ];

  // Filter models based on user's plan
  const availableModels = allModels.filter(model => {
    if (model.tier === 'free') return true;
    if (model.tier === 'premium' && context.isPremium) return true;
    if (model.tier === 'pro' && ['pro', 'enterprise'].includes(context.plan)) return true;
    return false;
  });

  return NextResponse.json({
    models: availableModels,
    userPlan: context.plan,
    isPremium: context.isPremium,
    totalAvailable: availableModels.length,
    totalModels: allModels.length,
  });
});
