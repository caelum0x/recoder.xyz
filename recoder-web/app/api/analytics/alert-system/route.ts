// Alert system API for monitoring analytics metrics and thresholds
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for alert operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100,
});

// Alert configuration schema
const alertSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(['threshold', 'anomaly', 'trend', 'comparison']),
  dataSource: z.enum(['projects', 'usage', 'deployments', 'performance', 'errors']),
  metric: z.object({
    field: z.string(),
    aggregation: z.enum(['count', 'sum', 'avg', 'min', 'max']),
    timeWindow: z.enum(['5m', '15m', '30m', '1h', '6h', '24h', '7d']),
  }),
  conditions: z.array(z.object({
    operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']),
    value: z.number(),
    severity: z.enum(['info', 'warning', 'critical']),
  })),
  filters: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'contains', 'in', 'between']),
    value: z.any(),
  })).optional(),
  notifications: z.object({
    email: z.object({
      enabled: z.boolean().default(true),
      recipients: z.array(z.string().email()).optional(),
      template: z.string().optional(),
    }).optional(),
    webhook: z.object({
      enabled: z.boolean().default(false),
      url: z.string().url().optional(),
      headers: z.record(z.string()).optional(),
    }).optional(),
    inApp: z.object({
      enabled: z.boolean().default(true),
    }).optional(),
  }),
  schedule: z.object({
    enabled: z.boolean().default(true),
    frequency: z.enum(['realtime', '1m', '5m', '15m', '30m', '1h']).default('5m'),
    timezone: z.string().default('UTC'),
    quietHours: z.object({
      enabled: z.boolean().default(false),
      start: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
      end: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    }).optional(),
  }),
  tags: z.array(z.string()).optional(),
});

const alertUpdateSchema = alertSchema.partial().extend({
  id: z.string(),
});

// Helper function to evaluate alert conditions
async function evaluateAlert(alert: any, userId: string) {
  const timeWindow = parseTimeWindow(alert.metric.timeWindow);
  const startTime = new Date(Date.now() - timeWindow);
  const endTime = new Date();

  // Build query based on data source
  let currentValue: number = 0;

  switch (alert.dataSource) {
    case 'projects':
      const projectCount = await prisma.project.count({
        where: {
          userId,
          createdAt: {
            gte: startTime,
            lte: endTime,
          },
        },
      });
      currentValue = projectCount;
      break;

    case 'usage':
      const usageStats = await prisma.usageAnalytics.findMany({
        where: {
          userId,
        },
      });

      switch (alert.metric.aggregation) {
        case 'count':
          currentValue = usageStats.length;
          break;
        case 'sum':
          currentValue = usageStats.reduce((sum, stat) => {
            const value = stat[alert.metric.field as keyof typeof stat] as number;
            return sum + (value || 0);
          }, 0);
          break;
        case 'avg':
          const total = usageStats.reduce((sum, stat) => {
            const value = stat[alert.metric.field as keyof typeof stat] as number;
            return sum + (value || 0);
          }, 0);
          currentValue = usageStats.length > 0 ? total / usageStats.length : 0;
          break;
      }
      break;

    default:
      currentValue = 0;
  }

  // Evaluate conditions
  const triggeredConditions = alert.conditions.filter((condition: any) => {
    switch (condition.operator) {
      case 'gt':
        return currentValue > condition.value;
      case 'gte':
        return currentValue >= condition.value;
      case 'lt':
        return currentValue < condition.value;
      case 'lte':
        return currentValue <= condition.value;
      case 'eq':
        return currentValue === condition.value;
      case 'neq':
        return currentValue !== condition.value;
      default:
        return false;
    }
  });

  return {
    currentValue,
    triggeredConditions,
    isTriggered: triggeredConditions.length > 0,
    evaluatedAt: new Date().toISOString(),
  };
}

// Helper function to parse time window
function parseTimeWindow(timeWindow: string): number {
  const units: { [key: string]: number } = {
    'm': 60 * 1000,
    'h': 60 * 60 * 1000,
    'd': 24 * 60 * 60 * 1000,
  };

  const match = timeWindow.match(/^(\d+)([mhd])$/);
  if (!match) return 5 * 60 * 1000; // Default 5 minutes

  const value = parseInt(match[1]);
  const unit = match[2];
  return value * units[unit];
}

// Helper function to send alert notification
async function sendAlertNotification(alert: any, evaluation: any, userId: string) {
  const notifications: Array<{ type: string; status: string }> = [];

  // In-app notification
  if (alert.notifications.inApp?.enabled) {
    const severity = evaluation.triggeredConditions[0]?.severity || 'info';
    const message = `Alert "${alert.name}" triggered. Current value: ${evaluation.currentValue}`;

    await prisma.notification.create({
      data: {
        userId,
        type: 'alert',
        title: `Alert: ${alert.name}`,
        message,
        category: 'alerts',
        priority: severity === 'critical' ? 'high' : severity === 'warning' ? 'medium' : 'low',
        metadata: {
          alertId: alert.id,
          currentValue: evaluation.currentValue,
          triggeredConditions: evaluation.triggeredConditions,
        },
      },
    });

    notifications.push({ type: 'in-app', status: 'sent' });
  }

  // Email notification (simulated for now)
  if (alert.notifications.email?.enabled) {
    console.log(`Email alert sent for: ${alert.name} to ${alert.notifications.email.recipients || 'user'}`);
    notifications.push({ type: 'email', status: 'sent' });
  }

  // Webhook notification (simulated for now)
  if (alert.notifications.webhook?.enabled && alert.notifications.webhook.url) {
    console.log(`Webhook alert sent for: ${alert.name} to ${alert.notifications.webhook.url}`);
    notifications.push({ type: 'webhook', status: 'sent' });
  }

  return notifications;
}

