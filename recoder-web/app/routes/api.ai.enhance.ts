/**
 * AI Text Enhancement API
 * POST /api/ai/enhance - Generate enhanced version of user prompt
 *
 * Similar to libra's aiRouter.generateText but adapted for recoder-web
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { streamText } from '~/lib/.server/llm/stream-text';
import { verifySession } from '~/lib/auth/session.server';
import { stripIndents } from '~/utils/stripIndent';

interface EnhanceRequest {
  prompt: string;
  modelId?: string;
  mode?: 'enhance' | 'expand' | 'summarize' | 'clarify';
}

// Enhancement prompts for different modes
const ENHANCEMENT_MODES = {
  enhance: `I want you to improve the user prompt that is wrapped in \`<original_prompt>\` tags.
Make it more specific, detailed, and actionable while preserving the original intent.
IMPORTANT: Only respond with the improved prompt and nothing else!`,

  expand: `I want you to expand the user prompt that is wrapped in \`<original_prompt>\` tags.
Add more context, requirements, and implementation details.
IMPORTANT: Only respond with the expanded prompt and nothing else!`,

  summarize: `I want you to summarize the user prompt that is wrapped in \`<original_prompt>\` tags.
Make it more concise while preserving the key requirements.
IMPORTANT: Only respond with the summarized prompt and nothing else!`,

  clarify: `I want you to clarify the user prompt that is wrapped in \`<original_prompt>\` tags.
Remove ambiguity and make the requirements crystal clear.
IMPORTANT: Only respond with the clarified prompt and nothing else!`,
} as const;

type EnhanceMode = keyof typeof ENHANCEMENT_MODES;

// Rate limiting constants
const ENHANCE_LIMITS = {
  free: { perDay: 10, perHour: 3 },
  pro: { perDay: 100, perHour: 20 },
  premium: { perDay: 500, perHour: 100 },
  enterprise: { perDay: Infinity, perHour: Infinity },
} as const;

// In-memory rate limit tracking (in production, use Redis/KV)
const rateLimitCache = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit for user
 */
function checkRateLimit(userId: string, plan: string): { allowed: boolean; remaining: number; resetAt: number } {
  const limits = ENHANCE_LIMITS[plan as keyof typeof ENHANCE_LIMITS] || ENHANCE_LIMITS.free;
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  const key = `enhance:${userId}:hourly`;
  const current = rateLimitCache.get(key);

  if (!current || current.resetAt < now) {
    // Reset or initialize
    rateLimitCache.set(key, { count: 1, resetAt: now + hourMs });
    return { allowed: true, remaining: limits.perHour - 1, resetAt: now + hourMs };
  }

  if (current.count >= limits.perHour) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count++;
  rateLimitCache.set(key, current);
  return { allowed: true, remaining: limits.perHour - current.count, resetAt: current.resetAt };
}

/**
 * POST /api/ai/enhance - Enhance a prompt
 * Body: { prompt, modelId?, mode? }
 * Returns: Streaming enhanced text
 */
export async function action({ request, context }: ActionFunctionArgs) {
  // Verify authentication
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json() as EnhanceRequest;
    const { prompt, mode = 'enhance' } = body;

    // Validate prompt
    if (!prompt || typeof prompt !== 'string') {
      return json({ success: false, error: 'Prompt is required' }, { status: 400 });
    }

    if (prompt.length < 1) {
      return json({ success: false, error: 'Prompt cannot be empty' }, { status: 400 });
    }

    if (prompt.length > 2000) {
      return json({ success: false, error: 'Prompt cannot exceed 2000 characters' }, { status: 400 });
    }

    // Check rate limit
    const userPlan = session.user.subscriptionPlan || 'free';
    const rateLimit = checkRateLimit(session.user.id, userPlan);

    if (!rateLimit.allowed) {
      return json({
        success: false,
        error: 'Enhancement quota exceeded. Please try again later.',
        code: 'RATE_LIMITED',
        resetAt: new Date(rateLimit.resetAt).toISOString(),
      }, { status: 429 });
    }

    // Validate mode
    const enhanceMode = (mode in ENHANCEMENT_MODES ? mode : 'enhance') as EnhanceMode;
    const systemPrompt = ENHANCEMENT_MODES[enhanceMode];

    console.log(`[AI Enhance] Starting enhancement for user ${session.user.id}`, {
      mode: enhanceMode,
      promptLength: prompt.length,
      remaining: rateLimit.remaining,
    });

    // Build the enhancement request
    const env = (context as any)?.cloudflare?.env || process.env;

    const result = await streamText(
      [
        {
          role: 'user',
          content: stripIndents`
            ${systemPrompt}

            <original_prompt>
              ${prompt}
            </original_prompt>
          `,
        },
      ],
      env,
      { request },
    );

    console.log(`[AI Enhance] Enhancement completed for user ${session.user.id}`);

    // Return streaming response
    return new Response(result.textStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-RateLimit-Remaining': String(rateLimit.remaining),
        'X-RateLimit-Reset': new Date(rateLimit.resetAt).toISOString(),
      },
    });
  } catch (error) {
    console.error('[AI Enhance] Error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Enhancement failed',
    }, { status: 500 });
  }
}

/**
 * GET /api/ai/enhance - Get enhancement status and limits
 */
export async function loader({ request }: { request: Request }) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const userPlan = session.user.subscriptionPlan || 'free';
  const limits = ENHANCE_LIMITS[userPlan as keyof typeof ENHANCE_LIMITS] || ENHANCE_LIMITS.free;

  return json({
    success: true,
    limits: {
      plan: userPlan,
      perDay: limits.perDay,
      perHour: limits.perHour,
    },
    modes: Object.keys(ENHANCEMENT_MODES),
  });
}
