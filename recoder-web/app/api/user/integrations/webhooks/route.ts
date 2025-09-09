import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from "zod";
import crypto from 'crypto';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for webhook operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100,
});

// Webhook schema for validation
const webhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url().refine(url => {
    // Validate URL is HTTPS for security
    return url.startsWith('https://') || url.startsWith('http://localhost:');
  }, 'Webhook URL must use HTTPS or be localhost for development'),
  events: z.array(z.enum([
    'project.created',
    'project.updated',
    'project.deleted',
    'deployment.started',
    'deployment.completed',
    'deployment.failed',
    'ai.generation.completed',
    'user.profile.updated',
    'team.member.added',
    'team.member.removed',
    'integration.connected',
    'integration.disconnected',
    'billing.subscription.updated',
    'security.alert.created'
  ])).min(1),
  secret: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  headers: z.record(z.string()).optional(),
  timeout: z.number().min(1000).max(30000).optional().default(10000),
  retries: z.number().min(0).max(5).optional().default(3)
});

const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().refine(url => {
    return url.startsWith('https://') || url.startsWith('http://localhost:');
  }, 'Webhook URL must use HTTPS or be localhost for development').optional(),
  events: z.array(z.enum([
    'project.created',
    'project.updated', 
    'project.deleted',
    'deployment.started',
    'deployment.completed',
    'deployment.failed',
    'ai.generation.completed',
    'user.profile.updated',
    'team.member.added',
    'team.member.removed',
    'integration.connected',
    'integration.disconnected',
    'billing.subscription.updated',
    'security.alert.created'
  ])).min(1).optional(),
  isActive: z.boolean().optional(),
  headers: z.record(z.string()).optional(),
  timeout: z.number().min(1000).max(30000).optional(),
  retries: z.number().min(0).max(5).optional()
});

// GET - Fetch user's webhooks
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'webhook-get');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const webhooks = await prisma.userWebhook.findMany({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        isActive: true,
        lastTriggeredAt: true,
        deliveryCount: true,
        failureCount: true,
        headers: true,
        timeout: true,
        retries: true,
        createdAt: true,
        updatedAt: true,
        // Don't return secret for security
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get delivery statistics for each webhook
    const webhooksWithStats = await Promise.all(webhooks.map(async (webhook) => {
      const deliveryStats = await prisma.webhookDelivery.aggregate({
        where: {
          webhookId: webhook.id,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        },
        _count: {
          id: true
        },
        _avg: {
          responseTime: true
        }
      });

      const successfulDeliveries = await prisma.webhookDelivery.count({
        where: {
          webhookId: webhook.id,
          success: true,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      });

      const totalDeliveries = deliveryStats._count.id || 0;
      const successRate = totalDeliveries > 0 ? (successfulDeliveries / totalDeliveries) * 100 : 100;

      return {
        ...webhook,
        stats: {
          totalDeliveries,
          successfulDeliveries,
          successRate: Math.round(successRate * 100) / 100,
          averageResponseTime: Math.round((deliveryStats._avg.responseTime || 0) * 100) / 100
        }
      };
    }));

    return NextResponse.json({ 
      webhooks: webhooksWithStats,
      totalCount: webhooks.length 
    });
  } catch (error) {
    console.error('Error fetching webhooks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch webhooks' },
      { status: 500 }
    );
  }
}

