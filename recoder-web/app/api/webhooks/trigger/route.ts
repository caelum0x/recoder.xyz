// Webhook triggering system - sends webhook events to registered endpoints
import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/database';
import crypto from 'crypto';

interface WebhookEvent {
  event: string;
  userId: string;
  data: any;
  timestamp?: string;
  requestId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as WebhookEvent;
    const { event, userId, data, timestamp, requestId } = body;

    if (!event || !userId) {
      return NextResponse.json(
        { error: 'Event type and user ID are required' },
        { status: 400 }
      );
    }

    // Get all active webhooks for this user that listen to this event
    const webhooks = await prisma.userWebhook.findMany({
      where: {
        userId,
        isActive: true,
        events: {
          has: event
        }
      }
    });

    if (webhooks.length === 0) {
      return NextResponse.json({
        message: 'No active webhooks found for this event',
        eventProcessed: false
      });
    }

    // Prepare webhook payload
    const webhookPayload = {
      id: requestId || crypto.randomUUID(),
      event,
      timestamp: timestamp || new Date().toISOString(),
      data,
      user_id: userId
    };

    const payloadString = JSON.stringify(webhookPayload);

    // Trigger all matching webhooks concurrently
    const deliveryPromises = webhooks.map(webhook => 
      deliverWebhook(webhook, payloadString)
    );

    const deliveryResults = await Promise.allSettled(deliveryPromises);

    // Process results
    const successful = deliveryResults.filter(result => 
      result.status === 'fulfilled' && result.value.success
    ).length;

    const failed = deliveryResults.length - successful;

    return NextResponse.json({
      message: 'Webhook event processed',
      eventProcessed: true,
      webhooksTriggered: webhooks.length,
      successful,
      failed,
      deliveries: deliveryResults.map((result, index) => ({
        webhookId: webhooks[index].id,
        success: result.status === 'fulfilled' ? result.value.success : false,
        error: result.status === 'rejected' ? result.reason.message : 
               (result.status === 'fulfilled' && !result.value.success ? result.value.error : null)
      }))
    });

  } catch (error) {
    console.error('Webhook trigger error:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook event' },
      { status: 500 }
    );
  }
}

async function deliverWebhook(webhook: any, payloadString: string): Promise<{
  success: boolean;
  responseTime: number;
  statusCode?: number;
  error?: string;
}> {
  const startTime = Date.now();
  let attempt = 0;
  let lastError = '';

  while (attempt <= (webhook.retries || 3)) {
    try {
      const signature = createWebhookSignature(payloadString, webhook.secret);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), webhook.timeout || 10000);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Recoder-Webhook/1.0',
          'X-Webhook-Signature-256': `sha256=${signature}`,
          'X-Webhook-Event': JSON.parse(payloadString).event,
          'X-Webhook-Delivery': crypto.randomUUID(),
          ...webhook.headers
        },
        body: payloadString,
        signal: controller.signal
      });

      clearTimeout(timeout);
      const responseTime = Date.now() - startTime;

      // Log delivery attempt
      await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          success: response.ok,
          statusCode: response.status,
          responseTime,
          attempt: attempt + 1,
          payload: payloadString,
          response: response.ok ? 'Success' : `HTTP ${response.status}: ${response.statusText}`,
          error: response.ok ? null : `HTTP ${response.status}: ${response.statusText}`
        }
      });

      // Update webhook stats
      await prisma.userWebhook.update({
        where: { id: webhook.id },
        data: {
          lastTriggeredAt: new Date(),
          deliveryCount: { increment: 1 },
          ...(response.ok ? {} : { failureCount: { increment: 1 } })
        }
      });

      if (response.ok) {
        return {
          success: true,
          responseTime,
          statusCode: response.status
        };
      }

      lastError = `HTTP ${response.status}: ${response.statusText}`;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      lastError = error instanceof Error ? error.message : 'Network error';

      // Log failed delivery attempt
      await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          success: false,
          statusCode: 0,
          responseTime,
          attempt: attempt + 1,
          payload: payloadString,
          response: null,
          error: lastError
        }
      });
    }

    attempt++;
    
    // Exponential backoff for retries (1s, 2s, 4s, 8s)
    if (attempt <= (webhook.retries || 3)) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }

  // All attempts failed, update webhook stats
  await prisma.userWebhook.update({
    where: { id: webhook.id },
    data: {
      lastTriggeredAt: new Date(),
      deliveryCount: { increment: 1 },
      failureCount: { increment: 1 }
    }
  });

  return {
    success: false,
    responseTime: Date.now() - startTime,
    error: lastError
  };
}

function createWebhookSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
}

// GET endpoint for webhook system status
export async function GET() {
  try {
    const stats = await prisma.webhookDelivery.aggregate({
      _count: { id: true },
      _avg: { responseTime: true },
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });

    const successfulDeliveries = await prisma.webhookDelivery.count({
      where: {
        success: true,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    });

    const activeWebhooks = await prisma.userWebhook.count({
      where: { isActive: true }
    });

    const totalDeliveries = stats._count.id || 0;
    const successRate = totalDeliveries > 0 ? (successfulDeliveries / totalDeliveries) * 100 : 100;

    return NextResponse.json({
      service: 'Webhook Delivery System',
      status: 'operational',
      stats: {
        activeWebhooks,
        deliveries24h: totalDeliveries,
        successfulDeliveries24h: successfulDeliveries,
        successRate: Math.round(successRate * 100) / 100,
        averageResponseTime: Math.round((stats._avg.responseTime || 0) * 100) / 100
      },
      supportedEvents: [
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
      ]
    });

  } catch (error) {
    console.error('Webhook status error:', error);
    return NextResponse.json(
      { error: 'Failed to get webhook system status' },
      { status: 500 }
    );
  }
}