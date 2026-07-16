import { NextRequest, NextResponse } from 'next/server';
import { withApiKeyAuth, AuthenticatedRequest } from '@/lib/middleware/api-key-auth';
import { trackApiKeyUsage } from '@/lib/usage-tracking';
import { ApiKeyResolverError, resolveApiKey } from '@/lib/api-key-resolver';
import { z } from 'zod';

const proxyRequestSchema = z.object({
  model: z.string(),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
  stream: z.boolean().optional(),
});

/**
 * POST /api/ai/proxy
 * AI proxy endpoint for premium users
 * Authenticates via API key and routes requests to OpenRouter
 */
async function handler(req: AuthenticatedRequest) {
  try {
    const body = await req.json();
    const validation = proxyRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      );
    }

    const { model, messages, temperature, max_tokens, stream } = validation.data;

    // Check if user's plan allows this model
    const allowedModels = getModelsForPlan(req.user!.plan);
    if (!allowedModels.includes(model) && !allowedModels.includes('*')) {
      return NextResponse.json(
        { error: `Model ${model} not available on your plan`, allowedModels },
        { status: 403 }
      );
    }

    const startTime = Date.now();

    const resolvedKey = await resolveApiKey(req.user!.id, 'openrouter');

    // Make request to OpenRouter using the user's BYOK key
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resolvedKey.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz',
        'X-Title': 'Recoder AI',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: temperature || 0.7,
        max_tokens: max_tokens || 2000,
        stream: stream || false,
      }),
    });

    if (!openRouterResponse.ok) {
      const errorData = await openRouterResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'AI provider error' },
        { status: openRouterResponse.status }
      );
    }

    const duration = Date.now() - startTime;
    const responseData = await openRouterResponse.json();

    // Extract usage information
    const tokensUsed = responseData.usage?.total_tokens || 0;
    const cost = calculateCost(model, tokensUsed);

    // Track usage for this API key
    await trackApiKeyUsage(req.user!.id, req.keyInfo!.keyId, {
      modelUsed: model,
      providerUsed: 'openrouter',
      tokensUsed,
      cost,
      duration,
      endpoint: '/api/ai/proxy',
      method: 'POST',
      statusCode: 200,
      success: true,
    });

    return NextResponse.json({
      success: true,
      data: responseData,
      usage: {
        tokensUsed,
        cost,
        duration,
      },
    });
  } catch (error) {
    if (error instanceof ApiKeyResolverError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === 'NO_API_KEY' ? 400 : 403 }
      );
    }

    console.error('AI proxy error:', error);

    // Track failed request
    if (req.user && req.keyInfo) {
      await trackApiKeyUsage(req.user.id, req.keyInfo.keyId, {
        endpoint: '/api/ai/proxy',
        method: 'POST',
        statusCode: 500,
        success: false,
        errorMessage: error.message,
      });
    }

    return NextResponse.json(
      { error: 'Failed to process AI request' },
      { status: 500 }
    );
  }
}

/**
 * Get available models based on user's plan
 */
function getModelsForPlan(plan: string): string[] {
  const modelsByPlan: Record<string, string[]> = {
    free: [
      'google/gemma-3-4b-it:free',
      'google/gemma-3n-e4b-it:free',
      'google/gemma-3-12b-it:free',
      'liquid/lfm-2.5-1.2b-instruct:free',
      'nvidia/nemotron-nano-9b-v2:free',
      'stepfun/step-3.5-flash:free',
      'google/gemma-3-27b-it:free',
      'qwen/qwen3-coder:free',
      'mistralai/mistral-small-3.1-24b-instruct:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'nousresearch/hermes-3-llama-3.1-405b:free',
      'qwen/qwen3-next-80b-a3b-instruct:free',
    ],
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
    pro: [
      '*', // All models
    ],
    enterprise: [
      '*', // All models
    ],
  };

  return modelsByPlan[plan] || [];
}

/**
 * Calculate cost based on model and tokens
 * Approximate costs - adjust based on actual OpenRouter pricing
 */
function calculateCost(model: string, tokens: number): number {
  const costPerMillionTokens: Record<string, number> = {
    'anthropic/claude-3-haiku': 0.25,
    'anthropic/claude-3-5-sonnet': 3.0,
    'anthropic/claude-3-opus': 15.0,
    'google/gemini-flash-1.5': 0.075,
    'google/gemini-pro-1.5': 1.25,
    'meta-llama/llama-3.1-8b-instruct': 0.06,
    'meta-llama/llama-3.1-70b-instruct': 0.8,
    'openai/gpt-4o-mini': 0.15,
    'openai/gpt-4o': 5.0,
  };

  const costPerToken = (costPerMillionTokens[model] || 1.0) / 1000000;
  return tokens * costPerToken;
}

export const POST = withApiKeyAuth(handler);
