import { NextRequest, NextResponse } from 'next/server';
import { withCLIAuth } from '@/lib/middleware/cli-auth-middleware';
import { prisma } from '@/lib/prisma';
import { resolveApiKey, ApiKeyResolverError } from '@/lib/api-key-resolver';

/**
 * POST /api/cli/proxy
 * Proxy AI requests through recoder.xyz using the user's own API key (BYOK beta).
 */
export const POST = withCLIAuth(
  async (request: NextRequest, context) => {
    try {
      const body = await request.json();
      const { model, messages, temperature, maxTokens, stream = false } = body;

      if (!model || !messages) {
        return NextResponse.json(
          { error: 'Missing required fields: model, messages' },
          { status: 400 }
        );
      }

      // Check quota
      const quota = await prisma.user_quota.findUnique({
        where: { userId: context.userId },
      });

      if (quota && context.plan !== 'enterprise') {
        const sessionsRemaining = quota.sessionsPerDay - quota.sessionsUsedToday;
        if (sessionsRemaining <= 0) {
          return NextResponse.json(
            {
              error: 'Quota exceeded',
              message: 'Daily session limit reached',
              quota: {
                used: quota.sessionsUsedToday,
                limit: quota.sessionsPerDay,
              },
            },
            { status: 429 }
          );
        }
      }

      // BYOK: resolve the user's own API key
      let resolved;
      try {
        resolved = await resolveApiKey(context.userId);
      } catch (error) {
        if (error instanceof ApiKeyResolverError) {
          return NextResponse.json(
            {
              error: error.code,
              message: error.message,
            },
            { status: 403 }
          );
        }
        throw error;
      }

      // Make request to OpenRouter
      const startTime = Date.now();
      const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resolved.apiKey}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz',
          'X-Title': 'Recoder CLI',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: temperature || 0.7,
          max_tokens: maxTokens || 4000,
          stream,
        }),
      });

      if (!openRouterResponse.ok) {
        const errorText = await openRouterResponse.text();
        console.error('[CLI Proxy] OpenRouter error:', openRouterResponse.status, errorText);
        throw new Error('AI provider request failed');
      }

      const data = await openRouterResponse.json();
      const duration = Date.now() - startTime;

      // Track usage
      const tokensUsed = data.usage?.total_tokens || 0;

      await prisma.usage_records.create({
        data: {
          id: crypto.randomUUID(),
          userId: context.userId,
          type: 'cli',
          requestType: 'cli',
          model,
          provider: 'openrouter',
          tokensUsed,
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
          cost: data.usage?.total_cost || 0,
          duration,
          success: true,
          platform: 'cli',
          isPriceyModel: ['claude-3-5-sonnet', 'gpt-4', 'claude-opus'].includes(model),
        },
      });

      // Update quota
      if (quota) {
        await prisma.user_quota.update({
          where: { id: quota.id },
          data: {
            sessionsUsedToday: { increment: 1 },
          },
        });
      }

      return NextResponse.json({
        response: data.choices[0].message.content,
        model: data.model,
        usage: data.usage,
        duration,
      });
    } catch (error: any) {
      console.error('[CLI Proxy] Request failed:', error);
      return NextResponse.json(
        { error: 'Proxy request failed' },
        { status: 500 }
      );
    }
  },
);
