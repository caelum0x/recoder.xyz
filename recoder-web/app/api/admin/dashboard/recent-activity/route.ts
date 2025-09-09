// Admin Dashboard Recent Activity API
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for recent activity
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 50,
});

// GET - Get recent system activity
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'recent-activity');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permissions
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    // Get recent important activities
    const recentActivities = await prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            'user_created',
            'subscription_created',
            'subscription_cancelled',
            'payment_completed',
            'payment_failed',
            'project_created',
            'api_key_created',
            'team_created',
            'export_data',
            'login_failed',
            'password_reset'
          ]
        }
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    // Transform activities into readable format
    const activities = recentActivities.map(activity => ({
      id: activity.id,
      type: getActivityType(activity.action),
      user: activity.user?.name || activity.user?.email || 'System',
      action: formatActivityAction(activity.action, activity.metadata),
      timestamp: activity.createdAt.toISOString(),
      success: activity.success,
      ip: activity.ip,
      platform: activity.platform,
      metadata: activity.metadata
    }));

    // Get activity summary stats
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const activityStats = await prisma.auditLog.groupBy({
      by: ['action'],
      where: {
        createdAt: { gte: last24Hours },
        action: {
          in: [
            'user_created',
            'subscription_created',
            'payment_completed',
            'login',
            'project_created'
          ]
        }
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } }
    });

    const stats = activityStats.map(stat => ({
      action: stat.action,
      count: stat._count.id
    }));

    return NextResponse.json({
      activities,
      stats,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Recent activity error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recent activity' },
      { status: 500 }
    );
  }
}

function getActivityType(action: string): string {
  if (action.includes('user')) return 'user';
  if (action.includes('subscription')) return 'subscription';
  if (action.includes('payment')) return 'payment';
  if (action.includes('project')) return 'project';
  if (action.includes('api')) return 'api';
  if (action.includes('team')) return 'team';
  if (action.includes('export')) return 'export';
  if (action.includes('login') || action.includes('password')) return 'security';
  return 'system';
}

function formatActivityAction(action: string, metadata: any): string {
  const meta = metadata || {};
  
  switch (action) {
    case 'user_created':
      return `New user registered${meta.plan ? ` on ${meta.plan} plan` : ''}`;
    case 'subscription_created':
      return `New subscription created${meta.plan ? ` (${meta.plan})` : ''}${meta.amount ? ` - ${formatCurrency(meta.amount)}` : ''}`;
    case 'subscription_cancelled':
      return `Subscription cancelled${meta.plan ? ` (${meta.plan})` : ''}${meta.reason ? ` - ${meta.reason}` : ''}`;
    case 'payment_completed':
      return `Payment completed${meta.amount ? ` - ${formatCurrency(meta.amount)}` : ''}${meta.plan ? ` (${meta.plan})` : ''}`;
    case 'payment_failed':
      return `Payment failed${meta.amount ? ` - ${formatCurrency(meta.amount)}` : ''}${meta.reason ? ` - ${meta.reason}` : ''}`;
    case 'project_created':
      return `New project created${meta.name ? ` "${meta.name}"` : ''}${meta.type ? ` (${meta.type})` : ''}`;
    case 'api_key_created':
      return `API key created${meta.name ? ` "${meta.name}"` : ''}${meta.permissions ? ` with ${meta.permissions.length} permissions` : ''}`;
    case 'team_created':
      return `Team created${meta.name ? ` "${meta.name}"` : ''}${meta.memberCount ? ` with ${meta.memberCount} members` : ''}`;
    case 'export_data':
      return `Data exported${meta.type ? ` (${meta.type})` : ''}${meta.format ? ` as ${meta.format.toUpperCase()}` : ''}`;
    case 'login_failed':
      return `Failed login attempt${meta.reason ? ` - ${meta.reason}` : ''}${meta.ip ? ` from ${meta.ip}` : ''}`;
    case 'password_reset':
      return `Password reset${meta.method ? ` via ${meta.method}` : ''}`;
    default:
      return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}