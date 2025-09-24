// Admin Dashboard System Alerts API
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for alerts
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 50,
});

// GET - Get system alerts and health warnings
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'dashboard-alerts');
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

    const alerts = [];
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Check for high failure rate
    const failureRateCheck = await checkFailureRate(last24Hours, now);
    if (failureRateCheck) {
      alerts.push(failureRateCheck);
    }

    // Check for subscription churn spike
    const churnAlert = await checkChurnRate(last7Days, now);
    if (churnAlert) {
      alerts.push(churnAlert);
    }

    // Check for payment failures
    const paymentFailures = await checkPaymentFailures(last24Hours, now);
    if (paymentFailures) {
      alerts.push(paymentFailures);
    }

    // Check for low feature adoption
    const adoptionAlert = await checkFeatureAdoption(last7Days, now);
    if (adoptionAlert) {
      alerts.push(adoptionAlert);
    }

    // Check for security issues
    const securityAlert = await checkSecurityIssues(last24Hours, now);
    if (securityAlert) {
      alerts.push(securityAlert);
    }

    // Check for system performance
    const performanceAlert = await checkSystemPerformance(last24Hours, now);
    if (performanceAlert) {
      alerts.push(performanceAlert);
    }

    // Check for user engagement drops
    const engagementAlert = await checkEngagementDrop(last7Days, now);
    if (engagementAlert) {
      alerts.push(engagementAlert);
    }

    // Sort alerts by severity and timestamp
    const sortedAlerts = alerts.sort((a, b) => {
      const severityOrder: Record<string, number> = { error: 3, warning: 2, info: 1 };
      const severityDiff = (severityOrder[b.type] || 0) - (severityOrder[a.type] || 0);
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return NextResponse.json({
      alerts: sortedAlerts,
      summary: {
        total: sortedAlerts.length,
        errors: sortedAlerts.filter(a => a.type === 'error').length,
        warnings: sortedAlerts.filter(a => a.type === 'warning').length,
        info: sortedAlerts.filter(a => a.type === 'info').length,
        unresolved: sortedAlerts.filter(a => !a.resolved).length
      },
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Dashboard alerts error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch system alerts' },
      { status: 500 }
    );
  }
}

async function checkFailureRate(startDate: Date, endDate: Date) {
  const totalRequests = await prisma.auditLog.count({
    where: {
      createdAt: { gte: startDate, lte: endDate }
    }
  });

  const failedRequests = await prisma.auditLog.count({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      success: false
    }
  });

  const failureRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;

  if (failureRate > 10) {
    return {
      id: `failure-rate-${Date.now()}`,
      type: failureRate > 20 ? 'error' : 'warning' as const,
      title: 'High Failure Rate Detected',
      message: `System failure rate is ${failureRate.toFixed(1)}% (${failedRequests}/${totalRequests} requests failed in last 24h)`,
      timestamp: new Date().toISOString(),
      resolved: false,
      metadata: { failureRate, failedRequests, totalRequests }
    };
  }

  return null;
}

async function checkChurnRate(startDate: Date, endDate: Date) {
  const cancelledSubscriptions = await prisma.subscription.count({
    where: {
      cancelledAt: { gte: startDate, lte: endDate }
    }
  });

  const totalActiveSubscriptions = await prisma.subscription.count({
    where: { status: 'active' }
  });

  const churnRate = totalActiveSubscriptions > 0 
    ? (cancelledSubscriptions / (totalActiveSubscriptions + cancelledSubscriptions)) * 100 
    : 0;

  if (churnRate > 15) {
    return {
      id: `churn-rate-${Date.now()}`,
      type: churnRate > 25 ? 'error' : 'warning' as const,
      title: 'High Churn Rate Alert',
      message: `Subscription churn rate is ${churnRate.toFixed(1)}% (${cancelledSubscriptions} cancellations in last 7 days)`,
      timestamp: new Date().toISOString(),
      resolved: false,
      metadata: { churnRate, cancelledSubscriptions, totalActiveSubscriptions }
    };
  }

  return null;
}

async function checkPaymentFailures(startDate: Date, endDate: Date) {
  const failedPayments = await prisma.payment.count({
    where: {
      status: 'failed',
      createdAt: { gte: startDate, lte: endDate }
    }
  });

  const totalPayments = await prisma.payment.count({
    where: {
      createdAt: { gte: startDate, lte: endDate }
    }
  });

  const failureRate = totalPayments > 0 ? (failedPayments / totalPayments) * 100 : 0;

  if (failedPayments > 10 || failureRate > 5) {
    return {
      id: `payment-failures-${Date.now()}`,
      type: failedPayments > 20 || failureRate > 10 ? 'error' : 'warning' as const,
      title: 'Payment Failures Detected',
      message: `${failedPayments} payment failures in last 24h (${failureRate.toFixed(1)}% failure rate)`,
      timestamp: new Date().toISOString(),
      resolved: false,
      metadata: { failedPayments, totalPayments, failureRate }
    };
  }

  return null;
}

