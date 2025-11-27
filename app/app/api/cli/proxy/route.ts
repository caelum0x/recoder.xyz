import { NextRequest, NextResponse } from 'next/server';
import { withCLIAuth } from '@/lib/middleware/cli-auth-middleware';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/cli/proxy
 * Proxy AI requests through recoder.xyz for premium users
 * This allows premium users to use platform API keys
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

      // Get platform API key from pool
      const platformKey = await prisma.platform_api_keys.findFirst({
        where: {
          provider: 'openrouter',
          isActive: true,
        },
        orderBy: {
          quotaUsed: 'asc', // Use least-used key
        },
      });

      if (!platformKey) {
        return NextResponse.json(
          {
            error: 'No API keys available',
            message: 'Platform API keys are temporarily unavailable',
          },
          { status: 503 }
        );
      }

      // Decrypt platform key (you'll need to implement decryption)
      const apiKey = platformKey.keyEncrypted; // TODO: decrypt this

      // Make request to OpenRouter
      const startTime = Date.now();
      const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.NEXTAUTH_URL || 'https://recoder.xyz',
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
        const error = await openRouterResponse.text();
        throw new Error(`OpenRouter error: ${error}`);
      }

      const data = await openRouterResponse.json();
      const duration = Date.now() - startTime;

      // Track usage
      const tokensUsed = data.usage?.total_tokens || 0;
      const cost = data.usage?.total_cost || 0;

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
          cost,
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

      // Update platform key usage
      await prisma.platform_api_keys.update({
        where: { id: platformKey.id },
        data: {
          quotaUsed: { increment: tokensUsed },
          lastUsedAt: new Date(),
        },
      });

      return NextResponse.json({
        response: data.choices[0].message.content,
        model: data.model,
        usage: data.usage,
        duration,
      });
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Proxy request failed', message: error.message },
        { status: 500 }
      );
    }
  },
  { requirePremium: true } // Only premium users can use proxy
);
