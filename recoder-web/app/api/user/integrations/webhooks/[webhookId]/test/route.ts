// Webhook testing endpoint - allows users to test their webhooks manually
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import crypto from 'crypto';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for webhook testing
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100,
});

export async function POST(
  request: NextRequest, 
  { params }: { params: { webhookId: string } }
) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 5, 'webhook-test');
    } catch {
      return NextResponse.json(
        { error: 'Too many test requests. Please try again later.' },
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

    const { webhookId } = params;

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

    if (!webhook.isActive) {
      return NextResponse.json(
        { error: 'Webhook is not active' },
        { status: 400 }
      );
    }

    // Create test payload
    const testPayload = {
      id: crypto.randomUUID(),
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook from Recoder.xyz',
        webhook_id: webhookId,
        webhook_name: webhook.name,
        test_data: {
          user_id: session.user.id,
          user_email: session.user.email,
          triggered_at: new Date().toISOString(),
          source: 'manual_test'
        }
      },
      user_id: session.user.id
    };

    const payloadString = JSON.stringify(testPayload);

    // Test the webhook
    const deliveryResult = await deliverTestWebhook(webhook, payloadString);

    // Log the test
    await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        success: deliveryResult.success,
        statusCode: deliveryResult.statusCode || 0,
        responseTime: deliveryResult.responseTime,
        attempt: 1,
        payload: payloadString,
        response: deliveryResult.success ? 'Test successful' : deliveryResult.error || 'Test failed',
        error: deliveryResult.success ? null : deliveryResult.error,
        isTest: true
      }
    });

    // Update webhook test timestamp
    await prisma.userWebhook.update({
      where: { id: webhookId },
      data: {
        lastTestAt: new Date(),
        ...(deliveryResult.success ? {} : { failureCount: { increment: 1 } })
      }
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'webhook_tested',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: deliveryResult.success,
        metadata: {
          webhookId,
          webhookName: webhook.name,
          testResult: deliveryResult
        }
      }
    });

    return NextResponse.json({
      message: deliveryResult.success ? 'Webhook test successful' : 'Webhook test failed',
      success: deliveryResult.success,
      result: {
        statusCode: deliveryResult.statusCode,
        responseTime: deliveryResult.responseTime,
        error: deliveryResult.error,
        payload: testPayload
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Webhook test error:', error);
    return NextResponse.json(
      { error: 'Failed to test webhook' },
      { status: 500 }
    );
  }
}

async function deliverTestWebhook(webhook: any, payloadString: string): Promise<{
  success: boolean;
  responseTime: number;
  statusCode?: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const signature = createWebhookSignature(payloadString, webhook.secret);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), webhook.timeout || 10000);

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Recoder-Webhook-Test/1.0',
        'X-Webhook-Signature-256': `sha256=${signature}`,
        'X-Webhook-Event': 'webhook.test',
        'X-Webhook-Delivery': crypto.randomUUID(),
        'X-Webhook-Test': 'true',
        ...webhook.headers
      },
      body: payloadString,
      signal: controller.signal
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - startTime;

    return {
      success: response.ok,
      responseTime,
      statusCode: response.status,
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

function createWebhookSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
}

// GET endpoint to get webhook test history
export async function GET(
  request: NextRequest, 
  { params }: { params: { webhookId: string } }
) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { webhookId } = params;

    // Verify the webhook belongs to the user
    const webhook = await prisma.userWebhook.findFirst({
      where: {
        id: webhookId,
        userId: session.user.id,
      },
      select: {
        id: true,
        name: true,
        lastTestAt: true
      }
    });

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Get recent test deliveries
    const testDeliveries = await prisma.webhookDelivery.findMany({
      where: {
        webhookId,
        isTest: true
      },
      select: {
        id: true,
        success: true,
        statusCode: true,
        responseTime: true,
        createdAt: true,
        error: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    const testStats = {
      totalTests: testDeliveries.length,
      successfulTests: testDeliveries.filter(d => d.success).length,
      lastTestAt: webhook.lastTestAt?.toISOString(),
      averageResponseTime: testDeliveries.length > 0 
        ? Math.round(testDeliveries.reduce((sum, d) => sum + (d.responseTime || 0), 0) / testDeliveries.length * 100) / 100
        : 0
    };

    return NextResponse.json({
      webhook: {
        id: webhook.id,
        name: webhook.name
      },
      testHistory: testDeliveries.map(delivery => ({
        id: delivery.id,
        success: delivery.success,
        statusCode: delivery.statusCode,
        responseTime: delivery.responseTime,
        error: delivery.error,
        timestamp: delivery.createdAt.toISOString()
      })),
      stats: testStats
    });

  } catch (error) {
    console.error('Webhook test history error:', error);
    return NextResponse.json(
      { error: 'Failed to get webhook test history' },
      { status: 500 }
    );
  }
}