async function checkFeatureAdoption(startDate: Date, endDate: Date) {
  const totalUsers = await prisma.user.count({
    where: {
      lastLoginAt: { gte: startDate, lte: endDate }
    }
  });

  const usersWithActivity = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      userId: { not: '' }
    },
    distinct: ['userId'],
    select: { userId: true }
  });

  const adoptionRate = totalUsers > 0 ? (usersWithActivity.length / totalUsers) * 100 : 0;

  if (adoptionRate < 30 && totalUsers > 10) {
    return {
      id: `low-adoption-${Date.now()}`,
      type: 'warning' as const,
      title: 'Low Feature Adoption',
      message: `Only ${adoptionRate.toFixed(1)}% of active users are using features (${usersWithActivity.length}/${totalUsers})`,
      timestamp: new Date().toISOString(),
      resolved: false,
      metadata: { adoptionRate, isActiveUsers: usersWithActivity.length, totalUsers }
    };
  }

  return null;
}

async function checkSecurityIssues(startDate: Date, endDate: Date) {
  const failedLogins = await prisma.auditLog.count({
    where: {
      action: 'login',
      success: false,
      createdAt: { gte: startDate, lte: endDate }
    }
  });

  const suspiciousIPs = await prisma.auditLog.groupBy({
    by: ['ip'],
    where: {
      success: false,
      createdAt: { gte: startDate, lte: endDate }
    },
    _count: { id: true },
    having: {
      id: { _count: { gt: 10 } }
    }
  });

  if (failedLogins > 50 || suspiciousIPs.length > 0) {
    return {
      id: `security-alert-${Date.now()}`,
      type: failedLogins > 100 || suspiciousIPs.length > 5 ? 'error' : 'warning' as const,
      title: 'Security Alert',
      message: `${failedLogins} failed login attempts detected${suspiciousIPs.length > 0 ? `, ${suspiciousIPs.length} suspicious IPs` : ''}`,
      timestamp: new Date().toISOString(),
      resolved: false,
      metadata: { failedLogins, suspiciousIPs: suspiciousIPs.length }
    };
  }

  return null;
}

async function checkSystemPerformance(startDate: Date, endDate: Date) {
  // Check for slow operations (this is a simplified check)
  const slowOperations = await prisma.auditLog.count({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      metadata: {
        path: ['duration'],
        gt: 5000 // More than 5 seconds
      }
    }
  });

  const totalOperations = await prisma.auditLog.count({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      metadata: {
        path: ['duration'],
        not: undefined
      }
    }
  });

  const slowOperationRate = totalOperations > 0 ? (slowOperations / totalOperations) * 100 : 0;

  if (slowOperationRate > 10 && slowOperations > 10) {
    return {
      id: `performance-alert-${Date.now()}`,
      type: slowOperationRate > 20 ? 'error' : 'warning' as const,
      title: 'Performance Issue',
      message: `${slowOperationRate.toFixed(1)}% of operations are slow (${slowOperations}/${totalOperations})`,
      timestamp: new Date().toISOString(),
      resolved: false,
      metadata: { slowOperations, totalOperations, slowOperationRate }
    };
  }

  return null;
}

async function checkEngagementDrop(startDate: Date, endDate: Date) {
  const currentPeriodUsers = await prisma.user.count({
    where: {
      lastLoginAt: { gte: startDate, lte: endDate }
    }
  });

  const previousPeriodStart = new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime()));
  const previousPeriodUsers = await prisma.user.count({
    where: {
      lastLoginAt: { gte: previousPeriodStart, lt: startDate }
    }
  });

  const engagementChange = previousPeriodUsers > 0 
    ? ((currentPeriodUsers - previousPeriodUsers) / previousPeriodUsers) * 100 
    : 0;

  if (engagementChange < -20 && previousPeriodUsers > 10) {
    return {
      id: `engagement-drop-${Date.now()}`,
      type: engagementChange < -40 ? 'error' : 'warning' as const,
      title: 'User Engagement Drop',
      message: `User engagement dropped by ${Math.abs(engagementChange).toFixed(1)}% (${currentPeriodUsers} vs ${previousPeriodUsers} previous period)`,
      timestamp: new Date().toISOString(),
      resolved: false,
      metadata: { currentPeriodUsers, previousPeriodUsers, engagementChange }
    };
  }

  return null;
}

// POST - Mark alert as resolved
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { alertId, resolved } = await request.json();

    // In a real implementation, you would store alert states in the database
    // For now, we'll just acknowledge the request

    return NextResponse.json({
      success: true,
      alertId,
      resolved,
      resolvedBy: session.user.id,
      resolvedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Alert resolution error:', error);
    return NextResponse.json(
      { error: 'Failed to resolve alert' },
      { status: 500 }
    );
  }
}