// GET - Get user's alerts
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'alert-read');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession(authOptions);
    
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user settings with alerts
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: (session?.user as any)?.id },
      select: { preferences: true }
    });

    const preferences = (userSettings?.preferences as any) || {};
    const alerts = preferences.alerts || [];

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // active, paused, triggered
    const severity = searchParams.get('severity'); // info, warning, critical
    const dataSource = searchParams.get('dataSource');

    // Filter alerts
    let filteredAlerts = alerts;

    if (status) {
      filteredAlerts = filteredAlerts.filter((alert: any) => alert.status === status);
    }

    if (severity) {
      filteredAlerts = filteredAlerts.filter((alert: any) => 
        alert.conditions.some((c: any) => c.severity === severity)
      );
    }

    if (dataSource) {
      filteredAlerts = filteredAlerts.filter((alert: any) => alert.dataSource === dataSource);
    }

    // Get alert statistics
    const stats = {
      total: alerts.length,
      isActive: alerts.filter((a: any) => a.status === 'active').length,
      triggered: alerts.filter((a: any) => a.status === 'triggered').length,
      paused: alerts.filter((a: any) => a.status === 'paused').length,
      byDataSource: alerts.reduce((acc: any, alert: any) => {
        acc[alert.dataSource] = (acc[alert.dataSource] || 0) + 1;
        return acc;
      }, {}),
    };

    return NextResponse.json({
      alerts: filteredAlerts,
      stats,
      total: filteredAlerts.length,
    });

  } catch (error) {
    console.error('Get alerts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new alert or evaluate alerts
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 15, 'alert-operation');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession(authOptions);
    
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'create';

    if (action === 'create') {
      return await handleCreateAlert(request, (session?.user as any)?.id);
    } else if (action === 'evaluate') {
      return await handleEvaluateAlerts(request, (session?.user as any)?.id);
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "create" or "evaluate"' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Alert operation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle creating a new alert
async function handleCreateAlert(request: NextRequest, userId: string) {
  const body = await request.json();
  const validatedData = alertSchema.parse(body);

  // Get user settings
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { preferences: true }
  });

  const preferences = (userSettings?.preferences as any) || {};
  const alerts = preferences.alerts || [];

  // Create new alert
  const newAlert = {
    id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: validatedData.name,
    description: validatedData.description,
    type: validatedData.type,
    dataSource: validatedData.dataSource,
    metric: validatedData.metric,
    conditions: validatedData.conditions,
    filters: validatedData.filters,
    notifications: validatedData.notifications,
    schedule: validatedData.schedule,
    tags: validatedData.tags || [],
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastEvaluated: null,
    lastTriggered: null,
    triggerCount: 0,
    createdBy: userId,
  };

  // Add to alerts array
  const updatedAlerts = [...alerts, newAlert];

  // Update preferences
  const updatedPreferences = {
    ...preferences,
    alerts: updatedAlerts
  };

  await prisma.userSettings.upsert({
    where: { userId },
    update: { preferences: updatedPreferences },
    create: {
      userId,
      preferences: updatedPreferences,
    }
  });

  // Log alert creation
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'alert_created',
      resource: 'alert',
      platform: 'web',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      success: true,
      metadata: {
        alertId: newAlert.id,
        alertName: newAlert.name,
        dataSource: newAlert.dataSource,
        conditions: newAlert.conditions.length,
      },
    },
  });

  return NextResponse.json({
    message: 'Alert created successfully',
    alert: newAlert,
  }, { status: 201 });
}

