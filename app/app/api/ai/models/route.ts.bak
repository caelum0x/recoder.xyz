import { NextRequest, NextResponse } from 'next/server';
import { withApiKeyAuth, AuthenticatedRequest } from '@/lib/middleware/api-key-auth';

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  pricing: {
    input: number; // per million tokens
    output: number; // per million tokens
  };
  capabilities: string[];
}

/**
 * GET /api/ai/models
 * List available AI models for authenticated user's plan
 */
async function handler(req: AuthenticatedRequest) {
  try {
    const userPlan = req.user!.plan;
    const availableModels = getModelsForPlan(userPlan);

    return NextResponse.json({
      success: true,
      plan: userPlan,
      models: availableModels,
    });
  } catch (error: any) {
    console.error('Error fetching models:', error);
    return NextResponse.json(
      { error: 'Failed to fetch models' },
      { status: 500 }
    );
  }
}

/**
 * Get available models with details based on user's plan
 */
function getModelsForPlan(plan: string): ModelInfo[] {
  const allModels: ModelInfo[] = [
    {
      id: 'anthropic/claude-3-haiku',
      name: 'Claude 3 Haiku',
      provider: 'Anthropic',
      contextWindow: 200000,
      pricing: { input: 0.25, output: 1.25 },
      capabilities: ['chat', 'code', 'fast'],
    },
    {
      id: 'anthropic/claude-3-5-sonnet',
      name: 'Claude 3.5 Sonnet',
      provider: 'Anthropic',
      contextWindow: 200000,
      pricing: { input: 3.0, output: 15.0 },
      capabilities: ['chat', 'code', 'reasoning', 'balanced'],
    },
    {
      id: 'anthropic/claude-3-opus',
      name: 'Claude 3 Opus',
      provider: 'Anthropic',
      contextWindow: 200000,
      pricing: { input: 15.0, output: 75.0 },
      capabilities: ['chat', 'code', 'reasoning', 'advanced'],
    },
    {
      id: 'google/gemini-flash-1.5',
      name: 'Gemini 1.5 Flash',
      provider: 'Google',
      contextWindow: 1000000,
      pricing: { input: 0.075, output: 0.3 },
      capabilities: ['chat', 'multimodal', 'fast'],
    },
    {
      id: 'google/gemini-pro-1.5',
      name: 'Gemini 1.5 Pro',
      provider: 'Google',
      contextWindow: 2000000,
      pricing: { input: 1.25, output: 5.0 },
      capabilities: ['chat', 'multimodal', 'reasoning'],
    },
    {
      id: 'meta-llama/llama-3.1-8b-instruct',
      name: 'Llama 3.1 8B',
      provider: 'Meta',
      contextWindow: 128000,
      pricing: { input: 0.06, output: 0.06 },
      capabilities: ['chat', 'code', 'fast', 'open-source'],
    },
    {
      id: 'meta-llama/llama-3.1-70b-instruct',
      name: 'Llama 3.1 70B',
      provider: 'Meta',
      contextWindow: 128000,
      pricing: { input: 0.8, output: 0.8 },
      capabilities: ['chat', 'code', 'reasoning', 'open-source'],
    },
    {
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'OpenAI',
      contextWindow: 128000,
      pricing: { input: 0.15, output: 0.6 },
      capabilities: ['chat', 'code', 'fast'],
    },
    {
      id: 'openai/gpt-4o',
      name: 'GPT-4o',
      provider: 'OpenAI',
      contextWindow: 128000,
      pricing: { input: 5.0, output: 15.0 },
      capabilities: ['chat', 'code', 'reasoning', 'multimodal'],
    },
    {
      id: 'openai/o1-preview',
      name: 'o1 Preview',
      provider: 'OpenAI',
      contextWindow: 128000,
      pricing: { input: 15.0, output: 60.0 },
      capabilities: ['reasoning', 'complex-problems', 'advanced'],
    },
  ];

  // Filter models based on plan
  const planModels: Record<string, string[]> = {
    free: [],
    weekly: [
      'anthropic/claude-3-haiku',
      'google/gemini-flash-1.5',
      'meta-llama/llama-3.1-8b-instruct',
    ],
    monthly: [
      'anthropic/claude-3-haiku',
      'anthropic/claude-3-5-sonnet',
      'google/gemini-flash-1.5',
      'google/gemini-pro-1.5',
      'meta-llama/llama-3.1-70b-instruct',
      'openai/gpt-4o-mini',
    ],
    pro: allModels.map(m => m.id), // All models
    enterprise: allModels.map(m => m.id), // All models
  };

  const allowedModelIds = planModels[plan] || [];

  if (allowedModelIds.length === 0) {
    return [];
  }

  return allModels.filter(model => allowedModelIds.includes(model.id));
}

export const GET = withApiKeyAuth(handler);