// POST - Create new webhook
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'webhook-create');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = webhookSchema.parse(body);

    // Check webhook limits per user (free: 5, pro: 20, enterprise: 100)
    const existingWebhooks = await prisma.userWebhook.count({
      where: { userId: session.user.id }
    });

    // Get user subscription for limit checking
    const userSubscription = await prisma.subscription.findUnique({
      where: { userId: session.user.id }
    });

    const plan = userSubscription?.plan || 'free';
    const webhookLimits = {
      free: 5,
      pro: 20,
      enterprise: 100
    };

    if (existingWebhooks >= webhookLimits[plan as keyof typeof webhookLimits]) {
      return NextResponse.json(
        { 
          error: `Webhook limit reached for ${plan} plan (${webhookLimits[plan as keyof typeof webhookLimits]} webhooks)`,
          upgradeRequired: plan === 'free'
        },
        { status: 403 }
      );
    }

    // Generate a secure secret if not provided
    const secret = validatedData.secret || generateWebhookSecret();

    // Test webhook endpoint before creating (ping test)
    const testResult = await testWebhookEndpoint(validatedData.url);
    
    // Create the webhook
    const webhook = await prisma.userWebhook.create({
      data: {
        userId: session.user.id,
        name: validatedData.name,
        url: validatedData.url,
        events: validatedData.events,
        secret: secret,
        isActive: validatedData.isActive,
        headers: validatedData.headers || {},
        timeout: validatedData.timeout || 10000,
        retries: validatedData.retries || 3,
        lastTestAt: testResult.success ? new Date() : null
      },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        isActive: true,
        headers: true,
        timeout: true,
        retries: true,
        createdAt: true,
        // Return secret only on creation
        secret: true,
      },
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'webhook_created',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          webhookId: webhook.id,
          webhookName: webhook.name,
          webhookUrl: webhook.url,
          events: webhook.events,
          testResult
        }
      }
    });

    // Security event
    await prisma.securityEvent.create({
      data: {
        userId: session.user.id,
        eventType: 'webhook_created',
        severity: 'low',
        description: `New webhook "${validatedData.name}" created`,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          webhookId: webhook.id,
          webhookUrl: validatedData.url,
          events: validatedData.events
        }
      }
    });

    return NextResponse.json(
      { 
        webhook, 
        message: 'Webhook created successfully',
        testResult,
        warning: testResult.success ? null : 'Webhook endpoint failed initial test - please verify the URL is correct and accessible'
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating webhook:', error);
    return NextResponse.json(
      { error: 'Failed to create webhook' },
      { status: 500 }
    );
  }
}

// PUT - Update webhook
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession();
    const prisma = getPrisma();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Webhook ID is required' },
        { status: 400 }
      );
    }

    // Validate input data
    const validatedData = updateWebhookSchema.parse(updateData);

    // Verify the webhook belongs to the user
    const existingWebhook = await prisma.userWebhook.findFirst({
      where: {
        id: id,
        userId: session.user.id,
      },
    });

    if (!existingWebhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Update the webhook
    const updatedWebhook = await prisma.userWebhook.update({
      where: { id: id },
      data: {
        ...validatedData,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        isActive: true,
        headers: true,
        timeout: true,
        retries: true,
        updatedAt: true,
      },
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'webhook_updated',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          webhookId: id,
          changes: validatedData,
        }
      }
    });

    return NextResponse.json({
      webhook: updatedWebhook,
      message: 'Webhook updated successfully',
    });
  } catch (error) {
    console.error('Error updating webhook:', error);
    return NextResponse.json(
      { error: 'Failed to update webhook' },
      { status: 500 }
    );
  }
}

// DELETE - Remove webhook
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    const prisma = getPrisma();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const webhookId = searchParams.get('id');

    if (!webhookId) {
      return NextResponse.json(
        { error: 'Webhook ID is required' },
        { status: 400 }
      );
    }

    // Verify the webhook belongs to the user
    const webhook = await prisma.userWebhook.findFirst({
      where: {
        id: webhookId,
        userId: session.user.id,
      },
    });

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Delete associated webhook deliveries first
    await prisma.webhookDelivery.deleteMany({
      where: { webhookId }
    });

    // Delete the webhook
    await prisma.userWebhook.delete({
      where: { id: webhookId },
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'webhook_deleted',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          webhookId: webhookId,
          webhookName: webhook.name,
          webhookUrl: webhook.url,
        }
      }
    });

    // Security event
    await prisma.securityEvent.create({
      data: {
        userId: session.user.id,
        eventType: 'webhook_deleted',
        severity: 'low',
        description: `Webhook "${webhook.name}" was deleted`,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          webhookId: webhookId,
          webhookUrl: webhook.url
        }
      }
    });

    return NextResponse.json({
      message: 'Webhook deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    return NextResponse.json(
      { error: 'Failed to delete webhook' },
      { status: 500 }
    );
  }
}

// Helper function to generate secure webhook secret
function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Helper function to test webhook endpoint
async function testWebhookEndpoint(url: string): Promise<{ success: boolean; responseTime?: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Recoder-Webhook-Test/1.0'
      },
      body: JSON.stringify({
        event: 'webhook.test',
        data: {
          message: 'This is a test ping from Recoder.xyz',
          timestamp: new Date().toISOString()
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - startTime;

    return {
      success: response.ok,
      responseTime,
      error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`
    };

  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      success: false,
      responseTime,
      error: error instanceof Error ? error.message : 'Network error'
    };
  }
}

// Helper function to create HMAC signature for webhook verification
function createWebhookSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
}