// Handle evaluating all active alerts
async function handleEvaluateAlerts(request: NextRequest, userId: string) {
  // Get user settings with alerts
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { preferences: true }
  });

  const preferences = (userSettings?.preferences as any) || {};
  const alerts = preferences.alerts || [];
  const activeAlerts = alerts.filter((alert: any) => alert.status === 'active');

  const evaluationResults: Array<{
    alertId: any;
    alertName: any;
    evaluation: {
      currentValue?: number;
      triggeredConditions?: any;
      isTriggered?: boolean;
      evaluatedAt: string;
      notifications?: Array<{ type: string; status: string }>;
      error?: string;
    };
  }> = [];

  for (const alert of activeAlerts) {
    try {
      const evaluation = await evaluateAlert(alert, userId);
      
      // Update alert status and timestamps
      alert.lastEvaluated = evaluation.evaluatedAt;
      
      if (evaluation.isTriggered) {
        alert.lastTriggered = evaluation.evaluatedAt;
        alert.triggerCount = (alert.triggerCount || 0) + 1;
        alert.status = 'triggered';

        // Send notifications
        const notifications = await sendAlertNotification(alert, evaluation, userId);
        (evaluation as any).notifications = notifications;
      } else if (alert.status === 'triggered') {
        // Reset status if no longer triggered
        alert.status = 'active';
      }

      evaluationResults.push({
        alertId: alert.id,
        alertName: alert.name,
        evaluation,
      });

    } catch (error) {
      console.error(`Error evaluating alert ${alert.id}:`, error);
      evaluationResults.push({
        alertId: alert.id,
        alertName: alert.name,
        evaluation: {
          error: error instanceof Error ? error.message : 'Unknown error',
          evaluatedAt: new Date().toISOString(),
        },
      });
    }
  }

  // Update preferences with updated alerts
  const updatedPreferences = {
    ...preferences,
    alerts
  };

  await prisma.userSettings.upsert({
    where: { userId },
    update: { preferences: updatedPreferences },
    create: {
      userId,
      preferences: updatedPreferences,
    }
  });

  return NextResponse.json({
    message: 'Alerts evaluated successfully',
    evaluatedCount: activeAlerts.length,
    triggeredCount: evaluationResults.filter(r => r.evaluation.isTriggered).length,
    results: evaluationResults,
    evaluatedAt: new Date().toISOString(),
  });
}

// PUT - Update an alert
export async function PUT(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'alert-update');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession(authOptions);
    
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = alertUpdateSchema.parse(body);

    // Get user settings
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: (session?.user as any)?.id },
      select: { preferences: true }
    });

    const preferences = (userSettings?.preferences as any) || {};
    const alerts = preferences.alerts || [];

    // Find the alert to update
    const alertIndex = alerts.findIndex((a: any) => a.id === validatedData.id);
    
    if (alertIndex === -1) {
      return NextResponse.json(
        { error: 'Alert not found' },
        { status: 404 }
      );
    }

    const existingAlert = alerts[alertIndex];

    // Check ownership
    if (existingAlert.createdBy !== (session?.user as any)?.id) {
      return NextResponse.json(
        { error: 'Unauthorized to update this alert' },
        { status: 403 }
      );
    }

    // Update alert
    const updatedAlert = {
      ...existingAlert,
      ...validatedData,
      updatedAt: new Date().toISOString(),
    };

    alerts[alertIndex] = updatedAlert;

    // Update preferences
    const updatedPreferences = {
      ...preferences,
      alerts
    };

    await prisma.userSettings.upsert({
      where: { userId: (session?.user as any)?.id },
      update: { preferences: updatedPreferences },
      create: {
        userId: (session?.user as any)?.id,
        preferences: updatedPreferences,
        }
    });

    // Log alert update
    await prisma.auditLog.create({
      data: {
        userId: (session?.user as any)?.id,
        action: 'alert_updated',
        resource: 'alert',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          alertId: updatedAlert.id,
          alertName: updatedAlert.name,
          changes: Object.keys(validatedData),
        },
      },
    });

    return NextResponse.json({
      message: 'Alert updated successfully',
      alert: updatedAlert,
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid alert data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Update alert error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete an alert
export async function DELETE(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'alert-delete');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession(authOptions);
    
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const alertId = searchParams.get('id');

    if (!alertId) {
      return NextResponse.json(
        { error: 'Alert ID is required' },
        { status: 400 }
      );
    }

    // Get user settings
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: (session?.user as any)?.id },
      select: { preferences: true }
    });

    const preferences = (userSettings?.preferences as any) || {};
    const alerts = preferences.alerts || [];

    // Find the alert to delete
    const alertIndex = alerts.findIndex((a: any) => a.id === alertId);
    
    if (alertIndex === -1) {
      return NextResponse.json(
        { error: 'Alert not found' },
        { status: 404 }
      );
    }

    const deletedAlert = alerts[alertIndex];

    // Check ownership
    if (deletedAlert.createdBy !== (session?.user as any)?.id) {
      return NextResponse.json(
        { error: 'Unauthorized to delete this alert' },
        { status: 403 }
      );
    }

    // Remove alert
    const updatedAlerts = alerts.filter((a: any) => a.id !== alertId);

    // Update preferences
    const updatedPreferences = {
      ...preferences,
      alerts: updatedAlerts
    };

    await prisma.userSettings.upsert({
      where: { userId: (session?.user as any)?.id },
      update: { preferences: updatedPreferences },
      create: {
        userId: (session?.user as any)?.id,
        preferences: updatedPreferences,
        }
    });

    // Log alert deletion
    await prisma.auditLog.create({
      data: {
        userId: (session?.user as any)?.id,
        action: 'alert_deleted',
        resource: 'alert',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          alertId,
          alertName: deletedAlert.name,
        },
      },
    });

    return NextResponse.json({
      message: 'Alert deleted successfully',
    });

  } catch (error) {
    console.error('Delete alert error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
