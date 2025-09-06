import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for alert operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

const alertRuleSchema = z.object({
  name: z.string().min(1).max(100),
  metric: z.string().min(1),
  condition: z.enum(['greater_than', 'less_than', 'equals', 'not_equals']),
  threshold: z.number(),
  frequency: z.enum(['realtime', 'hourly', 'daily']),
  channels: z.array(z.enum(['email', 'webhook', 'slack', 'teams'])),
  enabled: z.boolean(),
});

// GET /api/analytics/alerts - Get user's alert rules
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 60, 'alert-list');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // In production, this would query alert_rules table
    const alertRules = [
      {
        id: 'alert-1',
        name: 'High Error Rate',
        metric: 'error_rate',
        condition: 'greater_than',
        threshold: 5,
        enabled: true,
        frequency: 'realtime',
        channels: ['email', 'webhook'],
        lastTriggered: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        triggerCount: 3,
        severity: 'high',
        description: 'Alert when error rate exceeds 5%',
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'alert-2',
        name: 'Low Success Rate',
        metric: 'success_rate',
        condition: 'less_than',
        threshold: 90,
        enabled: true,
        frequency: 'hourly',
        channels: ['email'],
        lastTriggered: null,
        triggerCount: 0,
        severity: 'medium',
        description: 'Alert when success rate drops below 90%',
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'alert-3',
        name: 'High API Response Time',
        metric: 'response_time',
        condition: 'greater_than',
        threshold: 5000,
        enabled: false,
        frequency: 'realtime',
        channels: ['webhook', 'slack'],
        lastTriggered: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        triggerCount: 1,
        severity: 'low',
        description: 'Alert when API response time exceeds 5 seconds',
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'alert-4',
        name: 'High Daily Cost',
        metric: 'daily_cost',
        condition: 'greater_than',
        threshold: 1000,
        enabled: true,
        frequency: 'daily',
        channels: ['email'],
        lastTriggered: null,
        triggerCount: 0,
        severity: 'medium',
        description: 'Alert when daily AI usage cost exceeds $1000',
        createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      }
    ];

    return NextResponse.json({
      rules: alertRules,
      count: alertRules.length,
      activeAlerts: alertRules.filter(rule => rule.enabled).length
    });

  } catch (error) {
    console.error('Alert rules list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alert rules' },
      { status: 500 }
    );
  }
}

// POST /api/analytics/alerts - Create new alert rule
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'alert-create');
    } catch {
      return NextResponse.json(
        { error: 'Too many alert creation requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate input
    let validatedData;
    try {
      validatedData = alertRuleSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { 
            error: 'Validation failed', 
            details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
          },
          { status: 400 }
        );
      }
      throw error;
    }

    // Create alert rule
    const alertRule = {
      id: `alert-${Date.now()}`,
      name: validatedData.name,
      metric: validatedData.metric,
      condition: validatedData.condition,
      threshold: validatedData.threshold,
      frequency: validatedData.frequency,
      channels: validatedData.channels,
      enabled: validatedData.enabled,
      lastTriggered: null,
      triggerCount: 0,
      severity: determineSeverity(validatedData.metric, validatedData.condition, validatedData.threshold),
      description: `Alert when ${validatedData.metric} ${getConditionText(validatedData.condition)} ${validatedData.threshold}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: session.user.id
    };

    // In production, save to database and set up monitoring
    console.log('Alert rule created:', { ...alertRule, userId: session.user.id });

    // Log alert creation
    await logAlertEvent(session.user.id, 'alert_created', {
      alertId: alertRule.id,
      metric: alertRule.metric,
      threshold: alertRule.threshold,
      enabled: alertRule.enabled,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      rule: alertRule,
      message: 'Alert rule created successfully'
    });

  } catch (error) {
    console.error('Alert creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create alert rule' },
      { status: 500 }
    );
  }
}

// Helper functions
function determineSeverity(metric: string, condition: string, threshold: number): 'low' | 'medium' | 'high' {
  // Determine severity based on metric type and threshold
  const highSeverityMetrics = ['error_rate', 'downtime', 'security_breach'];
  const mediumSeverityMetrics = ['success_rate', 'response_time', 'daily_cost'];
  
  if (highSeverityMetrics.includes(metric)) {
    return 'high';
  } else if (mediumSeverityMetrics.includes(metric)) {
    return 'medium';
  } else {
    return 'low';
  }
}

function getConditionText(condition: string): string {
  switch (condition) {
    case 'greater_than': return 'is greater than';
    case 'less_than': return 'is less than';
    case 'equals': return 'equals';
    case 'not_equals': return 'does not equal';
    default: return condition;
  }
}

async function logAlertEvent(userId: string, event: string, metadata: any): Promise<void> {
  try {
    // In production, this would write to audit log table
    console.log(`Alert Event - User ${userId}: ${event}`, metadata);
  } catch (error) {
    console.error('Failed to log alert event:', error);
  }
}

export const runtime = "edge";